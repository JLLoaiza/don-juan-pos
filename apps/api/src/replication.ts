import { randomBytes } from "node:crypto";
import type { CloudBranchReplicationStatus, CloudIdentitySnapshot, EdgeReplicaEvent } from "@don-juan/contracts";
import { one, withTransaction } from "@don-juan/database";
import type { Pool, PoolClient } from "pg";
import { AccessDenied } from "./auth.js";
import { CatalogConflict, CatalogRuleViolation } from "./catalog.js";

export interface ReplicationActor { readonly userId: string; readonly branchId: string; }
export type DeploymentMode = "edge" | "cloud";
interface EdgeServerRow { id: string; branch_id: string; display_name: string; active: boolean; enrolled_at: Date; last_received_at: Date | null; credential_hash: string; }
const instant = (value: Date | string | null) => value ? new Date(value).toISOString() : null;
const secret = () => randomBytes(32).toString("base64url");
const redactCosts = (value: unknown): unknown => { if (Array.isArray(value)) return value.map(redactCosts); if (value && typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>).filter(([key]) => !["unitCost","calculatedCost","stockBefore","stockAfter"].includes(key)).map(([key,item]) => [key,redactCosts(item)])); return value; };
const stableJson = (value: unknown): string => {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(",")}}`;
};

export class ReplicationService {
  public constructor(private readonly pool: Pool, readonly mode: DeploymentMode, private readonly staleAfterSeconds = 300) {}

  private requireMode(mode: DeploymentMode): void {
    if (this.mode !== mode) throw new CatalogRuleViolation(`This endpoint is available only on a ${mode} deployment`);
  }

  private async tenant(client: Pool | PoolClient, actor: ReplicationActor): Promise<string> {
    const row = await one<{ company_id: string }>(client,
      `SELECT b.company_id FROM user_branch_access uba JOIN users u ON u.id=uba.user_id
       JOIN branches b ON b.id=uba.branch_id AND b.company_id=u.company_id
       WHERE uba.user_id=$1 AND uba.branch_id=$2 AND b.active FOR SHARE`, [actor.userId, actor.branchId]);
    if (!row) throw new AccessDenied("Active branch access is required");
    return row.company_id;
  }

  public async configureLocalIdentity(edgeServerId: string, branchId: string): Promise<void> {
    this.requireMode("edge");
    await withTransaction(this.pool, async (client) => {
      const existing = await one<{ edge_server_id: string; branch_id: string }>(client, "SELECT edge_server_id,branch_id FROM edge_local_identity WHERE singleton=TRUE FOR UPDATE");
      if (existing && (existing.edge_server_id !== edgeServerId || existing.branch_id !== branchId)) throw new Error("The local Edge identity is already bound and cannot be reassigned");
      if (!existing) await client.query("INSERT INTO edge_local_identity(singleton,edge_server_id,branch_id) VALUES(TRUE,$1,$2)", [edgeServerId, branchId]);
    });
  }

  public async localBranchId(): Promise<string | null> {
    if (this.mode !== "edge") return null;
    const row = await one<{ branch_id: string }>(this.pool, "SELECT branch_id FROM edge_local_identity WHERE singleton=TRUE");
    return row?.branch_id ?? null;
  }

  public async createEnrollment(actor: ReplicationActor, displayName: string) {
    this.requireMode("cloud");
    const enrollmentToken = secret();
    return withTransaction(this.pool, async (client) => {
      await this.tenant(client, actor);
      const row = await one<{ expires_at: Date }>(client,
        `INSERT INTO edge_enrollment_tokens(branch_id,display_name,token_hash,expires_at,created_by_user_id)
         VALUES($1,$2,crypt($3,gen_salt('bf',12)),NOW()+INTERVAL '15 minutes',$4) RETURNING expires_at`,
        [actor.branchId, displayName, enrollmentToken, actor.userId]);
      if (!row) throw new Error("Could not create Edge enrollment token");
      return { enrollmentToken, expiresAt: instant(row.expires_at)! };
    });
  }

  public async claimEnrollment(enrollmentToken: string, displayName: string) {
    this.requireMode("cloud");
    const edgeServerToken = secret();
    return withTransaction(this.pool, async (client) => {
      const enrollment = await one<{ id: string; branch_id: string; display_name: string }>(client,
        `SELECT id,branch_id,display_name FROM edge_enrollment_tokens
         WHERE consumed_at IS NULL AND expires_at>NOW() AND crypt($1,token_hash)=token_hash FOR UPDATE`, [enrollmentToken]);
      if (!enrollment) throw new AccessDenied("Enrollment token is invalid, expired, or already used");
      const active = await one<{ id: string }>(client, "SELECT id FROM edge_servers WHERE branch_id=$1 AND active FOR UPDATE", [enrollment.branch_id]);
      if (active) throw new CatalogConflict("This branch already has an active Edge server; revoke it before replacement");
      const server = await one<EdgeServerRow>(client,
        `INSERT INTO edge_servers(branch_id,display_name,credential_hash)
         VALUES($1,$2,crypt($3,gen_salt('bf',12))) RETURNING *`, [enrollment.branch_id, displayName || enrollment.display_name, edgeServerToken]);
      if (!server) throw new Error("Could not enroll Edge server");
      await client.query("UPDATE edge_enrollment_tokens SET consumed_at=NOW() WHERE id=$1", [enrollment.id]);
      return { edgeServerId: server.id, branchId: server.branch_id, edgeServerToken, enrolledAt: instant(server.enrolled_at)! };
    });
  }

  public async receiveEdgeEvent(edgeServerId: string, edgeServerToken: string, event: EdgeReplicaEvent) {
    this.requireMode("cloud");
    return withTransaction(this.pool, async (client) => {
      const server = await one<EdgeServerRow>(client,
        "SELECT * FROM edge_servers WHERE id=$1 AND active AND crypt($2,credential_hash)=credential_hash FOR UPDATE", [edgeServerId, edgeServerToken]);
      if (!server) throw new AccessDenied("The Edge server identity is invalid or revoked");
      if (event.branchId !== server.branch_id) throw new AccessDenied("The enrolled Edge server cannot replicate another branch");
      const previous = await one<{ receipt_cursor: string; command_name: string; aggregate_type: string; aggregate_id: string; payload: unknown; received_at: Date }>(client,
        "SELECT receipt_cursor::text,command_name,aggregate_type,aggregate_id,payload,received_at FROM cloud_replica_events WHERE edge_server_id=$1 AND operation_id=$2 FOR UPDATE", [server.id, event.operationId]);
      if (previous) {
        if (previous.command_name !== event.commandName || previous.aggregate_type !== event.aggregateType || previous.aggregate_id !== event.aggregateId || stableJson(previous.payload) !== stableJson(event.payload)) throw new CatalogConflict("Edge operationId was reused for a different replica event");
        return { status: "DUPLICATE" as const, receiptCursor: previous.receipt_cursor, receivedAt: instant(previous.received_at)! };
      }
      const inserted = await one<{ receipt_cursor: string; received_at: Date }>(client,
        `INSERT INTO cloud_replica_events(edge_server_id,branch_id,operation_id,command_name,aggregate_type,aggregate_id,payload)
         VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING receipt_cursor::text,received_at`,
        [server.id, server.branch_id, event.operationId, event.commandName, event.aggregateType, event.aggregateId, event.payload]);
      if (!inserted) throw new Error("Cloud replica receipt was not created");
      const version = typeof event.payload === "object" && event.payload !== null && "version" in event.payload && Number.isInteger(Number((event.payload as { version?: unknown }).version)) ? Number((event.payload as { version: unknown }).version) : null;
      await client.query(
        `INSERT INTO cloud_replica_entities(branch_id,entity_type,entity_id,entity_version,payload,source_operation_id)
         VALUES($1,$2,$3,$4,$5,$6)
         ON CONFLICT(branch_id,entity_type,entity_id) DO UPDATE SET entity_version=EXCLUDED.entity_version,payload=EXCLUDED.payload,replicated_at=NOW(),source_operation_id=EXCLUDED.source_operation_id`,
        [server.branch_id, event.aggregateType, event.aggregateId, version, event.payload, event.operationId]);
      await client.query("UPDATE edge_servers SET last_received_at=NOW() WHERE id=$1", [server.id]);
      return { status: "ACCEPTED" as const, receiptCursor: inserted.receipt_cursor, receivedAt: instant(inserted.received_at)! };
    });
  }

  public async edgeStatus(actor: ReplicationActor) {
    this.requireMode("edge");
    await this.tenant(this.pool, actor);
    const identity = await one<{ edge_server_id: string; branch_id: string }>(this.pool, "SELECT edge_server_id,branch_id FROM edge_local_identity WHERE singleton=TRUE");
    if (!identity || identity.branch_id !== actor.branchId) throw new AccessDenied("This local server is not enrolled for the active branch");
    const outbox = await one<{ pending: string; failed: string; delivered: string; last_delivered_at: Date | null; last_error: string | null }>(this.pool,
      `SELECT COUNT(*) FILTER(WHERE status='PENDING') pending,COUNT(*) FILTER(WHERE status='FAILED') failed,COUNT(*) FILTER(WHERE status='DELIVERED') delivered,
       MAX(delivered_at) last_delivered_at,(ARRAY_AGG(error_message ORDER BY created_at DESC) FILTER(WHERE error_message IS NOT NULL))[1] last_error FROM sync_outbox WHERE branch_id=$1`, [actor.branchId]);
    return { deploymentMode: "edge" as const, edgeServerId: identity.edge_server_id, branchId: identity.branch_id, outbox: { pending: Number(outbox?.pending ?? 0), failed: Number(outbox?.failed ?? 0), delivered: Number(outbox?.delivered ?? 0), lastDeliveredAt: instant(outbox?.last_delivered_at ?? null), lastError: outbox?.last_error ?? null } };
  }

  public async cloudStatus(actor: ReplicationActor): Promise<CloudBranchReplicationStatus> {
    this.requireMode("cloud");
    await this.tenant(this.pool, actor);
    const row = await one<{ id: string | null; display_name: string | null; active: boolean | null; last_received_at: Date | null; replicated_events: string }>(this.pool,
      `SELECT es.id,es.display_name,es.active,es.last_received_at,COUNT(cre.operation_id)::text replicated_events
       FROM branches b LEFT JOIN edge_servers es ON es.branch_id=b.id AND es.active
       LEFT JOIN cloud_replica_events cre ON cre.branch_id=b.id
       WHERE b.id=$1 GROUP BY es.id,es.display_name,es.active,es.last_received_at`, [actor.branchId]);
    const last = row?.last_received_at ?? null;
    return { deploymentMode: "cloud", branchId: actor.branchId, edgeServerId: row?.id ?? null, edgeServerName: row?.display_name ?? null, edgeActive: row?.active ?? false, lastReceivedAt: instant(last), replicatedEvents: Number(row?.replicated_events ?? 0), stale: !last || Date.now() - new Date(last).getTime() > this.staleAfterSeconds * 1_000 };
  }

  public async cloudEntities(actor: ReplicationActor, includeCosts = false) {
    const status = await this.cloudStatus(actor);
    const rows = await this.pool.query<{ entity_type: string; entity_id: string; entity_version: number | null; payload: unknown; replicated_at: Date }>(
      "SELECT entity_type,entity_id,entity_version,payload,replicated_at FROM cloud_replica_entities WHERE branch_id=$1 ORDER BY replicated_at DESC,entity_type,entity_id LIMIT 500", [actor.branchId]);
    return { branchId: actor.branchId, lastReceivedAt: status.lastReceivedAt, stale: status.stale, entities: rows.rows.map((row) => ({ entityType: row.entity_type, entityId: row.entity_id, entityVersion: row.entity_version === null ? null : Number(row.entity_version), payload: includeCosts ? row.payload : redactCosts(row.payload), replicatedAt: instant(row.replicated_at)! })) };
  }
  public async cloudIdentitySnapshot(edgeServerId: string, edgeServerToken: string): Promise<CloudIdentitySnapshot> {
    this.requireMode("cloud");
    const server = await one<EdgeServerRow>(this.pool, "SELECT * FROM edge_servers WHERE id=$1 AND active AND crypt($2,credential_hash)=credential_hash", [edgeServerId, edgeServerToken]);
    if (!server) throw new AccessDenied("The Edge server identity is invalid or revoked");
    const branch = await one<any>(this.pool, "SELECT b.id,b.company_id,b.name,b.code,b.active,c.id company_id,c.name company_name,c.currency,c.timezone,c.active company_active FROM branches b JOIN companies c ON c.id=b.company_id WHERE b.id=$1", [server.branch_id]);
    if (!branch) throw new Error("Enrolled branch no longer exists");
    const users = (await this.pool.query<any>(`SELECT u.id,u.company_id,u.username,u.email,u.password_hash,u.display_name,u.active FROM users u JOIN user_branch_access uba ON uba.user_id=u.id WHERE uba.branch_id=$1 ORDER BY u.id`, [server.branch_id])).rows;
    const userIds = users.map((user: any) => user.id);
    const userRoles = userIds.length ? (await this.pool.query<any>(`SELECT user_id,role_id,branch_id FROM user_roles WHERE user_id=ANY($1::uuid[]) AND (branch_id=$2 OR branch_id IS NULL)`, [userIds, server.branch_id])).rows : [];
    const roleIds = [...new Set(userRoles.map((role: any) => role.role_id))];
    const roles = roleIds.length ? (await this.pool.query<any>("SELECT id,company_id,name,description,active FROM roles WHERE id=ANY($1::uuid[])", [roleIds])).rows : [];
    const rolePermissions = roleIds.length ? (await this.pool.query<any>("SELECT role_id,permission_id FROM role_permissions WHERE role_id=ANY($1::uuid[])", [roleIds])).rows : [];
    const permissionIds = [...new Set(rolePermissions.map((permission: any) => permission.permission_id))];
    const permissions = permissionIds.length ? (await this.pool.query<any>("SELECT id,key,name,description,module FROM permissions WHERE id=ANY($1::uuid[])", [permissionIds])).rows : [];
    return {
      branchId: server.branch_id,
      company: { id: branch.company_id, name: branch.company_name, currency: branch.currency, timezone: branch.timezone, active: branch.company_active },
      branch: { id: branch.id, companyId: branch.company_id, name: branch.name, code: branch.code, active: branch.active },
      users: users.map((user: any) => ({ id:user.id,companyId:user.company_id,username:user.username,email:user.email,passwordHash:user.password_hash,displayName:user.display_name,active:user.active })),
      roles: roles.map((role: any) => ({ id:role.id,companyId:role.company_id,name:role.name,description:role.description,active:role.active })),
      permissions: permissions.map((permission: any) => ({ id:permission.id,key:permission.key,name:permission.name,description:permission.description,module:permission.module })),
      rolePermissions: rolePermissions.map((permission: any) => ({ roleId:permission.role_id,permissionId:permission.permission_id })),
      userRoles: userRoles.map((role: any) => ({ userId:role.user_id,roleId:role.role_id,branchId:role.branch_id })),
      generatedAt: new Date().toISOString(),
    };
  }

  public async applyIdentitySnapshot(snapshot: CloudIdentitySnapshot): Promise<void> {
    this.requireMode("edge");
    await withTransaction(this.pool, async (client) => {
      const identity = await one<{ branch_id: string }>(client, "SELECT branch_id FROM edge_local_identity WHERE singleton=TRUE FOR UPDATE");
      if (!identity || identity.branch_id !== snapshot.branchId || snapshot.branch.id !== snapshot.branchId || snapshot.branch.companyId !== snapshot.company.id) throw new AccessDenied("Identity snapshot does not match this enrolled Edge branch");
      await client.query(`INSERT INTO companies(id,name,currency,timezone,active) VALUES($1,$2,$3,$4,$5) ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,currency=EXCLUDED.currency,timezone=EXCLUDED.timezone,active=EXCLUDED.active`, [snapshot.company.id,snapshot.company.name,snapshot.company.currency,snapshot.company.timezone,snapshot.company.active]);
      await client.query(`INSERT INTO branches(id,company_id,name,code,active) VALUES($1,$2,$3,$4,$5) ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,code=EXCLUDED.code,active=EXCLUDED.active`, [snapshot.branch.id,snapshot.branch.companyId,snapshot.branch.name,snapshot.branch.code,snapshot.branch.active]);
      for (const permission of snapshot.permissions) await client.query(`INSERT INTO permissions(id,key,name,description,module) VALUES($1,$2,$3,$4,$5) ON CONFLICT(id) DO UPDATE SET key=EXCLUDED.key,name=EXCLUDED.name,description=EXCLUDED.description,module=EXCLUDED.module`, [permission.id,permission.key,permission.name,permission.description,permission.module]);
      for (const role of snapshot.roles) await client.query(`INSERT INTO roles(id,company_id,name,description,active) VALUES($1,$2,$3,$4,$5) ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,description=EXCLUDED.description,active=EXCLUDED.active`, [role.id,role.companyId,role.name,role.description,role.active]);
      const userIds = snapshot.users.map((user) => user.id);
      if (userIds.length) {
        await client.query("DELETE FROM user_branch_access WHERE branch_id=$1", [snapshot.branchId]);
        await client.query("DELETE FROM user_roles WHERE user_id=ANY($1::uuid[]) AND (branch_id=$2 OR branch_id IS NULL)", [userIds,snapshot.branchId]);
      }
      for (const user of snapshot.users) await client.query(`INSERT INTO users(id,company_id,username,email,password_hash,display_name,active) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(id) DO UPDATE SET username=EXCLUDED.username,email=EXCLUDED.email,password_hash=EXCLUDED.password_hash,display_name=EXCLUDED.display_name,active=EXCLUDED.active`, [user.id,user.companyId,user.username,user.email,user.passwordHash,user.displayName,user.active]);
      if (snapshot.roles.length) await client.query("DELETE FROM role_permissions WHERE role_id=ANY($1::uuid[])", [snapshot.roles.map((role) => role.id)]);
      for (const permission of snapshot.rolePermissions) await client.query("INSERT INTO role_permissions(role_id,permission_id) VALUES($1,$2) ON CONFLICT DO NOTHING", [permission.roleId,permission.permissionId]);
      for (const user of snapshot.users) await client.query("INSERT INTO user_branch_access(user_id,branch_id) VALUES($1,$2) ON CONFLICT DO NOTHING", [user.id,snapshot.branchId]);
      for (const role of snapshot.userRoles) await client.query("INSERT INTO user_roles(user_id,role_id,branch_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING", [role.userId,role.roleId,role.branchId]);
    });
  }
}