import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AccountSnapshot, AuthContext, CatalogSnapshot, FloorSnapshot } from "@don-juan/contracts";
import { ApiRequestError } from "../../lib/api/httpClient";
import { AuthReactContext, type AuthContextValue } from "../auth/AuthProvider";
import { PendingOrderPage } from "./PendingOrderPage";

const BRANCH = { id: "b1", name: "Centro", code: "CTR", settings: {} };
const CONFIRM_PERMS = ["accounts.update", "sales.add_items", "kitchen.send"];
const PRODUCT_ID = "11111111-1111-7111-8111-111111111111";

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

function floorSnapshot(overrides: Partial<FloorSnapshot["tables"][number]> = {}): FloorSnapshot {
  return {
    diningAreas: [{ id: "area-1", name: "Salón principal", active: true }],
    tables: [
      {
        id: "t1",
        diningAreaId: "area-1",
        name: "Mesa 1",
        capacity: 4,
        status: "AVAILABLE",
        active: true,
        openAccountId: null,
        version: 1,
        canMarkAvailable: false,
        availabilityBlocker: null,
        ...overrides,
      },
    ],
  };
}

function catalogSnapshot(): CatalogSnapshot {
  return {
    inventoryItems: [],
    accompaniments: [],
    products: [
      { id: PRODUCT_ID, name: "Combo pollo", description: null, salePrice: "25000.00", calculatedCost: null, active: true, version: 1, components: [], additionals: [] },
    ],
  };
}

function account(overrides: Partial<AccountSnapshot> = {}): AccountSnapshot {
  return {
    id: "acc-1",
    tableId: "t1",
    customerId: null,
    openedByUserId: "u1",
    status: "OPEN",
    openedAt: "2026-09-10T12:00:00.000Z",
    closedAt: null,
    subtotal: "0.00",
    discountTotal: "0.00",
    servicePercentage: "0.00",
    serviceTotal: "0.00",
    taxTotal: "0.00",
    total: "0.00",
    notes: null,
    version: 1,
    items: [],
    ...overrides,
  };
}

function routedAuthGet(routes: { floor: FloorSnapshot; catalog?: CatalogSnapshot; accounts?: Record<string, AccountSnapshot> }) {
  return vi.fn(async (path: string) => {
    if (path === "/floor") return routes.floor;
    if (path === "/catalog") return routes.catalog ?? catalogSnapshot();
    if (path.startsWith("/accounts/")) {
      const id = path.slice("/accounts/".length);
      const found = routes.accounts?.[id];
      if (found) return found;
      throw new Error(`Unexpected account id ${id}`);
    }
    throw new Error(`Unexpected path ${path}`);
  });
}

function renderPendingOrder(auth: AuthContextValue, tableId = "t1") {
  return render(
    <AuthReactContext.Provider value={auth}>
      <MemoryRouter initialEntries={[`/floor/tables/${tableId}/order`]}>
        <Routes>
          <Route path="/floor/tables/:tableId/order" element={<PendingOrderPage />} />
          <Route path="/floor" element={<div>Floor view</div>} />
          <Route path="/floor/accounts/:accountId" element={<div>Account view</div>} />
        </Routes>
      </MemoryRouter>
    </AuthReactContext.Provider>,
  );
}

