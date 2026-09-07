import { useState, type FormEvent } from "react";
import { Banner, Button } from "@don-juan/ui";
import { OpenCashSessionRequestSchema, type OpenCashSessionRequest } from "@don-juan/contracts";
import { commandErrorMessage } from "../shared/commandErrorMessage";

export interface OpenSessionFormProps {
  readonly cashRegisterId: string;
  readonly onSubmit: (input: OpenCashSessionRequest) => Promise<unknown>;
  readonly onCancel: () => void;
}

export function OpenSessionForm({ cashRegisterId, onSubmit, onCancel }: OpenSessionFormProps) {
  const [openingAmount, setOpeningAmount] = useState("0");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    setError(null);
    const payload: OpenCashSessionRequest = { cashRegisterId, openingAmount, notes: notes.trim().length > 0 ? notes : null };
    const parsed = OpenCashSessionRequestSchema.safeParse(payload);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Datos inválidos.");
      return;
    }
    setSubmitting(true);
    onSubmit(parsed.data).catch((cause: unknown) => {
      setError(commandErrorMessage(cause, "No se pudo abrir la caja. Intenta de nuevo."));
      setSubmitting(false);
    });
  };

  return (
    <form className="dj-catalog-form" onSubmit={handleSubmit}>
      <h3>Abrir caja</h3>
      {error ? <Banner tone="danger" title={error} /> : null}

      <label className="dj-catalog-form__field">
        <span>Monto inicial</span>
        <input inputMode="decimal" value={openingAmount} onChange={(event) => setOpeningAmount(event.target.value)} disabled={submitting} required />
      </label>

      <label className="dj-catalog-form__field">
        <span>Notas</span>
        <textarea value={notes} onChange={(event) => setNotes(event.target.value)} disabled={submitting} />
      </label>

      <div className="dj-catalog-form__actions">
        <Button type="submit" disabled={submitting}>
          {submitting ? "Abriendo…" : "Abrir caja"}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel} disabled={submitting}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
