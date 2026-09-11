import { createHash } from "node:crypto";
import type { AccountSnapshot, ConfirmConsumptionRequest, ConfirmConsumptionResponse, FloorSnapshot, OpenAccountRequest } from "@don-juan/contracts";
import { addDecimals, compareDecimals, divideDecimals, multiplyDecimals, uuidv7 } from "@don-juan/domain";
import { one, withTransaction } from "@don-juan/database";
import type { Pool, PoolClient } from "pg";
import { CatalogConflict, CatalogRuleViolation, type CatalogActor } from "./catalog.js";
import { recalculateAccountTotals } from "./billing-totals.js";

type CommandAction<T> = (client: PoolClient, companyId: string) => Promise<T>;
type Ingredient = { inventoryItemId: string; quantity: string };
type ProductRow = { id: string; name: string; sale_price: string; calculated_cost: string; tax_rate: string | null };
type InventoryRow = { id: string; name: string; unit: "G" | "KG" | "ML" | "L" | "UNIT"; current_stock: string; unit_cost: string };
export interface FloorActor extends CatalogActor {}

const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const decimal = (value: unknown) => String(value);
const asDate = (value: Date | string) => new Date(value).toISOString();

/**
 * Handles restaurant-floor commands. Every write below is intentionally in a
 * single database transaction: a confirmed sale is never separated from its
 * immutable inventory movements, kitchen ticket, print job, audit and outbox.
 */
export class FloorService {
  constructor(private readonly pool: Pool) {}

  private async command<T>(actor: FloorActor, operationId: string, commandName: string, request: unknown, action: CommandAction<T>): Promise<T> {
    return withTransaction(this.pool, async (client) => {
      const tenant = await one<{ company_id: string }>(client, `SELECT b.company_id
        FROM user_branch_access uba JOIN users u ON u.id=uba.user_id
        JOIN branches b ON b.id=uba.branch_id AND b.company_id=u.company_id
        WHERE uba.user_id=$1 AND uba.branch_id=$2 AND b.active FOR SHARE`, [actor.userId, actor.branchId]);
      if (!tenant) throw new CatalogRuleViolation("Active branch access is required");
      const requestHash = hash(request);
      const inserted = await client.query<{ id: string }>(`INSERT INTO command_operations(company_id,branch_id,operation_id,command_name,user_id,request_hash)
        VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(company_id,operation_id) DO NOTHING RETURNING id`, [tenant.company_id, actor.branchId, operationId, commandName, actor.userId, requestHash]);
      if (inserted.rowCount === 0) {
        const previous = await one<{ command_name: string; request_hash: string; result: T }>(client,
          "SELECT command_name,request_hash,result FROM command_operations WHERE company_id=$1 AND operation_id=$2 FOR UPDATE", [tenant.company_id, operationId]);
        if (!previous || previous.command_name !== commandName || previous.request_hash !== requestHash) throw new CatalogConflict("Idempotency key was already used for a different command");
        return previous.result;
      }
      const result = await action(client, tenant.company_id);
      await client.query("UPDATE command_operations SET result=$2,completed_at=NOW() WHERE id=$1", [inserted.rows[0]?.id, result]);
      return result;
    });
  }

  private async audit(client: PoolClient, actor: FloorActor, companyId: string, action: string, entityType: string, entityId: string, before: unknown, after: unknown) {
    await client.query(`INSERT INTO audit_logs(company_id,branch_id,user_id,action,entity_type,entity_id,before_data,after_data)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8)`, [companyId, actor.branchId, actor.userId, action, entityType, entityId, before, after]);
  }

  async createDiningArea(actor: FloorActor, operationId: string, input: { name: string }) {
    return this.command(actor, operationId, "dining_areas.create", input, async (client, companyId) => {
      const id = uuidv7();
      const area = await one<any>(client, "INSERT INTO dining_areas(id,branch_id,name) VALUES($1,$2,$3) RETURNING id,name,active", [id, actor.branchId, input.name]);
      if (!area) throw new Error("Dining area insert did not return a row");
      const result = { id: area.id, name: area.name, active: area.active };
      await this.audit(client, actor, companyId, "dining_area.created", "dining_area", id, null, result);
      await this.outbox(client, actor, operationId, "dining_areas.create", "dining_area", id, result);
      return result;
    });
  }

