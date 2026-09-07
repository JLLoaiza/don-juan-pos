import { useCallback, useEffect, useState } from "react";
import { LoadingState, ErrorState } from "@don-juan/ui";
import type { HealthResponse } from "@don-juan/contracts";
import { apiClient } from "../../lib/api/client";
import { ApiRequestError } from "../../lib/api/httpClient";

export interface HomePageProps {
  readonly fetchHealth?: () => Promise<HealthResponse>;
}

type Status =
  | { kind: "loading" }
  | { kind: "success"; health: HealthResponse }
  | { kind: "error"; variant: "network" | "server"; message: string };

// Module-level (not created inside the component) so the default has a
// stable identity across renders; otherwise `load` below would be rebuilt
// and re-run on every render, looping forever.
const defaultFetchHealth = () => apiClient.health.getHealth();

export function HomePage({ fetchHealth = defaultFetchHealth }: HomePageProps) {
  const [status, setStatus] = useState<Status>({ kind: "loading" });

  const load = useCallback(() => {
    setStatus({ kind: "loading" });
    fetchHealth()
      .then((health) => setStatus({ kind: "success", health }))
      .catch((error: unknown) => {
        const variant = error instanceof ApiRequestError && error.kind === "network" ? "network" : "server";
        const message = error instanceof Error ? error.message : "Error desconocido.";
        setStatus({ kind: "error", variant, message });
      });
  }, [fetchHealth]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <section aria-labelledby="home-title">
      <h1 id="home-title">Don Juan POS/ERP</h1>
      <p>
        Este panel confirma que el cliente puede consumir un contrato real (<code>GET /health</code>). El resto de la
        aplicación queda pendiente de los contratos de acceso, sucursal, salón y consumo.
      </p>
      {status.kind === "loading" ? <LoadingState label="Comprobando estado del servidor…" /> : null}
      {status.kind === "success" ? (
        <dl>
          <dt>Estado</dt>
          <dd>{status.health.status}</dd>
          <dt>Base de datos</dt>
          <dd>{status.health.database}</dd>
          <dt>Verificado</dt>
          <dd>{new Date(status.health.checkedAt).toLocaleString()}</dd>
        </dl>
      ) : null}
      {status.kind === "error" ? <ErrorState variant={status.variant} description={status.message} onRetry={load} /> : null}
    </section>
  );
}
