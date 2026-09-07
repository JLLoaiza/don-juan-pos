import { useState } from "react";
import { Banner, EmptyState, ErrorState, LoadingState } from "@don-juan/ui";
import { Button } from "@don-juan/ui";
import type { PaymentSnapshot } from "@don-juan/contracts";
import { formatMoney, formatQuantity } from "../catalog/format";
import { hasPermission } from "../catalog/permissions";
import type { UseCashRegistersResult } from "../cash/useCashRegisters";
import type { BillingApi } from "./billingApi";
import { DiscountForm } from "./DiscountForm";
import { ServiceForm } from "./ServiceForm";
import { PaymentForm } from "./PaymentForm";
import type { UseBillingResult } from "./useBilling";

const PAYMENT_METHOD_LABEL: Record<string, string> = { CASH: "Efectivo", CARD: "Tarjeta", QR: "QR" };
const DISCOUNT_TYPE_LABEL: Record<string, string> = { PERCENTAGE: "Porcentaje", FIXED: "Monto fijo" };

export interface BillingSectionProps {
  readonly billingResult: UseBillingResult;
  readonly cashRegistersResult: UseCashRegistersResult;
  readonly accountStatus: string;
  readonly permissions: ReadonlyArray<string>;
  readonly onChanged: () => void;
}

function billingErrorVariant(error: unknown): "network" | "forbidden" | "server" {
  const status = (error as { status?: number } | undefined)?.status;
  const kind = (error as { kind?: string } | undefined)?.kind;
  if (kind === "network") return "network";
  if (status === 403) return "forbidden";
  return "server";
}

function applyDiscount(api: BillingApi, accountId: string, input: Parameters<BillingApi["applyDiscount"]>[1]) {
  return api.applyDiscount(accountId, input);
}

function configureService(api: BillingApi, accountId: string, input: Parameters<BillingApi["configureService"]>[1]) {
  return api.configureService(accountId, input);
}

