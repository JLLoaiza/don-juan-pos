import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { CatalogConflict, CatalogRuleViolation, CatalogService } from "./catalog.js";

const databaseUrl = process.env.DATABASE_URL_TEST;
const describeIntegration = databaseUrl ? describe : describe.skip;

describeIntegration("catalog and inventory transactions", () => {
  let pool: Pool;
  let service: CatalogService;
  const companyId = randomUUID(); const branchId = randomUUID(); const otherBranchId = randomUUID(); const userId = randomUUID();
  const actor = { userId, branchId };
  let inventoryId = ""; let inventoryVersion = 0;

  beforeAll(async () => {
    pool = new Pool({ connectionString: databaseUrl }); service = new CatalogService(pool);
    await pool.query("INSERT INTO companies(id,name,currency,timezone) VALUES($1,$2,'COP','America/Bogota')", [companyId, `Catalog test ${companyId}`]);
    await pool.query("INSERT INTO branches(id,company_id,name,code) VALUES($1,$2,'Catalog',$3),($4,$2,'Other',$5)", [branchId, companyId, `C-${companyId}`, otherBranchId, `O-${companyId}`]);
    await pool.query("INSERT INTO users(id,company_id,username,password_hash,display_name) VALUES($1,$2,$3,crypt('x',gen_salt('bf',4)),'Catalog test')", [userId, companyId, `catalog-${companyId}`]);
    await pool.query("INSERT INTO user_branch_access(user_id,branch_id) VALUES($1,$2)", [userId, branchId]);
  });

  it("writes initial stock and adjustment through immutable Kardex and idempotency", async () => {
    const operationId = randomUUID();
    const created = await service.createInventoryItem(actor, operationId, { name: "Beef", unit: "G", initialStock: "10", initialUnitCost: "2.5", minimumStock: "3", notes: null });
    const replay = await service.createInventoryItem(actor, operationId, { name: "Beef", unit: "G", initialStock: "10", initialUnitCost: "2.5", minimumStock: "3", notes: null });
    inventoryId = created.id; inventoryVersion = created.version;
    expect(replay.id).toBe(created.id);
    const initialMoves = await pool.query("SELECT quantity,stock_before,stock_after FROM inventory_movements WHERE inventory_item_id=$1", [created.id]);
    expect(initialMoves.rows).toEqual([{ quantity: "10.000000", stock_before: "0.000000", stock_after: "10.000000" }]);
    const adjusted = await service.adjustInventory(actor, randomUUID(), created.id, { expectedVersion: created.version, quantityDelta: "-11", reason: "Physical count" });
    inventoryVersion = adjusted.version;
    expect(adjusted).toMatchObject({ previousStock: "10.000000", currentStock: "-1.000000", stockState: "NEGATIVE_STOCK" });
    await expect(pool.query("UPDATE inventory_movements SET reason='forbidden' WHERE inventory_item_id=$1", [created.id])).rejects.toThrow(/immutable/i);
  });

  it("recalculates one-level recipe cost synchronously while preserving sale price", async () => {
    const accompaniment = await service.createAccompaniment(actor, randomUUID(), { name: "Sauce", defaultPrice: "1", notes: null, components: [{ inventoryItemId: inventoryId, quantity: "2" }] });
    const product = await service.createProduct(actor, randomUUID(), { name: "Steak", description: null, salePrice: "20", notes: null, components: [{ type: "INVENTORY_ITEM", inventoryItemId: inventoryId, quantity: "3" }, { type: "ACCOMPANIMENT", accompanimentId: accompaniment.id, quantity: "1" }], additionals: [] });
    expect(product).toMatchObject({ calculatedCost: "12.500000", salePrice: "20.00" });
    const revised = await service.updateAccompaniment(actor, randomUUID(), accompaniment.id, { expectedVersion: accompaniment.version, name: "Sauce", defaultPrice: "1", notes: null, active: true, components: [{ inventoryItemId: inventoryId, quantity: "3" }] });
    expect(revised.calculatedCost).toBe("7.500000");
    const snapshot = await service.snapshot(actor, true);
    expect(snapshot.products.find((entry) => entry.id === product.id)).toMatchObject({ calculatedCost: "15.000000", salePrice: "20.00" });
  });

  it("rejects cross-branch components and concurrent stale inventory changes", async () => {
    const other = await pool.query<{ id: string }>("INSERT INTO inventory_items(id,branch_id,name,unit) VALUES($1,$2,'Other branch item','UNIT') RETURNING id", [randomUUID(), otherBranchId]);
    await expect(service.createAccompaniment(actor, randomUUID(), { name: "Invalid", defaultPrice: "0", notes: null, components: [{ inventoryItemId: other.rows[0]!.id, quantity: "1" }] })).rejects.toBeInstanceOf(CatalogRuleViolation);
    const attempts = await Promise.allSettled([
      service.adjustInventory(actor, randomUUID(), inventoryId, { expectedVersion: inventoryVersion, quantityDelta: "1", reason: "A" }),
      service.adjustInventory(actor, randomUUID(), inventoryId, { expectedVersion: inventoryVersion, quantityDelta: "1", reason: "B" }),
    ]);
    expect(attempts.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(attempts.filter((result) => result.status === "rejected")[0]?.status === "rejected" && (attempts.filter((result) => result.status === "rejected")[0] as PromiseRejectedResult).reason).toBeInstanceOf(CatalogConflict);
  });
});


