import "fake-indexeddb/auto";
import "@testing-library/jest-dom/vitest";
import { configure } from "@testing-library/dom";
import { cleanup } from "@testing-library/react";
import { afterEach, beforeAll } from "vitest";
import { deleteCacheEntry, getCacheEntry, putCacheEntry } from "../local/db";

// IndexedDB (even the fake in-memory implementation used in tests) can add
// noticeable latency under CI/parallel load. The default 1000ms `waitFor`
// timeout is too tight for flows that persist the auth snapshot.
configure({ asyncUtilTimeout: 5000 });

// fake-indexeddb's first open + read/write transaction in a fresh test-file
// worker can take over a second — longer than most `waitFor` defaults. Pay
// that cost once here, before any test's timing-sensitive assertions run.
beforeAll(async () => {
  try {
    await putCacheEntry("__warmup__", true);
    await getCacheEntry("__warmup__");
    await deleteCacheEntry("__warmup__");
  } catch {
    // Best-effort warm-up; a real failure will surface in the test that needs it.
  }
});

afterEach(() => {
  cleanup();
});
