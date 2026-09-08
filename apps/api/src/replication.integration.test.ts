import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { createSqlAuthService } from "./auth.js";
import { CatalogService } from "./catalog.js";
import { ReplicationService } from "./replication.js";

const localUrl = process.env.DATABASE_URL_TEST;
const cloudUrl = process.env.DATABASE_URL_CLOUD_TEST;
const describeIntegration = localUrl && cloudUrl ? describe : describe.skip;

describeIntegration("local-first Edge to Cloud replication", () => {
  let local: Pool; let cloud: Pool; let localCatalog: CatalogService; let cloudReplication: ReplicationService; let edgeReplication: ReplicationService;
  const companyId = randomUUID(); const branchId = randomUUID(); const userId = randomUUID(); const actor = { userId, branchId };
  let edgeServerId = ""; let edgeServerToken = "";

  const provision = async (pool: Pool, suffix: string) => {
    await pool.query("INSERT INTO companies(id,name,currency,timezone) VALUES($1,$2,'COP','America/Bogota')", [companyId, `Replica ${suffix} ${companyId}`]);
    await pool.query("INSERT INTO branches(id,company_id,name,code) VALUES($1,$2,$3,$4)", [branchId, companyId, `Replica ${suffix}`, `${suffix}-${companyId}`.slice(0, 20)]);
    await pool.query("INSERT INTO users(id,company_id,username,password_hash,display_name) VALUES($1,$2,$3,crypt('offline-pass',gen_salt('bf',4)),'Offline operator')", [userId, companyId, `offline-${suffix}-${companyId}`]);
    await pool.query("INSERT INTO user_branch_access(user_id,branch_id) VALUES($1,$2)", [userId, branchId]);
  };

  beforeAll(async () => {
    local = new Pool({ connectionString: localUrl }); cloud = new Pool({ connectionString: cloudUrl });
    await provision(local, "local"); await provision(cloud, "cloud");
    localCatalog = new CatalogService(local); edgeReplication = new ReplicationService(local, "edge"); cloudReplication = new ReplicationService(cloud, "cloud", 60 * 60);
    const enrollment = await cloudReplication.createEnrollment(actor, "Servidor Local de Prueba");
    const claimed = await cloudReplication.claimEnrollment(enrollment.enrollmentToken, "Servidor Local de Prueba");
    edgeServerId = claimed.edgeServerId; edgeServerToken = claimed.edgeServerToken;
    await edgeReplication.configureLocalIdentity(edgeServerId, branchId);
  });
  afterAll(async () => { await local.end(); await cloud.end(); });

  it("keeps two local clients and an already-synced login operating while WAN replication is absent", async () => {
    const auth = createSqlAuthService(local, "local-first-test-secret-that-is-long-enough");
    const session = await auth.login({ username: `offline-local-${companyId}`, password: "offline-pass" });
    expect(session.activeBranch?.id).toBe(branchId);
    const created = await Promise.all([
      localCatalog.createInventoryItem(actor, randomUUID(), { name: "Local beef", unit: "G", initialStock: "5", initialUnitCost: "2", minimumStock: "0", notes: null }),
      localCatalog.createInventoryItem(actor, randomUUID(), { name: "Local sauce", unit: "UNIT", initialStock: "2", initialUnitCost: "1", minimumStock: "0", notes: null }),
    ]);
    const shared = await localCatalog.snapshot(actor, true);
    expect(shared.inventoryItems.map((item) => item.id)).toEqual(expect.arrayContaining(created.map((item) => item.id)));
    expect((await edgeReplication.edgeStatus(actor)).outbox.pending).toBeGreaterThanOrEqual(2);
  });

  it("refreshes Cloud-managed credentials and branch permissions for later offline login", async () => {
    const roleId = randomUUID(); const permissionId = randomUUID();
    await cloud.query("UPDATE users SET password_hash=crypt('cloud-synced-pass',gen_salt('bf',4)) WHERE id=$1", [userId]);
    await cloud.query("INSERT INTO permissions(id,key,name,module) VALUES($1,'replication.status.view','View replication','replication')", [permissionId]);
    await cloud.query("INSERT INTO roles(id,company_id,name) VALUES($1,$2,'Local replica viewer')", [roleId,companyId]);
    await cloud.query("INSERT INTO role_permissions(role_id,permission_id) VALUES($1,$2)", [roleId,permissionId]);
    await cloud.query("INSERT INTO user_roles(id,user_id,role_id,branch_id) VALUES($1,$2,$3,$4)", [randomUUID(),userId,roleId,branchId]);
    await edgeReplication.applyIdentitySnapshot(await cloudReplication.cloudIdentitySnapshot(edgeServerId, edgeServerToken));
    const auth = createSqlAuthService(local, "local-first-test-secret-that-is-long-enough");
    const session = await auth.login({ username: `offline-cloud-${companyId}`, password: "cloud-synced-pass" });
    expect(session.activeBranch?.id).toBe(branchId); expect(session.permissions).toContain("replication.status.view");
  });
  it("delivers durable local outbox events once to an isolated Cloud branch and acknowledges retries", async () => {
    const events = await local.query<{ operation_id: string; branch_id: string; command_name: string; aggregate_type: string; aggregate_id: string; payload: unknown }>("SELECT operation_id,branch_id,command_name,aggregate_type,aggregate_id,payload FROM sync_outbox WHERE branch_id=$1 ORDER BY created_at", [branchId]);
    expect(events.rowCount).toBeGreaterThanOrEqual(2);
    for (const event of events.rows) await cloudReplication.receiveEdgeEvent(edgeServerId, edgeServerToken, { operationId: event.operation_id, branchId: event.branch_id, commandName: event.command_name, aggregateType: event.aggregate_type, aggregateId: event.aggregate_id, payload: event.payload });
    const retry = events.rows[0]!;
    expect(await cloudReplication.receiveEdgeEvent(edgeServerId, edgeServerToken, { operationId: retry.operation_id, branchId: retry.branch_id, commandName: retry.command_name, aggregateType: retry.aggregate_type, aggregateId: retry.aggregate_id, payload: retry.payload })).toMatchObject({ status: "DUPLICATE" });
    const status = await cloudReplication.cloudStatus(actor);
    expect(status).toMatchObject({ branchId, edgeServerId, stale: false }); expect(status.replicatedEvents).toBeGreaterThanOrEqual(2);
    const projection = await cloudReplication.cloudEntities(actor);
    expect(projection.entities).toHaveLength(2);
    await expect(cloudReplication.receiveEdgeEvent(edgeServerId, edgeServerToken, { operationId: randomUUID(), branchId: randomUUID(), commandName: "inventory.create", aggregateType: "inventory_item", aggregateId: randomUUID(), payload: {} })).rejects.toThrow("cannot replicate another branch");
  });
});