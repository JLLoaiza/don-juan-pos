import { useState } from "react";
import { useParams } from "react-router-dom";
import { Banner, ErrorState, LoadingState } from "@don-juan/ui";
import type { ConfirmConsumptionResponse } from "@don-juan/contracts";
import { ApiRequestError } from "../../lib/api/httpClient";
import { useAuth } from "../auth/useAuth";
import { hasEveryPermission, hasPermission } from "../catalog/permissions";
import { formatMoney, formatQuantity } from "../catalog/format";
import { useCatalog } from "../catalog/useCatalog";
import { useCashRegisters } from "../cash/useCashRegisters";
import { useAccount } from "./useFloor";
import { useBilling } from "./useBilling";
import { BillingSection } from "./BillingSection";
import { ConsumptionForm } from "./ConsumptionForm";
import "./AccountPage.css";

const ACCOUNT_STATUS_LABEL: Record<string, string> = { OPEN: "Abierta", PAID: "Pagada", VOID: "Anulada" };

function errorVariant(error: unknown): "network" | "forbidden" | "not-found" | "server" {
  if (error instanceof ApiRequestError) {
    if (error.kind === "network") return "network";
    if (error.status === 403) return "forbidden";
    if (error.status === 404 || error.status === 422) return "not-found";
  }
  return "server";
}

export function AccountPage() {
  const { accountId } = useParams<{ accountId: string }>();
  const auth = useAuth();
  const { status, account, error, reload, api } = useAccount(accountId ?? "");
  const billing = useBilling(accountId ?? "");
  const cashRegisters = useCashRegisters();
  const catalog = useCatalog();
  const [lastResult, setLastResult] = useState<ConfirmConsumptionResponse | null>(null);
  const permissions = auth.context?.permissions ?? [];
  const canAddItems = hasEveryPermission(permissions, ["accounts.update", "sales.add_items", "kitchen.send"]);
  const canViewCost = hasPermission(permissions, "products.view_cost");

  if (!accountId) {
    return <ErrorState variant="not-found" title="Cuenta no especificada" />;
  }

  if (status === "loading") {
    return <LoadingState label="Cargando cuenta…" />;
  }

  if (status === "error" || !account) {
    const variant = errorVariant(error);
    return <ErrorState variant={variant} onRetry={reload} />;
  }

  return (
    <section className="dj-account" aria-labelledby="account-title">
      <h1 id="account-title">Cuenta — {ACCOUNT_STATUS_LABEL[account.status] ?? account.status}</h1>
      <p className="dj-account__meta">
        Abierta el {new Date(account.openedAt).toLocaleString()}
        {account.notes ? ` · ${account.notes}` : ""}
      </p>

      {lastResult ? (
        <Banner
          tone={lastResult.warnings.length > 0 ? "warning" : "info"}
          title={
            lastResult.kitchenOrder
              ? `Enviado a cocina (ticket ${lastResult.kitchenOrder.ticketNumber})`
              : "Consumo confirmado"
          }
          {...(lastResult.warnings.length > 0
            ? {
                description: `Aviso de stock negativo: ${lastResult.warnings.map((warning) => `${warning.inventoryItemName} (${formatQuantity(warning.currentStock)} ${warning.unit})`).join(", ")}. La venta se registró de todas formas.`,
              }
            : lastResult.printJob
              ? { description: `Trabajo de impresión: ${lastResult.printJob.status.toLowerCase()}.` }
              : {})}
        />
      ) : null}

      {account.items.length === 0 ? (
        <p className="dj-catalog-form__hint">Esta cuenta todavía no tiene consumo confirmado.</p>
      ) : (
        <table className="dj-catalog-table">
          <thead>
            <tr>
              <th>Producto</th>
              <th>Cantidad</th>
              <th>Precio unitario</th>
              {canViewCost ? <th>Costo unitario</th> : null}
              <th>Total línea</th>
              <th>Estado</th>
              <th>Notas</th>
            </tr>
          </thead>
          <tbody>
            {account.items.map((item) => (
              <tr key={item.id}>
                <td>
                  {item.productName}
                  {item.additionals.length > 0 ? (
                    <ul className="dj-account__additionals">
                      {item.additionals.map((additional) => (
                        <li key={additional.accompanimentId}>
                          {additional.name}
                          {additional.noCharge ? " (sin costo)" : ` (+${formatMoney(additional.total)})`}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </td>
                <td>{formatQuantity(item.quantity)}</td>
                <td>{formatMoney(item.unitSalePrice)}</td>
                {canViewCost ? <td>{formatMoney(item.unitCost)}</td> : null}
                <td>{formatMoney(item.lineTotal)}</td>
                <td>{item.status === "CONFIRMED" ? "Confirmado" : "Anulado"}</td>
                <td>{item.notes ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <dl className="dj-account__totals">
        <div>
          <dt>Subtotal</dt>
          <dd>{formatMoney(account.subtotal)}</dd>
        </div>
        <div>
          <dt>Descuentos</dt>
          <dd>{formatMoney(account.discountTotal)}</dd>
        </div>
        <div>
          <dt>Servicio ({formatQuantity(account.servicePercentage)}%)</dt>
          <dd>{formatMoney(account.serviceTotal)}</dd>
        </div>
        <div>
          <dt>Impuestos</dt>
          <dd>{formatMoney(account.taxTotal)}</dd>
        </div>
        <div className="dj-account__totals-grand">
          <dt>Total</dt>
          <dd>{formatMoney(account.total)}</dd>
        </div>
      </dl>

      <BillingSection
        billingResult={billing}
        cashRegistersResult={cashRegisters}
        accountStatus={account.status}
        permissions={permissions}
        onChanged={() => {
          billing.reload();
          reload();
        }}
      />

      {account.status === "OPEN" && billing.status === "ready" && !billing.billing?.hasPayments && canAddItems ? (
        catalog.status === "loading" ? (
          <LoadingState label="Cargando catálogo…" />
        ) : catalog.status === "error" || !catalog.snapshot ? (
          <ErrorState
            variant="server"
            title="No se pudo cargar el catálogo para agregar productos"
            onRetry={catalog.reload}
          />
        ) : (
          <ConsumptionForm
            products={catalog.snapshot.products}
            accompaniments={catalog.snapshot.accompaniments}
            expectedVersion={account.version}
            onSubmit={(input) => api.confirmConsumption(account.id, input)}
            onConfirmed={(result) => {
              setLastResult(result);
              reload();
            }}
          />
        )
      ) : null}
    </section>
  );
}