  async createRestaurantTable(actor: FloorActor, operationId: string, input: { diningAreaId: string; name: string; capacity: number; status: "AVAILABLE" | "OCCUPIED" | "RESERVED" }) {
    return this.command(actor, operationId, "tables.create", input, async (client, companyId) => {
      const area = await one<{ id: string }>(client, "SELECT id FROM dining_areas WHERE id=$1 AND branch_id=$2 AND active FOR SHARE", [input.diningAreaId, actor.branchId]);
      if (!area) throw new CatalogRuleViolation("Active dining area was not found in the current branch");
      if (input.status === "OCCUPIED") throw new CatalogRuleViolation("A table cannot be occupied before an account is opened");
      const id = uuidv7();
      const table = await one<any>(client, "INSERT INTO restaurant_tables(id,dining_area_id,name,capacity,status) VALUES($1,$2,$3,$4,$5) RETURNING id,dining_area_id,name,capacity,status,active", [id, area.id, input.name, input.capacity, input.status]);
      if (!table) throw new Error("Restaurant table insert did not return a row");
      const result = { id: table.id, diningAreaId: table.dining_area_id, name: table.name, capacity: Number(table.capacity), status: table.status, active: table.active, openAccountId: null };
      await this.audit(client, actor, companyId, "restaurant_table.created", "restaurant_table", id, null, result);
      await this.outbox(client, actor, operationId, "tables.create", "restaurant_table", id, result);
      return result;
    });
  }
  async floor(actor: FloorActor): Promise<FloorSnapshot> {
    const areas = (await this.pool.query<any>("SELECT id,name,active FROM dining_areas WHERE branch_id=$1 AND active ORDER BY name", [actor.branchId])).rows;
    const tables = (await this.pool.query<any>(`SELECT t.id,t.dining_area_id,t.name,t.capacity,t.status,t.active,a.id open_account_id
      FROM restaurant_tables t JOIN dining_areas d ON d.id=t.dining_area_id
      LEFT JOIN accounts a ON a.table_id=t.id AND a.status='OPEN'
      WHERE d.branch_id=$1 AND d.active AND t.active ORDER BY d.name,t.name`, [actor.branchId])).rows;
    return { diningAreas: areas.map((row) => ({ id: row.id, name: row.name, active: row.active })), tables: tables.map((row) => ({ id: row.id, diningAreaId: row.dining_area_id, name: row.name, capacity: Number(row.capacity), status: row.status, active: row.active, openAccountId: row.open_account_id })) };
  }

  async account(actor: FloorActor, accountId: string, includeCosts = false): Promise<AccountSnapshot> {
    const client = await this.pool.connect();
    try { return this.accountSnapshot(client, accountId, actor.branchId, includeCosts); } finally { client.release(); }
  }

  async openAccount(actor: FloorActor, operationId: string, input: OpenAccountRequest): Promise<AccountSnapshot> {
    return this.command(actor, operationId, "accounts.open", input, async (client, companyId) => {
      const table = await one<{ id: string; status: string; active: boolean }>(client, `SELECT t.id,t.status,t.active FROM restaurant_tables t
        JOIN dining_areas d ON d.id=t.dining_area_id WHERE t.id=$1 AND d.branch_id=$2 FOR UPDATE`, [input.tableId, actor.branchId]);
      if (!table || !table.active) throw new CatalogRuleViolation("Active table was not found in the current branch");
      if (table.status === "OCCUPIED") throw new CatalogConflict("The table already has an open account");
      if (table.status !== "AVAILABLE" && table.status !== "RESERVED") throw new CatalogRuleViolation("The table cannot receive an account");
      const existing = await one<{ id: string }>(client, "SELECT id FROM accounts WHERE table_id=$1 AND status='OPEN' FOR UPDATE", [table.id]);
      if (existing) throw new CatalogConflict("The table already has an open account");
      if (input.customerId) {
        const customer = await one(client, "SELECT 1 FROM customers WHERE id=$1 AND branch_id=$2 FOR SHARE", [input.customerId, actor.branchId]);
        if (!customer) throw new CatalogRuleViolation("Customer was not found in the current branch");
      }
      const accountId = uuidv7();
      await client.query(`INSERT INTO accounts(id,branch_id,table_id,customer_id,opened_by_user_id,notes) VALUES($1,$2,$3,$4,$5,$6)`, [accountId, actor.branchId, table.id, input.customerId ?? null, actor.userId, input.notes ?? null]);
      const result = await this.accountSnapshot(client, accountId, actor.branchId);
      await this.audit(client, actor, companyId, "account.opened", "account", accountId, { tableStatus: table.status }, result);
      await this.outbox(client, actor, operationId, "accounts.open", "account", accountId, result);
      return result;
    });
  }

