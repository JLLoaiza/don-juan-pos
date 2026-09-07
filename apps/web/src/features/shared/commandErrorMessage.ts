import { ApiRequestError } from "../../lib/api/httpClient";

/**
 * A consistent, actionable message for command failures across forms:
 * network issues, 401 (session expired — should be rare, AuthProvider
 * already retries once via refresh before this is ever reached), 403
 * (missing permission), 409 (stale version — the caller should reload),
 * and validation errors (surfaces the server's message).
 */
export function commandErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiRequestError) {
    if (error.kind === "network") return "No se pudo contactar el servidor. Verifica tu conexión.";
    if (error.status === 401) return "Tu sesión expiró. Vuelve a iniciar sesión.";
    if (error.status === 403) return "No tienes permiso para esta acción.";
    if (error.status === 409) return "La información cambió mientras tanto. Se actualizó automáticamente; revisa los datos e intenta de nuevo.";
    if (error.message) return error.message;
  }
  return fallback;
}

export function isConflict(error: unknown): boolean {
  return error instanceof ApiRequestError && error.kind === "http" && error.status === 409;
}
