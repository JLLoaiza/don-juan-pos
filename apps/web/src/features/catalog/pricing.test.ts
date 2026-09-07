import { describe, expect, it } from "vitest";
import type { Accompaniment, InventoryItem } from "./catalogApi";
import { deriveFromMargin, deriveFromProfit, deriveFromSalePrice, previewComponentsCost } from "./pricing";

const INVENTORY_ITEM: InventoryItem = {
  id: "11111111-1111-7111-8111-111111111111",
  name: "Carne de res",
  unit: "KG",
  unitCost: "18.500000",
  currentStock: "10.000000",
  minimumStock: "2.000000",
  stockState: "OK",
  notes: null,
  active: true,
  version: 1,
};

const ACCOMPANIMENT: Accompaniment = {
  id: "22222222-2222-7222-8222-222222222222",
  name: "Papas fritas",
  defaultPrice: "5.00",
  notes: null,
  active: true,
  version: 1,
  components: [],
  calculatedCost: "188.700000",
};

describe("previewComponentsCost", () => {
  it("sums inventory-item components using the visible unit cost", () => {
    const cost = previewComponentsCost(
      [{ type: "INVENTORY_ITEM", inventoryItemId: INVENTORY_ITEM.id, quantity: "2" }],
      [INVENTORY_ITEM],
      [],
    );
    expect(cost).toBeCloseTo(37);
  });

  it("sums accompaniment components using their calculated cost", () => {
    const cost = previewComponentsCost(
      [{ type: "ACCOMPANIMENT", accompanimentId: ACCOMPANIMENT.id, quantity: "1" }],
      [],
      [ACCOMPANIMENT],
    );
    expect(cost).toBeCloseTo(188.7);
  });

  it("mixes both component kinds", () => {
    const cost = previewComponentsCost(
      [
        { type: "INVENTORY_ITEM", inventoryItemId: INVENTORY_ITEM.id, quantity: "1" },
        { type: "ACCOMPANIMENT", accompanimentId: ACCOMPANIMENT.id, quantity: "1" },
      ],
      [INVENTORY_ITEM],
      [ACCOMPANIMENT],
    );
    expect(cost).toBeCloseTo(207.2);
  });

  it("returns 0 for an empty recipe", () => {
    expect(previewComponentsCost([], [], [])).toBe(0);
  });

  it("returns null when a component's cost isn't visible (missing permission)", () => {
    const withoutCost: InventoryItem = { ...INVENTORY_ITEM, unitCost: null };
    const cost = previewComponentsCost(
      [{ type: "INVENTORY_ITEM", inventoryItemId: withoutCost.id, quantity: "1" }],
      [withoutCost],
      [],
    );
    expect(cost).toBeNull();
  });

  it("returns null when a referenced component no longer exists", () => {
    const cost = previewComponentsCost(
      [{ type: "INVENTORY_ITEM", inventoryItemId: "missing", quantity: "1" }],
      [INVENTORY_ITEM],
      [],
    );
    expect(cost).toBeNull();
  });
});

describe("deriveFromSalePrice / deriveFromProfit / deriveFromMargin round-trip consistently", () => {
  it("derives profit and margin from a sale price", () => {
    expect(deriveFromSalePrice(207.2, 518)).toEqual({ profit: "310.80", marginPercent: "60.0" });
  });

  it("derives sale price and margin from a profit", () => {
    expect(deriveFromProfit(207.2, 310.8)).toEqual({ salePrice: "518.00", marginPercent: "60.0" });
  });

  it("derives sale price and profit from a margin, matching the server's cost/(1-margin/100) formula", () => {
    expect(deriveFromMargin(207.2, 60)).toEqual({ salePrice: "518.00", profit: "310.80" });
  });

  it("rejects a margin of 100% or more, same as the backend rule", () => {
    expect(deriveFromMargin(100, 100)).toBeNull();
    expect(deriveFromMargin(100, 150)).toBeNull();
  });
});
