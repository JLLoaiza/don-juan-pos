import { useState, type FormEvent } from "react";
import { Banner, Button } from "@don-juan/ui";
import {
  CreateAccompanimentRequestSchema,
  UpdateAccompanimentRequestSchema,
  type CreateAccompanimentRequest,
  type UpdateAccompanimentRequest,
} from "@don-juan/contracts";
import type { Accompaniment, InventoryItem } from "./catalogApi";
import { InventoryComponentsEditor, type InventoryComponentValue } from "./InventoryComponentsEditor";

function apiErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : null;
  return message && message.length > 0 ? message : "No se pudo guardar el acompañamiento. Intenta de nuevo.";
}

interface CreateModeProps {
  readonly mode: "create";
  readonly inventoryItems: ReadonlyArray<InventoryItem>;
  readonly onSubmit: (input: CreateAccompanimentRequest) => Promise<unknown>;
  readonly onCancel: () => void;
}

interface EditModeProps {
  readonly mode: "edit";
  readonly accompaniment: Accompaniment;
  readonly inventoryItems: ReadonlyArray<InventoryItem>;
  readonly onSubmit: (input: UpdateAccompanimentRequest) => Promise<unknown>;
  readonly onCancel: () => void;
}

export function AccompanimentForm(props: CreateModeProps | EditModeProps) {
  const editing = props.mode === "edit";
  const [name, setName] = useState(editing ? props.accompaniment.name : "");
  const [defaultPrice, setDefaultPrice] = useState(editing ? props.accompaniment.defaultPrice : "0");
  const [notes, setNotes] = useState(editing ? (props.accompaniment.notes ?? "") : "");
  const [active, setActive] = useState(editing ? props.accompaniment.active : true);
  const [components, setComponents] = useState<InventoryComponentValue[]>(
    editing
      ? props.accompaniment.components.map((component) => ({
          inventoryItemId: component.inventoryItemId,
          quantity: component.quantity,
        }))
      : [],
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    setError(null);

    if (props.mode === "create") {
      const payload: CreateAccompanimentRequest = { name, defaultPrice, notes: notes.trim().length > 0 ? notes : null, components };
      const parsed = CreateAccompanimentRequestSchema.safeParse(payload);
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

    const payload: UpdateAccompanimentRequest = {
      expectedVersion: props.accompaniment.version,
      name,
      defaultPrice,
      notes: notes.trim().length > 0 ? notes : null,
      components,
      active,
    };
    const parsed = UpdateAccompanimentRequestSchema.safeParse(payload);
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
      <h3>{editing ? `Editar ${props.accompaniment.name}` : "Nuevo acompañamiento"}</h3>
      {error ? <Banner tone="danger" title={error} /> : null}

      <label className="dj-catalog-form__field">
        <span>Nombre</span>
        <input value={name} onChange={(event) => setName(event.target.value)} required disabled={submitting} />
      </label>

      <label className="dj-catalog-form__field">
        <span>Precio por defecto</span>
        <input
          inputMode="decimal"
          value={defaultPrice}
          onChange={(event) => setDefaultPrice(event.target.value)}
          disabled={submitting}
        />
      </label>

      <label className="dj-catalog-form__field">
        <span>Notas</span>
        <textarea value={notes} onChange={(event) => setNotes(event.target.value)} disabled={submitting} />
      </label>

      <InventoryComponentsEditor
        label="Compuesto por"
        inventoryItems={props.inventoryItems}
        value={components}
        onChange={setComponents}
        disabled={submitting}
      />

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