export function BillingSection({ billingResult, cashRegistersResult, accountStatus, permissions, onChanged }: BillingSectionProps) {
  const { status, billing, error, api, reload } = billingResult;
  const [showDiscountForm, setShowDiscountForm] = useState(false);
  const [showServiceForm, setShowServiceForm] = useState(false);
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [lastPayment, setLastPayment] = useState<PaymentSnapshot | null>(null);

  const canApplyDiscount = hasPermission(permissions, "sales.apply_discount");
  const canModifyService = hasPermission(permissions, "sales.modify_service");
  const canRegisterPayment = hasPermission(permissions, "payments.create");

  if (status === "loading") {
    return <LoadingState label="Cargando cobro…" />;
  }

  if (status === "error" || !billing) {
    return <ErrorState variant={billingErrorVariant(error)} title="No se pudo cargar el cobro" onRetry={reload} />;
  }

  const accountId = billing.accountId;
  const canModifyCommercials = accountStatus === "OPEN" && !billing.hasPayments;

  const handleApplyDiscount = (input: Parameters<BillingApi["applyDiscount"]>[1]) =>
    applyDiscount(api, accountId, input).then(() => {
      setShowDiscountForm(false);
      onChanged();
    });

  const handleConfigureService = (input: Parameters<BillingApi["configureService"]>[1]) =>
    configureService(api, accountId, input).then(() => {
      setShowServiceForm(false);
      onChanged();
    });

  const handleRegisterPayment = (input: Parameters<BillingApi["registerPayment"]>[1]) => api.registerPayment(accountId, input);

  return (
    <section className="dj-billing" aria-labelledby="billing-title">
      <h2 id="billing-title">Cobro</h2>

      <dl className="dj-account__totals">
        <div>
          <dt>Pagado</dt>
          <dd>{formatMoney(billing.paidTotal)}</dd>
        </div>
        <div className="dj-account__totals-grand">
          <dt>Saldo pendiente</dt>
          <dd>{formatMoney(billing.remainingBalance)}</dd>
        </div>
      </dl>

      <div className="dj-billing__block">
        <h3 className="dj-billing__block-title">Descuentos</h3>
        {billing.discounts.length === 0 ? (
          <EmptyState title="Sin descuentos" description="Esta cuenta no tiene descuentos aplicados." />
        ) : (
          <table className="dj-catalog-table">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Tipo</th>
                <th>Valor</th>
                <th>Monto aplicado</th>
              </tr>
            </thead>
            <tbody>
              {billing.discounts.map((discount) => (
                <tr key={discount.id}>
                  <td>{discount.name}</td>
                  <td>{DISCOUNT_TYPE_LABEL[discount.type] ?? discount.type}</td>
                  <td>{discount.type === "PERCENTAGE" ? `${formatQuantity(discount.value)}%` : formatMoney(discount.value)}</td>
                  <td>{formatMoney(discount.appliedAmount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {canModifyCommercials && canApplyDiscount ? (
          showDiscountForm ? (
            <DiscountForm
            expectedVersion={billing.version}
            onSubmit={handleApplyDiscount}
            onCancel={() => setShowDiscountForm(false)}
            onConflict={reload}
          />
          ) : (
            <Button variant="secondary" onClick={() => setShowDiscountForm(true)}>
              Aplicar descuento
            </Button>
          )
        ) : null}
      </div>

      <div className="dj-billing__block">
        <h3 className="dj-billing__block-title">Servicio ({formatQuantity(billing.servicePercentage)}%)</h3>
        {canModifyCommercials && canModifyService ? (
          showServiceForm ? (
            <ServiceForm
              expectedVersion={billing.version}
              currentPercentage={billing.servicePercentage}
              onSubmit={handleConfigureService}
              onCancel={() => setShowServiceForm(false)}
              onConflict={reload}
            />
          ) : (
            <Button variant="secondary" onClick={() => setShowServiceForm(true)}>
              Configurar servicio
            </Button>
          )
        ) : null}
      </div>

      <div className="dj-billing__block">
        <h3 className="dj-billing__block-title">Pagos</h3>
        {billing.payments.length === 0 ? (
          <EmptyState title="Sin pagos" description="Esta cuenta todavía no tiene pagos registrados." />
        ) : (
          <table className="dj-catalog-table">
            <thead>
              <tr>
                <th>Método</th>
                <th>Monto aplicado</th>
                <th>Efectivo recibido</th>
                <th>Cambio</th>
                <th>Estado</th>
                <th>Recibido</th>
              </tr>
            </thead>
            <tbody>
              {billing.payments.map((payment) => (
                <tr key={payment.id}>
                  <td>{PAYMENT_METHOD_LABEL[payment.paymentMethodType] ?? payment.paymentMethodName}</td>
                  <td>{formatMoney(payment.amountApplied)}</td>
                  <td>{payment.cashReceived === null ? "—" : formatMoney(payment.cashReceived)}</td>
                  <td>{payment.cashReceived === null ? "—" : formatMoney(payment.changeAmount)}</td>
                  <td>{payment.status === "REGISTERED" ? "Registrado" : "Anulado"}</td>
                  <td>{new Date(payment.receivedAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {lastPayment ? (
          <Banner
            tone="info"
            title="Pago registrado"
            {...(lastPayment.cashReceived !== null
              ? { description: `Recibido ${formatMoney(lastPayment.cashReceived)} · Cambio ${formatMoney(lastPayment.changeAmount)}` }
              : {})}
          />
        ) : null}
        {canRegisterPayment && Number(billing.remainingBalance) > 0 && accountStatus === "OPEN" ? (
          showPaymentForm ? (
            <PaymentForm
              expectedVersion={billing.version}
              remainingBalance={billing.remainingBalance}
              billingApi={api}
              cashRegistersResult={cashRegistersResult}
              onSubmit={handleRegisterPayment}
              onSubmitted={(result) => {
                setLastPayment(result);
                setShowPaymentForm(false);
                onChanged();
              }}
              onCancel={() => setShowPaymentForm(false)}
              onConflict={reload}
            />
          ) : (
            <Button onClick={() => setShowPaymentForm(true)}>Registrar pago</Button>
          )
        ) : null}
      </div>
    </section>
  );
}
