import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AuthContext } from "@don-juan/contracts";
import { ApiRequestError } from "../../lib/api/httpClient";
import { AuthReactContext, type AuthContextValue } from "../auth/AuthProvider";
import { saveBlob } from "../../lib/download";
import { ReportsPage } from "./ReportsPage";

vi.mock("../../lib/download", () => ({ saveBlob: vi.fn() }));

const BRANCH = { id: "b1", name: "Centro", code: "CTR", settings: {} };

function baseContext(overrides: Partial<AuthContext> = {}): AuthContext {
  return { user: { id: "u1", displayName: "Ana" }, branches: [BRANCH], activeBranch: BRANCH, permissions: [], ...overrides };
}

function makeAuth(overrides: Partial<AuthContextValue> = {}): AuthContextValue {
  return {
    status: "authenticated",
    context: baseContext(),
    session: null,
    isStale: false,
    staleSince: null,
    login: vi.fn(),
    logout: vi.fn(),
    setActiveBranch: vi.fn(),
    authGet: vi.fn(),
    authPost: vi.fn(),
    authPut: vi.fn(),
    authGetBlob: vi.fn(),
    ...overrides,
  };
}

const FRESHNESS = { branchId: "b1", lastReceivedAt: "2026-09-08T10:00:00.000Z", stale: false, source: "CONFIRMED_CLOUD_REPLICA" as const };

const DASHBOARD_WITH_COSTS = {
  freshness: FRESHNESS,
  sales: { collected: "150000.00", payments: 3, averageTicket: "50000.00" },
  profitability: { historicalCost: "60000.00", grossProfit: "90000.00", grossMarginPercent: "60" },
  operations: { openAccounts: 2, occupiedTables: 4 },
};

const DASHBOARD_NO_COSTS = {
  freshness: FRESHNESS,
  sales: { collected: "150000.00", payments: 3, averageTicket: "50000.00" },
  profitability: {},
  operations: { openAccounts: 2, occupiedTables: 4 },
};

const SALES_REPORT = {
  freshness: FRESHNESS,
  page: { page: 1, pageSize: 50, total: 1 },
  totals: { payments: 1, collected: "50000.00" },
  rows: [
    {
      paymentId: "p1",
      accountId: "a1",
      receivedAt: "2026-09-08T09:00:00.000Z",
      paymentMethodName: "Efectivo",
      paymentMethodType: "CASH" as const,
      amount: "50000.00",
    },
  ],
};

const PRODUCTS_REPORT = {
  freshness: FRESHNESS,
  page: { page: 1, pageSize: 50, total: 1 },
  totals: { products: 1, revenue: "50000.00" },
  rows: [{ productId: "prod1", productName: "Churrasco", quantity: "2", revenue: "50000.00" }],
};

function routedAuthGet(dashboard: unknown, sales: unknown, products: unknown) {
  return vi.fn((path: string) => {
    if (path.startsWith("/reports/dashboard")) return dashboard instanceof Error ? Promise.reject(dashboard) : Promise.resolve(dashboard);
    if (path.startsWith("/reports/sales")) return sales instanceof Error ? Promise.reject(sales) : Promise.resolve(sales);
    if (path.startsWith("/reports/products")) return products instanceof Error ? Promise.reject(products) : Promise.resolve(products);
    throw new Error(`unexpected path ${path}`);
  });
}

