import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { FloorService } from "./floor.js";

const databaseUrl = process.env.DATABASE_URL_TEST;
const describeIntegration = databaseUrl ? describe : describe.skip;

describeIntegration("manual restaurant table status", () => {
  let pool: Pool;
  let floor: FloorService;
  const companyId = randomUUID(); const branchId = randomUUID(); const userId = randomUUID();
  const actor = { userId, branchId };
  let areaId = "";

  const createTable = async (name: string, status: "AVAILABLE" | "RESERVED" = "AVAILABLE") =>
    floor.createRestaurantTable(actor, randomUUID(), { diningAreaId: areaId, name, capacity: 4, status });

  beforeAll(async () => {
    pool = new Pool({ connectionString: databaseUrl }); floor = new FloorService(pool);
    await pool.query("INSERT INTO companies(id,name,currency,timezone) VALUES($1,$2,'COP','America/Bogota')", [companyId, `Table status ${companyId}`]);
    await pool.query("INSERT INTO branches(id,company_id,name,code) VALUES($1,$2,'Status',$3)", [branchId, companyId, `S-${companyId}`]);
    await pool.query("INSERT INTO users(id,company_id,username,password_hash,display_name) VALUES($1,$2,$3,crypt('x',gen_salt('bf',4)),'Status')", [userId, companyId, `status-${companyId}`]);
    await pool.query("INSERT INTO user_branch_access(user_id,branch_id) VALUES($1,$2)", [userId, branchId]);
    areaId = (await floor.createDiningArea(actor, randomUUID(), { name: "Salon" })).id;
  });

  it("changes AVAILABLE ↔ OCCUPIED without commercial side effects and records an atomic audit/outbox/change", async () => {
    const table = await createTable("Manual");
    const before = await pool.query(`SELECT
      (SELECT count(*)::int FROM accounts WHERE branch_id=$1) accounts,
      (SELECT count(*)::int FROM account_items ai JOIN accounts a ON a.id=ai.account_id WHERE a.branch_id=$1) items,
      (SELECT count(*)::int FROM kitchen_orders WHERE branch_id=$1) kitchen,
      (SELECT count(*)::int FROM print_jobs WHERE branch_id=$1) print_jobs,
      (SELECT count(*)::int FROM inventory_movements WHERE branch_id=$1) inventory,
      (SELECT count(*)::int FROM payments p JOIN accounts a ON a.id=p.account_id WHERE a.branch_id=$1) payments,
      (SELECT count(*)::int FROM cash_movements) cash`, [branchId]);
    const operationId = randomUUID();
    const occupied = await floor.changeTableStatus(actor, operationId, table.id, { targetStatus: "OCCUPIED", expectedVersion: table.version });
    expect(occupied).toMatchObject({ status: "OCCUPIED", version: 2, openAccountId: null, canMarkAvailable: true, availabilityBlocker: null });
    const after = await pool.query(`SELECT
      (SELECT count(*)::int FROM accounts WHERE branch_id=$1) accounts,
      (SELECT count(*)::int FROM account_items ai JOIN accounts a ON a.id=ai.account_id WHERE a.branch_id=$1) items,
      (SELECT count(*)::int FROM kitchen_orders WHERE branch_id=$1) kitchen,
      (SELECT count(*)::int FROM print_jobs WHERE branch_id=$1) print_jobs,
      (SELECT count(*)::int FROM inventory_movements WHERE branch_id=$1) inventory,
      (SELECT count(*)::int FROM payments p JOIN accounts a ON a.id=p.account_id WHERE a.branch_id=$1) payments,
      (SELECT count(*)::int FROM cash_movements) cash,
      (SELECT count(*)::int FROM audit_logs WHERE entity_id=$2 AND action='restaurant_table.status_changed') audit,
      (SELECT count(*)::int FROM sync_outbox WHERE operation_id=$3) outbox,
      (SELECT count(*)::int FROM sync_changes WHERE operation_id=$3) changes`, [branchId, table.id, operationId]);
    expect(after.rows[0]).toMatchObject({ ...before.rows[0], audit: 1, outbox: 1, changes: 1 });
    const released = await floor.changeTableStatus(actor, randomUUID(), table.id, { targetStatus: "AVAILABLE", expectedVersion: occupied.version });
    expect(released).toMatchObject({ status: "AVAILABLE", version: 3, canMarkAvailable: false });
  });

  it("does not write a duplicate audit or outbox for a no-op and replays idempotently", async () => {
    const table = await createTable("No-op");
    const operationId = randomUUID();
    const occupied = await floor.changeTableStatus(actor, operationId, table.id, { targetStatus: "OCCUPIED", expectedVersion: table.version });
    const counts = await pool.query("SELECT (SELECT count(*)::int FROM audit_logs WHERE entity_id=$1) audit,(SELECT count(*)::int FROM sync_outbox WHERE aggregate_id=$1) outbox", [table.id]);
    const noOp = await floor.changeTableStatus(actor, randomUUID(), table.id, { targetStatus: "OCCUPIED", expectedVersion: occupied.version });
    const replay = await floor.changeTableStatus(actor, operationId, table.id, { targetStatus: "OCCUPIED", expectedVersion: table.version });
    const after = await pool.query("SELECT (SELECT count(*)::int FROM audit_logs WHERE entity_id=$1) audit,(SELECT count(*)::int FROM sync_outbox WHERE aggregate_id=$1) outbox", [table.id]);
    expect(noOp).toEqual(occupied); expect(replay).toEqual(occupied); expect(after.rows[0]).toEqual(counts.rows[0]);
  });

  it("blocks AVAILABLE for both empty and consumed OPEN accounts while historical PAID and VOID accounts do not block", async () => {
    const empty = await createTable("Empty account");
    const account = await floor.openAccount(actor, randomUUID(), { tableId: empty.id, customerId: null, notes: null });
    const read = (await floor.floor(actor)).tables.find((table) => table.id === empty.id)!;
    expect(read).toMatchObject({ status: "OCCUPIED", openAccountId: account.id, canMarkAvailable: false, availabilityBlocker: "OPEN_ACCOUNT_OR_ACTIVE_ORDERS" });
    await expect(floor.changeTableStatus(actor, randomUUID(), empty.id, { targetStatus: "AVAILABLE", expectedVersion: read.version })).rejects.toThrow("open account");
    const historical = await createTable("Historical");
    const occupied = await floor.changeTableStatus(actor, randomUUID(), historical.id, { targetStatus: "OCCUPIED", expectedVersion: historical.version });
    for (const status of ["PAID", "VOID"] as const) await pool.query("INSERT INTO accounts(id,branch_id,table_id,opened_by_user_id,status,closed_at) VALUES($1,$2,$3,$4,$5,NOW())", [randomUUID(), branchId, historical.id, userId, status]);
    await expect(floor.changeTableStatus(actor, randomUUID(), historical.id, { targetStatus: "AVAILABLE", expectedVersion: occupied.version })).resolves.toMatchObject({ status: "AVAILABLE" });
  });

  it("rejects stale versions, cross-branch tables, and preserves the one-OPEN-account invariant under concurrent opens", async () => {
    const table = await createTable("Concurrency");
    const occupied = await floor.changeTableStatus(actor, randomUUID(), table.id, { targetStatus: "OCCUPIED", expectedVersion: table.version });
    await expect(floor.changeTableStatus(actor, randomUUID(), table.id, { targetStatus: "AVAILABLE", expectedVersion: table.version })).rejects.toThrow("status changed");
    const opens = await Promise.allSettled([
      floor.openAccount(actor, randomUUID(), { tableId: table.id, customerId: null, notes: null }),
      floor.openAccount(actor, randomUUID(), { tableId: table.id, customerId: null, notes: null }),
    ]);
    expect(opens.filter((entry) => entry.status === "fulfilled")).toHaveLength(1);
    expect((await pool.query("SELECT count(*)::int count FROM accounts WHERE table_id=$1 AND status='OPEN'", [table.id])).rows[0]?.count).toBe(1);
    expect((await pool.query("SELECT status FROM restaurant_tables WHERE id=$1", [table.id])).rows[0]?.status).toBe("OCCUPIED");
    const foreignBranch = randomUUID(); const foreignArea = randomUUID(); const foreignTable = randomUUID();
    await pool.query("INSERT INTO branches(id,company_id,name,code) VALUES($1,$2,'Foreign',$3)", [foreignBranch, companyId, `F-${companyId}`]);
    await pool.query("INSERT INTO dining_areas(id,branch_id,name) VALUES($1,$2,'Foreign')", [foreignArea, foreignBranch]);
    await pool.query("INSERT INTO restaurant_tables(id,dining_area_id,name,capacity) VALUES($1,$2,'Foreign',4)", [foreignTable, foreignArea]);
    await expect(floor.changeTableStatus(actor, randomUUID(), foreignTable, { targetStatus: "OCCUPIED", expectedVersion: 1 })).rejects.toThrow("current branch");
    expect(occupied.status).toBe("OCCUPIED");
  });

  it("rolls back the table update, audit, outbox, change feed and command record when durable publication fails", async () => {
    const table = await createTable("Rollback");
    const service = floor as unknown as { outbox: (...args: unknown[]) => Promise<void> };
    const originalOutbox = service.outbox;
    service.outbox = async () => { throw new Error("simulated outbox failure"); };
    const operationId = randomUUID();
    try {
      await expect(floor.changeTableStatus(actor, operationId, table.id, { targetStatus: "OCCUPIED", expectedVersion: table.version })).rejects.toThrow("simulated outbox failure");
    } finally {
      service.outbox = originalOutbox;
    }
    const state = await pool.query(`SELECT
      (SELECT status FROM restaurant_tables WHERE id=$1) status,
      (SELECT version::text FROM restaurant_tables WHERE id=$1) version,
      (SELECT count(*)::int FROM audit_logs WHERE entity_id=$1 AND action='restaurant_table.status_changed') audit,
      (SELECT count(*)::int FROM sync_outbox WHERE aggregate_id=$1) outbox,
      (SELECT count(*)::int FROM sync_changes WHERE entity_id=$1) changes,
      (SELECT count(*)::int FROM command_operations WHERE operation_id=$2) commands`, [table.id, operationId]);
    expect(state.rows[0]).toEqual({ status: "AVAILABLE", version: "1", audit: 0, outbox: 0, changes: 0, commands: 0 });
  });

  it("serializes release against opening an account and never leaves AVAILABLE with an OPEN account", async () => {
    const table = await createTable("Release/open race");
    const occupied = await floor.changeTableStatus(actor, randomUUID(), table.id, { targetStatus: "OCCUPIED", expectedVersion: table.version });
    const outcomes = await Promise.allSettled([
      floor.changeTableStatus(actor, randomUUID(), table.id, { targetStatus: "AVAILABLE", expectedVersion: occupied.version }),
      floor.openAccount(actor, randomUUID(), { tableId: table.id, customerId: null, notes: null }),
    ]);
    expect(outcomes.some((outcome) => outcome.status === "fulfilled")).toBe(true);
    const state = await pool.query(`SELECT t.status,(SELECT count(*)::int FROM accounts WHERE table_id=t.id AND status='OPEN') open_accounts
      FROM restaurant_tables t WHERE t.id=$1`, [table.id]);
    expect(state.rows[0]).toEqual({ status: "OCCUPIED", open_accounts: 1 });
  });
});
