import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth/useAuth";
import { createWorkforceApi, type Employee, type EmployeeBonus, type EmployeePayment, type EmployeeShift, type WorkforceApi } from "./workforceApi";

export type WorkforceStatus = "loading" | "ready" | "error";
export interface UseWorkforceResult {
  readonly status: WorkforceStatus; readonly employees: Employee[] | null; readonly shifts: EmployeeShift[] | null;
  readonly bonuses: EmployeeBonus[] | null; readonly payments: EmployeePayment[] | null; readonly error: unknown;
  readonly api: WorkforceApi; readonly reload: () => void;
}
export function useWorkforce(): UseWorkforceResult {
  const auth = useAuth(); const api = useMemo(() => createWorkforceApi(auth), [auth]);
  const branchId = auth.context?.activeBranch?.id ?? null;
  const [status, setStatus] = useState<WorkforceStatus>("loading");
  const [employees, setEmployees] = useState<Employee[] | null>(null); const [shifts, setShifts] = useState<EmployeeShift[] | null>(null);
  const [bonuses, setBonuses] = useState<EmployeeBonus[] | null>(null); const [payments, setPayments] = useState<EmployeePayment[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const reload = useCallback(() => {
    if (!branchId) return;
    setStatus("loading"); setError(null);
    Promise.all([api.getEmployees(), api.getShifts(), api.getBonuses(), api.getPayments()])
      .then(([nextEmployees, nextShifts, nextBonuses, nextPayments]) => {
        setEmployees(nextEmployees); setShifts(nextShifts); setBonuses(nextBonuses); setPayments(nextPayments); setStatus("ready");
      }).catch((cause) => { setError(cause); setStatus("error"); });
  }, [api, branchId]);
  useEffect(() => { reload(); }, [reload]);
  return { status, employees, shifts, bonuses, payments, error, api, reload };
}
