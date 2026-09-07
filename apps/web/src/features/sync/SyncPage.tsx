import { useOutletContext } from "react-router-dom";
import { ConnectivityBadge } from "@don-juan/ui";
import type { AppShellOutletContext } from "../../app-shell/AppShell";

const STATE_EXPLANATIONS: Record<string, string> = {
  ONLINE: "El servidor respondió correctamente a la última comprobación de /health.",
  DEVICE_ONLY: "El servidor no respondió. El dispositivo operaría desde IndexedDB, pero esa cola aún no está implementada.",
  LOCAL_ONLY: "El Edge de la sucursal responde pero Cloud no. Este estado no es observable todavía: /health no distingue Edge de Cloud.",
  CHECKING: "Comprobando la conectividad con el servidor…",
};

export function SyncPage() {
  const connectivity = useOutletContext<AppShellOutletContext>();

  return (
    <section aria-labelledby="sync-title">
      <h1 id="sync-title">Sincronización</h1>
      <p>
        Estado actual: <ConnectivityBadge state={connectivity.state} />
      </p>
      <p>{STATE_EXPLANATIONS[connectivity.state]}</p>
      {connectivity.lastCheckedAt ? <p>Última comprobación: {connectivity.lastCheckedAt.toLocaleTimeString()}</p> : null}
      <p>
        La cola de comandos pendientes, el outbox de dispositivo y la resolución de conflictos quedan pendientes del
        contrato de sincronización (<code>sync_operations</code>, <code>sync_outbox</code>, <code>sync_changes</code>)
        que aún no publica backend.
      </p>
    </section>
  );
}
