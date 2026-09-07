import { useState, type FormEvent } from "react";
import { Banner, Button } from "@don-juan/ui";
import {
  CreateDiningAreaRequestSchema,
  CreateRestaurantTableRequestSchema,
  type CreateDiningAreaRequest,
  type CreateRestaurantTableRequest,
  type DiningArea,
} from "@don-juan/contracts";

function apiErrorMessage(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : null;
  return message && message.length > 0 ? message : fallback;
}

export interface CreateDiningAreaFormProps {
  readonly onSubmit: (input: CreateDiningAreaRequest) => Promise<unknown>;
  readonly onCancel: () => void;
}

export function CreateDiningAreaForm({ onSubmit, onCancel }: CreateDiningAreaFormProps) {
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    setError(null);
    const parsed = CreateDiningAreaRequestSchema.safeParse({ name });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Datos inválidos.");
      return;
    }
    setSubmitting(true);
    onSubmit(parsed.data).catch((cause: unknown) => {
      setError(apiErrorMessage(cause, "No se pudo crear el área."));
      setSubmitting(false);
    });
  };

  return (
    <form className="dj-catalog-form" onSubmit={handleSubmit}>
      <h3>Nueva área</h3>
      {error ? <Banner tone="danger" title={error} /> : null}
      <label className="dj-catalog-form__field">
        <span>Nombre</span>
        <input value={name} onChange={(event) => setName(event.target.value)} required disabled={submitting} />
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

export interface CreateTableFormProps {
  readonly diningAreas: ReadonlyArray<DiningArea>;
  readonly onSubmit: (input: CreateRestaurantTableRequest) => Promise<unknown>;
  readonly onCancel: () => void;
}

export function CreateTableForm({ diningAreas, onSubmit, onCancel }: CreateTableFormProps) {
  const activeAreas = diningAreas.filter((area) => area.active);
  const [diningAreaId, setDiningAreaId] = useState(activeAreas[0]?.id ?? "");
  const [name, setName] = useState("");
  const [capacity, setCapacity] = useState("4");
  const [status, setStatus] = useState<"AVAILABLE" | "RESERVED">("AVAILABLE");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    setError(null);
    const parsed = CreateRestaurantTableRequestSchema.safeParse({
      diningAreaId,
      name,
      capacity: Number(capacity),
      status,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Datos inválidos.");
      return;
    }
    setSubmitting(true);
    onSubmit(parsed.data).catch((cause: unknown) => {
      setError(apiErrorMessage(cause, "No se pudo crear la mesa."));
      setSubmitting(false);
    });
  };

  if (activeAreas.length === 0) {
    return <p className="dj-catalog-form__hint">Crea primero un área antes de agregar mesas.</p>;
  }

  return (
    <form className="dj-catalog-form" onSubmit={handleSubmit}>
      <h3>Nueva mesa</h3>
      {error ? <Banner tone="danger" title={error} /> : null}
      <label className="dj-catalog-form__field">
        <span>Área</span>
        <select value={diningAreaId} onChange={(event) => setDiningAreaId(event.target.value)} disabled={submitting}>
          {activeAreas.map((area) => (
            <option key={area.id} value={area.id}>
              {area.name}
            </option>
          ))}
        </select>
      </label>
      <label className="dj-catalog-form__field">
        <span>Nombre</span>
        <input value={name} onChange={(event) => setName(event.target.value)} required disabled={submitting} />
      </label>
      <label className="dj-catalog-form__field">
        <span>Capacidad</span>
        <input
          type="number"
          min={1}
          step={1}
          value={capacity}
          onChange={(event) => setCapacity(event.target.value)}
          disabled={submitting}
        />
      </label>
      <label className="dj-catalog-form__field">
        <span>Estado inicial</span>
        <select value={status} onChange={(event) => setStatus(event.target.value as "AVAILABLE" | "RESERVED")} disabled={submitting}>
          <option value="AVAILABLE">Disponible</option>
          <option value="RESERVED">Reservada</option>
        </select>
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
