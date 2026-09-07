import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AuthContext } from "@don-juan/contracts";
import { ApiRequestError } from "../../lib/api/httpClient";
import { AuthReactContext, type AuthContextValue } from "../auth/AuthProvider";
import { CashPage } from "./CashPage";
import type { CashRegisterContext } from "./cashApi";

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
    ...overrides,
  };
}

const CLOSED_REGISTER: CashRegisterContext = { id: "11111111-1111-7111-8111-111111111111", name: "Caja Principal", active: true, openSession: null };
const OPEN_SESSION = {
  id: "33333333-3333-7333-8333-333333333333",
  cashRegisterId: "11111111-1111-7111-8111-111111111111",
  status: "OPEN" as const,
  openingAmount: "100000.00",
  expectedCash: null,
  countedCash: null,
  difference: null,
  openedByUserId: "u1",
  openedAt: "2026-09-07T11:00:00.000Z",
  closedAt: null,
  version: 1,
};
const OPEN_REGISTER: CashRegisterContext = { id: "22222222-2222-7222-8222-222222222222", name: "Caja Terraza", active: true, openSession: OPEN_SESSION };

function renderCash(auth: AuthContextValue) {
  return render(
    <AuthReactContext.Provider value={auth}>
      <CashPage />
    </AuthReactContext.Provider>,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("CashPage", () => {
  it("shows a loading state while cash registers are fetched", () => {
    const authGet = vi.fn(() => new Promise(() => {}));
    renderCash(makeAuth({ authGet: authGet as unknown as AuthContextValue["authGet"] }));
    expect(screen.getByText("Cargando caja…")).toBeInTheDocument();
  });

  it("shows a forbidden state on 403 and a network state on a connectivity failure", async () => {
    const forbidden = vi.fn().mockRejectedValue(new ApiRequestError("Forbidden", "http", 403));
    const { unmount } = renderCash(makeAuth({ authGet: forbidden as unknown as AuthContextValue["authGet"] }));
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.getByText(/permiso de vista de caja/i)).toBeInTheDocument();
    unmount();

    const network = vi.fn().mockRejectedValue(new ApiRequestError("down", "network"));
    renderCash(makeAuth({ authGet: network as unknown as AuthContextValue["authGet"] }));
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.getByText(/sin conexión/i)).toBeInTheDocument();
  });

  it("shows an empty state when the branch has no cash registers", async () => {
    const authGet = vi.fn().mockResolvedValue({ cashRegisters: [] });
    renderCash(makeAuth({ authGet: authGet as unknown as AuthContextValue["authGet"] }));
    expect(await screen.findByText("Sin cajas")).toBeInTheDocument();
  });

  it("lists cash registers with their status, and hides open/adjust/close actions without permission", async () => {
    const authGet = vi.fn().mockResolvedValue({ cashRegisters: [CLOSED_REGISTER, OPEN_REGISTER] });
    renderCash(makeAuth({ authGet: authGet as unknown as AuthContextValue["authGet"], context: baseContext({ permissions: [] }) }));

    expect(await screen.findByText("Caja Principal")).toBeInTheDocument();
    expect(screen.getByText("Cerrada")).toBeInTheDocument();
    expect(screen.getByText("Abierta")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Abrir caja" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ajustar efectivo" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cerrar caja" })).not.toBeInTheDocument();
  });

  it("opens a cash session end-to-end and reloads the list", async () => {
    const authGet = vi.fn().mockResolvedValue({ cashRegisters: [CLOSED_REGISTER] });
    const authPost = vi.fn().mockResolvedValue(OPEN_SESSION);
    renderCash(
      makeAuth({
        authGet: authGet as unknown as AuthContextValue["authGet"],
        authPost: authPost as unknown as AuthContextValue["authPost"],
        context: baseContext({ permissions: ["cash.open"] }),
      }),
    );

    fireEvent.click(await screen.findByRole("button", { name: "Abrir caja" }));
    fireEvent.change(screen.getByLabelText("Monto inicial"), { target: { value: "100000" } });
    fireEvent.click(screen.getByRole("button", { name: "Abrir caja" }));

    await waitFor(() => expect(authPost).toHaveBeenCalled());
    expect(authPost.mock.calls[0]?.[0]).toBe("/cash-sessions");
    expect(authPost.mock.calls[0]?.[2]).toMatchObject({ cashRegisterId: "11111111-1111-7111-8111-111111111111", openingAmount: "100000" });
    await waitFor(() => expect(authGet).toHaveBeenCalledTimes(2));
  });

  it("adjusts cash in an open session end-to-end", async () => {
    const authGet = vi.fn().mockResolvedValue({ cashRegisters: [OPEN_REGISTER] });
    const authPost = vi.fn().mockResolvedValue({ ...OPEN_SESSION, version: 2 });
    renderCash(
      makeAuth({
        authGet: authGet as unknown as AuthContextValue["authGet"],
        authPost: authPost as unknown as AuthContextValue["authPost"],
        context: baseContext({ permissions: ["cash.adjust"] }),
      }),
    );

    fireEvent.click(await screen.findByRole("button", { name: "Ajustar efectivo" }));
    fireEvent.change(screen.getByLabelText("Monto"), { target: { value: "20000" } });
    fireEvent.change(screen.getByLabelText("Motivo"), { target: { value: "Retiro parcial" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirmar ajuste" }));

    await waitFor(() => expect(authPost).toHaveBeenCalled());
    expect(authPost.mock.calls[0]?.[0]).toBe("/cash-sessions/33333333-3333-7333-8333-333333333333/adjustments");
    expect(authPost.mock.calls[0]?.[2]).toMatchObject({ expectedVersion: 1, amount: "20000", direction: "INCREASE", reason: "Retiro parcial" });
  });

  it("closes a cash session end-to-end and shows the expected/counted/difference summary", async () => {
    const authGet = vi.fn().mockResolvedValue({ cashRegisters: [OPEN_REGISTER] });
    const authPost = vi.fn().mockResolvedValue({
      ...OPEN_SESSION,
      status: "CLOSED",
      closedAt: "2026-09-07T20:00:00.000Z",
      expectedCash: "120000.00",
      countedCash: "119500.00",
      difference: "-500.00",
      version: 2,
    });
    renderCash(
      makeAuth({
        authGet: authGet as unknown as AuthContextValue["authGet"],
        authPost: authPost as unknown as AuthContextValue["authPost"],
        context: baseContext({ permissions: ["cash.close"] }),
      }),
    );

    fireEvent.click(await screen.findByRole("button", { name: "Cerrar caja" }));
    fireEvent.change(screen.getByLabelText("Efectivo contado"), { target: { value: "119500" } });
    fireEvent.click(screen.getByRole("button", { name: "Cerrar caja" }));

    await waitFor(() => expect(authPost).toHaveBeenCalled());
    expect(authPost.mock.calls[0]?.[0]).toBe("/cash-sessions/33333333-3333-7333-8333-333333333333/close");
    expect(authPost.mock.calls[0]?.[2]).toMatchObject({ expectedVersion: 1, countedCash: "119500" });
    expect(await screen.findByText(/Esperado 120000.*Contado 119500.*Diferencia -500/)).toBeInTheDocument();
  });
});
