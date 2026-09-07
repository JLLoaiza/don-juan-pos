import { useState } from "react";
import { ErrorState, LoadingState } from "@don-juan/ui";
import { ApiRequestError } from "../../lib/api/httpClient";
import { useAuth } from "../auth/useAuth";
import { useCatalog } from "./useCatalog";
import { InventorySection } from "./InventorySection";
import { AccompanimentsSection } from "./AccompanimentsSection";
import { ProductsSection } from "./ProductsSection";
import "./CatalogPage.css";

type Tab = "products" | "inventory" | "accompaniments";

function errorVariant(error: unknown): "network" | "forbidden" | "server" {
  if (error instanceof ApiRequestError) {
    if (error.kind === "network") return "network";
    if (error.status === 403) return "forbidden";
  }
  return "server";
}

export function CatalogPage() {
  const auth = useAuth();
  const { status, snapshot, error, api, reload } = useCatalog();
  const [tab, setTab] = useState<Tab>("products");
  const permissions = auth.context?.permissions ?? [];

  if (status === "loading") {
    return <LoadingState label="Cargando catálogo…" />;
  }

  if (status === "error" || !snapshot) {
    const variant = errorVariant(error);
    return (
      <ErrorState
        variant={variant}
        {...(variant === "forbidden"
          ? { description: "Tu usuario no tiene todos los permisos de vista de catálogo (productos, inventario y acompañamientos)." }
          : {})}
        onRetry={reload}
      />
    );
  }

  return (
    <section className="dj-catalog" aria-labelledby="catalog-title">
      <h1 id="catalog-title">Catálogo</h1>
      <nav className="dj-catalog__tabs" aria-label="Secciones de catálogo">
        <button
          type="button"
          className={`dj-catalog__tab${tab === "products" ? " dj-catalog__tab--active" : ""}`}
          onClick={() => setTab("products")}
        >
          Productos ({snapshot.products.length})
        </button>
        <button
          type="button"
          className={`dj-catalog__tab${tab === "inventory" ? " dj-catalog__tab--active" : ""}`}
          onClick={() => setTab("inventory")}
        >
          Inventario ({snapshot.inventoryItems.length})
        </button>
        <button
          type="button"
          className={`dj-catalog__tab${tab === "accompaniments" ? " dj-catalog__tab--active" : ""}`}
          onClick={() => setTab("accompaniments")}
        >
          Acompañamientos ({snapshot.accompaniments.length})
        </button>
      </nav>

      {tab === "products" ? (
        <ProductsSection
          products={snapshot.products}
          inventoryItems={snapshot.inventoryItems}
          accompaniments={snapshot.accompaniments}
          permissions={permissions}
          api={api}
          onChanged={reload}
        />
      ) : null}
      {tab === "inventory" ? (
        <InventorySection items={snapshot.inventoryItems} permissions={permissions} api={api} onChanged={reload} />
      ) : null}
      {tab === "accompaniments" ? (
        <AccompanimentsSection
          accompaniments={snapshot.accompaniments}
          inventoryItems={snapshot.inventoryItems}
          permissions={permissions}
          api={api}
          onChanged={reload}
        />
      ) : null}
    </section>
  );
}
