import { createHash } from "node:crypto";
import type { AdjustInventoryRequest, CatalogSnapshot, InventoryMovement, CreateAccompanimentRequest, CreateInventoryItemRequest, CreateProductRequest, UpdateAccompanimentRequest, UpdateInventoryItemRequest, UpdateProductPriceRequest, UpdateProductRequest } from "@don-juan/contracts";
import { compareDecimals, deriveStockStatus, uuidv7 } from "@don-juan/domain";
import { one, withTransaction } from "@don-juan/database";
import type { Pool, PoolClient } from "pg";

export class CatalogConflict extends Error { constructor(message = "The resource changed; refresh and retry") { super(message); } }
export class CatalogRuleViolation extends Error { constructor(message: string) { super(message); } }
export interface CatalogActor { readonly userId: string; readonly branchId: string; }
type CommandAction<T> = (client: PoolClient, companyId: string) => Promise<T>;
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const decimal = (value: string | number | null) => value === null ? null : String(value);
const stockState = deriveStockStatus;

export class CatalogService {
  constructor(private readonly pool: Pool) {}

  private async command<T>(actor: CatalogActor, operationId: string, commandName: string, request: unknown, action: CommandAction<T>): Promise<T> {
    return withTransaction(this.pool, async (client) => {
      const tenant = await one<{ company_id: string }>(client, `SELECT b.company_id FROM user_branch_access uba JOIN users u ON u.id=uba.user_id JOIN branches b ON b.id=uba.branch_id AND b.company_id=u.company_id WHERE uba.user_id=$1 AND uba.branch_id=$2 AND b.active FOR SHARE`, [actor.userId, actor.branchId]);
      if (!tenant) throw new CatalogRuleViolation("Active branch access is required");
      const requestHash = hash(request);
      const inserted = await client.query<{ id: string }>(`INSERT INTO command_operations(company_id,branch_id,operation_id,command_name,user_id,request_hash) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(company_id,operation_id) DO NOTHING RETURNING id`, [tenant.company_id, actor.branchId, operationId, commandName, actor.userId, requestHash]);
      if (inserted.rowCount === 0) {
        const previous = await one<{ command_name: string; request_hash: string; result: T }>(client, "SELECT command_name,request_hash,result FROM command_operations WHERE company_id=$1 AND operation_id=$2 FOR UPDATE", [tenant.company_id, operationId]);
        if (!previous || previous.command_name !== commandName || previous.request_hash !== requestHash) throw new CatalogConflict("Idempotency key was already used for a different command");
        return previous.result;
      }
      const result = await action(client, tenant.company_id);
      await client.query("UPDATE command_operations SET result=$2,completed_at=NOW() WHERE id=$1", [inserted.rows[0]?.id, result]);
      return result;
    });
  }

  private async audit(client: PoolClient, actor: CatalogActor, companyId: string, action: string, entityType: string, entityId: string, before: unknown, after: unknown): Promise<void> {
    await client.query(`INSERT INTO audit_logs(company_id,branch_id,user_id,action,entity_type,entity_id,before_data,after_data) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`, [companyId, actor.branchId, actor.userId, action, entityType, entityId, before, after]);
  }

  async createInventoryItem(actor: CatalogActor, operationId: string, input: CreateInventoryItemRequest) {
    return this.command(actor, operationId, "inventory.create", input, async (client, companyId) => {
      const id = uuidv7();
      const row = await one<{ id:string; name:string; unit:string; unit_cost:string; current_stock:string; minimum_stock:string; notes:string|null; active:boolean; version:number }>(client,
        `INSERT INTO inventory_items(id,branch_id,name,unit,unit_cost,current_stock,minimum_stock,notes) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id,name,unit,unit_cost,current_stock,minimum_stock,notes,active,version`, [id,actor.branchId,input.name,input.unit,input.initialUnitCost,input.initialStock,input.minimumStock,input.notes ?? null]);
      if (!row) throw new Error("Inventory insert did not return a row");
      if (input.initialStock !== "0") await client.query(`INSERT INTO inventory_movements(id,branch_id,inventory_item_id,movement_type,quantity,unit_cost,stock_before,stock_after,source_type,source_id,reason,created_by_user_id) VALUES($1,$2,$3,'CORRECTION',$4,$5,0,$4,'CATALOG_SETUP',$3,'Initial inventory setup',$6)`, [uuidv7(),actor.branchId,id,input.initialStock,input.initialUnitCost,actor.userId]);
      const result = this.inventoryResult(row, true); await this.audit(client,actor,companyId,"inventory_item.created","inventory_item",id,null,result); return result;
    });
  }

