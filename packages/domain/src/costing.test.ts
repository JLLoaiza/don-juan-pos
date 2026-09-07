import { describe, expect, it } from "vitest";
import { calculateDerivedCost } from "./costing.js";

describe("calculateDerivedCost", () => {
  it("sums expanded physical components with exact decimal arithmetic", () => {
    expect(
      calculateDerivedCost([
        { quantity: "350", unitCost: "35" },
        { quantity: "10", unitCost: "2.1" },
        { quantity: "10", unitCost: "3" },
        { quantity: "1", unitCost: "1500" },
      ]),
    ).toBe("13801");
  });

  it("does not inherit binary floating point imprecision", () => {
    expect(
      calculateDerivedCost([
        { quantity: "0.1", unitCost: "0.2" },
        { quantity: "0.2", unitCost: "0.1" },
      ]),
    ).toBe("0.04");
  });

  it("rejects non-positive quantities", () => {
    expect(() => calculateDerivedCost([{ quantity: "0", unitCost: "10" }])).toThrow("quantity");
  });
});
