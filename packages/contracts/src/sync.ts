import { z } from "zod";

export const SyncProtocolVersion = 1;
export const SyncCursorSchema = z.string().regex(/^\d+$/);
export const SyncOperationStatusSchema = z.enum(["PENDING", "PROCESSING", "PROCESSED", "FAILED", "CONFLICT"]);
export const SyncOutboxStatusSchema = z.enum(["PENDING", "DELIVERED", "FAILED", "CONFLICT"]);
export const SyncOperationNameSchema = z.enum([
  "catalog.inventory_item.create", "catalog.inventory_item.update", "catalog.inventory_item.adjust",
  "catalog.accompaniment.create", "catalog.accompaniment.update", "catalog.product.create", "catalog.product.update",
  "dining_areas.create", "tables.create", "tables.change_status", "accounts.open", "accounts.confirm_consumption",
  "accounts.apply_discount", "accounts.configure_service", "accounts.register_payment",
  "cash_sessions.open", "cash_sessions.adjust", "cash_sessions.close",
  "suppliers.create", "suppliers.update", "purchases.confirm", "purchases.void", "expenses.create", "expenses.void",
  "employees.create", "employees.update", "employee_wage_rates.create", "employee_shifts.clock_in",
  "employee_shifts.clock_out", "employee_bonuses.create", "employee_payments.create", "employee_payments.void",
]);

const Id = z.string().uuid();
const OptionalText = z.string().trim().max(200).nullable().optional();

export const SyncDeviceSchema = z.object({
  id: Id,
  deviceIdentifier: z.string(),
  deviceName: z.string().nullable(),
  deviceType: z.string().nullable(),
  active: z.boolean(),
  lastSyncAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
});
export const SyncDeviceListSchema = z.object({ devices: z.array(SyncDeviceSchema) });
export const RegisterSyncDeviceRequestSchema = z.object({
  deviceIdentifier: z.string().trim().min(1).max(200),
  deviceName: OptionalText,
  deviceType: OptionalText,
});
export const DeactivateSyncDeviceRequestSchema = z.object({ reason: z.string().trim().min(1).max(2_000).optional() });

export const SyncChangeSchema = z.object({
  cursor: SyncCursorSchema,
  operationId: Id,
  operationName: z.string(),
  entityType: z.string(),
  entityId: Id,
  entityVersion: z.number().int().positive().nullable(),
  payload: z.unknown(),
  createdAt: z.string().datetime(),
});
export const PullSyncChangesRequestSchema = z.object({
  deviceId: Id,
  after: SyncCursorSchema.default("0"),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});
export const PullSyncChangesResponseSchema = z.object({
  changes: z.array(SyncChangeSchema),
  nextCursor: SyncCursorSchema,
});

export const SyncOutboxSummarySchema = z.object({
  pending: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  conflict: z.number().int().nonnegative(),
  delivered: z.number().int().nonnegative(),
  lastDeliveredAt: z.string().datetime().nullable(),
});
export const SyncStatusSchema = z.object({
  protocolVersion: z.literal(SyncProtocolVersion),
  outbox: SyncOutboxSummarySchema,
  latestChangeCursor: SyncCursorSchema,
});

export const SyncOperationRequestSchema = z.object({
  operationId: Id,
  operationName: SyncOperationNameSchema,
  entityType: z.string().trim().min(1).max(100),
  entityId: Id,
  expectedVersion: z.number().int().positive().nullable().optional(),
  dependsOnOperationIds: z.array(Id).max(50).default([]),
  schemaVersion: z.literal(SyncProtocolVersion).default(SyncProtocolVersion),
  payload: z.record(z.string(), z.unknown()),
}).superRefine((operation, context) => {
  if (operation.dependsOnOperationIds.includes(operation.operationId)) context.addIssue({ code: "custom", path: ["dependsOnOperationIds"], message: "An operation cannot depend on itself" });
});
export const PushSyncOperationsRequestSchema = z.object({
  deviceId: Id,
  operations: z.array(SyncOperationRequestSchema).min(1).max(100),
}).superRefine((batch, context) => {
  const ids = new Set<string>();
  batch.operations.forEach((operation, index) => {
    if (ids.has(operation.operationId)) context.addIssue({ code: "custom", path: ["operations", index, "operationId"], message: "Operation IDs must be unique within a batch" });
    ids.add(operation.operationId);
  });
});
export const SyncOperationResultSchema = z.object({
  operationId: Id,
  status: SyncOperationStatusSchema,
  result: z.unknown().nullable(),
  error: z.string().nullable(),
  conflictType: z.string().nullable(),
});
export const PushSyncOperationsResponseSchema = z.object({ results: z.array(SyncOperationResultSchema) });
export const SyncConflictSchema = SyncOperationResultSchema.extend({
  deviceId: Id,
  operationName: SyncOperationNameSchema,
  entityType: z.string(),
  entityId: Id,
  expectedVersion: z.number().int().positive().nullable(),
  conflictMetadata: z.unknown().nullable(),
  createdAt: z.string().datetime(),
});
export const SyncConflictListSchema = z.object({ conflicts: z.array(SyncConflictSchema) });
export const ResolveSyncConflictRequestSchema = z.object({
  resolution: z.enum(["DISCARD"]),
  reason: z.string().trim().min(1).max(2_000),
});

export type RegisterSyncDeviceRequest = z.infer<typeof RegisterSyncDeviceRequestSchema>;
export type PullSyncChangesRequest = z.infer<typeof PullSyncChangesRequestSchema>;
export type PushSyncOperationsRequest = z.infer<typeof PushSyncOperationsRequestSchema>;
export type SyncOperationRequest = z.infer<typeof SyncOperationRequestSchema>;
export type SyncOperationResult = z.infer<typeof SyncOperationResultSchema>;
export type SyncDevice = z.infer<typeof SyncDeviceSchema>;
