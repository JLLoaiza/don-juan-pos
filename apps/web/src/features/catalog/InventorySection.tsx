import { useMemo, useState } from "react";
import { Button, EmptyState } from "@don-juan/ui";
import type { AdjustInventoryRequest, CreateInventoryItemRequest, UpdateInventoryItemRequest } from "@don-juan/contracts";
import type { CatalogApi, InventoryItem } from "./catalogApi";
import { formatMoney, formatQuantity, unitLabel } from "./format";
import { hasPermission } from "./permissions";
import { InventoryItemForm } from "./InventoryItemForm";
import { AdjustStockForm } from "./AdjustStockForm";

const STOCK_FILTERS = [
  { value: "ALL", label: "Todos" },
  { value: "OK", label: "OK" },
  { value: "LOW_STOCK", label: "Stock bajo" },
  { value: "OUT_OF_STOCK", label: "Agotado" },
  { value: "NEGATIVE_STOCK", label: "Stock negativo" },
] as const;

const STOCK_PILL_TONE: Record<InventoryItem["stockState"], "success" | "warning" | "danger" | "neutral"> = {
  OK: "success",
  LOW_STOCK: "warning",
  OUT_OF_STOCK: "danger",
  NEGATIVE_STOCK: "danger",
};

export interface InventorySectionProps {
  readonly items: ReadonlyArray<InventoryItem>;
  readonly permissions: ReadonlyArray<string>;
  readonly api: CatalogApi;
  readonly onChanged: () => void;
}

export function InventorySection({ items, permissions, api, onChanged }: InventorySectionProps) {
  const [search, setSearch] = useState("");
  const [stockFilter, setStockFilter] = useState<(typeof STOCK_FILTERS)[number]["value"]>("ALL");
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adjustingId, setAdjustingId] = useState<string | null>(null);

  const canCreate = hasPermission(permissions, "inventory.create");
  const canUpdate = hasPermission(permissions, "inventory.update");
  const canAdjust = hasPermission(permissions, "inventory.adjust");

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return items.filter((item) => {
      if (stockFilter !== "ALL" && item.stockState !== stockFilter) return false;
      if (term.length > 0 && !item.name.toLowerCase().includes(term)) return false;
      return true;
    });
  }, [items, search, stockFilter]);

  const editingItem = editingId ? items.find((item) => item.id === editingId) ?? null : null;
  const adjustingItem = adjustingId ? items.find((item) => item.id === adjustingId) ?? null : null;

  const handleCreate = (input: CreateInventoryItemRequest) =>
    api.createInventoryItem(input).then(() => {
      setCreating(false);
      onChanged();
    });

  const handleUpdate = (id: string, input: UpdateInventoryItemRequest) =>
    api.updateInventoryItem(id, input).then(() => {
      setEditingId(null);
      onChanged();
    });

  const handleAdjust = (id: string, input: AdjustInventoryRequest) =>
    api.adjustInventory(id, input).then(() => {
      setAdjustingId(null);
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
          aria-label="Buscar ítems de inventario"
        />
        <select value={stockFilter} onChange={(event) => setStockFilter(event.target.value as typeof stockFilter)} aria-label="Filtrar por estado de stock">
          {STOCK_FILTERS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        {canCreate ? (
          <Button onClick={() => setCreating(true)} disabled={creating}>
            Nuevo ítem
          </Button>
        ) : null}
      </div>

      {creating ? (
        <InventoryItemForm mode="create" onSubmit={handleCreate} onCancel={() => setCreating(false)} />
      ) : null}
      {editingItem ? (
        <InventoryItemForm
          mode="edit"
          item={editingItem}
          onSubmit={(input) => handleUpdate(editingItem.id, input)}
          onCancel={() => setEditingId(null)}
        />
      ) : null}
      {adjustingItem ? (
        <AdjustStockForm
          item={adjustingItem}
          onSubmit={(input) => handleAdjust(adjustingItem.id, input)}
          onCancel={() => setAdjustingId(null)}
        />
      ) : null}

      {filtered.length === 0 ? (
        <EmptyState
          title={items.length === 0 ? "Sin ítems de inventario" : "Sin resultados"}
          description={
            items.length === 0
              ? "Aún no se han creado ítems de inventario en esta sucursal."
              : "Ningún ítem coincide con la búsqueda o el filtro seleccionado."
          }
        />
      ) : (
        <table className="dj-catalog-table">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Unidad</th>
              <th>Stock actual</th>
              <th>Stock mínimo</th>
              <th>Estado</th>
              {items.some((item) => item.unitCost !== null) ? <th>Costo unitario</th> : null}
              <th>Activo</th>
              <th aria-label="Acciones" />
            </tr>
          </thead>
          <tbody>
            {filtered.map((item) => (
              <tr key={item.id}>
                <td>{item.name}</td>
                <td>{unitLabel(item.unit)}</td>
                <td>{formatQuantity(item.currentStock)}</td>
                <td>{formatQuantity(item.minimumStock)}</td>
                <td>
                  <span className={`dj-pill dj-pill--${STOCK_PILL_TONE[item.stockState]}`}>
                    <span className="dj-pill__dot" aria-hidden="true" />
                    {STOCK_FILTERS.find((option) => option.value === item.stockState)?.label ?? item.stockState}
                  </span>
                </td>
                {items.some((entry) => entry.unitCost !== null) ? <td>{formatMoney(item.unitCost)}</td> : null}
                <td>{item.active ? "Sí" : "No"}</td>
                <td className="dj-catalog-table__actions">
                  {canUpdate ? (
                    <button type="button" onClick={() => setEditingId(item.id)}>
                      Editar
                    </button>
                  ) : null}
                  {canAdjust && item.active ? (
                    <button type="button" onClick={() => setAdjustingId(item.id)}>
                      Ajustar stock
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
