import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { SyncService } from "./sync.js";
import { CatalogConflict } from "./catalog.js";

const databaseUrl = process.env.DATABASE_URL_TEST;
const describeIntegration = databaseUrl ? describe : describe.skip;

describeIntegration("sync Edge core", () => {
  let pool: Pool; let service: SyncService;
  const companyId = randomUUID(); const branchId = randomUUID(); const otherBranchId = randomUUID(); const userId = randomUUID();
  const actor = { userId, branchId }; let deviceId = "";

  beforeAll(async () => {
    pool = new Pool({ connectionString: databaseUrl }); service = new SyncService(pool);
    await pool.query("INSERT INTO companies(id,name,currency,timezone) VALUES($1,$2,'COP','America/Bogota')", [companyId, `Sync ${companyId}`]);
    await pool.query("INSERT INTO branches(id,company_id,name,code) VALUES($1,$2,'Sync',$3),($4,$2,'Other',$5)", [branchId, companyId, `S-${companyId}`, otherBranchId, `O-${companyId}`]);
    await pool.query("INSERT INTO users(id,company_id,username,password_hash,display_name) VALUES($1,$2,$3,crypt('x',gen_salt('bf',4)),'Sync')", [userId, companyId, `sync-${companyId}`]);
    await pool.query("INSERT INTO user_branch_access(user_id,branch_id) VALUES($1,$2)", [userId, branchId]);
  });
  afterAll(async () => { await pool.end(); });

  it("registers a branch device idempotently and exposes its committed outbox change via cursor PULL", async () => {
    const operationId = randomUUID();
    const first = await service.registerDevice(actor, operationId, { deviceIdentifier: "tablet-1", deviceName: "Tablet 1", deviceType: "TABLET" });
    const replay = await service.registerDevice(actor, operationId, { deviceIdentifier: "tablet-1", deviceName: "Tablet 1", deviceType: "TABLET" });
    deviceId = first.id;
    expect(replay).toEqual(first);
    const listed = await service.devices(actor);
    expect(listed.devices).toContainEqual(expect.objectContaining({ id: first.id, active: true }));
    const pulled = await service.pullChanges(actor, { deviceId, after: "0", limit: 20 });
    expect(pulled.changes).toEqual(expect.arrayContaining([expect.objectContaining({ operationId, operationName: "sync.devices.register", entityId: first.id })]));
    expect(pulled.nextCursor).not.toBe("0");
    const status = await service.status(actor);
    expect(status.outbox.pending).toBeGreaterThanOrEqual(1);
  });

  it("processes batches once, keeps pending dependencies ordered, and records conflicts separately", async () => {
    const entityId = randomUUID(); const operationId = randomUUID(); let executions = 0;
    const operation = { operationId, operationName: "employees.create" as const, entityType: "employee", entityId, payload: { name: "Ana" }, dependsOnOperationIds: [], schemaVersion: 1 as const };
    const first = await service.pushOperations(actor, { deviceId, operations: [operation] }, async () => { executions += 1; return { accepted: true, entityId }; });
    const replay = await service.pushOperations(actor, { deviceId, operations: [{ ...operation, payload: { name: "Ana" } }] }, async () => { executions += 1; return { accepted: false }; });
    expect(first.results[0]).toMatchObject({ operationId, status: "PROCESSED", result: { accepted: true } });
    expect(replay.results[0]).toEqual(first.results[0]); expect(executions).toBe(1);
    await expect(service.pushOperations(actor, { deviceId, operations: [{ ...operation, payload: { name: "Different" } }] }, async () => ({}))).rejects.toThrow("already used");

    const dependencyId = randomUUID(); const pendingId = randomUUID(); let childExecutions = 0;
    const child = { operationId: pendingId, operationName: "employees.create" as const, entityType: "employee", entityId: randomUUID(), payload: { child: true }, dependsOnOperationIds: [dependencyId], schemaVersion: 1 as const };
    const waiting = await service.pushOperations(actor, { deviceId, operations: [child] }, async () => { childExecutions += 1; return {}; });
    expect(waiting.results[0]).toMatchObject({ status: "PENDING" }); expect(childExecutions).toBe(0);
    const dependency = { operationId: dependencyId, operationName: "employees.create" as const, entityType: "employee", entityId: randomUUID(), payload: { parent: true }, dependsOnOperationIds: [], schemaVersion: 1 as const };
    await service.pushOperations(actor, { deviceId, operations: [dependency] }, async () => ({ parent: true }));
    const resolved = await service.pushOperations(actor, { deviceId, operations: [child] }, async () => { childExecutions += 1; return { child: true }; });
    expect(resolved.results[0]).toMatchObject({ status: "PROCESSED", result: { child: true } }); expect(childExecutions).toBe(1);

    const conflictId = randomUUID(); const conflict = { operationId: conflictId, operationName: "employees.update" as const, entityType: "employee", entityId: randomUUID(), expectedVersion: 1, payload: { version: 1 }, dependsOnOperationIds: [], schemaVersion: 1 as const };
    const conflictResult = await service.pushOperations(actor, { deviceId, operations: [conflict] }, async () => { throw new CatalogConflict("Employee changed"); });
    expect(conflictResult.results[0]).toMatchObject({ status: "CONFLICT", conflictType: "VERSION_OR_STATE_CONFLICT" });
    expect((await service.conflicts(actor)).conflicts).toEqual(expect.arrayContaining([expect.objectContaining({ operationId: conflictId, entityId: conflict.entityId })]));
    const discarded = await service.discardConflict(actor, conflictId, randomUUID(), "Duplicate change reviewed");
    expect(discarded).toMatchObject({ operationId: conflictId, status: "FAILED" });
    expect((await service.conflicts(actor)).conflicts.map((item) => item.operationId)).not.toContain(conflictId);
  });
  it("does not allow an inactive device to PULL or re-register", async () => {
    await service.deactivateDevice(actor, randomUUID(), deviceId, "Reemplazado");
    await expect(service.pullChanges(actor, { deviceId, after: "0", limit: 20 })).rejects.toThrow("active device");
    await expect(service.registerDevice(actor, randomUUID(), { deviceIdentifier: "tablet-1" })).rejects.toThrow("deactivated");
  });
});
