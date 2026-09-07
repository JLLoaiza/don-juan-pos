import { createHmac, createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { AuthContext, AuthenticatedContext, LoginRequest } from "@don-juan/contracts";
import { uuidv7 } from "@don-juan/domain";
import { one, withTransaction } from "@don-juan/database";
import type { Pool, PoolClient } from "pg";

export class AuthFailure extends Error { constructor() { super("Authentication failed"); } }
export class AccessDenied extends Error { constructor(message = "Branch access denied") { super(message); } }
export interface AuthService {
  login(input: LoginRequest): Promise<AuthenticatedContext>;
  refresh(refreshToken: string): Promise<AuthenticatedContext>;
  context(accessToken: string): Promise<AuthContext>;
  setActiveBranch(accessToken: string, branchId: string): Promise<AuthContext>;
}
interface Claims { sub: string; sid: string; exp: number; }
interface SessionRow { id: string; user_id: string; active_branch_id: string | null; refresh_expires_at: Date; revoked_at: Date | null; user_active: boolean; company_active: boolean; }
const accessLifetimeSeconds = 15 * 60;
const refreshLifetimeMs = 30 * 24 * 60 * 60 * 1000;
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const b64 = (value: string | Buffer) => Buffer.from(value).toString("base64url");

export function createSqlAuthService(pool: Pool, secret: string, now = () => new Date()): AuthService {
  if (secret.length < 32) throw new Error("AUTH_JWT_SECRET must contain at least 32 characters.");
  const sign = (value: string) => createHmac("sha256", secret).update(value).digest("base64url");
  const issueAccess = (sessionId: string, userId: string) => {
    const exp = Math.floor(now().getTime() / 1000) + accessLifetimeSeconds;
    const header = b64(JSON.stringify({ alg: "HS256", typ: "JWT" }));
    const body = b64(JSON.stringify({ sub: userId, sid: sessionId, exp }));
    return { token: `${header}.${body}.${sign(`${header}.${body}`)}`, expiresAt: new Date(exp * 1000) };
  };
  const claims = (token: string): Claims => {
    const [header, body, signature, extra] = token.split(".");
    if (!header || !body || !signature || extra) throw new AuthFailure();
    const expected = sign(`${header}.${body}`);
    if (signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) throw new AuthFailure();
    try {
      const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Claims;
      if (!parsed.sub || !parsed.sid || !Number.isInteger(parsed.exp) || parsed.exp <= Math.floor(now().getTime() / 1000)) throw new AuthFailure();
      return parsed;
    } catch { throw new AuthFailure(); }
  };
  const activeSession = async (client: Pool | PoolClient, sessionId: string, userId: string): Promise<SessionRow> => {
    const row = await one<SessionRow>(client, `SELECT s.id, s.user_id, s.active_branch_id, s.refresh_expires_at, s.revoked_at,
      u.active AS user_active, c.active AS company_active
      FROM auth_sessions s JOIN users u ON u.id=s.user_id JOIN companies c ON c.id=u.company_id
      WHERE s.id=$1 AND s.user_id=$2`, [sessionId, userId]);
    if (!row || row.revoked_at || !row.user_active || !row.company_active) throw new AuthFailure();
    return row;
  };
  const loadContext = async (client: Pool | PoolClient, userId: string, activeBranchId: string | null): Promise<AuthContext> => {
    const identity = await one<{ user_id: string; display_name: string; company_id: string }>(client,
      `SELECT u.id user_id,u.display_name,u.company_id FROM users u JOIN companies c ON c.id=u.company_id WHERE u.id=$1 AND u.active AND c.active`, [userId]);
    if (!identity) throw new AuthFailure();
    const branches = (await client.query<{ id:string;name:string;code:string;settings:Record<string,unknown> }>(
      `SELECT b.id,b.name,b.code,COALESCE(bs.settings,'{}'::jsonb) settings FROM user_branch_access uba JOIN branches b ON b.id=uba.branch_id AND b.company_id=$2 LEFT JOIN branch_settings bs ON bs.branch_id=b.id WHERE uba.user_id=$1 AND b.active ORDER BY b.name`, [userId, identity.company_id])).rows;
    if (!branches.length) throw new AccessDenied("No active branches are assigned to this user");
    const active = branches.find((branch) => branch.id === activeBranchId) ?? (branches.length === 1 ? branches[0] : undefined);
    const permissions = active ? (await client.query<{ key:string }>(
      `SELECT DISTINCT p.key FROM user_roles ur JOIN roles r ON r.id=ur.role_id AND r.active JOIN role_permissions rp ON rp.role_id=r.id JOIN permissions p ON p.id=rp.permission_id WHERE ur.user_id=$1 AND (ur.branch_id IS NULL OR ur.branch_id=$2) ORDER BY p.key`, [userId, active.id])).rows.map((row) => row.key) : [];
    return { user: { id: identity.user_id, displayName: identity.display_name }, branches, activeBranch: active ?? null, permissions };
  };
  const materialize = async (client: Pool | PoolClient, session: SessionRow, refreshToken: string): Promise<AuthenticatedContext> => {
    const context = await loadContext(client, session.user_id, session.active_branch_id);
    const access = issueAccess(session.id, session.user_id);
    return { ...context, session: { accessToken: access.token, accessTokenExpiresAt: access.expiresAt.toISOString(), refreshToken, refreshTokenExpiresAt: session.refresh_expires_at.toISOString() } };
  };
  return {
    async login(input) { return withTransaction(pool, async (client) => {
      const users = await client.query<{ id: string }>(`SELECT u.id FROM users u JOIN companies c ON c.id=u.company_id WHERE u.username=$1 AND u.active AND c.active AND u.password_hash = crypt($2,u.password_hash) FOR UPDATE`, [input.username, input.password]);
      if (users.rowCount !== 1 || !users.rows[0]) throw new AuthFailure();
      const user = users.rows[0];
      const sessionId = uuidv7(); const refreshSecret = b64(randomBytes(32)); const refreshToken = `${sessionId}.${refreshSecret}`; const expiry = new Date(now().getTime() + refreshLifetimeMs);
      await client.query(`INSERT INTO auth_sessions(id,user_id,active_branch_id,refresh_token_hash,refresh_expires_at) VALUES($1,$2,NULL,$3,$4)`, [sessionId,user.id,hash(refreshToken),expiry]);
      await client.query("UPDATE users SET last_login_at=NOW() WHERE id=$1", [user.id]);
      const session = await activeSession(client, sessionId, user.id);
      const context = await loadContext(client, user.id, null);
      if (context.activeBranch) await client.query("UPDATE auth_sessions SET active_branch_id=$2 WHERE id=$1", [session.id, context.activeBranch.id]);
      const access = issueAccess(session.id, user.id);
      return { ...context, session: { accessToken: access.token, accessTokenExpiresAt: access.expiresAt.toISOString(), refreshToken, refreshTokenExpiresAt: session.refresh_expires_at.toISOString() } };
    }); },
    async refresh(refreshToken) { const [sessionId, opaque, extra] = refreshToken.split("."); if (!sessionId || !opaque || extra) throw new AuthFailure(); return withTransaction(pool, async (client) => {
      const session = await one<SessionRow & { refresh_token_hash:string }>(client, `SELECT s.id,s.user_id,s.active_branch_id,s.refresh_expires_at,s.revoked_at,s.refresh_token_hash,u.active user_active,c.active company_active FROM auth_sessions s JOIN users u ON u.id=s.user_id JOIN companies c ON c.id=u.company_id WHERE s.id=$1 FOR UPDATE`, [sessionId]);
      if (!session || session.revoked_at || !session.user_active || !session.company_active || session.refresh_expires_at <= now() || session.refresh_token_hash !== hash(refreshToken)) throw new AuthFailure();
      const next = `${session.id}.${b64(randomBytes(32))}`; const expiry = new Date(now().getTime()+refreshLifetimeMs);
      await client.query("UPDATE auth_sessions SET refresh_token_hash=$2, refresh_expires_at=$3, rotated_at=NOW(), last_used_at=NOW() WHERE id=$1", [session.id,hash(next),expiry]);
      return materialize(client, { ...session, refresh_expires_at: expiry }, next);
    }); },
    async context(accessToken) { const token = claims(accessToken); const session = await activeSession(pool, token.sid, token.sub); return loadContext(pool, session.user_id, session.active_branch_id); },
    async setActiveBranch(accessToken, branchId) { const token = claims(accessToken); return withTransaction(pool, async (client) => { const session=await activeSession(client,token.sid,token.sub); const access=await one(client,"SELECT 1 FROM user_branch_access uba JOIN users u ON u.id=uba.user_id JOIN branches b ON b.id=uba.branch_id AND b.company_id=u.company_id WHERE uba.user_id=$1 AND uba.branch_id=$2 AND b.active",[session.user_id,branchId]); if(!access) throw new AccessDenied(); await client.query("UPDATE auth_sessions SET active_branch_id=$2,last_used_at=NOW() WHERE id=$1",[session.id,branchId]); return loadContext(client,session.user_id,branchId); }); },
  };
}
