import { act, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AuthContext, AuthenticatedContext } from "@don-juan/contracts";
import { ApiRequestError } from "../../lib/api/httpClient";
import { AuthProvider, type AuthContextValue } from "./AuthProvider";
import { useAuth } from "./useAuth";
import { loadSession, saveSession } from "./session";
import { clearAuthSnapshot, loadAuthSnapshot, saveAuthSnapshot } from "./authCache";

const { getJson, postJson } = vi.hoisted(() => ({ getJson: vi.fn(), postJson: vi.fn() }));
vi.mock("../../lib/api/client", () => ({ httpClient: { getJson, postJson } }));

const CREDENTIALS = { username: "ana", password: "secret" };
const BRANCH = { id: "b1", name: "Centro", code: "CTR", settings: {} };
// Company is internal tenancy only — the contract never exposes or accepts
// it (see codex-latest.md "Corrección de Fase 1"). Fixtures below mirror
// AuthContext exactly: user, branches, activeBranch, permissions.
const AUTH_CONTEXT: AuthContext = {
  user: { id: "u1", displayName: "Ana" },
  branches: [BRANCH],
  activeBranch: BRANCH,
  permissions: ["floor.view"],
};
const SESSION = {
  accessToken: "access-1",
  accessTokenExpiresAt: "2026-09-06T00:15:00.000Z",
  refreshToken: "refresh-1",
  refreshTokenExpiresAt: "2026-10-06T00:00:00.000Z",
};
const AUTHENTICATED: AuthenticatedContext = { ...AUTH_CONTEXT, session: SESSION };

// Captures the live AuthContextValue from each render so tests can call its
// methods directly and await them, instead of simulating clicks and polling
// the DOM for a resulting text change (flakier for pure state-machine tests).
function Capture({ onRender }: { onRender: (auth: AuthContextValue) => void }) {
  onRender(useAuth());
  return null;
}

function renderAuth() {
  let latest: AuthContextValue | undefined;
  render(
    <AuthProvider>
      <Capture
        onRender={(auth) => {
          latest = auth;
        }}
      />
    </AuthProvider>,
  );
  return {
    get auth(): AuthContextValue {
      if (!latest) throw new Error("AuthProvider has not rendered yet.");
      return latest;
    },
  };
}

afterEach(async () => {
  localStorage.clear();
  getJson.mockReset();
  postJson.mockReset();
  await clearAuthSnapshot();
});

