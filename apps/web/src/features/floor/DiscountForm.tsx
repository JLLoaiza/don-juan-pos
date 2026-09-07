import { useState, type FormEvent } from "react";
import { Banner, Button } from "@don-juan/ui";
import { ApplyAccountDiscountRequestSchema, type ApplyAccountDiscountRequest, type DiscountTypeSchema } from "@don-juan/contracts";
import type { z } from "zod";
import { commandErrorMessage, isConflict } from "../shared/commandErrorMessage";

type DiscountType = z.infer<typeof DiscountTypeSchema>;

export interface DiscountFormProps {
  readonly expectedVersion: number;
  readonly onSubmit: (input: ApplyAccountDiscountRequest) => Promise<unknown>;
  readonly onCancel: () => void;
  readonly onConflict?: () => void;
}

export function DiscountForm({ expectedVersion, onSubmit, onCancel, onConflict }: DiscountFormProps) {
  const [name, setName] = useState("");
  const [type, setType] = useState<DiscountType>("PERCENTAGE");
  const [value, setValue] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    setError(null);
    const payload: ApplyAccountDiscountRequest = { expectedVersion, name, type, value };
    const parsed = ApplyAccountDiscountRequestSchema.safeParse(payload);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Datos inválidos.");
      return;
    }
    setSubmitting(true);
    onSubmit(parsed.data).catch((cause: unknown) => {
      setError(commandErrorMessage(cause, "No se pudo aplicar el descuento. Intenta de nuevo."));
      setSubmitting(false);
      if (isConflict(cause)) onConflict?.();
    });
  };

  return (
    <form className="dj-catalog-form" onSubmit={handleSubmit}>
      <h3>Aplicar descuento</h3>
      {error ? <Banner tone="danger" title={error} /> : null}

      <label className="dj-catalog-form__field">
        <span>Nombre</span>
        <input value={name} onChange={(event) => setName(event.target.value)} required disabled={submitting} placeholder="Ej. Cortesía gerencia" />
      </label>

      <label className="dj-catalog-form__field">
        <span>Tipo</span>
        <select value={type} onChange={(event) => setType(event.target.value as DiscountType)} disabled={submitting}>
          <option value="PERCENTAGE">Porcentaje</option>
          <option value="FIXED">Monto fijo</option>
        </select>
      </label>

      <label className="dj-catalog-form__field">
        <span>{type === "PERCENTAGE" ? "Valor (%)" : "Valor ($)"}</span>
        <input inputMode="decimal" value={value} onChange={(event) => setValue(event.target.value)} disabled={submitting} required />
      </label>

      <div className="dj-catalog-form__actions">
        <Button type="submit" disabled={submitting}>
          {submitting ? "Aplicando…" : "Aplicar"}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel} disabled={submitting}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
