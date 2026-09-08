import { z } from "zod";
import { NonNegativeDecimalStringSchema, PositiveDecimalStringSchema } from "./catalog.js";

const Id = z.string().uuid();
const Notes = z.string().max(10_000).nullable().optional();
const DateTime = z.string().datetime().optional();
const PaymentMethodTypeSchema = z.enum(["CASH", "CARD", "QR"]);

export const SupplierSchema = z.object({
  id: Id, name: z.string(), taxId: z.string().nullable(), phone: z.string().nullable(), email: z.string().nullable(), address: z.string().nullable(), notes: z.string().nullable(), active: z.boolean(),
});
export const CreateSupplierRequestSchema = z.object({ name: z.string().trim().min(1).max(150), taxId: z.string().trim().max(50).nullable().optional(), phone: z.string().trim().max(50).nullable().optional(), email: z.string().trim().email().max(150).nullable().optional(), address: z.string().trim().max(250).nullable().optional(), notes: Notes });
export const UpdateSupplierRequestSchema = CreateSupplierRequestSchema.extend({ active: z.boolean() });

export const VoidProcurementRequestSchema = z.object({ reason: z.string().trim().min(1).max(2_000) });

export const PurchaseItemRequestSchema = z.object({ inventoryItemId: Id, quantity: PositiveDecimalStringSchema, unitCost: NonNegativeDecimalStringSchema });
export const ConfirmPurchaseRequestSchema = z.object({ supplierId: Id.nullable().optional(), documentNumber: z.string().trim().max(100).nullable().optional(), purchaseDate: DateTime, taxTotal: NonNegativeDecimalStringSchema.optional(), discountTotal: NonNegativeDecimalStringSchema.optional(), paymentMethodId: Id.nullable().optional(), cashSessionId: Id.nullable().optional(), notes: Notes, items: z.array(PurchaseItemRequestSchema).min(1) });
export const PurchaseItemSchema = PurchaseItemRequestSchema.extend({ id: Id, subtotal: NonNegativeDecimalStringSchema });
export const PurchaseSchema = z.object({ id: Id, supplierId: Id.nullable(), documentNumber: z.string().nullable(), purchaseDate: z.string().datetime(), subtotal: NonNegativeDecimalStringSchema, taxTotal: NonNegativeDecimalStringSchema, discountTotal: NonNegativeDecimalStringSchema, total: NonNegativeDecimalStringSchema, paymentMethodId: Id.nullable(), paymentMethodType: PaymentMethodTypeSchema.nullable(), cashSessionId: Id.nullable(), status: z.enum(["CONFIRMED", "VOID"]), notes: z.string().nullable(), createdByUserId: Id, createdAt: z.string().datetime(), items: z.array(PurchaseItemSchema) });
export const PurchaseListSchema = z.object({ purchases: z.array(PurchaseSchema) });

export const CreateExpenseRequestSchema = z.object({ supplierId: Id.nullable().optional(), concept: z.string().trim().min(1).max(200), amount: PositiveDecimalStringSchema, expenseDate: DateTime, paymentMethodId: Id.nullable().optional(), cashSessionId: Id.nullable().optional(), notes: Notes });
export const ExpenseSchema = z.object({ id: Id, supplierId: Id.nullable(), concept: z.string(), amount: PositiveDecimalStringSchema, expenseDate: z.string().datetime(), paymentMethodId: Id.nullable(), paymentMethodType: PaymentMethodTypeSchema.nullable(), cashSessionId: Id.nullable(), status: z.enum(["CONFIRMED", "VOID"]), notes: z.string().nullable(), createdByUserId: Id, createdAt: z.string().datetime() });
export const ExpenseListSchema = z.object({ expenses: z.array(ExpenseSchema) });

export type VoidProcurementRequest = z.infer<typeof VoidProcurementRequestSchema>;
export type CreateSupplierRequest = z.infer<typeof CreateSupplierRequestSchema>;
export type UpdateSupplierRequest = z.infer<typeof UpdateSupplierRequestSchema>;
export type ConfirmPurchaseRequest = z.infer<typeof ConfirmPurchaseRequestSchema>;
export type CreateExpenseRequest = z.infer<typeof CreateExpenseRequestSchema>;
export type Purchase = z.infer<typeof PurchaseSchema>;
export type Expense = z.infer<typeof ExpenseSchema>;
