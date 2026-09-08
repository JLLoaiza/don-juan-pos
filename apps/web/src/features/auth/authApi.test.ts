import { describe, expect, it, vi } from "vitest";
import type { HttpClient } from "../../lib/api/httpClient";
import { createAuthApi } from "./authApi";

function fakeHttpClient(): { http: HttpClient; getJson: ReturnType<typeof vi.fn>; postJson: ReturnType<typeof vi.fn> } {
  const getJson = vi.fn(async () => ({}) as never);
  const postJson = vi.fn(async () => ({}) as never);
  const putJson = vi.fn(async () => ({}) as never);
  const getBlob = vi.fn(async () => ({}) as never);
  return { http: { getJson, postJson, putJson, getBlob }, getJson, postJson };
}

describe("createAuthApi", () => {
  it("posts login with only username and password (company is implicit, never sent)", async () => {
    const { http, postJson } = fakeHttpClient();
    await createAuthApi(http).login({ username: "ana", password: "secret" });
    expect(postJson).toHaveBeenCalledWith("/auth/login", expect.anything(), {
      body: { username: "ana", password: "secret" },
    });
  });

  it("posts refresh with the refresh token as the body", async () => {
    const { http, postJson } = fakeHttpClient();
    await createAuthApi(http).refresh("refresh-token");
    expect(postJson).toHaveBeenCalledWith("/auth/refresh", expect.anything(), { body: { refreshToken: "refresh-token" } });
  });

  it("requests context with a bearer header", async () => {
    const { http, getJson } = fakeHttpClient();
    await createAuthApi(http).context("access-token");
    expect(getJson).toHaveBeenCalledWith("/me/context", expect.anything(), {
      headers: { authorization: "Bearer access-token" },
    });
  });

  it("posts the active branch with a bearer header and body", async () => {
    const { http, postJson } = fakeHttpClient();
    await createAuthApi(http).setActiveBranch("access-token", "branch-1");
    expect(postJson).toHaveBeenCalledWith("/me/active-branch", expect.anything(), {
      headers: { authorization: "Bearer access-token" },
      body: { branchId: "branch-1" },
    });
  });
});
