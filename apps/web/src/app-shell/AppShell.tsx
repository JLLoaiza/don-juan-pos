import { useState, type ChangeEvent } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { Banner, ConnectivityBadge, EmptyState } from "@don-juan/ui";
import { apiClient } from "../lib/api/client";
import { useConnectivity, type UseConnectivityResult } from "../lib/connectivity/useConnectivity";
import { useAuth } from "../features/auth/useAuth";
import "./AppShell.css";

const NAV_ITEMS: ReadonlyArray<{ to: string; label: string }> = [
  { to: "/floor", label: "Salón" },
  { to: "/catalog", label: "Catálogo" },
  { to: "/kitchen", label: "Cocina" },
  { to: "/billing", label: "Cobros" },
  { to: "/cash", label: "Caja" },
  { to: "/procurement", label: "Compras" },
  { to: "/workforce", label: "Personal" },
  { to: "/reports", label: "Reportes" },
  { to: "/sync", label: "Sincronización" },
];

export type AppShellOutletContext = UseConnectivityResult;

// Module-level (not created inside the component) so it has a stable
// identity across renders; see useConnectivity for why that matters.
const checkHealth = () => apiClient.health.getHealth();

function BranchSwitcher() {
  const auth = useAuth();
  const [switching, setSwitching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const branches = auth.context?.branches ?? [];
  const activeBranch = auth.context?.activeBranch ?? null;

  if (branches.length <= 1) {
    return <span className="dj-shell__branch">{activeBranch ? activeBranch.name : "Sin sucursal"}</span>;
  }

  const handleChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const branchId = event.target.value;
    setSwitching(true);
    setError(null);
    auth
      .setActiveBranch(branchId)
      .catch(() => setError("No se pudo cambiar de sucursal."))
      .finally(() => setSwitching(false));
  };

  return (
    <label className="dj-shell__branch">
      <span className="dj-shell__branch-label">Sucursal</span>
      <select value={activeBranch?.id ?? ""} onChange={handleChange} disabled={switching}>
        {branches.map((branch) => (
          <option key={branch.id} value={branch.id}>
            {branch.name}
          </option>
        ))}
      </select>
      {error ? <span className="dj-shell__branch-error">{error}</span> : null}
    </label>
  );
}

export function AppShell() {
  const connectivity = useConnectivity({ checkHealth });
  const auth = useAuth();

  const deviceOnlyDescription =
    auth.isStale && auth.staleSince
      ? `El dispositivo no puede confirmar operaciones en línea. Mostrando la última sesión guardada (${new Date(auth.staleSince).toLocaleString()}); la operación offline completa aún no está implementada en este slice.`
      : "El dispositivo no puede confirmar operaciones en línea. La operación offline aún no está implementada en este slice.";

  return (
    <div className="dj-shell">
      <header className="dj-shell__header">
        <span className="dj-shell__brand">Don Juan</span>
        <nav className="dj-shell__nav" aria-label="Navegación principal">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => `dj-shell__link${isActive ? " dj-shell__link--active" : ""}`}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <BranchSwitcher />
        <div className="dj-shell__user">
          <span>{auth.context?.user.displayName}</span>
          <button type="button" className="dj-shell__logout" onClick={auth.logout}>
            Cerrar sesión
          </button>
        </div>
        <div className="dj-shell__status">
          <ConnectivityBadge state={connectivity.state} />
        </div>
      </header>

      {connectivity.state === "DEVICE_ONLY" ? (
        <div className="dj-shell__banner">
          <Banner tone="danger" title="SERVIDOR NO DISPONIBLE" description={deviceOnlyDescription} />
        </div>
      ) : null}

      <main className="dj-shell__content">
        {auth.context?.activeBranch ? (
          <Outlet context={connectivity} />
        ) : (
          <EmptyState
            title="Sin sucursal activa"
            description="Tu usuario no tiene una sucursal activa asignada. Contacta a un administrador para que te asigne acceso."
          />
        )}
      </main>
    </div>
  );
}
