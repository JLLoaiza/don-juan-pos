import {
  AuthContextSchema,
  AuthenticatedContextSchema,
  type AuthContext,
  type AuthenticatedContext,
  type LoginRequest,
} from "@don-juan/contracts";
import type { HttpClient } from "../../lib/api/httpClient";

export interface AuthApi {
  login(input: LoginRequest): Promise<AuthenticatedContext>;
  refresh(refreshToken: string): Promise<AuthenticatedContext>;
  context(accessToken: string): Promise<AuthContext>;
  setActiveBranch(accessToken: string, branchId: string): Promise<AuthContext>;
}

export function createAuthApi(http: HttpClient): AuthApi {
  return {
    login: (input) => http.postJson("/auth/login", AuthenticatedContextSchema, { body: input }),
    refresh: (refreshToken) => http.postJson("/auth/refresh", AuthenticatedContextSchema, { body: { refreshToken } }),
    context: (accessToken) =>
      http.getJson("/me/context", AuthContextSchema, { headers: { authorization: `Bearer ${accessToken}` } }),
    setActiveBranch: (accessToken, branchId) =>
      http.postJson("/me/active-branch", AuthContextSchema, {
        headers: { authorization: `Bearer ${accessToken}` },
        body: { branchId },
      }),
  };
}
