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
});
