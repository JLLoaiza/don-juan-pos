import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiRequestError } from "../../lib/api/httpClient";
import { AuthReactContext, type AuthContextValue } from "./AuthProvider";
import { LoginPage } from "./LoginPage";

function makeAuth(overrides: Partial<AuthContextValue> = {}): AuthContextValue {
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

function renderLogin(auth: AuthContextValue, initialEntries: Array<string | { pathname: string; state?: unknown }> = ["/login"]) {
  return render(
    <AuthReactContext.Provider value={auth}>
      <MemoryRouter initialEntries={initialEntries}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<div>Home</div>} />
          <Route path="/floor" element={<div>Floor</div>} />
        </Routes>
      </MemoryRouter>
    </AuthReactContext.Provider>,
  );
}

function fillForm(username: string, password: string) {
  fireEvent.change(screen.getByLabelText("Usuario"), { target: { value: username } });
  fireEvent.change(screen.getByLabelText("Contraseña"), { target: { value: password } });
}

describe("LoginPage", () => {
  it("never asks for a company: only shows username and password", () => {
    renderLogin(makeAuth());
    expect(screen.getByLabelText("Usuario")).toBeInTheDocument();
    expect(screen.getByLabelText("Contraseña")).toBeInTheDocument();
    expect(screen.queryByLabelText(/compañía/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/compañía/i)).not.toBeInTheDocument();
  });

  it("logs in with only username and password", async () => {
    const login = vi.fn().mockResolvedValue(undefined);
    renderLogin(makeAuth({ login }));

    fillForm("ana", "secret");
    fireEvent.click(screen.getByRole("button", { name: "Ingresar" }));

    await waitFor(() => expect(login).toHaveBeenCalledWith({ username: "ana", password: "secret" }));
  });

  it("redirects immediately if already authenticated", () => {
    renderLogin(makeAuth({ status: "authenticated" }));
    expect(screen.getByText("Home")).toBeInTheDocument();
  });

  it("prevents a double submit while a login request is pending", async () => {
    let resolveLogin: () => void = () => undefined;
    const login = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveLogin = resolve;
        }),
    );
    renderLogin(makeAuth({ login }));

    fillForm("ana", "secret");
    const button = screen.getByRole("button", { name: "Ingresar" });
    fireEvent.click(button);
    fireEvent.click(button);

    expect(login).toHaveBeenCalledTimes(1);
    resolveLogin();
    await waitFor(() => expect(screen.getByText("Home")).toBeInTheDocument());
  });

  it("shows a friendly message for wrong credentials", async () => {
    const login = vi.fn().mockRejectedValue(new ApiRequestError("Authentication failed", "http", 401));
    renderLogin(makeAuth({ login }));

    fillForm("ana", "wrong");
    fireEvent.click(screen.getByRole("button", { name: "Ingresar" }));

    expect(await screen.findByText("Usuario o contraseña incorrectos.")).toBeInTheDocument();
  });

  it("shows a network message when the server is unreachable", async () => {
    const login = vi.fn().mockRejectedValue(new ApiRequestError("down", "network"));
    renderLogin(makeAuth({ login }));

    fillForm("ana", "secret");
    fireEvent.click(screen.getByRole("button", { name: "Ingresar" }));

    expect(await screen.findByText("No se pudo contactar el servidor. Verifica tu conexión.")).toBeInTheDocument();
  });

  it("redirects back to the originally requested page after login", async () => {
    const login = vi.fn().mockResolvedValue(undefined);
    renderLogin(makeAuth({ login }), [{ pathname: "/login", state: { from: { pathname: "/floor" } } }]);

    fillForm("ana", "secret");
    fireEvent.click(screen.getByRole("button", { name: "Ingresar" }));

    expect(await screen.findByText("Floor")).toBeInTheDocument();
  });
});
