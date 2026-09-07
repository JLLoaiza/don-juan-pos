import { z } from "zod";
import {
  CashRegisterContextSchema,
  CashRegisterListSchema,
  CashSessionSchema,
  type CashAdjustmentRequest,
  type CashSession,
  type CloseCashSessionRequest,
  type OpenCashSessionRequest,
} from "@don-juan/contracts";
import type { AuthContextValue } from "../auth/AuthProvider";

export type CashRegisterContext = z.infer<typeof CashRegisterContextSchema>;

type AuthClient = Pick<AuthContextValue, "authGet" | "authPost">;

function idempotencyHeaders(): Record<string, string> {
  return { "idempotency-key": crypto.randomUUID() };
}

export interface CashApi {
  getCashRegisters(): Promise<CashRegisterContext[]>;
  getOpenSession(cashRegisterId: string): Promise<CashSession | null>;
  openCashSession(input: OpenCashSessionRequest): Promise<CashSession>;
  adjustCashSession(sessionId: string, input: CashAdjustmentRequest): Promise<CashSession>;
  closeCashSession(sessionId: string, input: CloseCashSessionRequest): Promise<CashSession>;
}

export function createCashApi(auth: AuthClient): CashApi {
  return {
    getCashRegisters: () => auth.authGet("/cash-registers", CashRegisterListSchema).then((result) => result.cashRegisters),
    getOpenSession: (cashRegisterId) => auth.authGet(`/cash-registers/${cashRegisterId}/open-session`, CashSessionSchema.nullable()),
    openCashSession: (input) => auth.authPost("/cash-sessions", CashSessionSchema, input, idempotencyHeaders()),
    adjustCashSession: (sessionId, input) =>
      auth.authPost(`/cash-sessions/${sessionId}/adjustments`, CashSessionSchema, input, idempotencyHeaders()),
    closeCashSession: (sessionId, input) =>
      auth.authPost(`/cash-sessions/${sessionId}/close`, CashSessionSchema, input, idempotencyHeaders()),
  };
}
