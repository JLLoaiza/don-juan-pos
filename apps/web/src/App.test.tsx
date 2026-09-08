import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AuthenticatedContext } from "@don-juan/contracts";
import { App } from "./App";
import { AuthProvider } from "./features/auth/AuthProvider";
import { saveSession } from "./features/auth/session";

const { getHealth, postJson, getJsonMock } = vi.hoisted(() => ({
  getHealth: vi.fn(),
  postJson: vi.fn(),
  getJsonMock: vi.fn(),
}));
vi.mock("./lib/api/client", () => ({
  apiClient: { health: { getHealth } },
  httpClient: { getJson: getJsonMock, postJson },
}));
const BRANCH = { id: "b1", name: "Centro", code: "CTR", settings: {} };
const AUTH_CONTEXT = {
  user: { id: "u1", displayName: "Ana" },
  branches: [BRANCH],
  activeBranch: BRANCH,
  permissions: [],
};
const SESSION = {
  accessToken: "access-1",
  accessTokenExpiresAt: "2026-09-06T00:15:00.000Z",
  refreshToken: "refresh-1",
  refreshTokenExpiresAt: "2026-10-06T00:00:00.000Z",
};
const AUTHENTICATED: AuthenticatedContext = { ...AUTH_CONTEXT, session: SESSION };

function renderApp(initialEntries: string[]) {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={initialEntries}>
        <App />
      </MemoryRouter>
    </AuthProvider>,
  );
}

function mockHealthy() {
  getHealth.mockResolvedValue({ status: "ok", database: "ok", checkedAt: "2026-09-06T00:00:00.000Z" });
}

function mockUnreachable() {
  getHealth.mockRejectedValue(new Error("network down"));
}

function seedAuthenticatedSession() {
  saveSession(SESSION);
  postJson.mockResolvedValue(AUTHENTICATED);
}

afterEach(() => {
  localStorage.clear();
  getHealth.mockReset();
  postJson.mockReset();
  getJsonMock.mockReset();
});

describe("App", () => {
  it("redirects to /login when there is no stored session, without ever asking for a company", async () => {
    renderApp(["/"]);
    expect(await screen.findByLabelText("Usuario")).toBeInTheDocument();
    expect(screen.queryByLabelText(/compañía/i)).not.toBeInTheDocument();
  });

  it("logs in from scratch and reaches the authenticated app", async () => {
    postJson.mockResolvedValue(AUTHENTICATED);
    mockHealthy();
    renderApp(["/"]);

    await screen.findByLabelText("Usuario");
    fireEvent.change(screen.getByLabelText("Usuario"), { target: { value: "ana" } });
    fireEvent.change(screen.getByLabelText("Contraseña"), { target: { value: "secret" } });
    fireEvent.click(screen.getByRole("button", { name: "Ingresar" }));

    expect(await screen.findByRole("link", { name: "Salón" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByText("ok")).toHaveLength(2));
  });

  it("renders the real floor for /floor for a returning session", async () => {
    seedAuthenticatedSession();
    mockHealthy();
    getJsonMock.mockResolvedValue({ diningAreas: [], tables: [] });
    renderApp(["/floor"]);

    expect(await screen.findByRole("heading", { name: "Salón" })).toBeInTheDocument();
    expect(screen.getByText(/Aún no hay áreas ni mesas configuradas/)).toBeInTheDocument();
  });

  it("shows the device-only banner when the health check fails", async () => {
    seedAuthenticatedSession();
    mockUnreachable();
    renderApp(["/"]);

    expect(await screen.findByText("SERVIDOR NO DISPONIBLE")).toBeInTheDocument();
  });

  it("renders the replication status for /replication", async () => {
    seedAuthenticatedSession();
    mockHealthy();
    getJsonMock.mockResolvedValue({
      deploymentMode: "edge",
      edgeServerId: "11111111-1111-7111-8111-111111111111",
      branchId: "b1",
      outbox: { pending: 0, failed: 0, delivered: 2, lastDeliveredAt: null, lastError: null },
    });
    renderApp(["/replication"]);

    expect(await screen.findByRole("heading", { name: "Réplica" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText(/no hay selector de sede/)).toBeInTheDocument());
  });

  it("renders the not-found page for unknown routes", async () => {
    seedAuthenticatedSession();
    mockHealthy();
    renderApp(["/unknown"]);

    expect(await screen.findByText("La ruta solicitada no existe.")).toBeInTheDocument();
  });
});
