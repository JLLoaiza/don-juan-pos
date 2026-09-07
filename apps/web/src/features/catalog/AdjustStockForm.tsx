import { useState, type FormEvent } from "react";
import { Banner, Button } from "@don-juan/ui";
import { AdjustInventoryRequestSchema, type AdjustInventoryRequest } from "@don-juan/contracts";
import type { InventoryItem } from "./catalogApi";
import { formatQuantity, unitLabel } from "./format";

function apiErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : null;
  return message && message.length > 0 ? message : "No se pudo ajustar el stock. Intenta de nuevo.";
}

export interface AdjustStockFormProps {
  readonly item: InventoryItem;
  readonly onSubmit: (input: AdjustInventoryRequest) => Promise<unknown>;
  readonly onCancel: () => void;
}

export function AdjustStockForm({ item, onSubmit, onCancel }: AdjustStockFormProps) {
  const [quantityDelta, setQuantityDelta] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    setError(null);
    const payload: AdjustInventoryRequest = { expectedVersion: item.version, quantityDelta, reason };
    const parsed = AdjustInventoryRequestSchema.safeParse(payload);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Datos inválidos.");
      return;
    }
    setSubmitting(true);
    onSubmit(parsed.data).catch((cause: unknown) => {
      setError(apiErrorMessage(cause));
      setSubmitting(false);
    });
  };

  return (
    <form className="dj-catalog-form" onSubmit={handleSubmit}>
      <h3>Ajustar stock — {item.name}</h3>
      {error ? <Banner tone="danger" title={error} /> : null}
      <p className="dj-catalog-form__hint">
        Stock actual: {formatQuantity(item.currentStock)} {unitLabel(item.unit)}. El stock negativo está permitido; la
        venta nunca se bloquea por falta de existencias.
      </p>

      <label className="dj-catalog-form__field">
        <span>Cantidad a sumar o restar (usa signo negativo para restar)</span>
        <input
          inputMode="decimal"
          value={quantityDelta}
          onChange={(event) => setQuantityDelta(event.target.value)}
          placeholder="-2.5"
          disabled={submitting}
          required
        />
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
