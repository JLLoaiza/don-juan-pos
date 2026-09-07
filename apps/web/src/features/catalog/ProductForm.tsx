import { useState, type FormEvent } from "react";
import { Banner, Button } from "@don-juan/ui";
import {
  CreateProductRequestSchema,
  UpdateProductRequestSchema,
  type CreateProductRequest,
  type UpdateProductRequest,
} from "@don-juan/contracts";
import type { Accompaniment, InventoryItem, Product } from "./catalogApi";
import { PriceFields } from "./PriceFields";
import { ProductComponentsEditor, type ProductComponentValue } from "./ProductComponentsEditor";
import { ProductAdditionalsEditor, type ProductAdditionalValue } from "./ProductAdditionalsEditor";

function apiErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : null;
  return message && message.length > 0 ? message : "No se pudo guardar el producto. Intenta de nuevo.";
}

interface CreateModeProps {
  readonly mode: "create";
  readonly inventoryItems: ReadonlyArray<InventoryItem>;
  readonly accompaniments: ReadonlyArray<Accompaniment>;
  readonly onSubmit: (input: CreateProductRequest) => Promise<unknown>;
  readonly onCancel: () => void;
}

interface EditModeProps {
  readonly mode: "edit";
  readonly product: Product;
  readonly inventoryItems: ReadonlyArray<InventoryItem>;
  readonly accompaniments: ReadonlyArray<Accompaniment>;
  readonly onSubmit: (input: UpdateProductRequest) => Promise<unknown>;
  readonly onCancel: () => void;
}

export function ProductForm(props: CreateModeProps | EditModeProps) {
  const editing = props.mode === "edit";
  const [name, setName] = useState(editing ? props.product.name : "");
  const [description, setDescription] = useState(editing ? (props.product.description ?? "") : "");
  const [salePrice, setSalePrice] = useState(editing ? props.product.salePrice : "0");
  const [notes, setNotes] = useState("");
  const [active, setActive] = useState(editing ? props.product.active : true);
  const [components, setComponents] = useState<ProductComponentValue[]>(
    editing ? (props.product.components as ProductComponentValue[]) : [],
  );
  const [additionals, setAdditionals] = useState<ProductAdditionalValue[]>(
    editing
      ? props.product.additionals.map((additional) => ({ ...additional, priceOverride: additional.priceOverride ?? null }))
      : [],
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    setError(null);

    if (props.mode === "create") {
      const payload: CreateProductRequest = {
        name,
        description: description.trim().length > 0 ? description : null,
        salePrice,
        notes: notes.trim().length > 0 ? notes : null,
        components,
        additionals,
      };
      const parsed = CreateProductRequestSchema.safeParse(payload);
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

    const payload: UpdateProductRequest = {
      expectedVersion: props.product.version,
      name,
      description: description.trim().length > 0 ? description : null,
      salePrice,
      notes: notes.trim().length > 0 ? notes : null,
      components,
      additionals,
      active,
    };
    const parsed = UpdateProductRequestSchema.safeParse(payload);
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
      <h3>{editing ? `Editar ${props.product.name}` : "Nuevo producto"}</h3>
      {error ? <Banner tone="danger" title={error} /> : null}

      <label className="dj-catalog-form__field">
        <span>Nombre</span>
        <input value={name} onChange={(event) => setName(event.target.value)} required disabled={submitting} />
      </label>

      <label className="dj-catalog-form__field">
        <span>Descripción</span>
        <textarea value={description} onChange={(event) => setDescription(event.target.value)} disabled={submitting} />
      </label>

      <label className="dj-catalog-form__field">
        <span>Notas</span>
        <textarea value={notes} onChange={(event) => setNotes(event.target.value)} disabled={submitting} />
        {editing ? (
          <small>
            El backend aún no devuelve las notas guardadas de un producto existente; guardar aquí reemplaza cualquier
            nota previa (deja vacío para borrarla).
          </small>
        ) : null}
      </label>

      <ProductComponentsEditor
        inventoryItems={props.inventoryItems}
        accompaniments={props.accompaniments}
        value={components}
        onChange={setComponents}
        disabled={submitting}
      />

      <PriceFields
        salePrice={salePrice}
        onSalePriceChange={setSalePrice}
        components={components}
        inventoryItems={props.inventoryItems}
        accompaniments={props.accompaniments}
        disabled={submitting}
      />

      <ProductAdditionalsEditor
        accompaniments={props.accompaniments}
        value={additionals}
        onChange={setAdditionals}
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
