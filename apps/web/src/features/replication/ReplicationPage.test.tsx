import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AuthContext } from "@don-juan/contracts";
import { ApiRequestError } from "../../lib/api/httpClient";
import { AuthReactContext, type AuthContextValue } from "../auth/AuthProvider";
import { ReplicationPage } from "./ReplicationPage";

const BRANCH_1 = { id: "b1", name: "Chipre", code: "CHP", settings: {} };
const BRANCH_2 = { id: "b2", name: "Norte", code: "NOR", settings: {} };

function baseContext(overrides: Partial<AuthContext> = {}): AuthContext {
  return { user: { id: "u1", displayName: "Ana" }, branches: [BRANCH_1], activeBranch: BRANCH_1, permissions: [], ...overrides };
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

const EDGE_STATUS = {
  deploymentMode: "edge" as const,
  edgeServerId: "11111111-1111-7111-8111-111111111111",
  branchId: "b1",
  outbox: { pending: 3, failed: 0, delivered: 10, lastDeliveredAt: "2026-09-08T10:00:00.000Z", lastError: null },
};

const CLOUD_STATUS = {
  deploymentMode: "cloud" as const,
  branchId: "b1",
  edgeServerId: "22222222-2222-7222-8222-222222222222",
  edgeServerName: "Servidor Chipre",
  edgeActive: true,
  lastReceivedAt: "2026-09-08T10:00:00.000Z",
  replicatedEvents: 42,
  stale: false,
};

const CLOUD_ENTITIES = {
  branchId: "b1",
  lastReceivedAt: "2026-09-08T10:00:00.000Z",
  stale: false,
  entities: [
    { entityType: "restaurant_table", entityId: "33333333-3333-7333-8333-333333333333", entityVersion: 2, payload: { name: "Mesa 1" }, replicatedAt: "2026-09-08T10:00:00.000Z" },
  ],
};

function renderPage(auth: AuthContextValue) {
  return render(
    <AuthReactContext.Provider value={auth}>
      <ReplicationPage />
    </AuthReactContext.Provider>,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ReplicationPage", () => {
  it("shows a loading state while status is fetched", () => {
    const authGet = vi.fn(() => new Promise(() => {}));
    renderPage(makeAuth({ authGet: authGet as unknown as AuthContextValue["authGet"] }));
    expect(screen.getByText("Cargando estado de réplica…")).toBeInTheDocument();
  });

  it("renders the edge status without a branch selector", async () => {
    const authGet = vi.fn().mockResolvedValue(EDGE_STATUS);
    renderPage(makeAuth({ authGet: authGet as unknown as AuthContextValue["authGet"] }));

    expect(await screen.findByText("Chipre")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText(/no hay selector de sede/)).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("shows a warning banner when the edge outbox has failed operations", async () => {
    const authGet = vi.fn().mockResolvedValue({ ...EDGE_STATUS, outbox: { ...EDGE_STATUS.outbox, failed: 2, lastError: "timeout" } });
    renderPage(makeAuth({ authGet: authGet as unknown as AuthContextValue["authGet"] }));

    expect(await screen.findByText("Hay operaciones de réplica con error")).toBeInTheDocument();
    expect(screen.getByText("timeout")).toBeInTheDocument();
  });

  it("renders the cloud status, branch selector and entities for a multi-branch admin", async () => {
    const authGet = vi.fn((path: string) =>
      path === "/replication/status" ? Promise.resolve(CLOUD_STATUS) : Promise.resolve(CLOUD_ENTITIES),
    );
    renderPage(
      makeAuth({
        context: baseContext({ branches: [BRANCH_1, BRANCH_2] }),
        authGet: authGet as unknown as AuthContextValue["authGet"],
      }),
    );

    expect(await screen.findByText("Servidor Chipre")).toBeInTheDocument();
    expect(screen.getByRole("combobox")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText(/restaurant_table/)).toBeInTheDocument());
    expect(screen.getByText("Panel consolidado parcial")).toBeInTheDocument();
  });

  it("does not show a branch selector for a single-branch cloud user", async () => {
    const authGet = vi.fn((path: string) =>
      path === "/replication/status" ? Promise.resolve(CLOUD_STATUS) : Promise.resolve({ ...CLOUD_ENTITIES, entities: [] }),
    );
    renderPage(makeAuth({ authGet: authGet as unknown as AuthContextValue["authGet"] }));

    expect(await screen.findByText("Servidor Chipre")).toBeInTheDocument();
    expect(screen.queryByText("Panel consolidado parcial")).not.toBeInTheDocument();
  });

  it("surfaces the real cloud 403 when the user tries to switch branch", async () => {
    const authGet = vi.fn((path: string) =>
      path === "/replication/status" ? Promise.resolve(CLOUD_STATUS) : Promise.resolve(CLOUD_ENTITIES),
    );
    const setActiveBranch = vi.fn().mockRejectedValue(new ApiRequestError("Cloud is read-only for branch operational commands", "http", 403));
    renderPage(
      makeAuth({
        context: baseContext({ branches: [BRANCH_1, BRANCH_2] }),
        authGet: authGet as unknown as AuthContextValue["authGet"],
        setActiveBranch,
      }),
    );

    const select = await screen.findByRole("combobox");
    fireEvent.change(select, { target: { value: "b2" } });

    expect(await screen.findByText("No se pudo cambiar de sede")).toBeInTheDocument();
    expect(screen.getByText(/bloqueado por diseño en un despliegue cloud/)).toBeInTheDocument();
  });

  it("shows a forbidden state on 403 and a network state on a connectivity failure", async () => {
    const forbidden = vi.fn().mockRejectedValue(new ApiRequestError("Forbidden", "http", 403));
    const { unmount } = renderPage(makeAuth({ authGet: forbidden as unknown as AuthContextValue["authGet"] }));
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.getByText(/permiso de vista de réplica/i)).toBeInTheDocument();
    unmount();

    const network = vi.fn().mockRejectedValue(new ApiRequestError("down", "network"));
    renderPage(makeAuth({ authGet: network as unknown as AuthContextValue["authGet"] }));
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.getByText(/sin conexión/i)).toBeInTheDocument();
  });
});