  async confirmConsumption(actor: FloorActor, operationId: string, accountId: string, input: ConfirmConsumptionRequest, includeCosts = false): Promise<ConfirmConsumptionResponse> {
    const result = await this.command(actor, operationId, "accounts.confirm_consumption", { accountId, ...input }, async (client, companyId) => {
      const account = await one<any>(client, "SELECT * FROM accounts WHERE id=$1 AND branch_id=$2 FOR UPDATE", [accountId, actor.branchId]);
      if (!account) throw new CatalogRuleViolation("Account was not found in the current branch");
      if (account.status !== "OPEN") throw new CatalogRuleViolation("Only an open account can receive consumption");
      if (Number(account.version) !== input.expectedVersion) throw new CatalogConflict();
      const paymentStarted = await one(client, "SELECT id FROM payments WHERE account_id=$1 AND status='REGISTERED' LIMIT 1 FOR SHARE", [accountId]);
      if (paymentStarted) throw new CatalogRuleViolation("Consumption cannot change after the first payment");

      const resolved = [] as Array<{ input: ConfirmConsumptionRequest["items"][number]; product: ProductRow; ingredients: Ingredient[]; additionals: Array<{ id:string; name:string; unitPrice:string; noCharge:boolean }>; }>;
      const inventoryAmounts = new Map<string, string>();
      for (const item of input.items) {
        const product = await one<ProductRow>(client, `SELECT p.id,p.name,p.sale_price,p.calculated_cost,COALESCE(t.rate,0)::text tax_rate
          FROM products p LEFT JOIN tax_rates t ON t.id=p.tax_rate_id AND t.branch_id=p.branch_id AND t.active
          WHERE p.id=$1 AND p.branch_id=$2 AND p.active FOR SHARE OF p`, [item.productId, actor.branchId]);
        if (!product) throw new CatalogRuleViolation("Every consumed product must be active in the current branch");
        if (new Set(item.selectedAdditionals.map((additional) => additional.accompanimentId)).size !== item.selectedAdditionals.length) throw new CatalogRuleViolation("An accompaniment can only be selected once per product item");
        const base = await this.recipeIngredients(client, product.id, item.quantity);
        const additionals: Array<{ id:string; name:string; unitPrice:string; noCharge:boolean }> = [];
        for (const selected of item.selectedAdditionals) {
          const additional = await one<any>(client, `SELECT a.id,a.name,a.default_price,paa.price_override,paa.allow_free
            FROM product_additional_accompaniments paa JOIN accompaniments a ON a.id=paa.accompaniment_id
            WHERE paa.product_id=$1 AND paa.accompaniment_id=$2 AND paa.active AND a.active FOR SHARE`, [product.id, selected.accompanimentId]);
          if (!additional) throw new CatalogRuleViolation("Selected accompaniment is not active or is not configured for this product");
          if (selected.noCharge && !additional.allow_free) throw new CatalogRuleViolation("This accompaniment cannot be given free of charge");
          additionals.push({ id: additional.id, name: additional.name, unitPrice: selected.noCharge ? "0" : decimal(additional.price_override ?? additional.default_price), noCharge: selected.noCharge });
          base.push(...await this.accompanimentIngredients(client, additional.id, item.quantity));
        }
        for (const ingredient of base) inventoryAmounts.set(ingredient.inventoryItemId, addDecimals(inventoryAmounts.get(ingredient.inventoryItemId) ?? "0", ingredient.quantity));
        resolved.push({ input: item, product, ingredients: base, additionals });
      }
      const inventoryIds = [...inventoryAmounts.keys()].sort();
      const inventories = inventoryIds.length ? (await client.query<InventoryRow>(`SELECT id,name,unit,current_stock,unit_cost FROM inventory_items
        WHERE branch_id=$1 AND active AND id=ANY($2::uuid[]) ORDER BY id FOR UPDATE`, [actor.branchId, inventoryIds])).rows : [];
      if (inventories.length !== inventoryIds.length) throw new CatalogRuleViolation("A recipe references inactive or foreign inventory");
      const inventoryById = new Map(inventories.map((row) => [row.id, row]));
      const createdItems: any[] = [];
      for (const entry of resolved) {
        const itemId = uuidv7();
        const ingredientSnapshot = entry.ingredients.map((ingredient) => {
          const inventory = inventoryById.get(ingredient.inventoryItemId); if (!inventory) throw new Error("Locked inventory item missing");
          return { inventoryItemId: inventory.id, inventoryItemName: inventory.name, unit: inventory.unit, quantity: ingredient.quantity, unitCost: decimal(inventory.unit_cost) };
        });
        const totalCost = ingredientSnapshot.reduce((sum, ingredient) => addDecimals(sum, multiplyDecimals(ingredient.quantity, ingredient.unitCost)), "0");
        const unitCost = divideDecimals(totalCost, entry.input.quantity, 6);
        const additionalTotal = entry.additionals.reduce((sum, additional) => addDecimals(sum, multiplyDecimals(additional.unitPrice, entry.input.quantity)), "0");
        const lineSubtotal = addDecimals(multiplyDecimals(decimal(entry.product.sale_price), entry.input.quantity), additionalTotal);
        const taxTotal = divideDecimals(multiplyDecimals(lineSubtotal, decimal(entry.product.tax_rate ?? "0")), "100", 2);
        const lineTotal = addDecimals(lineSubtotal, taxTotal);
        const consumptionSnapshot = { ingredients: ingredientSnapshot, totalCost, productQuantity: entry.input.quantity };
        const item = await one<any>(client, `INSERT INTO account_items(id,account_id,product_id,added_by_user_id,product_name_snapshot,unit_price,unit_cost,quantity,discount_total,tax_rate_snapshot,tax_total,line_subtotal,line_total,notes,consumption_snapshot)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,0,$9,$10,$11,$12,$13,$14) RETURNING *`, [itemId, accountId, entry.product.id, actor.userId, entry.product.name, entry.product.sale_price, unitCost, entry.input.quantity, entry.product.tax_rate ?? "0", taxTotal, lineSubtotal, lineTotal, entry.input.notes ?? null, consumptionSnapshot]);
        if (!item) throw new Error("Account item insert did not return a row");
        for (const additional of entry.additionals) await client.query(`INSERT INTO account_item_accompaniments(id,account_item_id,accompaniment_id,name_snapshot,quantity,unit_price,included,no_charge,total)
          VALUES($1,$2,$3,$4,$5,$6,FALSE,$7,$8)`, [uuidv7(), itemId, additional.id, additional.name, entry.input.quantity, additional.unitPrice, additional.noCharge, multiplyDecimals(additional.unitPrice, entry.input.quantity)]);
        createdItems.push(item);
      }
      const warnings: ConfirmConsumptionResponse["warnings"] = [];
      for (const inventory of inventories) {
        const consumed = inventoryAmounts.get(inventory.id) ?? "0";
        const after = subtractStock(inventory.current_stock, consumed);
        await client.query("UPDATE inventory_items SET current_stock=$2 WHERE id=$1", [inventory.id, after]);
        await client.query(`INSERT INTO inventory_movements(id,branch_id,inventory_item_id,movement_type,quantity,unit_cost,stock_before,stock_after,source_type,source_id,account_item_id,reason,created_by_user_id)
          VALUES($1,$2,$3,'SALE',$4,$5,$6,$7,'ACCOUNT_CONSUMPTION',$8,NULL,'Confirmed account consumption',$9)`, [uuidv7(), actor.branchId, inventory.id, `-${consumed}`, inventory.unit_cost, inventory.current_stock, after, accountId, actor.userId]);
        if (compareDecimals(after, "0") < 0) warnings.push({ type: "NEGATIVE_STOCK", inventoryItemId: inventory.id, inventoryItemName: inventory.name, currentStock: after, unit: inventory.unit });
      }
      await recalculateAccountTotals(client,accountId);
      const ticketNumber = uuidv7();
      const kitchenContent = { accountId, tableId: account.table_id, items: createdItems.map((item) => ({ id: item.id, productName: item.product_name_snapshot, quantity: decimal(item.quantity), notes: item.notes })) };
      const kitchenOrder = await one<any>(client, `INSERT INTO kitchen_orders(id,branch_id,account_id,ticket_number,content,created_by_user_id)
        VALUES($1,$2,$3,$4,$5,$6) RETURNING *`, [uuidv7(), actor.branchId, accountId, ticketNumber, kitchenContent, actor.userId]);
      if (!kitchenOrder) throw new Error("Kitchen order insert did not return a row");
      const printer = await one<{ id:string }>(client, "SELECT id FROM printers WHERE branch_id=$1 AND printer_type='KITCHEN' AND active ORDER BY name LIMIT 1 FOR SHARE", [actor.branchId]);
      const print = await one<any>(client, `INSERT INTO print_jobs(id,branch_id,printer_type,printer_id,document_type,reference_type,reference_id,payload,status,error_message)
        VALUES($1,$2,'KITCHEN',$3,'KITCHEN_ORDER','KITCHEN_ORDER',$4,$5,$6,$7) RETURNING *`, [uuidv7(), actor.branchId, printer?.id ?? null, kitchenOrder.id, kitchenContent, printer ? "PENDING" : "FAILED", printer ? null : "No active kitchen printer is configured"]);
      if (!print) throw new Error("Print job insert did not return a row");
      if (account.table_id) await client.query("UPDATE restaurant_tables SET status='OCCUPIED' WHERE id=$1", [account.table_id]);
      const accountResult = await this.accountSnapshot(client, accountId, actor.branchId, true);
      const result: ConfirmConsumptionResponse = { account: accountResult, kitchenOrder: { id: kitchenOrder.id, ticketNumber: kitchenOrder.ticket_number, orderType: kitchenOrder.order_type, content: kitchenOrder.content, createdAt: asDate(kitchenOrder.created_at) }, printJob: { id: print.id, printerId: print.printer_id, documentType: print.document_type, status: print.status, attempts: Number(print.attempts), createdAt: asDate(print.created_at) }, warnings };
      await this.audit(client, actor, companyId, "account.consumption_confirmed", "account", accountId, { version: Number(account.version) }, { itemIds: createdItems.map((item) => item.id), result });
      await this.outbox(client, actor, operationId, "accounts.confirm_consumption", "account", accountId, result);
      return result;
    });
    return includeCosts ? result : redactConsumptionCosts(result);
  }