function renderPage(auth: AuthContextValue) {
  return render(
    <AuthReactContext.Provider value={auth}>
      <ReportsPage />
    </AuthReactContext.Provider>,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ReportsPage", () => {
  it("shows a loading state while the dashboard is fetched", () => {
    const authGet = vi.fn(() => new Promise(() => {}));
    renderPage(makeAuth({ authGet: authGet as unknown as AuthContextValue["authGet"] }));
    expect(screen.getByText("Cargando panel…")).toBeInTheDocument();
  });

  it("shows a cloud-only message on a 422 (edge deployment) and never attempts sales/products", async () => {
    const authGet = vi.fn().mockRejectedValue(
      new ApiRequestError("Reports are available only from confirmed Cloud replicas", "http", 422),
    );
    renderPage(makeAuth({ authGet: authGet as unknown as AuthContextValue["authGet"] }));

    expect(await screen.findByText("Los reportes sólo existen en la nube")).toBeInTheDocument();
    await waitFor(() => expect(authGet).toHaveBeenCalledTimes(1));
  });

  it("renders dashboard, sales and products with cost columns when the backend includes them", async () => {
    const productsWithCosts = {
      ...PRODUCTS_REPORT,
      totals: { ...PRODUCTS_REPORT.totals, historicalCost: "20000.00", grossProfit: "30000.00" },
      rows: [{ ...PRODUCTS_REPORT.rows[0], historicalCost: "20000.00", grossProfit: "30000.00" }],
    };
    const authGet = routedAuthGet(DASHBOARD_WITH_COSTS, SALES_REPORT, productsWithCosts);
    renderPage(makeAuth({ authGet: authGet as unknown as AuthContextValue["authGet"] }));

    await screen.findByText("Margen bruto");
    await waitFor(() => expect(screen.getByText("Churrasco")).toBeInTheDocument());
    // Both the dashboard summary and the products table grow cost columns.
    expect(screen.getAllByText("Costo histórico")).toHaveLength(2);
    expect(screen.getAllByText("Utilidad bruta")).toHaveLength(2);
  });

  it("hides cost/margin fields entirely when the backend omits them", async () => {
    const authGet = routedAuthGet(DASHBOARD_NO_COSTS, SALES_REPORT, PRODUCTS_REPORT);
    renderPage(makeAuth({ authGet: authGet as unknown as AuthContextValue["authGet"] }));

    await screen.findByText("Ventas cobradas");
    expect(screen.queryByText("Costo histórico")).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("Churrasco")).toBeInTheDocument());
  });

  it("keeps sales and products working even when the dashboard alone lacks permission", async () => {
    const authGet = routedAuthGet(new ApiRequestError("Forbidden", "http", 403), SALES_REPORT, PRODUCTS_REPORT);
    renderPage(makeAuth({ authGet: authGet as unknown as AuthContextValue["authGet"] }));

    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText("Churrasco")).toBeInTheDocument());
  });

  it("shows empty states when a report has no rows", async () => {
    const emptySales = { ...SALES_REPORT, rows: [], page: { ...SALES_REPORT.page, total: 0 }, totals: { payments: 0, collected: "0" } };
    const emptyProducts = { ...PRODUCTS_REPORT, rows: [], page: { ...PRODUCTS_REPORT.page, total: 0 }, totals: { products: 0, revenue: "0" } };
    const authGet = routedAuthGet(DASHBOARD_NO_COSTS, emptySales, emptyProducts);
    renderPage(makeAuth({ authGet: authGet as unknown as AuthContextValue["authGet"] }));

    expect(await screen.findByText("Sin pagos en este rango")).toBeInTheDocument();
    expect(await screen.findByText("Sin ventas de producto en este rango")).toBeInTheDocument();
  });

  it("refetches every report when a date preset changes", async () => {
    const authGet = routedAuthGet(DASHBOARD_NO_COSTS, SALES_REPORT, PRODUCTS_REPORT);
    renderPage(makeAuth({ authGet: authGet as unknown as AuthContextValue["authGet"] }));
    await screen.findByText("Ventas cobradas");
    await waitFor(() => expect(screen.getByText("Churrasco")).toBeInTheDocument());
    const callsBefore = authGet.mock.calls.length;

    fireEvent.click(screen.getByRole("button", { name: "Ayer" }));

    await waitFor(() => expect(authGet.mock.calls.length).toBeGreaterThan(callsBefore));
  });

  it("exports the CSV by downloading the real endpoint's bytes, never generating them in the browser", async () => {
    const blob = new Blob(["a,b\n1,2"], { type: "text/csv" });
    const authGet = routedAuthGet(DASHBOARD_NO_COSTS, SALES_REPORT, PRODUCTS_REPORT);
    const authGetBlob = vi.fn().mockResolvedValue({ blob, filename: "reports-sales.csv" });
    renderPage(makeAuth({ authGet: authGet as unknown as AuthContextValue["authGet"], authGetBlob }));

    const exportButton = await screen.findByRole("button", { name: "Exportar CSV" });
    await waitFor(() => expect(exportButton).not.toBeDisabled());
    fireEvent.click(exportButton);

    await waitFor(() => expect(authGetBlob).toHaveBeenCalledWith(expect.stringContaining("/reports/sales/export.csv")));
    await waitFor(() => expect(saveBlob).toHaveBeenCalledWith(blob, "reports-sales.csv"));
  });

  it("shows a clear export error without blocking the rest of the page", async () => {
    const authGet = routedAuthGet(DASHBOARD_NO_COSTS, SALES_REPORT, PRODUCTS_REPORT);
    const authGetBlob = vi.fn().mockRejectedValue(new ApiRequestError("Forbidden", "http", 403));
    renderPage(makeAuth({ authGet: authGet as unknown as AuthContextValue["authGet"], authGetBlob }));

    const exportButton = await screen.findByRole("button", { name: "Exportar CSV" });
    await waitFor(() => expect(exportButton).not.toBeDisabled());
    fireEvent.click(exportButton);

    expect(await screen.findByText("No se pudo exportar")).toBeInTheDocument();
    expect(screen.getByText(/reports\.export/)).toBeInTheDocument();
    expect(screen.getByText("Churrasco")).toBeInTheDocument();
  });

  it("shows a network error state when the dashboard cannot be reached", async () => {
    const authGet = vi.fn().mockRejectedValue(new ApiRequestError("down", "network"));
    renderPage(makeAuth({ authGet: authGet as unknown as AuthContextValue["authGet"] }));

    await waitFor(() => expect(screen.getAllByText(/sin conexión/i).length).toBeGreaterThan(0));
  });
});
