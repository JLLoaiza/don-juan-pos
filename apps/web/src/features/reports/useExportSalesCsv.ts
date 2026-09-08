import { useCallback, useMemo, useState } from "react";
import { useAuth } from "../auth/useAuth";
import { saveBlob } from "../../lib/download";
import { createReportsApi, type ReportRangeParams } from "./reportsApi";

export interface UseExportSalesCsvResult {
  readonly exporting: boolean;
  readonly error: unknown;
  readonly exportCsv: (params: ReportRangeParams) => void;
}

const FALLBACK_FILENAME = "reports-sales.csv";

export function useExportSalesCsv(): UseExportSalesCsvResult {
  const auth = useAuth();
  const api = useMemo(() => createReportsApi(auth), [auth]);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const exportCsv = useCallback(
    (params: ReportRangeParams) => {
      setExporting(true);
      setError(null);
      api
        .exportSalesCsv(params)
        .then((result) => {
          saveBlob(result.blob, result.filename ?? FALLBACK_FILENAME);
        })
        .catch((cause: unknown) => {
          setError(cause);
        })
        .finally(() => setExporting(false));
    },
    [api],
  );

  return { exporting, error, exportCsv };
}
