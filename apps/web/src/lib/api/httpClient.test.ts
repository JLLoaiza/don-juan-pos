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

  it("posts a JSON body with a content-type header and any extra headers", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ value: "ok" }), { status: 200 }));
    const client = createHttpClient({ baseUrl: "http://api.local", fetchImpl: fetchImpl as unknown as typeof fetch });

    await client.postJson("/thing", schema, { body: { a: 1 }, headers: { authorization: "Bearer t" } });

    expect(fetchImpl).toHaveBeenCalledWith("http://api.local/thing", {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/json", authorization: "Bearer t" },
      body: JSON.stringify({ a: 1 }),
    });
  });

  it("posts without a body when none is given", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ value: "ok" }), { status: 200 }));
    const client = createHttpClient({ baseUrl: "http://api.local", fetchImpl: fetchImpl as unknown as typeof fetch });

    await client.postJson("/thing", schema);

    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.body).toBeUndefined();
    expect(init.headers).toEqual({ accept: "application/json" });
  });

  it("puts a JSON body with a content-type header and any extra headers", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ value: "ok" }), { status: 200 }));
    const client = createHttpClient({ baseUrl: "http://api.local", fetchImpl: fetchImpl as unknown as typeof fetch });

    await client.putJson("/thing/1", schema, { body: { a: 1 }, headers: { authorization: "Bearer t", "idempotency-key": "op-1" } });

    expect(fetchImpl).toHaveBeenCalledWith("http://api.local/thing/1", {
      method: "PUT",
      headers: { accept: "application/json", "content-type": "application/json", authorization: "Bearer t", "idempotency-key": "op-1" },
      body: JSON.stringify({ a: 1 }),
    });
  });

  describe("getBlob", () => {
    it("returns the response body as a Blob with the filename from Content-Disposition", async () => {
      const fetchImpl = vi.fn(async () =>
        new Response("a,b\n1,2", {
          status: 200,
          headers: { "content-disposition": 'attachment; filename="reports-sales.csv"' },
        }),
      );
      const client = createHttpClient({ baseUrl: "http://api.local", fetchImpl: fetchImpl as unknown as typeof fetch });

      const result = await client.getBlob("/reports/sales/export.csv", { headers: { authorization: "Bearer t" } });

      expect(fetchImpl).toHaveBeenCalledWith("http://api.local/reports/sales/export.csv", {
        method: "GET",
        headers: { authorization: "Bearer t" },
      });
      expect(result.filename).toBe("reports-sales.csv");
      expect(await result.blob.text()).toBe("a,b\n1,2");
    });

    it("returns a null filename when the server sends no Content-Disposition", async () => {
      const fetchImpl = vi.fn(async () => new Response("data", { status: 200 }));
      const client = createHttpClient({ baseUrl: "http://api.local", fetchImpl: fetchImpl as unknown as typeof fetch });

      const result = await client.getBlob("/thing");

      expect(result.filename).toBeNull();
    });

    it("throws an http ApiRequestError with the parsed API error on non-2xx", async () => {
      const body = { code: "FORBIDDEN", message: "Permission reports.export is required" };
      const fetchImpl = vi.fn(async () => new Response(JSON.stringify(body), { status: 403 }));
      const client = createHttpClient({ baseUrl: "http://api.local", fetchImpl: fetchImpl as unknown as typeof fetch });

      await expect(client.getBlob("/thing")).rejects.toMatchObject({ kind: "http", status: 403, message: body.message });
    });

    it("throws a network ApiRequestError when fetch rejects", async () => {
      const fetchImpl = vi.fn(async () => {
        throw new Error("boom");
      });
      const client = createHttpClient({ baseUrl: "http://api.local", fetchImpl: fetchImpl as unknown as typeof fetch });

      await expect(client.getBlob("/thing")).rejects.toMatchObject({ kind: "network" });
    });
  });
});
