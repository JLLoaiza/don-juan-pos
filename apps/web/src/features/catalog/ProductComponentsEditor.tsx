import { Button } from "@don-juan/ui";
import type { Accompaniment, InventoryItem } from "./catalogApi";
import { unitLabel } from "./format";

export type ProductComponentValue =
  | { readonly type: "INVENTORY_ITEM"; readonly inventoryItemId: string; readonly quantity: string }
  | { readonly type: "ACCOMPANIMENT"; readonly accompanimentId: string; readonly quantity: string };

export interface ProductComponentsEditorProps {
  readonly inventoryItems: ReadonlyArray<InventoryItem>;
  readonly accompaniments: ReadonlyArray<Accompaniment>;
  readonly value: ReadonlyArray<ProductComponentValue>;
  readonly onChange: (value: ProductComponentValue[]) => void;
  readonly disabled?: boolean;
}

export function ProductComponentsEditor({
  inventoryItems,
  accompaniments,
  value,
  onChange,
  disabled,
}: ProductComponentsEditorProps) {
  const activeItems = inventoryItems.filter((item) => item.active);
  const activeAccompaniments = accompaniments.filter((entry) => entry.active);

  const update = (index: number, row: ProductComponentValue) => {
    onChange(value.map((entry, entryIndex) => (entryIndex === index ? row : entry)));
  };

  const remove = (index: number) => {
    onChange(value.filter((_, entryIndex) => entryIndex !== index));
  };

  const addInventoryItem = () => {
    const firstAvailable = activeItems[0];
    if (!firstAvailable) return;
    onChange([...value, { type: "INVENTORY_ITEM", inventoryItemId: firstAvailable.id, quantity: "1" }]);
  };

  const addAccompaniment = () => {
    const firstAvailable = activeAccompaniments[0];
    if (!firstAvailable) return;
    onChange([...value, { type: "ACCOMPANIMENT", accompanimentId: firstAvailable.id, quantity: "1" }]);
  };

  return (
    <div className="dj-catalog-form__components">
      <span className="dj-catalog-form__components-label">Receta (composición)</span>
      {value.length === 0 ? <p className="dj-catalog-form__hint">Agrega los ítems o acompañamientos que componen este producto.</p> : null}
      {value.map((row, index) => (
        <div className="dj-catalog-form__component-row" key={index}>
          {row.type === "INVENTORY_ITEM" ? (
            <select
              value={row.inventoryItemId}
              onChange={(event) => update(index, { type: "INVENTORY_ITEM", inventoryItemId: event.target.value, quantity: row.quantity })}
              disabled={disabled}
              aria-label="Ítem de inventario"
            >
              {activeItems.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} ({unitLabel(item.unit)})
                </option>
              ))}
            </select>
          ) : (
            <select
              value={row.accompanimentId}
              onChange={(event) => update(index, { type: "ACCOMPANIMENT", accompanimentId: event.target.value, quantity: row.quantity })}
              disabled={disabled}
              aria-label="Acompañamiento"
            >
              {activeAccompaniments.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.name}
                </option>
              ))}
            </select>
          )}
          <input
            inputMode="decimal"
            value={row.quantity}
            onChange={(event) => update(index, { ...row, quantity: event.target.value })}
            disabled={disabled}
            aria-label="Cantidad"
          />
          <Button type="button" variant="secondary" onClick={() => remove(index)} disabled={disabled}>
            Quitar
          </Button>
        </div>
      ))}
      <div className="dj-catalog-form__component-row">
        <Button type="button" variant="secondary" onClick={addInventoryItem} disabled={disabled || activeItems.length === 0}>
          Agregar ítem de inventario
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={addAccompaniment}
          disabled={disabled || activeAccompaniments.length === 0}
        >
          Agregar acompañamiento
        </Button>
      </div>
    </div>
  );
}
