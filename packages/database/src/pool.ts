import { Pool, type PoolClient, type QueryResultRow } from "pg";

export function createPool(connectionString: string): Pool {
  return new Pool({ connectionString, max: 10 });
}

export async function withTransaction<T>(
  pool: Pool,
  action: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await action(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export interface DatabaseHealth {
  check(): Promise<void>;
}

export function asDatabaseHealth(pool: Pool): DatabaseHealth {
  return {
    async check(): Promise<void> {
      await pool.query("SELECT 1");
    },
  };
}

export async function one<Row extends QueryResultRow>(
  client: Pool | PoolClient,
  text: string,
  values: readonly unknown[] = [],
): Promise<Row | undefined> {
  const result = await client.query<Row>(text, Array.from(values));
  return result.rows[0];
}
