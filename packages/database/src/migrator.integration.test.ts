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
      "0009_identity_access.sql",
      "0010_identity_initial_data.sql",
      "0011_development_identity_seed.sql",
      "0012_catalog_integrity_and_commands.sql",
      "0013_floor_consumption_integrity.sql",
      "0014_floor_trigger_record_safety.sql",
      "0015_floor_trigger_complete_record_safety.sql",
      "0016_payments_and_cash_integrity.sql",
      "0017_billing_discount_integrity.sql",
      "0018_cash_close_integrity.sql",
      "0019_procurement_integrity.sql",
      "0020_development_cash_seed.sql",
      "0021_workforce_integrity.sql",
      "0022_procurement_void_integrity.sql",
      "0023_workforce_payment_void_integrity.sql",
      "0024_sync_protocol_core.sql",
      "0025_workforce_date_response_repair.sql",
      "0026_sync_push_conflicts.sql",
      "0027_local_first_edge_replication.sql",
      "0028_reports_permissions.sql",
      "0029_restaurant_table_status_concurrency.sql",
    ]);

    const integrity = await pool.query<{ index_exists: string | null; version_exists: string | null }>(`
      SELECT
        to_regclass('public.ux_accounts_one_open_account_per_table') AS index_exists,
        to_regclass('public.printers') AS version_exists,
        (SELECT version::text FROM restaurant_tables LIMIT 1) AS table_version
    `);
    expect(integrity.rows[0]).toEqual({
      index_exists: "ux_accounts_one_open_account_per_table",
      version_exists: "printers",
      table_version: null,
    });
    await expect(migrate(pool)).resolves.toEqual([]);
  });
});