  async updateInventoryItem(actor: CatalogActor, operationId: string, id: string, input: UpdateInventoryItemRequest) {
    return this.command(actor,operationId,"inventory.update",{id,...input},async(client,companyId) => {
      const before = await one<{ id:string; version:number }>(client,"SELECT id,version FROM inventory_items WHERE id=$1 AND branch_id=$2 FOR UPDATE",[id,actor.branchId]);
      if (!before) throw new CatalogRuleViolation("Inventory item was not found in the active branch"); if(Number(before.version) !== input.expectedVersion) throw new CatalogConflict();
      const row=await one<any>(client,"UPDATE inventory_items SET name=$3,minimum_stock=$4,notes=$5,active=$6 WHERE id=$1 AND branch_id=$2 RETURNING id,name,unit,unit_cost,current_stock,minimum_stock,notes,active,version",[id,actor.branchId,input.name,input.minimumStock,input.notes??null,input.active]);
      const result=this.inventoryResult(row,true); await this.audit(client,actor,companyId,"inventory_item.updated","inventory_item",id,before,result); return result;
    });
  }

  async adjustInventory(actor: CatalogActor, operationId: string, id: string, input: AdjustInventoryRequest) {
    return this.command(actor,operationId,"inventory.adjust",{id,...input},async(client,companyId) => {
      const before=await one<{id:string;version:number;current_stock:string;unit_cost:string;active:boolean}>(client,"SELECT id,version,current_stock,unit_cost,active FROM inventory_items WHERE id=$1 AND branch_id=$2 FOR UPDATE",[id,actor.branchId]);
      if(!before || !before.active) throw new CatalogRuleViolation("Active inventory item was not found in the branch"); if(Number(before.version)!==input.expectedVersion) throw new CatalogConflict();
      const after=await one<{current_stock:string;version:number}>(client,"UPDATE inventory_items SET current_stock=current_stock+$3 WHERE id=$1 AND branch_id=$2 RETURNING current_stock,version",[id,actor.branchId,input.quantityDelta]);
      if(!after) throw new Error("Inventory adjustment failed");
      await client.query(`INSERT INTO inventory_movements(id,branch_id,inventory_item_id,movement_type,quantity,unit_cost,stock_before,stock_after,source_type,source_id,reason,created_by_user_id) VALUES($1,$2,$3,'MANUAL_ADJUSTMENT',$4,$5,$6,$7,'INVENTORY_ADJUSTMENT',$8,$9,$10)`,[uuidv7(),actor.branchId,id,input.quantityDelta,before.unit_cost,before.current_stock,after.current_stock,operationId,input.reason,actor.userId]);
      const result={ id, previousStock:before.current_stock,currentStock:after.current_stock,stockState:stockState(after.current_stock,"0"),version:Number(after.version) }; await this.audit(client,actor,companyId,"inventory_item.adjusted","inventory_item",id,{currentStock:before.current_stock},result); return result;
    });
  }

