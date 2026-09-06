import { z } from "zod";

export const HealthStatusSchema = z.enum(["ok", "degraded"]);

export const HealthResponseSchema = z.object({
  status: HealthStatusSchema,
  database: z.enum(["ok", "unavailable"]),
  checkedAt: z.string().datetime(),
});

export type HealthResponse = z.infer<typeof HealthResponseSchema>;

