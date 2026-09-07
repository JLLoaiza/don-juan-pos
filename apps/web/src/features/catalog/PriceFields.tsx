import { useEffect, useState } from "react";
import type { Accompaniment, InventoryItem } from "./catalogApi";
import { formatMoney } from "./format";
import { deriveFromMargin, deriveFromProfit, deriveFromSalePrice, previewComponentsCost } from "./pricing";
import type { ProductComponentValue } from "./ProductComponentsEditor";

export interface PriceFieldsProps {
  readonly salePrice: string;
  readonly onSalePriceChange: (value: string) => void;
  readonly components: ReadonlyArray<ProductComponentValue>;
  readonly inventoryItems: ReadonlyArray<InventoryItem>;
  readonly accompaniments: ReadonlyArray<Accompaniment>;
  readonly disabled?: boolean;
}

/**
 * Three linked fields (sale price, profit, margin) instead of a picker with
 * one shared value: editing any of the three recomputes the other two. Only
 * `salePrice` is ever submitted — profit/margin are a convenience calculator
 * built from a client-side cost preview, never sent to the server.
 */
export function PriceFields({ salePrice, onSalePriceChange, components, inventoryItems, accompaniments, disabled }: PriceFieldsProps) {
  const cost = previewComponentsCost(components, inventoryItems, accompaniments);
  const [profit, setProfit] = useState("");
  const [marginPercent, setMarginPercent] = useState("");
  const [marginError, setMarginError] = useState<string | null>(null);

  // Recomputes profit/margin whenever the estimated cost changes (e.g. the
  // recipe was edited), keeping the current sale price fixed. Editing the
  // sale price, profit or margin fields themselves is handled by their own
  // handlers below, so this never fights the field the user is typing in.
  useEffect(() => {
    if (cost === null) return;
    const priceNumber = Number(salePrice);
    if (!Number.isFinite(priceNumber)) return;
    const derived = deriveFromSalePrice(cost, priceNumber);
    setProfit(derived.profit);
    setMarginPercent(derived.marginPercent);
    // Only the estimated cost should retrigger this; salePrice changes are
    // already handled live by handleSalePriceChange below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cost]);

  const handleSalePriceChange = (value: string) => {
    onSalePriceChange(value);
    if (cost === null) return;
    const priceNumber = Number(value);
    if (!Number.isFinite(priceNumber)) return;
    const derived = deriveFromSalePrice(cost, priceNumber);
    setProfit(derived.profit);
    setMarginPercent(derived.marginPercent);
  };

  const handleProfitChange = (value: string) => {
    setProfit(value);
    if (cost === null) return;
    const profitNumber = Number(value);
    if (!Number.isFinite(profitNumber)) return;
    const derived = deriveFromProfit(cost, profitNumber);
    onSalePriceChange(derived.salePrice);
    setMarginPercent(derived.marginPercent);
  };

  const handleMarginChange = (value: string) => {
    setMarginPercent(value);
    setMarginError(null);
    if (cost === null) return;
    const marginNumber = Number(value);
    if (!Number.isFinite(marginNumber)) return;
    const derived = deriveFromMargin(cost, marginNumber);
    if (!derived) {
      setMarginError("El margen debe ser menor a 100%.");
      return;
    }
    onSalePriceChange(derived.salePrice);
    setProfit(derived.profit);
  };

  return (
    <div className="dj-catalog-form__components">
      <span className="dj-catalog-form__components-label">Precio</span>
      {cost !== null ? (
        <p className="dj-catalog-form__hint">
          Costo estimado de la receta con los ítems seleccionados: {formatMoney(cost.toFixed(6))}. El servidor
          calcula el costo real al guardar; utilidad y margen aquí son solo una ayuda visual.
        </p>
      ) : (
        <p className="dj-catalog-form__hint">
          No se puede estimar utilidad ni margen: falta el costo de algún componente seleccionado (o no tienes
          permiso para verlo). Puedes seguir fijando el precio de venta directamente.
        </p>
      )}
      {marginError ? <p className="dj-catalog-form__hint">{marginError}</p> : null}
      <div className="dj-catalog-form__component-row">
        <label className="dj-catalog-form__field">
          <span>Precio de venta</span>
          <input
            inputMode="decimal"
            value={salePrice}
            onChange={(event) => handleSalePriceChange(event.target.value)}
            disabled={disabled}
          />
        </label>
        <label className="dj-catalog-form__field">
          <span>Utilidad</span>
          <input
            inputMode="decimal"
            value={profit}
            onChange={(event) => handleProfitChange(event.target.value)}
            disabled={disabled || cost === null}
          />
        </label>
        <label className="dj-catalog-form__field">
          <span>Margen (%)</span>
          <input
            inputMode="decimal"
            value={marginPercent}
            onChange={(event) => handleMarginChange(event.target.value)}
            disabled={disabled || cost === null}
          />
        </label>
      </div>
    </div>
  );
}
