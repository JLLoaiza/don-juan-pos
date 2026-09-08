import { describe, expect, it, vi } from "vitest";
import type { AuthContext } from "@don-juan/contracts";
import { buildApi } from "./app.js";
import type { AuthService } from "./auth.js";

const branchId = "00000000-0000-4000-8000-000000000011"; const otherBranchId = "00000000-0000-4000-8000-000000000012";
const context: AuthContext = { user: { id: "00000000-0000-4000-8000-000000000010", displayName: "Admin" }, branches: [{ id: branchId, name: "Chipre", code: "CHP", settings: {} }], activeBranch: { id: branchId, name: "Chipre", code: "CHP", settings: {} }, permissions: ["replication.servers.manage", "replication.status.view"] };
const auth: AuthService = { login: async () => { throw new Error("unused"); }, refresh: async () => { throw new Error("unused"); }, context: async () => context, setActiveBranch: async () => context };

describe("local-first replication HTTP boundaries", () => {
  it("accepts Cloud replica events only through technical Edge identity", async () => {
    const replication = { receiveEdgeEvent: vi.fn(async () => ({ status: "ACCEPTED", receiptCursor: "1", receivedAt: "2026-09-08T00:00:00.000Z" })), createEnrollment: vi.fn(), claimEnrollment: vi.fn(), edgeStatus: vi.fn(), cloudStatus: vi.fn(), cloudEntities: vi.fn() };
    const app = buildApi({ database: { check: async () => undefined }, replication: replication as never, deploymentMode: "cloud" });
    const response = await app.inject({ method: "POST", url: "/replication/cloud/events", headers: { authorization: "Bearer edge-secret", "x-edge-server-id": "00000000-0000-4000-8000-000000000013" }, payload: { protocolVersion: 1, event: { operationId: "00000000-0000-4000-8000-000000000014", branchId, commandName: "inventory.create", aggregateType: "inventory_item", aggregateId: "00000000-0000-4000-8000-000000000015", payload: {} } } });
    await app.close(); expect(response.statusCode).toBe(200);
    expect(replication.receiveEdgeEvent).toHaveBeenCalledWith("00000000-0000-4000-8000-000000000013", "edge-secret", expect.objectContaining({ branchId }));
  });

  it("does not let Cloud accept operational writes or an Edge browser widen its branch", async () => {
    const cloudApp = buildApi({ database: { check: async () => undefined }, auth, deploymentMode: "cloud" });
    const cloudResponse = await cloudApp.inject({ method: "POST", url: "/sync/devices", headers: { authorization: "Bearer user" }, payload: {} });
    await cloudApp.close(); expect(cloudResponse.statusCode).toBe(403);
    const sync = { status: vi.fn(), devices: vi.fn(), registerDevice: vi.fn(), deactivateDevice: vi.fn(), pullChanges: vi.fn(), pushOperations: vi.fn(), conflicts: vi.fn(), discardConflict: vi.fn() };
    const edgeApp = buildApi({ database: { check: async () => undefined }, auth, sync: sync as never, deploymentMode: "edge", localBranchId: otherBranchId });
    const edgeResponse = await edgeApp.inject({ method: "GET", url: "/sync/status", headers: { authorization: "Bearer user" } });
    await edgeApp.close(); expect(edgeResponse.statusCode).toBe(403); expect(sync.status).not.toHaveBeenCalled();
  });
});