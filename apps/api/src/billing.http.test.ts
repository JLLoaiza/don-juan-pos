import { describe, expect, it, vi } from "vitest";
import { buildApi } from "./app.js";
import type { AuthService } from "./auth.js";

const branch = { id: "00000000-0000-4000-8000-000000000003", name: "Centro", code: "CENTRO", settings: {} };
const context = { user: { id: "00000000-0000-4000-8000-000000000001", displayName: "Admin" }, branches: [branch], activeBranch: branch, permissions: ["payments.view", "payments.create", "cash.open", "sales.apply_discount", "sales.modify_service"] };
const auth: AuthService = { login: async () => { throw new Error("not used"); }, refresh: async () => { throw new Error("not used"); }, context: async () => context, setActiveBranch: async () => context };
const payment = { id: "00000000-0000-4000-8000-000000000090", accountId: "00000000-0000-4000-8000-000000000099", accountSplitId: null, paymentMethodId: "00000000-0000-4000-8000-000000000091", paymentMethodName: "Efectivo", paymentMethodType: "CASH", status: "REGISTERED", amountApplied: "10.00", cashReceived: "10.00", changeAmount: "0.00", reference: null, notes: null, cashSessionId: "00000000-0000-4000-8000-000000000092", receivedByUserId: context.user.id, receivedAt: "2026-09-07T00:00:00.000Z" };
const billingSnapshot = { accountId: payment.accountId, status: "OPEN", version: 2, settlementMode: "DIRECT", subtotal: "10.00", discountTotal: "0.00", taxTotal: "0.00", servicePercentage: "0", serviceTotal: "0.00", total: "10.00", paidTotal: "0.00", remainingBalance: "10.00", hasPayments: false, discounts: [], splits: [], payments: [] };
const billing = { billing: vi.fn(async () => billingSnapshot), registerPayment: vi.fn(async () => payment), openCashSession: vi.fn(async () => ({ id: "00000000-0000-4000-8000-000000000092" })), applyAccountDiscount: vi.fn(async () => billingSnapshot), configureService: vi.fn(async () => billingSnapshot) };

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
  it("uses the active branch and dedicated permissions for discount and service commands", async () => {
    const app = buildApi({ database: { check: async () => undefined }, auth, billing: billing as never });
    const headers = { authorization: "Bearer token", "idempotency-key": "00000000-0000-4000-8000-000000000011" };
    const discount = await app.inject({ method: "POST", url: `/accounts/${payment.accountId}/discounts`, headers, payload: { expectedVersion: 2, name: "Cortesía", type: "PERCENTAGE", value: "10", companyId: "00000000-0000-4000-8000-000000000013" } });
    const service = await app.inject({ method: "PUT", url: `/accounts/${payment.accountId}/service`, headers: { ...headers, "idempotency-key": "00000000-0000-4000-8000-000000000012" }, payload: { expectedVersion: 2, percentage: "10", companyId: "00000000-0000-4000-8000-000000000013" } });
    await app.close();
    expect(discount.statusCode).toBe(200); expect(service.statusCode).toBe(200);
    expect(billing.applyAccountDiscount).toHaveBeenLastCalledWith({ userId: context.user.id, branchId: branch.id }, "00000000-0000-4000-8000-000000000011", payment.accountId, expect.not.objectContaining({ companyId: expect.anything() }));
    expect(billing.configureService).toHaveBeenLastCalledWith({ userId: context.user.id, branchId: branch.id }, "00000000-0000-4000-8000-000000000012", payment.accountId, expect.not.objectContaining({ companyId: expect.anything() }));
  });
});
