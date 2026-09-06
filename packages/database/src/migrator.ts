import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Pool, PoolClient } from "pg";

type Queryable = Pool | PoolClient;

export interface Migration {
  readonly version: string;
  readonly filename: string;
  readonly checksum: string;
  readonly sql: string;
}

export interface MigratorPaths {
  readonly initialDdlPath: string;
  readonly migrationsDirectory: string;
}

const moduleDirectory = dirname(fileURLToPath(import.meta.url));

function sha256(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

export function discoverRepositoryRoot(from = process.cwd()): string {
  let current = resolve(from);
  while (!existsSync(join(current, "pnpm-workspace.yaml"))) {
    const parent = dirname(current);
    if (parent === current) {
      throw new Error("Could not locate pnpm-workspace.yaml from the current directory.");
    }
    current = parent;
  }
  return current;
}

export function defaultMigratorPaths(repositoryRoot = discoverRepositoryRoot(moduleDirectory)): MigratorPaths {
  return {
    initialDdlPath: join(repositoryRoot, "bd", "sql", "initial-ddl.sql"),
    migrationsDirectory: join(repositoryRoot, "infra", "db", "migrations"),
  };
}

export function loadMigrations(directory: string): Migration[] {
  return readdirSync(directory)
    .filter((filename) => /^\d{4}_[a-z0-9_]+\.sql$/.test(filename))
    .sort()
    .map((filename) => {
      const sql = readFileSync(join(directory, filename), "utf8");
      return {
        version: filename.slice(0, 4),
        filename,
        checksum: sha256(sql),
        sql,
      };
    });
}

async function ensureMigrationLedger(database: Queryable): Promise<void> {
  await database.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version VARCHAR(100) PRIMARY KEY,
      filename TEXT NOT NULL,
      checksum CHAR(64) NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function schemaExists(database: Queryable): Promise<boolean> {
  const result = await database.query<{ exists: string | null }>(
    "SELECT to_regclass('public.companies') AS exists",
  );
  return result.rows[0]?.exists !== null;
}

async function baselineInitialDdl(database: Queryable, initialDdlPath: string): Promise<void> {
  const ddl = readFileSync(initialDdlPath, "utf8");
  const checksum = sha256(ddl);
  const previous = await database.query<{ checksum: string }>(
    "SELECT checksum FROM schema_migrations WHERE version = $1",
    ["0000"],
  );

  if (previous.rowCount === 1) {
    if (previous.rows[0]?.checksum !== checksum) {
      throw new Error("The applied initial DDL was modified. Restore its original contents instead of rewriting history.");
    }
    return;
  }

  if (await schemaExists(database)) {
    throw new Error(
      "Database tables already exist without a migration baseline. Do not guess their version; baseline it explicitly after review.",
    );
  }

  await database.query(ddl);
  await ensureMigrationLedger(database);
  await database.query(
    "INSERT INTO schema_migrations(version, filename, checksum) VALUES ($1, $2, $3)",
    ["0000", "initial-ddl.sql", checksum],
  );
}

export async function migrate(pool: Pool, paths = defaultMigratorPaths()): Promise<readonly string[]> {
  if (!existsSync(paths.initialDdlPath)) {
    throw new Error(`Initial DDL not found: ${paths.initialDdlPath}`);
  }
  if (!existsSync(paths.migrationsDirectory)) {
    throw new Error(`Migration directory not found: ${paths.migrationsDirectory}`);
  }

  const client = await pool.connect();
  try {
    await client.query("SELECT pg_advisory_lock(hashtext($1))", ["don_juan_schema_migrations"]);
    await ensureMigrationLedger(client);
    await baselineInitialDdl(client, paths.initialDdlPath);

    const migrations = loadMigrations(paths.migrationsDirectory);
    const applied = await client.query<{ version: string; checksum: string }>(
      "SELECT version, checksum FROM schema_migrations",
    );
    const known = new Map(applied.rows.map((migration) => [migration.version, migration.checksum]));
    const executed: string[] = [];

    for (const migration of migrations) {
      const existing = known.get(migration.version);
      if (existing !== undefined) {
        if (existing !== migration.checksum) {
          throw new Error(`Checksum mismatch for applied migration ${migration.filename}.`);
        }
        continue;
      }

      try {
        await client.query("BEGIN");
        await client.query(migration.sql);
        await client.query(
          "INSERT INTO schema_migrations(version, filename, checksum) VALUES ($1, $2, $3)",
          [migration.version, migration.filename, migration.checksum],
        );
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
      executed.push(migration.filename);
    }

    return executed;
  } finally {
    await client.query("SELECT pg_advisory_unlock(hashtext($1))", ["don_juan_schema_migrations"]);
    client.release();
  }
}
