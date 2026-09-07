import {
  addDecimals,
  compareDecimals,
  divideDecimals,
  subtractDecimals,
  type DecimalString,
} from "./decimal.js";

export type ProductPricingInput = Readonly<{
  calculatedCost: DecimalString;
  salePrice?: DecimalString;
  targetProfit?: DecimalString;
  /** Decimal fraction: 0.6 represents a 60% margin. */
  targetMargin?: DecimalString;
}>;

export type ResolvedProductPricing = Readonly<{
  salePrice: DecimalString;
  profit: DecimalString;
  /** Decimal fraction: 0.6 represents a 60% margin. */
  margin: DecimalString;
}>;

/**
 * Resolves sale price, profit and margin from exactly one user pricing intent.
 * The implementation only uses exact decimal string arithmetic.
 */
export function resolveProductPricing(input: ProductPricingInput): ResolvedProductPricing {
  if (compareDecimals(input.calculatedCost, "0") < 0) {
    throw new Error("calculatedCost cannot be negative");
  }

  const intentions = [input.salePrice, input.targetProfit, input.targetMargin].filter(
    (value): value is DecimalString => value !== undefined,
  );
  if (intentions.length !== 1) {
    throw new Error("Provide exactly one of salePrice, targetProfit or targetMargin");
  }

  let salePrice: DecimalString;
  if (input.salePrice !== undefined) {
    salePrice = input.salePrice;
  } else if (input.targetProfit !== undefined) {
    salePrice = addDecimals(input.calculatedCost, input.targetProfit);
  } else {
    const targetMargin = input.targetMargin as DecimalString;
    if (compareDecimals(targetMargin, "1") >= 0) {
      throw new Error("targetMargin must be below 1 (100%)");
    }
    salePrice = divideDecimals(input.calculatedCost, subtractDecimals("1", targetMargin));
  }

  if (compareDecimals(salePrice, "0") <= 0) {
    throw new Error("salePrice must be greater than zero to calculate margin");
  }

  const profit = subtractDecimals(salePrice, input.calculatedCost);
  return {
    salePrice,
    profit,
    margin: divideDecimals(profit, salePrice),
  };
}
