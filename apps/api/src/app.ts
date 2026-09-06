import Fastify, { type FastifyInstance } from "fastify";
import { HealthResponseSchema, type HealthResponse } from "@don-juan/contracts";
import type { DatabaseHealth } from "@don-juan/database";

export interface ApiDependencies {
  readonly database: DatabaseHealth;
  readonly clock?: () => Date;
}

export function buildApi({ database, clock = () => new Date() }: ApiDependencies): FastifyInstance {
  const app = Fastify({ logger: false });

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
