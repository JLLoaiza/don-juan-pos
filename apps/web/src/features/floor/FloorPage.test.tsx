import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AuthContext, FloorSnapshot } from "@don-juan/contracts";
import { ApiRequestError } from "../../lib/api/httpClient";
import { AuthReactContext, type AuthContextValue } from "../auth/AuthProvider";
import { FloorPage } from "./FloorPage";

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

function renderFloor(auth: AuthContextValue, initialEntries: string[] = ["/floor"]) {
  return render(
    <AuthReactContext.Provider value={auth}>
      <MemoryRouter initialEntries={initialEntries}>
        <Routes>
          <Route path="/floor" element={<FloorPage />} />
          <Route path="/floor/tables/:tableId/order" element={<div>Pending order view</div>} />
          <Route path="/floor/accounts/:accountId" element={<div>Account view</div>} />
        </Routes>
      </MemoryRouter>
    </AuthReactContext.Provider>,
  );
}

const SNAPSHOT: FloorSnapshot = {
  diningAreas: [{ id: "area-1", name: "Salón principal", active: true }],
  tables: [
    { id: "t1", diningAreaId: "area-1", name: "Mesa 1", capacity: 4, status: "AVAILABLE", active: true, openAccountId: null },
    { id: "t2", diningAreaId: "area-1", name: "Mesa 2", capacity: 2, status: "OCCUPIED", active: true, openAccountId: "acc-2" },
  ],
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("FloorPage", () => {
  it("shows a loading state while the floor snapshot is fetched", () => {
    const authGet = vi.fn(() => new Promise(() => {}));
    renderFloor(makeAuth({ authGet: authGet as unknown as AuthContextValue["authGet"] }));
    expect(screen.getByText("Cargando salón…")).toBeInTheDocument();
  });

  it("shows a forbidden state on 403 and a network state on a connectivity failure", async () => {
    const forbidden = vi.fn().mockRejectedValue(new ApiRequestError("Forbidden", "http", 403));
    const { unmount } = renderFloor(makeAuth({ authGet: forbidden as unknown as AuthContextValue["authGet"] }));
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.getByText(/no tiene los permisos de vista de salón/i)).toBeInTheDocument();
    unmount();

    const network = vi.fn().mockRejectedValue(new ApiRequestError("down", "network"));
    renderFloor(makeAuth({ authGet: network as unknown as AuthContextValue["authGet"] }));
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.getByText(/sin conexión/i)).toBeInTheDocument();
  });

  it("shows an empty-state message when there are no dining areas configured", async () => {
    const authGet = vi.fn().mockResolvedValue({ diningAreas: [], tables: [] });
    renderFloor(makeAuth({ authGet: authGet as unknown as AuthContextValue["authGet"] }));
    expect(await screen.findByText(/Aún no hay áreas ni mesas configuradas/)).toBeInTheDocument();
  });

  it("renders dining areas and tables, colored by status, and navigates to the open account for an occupied table", async () => {
    const authGet = vi.fn().mockResolvedValue(SNAPSHOT);
    renderFloor(makeAuth({ authGet: authGet as unknown as AuthContextValue["authGet"] }));

    expect(await screen.findByText("Salón principal")).toBeInTheDocument();
    expect(screen.getByText("Mesa 1")).toBeInTheDocument();
    expect(screen.getByText("Mesa 2")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Mesa 2").closest("button")!);
    expect(await screen.findByText("Account view")).toBeInTheDocument();
  });

  it("navigates to the pending order flow for an available table without calling POST /accounts", async () => {
    const authGet = vi.fn().mockResolvedValue(SNAPSHOT);
    const authPost = vi.fn();
    renderFloor(
      makeAuth({
        authGet: authGet as unknown as AuthContextValue["authGet"],
        authPost: authPost as unknown as AuthContextValue["authPost"],
        context: baseContext({ permissions: ["accounts.open"] }),
      }),
    );

    fireEvent.click((await screen.findByText("Mesa 1")).closest("button")!);
    expect(await screen.findByText("Pending order view")).toBeInTheDocument();
    expect(authPost).not.toHaveBeenCalled();
  });

  it("does not let a user without accounts.open open a table", async () => {
    const authGet = vi.fn().mockResolvedValue(SNAPSHOT);
    renderFloor(makeAuth({ authGet: authGet as unknown as AuthContextValue["authGet"], context: baseContext({ permissions: [] }) }));

    const button = (await screen.findByText("Mesa 1")).closest("button")!;
    expect(button).toBeDisabled();
  });

  it("hides the create-area/create-table actions without their permissions", async () => {
    const authGet = vi.fn().mockResolvedValue(SNAPSHOT);
    renderFloor(makeAuth({ authGet: authGet as unknown as AuthContextValue["authGet"], context: baseContext({ permissions: [] }) }));
    await screen.findByText("Salón principal");
    expect(screen.queryByRole("button", { name: "Nueva área" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Nueva mesa" })).not.toBeInTheDocument();
  });

  it("creates a dining area end-to-end and reloads the floor", async () => {
    const authGet = vi.fn().mockResolvedValue({ diningAreas: [], tables: [] });
    const authPost = vi.fn().mockResolvedValue({ id: "area-2", name: "Terraza", active: true });
    renderFloor(
      makeAuth({
        authGet: authGet as unknown as AuthContextValue["authGet"],
        authPost: authPost as unknown as AuthContextValue["authPost"],
        context: baseContext({ permissions: ["dining_areas.create"] }),
      }),
    );

    fireEvent.click(await screen.findByRole("button", { name: "Nueva área" }));
    fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: "Terraza" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() => expect(authPost).toHaveBeenCalledWith("/dining-areas", expect.anything(), { name: "Terraza" }, expect.anything()));
    await waitFor(() => expect(authGet).toHaveBeenCalledTimes(2));
  });

  it("creates a restaurant table end-to-end and reloads the floor", async () => {
    const areaId = "11111111-1111-7111-8111-111111111111";
    const authGet = vi.fn().mockResolvedValue({ diningAreas: [{ id: areaId, name: "Salón principal", active: true }], tables: [] });
    const authPost = vi.fn().mockResolvedValue({ id: "t3", diningAreaId: areaId, name: "Mesa 3", capacity: 4, status: "AVAILABLE", active: true, openAccountId: null });
    renderFloor(
      makeAuth({
        authGet: authGet as unknown as AuthContextValue["authGet"],
        authPost: authPost as unknown as AuthContextValue["authPost"],
        context: baseContext({ permissions: ["tables.create"] }),
      }),
    );

    fireEvent.click(await screen.findByRole("button", { name: "Nueva mesa" }));
    fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: "Mesa 3" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() =>
      expect(authPost).toHaveBeenCalledWith(
        "/restaurant-tables",
        expect.anything(),
        { diningAreaId: areaId, name: "Mesa 3", capacity: 4, status: "AVAILABLE" },
        expect.anything(),
      ),
    );
    await waitFor(() => expect(authGet).toHaveBeenCalledTimes(2));
  });
});
