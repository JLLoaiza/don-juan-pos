import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth/useAuth";
import type { LoadStatus } from "../floor/useFloor";
import { createCashApi, type CashApi, type CashRegisterContext } from "./cashApi";

export interface UseCashRegistersResult {
  readonly status: LoadStatus;
  readonly cashRegisters: CashRegisterContext[] | null;
  readonly error: unknown;
  readonly api: CashApi;
  readonly reload: () => void;
}

export function useCashRegisters(): UseCashRegistersResult {
  const auth = useAuth();
  const api = useMemo(() => createCashApi(auth), [auth]);
  // Switching branches must invalidate cash/payments data (organization_access.md §7).
  const branchId = auth.context?.activeBranch?.id ?? null;

  const [status, setStatus] = useState<LoadStatus>("loading");
  const [cashRegisters, setCashRegisters] = useState<CashRegisterContext[] | null>(null);
  const [error, setError] = useState<unknown>(null);

  const reload = useCallback(() => {
    if (!branchId) return;
    setStatus("loading");
    setError(null);
    api
      .getCashRegisters()
      .then((result) => {
        setCashRegisters(result);
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

  return { status, cashRegisters, error, api, reload };
}
