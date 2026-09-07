import { describe, expect, it } from "vitest";
import { resolveProductPricing } from "./pricing.js";

describe("resolveProductPricing", () => {
  it("derives profit and margin from a sale price without floats", () => {
    expect(resolveProductPricing({ calculatedCost: "18250", salePrice: "65000" })).toEqual({
      salePrice: "65000",
      profit: "46750",
      margin: "0.719230769231",
    });
  });

  it("derives sale price from a target profit", () => {
    expect(resolveProductPricing({ calculatedCost: "20000", targetProfit: "50000" })).toEqual({
      salePrice: "70000",
      profit: "50000",
      margin: "0.714285714286",
    });
  });

  it("derives sale price from a target margin", () => {
    expect(resolveProductPricing({ calculatedCost: "20000", targetMargin: "0.6" })).toEqual({
      salePrice: "50000",
      profit: "30000",
      margin: "0.6",
    });
  });

  it("allows negative margins", () => {
    expect(resolveProductPricing({ calculatedCost: "10000", salePrice: "8000" })).toMatchObject({
      profit: "-2000",
      margin: "-0.25",
    });
  });

  it("rejects a margin of 100% or higher", () => {
    expect(() => resolveProductPricing({ calculatedCost: "100", targetMargin: "1" })).toThrow(
      "targetMargin",
    );
    expect(() => resolveProductPricing({ calculatedCost: "100", targetMargin: "1.01" })).toThrow(
      "targetMargin",
    );
  });
});
