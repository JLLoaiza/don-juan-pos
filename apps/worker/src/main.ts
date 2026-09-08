import { createPool } from "@don-juan/database";
import { FilePrintAdapter, processOnePrintJob } from "./print-worker.js";
import { HttpSyncOutboxTransport, processOneSyncOutboxEvent } from "./sync-worker.js";
import { CloudIdentitySyncTransport } from "./identity-sync-worker.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required.");
const serverRole = process.env.SERVER_ROLE ?? "edge";
if (serverRole !== "edge" && serverRole !== "cloud") throw new Error("SERVER_ROLE must be edge or cloud.");
const workerId = process.env.WORKER_ID ?? `worker-${process.pid}`;
const intervalMs = Number(process.env.WORKER_POLL_INTERVAL_MS ?? "1000");
const printDirectory = process.env.PRINT_SINK_DIRECTORY ?? ".runtime/prints";
const cloudSyncUrl = process.env.CLOUD_SYNC_URL; const cloudIdentityUrl = process.env.CLOUD_IDENTITY_SYNC_URL; const cloudSyncToken = process.env.EDGE_SERVER_TOKEN; const edgeServerId = process.env.EDGE_SERVER_ID; const localIdentityApplyUrl = process.env.EDGE_IDENTITY_APPLY_URL ?? "http://127.0.0.1:3000/replication/edge/identity-snapshot"; const internalReplicationSecret = process.env.EDGE_INTERNAL_REPLICATION_SECRET; const identityPollMs = Number(process.env.IDENTITY_SYNC_POLL_INTERVAL_MS ?? "60000");
if (serverRole === "edge" && [cloudSyncUrl, cloudSyncToken, edgeServerId].some((value) => Boolean(value)) && !(cloudSyncUrl && cloudSyncToken && edgeServerId)) throw new Error("CLOUD_SYNC_URL, EDGE_SERVER_ID, and EDGE_SERVER_TOKEN must be configured together.");
if (serverRole === "edge" && [cloudIdentityUrl, cloudSyncToken, edgeServerId, internalReplicationSecret].some((value) => Boolean(value)) && !(cloudIdentityUrl && cloudSyncToken && edgeServerId && internalReplicationSecret)) throw new Error("CLOUD_IDENTITY_SYNC_URL, EDGE_SERVER_ID, EDGE_SERVER_TOKEN, and EDGE_INTERNAL_REPLICATION_SECRET must be configured together.");
const pool = createPool(databaseUrl);
const adapter = new FilePrintAdapter(printDirectory);
const syncTransport = serverRole === "edge" && cloudSyncUrl && cloudSyncToken && edgeServerId ? new HttpSyncOutboxTransport(cloudSyncUrl, edgeServerId, cloudSyncToken) : undefined;
const identityTransport = serverRole === "edge" && cloudIdentityUrl && cloudSyncToken && edgeServerId && internalReplicationSecret ? new CloudIdentitySyncTransport(cloudIdentityUrl, edgeServerId, cloudSyncToken, localIdentityApplyUrl, internalReplicationSecret) : undefined;
let nextIdentitySyncAt = 0;
let stopping = false;
for (const signal of ["SIGINT", "SIGTERM"] as const) process.once(signal, () => { stopping = true; });
while (!stopping) {
  const didPrintWork = serverRole === "edge" ? await processOnePrintJob(pool, workerId, adapter) : false;
  const didSyncWork = syncTransport ? await processOneSyncOutboxEvent(pool, workerId, syncTransport) : false;
  if (identityTransport && Date.now() >= nextIdentitySyncAt) { try { await identityTransport.synchronize(); } catch { /* WAN or Cloud failure never blocks local operation. */ } nextIdentitySyncAt = Date.now() + identityPollMs; }
  if (!didPrintWork && !didSyncWork) await new Promise((resolve) => setTimeout(resolve, intervalMs));
}
await pool.end();