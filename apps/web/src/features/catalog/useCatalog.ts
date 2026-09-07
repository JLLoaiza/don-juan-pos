import { useCallback, useEffect, useMemo, useState } from "react";
import type { CatalogSnapshot } from "@don-juan/contracts";
import { useAuth } from "../auth/useAuth";
import { createCatalogApi, type CatalogApi } from "./catalogApi";

export type CatalogLoadStatus = "loading" | "ready" | "error";

export interface UseCatalogResult {
  readonly status: CatalogLoadStatus;
  readonly snapshot: CatalogSnapshot | null;
  readonly error: unknown;
  readonly api: CatalogApi;
  readonly reload: () => void;
}

export function useCatalog(): UseCatalogResult {
  const auth = useAuth();
  const api = useMemo(() => createCatalogApi(auth), [auth]);
  // Re-fetching keys on the active branch id: switching branches must
  // invalidate/reload branch-scoped catalog data (organization_access.md §7).
  const branchId = auth.context?.activeBranch?.id ?? null;

  const [status, setStatus] = useState<CatalogLoadStatus>("loading");
  const [snapshot, setSnapshot] = useState<CatalogSnapshot | null>(null);
  const [error, setError] = useState<unknown>(null);

  const reload = useCallback(() => {
    if (!branchId) return;
    setStatus("loading");
    setError(null);
    api
      .getSnapshot()
      .then((result) => {
        setSnapshot(result);
        setStatus("ready");
      })
      .catch((cause: unknown) => {
        setError(cause);
        setStatus("error");
      });
    // api is derived from `auth` (memoized above); branchId is the real
    // change signal for a reload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, branchId]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { status, snapshot, error, api, reload };
}
