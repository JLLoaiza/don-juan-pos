import type { Accompaniment, InventoryItem } from "./catalogApi";
import type { ProductComponentValue } from "./ProductComponentsEditor";

/**
 * Client-side preview only — mirrors the sum apps/api performs when it
 * recalculates a product's cost (CatalogService.recalculateProducts), using
 * whatever component costs are already visible to this user. Never sent to
 * the server: only the resulting salePrice value is submitted, exactly like
 * a plain sale price the user typed in directly. Returns null when any
 * selected component's cost isn't known (missing permission or not found
 * yet), since utility/margin can't be estimated without it.
 */
export function previewComponentsCost(
  components: ReadonlyArray<ProductComponentValue>,
  inventoryItems: ReadonlyArray<InventoryItem>,
  accompaniments: ReadonlyArray<Accompaniment>,
): number | null {
  let total = 0;
  for (const component of components) {
    const quantity = Number(component.quantity);
    if (!Number.isFinite(quantity)) return null;
    if (component.type === "INVENTORY_ITEM") {
      const unitCost = inventoryItems.find((entry) => entry.id === component.inventoryItemId)?.unitCost;
      if (unitCost === null || unitCost === undefined) return null;
      total += quantity * Number(unitCost);
    } else {
      const cost = accompaniments.find((entry) => entry.id === component.accompanimentId)?.calculatedCost;
      if (cost === null || cost === undefined) return null;
      total += quantity * Number(cost);
    }
  }
  return total;
}

export interface DerivedFromSalePrice {
  readonly profit: string;
  readonly marginPercent: string;
}
export interface DerivedFromProfit {
  readonly salePrice: string;
  readonly marginPercent: string;
}
export interface DerivedFromMargin {
  readonly salePrice: string;
  readonly profit: string;
}

export function deriveFromSalePrice(cost: number, salePrice: number): DerivedFromSalePrice {
  const profit = salePrice - cost;
  const marginPercent = salePrice > 0 ? (profit / salePrice) * 100 : 0;
  return { profit: profit.toFixed(2), marginPercent: marginPercent.toFixed(1) };
}

export function deriveFromProfit(cost: number, profit: number): DerivedFromProfit {
  const salePrice = cost + profit;
  const marginPercent = salePrice > 0 ? (profit / salePrice) * 100 : 0;
  return { salePrice: salePrice.toFixed(2), marginPercent: marginPercent.toFixed(1) };
}

/** Mirrors the backend's own rule (UpdateProductPriceRequest): a margin of 100% or more is not representable. */
export function deriveFromMargin(cost: number, marginPercent: number): DerivedFromMargin | null {
  if (marginPercent >= 100) return null;
  const salePrice = cost / (1 - marginPercent / 100);
  const profit = salePrice - cost;
  return { salePrice: salePrice.toFixed(2), profit: profit.toFixed(2) };
}
