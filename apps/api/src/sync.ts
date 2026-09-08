import { createHash } from "node:crypto";
import type { PullSyncChangesRequest, PushSyncOperationsRequest, RegisterSyncDeviceRequest, SyncDevice, SyncOperationRequest, SyncOperationResult } from "@don-juan/contracts";
import { one, withTransaction } from "@don-juan/database";
import type { Pool, PoolClient } from "pg";
import { CatalogConflict, CatalogRuleViolation } from "./catalog.js";

export interface SyncActor { readonly userId: string; readonly branchId: string; }
export type SyncCommandExecutor = (operation: SyncOperationRequest, actor: SyncActor) => Promise<unknown>;
type CommandAction<T> = (client: PoolClient, companyId: string) => Promise<T>;
type OperationRow = { id: string; device_id: string; branch_id: string; operation_id: string; command_name: string; entity_type: string; entity_id: string; expected_version: number | null; status: "PENDING" | "PROCESSING" | "PROCESSED" | "FAILED" | "CONFLICT"; result: unknown | null; error_message: string | null; conflict_type: string | null; conflict_metadata: unknown | null; request_hash: string | null; resolved_at: Date | null; created_at: Date };

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(",")}}`;
}
const hash = (value: unknown) => createHash("sha256").update(stableJson(value)).digest("hex");
const instant = (value: Date | string | null) => value ? new Date(value).toISOString() : null;
const operationType = (name: string): "CREATE" | "UPDATE" | "VOID" | "ADJUST" => name.includes(".void") ? "VOID" : name.includes(".adjust") ? "ADJUST" : /\.(update|close|clock_out|apply_discount|configure_service)$/.test(name) ? "UPDATE" : "CREATE";
const displayError = (error: unknown) => error instanceof Error ? error.message.slice(0, 2_000) : "The operation could not be processed";

export class SyncService {
  public constructor(private readonly pool: Pool) {}

  private async command<T>(actor: SyncActor, operationId: string, commandName: string, request: unknown, action: CommandAction<T>): Promise<T> {
    return withTransaction(this.pool, async (client) => {
      const companyId = await this.companyId(client, actor);
      const requestHash = hash(request);
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO command_operations(company_id,branch_id,operation_id,command_name,user_id,request_hash)
         VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(company_id,operation_id) DO NOTHING RETURNING id`,
        [companyId, actor.branchId, operationId, commandName, actor.userId, requestHash],
      );
      if (!inserted.rowCount) {
        const previous = await one<{ command_name: string; request_hash: string; result: T }>(client,
          "SELECT command_name,request_hash,result FROM command_operations WHERE company_id=$1 AND operation_id=$2 FOR UPDATE",
          [companyId, operationId]);
        if (!previous || previous.command_name !== commandName || previous.request_hash !== requestHash) throw new CatalogConflict("Idempotency key was already used for a different command");
        return previous.result;
      }
      const result = await action(client, companyId);
      await client.query("UPDATE command_operations SET result=$2,completed_at=NOW() WHERE id=$1", [inserted.rows[0]?.id, result]);
      return result;
    });
  }

  private async companyId(client: Pool | PoolClient, actor: SyncActor): Promise<string> {
    const tenant = await one<{ company_id: string }>(client,
      `SELECT b.company_id FROM user_branch_access uba JOIN users u ON u.id=uba.user_id
       JOIN branches b ON b.id=uba.branch_id AND b.company_id=u.company_id
       WHERE uba.user_id=$1 AND uba.branch_id=$2 AND b.active FOR SHARE`,
      [actor.userId, actor.branchId]);
    if (!tenant) throw new CatalogRuleViolation("Active branch access is required");
    return tenant.company_id;
  }

  private device(row: { id: string; device_identifier: string; device_name: string | null; device_type: string | null; active: boolean; last_sync_at: Date | null; created_at: Date }): SyncDevice {
    return { id: row.id, deviceIdentifier: row.device_identifier, deviceName: row.device_name, deviceType: row.device_type, active: row.active, lastSyncAt: instant(row.last_sync_at), createdAt: instant(row.created_at)! };
  }

  private result(row: OperationRow): SyncOperationResult {
    return { operationId: row.operation_id, status: row.status, result: row.result, error: row.error_message, conflictType: row.conflict_type };
  }

  private async outbox(client: PoolClient, actor: SyncActor, operationId: string, name: string, id: string, payload: unknown): Promise<void> {
    await client.query(
      `INSERT INTO sync_outbox(branch_id,operation_id,command_name,aggregate_type,aggregate_id,payload)
       VALUES($1,$2,$3,'sync_device',$4,$5)`,
      [actor.branchId, operationId, name, id, payload],
    );
  }

  public async registerDevice(actor: SyncActor, operationId: string, input: RegisterSyncDeviceRequest): Promise<SyncDevice> {
    return this.command(actor, operationId, "sync.devices.register", input, async (client, companyId) => {
      const existing = await one<any>(client,
        "SELECT * FROM sync_devices WHERE branch_id=$1 AND device_identifier=$2 FOR UPDATE",
        [actor.branchId, input.deviceIdentifier]);
      if (existing && !existing.active) throw new CatalogRuleViolation("This device is deactivated and cannot be registered again");
      const row = existing
        ? await one<any>(client,
          `UPDATE sync_devices SET device_name=COALESCE($2,device_name),device_type=COALESCE($3,device_type),
             last_seen_at=NOW(),version=version+1 WHERE id=$1 RETURNING *`,
          [existing.id, input.deviceName ?? null, input.deviceType ?? null])
        : await one<any>(client,
          `INSERT INTO sync_devices(id,branch_id,device_identifier,device_name,device_type,last_seen_at)
             VALUES(gen_random_uuid(),$1,$2,$3,$4,NOW()) RETURNING *`,
          [actor.branchId, input.deviceIdentifier, input.deviceName ?? null, input.deviceType ?? null]);
      if (!row) throw new Error("Sync device insert did not return a row");
      const result = this.device(row);
      await client.query(
        `INSERT INTO audit_logs(company_id,branch_id,user_id,action,entity_type,entity_id,after_data)
         VALUES($1,$2,$3,'sync_device.registered','sync_device',$4,$5)`,
        [companyId, actor.branchId, actor.userId, result.id, result],
      );
      await this.outbox(client, actor, operationId, "sync.devices.register", result.id, result);
      return result;
    });
  }

  public async devices(actor: SyncActor): Promise<{ devices: SyncDevice[] }> {
    await this.companyId(this.pool, actor);
    const rows = await this.pool.query<any>("SELECT * FROM sync_devices WHERE branch_id=$1 ORDER BY created_at", [actor.branchId]);
    return { devices: rows.rows.map((row) => this.device(row)) };
  }

  public async deactivateDevice(actor: SyncActor, operationId: string, id: string, reason?: string): Promise<SyncDevice> {
    return this.command(actor, operationId, "sync.devices.deactivate", { id, reason: reason ?? null }, async (client, companyId) => {
      const row = await one<any>(client,
        `UPDATE sync_devices SET active=FALSE,version=version+1,last_seen_at=NOW()
         WHERE id=$1 AND branch_id=$2 AND active RETURNING *`,
        [id, actor.branchId]);
      if (!row) throw new CatalogRuleViolation("An active device was not found in the current branch");
      const result = this.device(row);
      await client.query(
        `INSERT INTO audit_logs(company_id,branch_id,user_id,action,entity_type,entity_id,before_data,after_data)
         VALUES($1,$2,$3,'sync_device.deactivated','sync_device',$4,$5,$6)`,
        [companyId, actor.branchId, actor.userId, result.id, { active: true, reason: reason ?? null }, result],
      );
      await this.outbox(client, actor, operationId, "sync.devices.deactivate", result.id, result);
      return result;
    });
  }

  public async status(actor: SyncActor) {
    await this.companyId(this.pool, actor);
    const summary = await one<{ pending: string; failed: string; conflict: string; delivered: string; last_delivered_at: Date | null }>(this.pool,
      `SELECT COUNT(*) FILTER (WHERE status='PENDING') pending, COUNT(*) FILTER (WHERE status='FAILED') failed,
       COUNT(*) FILTER (WHERE status='CONFLICT') conflict, COUNT(*) FILTER (WHERE status='DELIVERED') delivered,
       MAX(delivered_at) last_delivered_at FROM sync_outbox WHERE branch_id=$1`,
      [actor.branchId]);
    const latest = await one<{ cursor: string | null }>(this.pool, "SELECT MAX(cursor)::text cursor FROM sync_changes WHERE branch_id=$1", [actor.branchId]);
    return {
      protocolVersion: 1 as const,
      outbox: { pending: Number(summary?.pending ?? 0), failed: Number(summary?.failed ?? 0), conflict: Number(summary?.conflict ?? 0), delivered: Number(summary?.delivered ?? 0), lastDeliveredAt: instant(summary?.last_delivered_at ?? null) },
      latestChangeCursor: latest?.cursor ?? "0",
    };
  }

  public async pullChanges(actor: SyncActor, input: PullSyncChangesRequest & { deviceId: string }) {
    return withTransaction(this.pool, async (client) => {
      await this.companyId(client, actor);
      const device = await one<{ id: string; active: boolean }>(client, "SELECT id,active FROM sync_devices WHERE id=$1 AND branch_id=$2 FOR UPDATE", [input.deviceId, actor.branchId]);
      if (!device || !device.active) throw new CatalogRuleViolation("An active device is required to pull branch changes");
      const rows = await client.query<any>(
        `SELECT cursor::text,operation_id,entity_type,entity_id,entity_version,payload,created_at
         FROM sync_changes WHERE branch_id=$1 AND cursor>$2::bigint ORDER BY cursor LIMIT $3`,
        [actor.branchId, input.after, input.limit],
      );
      await client.query("UPDATE sync_devices SET last_sync_at=NOW(),last_seen_at=NOW() WHERE id=$1", [device.id]);
      const changes = rows.rows.map((row) => ({
        cursor: row.cursor, operationId: row.operation_id, operationName: String(row.payload.operationName ?? "unknown"),
        entityType: row.entity_type, entityId: row.entity_id, entityVersion: row.entity_version === null ? null : Number(row.entity_version),
        payload: row.payload.payload ?? row.payload, createdAt: instant(row.created_at)!,
      }));
      return { changes, nextCursor: changes.at(-1)?.cursor ?? input.after };
    });
  }

  private async persistOperation(actor: SyncActor, deviceId: string, operation: SyncOperationRequest): Promise<OperationRow> {
    return withTransaction(this.pool, async (client) => {
      await this.companyId(client, actor);
      const device = await one<{ id: string; active: boolean }>(client, "SELECT id,active FROM sync_devices WHERE id=$1 AND branch_id=$2 FOR UPDATE", [deviceId, actor.branchId]);
      if (!device || !device.active) throw new CatalogRuleViolation("An active device is required to push branch operations");
      const requestHash = hash(operation);
      const existing = await one<OperationRow>(client, "SELECT * FROM sync_operations WHERE operation_id=$1 FOR UPDATE", [operation.operationId]);
      if (existing) {
        if (existing.device_id !== deviceId || existing.branch_id !== actor.branchId || existing.command_name !== operation.operationName || existing.request_hash !== requestHash) throw new CatalogConflict("operationId was already used for a different synchronization operation");
        if (existing.status !== "PENDING" && existing.status !== "FAILED") return existing;
        if (existing.status === "PENDING") {
          const dependency = await client.query<{ operation_id: string; status: string }>("SELECT operation_id,status FROM sync_operations WHERE operation_id=ANY($1::uuid[])", [operation.dependsOnOperationIds]);
          const completed = new Set(dependency.rows.filter((row) => row.status === "PROCESSED").map((row) => row.operation_id));
          if (operation.dependsOnOperationIds.some((id) => !completed.has(id))) return existing;
          const earlier = await one(client, `SELECT id FROM sync_operations WHERE branch_id=$1 AND entity_type=$2 AND entity_id=$3 AND id<>$4 AND status IN ('PENDING','PROCESSING') FOR SHARE`, [actor.branchId, operation.entityType, operation.entityId, existing.id]);
          if (earlier) return existing;
        }
        await client.query("UPDATE sync_operations SET status='PROCESSING',attempts=attempts+1,last_attempt_at=NOW(),error_message=NULL WHERE id=$1", [existing.id]);
        return (await one<OperationRow>(client, "SELECT * FROM sync_operations WHERE id=$1", [existing.id]))!;
      }
      const dependency = await client.query<{ operation_id: string; status: string }>("SELECT operation_id,status FROM sync_operations WHERE operation_id=ANY($1::uuid[])", [operation.dependsOnOperationIds]);
      const completed = new Set(dependency.rows.filter((row) => row.status === "PROCESSED").map((row) => row.operation_id));
      const waiting = operation.dependsOnOperationIds.some((id) => !completed.has(id));
      const earlier = await one(client,
        `SELECT id FROM sync_operations WHERE branch_id=$1 AND entity_type=$2 AND entity_id=$3
         AND status IN ('PENDING','PROCESSING') FOR SHARE`, [actor.branchId, operation.entityType, operation.entityId]);
      const status = waiting || earlier ? "PENDING" : "PROCESSING";
      const error = waiting ? "Waiting for required synchronization operations" : earlier ? "Waiting for an earlier operation on this entity" : null;
      const inserted = await one<OperationRow>(client,
        `INSERT INTO sync_operations(device_id,operation_id,branch_id,actor_user_id,entity_type,entity_id,operation_type,command_name,expected_version,depends_on_operation_ids,schema_version,payload,status,error_message,request_hash,attempts,last_attempt_at)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,1,CASE WHEN $13::sync_operation_status='PROCESSING' THEN NOW() ELSE NULL END) RETURNING *`,
        [deviceId, operation.operationId, actor.branchId, actor.userId, operation.entityType, operation.entityId, operationType(operation.operationName), operation.operationName, operation.expectedVersion ?? null, operation.dependsOnOperationIds, operation.schemaVersion, operation.payload, status, error, requestHash]);
      if (!inserted) throw new Error("Sync operation insert did not return a row");
      return inserted;
    });
  }

  private async finalize(id: string, status: "PROCESSED" | "FAILED" | "CONFLICT", result: unknown, error: string | null, conflictType: string | null): Promise<SyncOperationResult> {
    const row = await one<OperationRow>(this.pool,
      `UPDATE sync_operations SET status=$2,result=$3,error_message=$4,conflict_type=$5,conflict_metadata=$6,processed_at=NOW()
       WHERE id=$1 RETURNING *`,
      [id, status, result, error, conflictType, conflictType ? { type: conflictType, message: error } : null]);
    if (!row) throw new Error("Sync operation disappeared while being processed");
    return this.result(row);
  }

  public async pushOperations(actor: SyncActor, input: PushSyncOperationsRequest, execute: SyncCommandExecutor): Promise<{ results: SyncOperationResult[] }> {
    const results: SyncOperationResult[] = [];
    for (const operation of input.operations) {
      let stored: OperationRow;
      try { stored = await this.persistOperation(actor, input.deviceId, operation); }
      catch (error) {
        if (error instanceof CatalogConflict) throw error;
        if (error instanceof CatalogRuleViolation) throw error;
        throw error;
      }
      if (stored.status !== "PROCESSING") { results.push(this.result(stored)); continue; }
      try {
        const result = await execute(operation, actor);
        results.push(await this.finalize(stored.id, "PROCESSED", result, null, null));
      } catch (error) {
        if (error instanceof CatalogConflict) results.push(await this.finalize(stored.id, "CONFLICT", null, displayError(error), "VERSION_OR_STATE_CONFLICT"));
        else results.push(await this.finalize(stored.id, "FAILED", null, displayError(error), null));
      }
    }
    return { results };
  }

  public async conflicts(actor: SyncActor) {
    await this.companyId(this.pool, actor);
    const rows = await this.pool.query<OperationRow>(
      `SELECT * FROM sync_operations WHERE branch_id=$1 AND status='CONFLICT' AND resolved_at IS NULL ORDER BY created_at DESC`, [actor.branchId]);
    return { conflicts: rows.rows.map((row) => ({ ...this.result(row), deviceId: row.device_id, operationName: row.command_name, entityType: row.entity_type, entityId: row.entity_id, expectedVersion: row.expected_version === null ? null : Number(row.expected_version), conflictMetadata: row.conflict_metadata, createdAt: instant(row.created_at)! })) };
  }

  public async discardConflict(actor: SyncActor, operationId: string, resolutionOperationId: string, reason: string) {
    return this.command(actor, resolutionOperationId, "sync.conflicts.discard", { operationId, reason }, async (client, companyId) => {
      const row = await one<OperationRow>(client, "SELECT * FROM sync_operations WHERE operation_id=$1 AND branch_id=$2 FOR UPDATE", [operationId, actor.branchId]);
      if (!row || row.status !== "CONFLICT" || row.resolved_at) throw new CatalogRuleViolation("An unresolved conflict was not found in the current branch");
      const updated = await one<OperationRow>(client,
        `UPDATE sync_operations SET status='FAILED',error_message=$2,resolved_at=NOW(),resolved_by_user_id=$3,resolution_type='DISCARD'
         WHERE id=$1 RETURNING *`, [row.id, `Discarded by authorized user: ${reason}`, actor.userId]);
      await client.query(
        `INSERT INTO audit_logs(company_id,branch_id,user_id,action,entity_type,entity_id,before_data,after_data)
         VALUES($1,$2,$3,'sync_conflict.discarded','sync_operation',$4,$5,$6)`,
        [companyId, actor.branchId, actor.userId, row.id, { status: "CONFLICT", reason: row.error_message }, { status: "FAILED", resolution: "DISCARD", reason }],
      );
      return this.result(updated!);
    });
  }
}