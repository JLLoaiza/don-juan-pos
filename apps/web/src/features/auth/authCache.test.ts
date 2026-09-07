import { describe, expect, it } from "vitest";
import type { AuthContext } from "@don-juan/contracts";
import { clearAuthSnapshot, loadAuthSnapshot, saveAuthSnapshot } from "./authCache";

const CONTEXT: AuthContext = {
  user: { id: "00000000-0000-7000-8000-000000000002", displayName: "Ana" },
  branches: [{ id: "00000000-0000-7000-8000-000000000003", name: "Centro", code: "CTR", settings: {} }],
  activeBranch: { id: "00000000-0000-7000-8000-000000000003", name: "Centro", code: "CTR", settings: {} },
  permissions: ["floor.view"],
};

describe("auth snapshot cache", () => {
  it("returns undefined when nothing was saved", async () => {
    await clearAuthSnapshot();
    expect(await loadAuthSnapshot()).toBeUndefined();
  });

  it("round-trips a snapshot with its saved-at timestamp", async () => {
    await saveAuthSnapshot(CONTEXT, "2026-09-06T00:00:00.000Z");
    expect(await loadAuthSnapshot()).toEqual({ context: CONTEXT, savedAt: "2026-09-06T00:00:00.000Z" });
  });

  it("clears the snapshot", async () => {
    await saveAuthSnapshot(CONTEXT, "2026-09-06T00:00:00.000Z");
    await clearAuthSnapshot();
    expect(await loadAuthSnapshot()).toBeUndefined();
  });
});
