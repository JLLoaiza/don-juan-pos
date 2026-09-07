import { afterEach, describe, expect, it } from "vitest";
import { clearSession, loadSession, saveSession, type StoredSession } from "./session";

const SESSION: StoredSession = {
  accessToken: "access",
  accessTokenExpiresAt: "2026-09-06T00:15:00.000Z",
  refreshToken: "refresh",
  refreshTokenExpiresAt: "2026-10-06T00:00:00.000Z",
};

afterEach(() => {
  localStorage.clear();
});

describe("session storage", () => {
  it("returns undefined when nothing is stored", () => {
    expect(loadSession()).toBeUndefined();
  });

  it("round-trips a session", () => {
    saveSession(SESSION);
    expect(loadSession()).toEqual(SESSION);
  });

  it("clears a stored session", () => {
    saveSession(SESSION);
    clearSession();
    expect(loadSession()).toBeUndefined();
  });

  it("ignores malformed stored data instead of throwing", () => {
    localStorage.setItem("dj.session", "{not json");
    expect(loadSession()).toBeUndefined();
  });
});
