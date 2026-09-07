import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { AuthReactContext, type AuthContextValue } from "./AuthProvider";
import { RequireAuth } from "./RequireAuth";

function makeAuth(overrides: Partial<AuthContextValue>): AuthContextValue {
  return {
    status: "unauthenticated",
    context: null,
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

function renderGuard(auth: AuthContextValue) {
  return render(
    <AuthReactContext.Provider value={auth}>
      <MemoryRouter initialEntries={["/floor"]}>
        <Routes>
          <Route path="/login" element={<div>Login</div>} />
          <Route element={<RequireAuth />}>
            <Route path="/floor" element={<div>Floor</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </AuthReactContext.Provider>,
  );
}

describe("RequireAuth", () => {
  it("shows a loading state while bootstrapping", () => {
    renderGuard(makeAuth({ status: "bootstrapping" }));
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.queryByText("Floor")).not.toBeInTheDocument();
  });

  it("redirects to /login when unauthenticated", () => {
    renderGuard(makeAuth({ status: "unauthenticated" }));
    expect(screen.getByText("Login")).toBeInTheDocument();
  });

  it("renders the protected route when authenticated", () => {
    renderGuard(makeAuth({ status: "authenticated" }));
    expect(screen.getByText("Floor")).toBeInTheDocument();
  });
});
