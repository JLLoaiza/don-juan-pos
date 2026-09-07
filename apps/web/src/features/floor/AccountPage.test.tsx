import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AccountSnapshot, AuthContext, BillingSnapshot, CatalogSnapshot } from "@don-juan/contracts";
import { AuthReactContext, type AuthContextValue } from "../auth/AuthProvider";
import { AccountPage } from "./AccountPage";

const BRANCH = { id: "b1", name: "Centro", code: "CTR", settings: {} };

const CATALOG_VIEW_PERMS = ["products.view", "inventory.view", "accompaniments.view"];
const ADD_ITEMS_PERMS = ["accounts.update", "sales.add_items", "kitchen.send"];

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
    ...overrides,
  };
}

function account(overrides: Partial<AccountSnapshot> = {}): AccountSnapshot {
  return {
    id: "acc-1",
    tableId: "t1",
    customerId: null,
    openedByUserId: "u1",
    status: "OPEN",
    openedAt: "2026-09-07T12:00:00.000Z",
    closedAt: null,
    subtotal: "25000.00",
    discountTotal: "0.00",
    servicePercentage: "10.00",
    serviceTotal: "2500.00",
    taxTotal: "0.00",
    total: "27500.00",
    notes: null,
    version: 3,
    items: [
      {
        id: "item-1",
        productId: "11111111-1111-7111-8111-111111111111",
        productName: "Combo pollo",
        quantity: "1.000000",
        unitSalePrice: "25000.00",
        unitCost: "10000.000000",
        discountTotal: "0.00",
        taxRate: "0.00",
        lineSubtotal: "25000.00",
        lineTotal: "25000.00",
        notes: null,
        status: "CONFIRMED",
        additionals: [],
        consumptionSnapshot: {},
        createdAt: "2026-09-07T12:01:00.000Z",
      },
    ],
    ...overrides,
  };
}

function billingSnapshot(overrides: Partial<BillingSnapshot> = {}): BillingSnapshot {
  return {
    accountId: "acc-1",
    status: "OPEN",
    version: 3,
    settlementMode: "DIRECT",
    subtotal: "25000.00",
    discountTotal: "0.00",
    taxTotal: "0.00",
    servicePercentage: "10.00",
    serviceTotal: "2500.00",
    total: "27500.00",
    paidTotal: "0.00",
    remainingBalance: "27500.00",
    hasPayments: false,
    discounts: [],
    splits: [],
    payments: [],
    ...overrides,
  };
}

function catalogSnapshot(): CatalogSnapshot {
  return {
    inventoryItems: [],
    accompaniments: [],
    products: [
      {
        id: "11111111-1111-7111-8111-111111111111",
        name: "Combo pollo",
        description: null,
        salePrice: "25000.00",
        calculatedCost: null,
        active: true,
        version: 1,
        components: [],
        additionals: [],
      },
    ],
  };
}

function renderAccountPage(auth: AuthContextValue, accountId = "acc-1") {
  return render(
    <AuthReactContext.Provider value={auth}>
      <MemoryRouter initialEntries={[`/floor/accounts/${accountId}`]}>
        <Routes>
          <Route path="/floor/accounts/:accountId" element={<AccountPage />} />
        </Routes>
      </MemoryRouter>
    </AuthReactContext.Provider>,
  );
}

