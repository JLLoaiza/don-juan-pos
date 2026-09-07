import { useEffect, useState, type FormEvent } from "react";
import { Banner, Button, ErrorState, LoadingState } from "@don-juan/ui";
import { RegisterPaymentRequestSchema, type PaymentSnapshot, type RegisterPaymentRequest } from "@don-juan/contracts";
import { commandErrorMessage, isConflict } from "../shared/commandErrorMessage";
import type { UseCashRegistersResult } from "../cash/useCashRegisters";
import { formatMoney } from "../catalog/format";
import type { BillingApi, PaymentMethod } from "./billingApi";

const PAYMENT_METHOD_LABEL: Record<string, string> = { CASH: "Efectivo", CARD: "Tarjeta", QR: "QR" };

export interface PaymentFormProps {
  readonly expectedVersion: number;
  readonly remainingBalance: string;
  readonly billingApi: BillingApi;
  readonly cashRegistersResult: UseCashRegistersResult;
  readonly onSubmit: (input: RegisterPaymentRequest) => Promise<PaymentSnapshot>;
  readonly onSubmitted: (result: PaymentSnapshot) => void;
  readonly onCancel: () => void;
  readonly onConflict?: () => void;
}

export function PaymentForm({
  expectedVersion,
  remainingBalance,
  billingApi,
  cashRegistersResult,
  onSubmit,
  onSubmitted,
  onCancel,
  onConflict,
}: PaymentFormProps) {
  const [methodsStatus, setMethodsStatus] = useState<"loading" | "ready" | "error">("loading");
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [methodsError, setMethodsError] = useState<unknown>(null);

  const [paymentMethodId, setPaymentMethodId] = useState("");
  const [amountApplied, setAmountApplied] = useState(remainingBalance);
  const [cashSessionId, setCashSessionId] = useState("");
  const [cashReceived, setCashReceived] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [printReceipt, setPrintReceipt] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadMethods = () => {
    setMethodsStatus("loading");
    setMethodsError(null);
    billingApi
      .getPaymentMethods()
      .then((result) => {
        setMethods(result);
        setMethodsStatus("ready");
        if (result[0] && !paymentMethodId) setPaymentMethodId(result[0].id);
      })
      .catch((cause: unknown) => {
        setMethodsError(cause);
        setMethodsStatus("error");
      });
  };

  // Loads once when the form mounts (i.e. when "Registrar pago" is opened),
  // not eagerly on every account view — payment methods rarely change and
  // there is no reason to fetch them before the cashier actually intends to charge.
  useEffect(() => {
    loadMethods();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedMethod = methods.find((method) => method.id === paymentMethodId) ?? null;
  const isCash = selectedMethod?.type === "CASH";
  const registersWithOpenSession = (cashRegistersResult.cashRegisters ?? []).filter((register) => register.openSession !== null);
  const changePreview = isCash && cashReceived.length > 0 && amountApplied.length > 0
    ? Number(cashReceived) - Number(amountApplied)
    : null;

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    setError(null);

    const payload: RegisterPaymentRequest = {
      expectedVersion,
      paymentMethodId,
      amountApplied,
      reference: reference.trim().length > 0 ? reference : null,
      notes: notes.trim().length > 0 ? notes : null,
      printReceipt,
      ...(isCash ? { cashReceived, cashSessionId: cashSessionId || null } : {}),
    };
    const parsed = RegisterPaymentRequestSchema.safeParse(payload);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Datos inválidos.");
      return;
    }
    setSubmitting(true);
    onSubmit(parsed.data)
      .then((result) => onSubmitted(result))
      .catch((cause: unknown) => {
        setError(commandErrorMessage(cause, "No se pudo registrar el pago. Intenta de nuevo."));
        setSubmitting(false);
        if (isConflict(cause)) onConflict?.();
      });
  };

  if (methodsStatus === "loading") {
    return <LoadingState label="Cargando métodos de pago…" />;
  }

  if (methodsStatus === "error") {
    return <ErrorState variant="server" title="No se pudieron cargar los métodos de pago" onRetry={loadMethods} />;
  }

  if (methods.length === 0) {
    return <p className="dj-catalog-form__hint">No hay métodos de pago activos configurados en esta sucursal.</p>;
  }

  return (
    <form className="dj-catalog-form" onSubmit={handleSubmit}>
      <h3>Registrar pago</h3>
      {error ? <Banner tone="danger" title={error} /> : null}
      <p className="dj-catalog-form__hint">Saldo pendiente: {formatMoney(remainingBalance)}</p>

      <label className="dj-catalog-form__field">
        <span>Método de pago</span>
        <select value={paymentMethodId} onChange={(event) => setPaymentMethodId(event.target.value)} disabled={submitting}>
          {methods.map((method) => (
            <option key={method.id} value={method.id}>
              {PAYMENT_METHOD_LABEL[method.type] ?? method.name} — {method.name}
            </option>
          ))}
        </select>
      </label>

      <label className="dj-catalog-form__field">
        <span>Monto a aplicar</span>
        <input inputMode="decimal" value={amountApplied} onChange={(event) => setAmountApplied(event.target.value)} disabled={submitting} required />
      </label>

      {isCash ? (
        registersWithOpenSession.length === 0 ? (
          <Banner
            tone="warning"
            title="No hay ninguna caja abierta"
            description="Para cobrar en efectivo primero se debe abrir una sesión de caja desde la pantalla Caja."
          />
        ) : (
          <>
            <label className="dj-catalog-form__field">
              <span>Caja</span>
              <select value={cashSessionId} onChange={(event) => setCashSessionId(event.target.value)} disabled={submitting}>
                <option value="">Selecciona una caja…</option>
                {registersWithOpenSession.map((register) => (
                  <option key={register.id} value={register.openSession?.id}>
                    {register.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="dj-catalog-form__field">
              <span>Efectivo recibido</span>
              <input inputMode="decimal" value={cashReceived} onChange={(event) => setCashReceived(event.target.value)} disabled={submitting} required />
            </label>
            {changePreview !== null ? (
              <p className="dj-catalog-form__hint">
                Cambio estimado: {changePreview >= 0 ? formatMoney(changePreview.toFixed(2)) : "—"} (el servidor confirma el
                monto exacto al registrar el pago).
              </p>
            ) : null}
          </>
        )
      ) : null}

      <label className="dj-catalog-form__field">
        <span>Referencia</span>
        <input value={reference} onChange={(event) => setReference(event.target.value)} disabled={submitting} placeholder="Ej. últimos 4 dígitos, folio" />
      </label>

      <label className="dj-catalog-form__field">
        <span>Notas</span>
        <textarea value={notes} onChange={(event) => setNotes(event.target.value)} disabled={submitting} />
      </label>

      <label className="dj-catalog-form__checkbox">
        <input type="checkbox" checked={printReceipt} onChange={(event) => setPrintReceipt(event.target.checked)} disabled={submitting} />
        <span>Imprimir recibo</span>
      </label>

      <div className="dj-catalog-form__actions">
        <Button type="submit" disabled={submitting || (isCash && registersWithOpenSession.length === 0)}>
          {submitting ? "Registrando…" : "Registrar pago"}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel} disabled={submitting}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
