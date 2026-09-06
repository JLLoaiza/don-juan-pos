import { describe, expect, it } from "vitest";
import { retryDelaySeconds } from "./backoff.js";

describe("retryDelaySeconds", () => {
  it("grows exponentially and is capped", () => {
    expect(retryDelaySeconds(1)).toBe(2);
    expect(retryDelaySeconds(8)).toBe(256);
    expect(retryDelaySeconds(20)).toBe(300);
  });
});
