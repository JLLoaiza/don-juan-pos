import { describe, expect, it, vi } from "vitest";
import { buildApi } from "./app.js";
import type { AuthService } from "./auth.js";

const branch = { id: "00000000-0000-4000-8000-000000000003", name: "Centro", code: "CENTRO", settings: {} };
const context = { user: { id: "00000000-0000-4000-8000-000000000001", displayName: "Admin" }, branches: [branch], activeBranch: branch, permissions: ["dining_areas.view", "tables.view", "tables.change_status", "accounts.open", "accounts.view", "accounts.update", "sales.add_items", "kitchen.send"] };
const auth: AuthService = { login: async () => { throw new Error("not used"); }, refresh: async () => { throw new Error("not used"); }, context: async () => context, setActiveBranch: async () => context };
const floor = { floor: vi.fn(async () => ({ diningAreas: [], tables: [] })), account: vi.fn(), openAccount: vi.fn(async () => ({ id: "00000000-0000-4000-8000-000000000099" })), confirmConsumption: vi.fn(), changeTableStatus: vi.fn(async () => ({ id: "00000000-0000-4000-8000-000000000012", diningAreaId: "00000000-0000-4000-8000-000000000011", name: "Mesa 1", capacity: 4, status: "OCCUPIED", active: true, openAccountId: null, version: 2, canMarkAvailable: true, availabilityBlocker: null })) };

describe("floor HTTP authorization and contracts", () => {
  it("requires authentication before exposing the floor", async () => {
    const app = buildApi({ database: { check: async () => undefined }, auth, floor: floor as never });
    const response = await app.inject({ method: "GET", url: "/floor" });
    await app.close();
    expect(response.statusCode).toBe(401);
  });

  it("derives the active branch and rejects a missing idempotency key", async () => {
    const app = buildApi({ database: { check: async () => undefined }, auth, floor: floor as never });
    const payload = { tableId: "00000000-0000-4000-8000-000000000012", notes: null, companyId: "00000000-0000-4000-8000-000000000013" };
    const missingKey = await app.inject({ method: "POST", url: "/accounts", headers: { authorization: "Bearer token" }, payload });
    expect(missingKey.statusCode).toBe(400);
    const response = await app.inject({ method: "POST", url: "/accounts", headers: { authorization: "Bearer token", "idempotency-key": "00000000-0000-4000-8000-000000000010" }, payload });
    await app.close();
    expect(response.statusCode).toBe(200);
    expect(floor.openAccount).toHaveBeenLastCalledWith({ userId: context.user.id, branchId: branch.id }, "00000000-0000-4000-8000-000000000010", expect.objectContaining({ tableId: payload.tableId }));
    expect((floor.openAccount.mock.calls as unknown as [unknown, unknown, Record<string, unknown>][]).at(-1)?.[2]).not.toHaveProperty("companyId");
  });
  it("does not request account costs when the session lacks products.view_cost", async () => {
    const app = buildApi({ database: { check: async () => undefined }, auth, floor: floor as never });
    const accountId = "00000000-0000-4000-8000-000000000099";
    await app.inject({ method: "GET", url: `/accounts/${accountId}`, headers: { authorization: "Bearer token" } });
    await app.close();
    expect(floor.account).toHaveBeenLastCalledWith({ userId: context.user.id, branchId: branch.id }, accountId, false);
  });
  it("requires the status permission and idempotency key, deriving scope from session", async () => {
    const app = buildApi({ database: { check: async () => undefined }, auth, floor: floor as never });
    const tableId = "00000000-0000-4000-8000-000000000012";
    const payload = { targetStatus: "OCCUPIED", expectedVersion: 1, branchId: "00000000-0000-4000-8000-000000000099" };
    expect((await app.inject({ method: "POST", url: `/restaurant-tables/${tableId}/status`, headers: { authorization: "Bearer token" }, payload })).statusCode).toBe(400);
    const response = await app.inject({ method: "POST", url: `/restaurant-tables/${tableId}/status`, headers: { authorization: "Bearer token", "idempotency-key": "00000000-0000-4000-8000-000000000010" }, payload });
    await app.close();
    expect(response.statusCode).toBe(200);
    expect(floor.changeTableStatus).toHaveBeenLastCalledWith({ userId: context.user.id, branchId: branch.id }, "00000000-0000-4000-8000-000000000010", tableId, { targetStatus: "OCCUPIED", expectedVersion: 1 });
  });
  it("rejects the status command without tables.change_status", async () => {
    const noPermissionAuth: AuthService = { ...auth, context: async () => ({ ...context, permissions: context.permissions.filter((permission) => permission !== "tables.change_status") }) };
    const app = buildApi({ database: { check: async () => undefined }, auth: noPermissionAuth, floor: floor as never });
    const response = await app.inject({ method: "POST", url: "/restaurant-tables/00000000-0000-4000-8000-000000000012/status", headers: { authorization: "Bearer token", "idempotency-key": "00000000-0000-4000-8000-000000000010" }, payload: { targetStatus: "OCCUPIED", expectedVersion: 1 } });
    await app.close();
    expect(response.statusCode).toBe(403);
  });
  it("rejects operational table changes on Cloud", async () => {
    const app = buildApi({ database: { check: async () => undefined }, auth, floor: floor as never, deploymentMode: "cloud" });
    const response = await app.inject({ method: "POST", url: "/restaurant-tables/00000000-0000-4000-8000-000000000012/status", headers: { authorization: "Bearer token", "idempotency-key": "00000000-0000-4000-8000-000000000010" }, payload: { targetStatus: "OCCUPIED", expectedVersion: 1 } });
    await app.close();
    expect(response.statusCode).toBe(403);
  });
});