describe("AuthProvider", () => {
  it("boots unauthenticated when there is no stored session", async () => {
    const view = renderAuth();
    await waitFor(() => expect(view.auth.status).toBe("unauthenticated"));
  });

  it("logs in with only username/password and persists the session and the offline snapshot", async () => {
    postJson.mockResolvedValue(AUTHENTICATED);
    const view = renderAuth();
    await waitFor(() => expect(view.auth.status).toBe("unauthenticated"));

    await act(async () => {
      await view.auth.login(CREDENTIALS);
    });

    expect(postJson).toHaveBeenCalledWith("/auth/login", expect.anything(), { body: CREDENTIALS });
    expect(view.auth.status).toBe("authenticated");
    expect(view.auth.context?.user.displayName).toBe("Ana");
    expect(loadSession()).toEqual(SESSION);
    expect(await loadAuthSnapshot()).toMatchObject({ context: AUTH_CONTEXT });
  });

  it("a single accessible branch is entered automatically (no picker needed)", async () => {
    postJson.mockResolvedValue(AUTHENTICATED);
    const view = renderAuth();
    await waitFor(() => expect(view.auth.status).toBe("unauthenticated"));

    await act(async () => {
      await view.auth.login(CREDENTIALS);
    });

    expect(view.auth.context?.branches).toHaveLength(1);
    expect(view.auth.context?.activeBranch?.id).toBe("b1");
  });

  it("several accessible branches come back with activeBranch null until the user picks one", async () => {
    const branch2 = { id: "b2", name: "Norte", code: "NOR", settings: {} };
    postJson.mockResolvedValue({
      ...AUTH_CONTEXT,
      branches: [BRANCH, branch2],
      activeBranch: null,
      session: SESSION,
    });
    const view = renderAuth();
    await waitFor(() => expect(view.auth.status).toBe("unauthenticated"));

    await act(async () => {
      await view.auth.login(CREDENTIALS);
    });

    expect(view.auth.status).toBe("authenticated");
    expect(view.auth.context?.branches).toHaveLength(2);
    expect(view.auth.context?.activeBranch).toBeNull();
  });

  it("refreshes an existing stored session on boot", async () => {
    saveSession(SESSION);
    postJson.mockResolvedValue(AUTHENTICATED);

    const view = renderAuth();

    await waitFor(() => expect(view.auth.status).toBe("authenticated"));
    expect(postJson).toHaveBeenCalledWith("/auth/refresh", expect.anything(), { body: { refreshToken: "refresh-1" } });
  });

  it("clears the session when the stored refresh token is rejected as unauthenticated", async () => {
    saveSession(SESSION);
    postJson.mockRejectedValue(new ApiRequestError("bad", "http", 401));

    const view = renderAuth();

    await waitFor(() => expect(view.auth.status).toBe("unauthenticated"));
    expect(loadSession()).toBeUndefined();
  });

  it("falls back to the cached snapshot (flagged stale) when refresh fails over the network", async () => {
    saveSession(SESSION);
    await saveAuthSnapshot(AUTH_CONTEXT, "2026-09-05T00:00:00.000Z");
    postJson.mockRejectedValue(new ApiRequestError("down", "network"));

    const view = renderAuth();

    await waitFor(() => expect(view.auth.status).toBe("authenticated"));
    expect(view.auth.isStale).toBe(true);
    expect(view.auth.context?.user.displayName).toBe("Ana");
  });

  it("goes unauthenticated (not stuck loading) when offline with no cached snapshot", async () => {
    saveSession(SESSION);
    postJson.mockRejectedValue(new ApiRequestError("down", "network"));

    const view = renderAuth();

    await waitFor(() => expect(view.auth.status).toBe("unauthenticated"));
  });

  it("logs out and clears storage", async () => {
    postJson.mockResolvedValue(AUTHENTICATED);
    const view = renderAuth();
    await waitFor(() => expect(view.auth.status).toBe("unauthenticated"));

    await act(async () => {
      await view.auth.login(CREDENTIALS);
    });
    expect(view.auth.status).toBe("authenticated");

    act(() => {
      view.auth.logout();
    });

    expect(view.auth.status).toBe("unauthenticated");
    expect(loadSession()).toBeUndefined();
  });

  it("transparently refreshes and retries setActiveBranch once after a 401", async () => {
    postJson.mockResolvedValue(AUTHENTICATED);
    const view = renderAuth();
    await waitFor(() => expect(view.auth.status).toBe("unauthenticated"));

    await act(async () => {
      await view.auth.login(CREDENTIALS);
    });
    expect(view.auth.status).toBe("authenticated");

    let activeBranchCalls = 0;
    postJson.mockImplementation(async (path: string) => {
      if (path === "/me/active-branch") {
        activeBranchCalls += 1;
        if (activeBranchCalls === 1) throw new ApiRequestError("expired", "http", 401);
        return { ...AUTH_CONTEXT, activeBranch: { ...BRANCH, id: "b2", name: "Norte" } };
      }
      if (path === "/auth/refresh") return AUTHENTICATED;
      throw new Error(`unexpected path ${path}`);
    });

    await act(async () => {
      await view.auth.setActiveBranch("b2");
    });

    expect(activeBranchCalls).toBe(2);
    expect(view.auth.context?.activeBranch?.name).toBe("Norte");
  });

  it("switching branch updates activeBranch and effective permissions (the key branch-scoped data reloads against)", async () => {
    postJson.mockResolvedValue(AUTHENTICATED);
    const view = renderAuth();
    await waitFor(() => expect(view.auth.status).toBe("unauthenticated"));
    await act(async () => {
      await view.auth.login(CREDENTIALS);
    });
    expect(view.auth.context?.activeBranch?.id).toBe("b1");
    expect(view.auth.context?.permissions).toEqual(["floor.view"]);

    const BRANCH_2 = { id: "b2", name: "Norte", code: "NOR", settings: {} };
    postJson.mockImplementation(async (path: string) => {
      if (path === "/me/active-branch") {
        return { ...AUTH_CONTEXT, activeBranch: BRANCH_2, permissions: ["floor.view", "kitchen.view"] };
      }
      throw new Error(`unexpected path ${path}`);
    });

    await act(async () => {
      await view.auth.setActiveBranch("b2");
    });

    // Any branch-scoped feature that keys its cache/fetch on activeBranch.id
    // (e.g. `useEffect(() => {...}, [auth.context.activeBranch.id])`) sees a
    // new key here and refetches — no separate invalidation bus needed.
    expect(view.auth.context?.activeBranch?.id).toBe("b2");
    expect(view.auth.context?.permissions).toEqual(["floor.view", "kitchen.view"]);
  });
});