  private async recipeIngredients(client: PoolClient, productId: string, multiplier: string): Promise<Ingredient[]> {
    const components = (await client.query<any>("SELECT component_type,inventory_item_id,accompaniment_id,quantity FROM product_components WHERE product_id=$1 ORDER BY id FOR SHARE", [productId])).rows;
    const result: Ingredient[] = [];
    for (const component of components) {
      if (component.component_type === "INVENTORY_ITEM") result.push({ inventoryItemId: component.inventory_item_id, quantity: multiplyDecimals(decimal(component.quantity), multiplier) });
      else result.push(...await this.accompanimentIngredients(client, component.accompaniment_id, multiplyDecimals(decimal(component.quantity), multiplier)));
    }
    return result;
  }

  private async accompanimentIngredients(client: PoolClient, accompanimentId: string, multiplier: string): Promise<Ingredient[]> {
    const components = (await client.query<any>("SELECT inventory_item_id,quantity FROM accompaniment_components WHERE accompaniment_id=$1 ORDER BY id FOR SHARE", [accompanimentId])).rows;
    return components.map((component) => ({ inventoryItemId: component.inventory_item_id, quantity: multiplyDecimals(decimal(component.quantity), multiplier) }));
  }

  private async accountSnapshot(client: PoolClient, accountId: string, branchId: string, includeCosts = false): Promise<AccountSnapshot> {
    const account = await one<any>(client, "SELECT * FROM accounts WHERE id=$1 AND branch_id=$2", [accountId, branchId]);
    if (!account) throw new CatalogRuleViolation("Account was not found in the current branch");
    const items = (await client.query<any>("SELECT * FROM account_items WHERE account_id=$1 ORDER BY created_at,id", [accountId])).rows;
    const resultItems = [] as any[];
    for (const item of items) {
      const additionals = (await client.query<any>("SELECT * FROM account_item_accompaniments WHERE account_item_id=$1 ORDER BY created_at,id", [item.id])).rows;
      resultItems.push({ id:item.id,productId:item.product_id,productName:item.product_name_snapshot,quantity:decimal(item.quantity),unitSalePrice:decimal(item.unit_price),unitCost:includeCosts ? decimal(item.unit_cost) : null,discountTotal:decimal(item.discount_total),taxRate:decimal(item.tax_rate_snapshot),lineSubtotal:decimal(item.line_subtotal),lineTotal:decimal(item.line_total),notes:item.notes,status:item.status,additionals:additionals.map((a)=>({accompanimentId:a.accompaniment_id,name:a.name_snapshot,quantity:decimal(a.quantity),unitPrice:decimal(a.unit_price),noCharge:a.no_charge,included:a.included,total:decimal(a.total)})),consumptionSnapshot:includeCosts ? item.consumption_snapshot : redactSnapshotCosts(item.consumption_snapshot),createdAt:asDate(item.created_at) });
    }
    return { id:account.id,tableId:account.table_id,customerId:account.customer_id,openedByUserId:account.opened_by_user_id,status:account.status,openedAt:asDate(account.opened_at),closedAt:account.closed_at ? asDate(account.closed_at) : null,subtotal:decimal(account.subtotal),discountTotal:decimal(account.discount_total),servicePercentage:decimal(account.service_percentage),serviceTotal:decimal(account.service_total),taxTotal:decimal(account.tax_total),total:decimal(account.total),notes:account.notes,version:Number(account.version),items:resultItems };
  }

