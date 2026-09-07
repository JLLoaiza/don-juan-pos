import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createHttpClient } from "./httpClient";

const schema = z.object({ value: z.string() });

describe("createHttpClient", () => {
  it("parses a successful JSON response with the given schema", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ value: "ok" }), { status: 200 }));
    const client = createHttpClient({ baseUrl: "http://api.local", fetchImpl: fetchImpl as unknown as typeof fetch });

    const result = await client.getJson("/thing", schema);

    expect(result).toEqual({ value: "ok" });
    expect(fetchImpl).toHaveBeenCalledWith("http://api.local/thing", expect.objectContaining({ method: "GET" }));
  });

  it("throws a network ApiRequestError when fetch rejects", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("boom");
    });
    const client = createHttpClient({ baseUrl: "http://api.local", fetchImpl: fetchImpl as unknown as typeof fetch });

    await expect(client.getJson("/thing", schema)).rejects.toMatchObject({ kind: "network" });
  });

  it("throws an http ApiRequestError with the parsed API error on non-2xx", async () => {
    const body = { code: "NOT_FOUND", message: "No existe" };
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify(body), { status: 404 }));
    const client = createHttpClient({ baseUrl: "http://api.local", fetchImpl: fetchImpl as unknown as typeof fetch });

    await expect(client.getJson("/thing", schema)).rejects.toMatchObject({
      kind: "http",
      status: 404,
      message: "No existe",
    });
  });

  it("rejects a response that fails schema validation", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ value: 42 }), { status: 200 }));
    const client = createHttpClient({ baseUrl: "http://api.local", fetchImpl: fetchImpl as unknown as typeof fetch });

    await expect(client.getJson("/thing", schema)).rejects.toBeDefined();
  });
});
