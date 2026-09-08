import { z } from "zod";
import { CloudBranchReplicationStatusSchema, CloudReplicaEntityListSchema, EdgeReplicationStatusSchema } from "@don-juan/contracts";
import type { AuthContextValue } from "../auth/AuthProvider";

// GET /replication/status returns one shape or the other depending on
// SERVER_ROLE (apps/api/src/app.ts); deploymentMode discriminates them.
export const ReplicationStatusSchema = z.discriminatedUnion("deploymentMode", [
  EdgeReplicationStatusSchema,
  CloudBranchReplicationStatusSchema,
]);
export type ReplicationStatus = z.infer<typeof ReplicationStatusSchema>;
export type EdgeReplicationStatus = z.infer<typeof EdgeReplicationStatusSchema>;
export type CloudReplicationStatus = z.infer<typeof CloudBranchReplicationStatusSchema>;
export type CloudReplicaEntityList = z.infer<typeof CloudReplicaEntityListSchema>;
export type CloudReplicaEntity = CloudReplicaEntityList["entities"][number];

type AuthClient = Pick<AuthContextValue, "authGet">;

export interface ReplicationApi {
  getStatus(): Promise<ReplicationStatus>;
  getCloudEntities(): Promise<CloudReplicaEntityList>;
}

export function createReplicationApi(auth: AuthClient): ReplicationApi {
  return {
    getStatus: () => auth.authGet("/replication/status", ReplicationStatusSchema),
    getCloudEntities: () => auth.authGet("/replication/cloud/entities", CloudReplicaEntityListSchema),
  };
}
