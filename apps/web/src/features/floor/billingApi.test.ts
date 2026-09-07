import { describe, expect, it, vi } from "vitest";
import { createBillingApi } from "./billingApi";

function fakeAuth() {
  return {
    authGet: vi.fn(async () => ({}) as never),
    authPost: vi.fn(async () => ({}) as never),
    authPut: vi.fn(async () => ({}) as never),
  };
}

describe("createBillingApi", () => {
  it("fetches the billing snapshot with GET /accounts/:id/billing", async () => {
    const auth = fakeAuth();
    await createBillingApi(auth).getBilling("account-1");
    expect(auth.authGet).toHaveBeenCalledWith("/accounts/account-1/billing", expect.anything());
  });

  it("applies a discount with POST /accounts/:id/discounts and an Idempotency-Key header", async () => {
    const auth = fakeAuth();
    await createBillingApi(auth).applyDiscount("account-1", { expectedVersion: 1, name: "Cortesía", type: "FIXED", value: "5000" });
    expect(auth.authPost).toHaveBeenCalledWith(
      "/accounts/account-1/discounts",
      expect.anything(),
      { expectedVersion: 1, name: "Cortesía", type: "FIXED", value: "5000" },
      expect.objectContaining({ "idempotency-key": expect.stringMatching(/^[0-9a-f-]{36}$/) }),
    );
  });

  it("configures service with PUT /accounts/:id/service", async () => {
    const auth = fakeAuth();
    await createBillingApi(auth).configureService("account-1", { expectedVersion: 1, percentage: "10" });
    expect(auth.authPut).toHaveBeenCalledWith(
      "/accounts/account-1/service",
      expect.anything(),
      { expectedVersion: 1, percentage: "10" },
      expect.objectContaining({ "idempotency-key": expect.any(String) }),
    );
  });

  it("fetches active payment methods with GET /payment-methods and unwraps the envelope", async () => {
    const auth = {
      authGet: vi.fn(async () => ({ paymentMethods: [{ id: "pm-1", name: "Efectivo", type: "CASH", active: true }] })),
      authPost: vi.fn(async () => ({}) as never),
      authPut: vi.fn(async () => ({}) as never),
    } as unknown as ReturnType<typeof fakeAuth>;
    const result = await createBillingApi(auth).getPaymentMethods();
    expect(auth.authGet).toHaveBeenCalledWith("/payment-methods", expect.anything());
    expect(result).toEqual([{ id: "pm-1", name: "Efectivo", type: "CASH", active: true }]);
  });

  it("registers a payment with POST /accounts/:id/payments and an Idempotency-Key header", async () => {
    const auth = fakeAuth();
    const input = { expectedVersion: 1, paymentMethodId: "pm-1", amountApplied: "500", printReceipt: true };
    await createBillingApi(auth).registerPayment("account-1", input);
    expect(auth.authPost).toHaveBeenCalledWith(
      "/accounts/account-1/payments",
      expect.anything(),
      input,
      expect.objectContaining({ "idempotency-key": expect.any(String) }),
    );
  });
});
