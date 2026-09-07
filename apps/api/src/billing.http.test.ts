import { describe, expect, it, vi } from "vitest";
import { buildApi } from "./app.js";
import type { AuthService } from "./auth.js";

const branch = { id: "00000000-0000-4000-8000-000000000003", name: "Centro", code: "CENTRO", settings: {} };
const context = { user: { id: "00000000-0000-4000-8000-000000000001", displayName: "Admin" }, branches: [branch], activeBranch: branch, permissions: ["payments.view", "payments.create", "cash.open"] };
const auth: AuthService = { login: async () => { throw new Error("not used"); }, refresh: async () => { throw new Error("not used"); }, context: async () => context, setActiveBranch: async () => context };
const payment = { id: "00000000-0000-4000-8000-000000000090", accountId: "00000000-0000-4000-8000-000000000099", accountSplitId: null, paymentMethodId: "00000000-0000-4000-8000-000000000091", paymentMethodName: "Efectivo", paymentMethodType: "CASH", status: "REGISTERED", amountApplied: "10.00", cashReceived: "10.00", changeAmount: "0.00", reference: null, notes: null, cashSessionId: "00000000-0000-4000-8000-000000000092", receivedByUserId: context.user.id, receivedAt: "2026-09-07T00:00:00.000Z" };
const billing = { billing: vi.fn(), registerPayment: vi.fn(async () => payment), openCashSession: vi.fn(async () => ({ id: "00000000-0000-4000-8000-000000000092" })) };

describe("billing HTTP authorization and contracts", () => {
  it("requires authentication before exposing account billing", async () => {
    const app = buildApi({ database: { check: async () => undefined }, auth, billing: billing as never });
    const response = await app.inject({ method: "GET", url: "/accounts/00000000-0000-4000-8000-000000000099/billing" });
    await app.close();
    expect(response.statusCode).toBe(401);
  });

  it("derives the branch and strips companyId from a payment command", async () => {
    const app = buildApi({ database: { check: async () => undefined }, auth, billing: billing as never });
    const payload = { expectedVersion: 2, paymentMethodId: payment.paymentMethodId, amountApplied: "10", cashSessionId: payment.cashSessionId, cashReceived: "10", reference: null, notes: null, printReceipt: false, companyId: "00000000-0000-4000-8000-000000000013" };
    const missingKey = await app.inject({ method: "POST", url: `/accounts/${payment.accountId}/payments`, headers: { authorization: "Bearer token" }, payload });
    expect(missingKey.statusCode).toBe(400);
    const response = await app.inject({ method: "POST", url: `/accounts/${payment.accountId}/payments`, headers: { authorization: "Bearer token", "idempotency-key": "00000000-0000-4000-8000-000000000010" }, payload });
    await app.close();
    expect(response.statusCode).toBe(200);
    expect(billing.registerPayment).toHaveBeenLastCalledWith({ userId: context.user.id, branchId: branch.id }, "00000000-0000-4000-8000-000000000010", payment.accountId, expect.objectContaining({ amountApplied: "10" }));
    expect((billing.registerPayment.mock.calls as unknown as [unknown, unknown, unknown, Record<string, unknown>][]).at(-1)?.[3]).not.toHaveProperty("companyId");
  });
});
