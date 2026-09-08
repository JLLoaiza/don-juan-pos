import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth/useAuth";
import type { LoadStatus } from "../floor/useFloor";
import { createReportsApi, type ProductPerformanceReport } from "./reportsApi";

export interface UseProductsReportResult {
  readonly status: LoadStatus;
  readonly data: ProductPerformanceReport | null;
  readonly error: unknown;
  readonly reload: () => void;
}

export function useProductsReport(
  from: string | undefined,
  to: string | undefined,
  page: number,
  pageSize: number,
): UseProductsReportResult {
  const auth = useAuth();
  const api = useMemo(() => createReportsApi(auth), [auth]);
  const branchId = auth.context?.activeBranch?.id ?? null;

  const [status, setStatus] = useState<LoadStatus>("loading");
  const [data, setData] = useState<ProductPerformanceReport | null>(null);
  const [error, setError] = useState<unknown>(null);

  const reload = useCallback(() => {
    if (!branchId) return;
    setStatus("loading");
    setError(null);
    api
      .getProducts({ from, to, page, pageSize })
      .then((result) => {
        setData(result);
        setStatus("ready");
      })
      .catch((cause: unknown) => {
        setError(cause);
        setStatus("error");
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, branchId, from, to, page, pageSize]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { status, data, error, reload };
}
