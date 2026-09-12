import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, ErrorState, LoadingState } from "@don-juan/ui";
import type { RestaurantTable } from "@don-juan/contracts";
import { ApiRequestError } from "../../lib/api/httpClient";
import { useAuth } from "../auth/useAuth";
import { hasPermission } from "../catalog/permissions";
import { useFloor } from "./useFloor";
import { CreateDiningAreaForm, CreateTableForm } from "./FloorAdminForms";
import "./FloorPage.css";

const STATUS_LABEL: Record<RestaurantTable["status"], string> = {
  AVAILABLE: "Disponible",
  OCCUPIED: "Ocupada",
  RESERVED: "Reservada",
};

function errorVariant(error: unknown): "network" | "forbidden" | "server" {
  if (error instanceof ApiRequestError) {
    if (error.kind === "network") return "network";
    if (error.status === 403) return "forbidden";
  }
  return "server";
}

export function FloorPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const { status, snapshot, error, api, reload } = useFloor();
  const [creatingArea, setCreatingArea] = useState(false);
  const [creatingTable, setCreatingTable] = useState(false);
  const permissions = auth.context?.permissions ?? [];
  const canOpen = hasPermission(permissions, "accounts.open");
  const canCreateArea = hasPermission(permissions, "dining_areas.create");
  const canCreateTable = hasPermission(permissions, "tables.create");

  if (status === "loading") {
    return <LoadingState label="Cargando salón…" />;
  }

  if (status === "error" || !snapshot) {
    const variant = errorVariant(error);
    return (
      <ErrorState
        variant={variant}
        {...(variant === "forbidden"
          ? { description: "Tu usuario no tiene los permisos de vista de salón (áreas y mesas)." }
          : {})}
        onRetry={reload}
      />
    );
  }

  const handleTableClick = (table: RestaurantTable) => {
    if (table.openAccountId) {
      navigate(`/floor/accounts/${table.openAccountId}`);
      return;
    }
    if (table.status === "OCCUPIED") {
      navigate(`/floor/tables/${table.id}/order`);
      return;
    }
    if (!canOpen) return;
    if (table.status !== "AVAILABLE" && table.status !== "RESERVED") return;
    navigate(`/floor/tables/${table.id}/order`);
  };

  const handleCreateArea = (input: Parameters<typeof api.createDiningArea>[0]) =>
    api.createDiningArea(input).then(() => {
      setCreatingArea(false);
      reload();
    });

  const handleCreateTable = (input: Parameters<typeof api.createRestaurantTable>[0]) =>
    api.createRestaurantTable(input).then(() => {
      setCreatingTable(false);
      reload();
    });

  const areas = snapshot.diningAreas.map((area) => ({
    area,
    tables: snapshot.tables.filter((table) => table.diningAreaId === area.id),
  }));

  return (
    <section className="dj-floor" aria-labelledby="floor-title">
      <h1 id="floor-title">Salón</h1>

      {canCreateArea || canCreateTable ? (
        <div className="dj-floor__toolbar">
          {canCreateArea ? (
            <Button variant="secondary" onClick={() => setCreatingArea(true)} disabled={creatingArea}>
              Nueva área
            </Button>
          ) : null}
          {canCreateTable ? (
            <Button variant="secondary" onClick={() => setCreatingTable(true)} disabled={creatingTable}>
              Nueva mesa
            </Button>
          ) : null}
        </div>
      ) : null}
      {creatingArea ? <CreateDiningAreaForm onSubmit={handleCreateArea} onCancel={() => setCreatingArea(false)} /> : null}
      {creatingTable ? (
        <CreateTableForm diningAreas={snapshot.diningAreas} onSubmit={handleCreateTable} onCancel={() => setCreatingTable(false)} />
      ) : null}

      {areas.length === 0 ? (
        <p className="dj-floor__empty">
          Aún no hay áreas ni mesas configuradas en esta sucursal. Un administrador debe crearlas antes de poder
          operar el salón.
        </p>
      ) : (
        areas.map(({ area, tables }) => (
          <div className="dj-floor__area" key={area.id}>
            <h2 className="dj-floor__area-title">{area.name}</h2>
            {tables.length === 0 ? (
              <p className="dj-floor__empty">Esta área todavía no tiene mesas.</p>
            ) : (
              <div className="dj-floor__grid">
                {tables.map((table) => (
                  <button
                    key={table.id}
                    type="button"
                    className={`dj-table dj-table--${table.status.toLowerCase()}`}
                    onClick={() => handleTableClick(table)}
                    disabled={!table.openAccountId && !canOpen && table.status !== "OCCUPIED"}
                  >
                    <span className="dj-table__name">{table.name}</span>
                    <span className="dj-table__capacity">{table.capacity} personas</span>
                    <span className="dj-table__status">{STATUS_LABEL[table.status]}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ))
      )}
    </section>
  );
}