  async createAccompaniment(actor: CatalogActor, operationId: string, input: CreateAccompanimentRequest) { return this.saveAccompaniment(actor,operationId,uuidv7(),input,true); }
  async updateAccompaniment(actor: CatalogActor, operationId: string, id: string, input: UpdateAccompanimentRequest) { return this.saveAccompaniment(actor,operationId,id,input,false); }
  private async saveAccompaniment(actor: CatalogActor, operationId: string, id: string, input: CreateAccompanimentRequest | UpdateAccompanimentRequest, creating: boolean) {
    return this.command(actor,operationId,creating?"accompaniments.create":"accompaniments.update",{id,...input},async(client,companyId)=>{
      if(!creating){const locked=await one<{version:number}>(client,"SELECT version FROM accompaniments WHERE id=$1 AND branch_id=$2 FOR UPDATE",[id,actor.branchId]); if(!locked) throw new CatalogRuleViolation("Accompaniment was not found in the active branch"); if(Number(locked.version)!==(input as UpdateAccompanimentRequest).expectedVersion) throw new CatalogConflict();}
      const itemIds=input.components.map(component=>component.inventoryItemId); const valid=await client.query<{id:string}>("SELECT id FROM inventory_items WHERE branch_id=$1 AND active AND id=ANY($2::uuid[]) FOR SHARE",[actor.branchId,itemIds]); if(valid.rowCount!==itemIds.length) throw new CatalogRuleViolation("Every accompaniment component must be an active inventory item from this branch");
      if(creating) await client.query("INSERT INTO accompaniments(id,branch_id,name,default_price,notes) VALUES($1,$2,$3,$4,$5)",[id,actor.branchId,input.name,input.defaultPrice,input.notes??null]);
      else { const active=(input as UpdateAccompanimentRequest).active; await client.query("UPDATE accompaniments SET name=$3,default_price=$4,notes=$5,active=$6 WHERE id=$1 AND branch_id=$2",[id,actor.branchId,input.name,input.defaultPrice,input.notes??null,active]); await client.query("DELETE FROM accompaniment_components WHERE accompaniment_id=$1",[id]); }
      for(const component of input.components) await client.query("INSERT INTO accompaniment_components(id,accompaniment_id,inventory_item_id,quantity) VALUES($1,$2,$3,$4)",[uuidv7(),id,component.inventoryItemId,component.quantity]);
      await this.recalculateProductsForAccompaniments(client,[id]);
      const result=await this.accompaniment(client,id,true); await this.audit(client,actor,companyId,creating?"accompaniment.created":"accompaniment.updated","accompaniment",id,null,result); return result;
    });
  }

  async createProduct(actor: CatalogActor, operationId: string, input: CreateProductRequest) { return this.saveProduct(actor,operationId,uuidv7(),input,true); }
  async updateProduct(actor: CatalogActor, operationId: string, id: string, input: UpdateProductRequest) { return this.saveProduct(actor,operationId,id,input,false); }
  private async saveProduct(actor: CatalogActor, operationId: string, id: string, input: CreateProductRequest | UpdateProductRequest, creating: boolean) {
    return this.command(actor,operationId,creating?"products.create":"products.update",{id,...input},async(client,companyId)=>{
      if(!creating){const locked=await one<{version:number}>(client,"SELECT version FROM products WHERE id=$1 AND branch_id=$2 FOR UPDATE",[id,actor.branchId]);if(!locked)throw new CatalogRuleViolation("Product was not found in the active branch");if(Number(locked.version)!==(input as UpdateProductRequest).expectedVersion)throw new CatalogConflict();}
      await this.validateProductReferences(client,actor.branchId,input);
      if(creating) await client.query("INSERT INTO products(id,branch_id,name,description,sale_price,notes) VALUES($1,$2,$3,$4,$5,$6)",[id,actor.branchId,input.name,input.description??null,input.salePrice,input.notes??null]);
      else { const active=(input as UpdateProductRequest).active; await client.query("UPDATE products SET name=$3,description=$4,sale_price=$5,notes=$6,active=$7 WHERE id=$1 AND branch_id=$2",[id,actor.branchId,input.name,input.description??null,input.salePrice,input.notes??null,active]); await client.query("DELETE FROM product_components WHERE product_id=$1",[id]); await client.query("DELETE FROM product_additional_accompaniments WHERE product_id=$1",[id]); }
      for(const component of input.components) await client.query(component.type==="INVENTORY_ITEM"?"INSERT INTO product_components(id,product_id,component_type,inventory_item_id,quantity) VALUES($1,$2,'INVENTORY_ITEM',$3,$4)":"INSERT INTO product_components(id,product_id,component_type,accompaniment_id,quantity) VALUES($1,$2,'ACCOMPANIMENT',$3,$4)",component.type==="INVENTORY_ITEM"?[uuidv7(),id,component.inventoryItemId,component.quantity]:[uuidv7(),id,component.accompanimentId,component.quantity]);
      for(const additional of input.additionals) await client.query("INSERT INTO product_additional_accompaniments(id,product_id,accompaniment_id,price_override,allow_free,sort_order,active) VALUES($1,$2,$3,$4,$5,$6,$7)",[uuidv7(),id,additional.accompanimentId,additional.priceOverride??null,additional.allowFree,additional.sortOrder,additional.active]);
      await this.recalculateProducts(client,[id]); const result=await this.product(client,id,true); await this.audit(client,actor,companyId,creating?"product.created":"product.updated","product",id,null,result); return result;
    });
  }

