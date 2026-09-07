import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AuthContext, CatalogSnapshot } from "@don-juan/contracts";
import { ApiRequestError } from "../../lib/api/httpClient";
import { AuthReactContext, type AuthContextValue } from "../auth/AuthProvider";
import { CatalogPage } from "./CatalogPage";

const BRANCH = { id: "b1", name: "Centro", code: "CTR", settings: {} };

const INVENTORY_ITEM = {
  id: "11111111-1111-7111-8111-111111111111",
  name: "Carne de res",
  unit: "KG" as const,
  unitCost: "2.500000",
  currentStock: "10.000000",
  minimumStock: "2.000000",
  stockState: "OK" as const,
  notes: null,
  active: true,
  version: 1,
};

const PRODUCT_WITH_COST = {
  id: "33333333-3333-7333-8333-333333333333",
  name: "Bandeja paisa",
  description: null,
  salePrice: "25.00",
  calculatedCost: "10.000000",
  active: true,
  version: 1,
  components: [{ type: "INVENTORY_ITEM" as const, inventoryItemId: INVENTORY_ITEM.id, quantity: "1.000000" }],
  additionals: [],
};

function emptySnapshot(): CatalogSnapshot {
  return { inventoryItems: [], accompaniments: [], products: [] };
}

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

function renderCatalog(auth: AuthContextValue) {
  return render(
    <AuthReactContext.Provider value={auth}>
      <CatalogPage />
    </AuthReactContext.Provider>,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("CatalogPage", () => {
  it("shows a loading state while the snapshot is being fetched", () => {
    const authGet = vi.fn(() => new Promise(() => {}));
    renderCatalog(makeAuth({ authGet: authGet as unknown as AuthContextValue["authGet"] }));

    expect(screen.getByText("Cargando catálogo…")).toBeInTheDocument();
  });

  it("shows a forbidden state when the backend rejects the catalog view permissions, and retries on demand", async () => {
    const authGet = vi
      .fn()
      .mockRejectedValueOnce(new ApiRequestError("Forbidden", "http", 403))
      .mockResolvedValueOnce(emptySnapshot());
    renderCatalog(makeAuth({ authGet: authGet as unknown as AuthContextValue["authGet"] }));

    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.getByText(/no tiene todos los permisos de vista de catálogo/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    await waitFor(() => expect(screen.getByText("Productos (0)")).toBeInTheDocument());
    expect(authGet).toHaveBeenCalledTimes(2);
  });

  it("shows a network error state distinct from a forbidden one", async () => {
    const authGet = vi.fn().mockRejectedValue(new ApiRequestError("No se pudo contactar", "network"));
    renderCatalog(makeAuth({ authGet: authGet as unknown as AuthContextValue["authGet"] }));

    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.queryByText(/no tiene todos los permisos/i)).not.toBeInTheDocument();
    expect(screen.getByText(/sin conexión/i)).toBeInTheDocument();
  });

  it("renders tabs with live counts and an empty state per section", async () => {
    const authGet = vi.fn().mockResolvedValue(emptySnapshot());
    renderCatalog(makeAuth({ authGet: authGet as unknown as AuthContextValue["authGet"] }));

    await waitFor(() => expect(screen.getByText("Productos (0)")).toBeInTheDocument());
    expect(screen.getByText("Sin productos")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Inventario (0)"));
    expect(screen.getByText("Sin ítems de inventario")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Acompañamientos (0)"));
    expect(screen.getByText("Sin acompañamientos")).toBeInTheDocument();
  });

  it("hides the create action without the create permission and shows it once granted", async () => {
    const authGet = vi.fn().mockResolvedValue(emptySnapshot());

    const { rerender } = render(
      <AuthReactContext.Provider value={makeAuth({ authGet: authGet as unknown as AuthContextValue["authGet"] })}>
        <CatalogPage />
      </AuthReactContext.Provider>,
    );
    await waitFor(() => expect(screen.getByText("Productos (0)")).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "Nuevo producto" })).not.toBeInTheDocument();

    rerender(
      <AuthReactContext.Provider
        value={makeAuth({
          authGet: authGet as unknown as AuthContextValue["authGet"],
          context: baseContext({ permissions: ["products.create"] }),
        })}
      >
        <CatalogPage />
      </AuthReactContext.Provider>,
    );
    expect(await screen.findByRole("button", { name: "Nuevo producto" })).toBeInTheDocument();
  });

  it("only shows cost and margin columns when the backend actually returned a calculated cost", async () => {
    const withCost = vi.fn().mockResolvedValue({ inventoryItems: [], accompaniments: [], products: [PRODUCT_WITH_COST] });
    renderCatalog(makeAuth({ authGet: withCost as unknown as AuthContextValue["authGet"] }));
    await waitFor(() => expect(screen.getByText("Bandeja paisa")).toBeInTheDocument());
    expect(screen.getByRole("columnheader", { name: "Costo calculado" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Margen" })).toBeInTheDocument();
  });

  it("hides cost and margin columns for a user without cost-viewing permission (backend nulls the field)", async () => {
    const withoutCost = vi.fn().mockResolvedValue({
      inventoryItems: [],
      accompaniments: [],
      products: [{ ...PRODUCT_WITH_COST, calculatedCost: null }],
    });
    renderCatalog(makeAuth({ authGet: withoutCost as unknown as AuthContextValue["authGet"] }));
    await waitFor(() => expect(screen.getByText("Bandeja paisa")).toBeInTheDocument());
    expect(screen.queryByRole("columnheader", { name: "Costo calculado" })).not.toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "Margen" })).not.toBeInTheDocument();
  });

  it("creates an inventory item end-to-end and reloads the snapshot", async () => {
    const authGet = vi.fn().mockResolvedValue(emptySnapshot());
    const authPost = vi.fn().mockResolvedValue({ ...INVENTORY_ITEM, name: "Pollo" });
    renderCatalog(
      makeAuth({
        authGet: authGet as unknown as AuthContextValue["authGet"],
        authPost: authPost as unknown as AuthContextValue["authPost"],
        context: baseContext({ permissions: ["inventory.create"] }),
      }),
    );

    await waitFor(() => expect(screen.getByText("Inventario (0)")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Inventario (0)"));
    fireEvent.click(screen.getByRole("button", { name: "Nuevo ítem" }));

    fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: "Pollo" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() => expect(authPost).toHaveBeenCalledTimes(1));
    expect(authPost.mock.calls[0]?.[0]).toBe("/catalog/inventory-items");
    expect(authPost.mock.calls[0]?.[2]).toMatchObject({ name: "Pollo", unit: "UNIT" });
    await waitFor(() => expect(authGet).toHaveBeenCalledTimes(2));
  });

  it("rejects a stock adjustment of zero client-side without calling the API", async () => {
    const authGet = vi.fn().mockResolvedValue({ inventoryItems: [INVENTORY_ITEM], accompaniments: [], products: [] });
    const authPost = vi.fn();
    renderCatalog(
      makeAuth({
        authGet: authGet as unknown as AuthContextValue["authGet"],
        authPost: authPost as unknown as AuthContextValue["authPost"],
        context: baseContext({ permissions: ["inventory.adjust"] }),
      }),
    );

    fireEvent.click(await screen.findByText(/^Inventario/));
    fireEvent.click(await screen.findByRole("button", { name: "Ajustar stock" }));

    const quantityInput = screen.getByLabelText(/cantidad a sumar o restar/i);
    fireEvent.change(quantityInput, { target: { value: "0" } });
    fireEvent.change(screen.getByLabelText("Motivo"), { target: { value: "Conteo" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirmar ajuste" }));

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(authPost).not.toHaveBeenCalled();
  });

  it("does not show inventory actions a user lacks permission for", async () => {
    const authGet = vi.fn().mockResolvedValue({ inventoryItems: [INVENTORY_ITEM], accompaniments: [], products: [] });
    renderCatalog(makeAuth({ authGet: authGet as unknown as AuthContextValue["authGet"], context: baseContext({ permissions: [] }) }));

    fireEvent.click(await screen.findByText(/^Inventario/));
    const row = (await screen.findByText("Carne de res")).closest("tr");
    expect(row).not.toBeNull();
    expect(within(row as HTMLElement).queryByText("Editar")).not.toBeInTheDocument();
    expect(within(row as HTMLElement).queryByText("Ajustar stock")).not.toBeInTheDocument();
  });
});
