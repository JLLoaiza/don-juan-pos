import { useCallback, useEffect, useRef, useState } from "react";
import type { ConnectivityState } from "@don-juan/ui";

export interface UseConnectivityOptions {
  readonly checkHealth: () => Promise<unknown>;
  readonly intervalMs?: number;
}

export interface UseConnectivityResult {
  readonly state: ConnectivityState;
  readonly lastCheckedAt: Date | null;
  readonly checkNow: () => void;
}

export function useConnectivity({ checkHealth, intervalMs = 15000 }: UseConnectivityOptions): UseConnectivityResult {
  const [state, setState] = useState<ConnectivityState>("CHECKING");
  const [lastCheckedAt, setLastCheckedAt] = useState<Date | null>(null);
  const isChecking = useRef(false);

  // Kept in a ref (updated every render) rather than a useCallback dependency
  // so a caller passing a fresh `checkHealth` closure each render cannot make
  // the effect below re-subscribe and re-check on every render.
  const checkHealthRef = useRef(checkHealth);
  checkHealthRef.current = checkHealth;

  const checkNow = useCallback(() => {
    if (isChecking.current) return;
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      setState("DEVICE_ONLY");
      setLastCheckedAt(new Date());
      return;
    }
    isChecking.current = true;
    checkHealthRef
      .current()
      .then(() => {
        // LOCAL_ONLY (edge reachable, cloud unreachable) is not observable yet:
        // GET /health does not report cloud reachability from the edge.
        setState("ONLINE");
      })
      .catch(() => {
        setState("DEVICE_ONLY");
      })
      .finally(() => {
        isChecking.current = false;
        setLastCheckedAt(new Date());
      });
  }, []);

  useEffect(() => {
    checkNow();
    const interval = setInterval(checkNow, intervalMs);
    window.addEventListener("online", checkNow);
    window.addEventListener("offline", checkNow);
    return () => {
      clearInterval(interval);
      window.removeEventListener("online", checkNow);
      window.removeEventListener("offline", checkNow);
    };
  }, [checkNow, intervalMs]);

  return { state, lastCheckedAt, checkNow };
}