function routedAuthGet(routes: { account: AccountSnapshot; catalog?: CatalogSnapshot; billing?: BillingSnapshot }) {
  return vi.fn(async (path: string) => {
    if (path.endsWith("/billing")) {
      return routes.billing ?? billingSnapshot({ accountId: routes.account.id, version: routes.account.version });
    }
    if (path.startsWith("/accounts/")) return routes.account;
    if (path === "/catalog") return routes.catalog ?? catalogSnapshot();
    throw new Error(`Unexpected path ${path}`);
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("AccountPage", () => {
  it("shows a loading state while the account is fetched", () => {
    const authGet = vi.fn(() => new Promise(() => {}));
    renderAccountPage(makeAuth({ authGet: authGet as unknown as AuthContextValue["authGet"] }));
    expect(screen.getByText("Cargando cuenta…")).toBeInTheDocument();
  });

  it("renders account items and totals once loaded", async () => {
    const authGet = routedAuthGet({ account: account() });
    renderAccountPage(makeAuth({ authGet: authGet as unknown as AuthContextValue["authGet"], context: baseContext({ permissions: [] }) }));

    expect(await screen.findByText("Combo pollo")).toBeInTheDocument();
    expect(screen.getAllByText("27500").length).toBeGreaterThan(0);
  });

  it("hides unit cost from users without products.view_cost, and shows it to those who have it", async () => {
    const authGet = routedAuthGet({ account: account() });
    const { unmount } = renderAccountPage(
      makeAuth({ authGet: authGet as unknown as AuthContextValue["authGet"], context: baseContext({ permissions: [] }) }),
    );
    await screen.findByText("Combo pollo");
    expect(screen.queryByRole("columnheader", { name: "Costo unitario" })).not.toBeInTheDocument();
    unmount();

    const authGetWithCost = routedAuthGet({ account: account() });
    renderAccountPage(
      makeAuth({
        authGet: authGetWithCost as unknown as AuthContextValue["authGet"],
        context: baseContext({ permissions: ["products.view_cost"] }),
      }),
    );
    await screen.findByText("Combo pollo");
    expect(screen.getByRole("columnheader", { name: "Costo unitario" })).toBeInTheDocument();
  });

  it("does not offer to add items to a PAID account, or without the add-items permissions", async () => {
    const paid = routedAuthGet({ account: account({ status: "PAID" }) });
    const { unmount } = renderAccountPage(
      makeAuth({ authGet: paid as unknown as AuthContextValue["authGet"], context: baseContext({ permissions: [...ADD_ITEMS_PERMS, ...CATALOG_VIEW_PERMS] }) }),
    );
    await screen.findByText("Combo pollo");
    expect(screen.queryByText("Agregar consumo")).not.toBeInTheDocument();
    unmount();

    const openNoPerms = routedAuthGet({ account: account() });
    renderAccountPage(makeAuth({ authGet: openNoPerms as unknown as AuthContextValue["authGet"], context: baseContext({ permissions: [] }) }));
    await screen.findByText("Combo pollo");
    expect(screen.queryByText("Agregar consumo")).not.toBeInTheDocument();
  });

  it("confirms consumption end-to-end and shows the kitchen ticket confirmation", async () => {
    const authGet = routedAuthGet({ account: account() });
    const authPost = vi.fn().mockResolvedValue({
      account: account({ version: 4 }),
      kitchenOrder: { id: "ko-1", ticketNumber: "TCK-1", orderType: "ORDER", content: {}, createdAt: "2026-09-07T12:05:00.000Z" },
      printJob: { id: "pj-1", printerId: null, documentType: "KITCHEN_ORDER", status: "PENDING", attempts: 0, createdAt: "2026-09-07T12:05:00.000Z" },
      warnings: [],
    });
    renderAccountPage(
      makeAuth({
        authGet: authGet as unknown as AuthContextValue["authGet"],
        authPost: authPost as unknown as AuthContextValue["authPost"],
        context: baseContext({ permissions: [...ADD_ITEMS_PERMS, ...CATALOG_VIEW_PERMS] }),
      }),
    );

    fireEvent.click(await screen.findByRole("button", { name: "Agregar producto" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirmar y enviar a cocina" }));

    await waitFor(() => expect(authPost).toHaveBeenCalled());
    expect(authPost.mock.calls[0]?.[0]).toBe("/accounts/acc-1/confirm-consumption");
    expect(authPost.mock.calls[0]?.[2]).toMatchObject({ expectedVersion: 3, items: [{ productId: "11111111-1111-7111-8111-111111111111", quantity: "1" }] });
    expect(await screen.findByText(/Enviado a cocina \(ticket TCK-1\)/)).toBeInTheDocument();
  });

  it("shows a negative-stock warning banner without treating it as a failure", async () => {
    const authGet = routedAuthGet({ account: account() });
    const authPost = vi.fn().mockResolvedValue({
      account: account(),
      kitchenOrder: null,
      printJob: null,
      warnings: [{ type: "NEGATIVE_STOCK", inventoryItemId: "inv-1", inventoryItemName: "Pollo", currentStock: "-2.000000", unit: "UNIT" }],
    });
    renderAccountPage(
      makeAuth({
        authGet: authGet as unknown as AuthContextValue["authGet"],
        authPost: authPost as unknown as AuthContextValue["authPost"],
        context: baseContext({ permissions: [...ADD_ITEMS_PERMS, ...CATALOG_VIEW_PERMS] }),
      }),
    );

    fireEvent.click(await screen.findByRole("button", { name: "Agregar producto" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirmar y enviar a cocina" }));

    expect(await screen.findByText(/Aviso de stock negativo/)).toBeInTheDocument();
    expect(screen.getByText(/Pollo/)).toBeInTheDocument();
  });

  it("applies a discount end-to-end and reloads both billing and the account", async () => {
    const authGet = routedAuthGet({ account: account() });
    const authPost = vi.fn().mockResolvedValue(billingSnapshot({ discountTotal: "5000.00", total: "22500.00", remainingBalance: "22500.00" }));
    renderAccountPage(
      makeAuth({
        authGet: authGet as unknown as AuthContextValue["authGet"],
        authPost: authPost as unknown as AuthContextValue["authPost"],
        context: baseContext({ permissions: ["sales.apply_discount"] }),
      }),
    );

    fireEvent.click(await screen.findByRole("button", { name: "Aplicar descuento" }));
    fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: "Cortesía" } });
    fireEvent.change(screen.getByLabelText("Tipo"), { target: { value: "FIXED" } });
    fireEvent.change(screen.getByLabelText("Valor ($)"), { target: { value: "5000" } });
    fireEvent.click(screen.getByRole("button", { name: "Aplicar" }));

    await waitFor(() => expect(authPost).toHaveBeenCalled());
    expect(authPost.mock.calls[0]?.[0]).toBe("/accounts/acc-1/discounts");
    expect(authPost.mock.calls[0]?.[2]).toMatchObject({ expectedVersion: 3, name: "Cortesía", type: "FIXED", value: "5000" });
    // authGet is called again for both /accounts/acc-1 and /accounts/acc-1/billing after the change.
    await waitFor(() => expect(authGet.mock.calls.filter((call) => call[0] === "/accounts/acc-1/billing")).toHaveLength(2));
  });

  it("configures the service percentage end-to-end", async () => {
    const authGet = routedAuthGet({ account: account() });
    const authPut = vi.fn().mockResolvedValue(billingSnapshot({ servicePercentage: "15.00" }));
    renderAccountPage(
      makeAuth({
        authGet: authGet as unknown as AuthContextValue["authGet"],
        authPut: authPut as unknown as AuthContextValue["authPut"],
        context: baseContext({ permissions: ["sales.modify_service"] }),
      }),
    );

    fireEvent.click(await screen.findByRole("button", { name: "Configurar servicio" }));
    const percentageInput = screen.getByLabelText("Porcentaje de servicio (%)");
    fireEvent.change(percentageInput, { target: { value: "15" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() => expect(authPut).toHaveBeenCalled());
    expect(authPut.mock.calls[0]?.[0]).toBe("/accounts/acc-1/service");
    expect(authPut.mock.calls[0]?.[2]).toMatchObject({ expectedVersion: 3, percentage: "15" });
  });

  it("hides discount/service actions once the account has payments, matching the backend rule", async () => {
    const authGet = routedAuthGet({ account: account(), billing: billingSnapshot({ hasPayments: true, paidTotal: "10000.00", remainingBalance: "17500.00" }) });
    renderAccountPage(
      makeAuth({
        authGet: authGet as unknown as AuthContextValue["authGet"],
        context: baseContext({ permissions: ["sales.apply_discount", "sales.modify_service", "payments.create", ...ADD_ITEMS_PERMS, ...CATALOG_VIEW_PERMS] }),
      }),
    );

    await screen.findByText("Cobro");
    expect(screen.queryByRole("button", { name: "Aplicar descuento" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Configurar servicio" })).not.toBeInTheDocument();
    // Consumption is blocked too once a payment exists, even though the account status is still OPEN.
    expect(screen.queryByText("Agregar consumo")).not.toBeInTheDocument();
  });

  it("shows the payment-registration blocker note only with payments.create, remaining balance, and no way to invent a payment-method picker", async () => {
    const authGet = routedAuthGet({ account: account() });
    renderAccountPage(
      makeAuth({
        authGet: authGet as unknown as AuthContextValue["authGet"],
        context: baseContext({ permissions: ["payments.create"] }),
      }),
    );
    expect(await screen.findByText(/no publica un listado de métodos de pago/)).toBeInTheDocument();
  });

  it("does not show the payment-registration blocker note without payments.create", async () => {
    const authGet = routedAuthGet({ account: account() });
    renderAccountPage(makeAuth({ authGet: authGet as unknown as AuthContextValue["authGet"], context: baseContext({ permissions: [] }) }));
    await screen.findByText("Cobro");
    expect(screen.queryByText(/no publica un listado de métodos de pago/)).not.toBeInTheDocument();
  });

  it("lists payments already registered on the account", async () => {
    const authGet = routedAuthGet({
      account: account(),
      billing: billingSnapshot({
        hasPayments: true,
        paidTotal: "27500.00",
        remainingBalance: "0.00",
        payments: [
          {
            id: "pay-1",
            accountId: "acc-1",
            accountSplitId: null,
            paymentMethodId: "pm-1",
            paymentMethodName: "Efectivo",
            paymentMethodType: "CASH",
            status: "REGISTERED",
            amountApplied: "27500.00",
            cashReceived: "30000.00",
            changeAmount: "2500.00",
            reference: null,
            notes: null,
            cashSessionId: "cs-1",
            receivedByUserId: "u1",
            receivedAt: "2026-09-07T13:00:00.000Z",
          },
        ],
      }),
    });
    renderAccountPage(makeAuth({ authGet: authGet as unknown as AuthContextValue["authGet"], context: baseContext({ permissions: [] }) }));

    expect(await screen.findByText("Efectivo")).toBeInTheDocument();
    expect(screen.getByText("Registrado")).toBeInTheDocument();
  });
});
