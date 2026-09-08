import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AuthContext } from "@don-juan/contracts";
import { ApiRequestError } from "../../lib/api/httpClient";
import { AuthReactContext, type AuthContextValue } from "../auth/AuthProvider";
import { ProcurementPage } from "./ProcurementPage";

const BRANCH = { id: "b1", name: "Centro", code: "CTR", settings: {} };
const ID = "11111111-1111-7111-8111-111111111111";
const purchase = { id: ID, supplierId: null, documentNumber: "FC-001", purchaseDate: "2026-09-07", subtotal: "10", taxTotal: "0", discountTotal: "0", total: "10", paymentMethodId: null, cashSessionId: null, status: "CONFIRMED", notes: null, createdAt: "2026-09-07T12:00:00.000Z", voidedAt: null };
function context(overrides: Partial<AuthContext> = {}): AuthContext { return { user: { id: "u1", displayName: "Ana" }, branches: [BRANCH], activeBranch: BRANCH, permissions: [], ...overrides }; }
function authFor(get: ReturnType<typeof vi.fn>, overrides: Partial<AuthContextValue> = {}): AuthContextValue { return { status: "authenticated", context: context(), session: null, isStale: false, staleSince: null, login: vi.fn(), logout: vi.fn(), setActiveBranch: vi.fn(), authGet: get as never, authPost: vi.fn(), authPut: vi.fn(), ...overrides }; }
const listGet = () => vi.fn((path: string) => Promise.resolve(path === "/suppliers" ? { suppliers: [] } : path === "/purchases" ? { purchases: [purchase] } : { expenses: [] }));
function renderPage(auth: AuthContextValue) { return render(<AuthReactContext.Provider value={auth}><ProcurementPage /></AuthReactContext.Provider>); }
afterEach(() => vi.restoreAllMocks());

describe("ProcurementPage", () => {
  it("renders an explicit backend-forbidden state", async () => {
    renderPage(authFor(vi.fn().mockRejectedValue(new ApiRequestError("Forbidden", "http", 403))));
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.getByText(/permisos de consulta/i)).toBeInTheDocument();
  });

  it("hides procurement mutations without permission and voids only after explicit confirmation", async () => {
    const get = listGet(); const post = vi.fn().mockResolvedValue({ ...purchase, status: "VOID" });
    const { rerender } = renderPage(authFor(get));
    expect(await screen.findByText("FC-001")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Anular" })).not.toBeInTheDocument();
    rerender(<AuthReactContext.Provider value={authFor(get, { authPost: post as never, context: context({ permissions: ["purchases.void"] }) })}><ProcurementPage /></AuthReactContext.Provider>);
    fireEvent.click(await screen.findByRole("button", { name: "Anular" }));
    expect(screen.getByText(/no edita ni borra/i)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Motivo"), { target: { value: "Documento duplicado" } });
    expect(screen.getByRole("button", { name: "Confirmar anulación" })).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Confirmar anulación" }));
    await waitFor(() => expect(post).toHaveBeenCalled());
    expect(post.mock.calls[0]?.[0]).toBe(`/purchases/${ID}/void`);
    expect(post.mock.calls[0]?.[2]).toEqual({ reason: "Documento duplicado" });
    expect(post.mock.calls[0]?.[3]).toMatchObject({ "idempotency-key": expect.any(String) });
  });

  it("invalidates procurement lists when the active branch changes", async () => {
    const get = listGet(); const { rerender } = renderPage(authFor(get));
    await screen.findByText("FC-001"); expect(get).toHaveBeenCalledTimes(3);
    const other = { id: "b2", name: "Norte", code: "NTE", settings: {} };
    rerender(<AuthReactContext.Provider value={authFor(get, { context: context({ branches: [BRANCH, other], activeBranch: other }) })}><ProcurementPage /></AuthReactContext.Provider>);
    await waitFor(() => expect(get).toHaveBeenCalledTimes(6));
  });
});
