import { describe, expect, it, vi } from "vitest";
import { createCatalogApi } from "./catalogApi";

function fakeAuth() {
  return {
    authGet: vi.fn(async () => ({}) as never),
    authPost: vi.fn(async () => ({}) as never),
    authPut: vi.fn(async () => ({}) as never),
  };
}

describe("createCatalogApi", () => {
  it("fetches the catalog snapshot with GET /catalog", async () => {
    const auth = fakeAuth();
    await createCatalogApi(auth).getSnapshot();
    expect(auth.authGet).toHaveBeenCalledWith("/catalog", expect.anything());
  });

  it("creates an inventory item with a unique Idempotency-Key header", async () => {
    const auth = fakeAuth();
    const api = createCatalogApi(auth);
    await api.createInventoryItem({ name: "Beef", unit: "G", initialStock: "0", initialUnitCost: "0", minimumStock: "0", notes: null });
    expect(auth.authPost).toHaveBeenCalledWith(
      "/catalog/inventory-items",
      expect.anything(),
      { name: "Beef", unit: "G", initialStock: "0", initialUnitCost: "0", minimumStock: "0", notes: null },
      { "idempotency-key": expect.stringMatching(/^[0-9a-f-]{36}$/) },
    );
  });

  it("uses a fresh operation id on every call so retries are never silently coalesced client-side", async () => {
    const auth = fakeAuth();
    const api = createCatalogApi(auth);
    const input = { name: "Beef", unit: "G" as const, initialStock: "0", initialUnitCost: "0", minimumStock: "0", notes: null };
    await api.createInventoryItem(input);
    await api.createInventoryItem(input);
    const [, , , firstHeaders] = auth.authPost.mock.calls[0] as unknown as [string, unknown, unknown, Record<string, string>];
    const [, , , secondHeaders] = auth.authPost.mock.calls[1] as unknown as [string, unknown, unknown, Record<string, string>];
    expect(firstHeaders["idempotency-key"]).not.toBe(secondHeaders["idempotency-key"]);
  });

  it("updates an inventory item with PUT /catalog/inventory-items/:id", async () => {
    const auth = fakeAuth();
    await createCatalogApi(auth).updateInventoryItem("item-1", { expectedVersion: 1, name: "Beef", minimumStock: "0", notes: null, active: true });
    expect(auth.authPut).toHaveBeenCalledWith(
      "/catalog/inventory-items/item-1",
      expect.anything(),
      { expectedVersion: 1, name: "Beef", minimumStock: "0", notes: null, active: true },
      expect.objectContaining({ "idempotency-key": expect.any(String) }),
    );
  });

  it("adjusts inventory stock with POST /catalog/inventory-items/:id/adjust", async () => {
    const auth = fakeAuth();
    await createCatalogApi(auth).adjustInventory("item-1", { expectedVersion: 1, quantityDelta: "-2", reason: "Merma" });
    expect(auth.authPost).toHaveBeenCalledWith(
      "/catalog/inventory-items/item-1/adjust",
      expect.anything(),
      { expectedVersion: 1, quantityDelta: "-2", reason: "Merma" },
      expect.objectContaining({ "idempotency-key": expect.any(String) }),
    );
  });

  it("updates product pricing with POST /catalog/products/:id/price (not PUT)", async () => {
    const auth = fakeAuth();
    await createCatalogApi(auth).updateProductPrice("product-1", { expectedVersion: 1, salePrice: "20.00" });
    expect(auth.authPost).toHaveBeenCalledWith(
      "/catalog/products/product-1/price",
      expect.anything(),
      { expectedVersion: 1, salePrice: "20.00" },
      expect.objectContaining({ "idempotency-key": expect.any(String) }),
    );
    expect(auth.authPut).not.toHaveBeenCalled();
  });
});
