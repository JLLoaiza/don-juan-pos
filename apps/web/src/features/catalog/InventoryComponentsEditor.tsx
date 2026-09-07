import { Button } from "@don-juan/ui";
import type { InventoryItem } from "./catalogApi";
import { unitLabel } from "./format";

export interface InventoryComponentValue {
  readonly inventoryItemId: string;
  readonly quantity: string;
}

export interface InventoryComponentsEditorProps {
  readonly label: string;
  readonly inventoryItems: ReadonlyArray<InventoryItem>;
  readonly value: ReadonlyArray<InventoryComponentValue>;
  readonly onChange: (value: InventoryComponentValue[]) => void;
  readonly disabled?: boolean;
}

export function InventoryComponentsEditor({
  label,
  inventoryItems,
  value,
  onChange,
  disabled,
}: InventoryComponentsEditorProps) {
  const activeItems = inventoryItems.filter((item) => item.active);

  const update = (index: number, patch: Partial<InventoryComponentValue>) => {
    onChange(value.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)));
  };

  const remove = (index: number) => {
    onChange(value.filter((_, rowIndex) => rowIndex !== index));
  };

  const add = () => {
    const firstAvailable = activeItems[0];
    if (!firstAvailable) return;
    onChange([...value, { inventoryItemId: firstAvailable.id, quantity: "1" }]);
  };

  return (
    <div className="dj-catalog-form__components">
      <span className="dj-catalog-form__components-label">{label}</span>
      {value.length === 0 ? <p className="dj-catalog-form__hint">Agrega al menos un ítem de inventario.</p> : null}
      {value.map((row, index) => (
        <div className="dj-catalog-form__component-row" key={index}>
          <select
            value={row.inventoryItemId}
            onChange={(event) => update(index, { inventoryItemId: event.target.value })}
            disabled={disabled}
            aria-label="Ítem de inventario"
          >
            {activeItems.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} ({unitLabel(item.unit)})
              </option>
            ))}
          </select>
          <input
            inputMode="decimal"
            value={row.quantity}
            onChange={(event) => update(index, { quantity: event.target.value })}
            disabled={disabled}
            aria-label="Cantidad"
          />
          <Button type="button" variant="secondary" onClick={() => remove(index)} disabled={disabled}>
            Quitar
          </Button>
        </div>
      ))}
      <Button type="button" variant="secondary" onClick={add} disabled={disabled || activeItems.length === 0}>
        Agregar ítem
      </Button>
      {activeItems.length === 0 ? (
        <p className="dj-catalog-form__hint">No hay ítems de inventario activos disponibles.</p>
      ) : null}
    </div>
  );
}
