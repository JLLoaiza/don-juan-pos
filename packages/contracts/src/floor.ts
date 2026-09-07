import { z } from "zod";
import {
  DecimalStringSchema,
  NonNegativeDecimalStringSchema,
  PositiveDecimalStringSchema,
} from "./catalog.js";

const EntityIdSchema = z.string().uuid();
const NameSchema = z.string().trim().min(1).max(150);
const NotesSchema = z.string().max(10_000).nullable().optional();
const PositiveVersionSchema = z.number().int().positive();

export const DiningAreaSchema = z.object({
  id: EntityIdSchema,
  name: z.string(),
  active: z.boolean(),
});

export const TableStatusSchema = z.enum(["AVAILABLE", "OCCUPIED", "RESERVED"]);

export const RestaurantTableSchema = z.object({
  id: EntityIdSchema,
  diningAreaId: EntityIdSchema,
  name: z.string(),
  capacity: z.number().int().positive(),
  status: TableStatusSchema,
  active: z.boolean(),
  openAccountId: EntityIdSchema.nullable(),
});

/** Read model for the floor of the active branch. */
export const FloorSnapshotSchema = z.object({
  diningAreas: z.array(DiningAreaSchema),
  tables: z.array(RestaurantTableSchema),
});

/** The selected branch comes from authenticated session context, never this payload. */
export const FloorQuerySchema = z.object({});

export const CreateDiningAreaRequestSchema = z.object({
  name: NameSchema,
});

export const CreateRestaurantTableRequestSchema = z.object({
  diningAreaId: EntityIdSchema,
  name: NameSchema,
  capacity: z.number().int().positive(),
  status: TableStatusSchema.default("AVAILABLE"),
});

export const AccountStatusSchema = z.enum(["OPEN", "PAID", "VOID"]);
export const AccountItemStatusSchema = z.enum(["CONFIRMED", "VOID"]);

export const OpenAccountRequestSchema = z.object({
  tableId: EntityIdSchema,
  customerId: EntityIdSchema.nullable().optional(),
  notes: NotesSchema,
});

export const SelectedAdditionalSchema = z.object({
  accompanimentId: EntityIdSchema,
  noCharge: z.boolean().default(false),
});

export const ConfirmConsumptionItemSchema = z.object({
  productId: EntityIdSchema,
  /** Whole commercial units are represented as strings to avoid float inputs. */
  quantity: z.string().regex(/^[1-9]\d*$/, "quantity must be a positive whole number"),
  selectedAdditionals: z.array(SelectedAdditionalSchema).default([]),
  notes: z.string().max(10_000).nullable().optional(),
});

export const ConfirmConsumptionRequestSchema = z.object({
  expectedVersion: PositiveVersionSchema,
  items: z.array(ConfirmConsumptionItemSchema).min(1),
});

export const AccountItemAdditionalSnapshotSchema = z.object({
  accompanimentId: EntityIdSchema,
  name: z.string(),
  quantity: PositiveDecimalStringSchema,
  unitPrice: NonNegativeDecimalStringSchema,
  noCharge: z.boolean(),
  included: z.boolean(),
  total: NonNegativeDecimalStringSchema,
});

export const AccountItemSnapshotSchema = z.object({
  id: EntityIdSchema,
  productId: EntityIdSchema,
  productName: z.string(),
  quantity: PositiveDecimalStringSchema,
  unitSalePrice: NonNegativeDecimalStringSchema,
  /** Historical cost is withheld unless the authenticated user has products.view_cost. */
  unitCost: NonNegativeDecimalStringSchema.nullable(),
  discountTotal: NonNegativeDecimalStringSchema,
  taxRate: NonNegativeDecimalStringSchema,
  lineSubtotal: NonNegativeDecimalStringSchema,
  lineTotal: NonNegativeDecimalStringSchema,
  notes: z.string().nullable(),
  status: AccountItemStatusSchema,
  additionals: z.array(AccountItemAdditionalSnapshotSchema),
  consumptionSnapshot: z.record(z.string(), z.unknown()),
  createdAt: z.string().datetime(),
});

export const AccountSnapshotSchema = z.object({
  id: EntityIdSchema,
  tableId: EntityIdSchema,
  customerId: EntityIdSchema.nullable(),
  openedByUserId: EntityIdSchema,
  status: AccountStatusSchema,
  openedAt: z.string().datetime(),
  closedAt: z.string().datetime().nullable(),
  subtotal: NonNegativeDecimalStringSchema,
  discountTotal: NonNegativeDecimalStringSchema,
  servicePercentage: NonNegativeDecimalStringSchema,
  serviceTotal: NonNegativeDecimalStringSchema,
  taxTotal: NonNegativeDecimalStringSchema,
  total: NonNegativeDecimalStringSchema,
  notes: z.string().nullable(),
  version: PositiveVersionSchema,
  items: z.array(AccountItemSnapshotSchema),
});

export const KitchenOrderSnapshotSchema = z.object({
  id: EntityIdSchema,
  ticketNumber: z.string(),
  orderType: z.enum(["ORDER", "CANCELLATION"]),
  content: z.record(z.string(), z.unknown()),
  createdAt: z.string().datetime(),
});

export const PrintJobSnapshotSchema = z.object({
  id: EntityIdSchema,
  printerId: EntityIdSchema.nullable(),
  documentType: z.enum(["KITCHEN_ORDER", "KITCHEN_CANCELLATION", "ACCOUNT_RECEIPT", "PAYMENT_RECEIPT", "DAY_CLOSE"]),
  status: z.enum(["PENDING", "PRINTED", "FAILED", "CANCELLED"]),
  attempts: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
});

export const NegativeStockWarningSchema = z.object({
  type: z.literal("NEGATIVE_STOCK"),
  inventoryItemId: EntityIdSchema,
  inventoryItemName: z.string(),
  currentStock: DecimalStringSchema,
  unit: z.enum(["G", "KG", "ML", "L", "UNIT"]),
});

/** Immutable server result for a successful idempotent consumption operation. */
export const ConfirmConsumptionResponseSchema = z.object({
  account: AccountSnapshotSchema,
  kitchenOrder: KitchenOrderSnapshotSchema.nullable(),
  printJob: PrintJobSnapshotSchema.nullable(),
  warnings: z.array(NegativeStockWarningSchema),
});

export type DiningArea = z.infer<typeof DiningAreaSchema>;
export type RestaurantTable = z.infer<typeof RestaurantTableSchema>;
export type FloorSnapshot = z.infer<typeof FloorSnapshotSchema>;
export type CreateDiningAreaRequest = z.infer<typeof CreateDiningAreaRequestSchema>;
export type CreateRestaurantTableRequest = z.infer<typeof CreateRestaurantTableRequestSchema>;
export type OpenAccountRequest = z.infer<typeof OpenAccountRequestSchema>;
export type ConfirmConsumptionRequest = z.infer<typeof ConfirmConsumptionRequestSchema>;
export type AccountSnapshot = z.infer<typeof AccountSnapshotSchema>;
export type ConfirmConsumptionResponse = z.infer<typeof ConfirmConsumptionResponseSchema>;
