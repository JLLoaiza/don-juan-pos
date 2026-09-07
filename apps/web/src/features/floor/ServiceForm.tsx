import { useState, type FormEvent } from "react";
import { Banner, Button } from "@don-juan/ui";
import { ConfigureServiceRequestSchema, type ConfigureServiceRequest } from "@don-juan/contracts";

function apiErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : null;
  return message && message.length > 0 ? message : "No se pudo actualizar el servicio. Intenta de nuevo.";
}

export interface ServiceFormProps {
  readonly expectedVersion: number;
  readonly currentPercentage: string;
  readonly onSubmit: (input: ConfigureServiceRequest) => Promise<unknown>;
  readonly onCancel: () => void;
}

export function ServiceForm({ expectedVersion, currentPercentage, onSubmit, onCancel }: ServiceFormProps) {
  const [percentage, setPercentage] = useState(currentPercentage);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    setError(null);
    const payload: ConfigureServiceRequest = { expectedVersion, percentage };
    const parsed = ConfigureServiceRequestSchema.safeParse(payload);
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
      <h3>Configurar servicio</h3>
      {error ? <Banner tone="danger" title={error} /> : null}

      <label className="dj-catalog-form__field">
        <span>Porcentaje de servicio (%)</span>
        <input inputMode="decimal" value={percentage} onChange={(event) => setPercentage(event.target.value)} disabled={submitting} required />
      </label>

      <div className="dj-catalog-form__actions">
        <Button type="submit" disabled={submitting}>
          {submitting ? "Guardando…" : "Guardar"}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel} disabled={submitting}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
