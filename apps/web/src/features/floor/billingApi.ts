import { z } from "zod";
import {
  BillingSnapshotSchema,
  PaymentMethodListSchema,
  PaymentMethodSchema,
  PaymentSnapshotSchema,
  type ApplyAccountDiscountRequest,
  type BillingSnapshot,
  type ConfigureServiceRequest,
  type PaymentSnapshot,
  type RegisterPaymentRequest,
} from "@don-juan/contracts";
import type { AuthContextValue } from "../auth/AuthProvider";

export type PaymentMethod = z.infer<typeof PaymentMethodSchema>;

type AuthClient = Pick<AuthContextValue, "authGet" | "authPost" | "authPut">;

function idempotencyHeaders(): Record<string, string> {
  return { "idempotency-key": crypto.randomUUID() };
}

export interface BillingApi {
  getBilling(accountId: string): Promise<BillingSnapshot>;
  applyDiscount(accountId: string, input: ApplyAccountDiscountRequest): Promise<BillingSnapshot>;
  configureService(accountId: string, input: ConfigureServiceRequest): Promise<BillingSnapshot>;
  getPaymentMethods(): Promise<PaymentMethod[]>;
  registerPayment(accountId: string, input: RegisterPaymentRequest): Promise<PaymentSnapshot>;
}

export function createBillingApi(auth: AuthClient): BillingApi {
  return {
    getBilling: (accountId) => auth.authGet(`/accounts/${accountId}/billing`, BillingSnapshotSchema),
    applyDiscount: (accountId, input) =>
      auth.authPost(`/accounts/${accountId}/discounts`, BillingSnapshotSchema, input, idempotencyHeaders()),
    configureService: (accountId, input) =>
      auth.authPut(`/accounts/${accountId}/service`, BillingSnapshotSchema, input, idempotencyHeaders()),
    getPaymentMethods: () => auth.authGet("/payment-methods", PaymentMethodListSchema).then((result) => result.paymentMethods),
    registerPayment: (accountId, input) =>
      auth.authPost(`/accounts/${accountId}/payments`, PaymentSnapshotSchema, input, idempotencyHeaders()),
  };
}
