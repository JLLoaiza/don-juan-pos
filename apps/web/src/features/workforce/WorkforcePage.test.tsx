import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AuthContext } from "@don-juan/contracts";
import { ApiRequestError } from "../../lib/api/httpClient";
import { AuthReactContext, type AuthContextValue } from "../auth/AuthProvider";
import { WorkforcePage } from "./WorkforcePage";

const BRANCH = { id: "b1", name: "Centro", code: "CTR", settings: {} };
const ID = "11111111-1111-7111-8111-111111111111";
const employee = { id: ID, firstName: "Ana", lastName: "López", documentNumber: null, phone: null, email: null, position: "Cajera", notes: null, active: true, version: 1 };
function context(overrides: Partial<AuthContext> = {}): AuthContext { return { user: { id: "u1", displayName: "Ana" }, branches: [BRANCH], activeBranch: BRANCH, permissions: [], ...overrides }; }
function authFor(get: ReturnType<typeof vi.fn>, overrides: Partial<AuthContextValue> = {}): AuthContextValue { return { status: "authenticated", context: context(), session: null, isStale: false, staleSince: null, login: vi.fn(), logout: vi.fn(), setActiveBranch: vi.fn(), authGet: get as never, authPost: vi.fn(), authPut: vi.fn(), ...overrides }; }
const emptyGet = vi.fn((path: string) => Promise.resolve(path === "/employees" ? { employees: [] } : path === "/employee-shifts" ? { shifts: [] } : path === "/employee-bonuses" ? { bonuses: [] } : { payments: [] }));
function renderPage(auth: AuthContextValue) { return render(<AuthReactContext.Provider value={auth}><WorkforcePage /></AuthReactContext.Provider>); }

afterEach(() => vi.restoreAllMocks());
describe("WorkforcePage", () => {
  it("shows a forbidden state when backend denies the branch-scoped data", async () => {
    renderPage(authFor(vi.fn().mockRejectedValue(new ApiRequestError("Forbidden", "http", 403))));
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.getByText(/permisos de consulta/i)).toBeInTheDocument();
  });

  it("hides mutations without permission and creates an employee through the real route with no tenancy fields", async () => {
    const get = vi.fn((path: string) => Promise.resolve(path === "/employees" ? { employees: [] } : path === "/employee-shifts" ? { shifts: [] } : path === "/employee-bonuses" ? { bonuses: [] } : { payments: [] }));
    const post = vi.fn().mockResolvedValue(employee);
    const { rerender } = renderPage(authFor(get));
    expect(await screen.findByText("Sin empleados")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Nuevo empleado" })).not.toBeInTheDocument();
    rerender(<AuthReactContext.Provider value={authFor(get, { authPost: post as never, context: context({ permissions: ["employees.create"] }) })}><WorkforcePage /></AuthReactContext.Provider>);
    fireEvent.click(await screen.findByRole("button", { name: "Nuevo empleado" }));
    fireEvent.change(screen.getByLabelText("Nombres"), { target: { value: "Ana" } });
    fireEvent.change(screen.getByLabelText("Apellidos"), { target: { value: "López" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(post).toHaveBeenCalled());
    expect(post.mock.calls[0]?.[0]).toBe("/employees");
    const body = post.mock.calls[0]?.[2] as Record<string, unknown>;
    expect(body).not.toHaveProperty("companyId"); expect(body).not.toHaveProperty("branchId");
    expect(post.mock.calls[0]?.[3]).toMatchObject({ "idempotency-key": expect.any(String) });
  });

  it("shows a clear error banner when clock-out is rejected instead of failing silently", async () => {
    const shift = { id: "22222222-2222-7222-8222-222222222222", employeeId: ID, workDate: "2026-09-07", clockIn: "2026-09-07T22:00:00.000Z", clockOut: null, regularHours: "0", calculatedPay: "0", status: "OPEN" as const, notes: null, wageCalculationSnapshot: null };
    const get = vi.fn((path: string) => Promise.resolve(path === "/employees" ? { employees: [employee] } : path === "/employee-shifts" ? { shifts: [shift] } : path === "/employee-bonuses" ? { bonuses: [] } : { payments: [] }));
    const post = vi.fn().mockRejectedValue(new ApiRequestError("The shift has no complete active wage-rate coverage", "http", 422));
    renderPage(authFor(get, { authPost: post as never, context: context({ permissions: ["employees.complete_shift"] }) }));
    fireEvent.click(await screen.findByRole("button", { name: "Turnos" }));
    fireEvent.click(await screen.findByRole("button", { name: "Registrar salida" }));
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(post).toHaveBeenCalledWith(`/employee-shifts/${shift.id}/clock-out`, expect.anything(), {}, expect.anything());
  });

  it("refetches all workforce data after the active branch changes", async () => {
    const get = vi.fn((path: string) => Promise.resolve(path === "/employees" ? { employees: [] } : path === "/employee-shifts" ? { shifts: [] } : path === "/employee-bonuses" ? { bonuses: [] } : { payments: [] }));
    const { rerender } = renderPage(authFor(get));
    await screen.findByText("Sin empleados");
    expect(get).toHaveBeenCalledTimes(4);
    const other = { id: "b2", name: "Norte", code: "NTE", settings: {} };
    rerender(<AuthReactContext.Provider value={authFor(get, { context: context({ branches: [BRANCH, other], activeBranch: other }) })}><WorkforcePage /></AuthReactContext.Provider>);
    await waitFor(() => expect(get).toHaveBeenCalledTimes(8));
  });
});
