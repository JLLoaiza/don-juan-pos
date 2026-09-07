import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import type { Accompaniment, InventoryItem } from "./catalogApi";
import { PriceFields } from "./PriceFields";
import type { ProductComponentValue } from "./ProductComponentsEditor";

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

const COMPONENTS: ProductComponentValue[] = [{ type: "INVENTORY_ITEM", inventoryItemId: INVENTORY_ITEM.id, quantity: "3" }];
// cost preview = 3 * 18.5 = 55.5

function Harness({ initialSalePrice, components = COMPONENTS, inventoryItems = [INVENTORY_ITEM], accompaniments = [] }: {
  initialSalePrice: string;
  components?: ProductComponentValue[];
  inventoryItems?: InventoryItem[];
  accompaniments?: Accompaniment[];
}) {
  const [salePrice, setSalePrice] = useState(initialSalePrice);
  return (
    <PriceFields
      salePrice={salePrice}
      onSalePriceChange={setSalePrice}
      components={components}
      inventoryItems={inventoryItems}
      accompaniments={accompaniments}
    />
  );
}

describe("PriceFields", () => {
  it("initializes profit and margin from the sale price and the estimated recipe cost", () => {
    render(<Harness initialSalePrice="111" />);
    expect(screen.getByLabelText("Utilidad")).toHaveValue("55.50");
    expect(screen.getByLabelText("Margen (%)")).toHaveValue("50.0");
  });

  it("updates profit and margin when the sale price changes", () => {
    render(<Harness initialSalePrice="0" />);
    fireEvent.change(screen.getByLabelText("Precio de venta"), { target: { value: "138.75" } });
    expect(screen.getByLabelText("Utilidad")).toHaveValue("83.25");
    expect(screen.getByLabelText("Margen (%)")).toHaveValue("60.0");
  });

  it("updates the sale price and margin when profit changes", () => {
    render(<Harness initialSalePrice="0" />);
    fireEvent.change(screen.getByLabelText("Utilidad"), { target: { value: "83.25" } });
    expect(screen.getByLabelText("Precio de venta")).toHaveValue("138.75");
    expect(screen.getByLabelText("Margen (%)")).toHaveValue("60.0");
  });

  it("updates the sale price and profit when margin changes", () => {
    render(<Harness initialSalePrice="0" />);
    fireEvent.change(screen.getByLabelText("Margen (%)"), { target: { value: "60" } });
    expect(screen.getByLabelText("Precio de venta")).toHaveValue("138.75");
    expect(screen.getByLabelText("Utilidad")).toHaveValue("83.25");
  });

  it("shows an error and does not change price/profit for a margin of 100% or more", () => {
    render(<Harness initialSalePrice="200" />);
    fireEvent.change(screen.getByLabelText("Margen (%)"), { target: { value: "100" } });
    expect(screen.getByText("El margen debe ser menor a 100%.")).toBeInTheDocument();
    expect(screen.getByLabelText("Precio de venta")).toHaveValue("200");
  });

  it("disables profit and margin, and explains why, when a component's cost isn't visible", () => {
    const withoutCost: InventoryItem = { ...INVENTORY_ITEM, unitCost: null };
    render(<Harness initialSalePrice="100" inventoryItems={[withoutCost]} />);
    expect(screen.getByLabelText("Utilidad")).toBeDisabled();
    expect(screen.getByLabelText("Margen (%)")).toBeDisabled();
    expect(screen.getByLabelText("Precio de venta")).not.toBeDisabled();
    expect(screen.getByText(/No se puede estimar utilidad ni margen/)).toBeInTheDocument();
  });

  it("shows the estimated recipe cost for transparency", () => {
    render(<Harness initialSalePrice="100" />);
    expect(screen.getByText(/Costo estimado de la receta.*55\.5/)).toBeInTheDocument();
  });
});
