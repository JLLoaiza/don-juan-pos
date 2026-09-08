import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth/useAuth";
import type { LoadStatus } from "../floor/useFloor";
import { createReplicationApi, type CloudReplicaEntityList } from "./replicationApi";

export interface UseReplicationEntitiesResult {
  readonly status: LoadStatus;
  readonly data: CloudReplicaEntityList | null;
  readonly error: unknown;
  readonly reload: () => void;
}

// GET /replication/cloud/entities only exists for a cloud deployment
// (apps/api/src/replication.ts ReplicationService#cloudEntities requires
// mode "cloud"); callers must only enable this on a cloud status response.
export function useReplicationEntities(enabled: boolean): UseReplicationEntitiesResult {
  const auth = useAuth();
  const api = useMemo(() => createReplicationApi(auth), [auth]);
  const branchId = auth.context?.activeBranch?.id ?? null;

  const [status, setStatus] = useState<LoadStatus>("loading");
  const [data, setData] = useState<CloudReplicaEntityList | null>(null);
  const [error, setError] = useState<unknown>(null);

  const reload = useCallback(() => {
    if (!branchId || !enabled) return;
    setStatus("loading");
    setError(null);
    api
      .getCloudEntities()
      .then((result) => {
        setData(result);
        setStatus("ready");
      })
      .catch((cause: unknown) => {
        setError(cause);
        setStatus("error");
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, branchId, enabled]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { status, data, error, reload };
}
