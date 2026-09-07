import { compareDecimals, type DecimalString } from "./decimal.js";

export type StockStatus = "NEGATIVE_STOCK" | "OUT_OF_STOCK" | "LOW_STOCK" | "OK";

/** Derives the operational stock state using the required precedence. */
export function deriveStockStatus(
  currentStock: DecimalString,
  minimumStock: DecimalString,
): StockStatus {
  if (compareDecimals(minimumStock, "0") < 0) {
    throw new Error("minimumStock cannot be negative");
  }

  if (compareDecimals(currentStock, "0") < 0) {
    return "NEGATIVE_STOCK";
  }
  if (compareDecimals(currentStock, "0") === 0) {
    return "OUT_OF_STOCK";
  }
  if (compareDecimals(currentStock, minimumStock) < 0) {
    return "LOW_STOCK";
  }
  return "OK";
}
