import { z } from "zod";
import { NonNegativeDecimalStringSchema, PositiveDecimalStringSchema } from "./catalog.js";

const Id = z.string().uuid();
const Notes = z.string().max(10_000).nullable().optional();
const DateTime = z.string().datetime().optional();

export const SupplierSchema = z.object({ id: Id, name: z.string(), taxId: z.string().nullable(), phone: z.string().nullable(), email: z.string().nullable(), address: z.string().nullable(), notes: z.string().nullable(), active: z.boolean() });
export const CreateSupplierRequestSchema = z.object({ name: z.string().trim().min(1).max(150), taxId: z.string().trim().max(50).nullable().optional(), phone: z.string().trim().max(50).nullable().optional(), email: z.string().trim().email().max(150).nullable().optional(), address: z.string().trim().max(250).nullable().optional(), notes: Notes });
export const PurchaseItemRequestSchema = z.object({ inventoryItemId: Id, quantity: PositiveDecimalStringSchema, unitCost: NonNegativeDecimalStringSchema });
export const ConfirmPurchaseRequestSchema = z.object({ supplierId: Id.nullable().optional(), documentNumber: z.string().trim().max(100).nullable().optional(), purchaseDate: DateTime, paymentMethodId: Id.nullable().optional(), cashSessionId: Id.nullable().optional(), notes: Notes, items: z.array(PurchaseItemRequestSchema).min(1) });
export const CreateExpenseRequestSchema = z.object({ supplierId: Id.nullable().optional(), concept: z.string().trim().min(1).max(200), amount: PositiveDecimalStringSchema, expenseDate: DateTime, paymentMethodId: Id.nullable().optional(), cashSessionId: Id.nullable().optional(), notes: Notes });
export type ConfirmPurchaseRequest = z.infer<typeof ConfirmPurchaseRequestSchema>;
export type CreateExpenseRequest = z.infer<typeof CreateExpenseRequestSchema>;
