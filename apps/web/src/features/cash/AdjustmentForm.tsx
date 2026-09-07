import { useState, type FormEvent } from "react";
import { Banner, Button } from "@don-juan/ui";
import { CashAdjustmentDirectionSchema, CashAdjustmentRequestSchema, type CashAdjustmentRequest } from "@don-juan/contracts";
import type { z } from "zod";
import { commandErrorMessage, isConflict } from "../shared/commandErrorMessage";

type Direction = z.infer<typeof CashAdjustmentDirectionSchema>;

export interface AdjustmentFormProps {
  readonly expectedVersion: number;
  readonly onSubmit: (input: CashAdjustmentRequest) => Promise<unknown>;
  readonly onCancel: () => void;
  readonly onConflict?: () => void;
}

export function AdjustmentForm({ expectedVersion, onSubmit, onCancel, onConflict }: AdjustmentFormProps) {
  const [amount, setAmount] = useState("");
  const [direction, setDirection] = useState<Direction>("INCREASE");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    setError(null);
    const payload: CashAdjustmentRequest = { expectedVersion, amount, direction, reason };
    const parsed = CashAdjustmentRequestSchema.safeParse(payload);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Datos inválidos.");
      return;
    }
    setSubmitting(true);
    onSubmit(parsed.data).catch((cause: unknown) => {
      setError(commandErrorMessage(cause, "No se pudo ajustar la caja. Intenta de nuevo."));
      setSubmitting(false);
      if (isConflict(cause)) onConflict?.();
    });
  };

  return (
    <form className="dj-catalog-form" onSubmit={handleSubmit}>
      <h3>Ajustar efectivo</h3>
      {error ? <Banner tone="danger" title={error} /> : null}

      <label className="dj-catalog-form__field">
        <span>Dirección</span>
        <select value={direction} onChange={(event) => setDirection(event.target.value as Direction)} disabled={submitting}>
          <option value="INCREASE">Ingreso</option>
          <option value="DECREASE">Retiro</option>
        </select>
      </label>

      <label className="dj-catalog-form__field">
        <span>Monto</span>
        <input inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} disabled={submitting} required />
      </label>

      <label className="dj-catalog-form__field">
        <span>Motivo</span>
        <input value={reason} onChange={(event) => setReason(event.target.value)} disabled={submitting} required />
      </label>

      <div className="dj-catalog-form__actions">
        <Button type="submit" disabled={submitting}>
          {submitting ? "Ajustando…" : "Confirmar ajuste"}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel} disabled={submitting}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
