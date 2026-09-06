import { z } from "zod";

export const ApiErrorCodeSchema = z.enum([
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "VALIDATION_ERROR",
  "CONFLICT",
  "NOT_FOUND",
  "INTERNAL_ERROR",
]);

export const ApiErrorSchema = z.object({
  code: ApiErrorCodeSchema,
  message: z.string(),
  requestId: z.string().uuid().optional(),
});

export type ApiError = z.infer<typeof ApiErrorSchema>;