  async updateProductPrice(actor: CatalogActor, operationId:string,id:string,input:UpdateProductPriceRequest){return this.command(actor,operationId,"products.price",{id,...input},async(client,companyId)=>{const row=await one<{version:number;calculated_cost:string}>(client,"SELECT version,calculated_cost FROM products WHERE id=$1 AND branch_id=$2 FOR UPDATE",[id,actor.branchId]);if(!row)throw new CatalogRuleViolation("Product was not found in the active branch");if(Number(row.version)!==input.expectedVersion)throw new CatalogConflict();if(input.targetMarginPercent!==undefined&&compareDecimals(input.targetMarginPercent,"100")>=0)throw new CatalogRuleViolation("Target margin must be less than 100 percent");const result=await one<any>(client,"UPDATE products SET sale_price=CASE WHEN $3::numeric IS NOT NULL THEN $3::numeric WHEN $4::numeric IS NOT NULL THEN calculated_cost+$4::numeric ELSE calculated_cost/(1-($5::numeric/100)) END WHERE id=$1 AND branch_id=$2 RETURNING id,name,description,sale_price,calculated_cost,active,version",[id,actor.branchId,input.salePrice??null,input.targetProfit??null,input.targetMarginPercent??null]);if(!result)throw new Error("Pricing update failed");const product=await this.product(client,id,true);await this.audit(client,actor,companyId,"product.price_updated","product",id,null,product);return product;});}

  async snapshot(actor: CatalogActor, includeCosts: boolean): Promise<CatalogSnapshot> { const client=await this.pool.connect(); try { const inventory=(await client.query<any>("SELECT id,name,unit,unit_cost,current_stock,minimum_stock,notes,active,version FROM inventory_items WHERE branch_id=$1 ORDER BY name",[actor.branchId])).rows.map((row)=>this.inventoryResult(row,includeCosts)); const accompaniments=[] as any[]; for(const row of (await client.query<{id:string}>("SELECT id FROM accompaniments WHERE branch_id=$1 ORDER BY name",[actor.branchId])).rows) accompaniments.push(await this.accompaniment(client,row.id,includeCosts)); const products=[] as any[]; for(const row of (await client.query<{id:string}>("SELECT id FROM products WHERE branch_id=$1 ORDER BY name",[actor.branchId])).rows) products.push(await this.product(client,row.id,includeCosts)); return {inventoryItems:inventory,accompaniments,products}; } finally {client.release();} }

  async movements(actor: CatalogActor, includeCosts: boolean): Promise<InventoryMovement[]> { const rows=(await this.pool.query<any>("SELECT id,inventory_item_id,movement_type,quantity,unit_cost,stock_before,stock_after,reason,created_at FROM inventory_movements WHERE branch_id=$1 ORDER BY created_at DESC,id DESC",[actor.branchId])).rows; return rows.map(row=>({id:row.id,inventoryItemId:row.inventory_item_id,movementType:row.movement_type,quantity:String(row.quantity),unitCost:includeCosts?String(row.unit_cost):null,stockBefore:String(row.stock_before),stockAfter:String(row.stock_after),reason:row.reason,createdAt:new Date(row.created_at).toISOString()})); }

