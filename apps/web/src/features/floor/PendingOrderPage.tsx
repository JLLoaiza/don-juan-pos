import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Button, ErrorState, LoadingState } from "@don-juan/ui";
import type { ConfirmConsumptionRequest, ConfirmConsumptionResponse } from "@don-juan/contracts";
import { ApiRequestError } from "../../lib/api/httpClient";
import { useAuth } from "../auth/useAuth";
import { hasEveryPermission, hasPermission } from "../catalog/permissions";
import { useCatalog } from "../catalog/useCatalog";
import { useFloor } from "./useFloor";
import { ConsumptionForm } from "./ConsumptionForm";
import "./PendingOrderPage.css";

function errorVariant(error: unknown): "network" | "forbidden" | "server" {
  if (error instanceof ApiRequestError) {
    if (error.kind === "network") return "network";
    if (error.status === 403) return "forbidden";
  }
  return "server";
}

export function PendingOrderPage() {
  const { tableId } = useParams<{ tableId: string }>();
  const auth = useAuth();
  const navigate = useNavigate();
  const { status, snapshot, error, api, reload } = useFloor();
  const catalog = useCatalog();
  const [pendingAccountId, setPendingAccountId] = useState<string | null>(null);
  const permissions = auth.context?.permissions ?? [];
  const canOpen = hasPermission(permissions, "accounts.open");
  const canConfirm = hasEveryPermission(permissions, ["accounts.update", "sales.add_items", "kitchen.send"]);

  if (!tableId) {
    return <ErrorState variant="not-found" title="Mesa no especificada" />;
  }

  if (status === "loading") {
    return <LoadingState label="Cargando mesa…" />;
  }

  if (status === "error" || !snapshot) {
    return <ErrorState variant={errorVariant(error)} onRetry={reload} />;
  }

  const table = snapshot.tables.find((entry) => entry.id === tableId);

  if (!table) {
    return (
      <section className="dj-pending-order">
        <ErrorState variant="not-found" title="Mesa no encontrada" description="La mesa ya no existe en el salón." />
        <p>
          <Link to="/floor">Volver al salón</Link>
        </p>
      </section>
    );
  }

  if (table.openAccountId) {
    navigate(`/floor/accounts/${table.openAccountId}`, { replace: true });
    return null;
  }

  if (!canOpen) {
    return (
      <section className="dj-pending-order">
        <ErrorState variant="forbidden" description="Tu usuario no tiene permiso para abrir cuentas." />
        <p>
          <Link to="/floor">Volver al salón</Link>
        </p>
      </section>
    );
  }

  if (!table.active || (table.status !== "AVAILABLE" && table.status !== "RESERVED")) {
    return (
      <section className="dj-pending-order">
        <ErrorState
          variant="server"
          title="Mesa no disponible"
          description="La mesa cambió de estado. Vuelve al salón para verla actualizada."
          onRetry={reload}
        />
        <p>
          <Link to="/floor">Volver al salón</Link>
        </p>
      </section>
    );
  }

  const handleSubmit = async (items: ConfirmConsumptionRequest["items"]): Promise<ConfirmConsumptionResponse> => {
    const account = pendingAccountId
      ? await api.getAccount(pendingAccountId)
      : await api.openAccount({ tableId: table.id, notes: null });
    if (!pendingAccountId) {
      setPendingAccountId(account.id);
    }
    return api.confirmConsumption(account.id, { expectedVersion: account.version, items });
  };

  return (
    <section className="dj-pending-order" aria-labelledby="pending-order-title">
      <h1 id="pending-order-title">Pedido — {table.name}</h1>
      <p className="dj-pending-order__meta">{table.capacity} personas · Aún no se ha creado ninguna cuenta.</p>

      <Button variant="secondary" onClick={() => navigate("/floor")}>
        Volver al salón
      </Button>

      {!canConfirm ? (
        <p className="dj-catalog-form__hint">No tienes permisos para confirmar el pedido y enviarlo a cocina.</p>
      ) : catalog.status === "loading" ? (
        <LoadingState label="Cargando catálogo…" />
      ) : catalog.status === "error" || !catalog.snapshot ? (
        <ErrorState variant="server" title="No se pudo cargar el catálogo para armar el pedido" onRetry={catalog.reload} />
      ) : (
        <ConsumptionForm
          products={catalog.snapshot.products}
          accompaniments={catalog.snapshot.accompaniments}
          onSubmit={handleSubmit}
          onConfirmed={(result) => {
            navigate(`/floor/accounts/${result.account.id}`);
          }}
        />
      )}
    </section>
  );
}
