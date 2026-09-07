import { useCallback, useEffect, useMemo, useState } from "react";
import type { AccountSnapshot, FloorSnapshot } from "@don-juan/contracts";
import { useAuth } from "../auth/useAuth";
import { createFloorApi, type FloorApi } from "./floorApi";

export type LoadStatus = "loading" | "ready" | "error";

export interface UseFloorResult {
  readonly status: LoadStatus;
  readonly snapshot: FloorSnapshot | null;
  readonly error: unknown;
  readonly api: FloorApi;
  readonly reload: () => void;
}

export function useFloor(): UseFloorResult {
  const auth = useAuth();
  const api = useMemo(() => createFloorApi(auth), [auth]);
  // Switching branches must invalidate/reload the floor (organization_access.md §7).
  const branchId = auth.context?.activeBranch?.id ?? null;

  const [status, setStatus] = useState<LoadStatus>("loading");
  const [snapshot, setSnapshot] = useState<FloorSnapshot | null>(null);
  const [error, setError] = useState<unknown>(null);

  const reload = useCallback(() => {
    if (!branchId) return;
    setStatus("loading");
    setError(null);
    api
      .getFloor()
      .then((result) => {
        setSnapshot(result);
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

  return { status, snapshot, error, api, reload };
}

export interface UseAccountResult {
  readonly status: LoadStatus;
  readonly account: AccountSnapshot | null;
  readonly error: unknown;
  readonly api: FloorApi;
  readonly reload: () => void;
}

export function useAccount(accountId: string): UseAccountResult {
  const auth = useAuth();
  const api = useMemo(() => createFloorApi(auth), [auth]);

  const [status, setStatus] = useState<LoadStatus>("loading");
  const [account, setAccount] = useState<AccountSnapshot | null>(null);
  const [error, setError] = useState<unknown>(null);

  const reload = useCallback(() => {
    setStatus("loading");
    setError(null);
    api
      .getAccount(accountId)
      .then((result) => {
        setAccount(result);
        setStatus("ready");
      })
      .catch((cause: unknown) => {
        setError(cause);
        setStatus("error");
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, accountId]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { status, account, error, api, reload };
}
