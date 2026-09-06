import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { migrate } from "./migrator.js";

const testDatabaseUrl = process.env.DATABASE_URL_TEST;
const describeIntegration = testDatabaseUrl ? describe : describe.skip;

describeIntegration("PostgreSQL migrations", () => {
  let pool: Pool;

  beforeAll(async () => {
    pool = new Pool({ connectionString: testDatabaseUrl });
  });

  afterAll(async () => {
    await pool.end();
  });

  it("initializes an empty database and is idempotent", async () => {
    const applied = await migrate(pool);
    expect(applied).toEqual([
      "0001_domain_lifecycle_types.sql",
      "0002_accounts_integrity.sql",
      "0003_printing_model.sql",
      "0007_sync_operation_model.sql",
      "0008_concurrency_revisions.sql",
    ]);

    const integrity = await pool.query<{ index_exists: string | null; version_exists: string | null }>(`
      SELECT
        to_regclass('public.ux_accounts_one_open_account_per_table') AS index_exists,
        to_regclass('public.printers') AS version_exists
    `);
    expect(integrity.rows[0]).toEqual({
      index_exists: "ux_accounts_one_open_account_per_table",
      version_exists: "printers",
    });
    await expect(migrate(pool)).resolves.toEqual([]);
  });
});
