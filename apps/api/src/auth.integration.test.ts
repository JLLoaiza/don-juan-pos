import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { AccessDenied, createSqlAuthService } from "./auth.js";

const databaseUrl = process.env.DATABASE_URL_TEST;
const describeIntegration = databaseUrl ? describe : describe.skip;

describeIntegration("identity branch context", () => {
  let pool: Pool;
  let auth: ReturnType<typeof createSqlAuthService>;
  const suffix = randomUUID();
  const companyA = randomUUID(); const companyB = randomUUID();
  const singleUser = randomUUID(); const multiUser = randomUUID();
  const singleBranch = randomUUID(); const firstBranch = randomUUID(); const secondBranch = randomUUID();
  const sameCompanyWithoutAccess = randomUUID(); const otherCompanyBranch = randomUUID();
  const singleUsername = `single-${suffix}`; const multiUsername = `multi-${suffix}`;

  beforeAll(async () => {
    pool = new Pool({ connectionString: databaseUrl });
    auth = createSqlAuthService(pool, "integration-test-secret-with-at-least-thirty-two-characters");
    await pool.query("INSERT INTO companies(id,name,currency,timezone) VALUES($1,$2,'COP','America/Bogota'),($3,$4,'COP','America/Bogota')", [companyA, `Company A ${suffix}`, companyB, `Company B ${suffix}`]);
    await pool.query("INSERT INTO branches(id,company_id,name,code) VALUES($1,$2,'Single',$3),($4,$2,'First',$5),($6,$2,'Second',$7),($8,$2,'No access',$9),($10,$11,'Other company',$12)", [singleBranch, companyA, `S-${suffix}`, firstBranch, `F-${suffix}`, secondBranch, `M-${suffix}`, sameCompanyWithoutAccess, `N-${suffix}`, otherCompanyBranch, companyB, `O-${suffix}`]);
    await pool.query("INSERT INTO users(id,company_id,username,password_hash,display_name) VALUES($1,$2,$3,crypt($4,gen_salt('bf',4)),$3),($5,$2,$6,crypt($7,gen_salt('bf',4)),$6)", [singleUser, companyA, singleUsername, "single-secret", multiUser, multiUsername, "multi-secret"]);
    await pool.query("INSERT INTO user_branch_access(user_id,branch_id) VALUES($1,$2),($3,$4),($3,$5)", [singleUser, singleBranch, multiUser, firstBranch, secondBranch]);
  });

  afterAll(async () => {
    await pool.query("DELETE FROM auth_sessions WHERE user_id = ANY($1::uuid[])", [[singleUser, multiUser]]);
    await pool.query("DELETE FROM user_branch_access WHERE user_id = ANY($1::uuid[])", [[singleUser, multiUser]]);
    await pool.query("DELETE FROM users WHERE id = ANY($1::uuid[])", [[singleUser, multiUser]]);
    await pool.query("DELETE FROM branches WHERE id = ANY($1::uuid[])", [[singleBranch, firstBranch, secondBranch, sameCompanyWithoutAccess, otherCompanyBranch]]);
    await pool.query("DELETE FROM companies WHERE id = ANY($1::uuid[])", [[companyA, companyB]]);
    await pool.end();
  });

  it("automatically selects the sole accessible branch without a company id", async () => {
    const context = await auth.login({ username: singleUsername, password: "single-secret" });
    expect(context.branches.map((branch) => branch.id)).toEqual([singleBranch]);
    expect(context.activeBranch?.id).toBe(singleBranch);
    expect(context).not.toHaveProperty("company");

  });

  it("leaves a multi-branch user to choose a branch", async () => {
    const context = await auth.login({ username: multiUsername, password: "multi-secret" });
    expect(context.activeBranch).toBeNull();
    expect(context.branches.map((branch) => branch.id).sort()).toEqual([firstBranch, secondBranch].sort());
    await expect(auth.setActiveBranch(context.session.accessToken, secondBranch)).resolves.toMatchObject({ activeBranch: { id: secondBranch } });
  });

  it("rejects a branch belonging to another company", async () => {
    const context = await auth.login({ username: multiUsername, password: "multi-secret" });
    await expect(auth.setActiveBranch(context.session.accessToken, otherCompanyBranch)).rejects.toBeInstanceOf(AccessDenied);
  });

  it("rejects a same-company branch not assigned to the user", async () => {
    const context = await auth.login({ username: multiUsername, password: "multi-secret" });
    await expect(auth.setActiveBranch(context.session.accessToken, sameCompanyWithoutAccess)).rejects.toBeInstanceOf(AccessDenied);
  });
});

