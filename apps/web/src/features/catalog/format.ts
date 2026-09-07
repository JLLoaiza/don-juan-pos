import type { InventoryItem } from "./catalogApi";

const UNIT_LABELS: Record<InventoryItem["unit"], string> = {
  G: "g",
  KG: "kg",
  ML: "ml",
  L: "L",
  UNIT: "unidad",
};

export function unitLabel(unit: InventoryItem["unit"]): string {
  return UNIT_LABELS[unit];
}

/**
 * Trims trailing zeros from a decimal string purely for display. Operates on
 * the string itself (never via Number()) so it never loses precision — this
 * is presentation only, never fed back into a request.
 */
export function trimDecimal(value: string): string {
  if (!value.includes(".")) return value;
  const trimmed = value.replace(/0+$/, "").replace(/\.$/, "");
  return trimmed.length > 0 && trimmed !== "-" ? trimmed : "0";
}

export function formatQuantity(value: string): string {
  return trimDecimal(value);
}

export function formatMoney(value: string | null): string {
  if (value === null) return "—";
  return trimDecimal(value);
}

/**
 * Display-only margin (profit / salePrice) computed from already-authorized
 * values the server returned. Never used to set a price — pricing changes go
 * through UpdateProductPriceRequest and are resolved server-side.
 */
export function formatMarginPercent(salePrice: string, calculatedCost: string | null): string | null {
  if (calculatedCost === null) return null;
  const price = Number(salePrice);
  const cost = Number(calculatedCost);
  if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(cost)) return null;
  const margin = ((price - cost) / price) * 100;
  return `${margin.toFixed(1)}%`;
}
