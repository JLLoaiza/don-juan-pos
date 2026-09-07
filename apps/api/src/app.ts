import Fastify, { type FastifyInstance } from "fastify";
import { AuthenticatedContextSchema, AuthContextSchema, HealthResponseSchema, LoginRequestSchema, RefreshRequestSchema, SetActiveBranchRequestSchema, type HealthResponse } from "@don-juan/contracts";
import type { DatabaseHealth } from "@don-juan/database";
import { AccessDenied, AuthFailure, type AuthService } from "./auth.js";

export interface ApiDependencies {
  readonly database: DatabaseHealth;
  readonly auth?: AuthService;
  readonly clock?: () => Date;
  readonly corsOrigins?: readonly string[];
}
function bearer(value: string | undefined): string { if (!value?.startsWith("Bearer ")) throw new AuthFailure(); return value.slice(7); }
export function buildApi({ database, auth, clock = () => new Date(), corsOrigins = ["http://localhost:5173"] }: ApiDependencies): FastifyInstance {
  const app = Fastify({ logger: false });
  app.addHook("onRequest", async (request, reply) => {
    const origin = request.headers.origin;
    if (!origin || !corsOrigins.includes(origin)) return;
    reply.header("Access-Control-Allow-Origin", origin); reply.header("Access-Control-Allow-Credentials", "true");
    reply.header("Access-Control-Allow-Methods", "GET,HEAD,POST,PATCH,DELETE,OPTIONS"); reply.header("Access-Control-Allow-Headers", "Authorization,Content-Type,Idempotency-Key"); reply.header("Vary", "Origin");
    if (request.method === "OPTIONS") return reply.code(204).send();
  });
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof AuthFailure) return reply.code(401).send({ code: "UNAUTHENTICATED", message: "Authentication is required" });
    if (error instanceof AccessDenied) return reply.code(403).send({ code: "FORBIDDEN", message: error.message });
    if (typeof error === "object" && error !== null && "issues" in error) return reply.code(400).send({ code: "VALIDATION_ERROR", message: "Invalid request" });
    return reply.code(500).send({ code: "INTERNAL_ERROR", message: "Unexpected server error" });
  });
  app.get("/health", async (_request, reply): Promise<HealthResponse> => { const checkedAt = clock().toISOString(); try { await database.check(); return HealthResponseSchema.parse({ status: "ok", database: "ok", checkedAt }); } catch { reply.code(503); return HealthResponseSchema.parse({ status: "degraded", database: "unavailable", checkedAt }); } });
  if (auth) {
    app.post("/auth/login", async (request) => AuthenticatedContextSchema.parse(await auth.login(LoginRequestSchema.parse(request.body))));
    app.post("/auth/refresh", async (request) => AuthenticatedContextSchema.parse(await auth.refresh(RefreshRequestSchema.parse(request.body).refreshToken)));
    app.get("/me/context", async (request) => AuthContextSchema.parse(await auth.context(bearer(request.headers.authorization))));
    app.post("/me/active-branch", async (request) => AuthContextSchema.parse(await auth.setActiveBranch(bearer(request.headers.authorization), SetActiveBranchRequestSchema.parse(request.body).branchId)));
  }
  return app;
}
