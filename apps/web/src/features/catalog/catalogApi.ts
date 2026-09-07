import { z } from "zod";
import {
  AccompanimentSchema,
  CatalogSnapshotSchema,
  CatalogVersionSchema,
  DecimalStringSchema,
  InventoryItemSchema,
  ProductSchema,
  StockStateSchema,
  type AdjustInventoryRequest,
  type CatalogSnapshot,
  type CreateAccompanimentRequest,
  type CreateInventoryItemRequest,
  type CreateProductRequest,
  type UpdateAccompanimentRequest,
  type UpdateInventoryItemRequest,
  type UpdateProductRequest,
} from "@don-juan/contracts";
import type { AuthContextValue } from "../auth/AuthProvider";

export type InventoryItem = z.infer<typeof InventoryItemSchema>;
export type Accompaniment = z.infer<typeof AccompanimentSchema>;
export type Product = z.infer<typeof ProductSchema>;

// apps/api's POST /catalog/inventory-items/:id/adjust result shape is not yet
// published as a named schema in @don-juan/contracts — this mirrors it using
// only already-published primitive schemas (no invented fields/formats). See
// .agents/handoffs/claude-frontend-latest.md for the request to publish it.
export const AdjustInventoryResultSchema = z.object({
  id: z.string().uuid(),
  previousStock: DecimalStringSchema,
  currentStock: DecimalStringSchema,
  stockState: StockStateSchema,
  version: CatalogVersionSchema,
});
export type AdjustInventoryResult = z.infer<typeof AdjustInventoryResultSchema>;

type AuthClient = Pick<AuthContextValue, "authGet" | "authPost" | "authPut">;

function idempotencyHeaders(): Record<string, string> {
  return { "idempotency-key": crypto.randomUUID() };
}

export interface CatalogApi {
  getSnapshot(): Promise<CatalogSnapshot>;
  createInventoryItem(input: CreateInventoryItemRequest): Promise<InventoryItem>;
  updateInventoryItem(id: string, input: UpdateInventoryItemRequest): Promise<InventoryItem>;
  adjustInventory(id: string, input: AdjustInventoryRequest): Promise<AdjustInventoryResult>;
  createAccompaniment(input: CreateAccompanimentRequest): Promise<Accompaniment>;
  updateAccompaniment(id: string, input: UpdateAccompanimentRequest): Promise<Accompaniment>;
  createProduct(input: CreateProductRequest): Promise<Product>;
  updateProduct(id: string, input: UpdateProductRequest): Promise<Product>;
}

export function createCatalogApi(auth: AuthClient): CatalogApi {
  return {
    getSnapshot: () => auth.authGet("/catalog", CatalogSnapshotSchema),
    createInventoryItem: (input) =>
      auth.authPost("/catalog/inventory-items", InventoryItemSchema, input, idempotencyHeaders()),
    updateInventoryItem: (id, input) =>
      auth.authPut(`/catalog/inventory-items/${id}`, InventoryItemSchema, input, idempotencyHeaders()),
    adjustInventory: (id, input) =>
      auth.authPost(`/catalog/inventory-items/${id}/adjust`, AdjustInventoryResultSchema, input, idempotencyHeaders()),
    createAccompaniment: (input) =>
      auth.authPost("/catalog/accompaniments", AccompanimentSchema, input, idempotencyHeaders()),
    updateAccompaniment: (id, input) =>
      auth.authPut(`/catalog/accompaniments/${id}`, AccompanimentSchema, input, idempotencyHeaders()),
    createProduct: (input) => auth.authPost("/catalog/products", ProductSchema, input, idempotencyHeaders()),
    updateProduct: (id, input) =>
      auth.authPut(`/catalog/products/${id}`, ProductSchema, input, idempotencyHeaders()),
  };
}
