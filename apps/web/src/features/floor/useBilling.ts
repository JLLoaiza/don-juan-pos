import { useCallback, useEffect, useMemo, useState } from "react";
import type { BillingSnapshot } from "@don-juan/contracts";
import { useAuth } from "../auth/useAuth";
import { createBillingApi, type BillingApi } from "./billingApi";
import type { LoadStatus } from "./useFloor";

export interface UseBillingResult {
  readonly status: LoadStatus;
  readonly billing: BillingSnapshot | null;
  readonly error: unknown;
  readonly api: BillingApi;
  readonly reload: () => void;
}

export function useBilling(accountId: string): UseBillingResult {
  const auth = useAuth();
  const api = useMemo(() => createBillingApi(auth), [auth]);

  const [status, setStatus] = useState<LoadStatus>("loading");
  const [billing, setBilling] = useState<BillingSnapshot | null>(null);
  const [error, setError] = useState<unknown>(null);

  const reload = useCallback(() => {
    setStatus("loading");
    setError(null);
    api
      .getBilling(accountId)
      .then((result) => {
        setBilling(result);
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

  return { status, billing, error, api, reload };
}
