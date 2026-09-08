import { describe, expect, it, vi } from "vitest";
import { createReplicationApi } from "./replicationApi";

function fakeAuth() {
  return { authGet: vi.fn(async () => ({}) as never) };
}

describe("createReplicationApi", () => {
  it("fetches status with GET /replication/status", async () => {
    const auth = fakeAuth();
    await createReplicationApi(auth).getStatus();
    expect(auth.authGet).toHaveBeenCalledWith("/replication/status", expect.anything());
  });

  it("fetches replicated entities with GET /replication/cloud/entities", async () => {
    const auth = fakeAuth();
    await createReplicationApi(auth).getCloudEntities();
    expect(auth.authGet).toHaveBeenCalledWith("/replication/cloud/entities", expect.anything());
  });
});
