import { describe, expect, it, vi } from "vitest";
import type { HttpClient } from "./httpClient";
import { createHealthClient } from "./health";

describe("createHealthClient", () => {
  it("requests /health and returns the parsed response", async () => {
    const response = { status: "ok", database: "ok", checkedAt: "2026-09-06T00:00:00.000Z" };
    const getJson = vi.fn(async () => response) as unknown as HttpClient["getJson"];
    const http: HttpClient = { getJson };

    const health = createHealthClient(http);
    const result = await health.getHealth();

    expect(http.getJson).toHaveBeenCalledWith("/health", expect.anything());
    expect(result).toEqual(response);
  });
});
