import { z } from "zod";
import { SyncOutboxStatusSchema } from "./sync.js";

const Id = z.string().uuid();
const DateTime = z.string().datetime();

export const DeploymentModeSchema = z.enum(["edge", "cloud"]);
export const EdgeServerSchema = z.object({
  id: Id,
  branchId: Id,
  displayName: z.string(),
  active: z.boolean(),
  enrolledAt: DateTime,
  lastReceivedAt: DateTime.nullable(),
});
export const CreateEdgeEnrollmentRequestSchema = z.object({
  displayName: z.string().trim().min(1).max(150),
});
export const CreateEdgeEnrollmentResponseSchema = z.object({
  enrollmentToken: z.string().min(32),
  expiresAt: DateTime,
});
export const ClaimEdgeEnrollmentRequestSchema = z.object({
  enrollmentToken: z.string().min(32),
  displayName: z.string().trim().min(1).max(150),
});
/** Returned only once to the installation process; store it as an Edge secret, never in a browser. */
export const ClaimEdgeEnrollmentResponseSchema = z.object({
  edgeServerId: Id,
  branchId: Id,
  edgeServerToken: z.string().min(32),
  enrolledAt: DateTime,
});

export const EdgeReplicationStatusSchema = z.object({
  deploymentMode: z.literal("edge"),
  edgeServerId: Id,
  branchId: Id,
  outbox: z.object({
    pending: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
    delivered: z.number().int().nonnegative(),
    lastDeliveredAt: DateTime.nullable(),
    lastError: z.string().nullable(),
  }),
});
export const CloudBranchReplicationStatusSchema = z.object({
  deploymentMode: z.literal("cloud"),
  branchId: Id,
  edgeServerId: Id.nullable(),
  edgeServerName: z.string().nullable(),
  edgeActive: z.boolean(),
  lastReceivedAt: DateTime.nullable(),
  replicatedEvents: z.number().int().nonnegative(),
  stale: z.boolean(),
});
export const CloudReplicaEntitySchema = z.object({
  entityType: z.string(),
  entityId: Id,
  entityVersion: z.number().int().positive().nullable(),
  payload: z.unknown(),
  replicatedAt: DateTime,
});
export const CloudReplicaEntityListSchema = z.object({
  branchId: Id,
  lastReceivedAt: DateTime.nullable(),
  stale: z.boolean(),
  entities: z.array(CloudReplicaEntitySchema),
});

/** Internal Edge-to-Cloud envelope. `branchId` is verified against Edge identity and never grants scope. */
export const EdgeReplicaEventSchema = z.object({
  operationId: Id,
  branchId: Id,
  commandName: z.string().trim().min(1).max(150),
  aggregateType: z.string().trim().min(1).max(100),
  aggregateId: Id,
  payload: z.unknown(),
});
export const ReceiveEdgeReplicaRequestSchema = z.object({ protocolVersion: z.literal(1), event: EdgeReplicaEventSchema });
export const ReceiveEdgeReplicaResponseSchema = z.object({ status: z.enum(["ACCEPTED", "DUPLICATE"]), receiptCursor: z.string().regex(/^\d+$/), receivedAt: DateTime });
export const EdgeReplicationDeliverySchema = z.object({ status: SyncOutboxStatusSchema, deliveredAt: DateTime.nullable() });

export type EdgeReplicaEvent = z.infer<typeof EdgeReplicaEventSchema>;
export type CloudBranchReplicationStatus = z.infer<typeof CloudBranchReplicationStatusSchema>;
export const CloudIdentitySnapshotSchema = z.object({
  branchId: Id,
  company: z.object({ id: Id, name: z.string(), currency: z.string(), timezone: z.string(), active: z.boolean() }),
  branch: z.object({ id: Id, companyId: Id, name: z.string(), code: z.string(), active: z.boolean() }),
  users: z.array(z.object({ id: Id, companyId: Id, username: z.string(), email: z.string().nullable(), passwordHash: z.string(), displayName: z.string(), active: z.boolean() })),
  roles: z.array(z.object({ id: Id, companyId: Id, name: z.string(), description: z.string().nullable(), active: z.boolean() })),
  permissions: z.array(z.object({ id: Id, key: z.string(), name: z.string(), description: z.string().nullable(), module: z.string().nullable() })),
  rolePermissions: z.array(z.object({ roleId: Id, permissionId: Id })),
  userRoles: z.array(z.object({ userId: Id, roleId: Id, branchId: Id.nullable() })),
  generatedAt: DateTime,
});
export type CloudIdentitySnapshot = z.infer<typeof CloudIdentitySnapshotSchema>;
