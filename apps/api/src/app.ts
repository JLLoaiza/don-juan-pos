import Fastify, { type FastifyInstance } from "fastify";
import { HealthResponseSchema, type HealthResponse } from "@don-juan/contracts";
import type { DatabaseHealth } from "@don-juan/database";

export interface ApiDependencies {
  readonly database: DatabaseHealth;
  readonly clock?: () => Date;
  readonly corsOrigins?: readonly string[];
}

export function buildApi({
  database,
  clock = () => new Date(),
  corsOrigins = ["http://localhost:5173"],
}: ApiDependencies): FastifyInstance {
  const app = Fastify({ logger: false });

  app.addHook("onRequest", async (request, reply) => {
    const origin = request.headers.origin;
    if (!origin || !corsOrigins.includes(origin)) return;

    reply.header("Access-Control-Allow-Origin", origin);
    reply.header("Access-Control-Allow-Credentials", "true");
    reply.header("Access-Control-Allow-Methods", "GET,HEAD,POST,PATCH,DELETE,OPTIONS");
    reply.header("Access-Control-Allow-Headers", "Authorization,Content-Type,Idempotency-Key");
    reply.header("Vary", "Origin");

    if (request.method === "OPTIONS") return reply.code(204).send();
  });

  app.get("/health", async (_request, reply): Promise<HealthResponse> => {
    const checkedAt = clock().toISOString();
    try {
      await database.check();
      return HealthResponseSchema.parse({ status: "ok", database: "ok", checkedAt });
    } catch {
      reply.code(503);
      return HealthResponseSchema.parse({ status: "degraded", database: "unavailable", checkedAt });
    }
  });

  return app;
}
