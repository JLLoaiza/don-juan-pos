import { describe, expect, it, vi } from "vitest";
import type { AuthContext } from "@don-juan/contracts";
import { buildApi } from "./app.js";
import type { AuthService } from "./auth.js";

const branch = { id: "00000000-0000-4000-8000-000000000002", name: "Centro", code: "CTR", settings: {} };
const context: AuthContext = { user: { id: "00000000-0000-4000-8000-000000000001", displayName: "Ana" }, branches: [branch], activeBranch: branch, permissions: ["sync.devices.view", "sync.devices.manage", "sync.changes.pull", "sync.status.view", "sync.operations.push", "sync.conflicts.view", "sync.conflicts.resolve"] };
const device = { id: "00000000-0000-4000-8000-000000000003", deviceIdentifier: "tablet-ana", deviceName: "Tablet Ana", deviceType: "TABLET", active: true, lastSyncAt: null, createdAt: "2026-09-07T12:00:00.000Z" };
const auth: AuthService = { login: async () => { throw new Error("not used"); }, refresh: async () => { throw new Error("not used"); }, context: async () => context, setActiveBranch: async () => context };

describe("sync HTTP contracts", () => {
  it("derives branch from auth for device registration and strips tenant fields", async () => {
    const sync = { registerDevice: vi.fn(async () => device), devices: vi.fn(), deactivateDevice: vi.fn(), status: vi.fn(), pullChanges: vi.fn() };
    const app = buildApi({ database: { check: async () => undefined }, auth, sync: sync as never });
    const response = await app.inject({ method: "POST", url: "/sync/devices", headers: { authorization: "Bearer token", "idempotency-key": "00000000-0000-4000-8000-000000000004" }, payload: { deviceIdentifier: "tablet-ana", deviceName: "Tablet Ana", deviceType: "TABLET", companyId: "foreign", branchId: "foreign" } });
    await app.close();
    expect(response.statusCode).toBe(200);
    expect(sync.registerDevice).toHaveBeenCalledWith({ userId: context.user.id, branchId: branch.id }, "00000000-0000-4000-8000-000000000004", expect.not.objectContaining({ companyId: expect.anything(), branchId: expect.anything() }));
  });

  it("validates pull cursor/device and uses only the authenticated active branch", async () => {
    const sync = { registerDevice: vi.fn(), devices: vi.fn(), deactivateDevice: vi.fn(), status: vi.fn(), pullChanges: vi.fn(async () => ({ changes: [], nextCursor: "12" })) };
    const app = buildApi({ database: { check: async () => undefined }, auth, sync: sync as never });
    const response = await app.inject({ method: "GET", url: `/sync/changes?deviceId=${device.id}&after=10&limit=50`, headers: { authorization: "Bearer token" } });
    await app.close();
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({ changes: [], nextCursor: "12" });
    expect(sync.pullChanges).toHaveBeenCalledWith({ userId: context.user.id, branchId: branch.id }, { deviceId: device.id, after: "10", limit: 50 });
  });

  it("pushes only authenticated branch operations and returns per-operation outcomes", async () => {
    const operationId = "00000000-0000-4000-8000-000000000005"; const entityId = "00000000-0000-4000-8000-000000000006";
    const sync = { registerDevice: vi.fn(), devices: vi.fn(), deactivateDevice: vi.fn(), status: vi.fn(), pullChanges: vi.fn(), pushOperations: vi.fn(async () => ({ results: [{ operationId, status: "PROCESSED", result: { ok: true }, error: null, conflictType: null }] })), conflicts: vi.fn(), discardConflict: vi.fn() };
    const app = buildApi({ database: { check: async () => undefined }, auth, sync: sync as never });
    const response = await app.inject({ method: "POST", url: "/sync/push", headers: { authorization: "Bearer token" }, payload: { deviceId: device.id, companyId: "foreign", branchId: "foreign", operations: [{ operationId, operationName: "employees.create", entityType: "employee", entityId, payload: { firstName: "Ana" } }] } });
    await app.close();
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({ results: [{ operationId, status: "PROCESSED", result: { ok: true }, error: null, conflictType: null }] });
    expect(sync.pushOperations).toHaveBeenCalledWith({ userId: context.user.id, branchId: branch.id }, expect.objectContaining({ deviceId: device.id, operations: [expect.not.objectContaining({ companyId: expect.anything(), branchId: expect.anything() })] }), expect.any(Function));
  });});
