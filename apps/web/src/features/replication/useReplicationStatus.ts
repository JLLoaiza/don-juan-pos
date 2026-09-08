import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth/useAuth";
import type { LoadStatus } from "../floor/useFloor";
import { createReplicationApi, type ReplicationApi, type ReplicationStatus } from "./replicationApi";

export interface UseReplicationStatusResult {
  readonly status: LoadStatus;
  readonly data: ReplicationStatus | null;
  readonly error: unknown;
  readonly api: ReplicationApi;
  readonly reload: () => void;
}

export function useReplicationStatus(): UseReplicationStatusResult {
  const auth = useAuth();
  const api = useMemo(() => createReplicationApi(auth), [auth]);
  // The active branch (not just company) scopes /replication/status server-side.
  const branchId = auth.context?.activeBranch?.id ?? null;

  const [status, setStatus] = useState<LoadStatus>("loading");
  const [data, setData] = useState<ReplicationStatus | null>(null);
  const [error, setError] = useState<unknown>(null);

  const reload = useCallback(() => {
    if (!branchId) return;
    setStatus("loading");
    setError(null);
    api
      .getStatus()
      .then((result) => {
        setData(result);
        setStatus("ready");
      })
      .catch((cause: unknown) => {
        setError(cause);
        setStatus("error");
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, branchId]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { status, data, error, api, reload };
}
