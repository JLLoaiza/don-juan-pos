import type { Pool } from "pg";
import { withTransaction } from "@don-juan/database";
import { retryDelaySeconds } from "./backoff.js";

export interface ClaimedSyncOutboxEvent {
  readonly id: string;
  readonly branchId: string;
  readonly operationId: string;
  readonly commandName: string;
  readonly aggregateType: string;
  readonly aggregateId: string;
  readonly payload: unknown;
  readonly attempts: number;
}

export interface SyncOutboxTransport { deliver(event: ClaimedSyncOutboxEvent): Promise<void>; }

/** HTTPS transport only: the Cloud endpoint and Edge service credential are deployment configuration, never client input. */
export class HttpSyncOutboxTransport implements SyncOutboxTransport {
  public constructor(private readonly endpoint: string, private readonly token: string) {}

  public async deliver(event: ClaimedSyncOutboxEvent): Promise<void> {
    const response = await fetch(this.endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.token}`,
        "idempotency-key": event.operationId,
      },
      body: JSON.stringify({ protocolVersion: 1, event: {
        branchId: event.branchId, operationId: event.operationId, commandName: event.commandName,
        aggregateType: event.aggregateType, aggregateId: event.aggregateId, payload: event.payload,
      } }),
    });
    if (!response.ok) throw new Error(`Cloud sync delivery failed with HTTP ${response.status}`);
  }
}

export async function claimNextSyncOutboxEvent(pool: Pool, workerId: string): Promise<ClaimedSyncOutboxEvent | undefined> {
  return withTransaction(pool, async (client) => {
    const result = await client.query<ClaimedSyncOutboxEvent>(`
      WITH candidate AS (
        SELECT id FROM sync_outbox
        WHERE status IN ('PENDING', 'FAILED') AND locked_at IS NULL AND next_attempt_at <= NOW()
        ORDER BY created_at
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      )
      UPDATE sync_outbox event
      SET locked_at=NOW(), locked_by=$1, attempts=event.attempts+1
      FROM candidate
      WHERE event.id=candidate.id
      RETURNING event.id, event.branch_id AS "branchId", event.operation_id AS "operationId",
        event.command_name AS "commandName", event.aggregate_type AS "aggregateType",
        event.aggregate_id AS "aggregateId", event.payload, event.attempts
    `, [workerId]);
    return result.rows[0];
  });
}

export async function markSyncOutboxDelivered(pool: Pool, eventId: string, workerId: string): Promise<void> {
  await pool.query(`UPDATE sync_outbox SET status='DELIVERED', delivered_at=NOW(), locked_at=NULL, locked_by=NULL, error_message=NULL WHERE id=$1 AND locked_by=$2`, [eventId, workerId]);
}

export async function markSyncOutboxFailed(pool: Pool, event: ClaimedSyncOutboxEvent, workerId: string, error: unknown): Promise<void> {
  const message = error instanceof Error ? error.message : "Unknown Cloud sync failure";
  await pool.query(`UPDATE sync_outbox SET status='FAILED', locked_at=NULL, locked_by=NULL, error_message=$3, next_attempt_at=NOW()+($4 * INTERVAL '1 second') WHERE id=$1 AND locked_by=$2`, [event.id, workerId, message.slice(0, 1_000), retryDelaySeconds(event.attempts)]);
}

export async function processOneSyncOutboxEvent(pool: Pool, workerId: string, transport: SyncOutboxTransport): Promise<boolean> {
  const event = await claimNextSyncOutboxEvent(pool, workerId);
  if (!event) return false;
  try { await transport.deliver(event); await markSyncOutboxDelivered(pool, event.id, workerId); }
  catch (error) { await markSyncOutboxFailed(pool, event, workerId, error); }
  return true;
}