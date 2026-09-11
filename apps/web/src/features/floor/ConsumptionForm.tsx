import { useState, type FormEvent } from "react";
import { z } from "zod";
import { Banner, Button } from "@don-juan/ui";
import { ConfirmConsumptionItemSchema, type ConfirmConsumptionRequest, type ConfirmConsumptionResponse } from "@don-juan/contracts";
import type { Accompaniment, Product } from "../catalog/catalogApi";
import { formatMoney } from "../catalog/format";

const ConsumptionItemsSchema = z.array(ConfirmConsumptionItemSchema).min(1);

interface DraftItem {
  productId: string;
  quantity: string;
  notes: string;
  selectedAdditionalIds: string[];
  noChargeIds: string[];
}

function apiErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : null;
  return message && message.length > 0 ? message : "No se pudo confirmar el consumo. Intenta de nuevo.";
}

function newDraftItem(defaultProductId: string): DraftItem {
  return { productId: defaultProductId, quantity: "1", notes: "", selectedAdditionalIds: [], noChargeIds: [] };
}

export interface ConsumptionFormProps {
  readonly products: ReadonlyArray<Product>;
  readonly accompaniments: ReadonlyArray<Accompaniment>;
  readonly onSubmit: (items: ConfirmConsumptionRequest["items"]) => Promise<ConfirmConsumptionResponse>;
  readonly onConfirmed: (result: ConfirmConsumptionResponse) => void;
}

export function ConsumptionForm({ products, accompaniments, onSubmit, onConfirmed }: ConsumptionFormProps) {
  const activeProducts = products.filter((product) => product.active);
  const accompanimentById = new Map(accompaniments.map((entry) => [entry.id, entry]));
  const [items, setItems] = useState<DraftItem[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addItem = () => {
    const firstProduct = activeProducts[0];
    if (!firstProduct) return;
    setItems((current) => [...current, newDraftItem(firstProduct.id)]);
  };

  const removeItem = (index: number) => {
    setItems((current) => current.filter((_, itemIndex) => itemIndex !== index));
  };

  const updateItem = (index: number, patch: Partial<DraftItem>) => {
    setItems((current) => current.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)));
  };

  const toggleAdditional = (index: number, accompanimentId: string, checked: boolean) => {
    setItems((current) =>
      current.map((item, itemIndex) => {
        if (itemIndex !== index) return item;
        const selectedAdditionalIds = checked
          ? [...item.selectedAdditionalIds, accompanimentId]
          : item.selectedAdditionalIds.filter((id) => id !== accompanimentId);
        const noChargeIds = checked ? item.noChargeIds : item.noChargeIds.filter((id) => id !== accompanimentId);
        return { ...item, selectedAdditionalIds, noChargeIds };
      }),
    );
  };

  const toggleNoCharge = (index: number, accompanimentId: string, checked: boolean) => {
    setItems((current) =>
      current.map((item, itemIndex) => {
        if (itemIndex !== index) return item;
        const noChargeIds = checked ? [...item.noChargeIds, accompanimentId] : item.noChargeIds.filter((id) => id !== accompanimentId);
        return { ...item, noChargeIds };
      }),
    );
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    setError(null);

    const payload: ConfirmConsumptionRequest["items"] = items.map((item) => ({
      productId: item.productId,
      quantity: item.quantity,
      selectedAdditionals: item.selectedAdditionalIds.map((accompanimentId) => ({
        accompanimentId,
        noCharge: item.noChargeIds.includes(accompanimentId),
      })),
      notes: item.notes.trim().length > 0 ? item.notes : null,
    }));
    const parsed = ConsumptionItemsSchema.safeParse(payload);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Datos inválidos.");
      return;
    }
    setSubmitting(true);
    onSubmit(parsed.data)
      .then((result) => {
        setItems([]);
        setSubmitting(false);
        onConfirmed(result);
      })
      .catch((cause: unknown) => {
        setError(apiErrorMessage(cause));
        setSubmitting(false);
      });
  };

  if (activeProducts.length === 0) {
    return <p className="dj-catalog-form__hint">No hay productos activos disponibles en el catálogo.</p>;
  }

  return (
    <form className="dj-catalog-form" onSubmit={handleSubmit}>
      <h3>Agregar consumo</h3>
      {error ? <Banner tone="danger" title={error} /> : null}

      {items.length === 0 ? <p className="dj-catalog-form__hint">Agrega productos para enviar a cocina.</p> : null}
      {items.map((item, index) => {
        const product = activeProducts.find((entry) => entry.id === item.productId);
        const additionals = product?.additionals.filter((additional) => additional.active) ?? [];
        return (
          <div className="dj-consumption-item" key={index}>
            <div className="dj-catalog-form__component-row">
              <select
                value={item.productId}
                onChange={(event) => updateItem(index, { productId: event.target.value, selectedAdditionalIds: [], noChargeIds: [] })}
                disabled={submitting}
                aria-label="Producto"
              >
                {activeProducts.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.name} ({formatMoney(entry.salePrice)})
                  </option>
                ))}
              </select>
              <input
                type="number"
                min={1}
                step={1}
                value={item.quantity}
                onChange={(event) => updateItem(index, { quantity: event.target.value })}
                disabled={submitting}
                aria-label="Cantidad"
              />
              <Button type="button" variant="secondary" onClick={() => removeItem(index)} disabled={submitting}>
                Quitar
              </Button>
            </div>
            <input
              className="dj-consumption-item__notes"
              placeholder="Notas para cocina (ej. sin cebolla)"
              value={item.notes}
              onChange={(event) => updateItem(index, { notes: event.target.value })}
              disabled={submitting}
              aria-label="Notas del producto"
            />
            {additionals.length > 0 ? (
              <div className="dj-consumption-item__additionals">
                {additionals.map((additional) => {
                  const accompaniment = accompanimentById.get(additional.accompanimentId);
                  const checked = item.selectedAdditionalIds.includes(additional.accompanimentId);
                  return (
                    <label key={additional.accompanimentId} className="dj-catalog-form__checkbox">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(event) => toggleAdditional(index, additional.accompanimentId, event.target.checked)}
                        disabled={submitting}
                      />
                      <span>
                        {accompaniment?.name ?? "Adicional"} (
                        {formatMoney(additional.priceOverride ?? accompaniment?.defaultPrice ?? "0")})
                      </span>
                      {checked && additional.allowFree ? (
                        <label className="dj-catalog-form__checkbox">
                          <input
                            type="checkbox"
                            checked={item.noChargeIds.includes(additional.accompanimentId)}
                            onChange={(event) => toggleNoCharge(index, additional.accompanimentId, event.target.checked)}
                            disabled={submitting}
                          />
                          <span>Sin costo</span>
                        </label>
                      ) : null}
                    </label>
                  );
                })}
              </div>
            ) : null}
          </div>
        );
      })}

      <div className="dj-catalog-form__actions">
        <Button type="button" variant="secondary" onClick={addItem} disabled={submitting}>
          Agregar producto
        </Button>
        <Button type="submit" disabled={submitting || items.length === 0}>
          {submitting ? "Enviando…" : "Confirmar y enviar a cocina"}
        </Button>
      </div>
    </form>
  );
}
