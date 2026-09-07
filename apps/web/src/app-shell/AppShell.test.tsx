import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AuthContext } from "@don-juan/contracts";
import { AuthReactContext, type AuthContextValue } from "../features/auth/AuthProvider";
import { AppShell } from "./AppShell";

const { getHealth } = vi.hoisted(() => ({ getHealth: vi.fn() }));
vi.mock("../lib/api/client", () => ({
  apiClient: { health: { getHealth } },
  // AppShell imports useAuth -> AuthProvider, whose module-level authApi
  // needs a httpClient export to exist even though this suite never calls it.
  httpClient: { getJson: vi.fn(), postJson: vi.fn() },
}));

const BRANCH_1 = { id: "b1", name: "Centro", code: "CTR", settings: {} };
const BRANCH_2 = { id: "b2", name: "Norte", code: "NOR", settings: {} };

// Company is internal tenancy only — AuthContext never carries it (see
// codex-latest.md "Corrección de Fase 1"): user, branches, activeBranch,
// permissions only.
const BASE_CONTEXT: AuthContext = {
  user: { id: "u1", displayName: "Ana" },
  branches: [BRANCH_1],
  activeBranch: BRANCH_1,
  permissions: [],
};

function makeAuth(overrides: Partial<AuthContextValue> = {}): AuthContextValue {
  return {
    status: "authenticated",
    context: BASE_CONTEXT,
    session: null,
    isStale: false,
    staleSince: null,
    login: vi.fn(),
    logout: vi.fn(),
    setActiveBranch: vi.fn(),
    authGet: vi.fn(),
    authPost: vi.fn(),
    ...overrides,
  };
}

function renderShell(auth: AuthContextValue) {
  return render(
    <AuthReactContext.Provider value={auth}>
      <MemoryRouter initialEntries={["/floor"]}>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/floor" element={<div>Floor content</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </AuthReactContext.Provider>,
  );
}

afterEach(() => {
  getHealth.mockReset();
});

describe("AppShell", () => {
  it("a single branch is entered automatically: plain text, no dropdown, no picker prompt", async () => {
    getHealth.mockResolvedValue({ status: "ok", database: "ok", checkedAt: "2026-09-06T00:00:00.000Z" });
    renderShell(makeAuth());

    expect(screen.getByText("Centro")).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.getByText("Floor content")).toBeInTheDocument();
    await waitFor(() => expect(getHealth).toHaveBeenCalled());
  });

  it("shows a branch selector for a multi-branch user and switches on change", async () => {
    getHealth.mockResolvedValue({ status: "ok", database: "ok", checkedAt: "2026-09-06T00:00:00.000Z" });
    const setActiveBranch = vi.fn().mockResolvedValue(undefined);
    renderShell(
      makeAuth({
        context: { ...BASE_CONTEXT, branches: [BRANCH_1, BRANCH_2] },
        setActiveBranch,
      }),
    );

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "b2" } });

    expect(setActiveBranch).toHaveBeenCalledWith("b2");
  });

  it("prompts a multi-branch user to pick one instead of showing an outlet or an error, when none is active yet", async () => {
    getHealth.mockResolvedValue({ status: "ok", database: "ok", checkedAt: "2026-09-06T00:00:00.000Z" });
    renderShell(makeAuth({ context: { ...BASE_CONTEXT, branches: [BRANCH_1, BRANCH_2], activeBranch: null } }));

    expect(screen.queryByText("Floor content")).not.toBeInTheDocument();
    expect(screen.getByText("Elige una sucursal")).toBeInTheDocument();
    expect(screen.getByRole("combobox")).toBeInTheDocument();
  });

  it("shows a real error state (not a picker) when a single-branch user has no active branch", async () => {
    getHealth.mockResolvedValue({ status: "ok", database: "ok", checkedAt: "2026-09-06T00:00:00.000Z" });
    renderShell(makeAuth({ context: { ...BASE_CONTEXT, activeBranch: null } }));

    expect(screen.queryByText("Floor content")).not.toBeInTheDocument();
    expect(screen.getByText("Sin sucursal activa")).toBeInTheDocument();
  });

  it("calls logout when the button is clicked", async () => {
    getHealth.mockResolvedValue({ status: "ok", database: "ok", checkedAt: "2026-09-06T00:00:00.000Z" });
    const logout = vi.fn();
    renderShell(makeAuth({ logout }));

    fireEvent.click(screen.getByRole("button", { name: "Cerrar sesión" }));

    expect(logout).toHaveBeenCalled();
  });

  it("never renders any company selection, label or name", async () => {
    getHealth.mockResolvedValue({ status: "ok", database: "ok", checkedAt: "2026-09-06T00:00:00.000Z" });
    renderShell(makeAuth({ context: { ...BASE_CONTEXT, branches: [BRANCH_1, BRANCH_2] } }));

    expect(screen.queryByText(/compañía/i)).not.toBeInTheDocument();
  });
});
