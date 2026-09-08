import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth/useAuth";
import type { LoadStatus } from "../floor/useFloor";
import { createReportsApi, type DashboardReport } from "./reportsApi";

export interface UseDashboardReportResult {
  readonly status: LoadStatus;
  readonly data: DashboardReport | null;
  readonly error: unknown;
  readonly reload: () => void;
}

export function useDashboardReport(from: string | undefined, to: string | undefined): UseDashboardReportResult {
  const auth = useAuth();
  const api = useMemo(() => createReportsApi(auth), [auth]);
  // Switching branches must invalidate every /reports/* query (Fase 7 rule).
  const branchId = auth.context?.activeBranch?.id ?? null;

  const [status, setStatus] = useState<LoadStatus>("loading");
  const [data, setData] = useState<DashboardReport | null>(null);
  const [error, setError] = useState<unknown>(null);

  const reload = useCallback(() => {
    if (!branchId) return;
    setStatus("loading");
    setError(null);
    api
      .getDashboard({ from, to })
      .then((result) => {
        setData(result);
        setStatus("ready");
      })
      .catch((cause: unknown) => {
        setError(cause);
        setStatus("error");
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, branchId, from, to]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { status, data, error, reload };
}
