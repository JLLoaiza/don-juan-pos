import type { AuthContext } from "@don-juan/contracts";
import { deleteCacheEntry, getCacheEntry, putCacheEntry } from "../../local/db";

// The local permission snapshot described in organization_access.md §38:
// used only to keep operating (labeled as such) while DEVICE_ONLY, never
// authoritative — the server always re-validates on the next real request.
const AUTH_SNAPSHOT_KEY = "auth-context";

export interface AuthSnapshot {
  readonly context: AuthContext;
  readonly savedAt: string;
}

export function saveAuthSnapshot(context: AuthContext, savedAt: string = new Date().toISOString()): Promise<void> {
  const snapshot: AuthSnapshot = { context, savedAt };
  return putCacheEntry(AUTH_SNAPSHOT_KEY, snapshot);
}

export function loadAuthSnapshot(): Promise<AuthSnapshot | undefined> {
  return getCacheEntry<AuthSnapshot>(AUTH_SNAPSHOT_KEY);
}

export function clearAuthSnapshot(): Promise<void> {
  return deleteCacheEntry(AUTH_SNAPSHOT_KEY);
}
