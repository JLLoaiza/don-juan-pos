import { createPool } from "./pool.js";
import { migrate } from "./migrator.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required.");
}

const pool = createPool(databaseUrl);
try {
  const applied = await migrate(pool);
  console.log(applied.length === 0 ? "Database is current." : `Applied: ${applied.join(", ")}`);
} finally {
  await pool.end();
}