  private async outbox(client: PoolClient, actor: FloorActor, operationId: string, commandName: string, aggregateType: string, aggregateId: string, payload: unknown) {
    await client.query(`INSERT INTO sync_outbox(branch_id,operation_id,command_name,aggregate_type,aggregate_id,payload)
      VALUES($1,$2,$3,$4,$5,$6)`, [actor.branchId, operationId, commandName, aggregateType, aggregateId, payload]);
  }
}

function subtractStock(stock: string, consumed: string): string {
  return addDecimals(stock, `-${consumed}`);
}

function redactSnapshotCosts(snapshot: unknown): Record<string, unknown> {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) return {};
  const value = snapshot as Record<string, unknown>;
  const { totalCost: _totalCost, ingredients, ...safe } = value;
  return {
    ...safe,
    ...(Array.isArray(ingredients) ? { ingredients: ingredients.map((ingredient) => {
      if (!ingredient || typeof ingredient !== "object" || Array.isArray(ingredient)) return ingredient;
      const { unitCost: _unitCost, ...safeIngredient } = ingredient as Record<string, unknown>;
      return safeIngredient;
    }) } : {}),
  };
}

function redactConsumptionCosts(result: ConfirmConsumptionResponse): ConfirmConsumptionResponse {
  return {
    ...result,
    account: {
      ...result.account,
      items: result.account.items.map((item) => ({ ...item, unitCost: null, consumptionSnapshot: redactSnapshotCosts(item.consumptionSnapshot) })),
    },
  };
}
