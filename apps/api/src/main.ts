import { asDatabaseHealth, createPool } from "@don-juan/database";
import { buildApi } from "./app.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required.");

const port = Number(process.env.API_PORT ?? "3000");
const host = process.env.API_HOST ?? "0.0.0.0";
const pool = createPool(databaseUrl);
const app = buildApi({ database: asDatabaseHealth(pool) });

const close = async (): Promise<void> => {
  await app.close();
  await pool.end();
};

process.once("SIGINT", () => void close());
process.once("SIGTERM", () => void close());

await app.listen({ host, port });

