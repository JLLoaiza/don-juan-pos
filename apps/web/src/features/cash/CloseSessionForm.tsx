import { useState, type FormEvent } from "react";
import { Banner, Button } from "@don-juan/ui";
import { CloseCashSessionRequestSchema, type CloseCashSessionRequest } from "@don-juan/contracts";
import { commandErrorMessage, isConflict } from "../shared/commandErrorMessage";

export interface CloseSessionFormProps {
  readonly expectedVersion: number;
  readonly onSubmit: (input: CloseCashSessionRequest) => Promise<unknown>;
  readonly onCancel: () => void;
  readonly onConflict?: () => void;
}

export function CloseSessionForm({ expectedVersion, onSubmit, onCancel, onConflict }: CloseSessionFormProps) {
  const [countedCash, setCountedCash] = useState("");
  const [notes, setNotes] = useState("");
  const [printReceipt, setPrintReceipt] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    setError(null);
    const payload: CloseCashSessionRequest = {
      expectedVersion,
      countedCash,
      notes: notes.trim().length > 0 ? notes : null,
      printReceipt,
    };
    const parsed = CloseCashSessionRequestSchema.safeParse(payload);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Datos inválidos.");
      return;
    }
    setSubmitting(true);
    onSubmit(parsed.data).catch((cause: unknown) => {
      setError(commandErrorMessage(cause, "No se pudo cerrar la caja. Intenta de nuevo."));
      setSubmitting(false);
      if (isConflict(cause)) onConflict?.();
    });
  };

  return (
    <form className="dj-catalog-form" onSubmit={handleSubmit}>
      <h3>Cerrar caja</h3>
      {error ? <Banner tone="danger" title={error} /> : null}
      <p className="dj-catalog-form__hint">
        El servidor calcula el efectivo esperado a partir de los movimientos de la sesión y la diferencia contra lo
        contado; el frontend no calcula ese monto.
      </p>

      <label className="dj-catalog-form__field">
        <span>Efectivo contado</span>
        <input inputMode="decimal" value={countedCash} onChange={(event) => setCountedCash(event.target.value)} disabled={submitting} required />
      </label>

      <label className="dj-catalog-form__field">
        <span>Notas</span>
        <textarea value={notes} onChange={(event) => setNotes(event.target.value)} disabled={submitting} />
      </label>

      <label className="dj-catalog-form__checkbox">
        <input type="checkbox" checked={printReceipt} onChange={(event) => setPrintReceipt(event.target.checked)} disabled={submitting} />
        <span>Imprimir recibo de cierre</span>
      </label>

      <div className="dj-catalog-form__actions">
        <Button type="submit" disabled={submitting}>
          {submitting ? "Cerrando…" : "Cerrar caja"}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel} disabled={submitting}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
