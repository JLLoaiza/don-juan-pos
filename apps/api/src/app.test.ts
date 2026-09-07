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
  it("allows the configured PWA origin and handles its preflight", async () => {
    const app = buildApi({
      database: { check: async () => undefined },
      corsOrigins: ["http://localhost:5173"],
    });
    const response = await app.inject({
      method: "OPTIONS",
      url: "/health",
      headers: { origin: "http://localhost:5173" },
    });
    await app.close();

    expect(response.statusCode).toBe(204);
    expect(response.headers["access-control-allow-origin"]).toBe("http://localhost:5173");
  });
});
