import { afterEach, describe, expect, it, vi } from "vitest";
import { CloudIdentitySyncTransport } from "./identity-sync-worker.js";
import { HttpSyncOutboxTransport } from "./sync-worker.js";

afterEach(() => vi.unstubAllGlobals());

describe("Edge technical replication transports", () => {
  it("sends an outbox event with server identity, never a browser branch credential", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 })); vi.stubGlobal("fetch", fetchMock);
    await new HttpSyncOutboxTransport("https://cloud.test/replication/cloud/events", "00000000-0000-4000-8000-000000000001", "edge-secret").deliver({ id: "x", branchId: "00000000-0000-4000-8000-000000000002", operationId: "00000000-0000-4000-8000-000000000003", commandName: "inventory.create", aggregateType: "inventory_item", aggregateId: "00000000-0000-4000-8000-000000000004", payload: {}, attempts: 1 });
    expect(fetchMock).toHaveBeenCalledWith("https://cloud.test/replication/cloud/events", expect.objectContaining({ headers: expect.objectContaining({ "x-edge-server-id": "00000000-0000-4000-8000-000000000001", authorization: "Bearer edge-secret" }) }));
  });

  it("pulls a Cloud identity snapshot and applies it only through the local protected channel", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ branchId: "00000000-0000-4000-8000-000000000002" }), { status: 200, headers: { "content-type": "application/json" } }))
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await new CloudIdentitySyncTransport("https://cloud.test/identity", "00000000-0000-4000-8000-000000000001", "edge-secret", "http://127.0.0.1:3000/replication/edge/identity-snapshot", "internal-secret").synchronize();
    expect(fetchMock).toHaveBeenNthCalledWith(1, "https://cloud.test/identity", expect.objectContaining({ headers: expect.objectContaining({ "x-edge-server-id": "00000000-0000-4000-8000-000000000001" }) }));
    expect(fetchMock).toHaveBeenNthCalledWith(2, "http://127.0.0.1:3000/replication/edge/identity-snapshot", expect.objectContaining({ headers: expect.objectContaining({ "x-edge-internal-secret": "internal-secret" }) }));
  });
});