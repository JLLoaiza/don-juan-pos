import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { CatalogService } from "./catalog.js";
import { FloorService } from "./floor.js";

const databaseUrl = process.env.DATABASE_URL_TEST;
const describeIntegration = databaseUrl ? describe : describe.skip;

describeIntegration("floor consumption transaction", () => {
  let pool: Pool;
  let catalog: CatalogService;
  let floor: FloorService;
  const companyId = randomUUID(); const branchId = randomUUID(); const userId = randomUUID();
  const actor = { userId, branchId };
  let inventoryId = ""; let productId = ""; let tableId = "";

  beforeAll(async () => {
    pool = new Pool({ connectionString: databaseUrl }); catalog = new CatalogService(pool); floor = new FloorService(pool);
    await pool.query("INSERT INTO companies(id,name,currency,timezone) VALUES($1,$2,'COP','America/Bogota')", [companyId, `Floor ${companyId}`]);
    await pool.query("INSERT INTO branches(id,company_id,name,code) VALUES($1,$2,'Floor',$3)", [branchId, companyId, `F-${companyId}`]);
    await pool.query("INSERT INTO users(id,company_id,username,password_hash,display_name) VALUES($1,$2,$3,crypt('x',gen_salt('bf',4)),'Floor')", [userId, companyId, `floor-${companyId}`]);
    await pool.query("INSERT INTO user_branch_access(user_id,branch_id) VALUES($1,$2)", [userId, branchId]);
    const area = await floor.createDiningArea(actor, randomUUID(), { name: "Salon" });
    const table = await floor.createRestaurantTable(actor, randomUUID(), { diningAreaId: area.id, name: "Mesa A", capacity: 4, status: "AVAILABLE" });
    tableId = table.id;
    const inventory = await catalog.createInventoryItem(actor, randomUUID(), { name: "Beef", unit: "G", initialStock: "10", initialUnitCost: "2", minimumStock: "0", notes: null });
    inventoryId = inventory.id;
    const product = await catalog.createProduct(actor, randomUUID(), { name: "Steak", description: null, salePrice: "20", notes: null, components: [{ type: "INVENTORY_ITEM", inventoryItemId: inventoryId, quantity: "3" }], additionals: [] });
    productId = product.id;
  });

  it("opens one table account and commits snapshots, Kardex, kitchen, print and outbox atomically", async () => {
    const opened = await floor.openAccount(actor, randomUUID(), { tableId, notes: "Birthday", customerId: null });
    expect(opened.status).toBe("OPEN");
    const operationId = randomUUID();
    const result = await floor.confirmConsumption(actor, operationId, opened.id, { expectedVersion: opened.version, items: [{ productId, quantity: "2", selectedAdditionals: [], notes: "Well done" }] });
    const replay = await floor.confirmConsumption(actor, operationId, opened.id, { expectedVersion: opened.version, items: [{ productId, quantity: "2", selectedAdditionals: [], notes: "Well done" }] });
    expect(replay).toEqual(result);
    expect(result).toMatchObject({ account: { status: "OPEN", subtotal: "40.00", total: "40.00", version: 2, items: [{ productId, quantity: "2.000000", unitCost: "6.000000", lineTotal: "40.00", notes: "Well done" }] }, kitchenOrder: { orderType: "ORDER" }, printJob: { documentType: "KITCHEN_ORDER", status: "FAILED" }, warnings: [] });
    const stock = await pool.query("SELECT current_stock FROM inventory_items WHERE id=$1", [inventoryId]);
    expect(stock.rows[0]?.current_stock).toBe("4.000000");
    const movements = await pool.query("SELECT movement_type,quantity,stock_before,stock_after FROM inventory_movements WHERE inventory_item_id=$1 ORDER BY created_at", [inventoryId]);
    expect(movements.rows).toContainEqual({ movement_type: "SALE", quantity: "-6.000000", stock_before: "10.000000", stock_after: "4.000000" });
    const consistency = await pool.query("SELECT (SELECT status FROM restaurant_tables WHERE id=$1) table_status,(SELECT count(*)::int FROM kitchen_orders WHERE account_id=$2) kitchen_orders,(SELECT count(*)::int FROM print_jobs WHERE reference_id=(SELECT id FROM kitchen_orders WHERE account_id=$2)) print_jobs,(SELECT count(*)::int FROM sync_outbox WHERE operation_id=$3) outbox", [tableId, opened.id, operationId]);
    expect(consistency.rows[0]).toEqual({ table_status: "OCCUPIED", kitchen_orders: 1, print_jobs: 1, outbox: 1 });
  });
});
