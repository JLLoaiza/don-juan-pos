import { createPool } from "@don-juan/database";
import { FilePrintAdapter, processOnePrintJob } from "./print-worker.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required.");

const workerId = process.env.WORKER_ID ?? `worker-${process.pid}`;
const intervalMs = Number(process.env.WORKER_POLL_INTERVAL_MS ?? "1000");
const printDirectory = process.env.PRINT_SINK_DIRECTORY ?? ".runtime/prints";
const pool = createPool(databaseUrl);
const adapter = new FilePrintAdapter(printDirectory);
let stopping = false;

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    stopping = true;
  });
}

while (!stopping) {
  const didWork = await processOnePrintJob(pool, workerId, adapter);
  if (!didWork) await new Promise((resolve) => setTimeout(resolve, intervalMs));
}

await pool.end();

