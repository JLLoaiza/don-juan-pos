import { describe, expect, it } from "vitest";
import { HealthResponseSchema } from "./health.js";

describe("HealthResponseSchema", () => {
  it("accepts the public healthy response", () => {
    expect(
      HealthResponseSchema.parse({
        status: "ok",
        database: "ok",
        checkedAt: "2026-09-06T00:00:00.000Z",
      }),
    ).toMatchObject({ status: "ok" });
  });
});

