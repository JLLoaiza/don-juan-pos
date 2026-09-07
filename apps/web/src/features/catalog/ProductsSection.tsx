import { useMemo, useState } from "react";
import { Button, EmptyState } from "@don-juan/ui";
import type { CreateProductRequest, UpdateProductPriceRequest, UpdateProductRequest } from "@don-juan/contracts";
import type { Accompaniment, CatalogApi, InventoryItem, Product } from "./catalogApi";
import { formatMarginPercent, formatMoney } from "./format";
import { hasPermission } from "./permissions";
import { ProductForm } from "./ProductForm";
import { ProductPriceForm } from "./ProductPriceForm";

export interface ProductsSectionProps {
  readonly products: ReadonlyArray<Product>;
  readonly inventoryItems: ReadonlyArray<InventoryItem>;
  readonly accompaniments: ReadonlyArray<Accompaniment>;
  readonly permissions: ReadonlyArray<string>;
  readonly api: CatalogApi;
  readonly onChanged: () => void;
}

export function ProductsSection({ products, inventoryItems, accompaniments, permissions, api, onChanged }: ProductsSectionProps) {
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pricingId, setPricingId] = useState<string | null>(null);

  const canCreate = hasPermission(permissions, "products.create");
  const canUpdate = hasPermission(permissions, "products.update");
  const canPrice = hasPermission(permissions, "pricing.update");
  const showCost = products.some((product) => product.calculatedCost !== null);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (term.length === 0) return products;
    return products.filter((product) => product.name.toLowerCase().includes(term));
  }, [products, search]);

  const editing = editingId ? products.find((product) => product.id === editingId) ?? null : null;
  const pricing = pricingId ? products.find((product) => product.id === pricingId) ?? null : null;

  const handleCreate = (input: CreateProductRequest) =>
    api.createProduct(input).then(() => {
      setCreating(false);
      onChanged();
    });

  const handleUpdate = (id: string, input: UpdateProductRequest) =>
    api.updateProduct(id, input).then(() => {
      setEditingId(null);
      onChanged();
    });

  const handlePrice = (id: string, input: UpdateProductPriceRequest) =>
    api.updateProductPrice(id, input).then(() => {
      setPricingId(null);
      onChanged();
    });

  return (
    <div className="dj-catalog-section">
      <div className="dj-catalog-section__toolbar">
        <input
          className="dj-catalog-section__search"
          placeholder="Buscar por nombre…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          aria-label="Buscar productos"
        />
        {canCreate ? (
          <Button onClick={() => setCreating(true)} disabled={creating}>
            Nuevo producto
          </Button>
        ) : null}
      </div>

      {creating ? (
        <ProductForm
          mode="create"
          inventoryItems={inventoryItems}
          accompaniments={accompaniments}
          onSubmit={handleCreate}
          onCancel={() => setCreating(false)}
        />
      ) : null}
      {editing ? (
        <ProductForm
          mode="edit"
          product={editing}
          inventoryItems={inventoryItems}
          accompaniments={accompaniments}
          onSubmit={(input) => handleUpdate(editing.id, input)}
          onCancel={() => setEditingId(null)}
        />
      ) : null}
      {pricing ? (
        <ProductPriceForm product={pricing} onSubmit={(input) => handlePrice(pricing.id, input)} onCancel={() => setPricingId(null)} />
      ) : null}

      {filtered.length === 0 ? (
        <EmptyState
          title={products.length === 0 ? "Sin productos" : "Sin resultados"}
          description={
            products.length === 0
              ? "Aún no se han creado productos en esta sucursal."
              : "Ningún producto coincide con la búsqueda."
          }
        />
      ) : (
        <table className="dj-catalog-table">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Precio de venta</th>
              {showCost ? <th>Costo calculado</th> : null}
              {showCost ? <th>Margen</th> : null}
              <th>Activo</th>
              <th aria-label="Acciones" />
            </tr>
          </thead>
          <tbody>
            {filtered.map((product) => (
              <tr key={product.id}>
                <td>{product.name}</td>
                <td>{formatMoney(product.salePrice)}</td>
                {showCost ? <td>{formatMoney(product.calculatedCost)}</td> : null}
                {showCost ? <td>{formatMarginPercent(product.salePrice, product.calculatedCost) ?? "—"}</td> : null}
                <td>{product.active ? "Sí" : "No"}</td>
                <td className="dj-catalog-table__actions">
                  {canUpdate ? (
                    <button type="button" onClick={() => setEditingId(product.id)}>
                      Editar
                    </button>
                  ) : null}
                  {canPrice ? (
                    <button type="button" onClick={() => setPricingId(product.id)}>
                      Precio
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
