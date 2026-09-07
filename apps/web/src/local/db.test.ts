import { describe, expect, it } from "vitest";
import { deleteCacheEntry, getCacheEntry, putCacheEntry } from "./db";

describe("cache store", () => {
  it("returns undefined for a missing key", async () => {
    expect(await getCacheEntry("missing-key")).toBeUndefined();
  });

  it("round-trips a value", async () => {
    await putCacheEntry("k1", { hello: "world" });
    expect(await getCacheEntry("k1")).toEqual({ hello: "world" });
  });

  it("deletes a value", async () => {
    await putCacheEntry("k2", 42);
    await deleteCacheEntry("k2");
    expect(await getCacheEntry("k2")).toBeUndefined();
  });
});