  private inventoryResult(row:any, includeCosts:boolean){return {id:row.id,name:row.name,unit:row.unit,unitCost:includeCosts?decimal(row.unit_cost):null,currentStock:String(row.current_stock),minimumStock:String(row.minimum_stock),stockState:stockState(String(row.current_stock),String(row.minimum_stock)),notes:row.notes,active:row.active,version:Number(row.version)};}
  private async accompaniment(client:PoolClient,id:string,includeCosts:boolean){const row=await one<any>(client,"SELECT id,name,default_price,notes,active,version FROM accompaniments WHERE id=$1",[id]);if(!row)throw new Error("Accompaniment missing");const components=(await client.query<any>("SELECT inventory_item_id,quantity FROM accompaniment_components WHERE accompaniment_id=$1 ORDER BY id",[id])).rows.map(x=>({inventoryItemId:x.inventory_item_id,quantity:decimal(x.quantity)}));const cost=await one<{cost:string}>(client,"SELECT COALESCE(SUM(ac.quantity*i.unit_cost),0)::numeric(14,6)::text cost FROM accompaniment_components ac JOIN inventory_items i ON i.id=ac.inventory_item_id WHERE ac.accompaniment_id=$1",[id]);return {id:row.id,name:row.name,defaultPrice:decimal(row.default_price),notes:row.notes,active:row.active,version:Number(row.version),components,calculatedCost:includeCosts?decimal(cost?.cost??"0"):null};}
  private async product(client:PoolClient,id:string,includeCosts:boolean){const row=await one<any>(client,"SELECT id,name,description,sale_price,calculated_cost,active,version FROM products WHERE id=$1",[id]);if(!row)throw new Error("Product missing");const components=(await client.query<any>("SELECT component_type,inventory_item_id,accompaniment_id,quantity FROM product_components WHERE product_id=$1 ORDER BY id",[id])).rows.map(x=>x.component_type==="INVENTORY_ITEM"?{type:"INVENTORY_ITEM",inventoryItemId:x.inventory_item_id,quantity:decimal(x.quantity)}:{type:"ACCOMPANIMENT",accompanimentId:x.accompaniment_id,quantity:decimal(x.quantity)});const additionals=(await client.query<any>("SELECT accompaniment_id,price_override,allow_free,sort_order,active FROM product_additional_accompaniments WHERE product_id=$1 ORDER BY sort_order,id",[id])).rows.map(x=>({accompanimentId:x.accompaniment_id,priceOverride:decimal(x.price_override),allowFree:x.allow_free,sortOrder:x.sort_order,active:x.active}));return {id:row.id,name:row.name,description:row.description,salePrice:decimal(row.sale_price),calculatedCost:includeCosts?decimal(row.calculated_cost):null,active:row.active,version:Number(row.version),components,additionals};}
  private async validateProductReferences(client:PoolClient,branchId:string,input:CreateProductRequest|UpdateProductRequest){for(const component of input.components){const id=component.type==="INVENTORY_ITEM"?component.inventoryItemId:component.accompanimentId;const table=component.type==="INVENTORY_ITEM"?"inventory_items":"accompaniments";const valid=await one(client,`SELECT 1 FROM ${table} WHERE id=$1 AND branch_id=$2 AND active FOR SHARE`,[id,branchId]);if(!valid)throw new CatalogRuleViolation("Product references must be active and belong to the active branch");}for(const additional of input.additionals){const valid=await one(client,"SELECT 1 FROM accompaniments WHERE id=$1 AND branch_id=$2 AND active FOR SHARE",[additional.accompanimentId,branchId]);if(!valid)throw new CatalogRuleViolation("Product additional must be active and belong to the active branch");}}
  private async recalculateProductsForAccompaniments(client:PoolClient,ids:string[]){const products=(await client.query<{product_id:string}>("SELECT DISTINCT product_id FROM product_components WHERE component_type='ACCOMPANIMENT' AND accompaniment_id=ANY($1::uuid[])",[ids])).rows.map(row=>row.product_id);await this.recalculateProducts(client,products);}
  private async recalculateProducts(client:PoolClient,ids:string[]){for(const id of ids){await client.query(`UPDATE products p SET calculated_cost=COALESCE((SELECT SUM(CASE WHEN pc.component_type='INVENTORY_ITEM' THEN pc.quantity*i.unit_cost ELSE pc.quantity*COALESCE((SELECT SUM(ac.quantity*ai.unit_cost) FROM accompaniment_components ac JOIN inventory_items ai ON ai.id=ac.inventory_item_id WHERE ac.accompaniment_id=pc.accompaniment_id),0) END) FROM product_components pc LEFT JOIN inventory_items i ON i.id=pc.inventory_item_id WHERE pc.product_id=p.id),0) WHERE p.id=$1`,[id]);}}
}







