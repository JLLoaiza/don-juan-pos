import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth/useAuth";
import { createProcurementApi, type ProcurementApi, type Expense, type Purchase, type Supplier } from "./procurementApi";

export type ProcurementStatus = "loading" | "ready" | "error";
export interface UseProcurementResult {
  readonly status: ProcurementStatus; readonly suppliers: Supplier[] | null; readonly purchases: Purchase[] | null; readonly expenses: Expense[] | null; readonly error: unknown; readonly api: ProcurementApi; readonly reload: () => void;
}
export function useProcurement(): UseProcurementResult {
  const auth=useAuth(); const api=useMemo(()=>createProcurementApi(auth),[auth]); const branchId=auth.context?.activeBranch?.id??null;
  const [status,setStatus]=useState<ProcurementStatus>("loading"); const [suppliers,setSuppliers]=useState<Supplier[]|null>(null); const [purchases,setPurchases]=useState<Purchase[]|null>(null); const [expenses,setExpenses]=useState<Expense[]|null>(null); const [error,setError]=useState<unknown>(null);
  const reload=useCallback(()=>{if(!branchId)return;setStatus("loading");setError(null);Promise.all([api.getSuppliers(),api.getPurchases(),api.getExpenses()]).then(([nextSuppliers,nextPurchases,nextExpenses])=>{setSuppliers(nextSuppliers);setPurchases(nextPurchases);setExpenses(nextExpenses);setStatus("ready");}).catch(cause=>{setError(cause);setStatus("error");});},[api,branchId]);
  useEffect(()=>{reload();},[reload]);
  return {status,suppliers,purchases,expenses,error,api,reload};
}
