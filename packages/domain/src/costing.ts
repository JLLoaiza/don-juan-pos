import {
  addDecimals,
  compareDecimals,
  multiplyDecimals,
  type DecimalString,
} from "./decimal.js";

/** A physical component after products and one-level subrecipes were expanded. */
export type ExpandedCostComponent = Readonly<{
  quantity: DecimalString;
  unitCost: DecimalString;
}>;

/** Calculates the current derived cost from already-expanded physical components. */
export function calculateDerivedCost(
  components: readonly ExpandedCostComponent[],
): DecimalString {
  return components.reduce<DecimalString>((total, component) => {
    if (compareDecimals(component.quantity, "0") <= 0) {
      throw new Error("Component quantity must be greater than zero");
    }
    if (compareDecimals(component.unitCost, "0") < 0) {
      throw new Error("Component unitCost cannot be negative");
    }
    return addDecimals(total, multiplyDecimals(component.quantity, component.unitCost));
  }, "0");
}
