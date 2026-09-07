import { describe, expect, it, vi } from "vitest";
import { createCashApi } from "./cashApi";

function fakeAuth() {
  return {
    authGet: vi.fn(async () => ({}) as never),
    authPost: vi.fn(async () => ({}) as never),
  };
}

describe("createCashApi", () => {
  it("fetches cash registers with GET /cash-registers and unwraps the envelope", async () => {
    const auth = {
      authGet: vi.fn(async () => ({ cashRegisters: [{ id: "cr-1", name: "Caja Principal", active: true, openSession: null }] })),
      authPost: vi.fn(async () => ({}) as never),
    } as unknown as ReturnType<typeof fakeAuth>;
    const result = await createCashApi(auth).getCashRegisters();
    expect(auth.authGet).toHaveBeenCalledWith("/cash-registers", expect.anything());
    expect(result).toEqual([{ id: "cr-1", name: "Caja Principal", active: true, openSession: null }]);
  });

  it("fetches a register's open session with GET /cash-registers/:id/open-session", async () => {
    const auth = fakeAuth();
    await createCashApi(auth).getOpenSession("cr-1");
    expect(auth.authGet).toHaveBeenCalledWith("/cash-registers/cr-1/open-session", expect.anything());
  });

  it("opens a cash session with POST /cash-sessions and an Idempotency-Key header", async () => {
    const auth = fakeAuth();
    const input = { cashRegisterId: "cr-1", openingAmount: "100000", notes: null };
    await createCashApi(auth).openCashSession(input);
    expect(auth.authPost).toHaveBeenCalledWith(
      "/cash-sessions",
      expect.anything(),
      input,
      expect.objectContaining({ "idempotency-key": expect.stringMatching(/^[0-9a-f-]{36}$/) }),
    );
  });

  it("adjusts a cash session with POST /cash-sessions/:id/adjustments", async () => {
    const auth = fakeAuth();
    const input = { expectedVersion: 1, amount: "5000", direction: "DECREASE" as const, reason: "Retiro parcial" };
    await createCashApi(auth).adjustCashSession("cs-1", input);
    expect(auth.authPost).toHaveBeenCalledWith(
      "/cash-sessions/cs-1/adjustments",
      expect.anything(),
      input,
      expect.objectContaining({ "idempotency-key": expect.any(String) }),
    );
  });

  it("closes a cash session with POST /cash-sessions/:id/close", async () => {
    const auth = fakeAuth();
    const input = { expectedVersion: 1, countedCash: "150000", notes: null, printReceipt: true };
    await createCashApi(auth).closeCashSession("cs-1", input);
    expect(auth.authPost).toHaveBeenCalledWith(
      "/cash-sessions/cs-1/close",
      expect.anything(),
      input,
      expect.objectContaining({ "idempotency-key": expect.any(String) }),
    );
  });
});
