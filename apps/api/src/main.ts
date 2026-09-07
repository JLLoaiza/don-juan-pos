import { asDatabaseHealth, createPool } from "@don-juan/database";
import { buildApi } from "./app.js";
import { createSqlAuthService } from "./auth.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required.");
const authSecret = process.env.AUTH_JWT_SECRET;
if (!authSecret) throw new Error("AUTH_JWT_SECRET is required.");
const port = Number(process.env.API_PORT ?? "3000"); const host = process.env.API_HOST ?? "0.0.0.0";
const corsOrigins = (process.env.CORS_ORIGINS ?? "http://localhost:5173").split(",").map((origin) => origin.trim()).filter(Boolean);
const pool = createPool(databaseUrl);
const app = buildApi({ database: asDatabaseHealth(pool), auth: createSqlAuthService(pool, authSecret), corsOrigins });
const close = async (): Promise<void> => { await app.close(); await pool.end(); };
process.once("SIGINT", () => void close()); process.once("SIGTERM", () => void close());
await app.listen({ host, port });
