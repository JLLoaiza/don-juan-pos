import {
  BillingSnapshotSchema,
  type ApplyAccountDiscountRequest,
  type BillingSnapshot,
  type ConfigureServiceRequest,
} from "@don-juan/contracts";
import type { AuthContextValue } from "../auth/AuthProvider";

type AuthClient = Pick<AuthContextValue, "authGet" | "authPost" | "authPut">;

function idempotencyHeaders(): Record<string, string> {
  return { "idempotency-key": crypto.randomUUID() };
}

export interface BillingApi {
  getBilling(accountId: string): Promise<BillingSnapshot>;
  applyDiscount(accountId: string, input: ApplyAccountDiscountRequest): Promise<BillingSnapshot>;
  configureService(accountId: string, input: ConfigureServiceRequest): Promise<BillingSnapshot>;
}

// Payment registration (POST /accounts/:id/payments) and cash session opening
// (POST /cash-sessions) are real, working endpoints, but there is no way to
// list the payment methods or cash registers a branch has — no GET endpoint
// for either. A picker cannot be built without inventing IDs, so those two
// commands are intentionally not wrapped here yet. See .agents/coordination.md.
export function createBillingApi(auth: AuthClient): BillingApi {
  return {
    getBilling: (accountId) => auth.authGet(`/accounts/${accountId}/billing`, BillingSnapshotSchema),
    applyDiscount: (accountId, input) =>
      auth.authPost(`/accounts/${accountId}/discounts`, BillingSnapshotSchema, input, idempotencyHeaders()),
    configureService: (accountId, input) =>
      auth.authPut(`/accounts/${accountId}/service`, BillingSnapshotSchema, input, idempotencyHeaders()),
  };
}
