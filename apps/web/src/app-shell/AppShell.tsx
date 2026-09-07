import { NavLink, Outlet } from "react-router-dom";
import { Banner, ConnectivityBadge } from "@don-juan/ui";
import { apiClient } from "../lib/api/client";
import { useConnectivity, type UseConnectivityResult } from "../lib/connectivity/useConnectivity";
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

export function AppShell() {
  const connectivity = useConnectivity({ checkHealth });

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
        <span className="dj-shell__branch" title="Pendiente del contrato de sesión y contexto de sucursal">
          Sucursal: pendiente de sesión
        </span>
        <div className="dj-shell__status">
          <ConnectivityBadge state={connectivity.state} />
        </div>
      </header>

      {connectivity.state === "DEVICE_ONLY" ? (
        <div className="dj-shell__banner">
          <Banner
            tone="danger"
            title="SERVIDOR NO DISPONIBLE"
            description="El dispositivo no puede confirmar operaciones en línea. La operación offline aún no está implementada en este slice."
          />
        </div>
      ) : null}

      <main className="dj-shell__content">
        <Outlet context={connectivity} />
      </main>
    </div>
  );
}
