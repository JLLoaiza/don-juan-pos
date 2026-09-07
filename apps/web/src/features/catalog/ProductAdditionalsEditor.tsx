import { Button } from "@don-juan/ui";
import type { Accompaniment } from "./catalogApi";

export interface ProductAdditionalValue {
  readonly accompanimentId: string;
  readonly priceOverride: string | null;
  readonly allowFree: boolean;
  readonly sortOrder: number;
  readonly active: boolean;
}

export interface ProductAdditionalsEditorProps {
  readonly accompaniments: ReadonlyArray<Accompaniment>;
  readonly value: ReadonlyArray<ProductAdditionalValue>;
  readonly onChange: (value: ProductAdditionalValue[]) => void;
  readonly disabled?: boolean;
}

export function ProductAdditionalsEditor({ accompaniments, value, onChange, disabled }: ProductAdditionalsEditorProps) {
  const activeAccompaniments = accompaniments.filter((entry) => entry.active);

  const update = (index: number, patch: Partial<ProductAdditionalValue>) => {
    onChange(value.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)));
  };

  const remove = (index: number) => {
    onChange(value.filter((_, rowIndex) => rowIndex !== index));
  };

  const add = () => {
    const firstAvailable = activeAccompaniments[0];
    if (!firstAvailable) return;
    onChange([...value, { accompanimentId: firstAvailable.id, priceOverride: null, allowFree: true, sortOrder: value.length, active: true }]);
  };

  return (
    <div className="dj-catalog-form__components">
      <span className="dj-catalog-form__components-label">Adicionales opcionales</span>
      {value.length === 0 ? <p className="dj-catalog-form__hint">Sin adicionales configurados.</p> : null}
      {value.map((row, index) => (
        <div className="dj-catalog-form__additional-row" key={index}>
          <select
            value={row.accompanimentId}
            onChange={(event) => update(index, { accompanimentId: event.target.value })}
            disabled={disabled}
            aria-label="Acompañamiento adicional"
          >
            {activeAccompaniments.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.name}
              </option>
            ))}
          </select>
          <input
            inputMode="decimal"
            placeholder="Precio (opcional)"
            value={row.priceOverride ?? ""}
            onChange={(event) => update(index, { priceOverride: event.target.value.trim().length > 0 ? event.target.value : null })}
            disabled={disabled}
            aria-label="Precio del adicional"
          />
          <label>
            <input
              type="checkbox"
              checked={row.allowFree}
              onChange={(event) => update(index, { allowFree: event.target.checked })}
              disabled={disabled}
            />
            <span>Puede ir gratis</span>
          </label>
          <label>
            <input
              type="checkbox"
              checked={row.active}
              onChange={(event) => update(index, { active: event.target.checked })}
              disabled={disabled}
            />
            <span>Activo</span>
          </label>
          <Button type="button" variant="secondary" onClick={() => remove(index)} disabled={disabled}>
            Quitar
          </Button>
        </div>
      ))}
      <Button type="button" variant="secondary" onClick={add} disabled={disabled || activeAccompaniments.length === 0}>
        Agregar adicional
      </Button>
    </div>
  );
}
