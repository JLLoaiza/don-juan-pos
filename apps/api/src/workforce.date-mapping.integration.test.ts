import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool, types } from "pg";
import { WorkforceService } from "./workforce.js";

const databaseUrl = process.env.DATABASE_URL_TEST;
const describeIntegration = databaseUrl ? describe : describe.skip;

describeIntegration("workforce DATE response mapping", () => {
  let pool: Pool; let service: WorkforceService; let restoreDateParser: (value: string) => unknown;
  const companyId = randomUUID(); const branchId = randomUUID(); const userId = randomUUID(); const actor = { userId, branchId };
  let employeeId = ""; let cashMethodId = ""; let sessionId = "";

  beforeAll(async () => {
    restoreDateParser = types.getTypeParser(1082, "text");
    types.setTypeParser(1082, (value) => new Date(`${value}T00:00:00.000Z`));
    pool = new Pool({ connectionString: databaseUrl }); service = new WorkforceService(pool);
    await pool.query("INSERT INTO companies(id,name,currency,timezone) VALUES($1,$2,'COP','America/Bogota')", [companyId, `Date mapper ${companyId}`]);
    await pool.query("INSERT INTO branches(id,company_id,name,code) VALUES($1,$2,'Date mapper',$3)", [branchId, companyId, `D-${companyId}`]);
    await pool.query("INSERT INTO users(id,company_id,username,password_hash,display_name) VALUES($1,$2,$3,crypt('x',gen_salt('bf',4)),'Date mapper')", [userId, companyId, `date-${companyId}`]);
    await pool.query("INSERT INTO user_branch_access(user_id,branch_id) VALUES($1,$2)", [userId, branchId]);
    employeeId = (await service.createEmployee(actor, randomUUID(), { firstName: "Ana", lastName: "Díaz" })).id;
    const registerId = randomUUID(); cashMethodId = randomUUID(); sessionId = randomUUID();
    await pool.query("INSERT INTO cash_registers(id,branch_id,name) VALUES($1,$2,'Principal')", [registerId, branchId]);
    await pool.query("INSERT INTO payment_methods(id,branch_id,name,type) VALUES($1,$2,'Cash','CASH')", [cashMethodId, branchId]);
    await pool.query("INSERT INTO cash_sessions(id,cash_register_id,opened_by_user_id,opening_amount) VALUES($1,$2,$3,1000)", [sessionId, registerId, userId]);
  });
  afterAll(async () => { await pool.end(); types.setTypeParser(1082, restoreDateParser); });

  it("returns YYYY-MM-DD for every PostgreSQL DATE response and preserves it on an idempotent retry", async () => {
    const paymentDate = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Bogota",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    const rate = await service.createWageRate(actor, randomUUID(), { employeeId, startTime: "08:00", endTime: "23:59", hourlyRate: "100", effectiveFrom: "2026-09-07" });
    expect(rate.effectiveFrom).toBe("2026-09-07");
    expect((await service.wageRates(actor, employeeId)).wageRates[0]?.effectiveFrom).toBe("2026-09-07");

    const clockInOperation = randomUUID();
    const opened = await service.clockIn(actor, clockInOperation, { employeeId, clockIn: "2026-09-07T14:00:00.000Z" });
    expect(opened.workDate).toBe("2026-09-07");
    expect(await service.clockIn(actor, clockInOperation, { employeeId, clockIn: "2026-09-07T14:00:00.000Z" })).toEqual(opened);

    const completed = await service.clockOut(actor, randomUUID(), opened.id, { clockOut: "2026-09-07T16:00:00.000Z" });
    expect(completed.workDate).toBe("2026-09-07");
    const createdBonus = await service.createBonus(actor, randomUUID(), { employeeId, shiftId: opened.id, bonusDate: "2026-09-07", amount: "10" });
    expect(createdBonus.bonusDate).toBe("2026-09-07");
    expect((await service.bonuses(actor)).bonuses[0]?.bonusDate).toBe("2026-09-07");

    const paid = await service.payShift(actor, randomUUID(), completed.id, { bonusIds: [createdBonus.id], paymentMethodId: cashMethodId, cashSessionId: sessionId });
    expect(paid.paymentDate).toBe(paymentDate);
    expect((await service.payments(actor)).payments[0]?.paymentDate).toBe(paymentDate);
  });
});
