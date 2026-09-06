import { describe, expect, it } from "vitest";
import { buildApi } from "./app.js";

describe("GET /health", () => {
  it("reports a healthy database", async () => {
    const app = buildApi({
      database: { check: async () => undefined },
      clock: () => new Date("2026-09-06T00:00:00.000Z"),
    });
    const response = await app.inject({ method: "GET", url: "/health" });
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok", database: "ok", checkedAt: "2026-09-06T00:00:00.000Z" });
  });

  it("does not expose a database failure", async () => {
    const app = buildApi({
      database: { check: async () => Promise.reject(new Error("password=secret")) },
      clock: () => new Date("2026-09-06T00:00:00.000Z"),
    });
    const response = await app.inject({ method: "GET", url: "/health" });
    await app.close();

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ status: "degraded", database: "unavailable", checkedAt: "2026-09-06T00:00:00.000Z" });
  });
});

