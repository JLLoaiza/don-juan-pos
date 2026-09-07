import { useState, type FormEvent } from "react";
import { Banner, Button } from "@don-juan/ui";
import {
  CreateInventoryItemRequestSchema,
  InventoryUnitSchema,
  UpdateInventoryItemRequestSchema,
  type CreateInventoryItemRequest,
  type UpdateInventoryItemRequest,
} from "@don-juan/contracts";
import type { InventoryItem } from "./catalogApi";
import { unitLabel } from "./format";

const UNITS = InventoryUnitSchema.options;

function apiErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : null;
  return message && message.length > 0 ? message : "No se pudo guardar el ítem. Intenta de nuevo.";
}

interface CreateModeProps {
  readonly mode: "create";
  readonly onSubmit: (input: CreateInventoryItemRequest) => Promise<unknown>;
  readonly onCancel: () => void;
}

interface EditModeProps {
  readonly mode: "edit";
  readonly item: InventoryItem;
  readonly onSubmit: (input: UpdateInventoryItemRequest) => Promise<unknown>;
  readonly onCancel: () => void;
}

export function InventoryItemForm(props: CreateModeProps | EditModeProps) {
  const editing = props.mode === "edit";
  const [name, setName] = useState(editing ? props.item.name : "");
  const [unit, setUnit] = useState<(typeof UNITS)[number]>(editing ? props.item.unit : "UNIT");
  const [initialStock, setInitialStock] = useState("0");
  const [initialUnitCost, setInitialUnitCost] = useState("0");
  const [minimumStock, setMinimumStock] = useState(editing ? props.item.minimumStock : "0");
  const [notes, setNotes] = useState(editing ? (props.item.notes ?? "") : "");
  const [active, setActive] = useState(editing ? props.item.active : true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    setError(null);

    if (props.mode === "create") {
      const payload: CreateInventoryItemRequest = {
        name,
        unit,
        initialStock,
        initialUnitCost,
        minimumStock,
        notes: notes.trim().length > 0 ? notes : null,
      };
      const parsed = CreateInventoryItemRequestSchema.safeParse(payload);
      if (!parsed.success) {
        setError(parsed.error.issues[0]?.message ?? "Datos inválidos.");
        return;
      }
      setSubmitting(true);
      props.onSubmit(parsed.data).catch((cause: unknown) => {
        setError(apiErrorMessage(cause));
        setSubmitting(false);
      });
      return;
    }

    const payload: UpdateInventoryItemRequest = {
      expectedVersion: props.item.version,
      name,
      minimumStock,
      notes: notes.trim().length > 0 ? notes : null,
      active,
    };
    const parsed = UpdateInventoryItemRequestSchema.safeParse(payload);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Datos inválidos.");
      return;
    }
    setSubmitting(true);
    props.onSubmit(parsed.data).catch((cause: unknown) => {
      setError(apiErrorMessage(cause));
      setSubmitting(false);
    });
  };

  return (
    <form className="dj-catalog-form" onSubmit={handleSubmit}>
      <h3>{editing ? `Editar ${props.item.name}` : "Nuevo ítem de inventario"}</h3>
      {error ? <Banner tone="danger" title={error} /> : null}

      <label className="dj-catalog-form__field">
        <span>Nombre</span>
        <input value={name} onChange={(event) => setName(event.target.value)} required disabled={submitting} />
      </label>

      <label className="dj-catalog-form__field">
        <span>Unidad</span>
        <select
          value={unit}
          onChange={(event) => setUnit(event.target.value as (typeof UNITS)[number])}
          disabled={submitting || editing}
        >
          {UNITS.map((option) => (
            <option key={option} value={option}>
              {unitLabel(option)}
            </option>
          ))}
        </select>
        {editing ? <small>La unidad no se puede cambiar una vez existen movimientos.</small> : null}
      </label>

      {!editing ? (
        <>
          <label className="dj-catalog-form__field">
            <span>Stock inicial</span>
            <input
              inputMode="decimal"
              value={initialStock}
              onChange={(event) => setInitialStock(event.target.value)}
              disabled={submitting}
            />
          </label>
          <label className="dj-catalog-form__field">
            <span>Costo unitario inicial</span>
            <input
              inputMode="decimal"
              value={initialUnitCost}
              onChange={(event) => setInitialUnitCost(event.target.value)}
              disabled={submitting}
            />
          </label>
        </>
      ) : (
        <p className="dj-catalog-form__hint">
          El costo unitario ({props.item.unitCost ?? "sin permiso para verlo"}) solo cambia mediante compras (Fase 5) o
          ajustes de stock; no se edita aquí.
        </p>
      )}

      <label className="dj-catalog-form__field">
        <span>Stock mínimo</span>
        <input
          inputMode="decimal"
          value={minimumStock}
          onChange={(event) => setMinimumStock(event.target.value)}
          disabled={submitting}
        />
      </label>

      <label className="dj-catalog-form__field">
        <span>Notas</span>
        <textarea value={notes} onChange={(event) => setNotes(event.target.value)} disabled={submitting} />
      </label>

      {editing ? (
        <label className="dj-catalog-form__checkbox">
          <input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} disabled={submitting} />
          <span>Activo</span>
        </label>
      ) : null}

      <div className="dj-catalog-form__actions">
        <Button type="submit" disabled={submitting}>
          {submitting ? "Guardando…" : "Guardar"}
        </Button>
        <Button type="button" variant="secondary" onClick={props.onCancel} disabled={submitting}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
