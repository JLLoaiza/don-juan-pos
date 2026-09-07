import { createContext, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { z } from "zod";
import type { AuthContext as AuthContextData, LoginRequest } from "@don-juan/contracts";
import { httpClient } from "../../lib/api/client";
import { ApiRequestError } from "../../lib/api/httpClient";
import { createAuthApi } from "./authApi";
import { clearAuthSnapshot, loadAuthSnapshot, saveAuthSnapshot } from "./authCache";
import { clearSession, loadSession, saveSession, type StoredSession } from "./session";

const authApi = createAuthApi(httpClient);

export type AuthStatus = "bootstrapping" | "unauthenticated" | "authenticated";

interface AuthState {
  readonly status: AuthStatus;
  readonly context: AuthContextData | null;
  readonly session: StoredSession | null;
  readonly isStale: boolean;
  readonly staleSince: string | null;
}

const initialState: AuthState = {
  status: "bootstrapping",
  context: null,
  session: null,
  isStale: false,
  staleSince: null,
};

export interface AuthContextValue extends AuthState {
  login(input: LoginRequest): Promise<void>;
  logout(): void;
  setActiveBranch(branchId: string): Promise<void>;
  authGet<T>(path: string, schema: z.ZodType<T>): Promise<T>;
  authPost<T>(path: string, schema: z.ZodType<T>, body?: unknown): Promise<T>;
}

export const AuthReactContext = createContext<AuthContextValue | null>(null);

function isUnauthenticatedRejection(error: unknown): boolean {
  return error instanceof ApiRequestError && error.kind === "http" && error.status === 401;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(initialState);
  // Mirrors `state.session` without the async lag of React state so retry
  // logic (below) always reads the token that was just refreshed.
  const sessionRef = useRef<StoredSession | null>(null);

  const applyAuthenticated = useCallback((context: AuthContextData, session: StoredSession, isStale: boolean, staleSince: string | null) => {
    sessionRef.current = session;
    setState({ status: "authenticated", context, session, isStale, staleSince });
  }, []);

  const logout = useCallback(() => {
    sessionRef.current = null;
    clearSession();
    void clearAuthSnapshot();
    setState({ status: "unauthenticated", context: null, session: null, isStale: false, staleSince: null });
  }, []);

  const refreshFromStoredSession = useCallback(async (stored: StoredSession): Promise<void> => {
    try {
      const authenticated = await authApi.refresh(stored.refreshToken);
      const { session, ...context } = authenticated;
      saveSession(session);
      const savedAt = new Date().toISOString();
      await saveAuthSnapshot(context, savedAt);
      applyAuthenticated(context, session, false, null);
    } catch (error) {
      if (isUnauthenticatedRejection(error)) {
        logout();
        return;
      }
      // Network or server failure: fall back to the last local snapshot
      // (organization_access.md §38) rather than forcing the user out.
      const snapshot = await loadAuthSnapshot();
      if (snapshot) {
        applyAuthenticated(snapshot.context, stored, true, snapshot.savedAt);
      } else {
        setState({ status: "unauthenticated", context: null, session: null, isStale: false, staleSince: null });
      }
    }
  }, [applyAuthenticated, logout]);

  // Guards against calling /auth/refresh twice with the same (single-use,
  // rotating) refresh token: React StrictMode intentionally double-invokes
  // effects in development, and without this guard the second call reuses
  // an already-rotated-away token and gets rejected as unauthenticated.
  const hasBootstrapped = useRef(false);
  useEffect(() => {
    if (hasBootstrapped.current) return;
    hasBootstrapped.current = true;
    const stored = loadSession();
    if (!stored) {
      setState({ status: "unauthenticated", context: null, session: null, isStale: false, staleSince: null });
      return;
    }
    void refreshFromStoredSession(stored);
    // Bootstraps once on mount; refreshFromStoredSession is stable via useCallback.
  }, []);

  const login = useCallback(async (input: LoginRequest): Promise<void> => {
    const authenticated = await authApi.login(input);
    const { session, ...context } = authenticated;
    saveSession(session);
    const savedAt = new Date().toISOString();
    await saveAuthSnapshot(context, savedAt);
    applyAuthenticated(context, session, false, null);
  }, [applyAuthenticated]);

  const withAutoRefresh = useCallback(async <T,>(call: (accessToken: string) => Promise<T>): Promise<T> => {
    const current = sessionRef.current;
    if (!current) throw new ApiRequestError("No hay una sesión activa.", "http", 401);
    try {
      return await call(current.accessToken);
    } catch (error) {
      if (!isUnauthenticatedRejection(error)) throw error;
      try {
        const authenticated = await authApi.refresh(current.refreshToken);
        const { session, ...context } = authenticated;
        saveSession(session);
        await saveAuthSnapshot(context);
        applyAuthenticated(context, session, false, null);
        return await call(session.accessToken);
      } catch {
        logout();
        throw error;
      }
    }
  }, [applyAuthenticated, logout]);

  const setActiveBranch = useCallback(async (branchId: string): Promise<void> => {
    const context = await withAutoRefresh((accessToken) => authApi.setActiveBranch(accessToken, branchId));
    await saveAuthSnapshot(context);
    setState((prev) => ({ ...prev, context, isStale: false, staleSince: null }));
  }, [withAutoRefresh]);

  const authGet = useCallback(<T,>(path: string, schema: z.ZodType<T>): Promise<T> =>
    withAutoRefresh((accessToken) => httpClient.getJson(path, schema, { headers: { authorization: `Bearer ${accessToken}` } })),
  [withAutoRefresh]);

  const authPost = useCallback(<T,>(path: string, schema: z.ZodType<T>, body?: unknown): Promise<T> =>
    withAutoRefresh((accessToken) => httpClient.postJson(path, schema, { headers: { authorization: `Bearer ${accessToken}` }, body })),
  [withAutoRefresh]);

  const value = useMemo<AuthContextValue>(
    () => ({ ...state, login, logout, setActiveBranch, authGet, authPost }),
    [state, login, logout, setActiveBranch, authGet, authPost],
  );

  return <AuthReactContext.Provider value={value}>{children}</AuthReactContext.Provider>;
}
