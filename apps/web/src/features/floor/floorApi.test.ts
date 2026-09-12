import { describe, expect, it, vi } from "vitest";
import { ChangeRestaurantTableStatusResponseSchema } from "@don-juan/contracts";
import { createFloorApi } from "./floorApi";

function fakeAuth() {
  return {
    authGet: vi.fn(async () => ({}) as never),
    authPost: vi.fn(async () => ({}) as never),
  };
}

describe("createFloorApi", () => {
  it("fetches the floor snapshot with GET /floor", async () => {
    const auth = fakeAuth();
    await createFloorApi(auth).getFloor();
    expect(auth.authGet).toHaveBeenCalledWith("/floor", expect.anything());
  });

  it("fetches a single account with GET /accounts/:id", async () => {
    const auth = fakeAuth();
    await createFloorApi(auth).getAccount("account-1");
    expect(auth.authGet).toHaveBeenCalledWith("/accounts/account-1", expect.anything());
  });

  it("opens an account with POST /accounts and an Idempotency-Key header", async () => {
    const auth = fakeAuth();
    await createFloorApi(auth).openAccount({ tableId: "table-1", notes: null });
    expect(auth.authPost).toHaveBeenCalledWith(
      "/accounts",
      expect.anything(),
      { tableId: "table-1", notes: null },
      expect.objectContaining({ "idempotency-key": expect.stringMatching(/^[0-9a-f-]{36}$/) }),
    );
  });

  it("confirms consumption with POST /accounts/:id/confirm-consumption", async () => {
    const auth = fakeAuth();
    const input = { expectedVersion: 1, items: [{ productId: "p1", quantity: "2", selectedAdditionals: [], notes: null }] };
    await createFloorApi(auth).confirmConsumption("account-1", input);
    expect(auth.authPost).toHaveBeenCalledWith(
      "/accounts/account-1/confirm-consumption",
      expect.anything(),
      input,
      expect.objectContaining({ "idempotency-key": expect.any(String) }),
    );
  });

  it("creates a dining area with POST /dining-areas", async () => {
    const auth = fakeAuth();
    await createFloorApi(auth).createDiningArea({ name: "Salón principal" });
    expect(auth.authPost).toHaveBeenCalledWith(
      "/dining-areas",
      expect.anything(),
      { name: "Salón principal" },
      expect.objectContaining({ "idempotency-key": expect.any(String) }),
    );
  });

  it("creates a restaurant table with POST /restaurant-tables", async () => {
    const auth = fakeAuth();
    await createFloorApi(auth).createRestaurantTable({ diningAreaId: "area-1", name: "Mesa 1", capacity: 4, status: "AVAILABLE" });
    expect(auth.authPost).toHaveBeenCalledWith(
      "/restaurant-tables",
      expect.anything(),
      { diningAreaId: "area-1", name: "Mesa 1", capacity: 4, status: "AVAILABLE" },
      expect.objectContaining({ "idempotency-key": expect.any(String) }),
    );
  });

  it("changes a table status with POST /restaurant-tables/:id/status, a fresh Idempotency-Key and the response schema", async () => {
    const auth = fakeAuth();
    await createFloorApi(auth).changeTableStatus("table-1", { targetStatus: "OCCUPIED", expectedVersion: 3 });
    expect(auth.authPost).toHaveBeenCalledWith(
      "/restaurant-tables/table-1/status",
      ChangeRestaurantTableStatusResponseSchema,
      { targetStatus: "OCCUPIED", expectedVersion: 3 },
      expect.objectContaining({ "idempotency-key": expect.stringMatching(/^[0-9a-f-]{36}$/) }),
    );
  });

  it("generates a distinct Idempotency-Key for each new status-change intent", async () => {
    const auth = fakeAuth();
    const api = createFloorApi(auth);
    await api.changeTableStatus("table-1", { targetStatus: "OCCUPIED", expectedVersion: 3 });
    await api.changeTableStatus("table-1", { targetStatus: "AVAILABLE", expectedVersion: 4 });
    const calls = auth.authPost.mock.calls as unknown as Array<[string, unknown, unknown, Record<string, string>]>;
    const firstKey = calls[0]?.[3]?.["idempotency-key"];
    const secondKey = calls[1]?.[3]?.["idempotency-key"];
    expect(firstKey).toBeDefined();
    expect(secondKey).toBeDefined();
    expect(firstKey).not.toBe(secondKey);
  });
});