function addAndSubmit() {
  fireEvent.click(screen.getByRole("button", { name: "Agregar producto" }));
  fireEvent.click(screen.getByRole("button", { name: "Confirmar y enviar a cocina" }));
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("PendingOrderPage", () => {
  it("blocks a user without accounts.open and does not call the API", async () => {
    const authGet = routedAuthGet({ floor: floorSnapshot() });
    const authPost = vi.fn();
    renderPendingOrder(
      makeAuth({
        authGet: authGet as unknown as AuthContextValue["authGet"],
        authPost: authPost as unknown as AuthContextValue["authPost"],
        context: baseContext({ permissions: [] }),
      }),
    );

    expect(await screen.findByText(/no tiene permiso para abrir cuentas/i)).toBeInTheDocument();
    expect(authPost).not.toHaveBeenCalled();
  });

  it("shows a not-found state when the table no longer exists", async () => {
    const authGet = routedAuthGet({ floor: { diningAreas: [], tables: [] } });
    renderPendingOrder(
      makeAuth({ authGet: authGet as unknown as AuthContextValue["authGet"], context: baseContext({ permissions: ["accounts.open"] }) }),
    );

    expect(await screen.findByText("Mesa no encontrada")).toBeInTheDocument();
  });

  it("redirects to the existing account when the table already has an open account, without calling the API", async () => {
    const authGet = routedAuthGet({ floor: floorSnapshot({ openAccountId: "acc-9" }) });
    const authPost = vi.fn();
    renderPendingOrder(
      makeAuth({
        authGet: authGet as unknown as AuthContextValue["authGet"],
        authPost: authPost as unknown as AuthContextValue["authPost"],
        context: baseContext({ permissions: ["accounts.open"] }),
      }),
    );

    expect(await screen.findByText("Account view")).toBeInTheDocument();
    expect(authPost).not.toHaveBeenCalled();
  });

  it("shows the table and hides the consumption form for a user missing the three confirm permissions", async () => {
    const authGet = routedAuthGet({ floor: floorSnapshot() });
    renderPendingOrder(
      makeAuth({ authGet: authGet as unknown as AuthContextValue["authGet"], context: baseContext({ permissions: ["accounts.open"] }) }),
    );

    expect(await screen.findByText("Pedido — Mesa 1")).toBeInTheDocument();
    expect(screen.getByText(/No tienes permisos para confirmar el pedido/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Agregar producto" })).not.toBeInTheDocument();
  });

  it("confirms an order end-to-end: opens the account once and confirms consumption with the returned version", async () => {
    const authGet = routedAuthGet({ floor: floorSnapshot() });
    const authPost = vi.fn(async (path: string, _schema: unknown, body: unknown) => {
      if (path === "/accounts") return account({ id: "acc-7", version: 5 });
      if (path === "/accounts/acc-7/confirm-consumption") {
        return { account: account({ id: "acc-7", version: 6 }), kitchenOrder: null, printJob: null, warnings: [] };
      }
      throw new Error(`Unexpected authPost path ${path} with body ${JSON.stringify(body)}`);
    });
    renderPendingOrder(
      makeAuth({
        authGet: authGet as unknown as AuthContextValue["authGet"],
        authPost: authPost as unknown as AuthContextValue["authPost"],
        context: baseContext({ permissions: ["accounts.open", ...CONFIRM_PERMS] }),
      }),
    );

    await screen.findByText("Pedido — Mesa 1");
    addAndSubmit();

    await waitFor(() => expect(authPost).toHaveBeenCalledTimes(2));
    expect(authPost.mock.calls[0]?.[0]).toBe("/accounts");
    expect(authPost.mock.calls[0]?.[2]).toEqual({ tableId: "t1", notes: null });
    expect(authPost.mock.calls[1]?.[0]).toBe("/accounts/acc-7/confirm-consumption");
    expect(authPost.mock.calls[1]?.[2]).toMatchObject({ expectedVersion: 5, items: [{ productId: PRODUCT_ID, quantity: "1" }] });
    expect(await screen.findByText("Account view")).toBeInTheDocument();
  });

  it("keeps the draft and shows the error when opening the account fails, without navigating away", async () => {
    const authGet = routedAuthGet({ floor: floorSnapshot() });
    const authPost = vi.fn().mockRejectedValue(new Error("No se pudo abrir la cuenta."));
    renderPendingOrder(
      makeAuth({
        authGet: authGet as unknown as AuthContextValue["authGet"],
        authPost: authPost as unknown as AuthContextValue["authPost"],
        context: baseContext({ permissions: ["accounts.open", ...CONFIRM_PERMS] }),
      }),
    );

    await screen.findByText("Pedido — Mesa 1");
    addAndSubmit();

    expect(await screen.findByText("No se pudo abrir la cuenta.")).toBeInTheDocument();
    expect(authPost).toHaveBeenCalledTimes(1);
    expect(authPost.mock.calls[0]?.[0]).toBe("/accounts");
    // The draft item is preserved: the quantity field for the added row is still on screen.
    expect(screen.getByLabelText("Cantidad")).toBeInTheDocument();
    expect(screen.getByText("Pedido — Mesa 1")).toBeInTheDocument();
  });

  it("does not open a second account when confirm-consumption fails after the account was created, and retries with the current version", async () => {
    const authGet = routedAuthGet({ floor: floorSnapshot(), accounts: { "acc-3": account({ id: "acc-3", version: 5 }) } });
    let confirmAttempts = 0;
    const authPost = vi.fn(async (path: string) => {
      if (path === "/accounts") return account({ id: "acc-3", version: 5 });
      if (path === "/accounts/acc-3/confirm-consumption") {
        confirmAttempts += 1;
        if (confirmAttempts === 1) throw new Error("Version conflict.");
        return { account: account({ id: "acc-3", version: 6 }), kitchenOrder: null, printJob: null, warnings: [] };
      }
      throw new Error(`Unexpected authPost path ${path}`);
    });
    renderPendingOrder(
      makeAuth({
        authGet: authGet as unknown as AuthContextValue["authGet"],
        authPost: authPost as unknown as AuthContextValue["authPost"],
        context: baseContext({ permissions: ["accounts.open", ...CONFIRM_PERMS] }),
      }),
    );

    await screen.findByText("Pedido — Mesa 1");
    addAndSubmit();
    expect(await screen.findByText("Version conflict.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Confirmar y enviar a cocina" }));

    await waitFor(() => expect(authPost.mock.calls.filter((call) => call[0] === "/accounts")).toHaveLength(1));
    await waitFor(() => expect(authGet.mock.calls.some((call) => call[0] === "/accounts/acc-3")).toBe(true));
    expect(await screen.findByText("Account view")).toBeInTheDocument();
  });

  it("navigates back to the floor without any mutation when the user cancels", async () => {
    const authGet = routedAuthGet({ floor: floorSnapshot() });
    const authPost = vi.fn();
    renderPendingOrder(
      makeAuth({
        authGet: authGet as unknown as AuthContextValue["authGet"],
        authPost: authPost as unknown as AuthContextValue["authPost"],
        context: baseContext({ permissions: ["accounts.open", ...CONFIRM_PERMS] }),
      }),
    );

    fireEvent.click(await screen.findByRole("button", { name: "Volver al salón" }));
    expect(await screen.findByText("Floor view")).toBeInTheDocument();
    expect(authPost).not.toHaveBeenCalled();
  });

  describe("manual status change", () => {
    function updatedTable(overrides: Partial<FloorSnapshot["tables"][number]> = {}) {
      return {
        id: "t1",
        diningAreaId: "area-1",
        name: "Mesa 1",
        capacity: 4,
        status: "OCCUPIED" as const,
        active: true,
        openAccountId: null,
        version: 2,
        canMarkAvailable: true,
        availabilityBlocker: null,
        ...overrides,
      };
    }

    it("shows and executes 'Marcar como ocupada' for an available table with tables.change_status, then reloads", async () => {
      const authGet = routedAuthGet({ floor: floorSnapshot({ status: "AVAILABLE", version: 3 }) });
      const authPost = vi.fn(async (path: string) => {
        if (path === "/restaurant-tables/t1/status") return updatedTable({ status: "OCCUPIED", version: 4 });
        throw new Error(`Unexpected authPost path ${path}`);
      });
      renderPendingOrder(
        makeAuth({
          authGet: authGet as unknown as AuthContextValue["authGet"],
          authPost: authPost as unknown as AuthContextValue["authPost"],
          context: baseContext({ permissions: ["accounts.open", "tables.change_status"] }),
        }),
      );

      await screen.findByText("Pedido — Mesa 1");
      fireEvent.click(screen.getByRole("button", { name: "Marcar como ocupada" }));

      await waitFor(() =>
        expect(authPost).toHaveBeenCalledWith(
          "/restaurant-tables/t1/status",
          expect.anything(),
          { targetStatus: "OCCUPIED", expectedVersion: 3 },
          expect.objectContaining({ "idempotency-key": expect.any(String) }),
        ),
      );
      expect(await screen.findByText(/marcada como ocupada/i)).toBeInTheDocument();
      await waitFor(() => expect(authGet.mock.calls.filter((call) => call[0] === "/floor")).toHaveLength(2));
    });

    it("shows and executes 'Marcar como disponible' for an eligible occupied table without needing accounts.open", async () => {
      const authGet = routedAuthGet({ floor: floorSnapshot({ status: "OCCUPIED", version: 5, canMarkAvailable: true, availabilityBlocker: null }) });
      const authPost = vi.fn(async (path: string) => {
        if (path === "/restaurant-tables/t1/status") return updatedTable({ status: "AVAILABLE", version: 6, canMarkAvailable: false });
        throw new Error(`Unexpected authPost path ${path}`);
      });
      renderPendingOrder(
        makeAuth({
          authGet: authGet as unknown as AuthContextValue["authGet"],
          authPost: authPost as unknown as AuthContextValue["authPost"],
          context: baseContext({ permissions: ["tables.change_status"] }),
        }),
      );

      await screen.findByText("Pedido — Mesa 1");
      fireEvent.click(screen.getByRole("button", { name: "Marcar como disponible" }));

      await waitFor(() =>
        expect(authPost).toHaveBeenCalledWith(
          "/restaurant-tables/t1/status",
          expect.anything(),
          { targetStatus: "AVAILABLE", expectedVersion: 5 },
          expect.objectContaining({ "idempotency-key": expect.any(String) }),
        ),
      );
      expect(await screen.findByText(/marcada como disponible/i)).toBeInTheDocument();
    });

    it("hides 'Marcar como disponible' and shows the blocker explanation when the table is not eligible", async () => {
      const authGet = routedAuthGet({ floor: floorSnapshot({ status: "OCCUPIED", version: 5, canMarkAvailable: false, availabilityBlocker: "OPEN_ACCOUNT_OR_ACTIVE_ORDERS" }) });
      renderPendingOrder(
        makeAuth({
          authGet: authGet as unknown as AuthContextValue["authGet"],
          context: baseContext({ permissions: ["tables.change_status"] }),
        }),
      );

      await screen.findByText("Pedido — Mesa 1");
      expect(screen.queryByRole("button", { name: "Marcar como disponible" })).not.toBeInTheDocument();
      expect(screen.getByText(/no puede marcarse como disponible porque tiene una cuenta abierta/i)).toBeInTheDocument();
    });

    it("hides both status actions without tables.change_status", async () => {
      const authGet = routedAuthGet({ floor: floorSnapshot({ status: "OCCUPIED", version: 5, canMarkAvailable: true, availabilityBlocker: null }) });
      renderPendingOrder(
        makeAuth({
          authGet: authGet as unknown as AuthContextValue["authGet"],
          context: baseContext({ permissions: [] }),
        }),
      );

      await screen.findByText("Pedido — Mesa 1");
      expect(screen.queryByRole("button", { name: "Marcar como disponible" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Marcar como ocupada" })).not.toBeInTheDocument();
    });

    it("does not offer status actions for a reserved table", async () => {
      const authGet = routedAuthGet({ floor: floorSnapshot({ status: "RESERVED" }) });
      renderPendingOrder(
        makeAuth({
          authGet: authGet as unknown as AuthContextValue["authGet"],
          context: baseContext({ permissions: ["accounts.open", "tables.change_status"] }),
        }),
      );

      await screen.findByText("Pedido — Mesa 1");
      expect(screen.queryByRole("button", { name: "Marcar como disponible" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Marcar como ocupada" })).not.toBeInTheDocument();
    });

    it("disables the status button while the mutation is pending, preventing a double click", async () => {
      const authGet = routedAuthGet({ floor: floorSnapshot({ status: "AVAILABLE", version: 1 }) });
      let resolvePost: (value: unknown) => void = () => {};
      const authPost = vi.fn(() => new Promise((resolve) => { resolvePost = resolve; }));
      renderPendingOrder(
        makeAuth({
          authGet: authGet as unknown as AuthContextValue["authGet"],
          authPost: authPost as unknown as AuthContextValue["authPost"],
          context: baseContext({ permissions: ["accounts.open", "tables.change_status"] }),
        }),
      );

      await screen.findByText("Pedido — Mesa 1");
      const button = screen.getByRole("button", { name: "Marcar como ocupada" });
      fireEvent.click(button);
      fireEvent.click(button);

      expect(button).toBeDisabled();
      expect(authPost).toHaveBeenCalledTimes(1);

      resolvePost(updatedTable({ status: "OCCUPIED", version: 2 }));
      await waitFor(() => expect(authGet.mock.calls.filter((call) => call[0] === "/floor")).toHaveLength(2));
      expect(authPost).toHaveBeenCalledTimes(1);
    });

    it("shows a conflict message and reloads the floor on a 409 response", async () => {
      const authGet = routedAuthGet({ floor: floorSnapshot({ status: "AVAILABLE", version: 1 }) });
      const authPost = vi.fn().mockRejectedValue(new ApiRequestError("Conflict", "http", 409));
      renderPendingOrder(
        makeAuth({
          authGet: authGet as unknown as AuthContextValue["authGet"],
          authPost: authPost as unknown as AuthContextValue["authPost"],
          context: baseContext({ permissions: ["accounts.open", "tables.change_status"] }),
        }),
      );

      await screen.findByText("Pedido — Mesa 1");
      fireEvent.click(screen.getByRole("button", { name: "Marcar como ocupada" }));

      expect(await screen.findByText(/el estado de la mesa cambió/i)).toBeInTheDocument();
      await waitFor(() => expect(authGet.mock.calls.filter((call) => call[0] === "/floor")).toHaveLength(2));
    });

    it("shows an explanatory message and reloads the floor on a 422 response", async () => {
      const authGet = routedAuthGet({ floor: floorSnapshot({ status: "OCCUPIED", version: 5, canMarkAvailable: true, availabilityBlocker: null }) });
      const authPost = vi.fn().mockRejectedValue(new ApiRequestError("blocked", "http", 422));
      renderPendingOrder(
        makeAuth({
          authGet: authGet as unknown as AuthContextValue["authGet"],
          authPost: authPost as unknown as AuthContextValue["authPost"],
          context: baseContext({ permissions: ["tables.change_status"] }),
        }),
      );

      await screen.findByText("Pedido — Mesa 1");
      fireEvent.click(screen.getByRole("button", { name: "Marcar como disponible" }));

      expect(await screen.findByText(/no puede marcarse como disponible porque tiene una cuenta abierta/i)).toBeInTheDocument();
      await waitFor(() => expect(authGet.mock.calls.filter((call) => call[0] === "/floor")).toHaveLength(2));
    });

    it("shows an uncertain-outcome message on a network error, without assuming success or failure, and reloads", async () => {
      const authGet = routedAuthGet({ floor: floorSnapshot({ status: "AVAILABLE", version: 1 }) });
      const authPost = vi.fn().mockRejectedValue(new ApiRequestError("down", "network"));
      renderPendingOrder(
        makeAuth({
          authGet: authGet as unknown as AuthContextValue["authGet"],
          authPost: authPost as unknown as AuthContextValue["authPost"],
          context: baseContext({ permissions: ["accounts.open", "tables.change_status"] }),
        }),
      );

      await screen.findByText("Pedido — Mesa 1");
      fireEvent.click(screen.getByRole("button", { name: "Marcar como ocupada" }));

      expect(await screen.findByText(/verifica el estado antes de reintentar/i)).toBeInTheDocument();
      await waitFor(() => expect(authGet.mock.calls.filter((call) => call[0] === "/floor")).toHaveLength(2));
    });

    it("allows preparing and confirming an order for a manually occupied table without an open account", async () => {
      const authGet = routedAuthGet({ floor: floorSnapshot({ status: "OCCUPIED", version: 2, canMarkAvailable: true, availabilityBlocker: null }) });
      const authPost = vi.fn(async (path: string, _schema: unknown, body: unknown) => {
        if (path === "/accounts") return account({ id: "acc-8", version: 1 });
        if (path === "/accounts/acc-8/confirm-consumption") {
          return { account: account({ id: "acc-8", version: 2 }), kitchenOrder: null, printJob: null, warnings: [] };
        }
        throw new Error(`Unexpected authPost path ${path} with body ${JSON.stringify(body)}`);
      });
      renderPendingOrder(
        makeAuth({
          authGet: authGet as unknown as AuthContextValue["authGet"],
          authPost: authPost as unknown as AuthContextValue["authPost"],
          context: baseContext({ permissions: ["accounts.open", ...CONFIRM_PERMS] }),
        }),
      );

      await screen.findByText("Pedido — Mesa 1");
      addAndSubmit();

      await waitFor(() => expect(authPost).toHaveBeenCalledTimes(2));
      expect(authPost.mock.calls[0]?.[0]).toBe("/accounts");
      expect(authPost.mock.calls[0]?.[2]).toEqual({ tableId: "t1", notes: null });
      expect(authPost.mock.calls[1]?.[0]).toBe("/accounts/acc-8/confirm-consumption");
      expect(await screen.findByText("Account view")).toBeInTheDocument();
    });
  });
});
