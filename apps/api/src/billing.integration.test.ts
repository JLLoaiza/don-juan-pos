import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { BillingService } from "./billing.js";

const databaseUrl = process.env.DATABASE_URL_TEST;
const describeIntegration = databaseUrl ? describe : describe.skip;

describeIntegration("billing payment transaction", () => {
  let pool: Pool;
  let billing: BillingService;
  const companyId = randomUUID(); const branchId = randomUUID(); const userId = randomUUID();
  const actor = { userId, branchId };
  let cashRegisterId = ""; let cashMethodId = ""; let accountId = "";

  beforeAll(async () => {
    pool = new Pool({ connectionString: databaseUrl }); billing = new BillingService(pool);
    await pool.query("INSERT INTO companies(id,name,currency,timezone) VALUES($1,$2,'COP','America/Bogota')", [companyId, `Billing ${companyId}`]);
    await pool.query("INSERT INTO branches(id,company_id,name,code) VALUES($1,$2,'Billing',$3)", [branchId, companyId, `B-${companyId}`]);
    await pool.query("INSERT INTO users(id,company_id,username,password_hash,display_name) VALUES($1,$2,$3,crypt('x',gen_salt('bf',4)),'Billing')", [userId, companyId, `billing-${companyId}`]);
    await pool.query("INSERT INTO user_branch_access(user_id,branch_id) VALUES($1,$2)", [userId, branchId]);
    cashRegisterId = randomUUID(); cashMethodId = randomUUID(); accountId = randomUUID();
    await pool.query("INSERT INTO cash_registers(id,branch_id,name) VALUES($1,$2,'Principal')", [cashRegisterId, branchId]);
    await pool.query("INSERT INTO payment_methods(id,branch_id,name,type) VALUES($1,$2,'Efectivo','CASH')", [cashMethodId, branchId]);
    await pool.query("INSERT INTO accounts(id,branch_id,opened_by_user_id,subtotal,total) VALUES($1,$2,$3,20,20)", [accountId, branchId, userId]);
  });

  it("opens a session and commits one cash payment, movement, account close and outbox atomically", async () => {
    const session = await billing.openCashSession(actor, randomUUID(), { cashRegisterId, openingAmount: "100", notes: null });
    const operationId = randomUUID();
    const input = { expectedVersion: 1, paymentMethodId: cashMethodId, accountSplitId: null, amountApplied: "20", cashReceived: "25", cashSessionId: session.id, reference: null, notes: null, printReceipt: true };
    const result = await billing.registerPayment(actor, operationId, accountId, input);
    const replay = await billing.registerPayment(actor, operationId, accountId, input);
    expect(replay).toEqual(result);
    expect(result).toMatchObject({ status: "REGISTERED", amountApplied: "20.00", cashReceived: "25.00", changeAmount: "5.00", cashSessionId: session.id, paymentMethodName: "Efectivo" });
    const consistency = await pool.query(`SELECT
      (SELECT status FROM accounts WHERE id=$1) account_status,
      (SELECT count(*)::int FROM payments WHERE account_id=$1) payment_count,
      (SELECT amount FROM cash_movements WHERE payment_id=$2) cash_sale,
      (SELECT status FROM print_jobs WHERE reference_id=$2) receipt_status,
      (SELECT count(*)::int FROM sync_outbox WHERE operation_id=$3) outbox_count`, [accountId, result.id, operationId]);
    expect(consistency.rows[0]).toEqual({ account_status: "PAID", payment_count: 1, cash_sale: "20.00", receipt_status: "FAILED", outbox_count: 1 });
  });
});
