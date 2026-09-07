import { describe, expect, it } from "vitest";
import { deriveStockStatus } from "./inventory.js";

describe("deriveStockStatus", () => {
  it.each([
    ["-0.001", "10", "NEGATIVE_STOCK"],
    ["0", "10", "OUT_OF_STOCK"],
    ["9.999", "10", "LOW_STOCK"],
    ["10", "10", "OK"],
    ["12.5", "10", "OK"],
  ] as const)("returns %s for stock %s", (currentStock, minimumStock, expected) => {
    expect(deriveStockStatus(currentStock, minimumStock)).toBe(expected);
  });

  it("rejects a negative minimum stock", () => {
    expect(() => deriveStockStatus("1", "-1")).toThrow("minimumStock");
  });
});
