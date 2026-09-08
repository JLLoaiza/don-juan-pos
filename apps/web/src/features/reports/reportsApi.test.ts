import { describe, expect, it, vi } from "vitest";
import { createReportsApi } from "./reportsApi";

function fakeAuth() {
  return { authGet: vi.fn(async () => ({}) as never), authGetBlob: vi.fn(async () => ({}) as never) };
}

describe("createReportsApi", () => {
  it("fetches the dashboard with GET /reports/dashboard and no query string when no filters are given", async () => {
    const auth = fakeAuth();
    await createReportsApi(auth).getDashboard({});
    expect(auth.authGet).toHaveBeenCalledWith("/reports/dashboard", expect.anything());
  });

  it("fetches sales with from/to/page/pageSize as a query string", async () => {
    const auth = fakeAuth();
    await createReportsApi(auth).getSales({ from: "2026-09-01T00:00:00.000Z", to: "2026-09-02T00:00:00.000Z", page: 2, pageSize: 50 });
    expect(auth.authGet).toHaveBeenCalledWith(
      "/reports/sales?from=2026-09-01T00%3A00%3A00.000Z&to=2026-09-02T00%3A00%3A00.000Z&page=2&pageSize=50",
      expect.anything(),
    );
  });

  it("fetches product performance with GET /reports/products", async () => {
    const auth = fakeAuth();
    await createReportsApi(auth).getProducts({ page: 1, pageSize: 50 });
    expect(auth.authGet).toHaveBeenCalledWith("/reports/products?page=1&pageSize=50", expect.anything());
  });

  it("exports sales CSV as a blob via GET /reports/sales/export.csv, never generating it in the browser", async () => {
    const auth = fakeAuth();
    await createReportsApi(auth).exportSalesCsv({ from: "2026-09-01T00:00:00.000Z" });
    expect(auth.authGetBlob).toHaveBeenCalledWith("/reports/sales/export.csv?from=2026-09-01T00%3A00%3A00.000Z");
  });
});
