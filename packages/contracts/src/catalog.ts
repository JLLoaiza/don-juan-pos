import { z } from "zod";

export const DecimalStringSchema = z.string().regex(/^-?\d+(\.\d{1,6})?$/);
export const NonNegativeDecimalStringSchema = z.string().regex(/^\d+(\.\d{1,6})?$/);
export const PositiveDecimalStringSchema = z.string().regex(/^\d+(\.\d{1,6})?$/).refine((value) => Number(value) > 0);
export const InventoryUnitSchema = z.enum(["G", "KG", "ML", "L", "UNIT"]);
export const StockStateSchema = z.enum(["NEGATIVE_STOCK", "OUT_OF_STOCK", "LOW_STOCK", "OK"]);
export const CatalogVersionSchema = z.number().int().positive();

const EntityIdSchema = z.string().uuid();
const NameSchema = z.string().trim().min(1).max(150);
const NotesSchema = z.string().max(10000).nullable().optional();

export const InventoryItemSchema = z.object({
  id: EntityIdSchema,
  name: z.string(),
  unit: InventoryUnitSchema,
  unitCost: NonNegativeDecimalStringSchema.nullable(),
  currentStock: DecimalStringSchema,
  minimumStock: NonNegativeDecimalStringSchema,
  stockState: StockStateSchema,
  notes: z.string().nullable(),
  active: z.boolean(),
  version: CatalogVersionSchema,
});
export const CreateInventoryItemRequestSchema = z.object({
  name: NameSchema,
  unit: InventoryUnitSchema,
  initialStock: NonNegativeDecimalStringSchema.default("0"),
  initialUnitCost: NonNegativeDecimalStringSchema.default("0"),
  minimumStock: NonNegativeDecimalStringSchema.default("0"),
  notes: NotesSchema,
});
export const UpdateInventoryItemRequestSchema = z.object({
  expectedVersion: CatalogVersionSchema,
  name: NameSchema,
  minimumStock: NonNegativeDecimalStringSchema,
  notes: NotesSchema,
  active: z.boolean(),
});
export const AdjustInventoryRequestSchema = z.object({
  expectedVersion: CatalogVersionSchema,
  quantityDelta: DecimalStringSchema.refine((value) => value !== "0" && value !== "0.0"),
  reason: z.string().trim().min(1).max(2000),
});

export const InventoryComponentInputSchema = z.object({ inventoryItemId: EntityIdSchema, quantity: PositiveDecimalStringSchema });
export const AccompanimentComponentInputSchema = z.object({
  type: z.literal("ACCOMPANIMENT"), accompanimentId: EntityIdSchema, quantity: PositiveDecimalStringSchema,
});
export const ProductInventoryComponentInputSchema = z.object({
  type: z.literal("INVENTORY_ITEM"), inventoryItemId: EntityIdSchema, quantity: PositiveDecimalStringSchema,
});
export const ProductComponentInputSchema = z.discriminatedUnion("type", [ProductInventoryComponentInputSchema, AccompanimentComponentInputSchema]);
export const AdditionalInputSchema = z.object({
  accompanimentId: EntityIdSchema,
  priceOverride: NonNegativeDecimalStringSchema.nullable().optional(),
  allowFree: z.boolean().default(true),
  sortOrder: z.number().int().min(0).default(0),
  active: z.boolean().default(true),
});
export const AccompanimentSchema = z.object({
  id: EntityIdSchema, name: z.string(), defaultPrice: NonNegativeDecimalStringSchema, notes: z.string().nullable(), active: z.boolean(), version: CatalogVersionSchema,
  components: z.array(InventoryComponentInputSchema), calculatedCost: NonNegativeDecimalStringSchema.nullable(),
});
export const CreateAccompanimentRequestSchema = z.object({ name: NameSchema, defaultPrice: NonNegativeDecimalStringSchema.default("0"), notes: NotesSchema, components: z.array(InventoryComponentInputSchema).min(1) });
export const UpdateAccompanimentRequestSchema = CreateAccompanimentRequestSchema.extend({ expectedVersion: CatalogVersionSchema, active: z.boolean() });
export const ProductSchema = z.object({
  id: EntityIdSchema, name: z.string(), description: z.string().nullable(), salePrice: NonNegativeDecimalStringSchema, calculatedCost: NonNegativeDecimalStringSchema.nullable(),
  active: z.boolean(), version: CatalogVersionSchema, components: z.array(ProductComponentInputSchema), additionals: z.array(AdditionalInputSchema),
});
export const CreateProductRequestSchema = z.object({ name: NameSchema, description: z.string().max(10000).nullable().optional(), salePrice: NonNegativeDecimalStringSchema, notes: NotesSchema, components: z.array(ProductComponentInputSchema), additionals: z.array(AdditionalInputSchema).default([]) });
export const UpdateProductRequestSchema = CreateProductRequestSchema.extend({ expectedVersion: CatalogVersionSchema, active: z.boolean() });
export const UpdateProductPriceRequestSchema = z.object({
  expectedVersion: CatalogVersionSchema,
  salePrice: NonNegativeDecimalStringSchema.optional(),
  targetProfit: DecimalStringSchema.optional(),
  targetMarginPercent: DecimalStringSchema.optional(),
}).refine((value) => Number(Boolean(value.salePrice)) + Number(Boolean(value.targetProfit)) + Number(Boolean(value.targetMarginPercent)) === 1, "Provide exactly one pricing target");
export const CatalogSnapshotSchema = z.object({ inventoryItems: z.array(InventoryItemSchema), accompaniments: z.array(AccompanimentSchema), products: z.array(ProductSchema) });
export const InventoryMovementSchema = z.object({ id: EntityIdSchema, inventoryItemId: EntityIdSchema, movementType: z.enum(["PURCHASE", "SALE", "MANUAL_ADJUSTMENT", "CORRECTION", "RETURN"]), quantity: DecimalStringSchema, unitCost: NonNegativeDecimalStringSchema.nullable(), stockBefore: DecimalStringSchema, stockAfter: DecimalStringSchema, reason: z.string().nullable(), createdAt: z.string().datetime() });

export type CreateInventoryItemRequest = z.infer<typeof CreateInventoryItemRequestSchema>;
export type UpdateInventoryItemRequest = z.infer<typeof UpdateInventoryItemRequestSchema>;
export type AdjustInventoryRequest = z.infer<typeof AdjustInventoryRequestSchema>;
export type CreateAccompanimentRequest = z.infer<typeof CreateAccompanimentRequestSchema>;
export type UpdateAccompanimentRequest = z.infer<typeof UpdateAccompanimentRequestSchema>;
export type CreateProductRequest = z.infer<typeof CreateProductRequestSchema>;
export type UpdateProductRequest = z.infer<typeof UpdateProductRequestSchema>;
export type UpdateProductPriceRequest = z.infer<typeof UpdateProductPriceRequestSchema>;

export type CatalogSnapshot = z.infer<typeof CatalogSnapshotSchema>;
export type InventoryMovement = z.infer<typeof InventoryMovementSchema>;

