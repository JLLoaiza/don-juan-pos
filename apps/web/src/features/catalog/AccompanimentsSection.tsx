import { useMemo, useState } from "react";
import { Button, EmptyState } from "@don-juan/ui";
import type { CreateAccompanimentRequest, UpdateAccompanimentRequest } from "@don-juan/contracts";
import type { Accompaniment, CatalogApi, InventoryItem } from "./catalogApi";
import { formatMoney } from "./format";
import { hasPermission } from "./permissions";
import { AccompanimentForm } from "./AccompanimentForm";

export interface AccompanimentsSectionProps {
  readonly accompaniments: ReadonlyArray<Accompaniment>;
  readonly inventoryItems: ReadonlyArray<InventoryItem>;
  readonly permissions: ReadonlyArray<string>;
  readonly api: CatalogApi;
  readonly onChanged: () => void;
}

export function AccompanimentsSection({ accompaniments, inventoryItems, permissions, api, onChanged }: AccompanimentsSectionProps) {
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const canCreate = hasPermission(permissions, "accompaniments.create");
  const canUpdate = hasPermission(permissions, "accompaniments.update");
  const showCost = accompaniments.some((entry) => entry.calculatedCost !== null);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (term.length === 0) return accompaniments;
    return accompaniments.filter((entry) => entry.name.toLowerCase().includes(term));
  }, [accompaniments, search]);

  const editing = editingId ? accompaniments.find((entry) => entry.id === editingId) ?? null : null;

  const handleCreate = (input: CreateAccompanimentRequest) =>
    api.createAccompaniment(input).then(() => {
      setCreating(false);
      onChanged();
    });

  const handleUpdate = (id: string, input: UpdateAccompanimentRequest) =>
    api.updateAccompaniment(id, input).then(() => {
      setEditingId(null);
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
          aria-label="Buscar acompañamientos"
        />
        {canCreate ? (
          <Button onClick={() => setCreating(true)} disabled={creating}>
            Nuevo acompañamiento
          </Button>
        ) : null}
      </div>

      {creating ? (
        <AccompanimentForm mode="create" inventoryItems={inventoryItems} onSubmit={handleCreate} onCancel={() => setCreating(false)} />
      ) : null}
      {editing ? (
        <AccompanimentForm
          mode="edit"
          accompaniment={editing}
          inventoryItems={inventoryItems}
          onSubmit={(input) => handleUpdate(editing.id, input)}
          onCancel={() => setEditingId(null)}
        />
      ) : null}

      {filtered.length === 0 ? (
        <EmptyState
          title={accompaniments.length === 0 ? "Sin acompañamientos" : "Sin resultados"}
          description={
            accompaniments.length === 0
              ? "Aún no se han creado acompañamientos en esta sucursal."
              : "Ningún acompañamiento coincide con la búsqueda."
          }
        />
      ) : (
        <table className="dj-catalog-table">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Precio por defecto</th>
              {showCost ? <th>Costo calculado</th> : null}
              <th>Componentes</th>
              <th>Activo</th>
              <th aria-label="Acciones" />
            </tr>
          </thead>
          <tbody>
            {filtered.map((entry) => (
              <tr key={entry.id}>
                <td>{entry.name}</td>
                <td>{formatMoney(entry.defaultPrice)}</td>
                {showCost ? <td>{formatMoney(entry.calculatedCost)}</td> : null}
                <td>{entry.components.length}</td>
                <td>{entry.active ? "Sí" : "No"}</td>
                <td className="dj-catalog-table__actions">
                  {canUpdate ? (
                    <button type="button" onClick={() => setEditingId(entry.id)}>
                      Editar
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
