import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Pool } from "pg";
import { withTransaction } from "@don-juan/database";
import { retryDelaySeconds } from "./backoff.js";

export interface ClaimedPrintJob {
  readonly id: string;
  readonly printerId: string | null;
  readonly payload: unknown;
  readonly attempts: number;
}

export interface PrintAdapter {
  print(job: ClaimedPrintJob): Promise<void>;
}

/** Development adapter. Production adapters belong behind the same interface. */
export class FilePrintAdapter implements PrintAdapter {
  public constructor(private readonly outputDirectory: string) {}

  public async print(job: ClaimedPrintJob): Promise<void> {
    if (!job.printerId) throw new Error("No active printer was assigned to this print job.");
    await mkdir(this.outputDirectory, { recursive: true });
    await writeFile(join(this.outputDirectory, `${job.id}.json`), JSON.stringify(job.payload), "utf8");
  }
}

export async function claimNextPrintJob(pool: Pool, workerId: string): Promise<ClaimedPrintJob | undefined> {
  return withTransaction(pool, async (client) => {
    const result = await client.query<ClaimedPrintJob>(`
      WITH candidate AS (
        SELECT id
        FROM print_jobs
        WHERE status IN ('PENDING', 'FAILED')
          AND locked_at IS NULL
          AND next_attempt_at <= NOW()
        ORDER BY created_at
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      )
      UPDATE print_jobs job
      SET locked_at = NOW(),
          locked_by = $1,
          attempts = job.attempts + 1
      FROM candidate
      WHERE job.id = candidate.id
      RETURNING job.id, job.printer_id AS "printerId", job.payload, job.attempts
    `, [workerId]);
    return result.rows[0];
  });
}

export async function markPrintSucceeded(pool: Pool, jobId: string, workerId: string): Promise<void> {
  await pool.query(`
    UPDATE print_jobs
    SET status = 'PRINTED', printed_at = NOW(), locked_at = NULL, locked_by = NULL, error_message = NULL
    WHERE id = $1 AND locked_by = $2
  `, [jobId, workerId]);
}

export async function markPrintFailed(pool: Pool, job: ClaimedPrintJob, workerId: string, error: unknown): Promise<void> {
  const message = error instanceof Error ? error.message : "Unknown print failure";
  await pool.query(`
    UPDATE print_jobs
    SET status = 'FAILED',
        locked_at = NULL,
        locked_by = NULL,
        error_message = $3,
        next_attempt_at = NOW() + ($4 * INTERVAL '1 second')
    WHERE id = $1 AND locked_by = $2
  `, [job.id, workerId, message.slice(0, 1000), retryDelaySeconds(job.attempts)]);
}

export async function processOnePrintJob(pool: Pool, workerId: string, adapter: PrintAdapter): Promise<boolean> {
  const job = await claimNextPrintJob(pool, workerId);
  if (!job) return false;
  try {
    await adapter.print(job);
    await markPrintSucceeded(pool, job.id, workerId);
  } catch (error) {
    await markPrintFailed(pool, job, workerId, error);
  }
  return true;
}

