import { useState, type FormEvent } from "react";
import { Banner, Button } from "@don-juan/ui";
import { UpdateProductPriceRequestSchema, type UpdateProductPriceRequest } from "@don-juan/contracts";
import type { Product } from "./catalogApi";
import { formatMoney } from "./format";

type PricingMode = "salePrice" | "targetProfit" | "targetMarginPercent";

const MODE_LABELS: Record<PricingMode, string> = {
  salePrice: "Precio de venta fijo",
  targetProfit: "Utilidad objetivo",
  targetMarginPercent: "Margen objetivo (%)",
};

function apiErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : null;
  return message && message.length > 0 ? message : "No se pudo actualizar el precio. Intenta de nuevo.";
}

export interface ProductPriceFormProps {
  readonly product: Product;
  readonly onSubmit: (input: UpdateProductPriceRequest) => Promise<unknown>;
  readonly onCancel: () => void;
}

export function ProductPriceForm({ product, onSubmit, onCancel }: ProductPriceFormProps) {
  const [mode, setMode] = useState<PricingMode>("salePrice");
  const [value, setValue] = useState(product.salePrice);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    setError(null);
    const payload: UpdateProductPriceRequest = { expectedVersion: product.version, [mode]: value };
    const parsed = UpdateProductPriceRequestSchema.safeParse(payload);
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
      <h3>Precio — {product.name}</h3>
      {error ? <Banner tone="danger" title={error} /> : null}
      <p className="dj-catalog-form__hint">
        Precio actual: {formatMoney(product.salePrice)}. Costo calculado: {formatMoney(product.calculatedCost)}. El
        servidor resuelve el nuevo precio; el frontend no calcula montos.
      </p>

      <fieldset className="dj-catalog-form__field">
        <legend>Forma de fijar el precio</legend>
        {(Object.keys(MODE_LABELS) as PricingMode[]).map((option) => (
          <label key={option} className="dj-catalog-form__checkbox">
            <input
              type="radio"
              name="pricing-mode"
              value={option}
              checked={mode === option}
              onChange={() => setMode(option)}
              disabled={submitting}
            />
            <span>{MODE_LABELS[option]}</span>
          </label>
        ))}
      </fieldset>

      <label className="dj-catalog-form__field">
        <span>Valor</span>
        <input inputMode="decimal" value={value} onChange={(event) => setValue(event.target.value)} disabled={submitting} required />
      </label>

      <div className="dj-catalog-form__actions">
        <Button type="submit" disabled={submitting}>
          {submitting ? "Actualizando…" : "Actualizar precio"}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel} disabled={submitting}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
