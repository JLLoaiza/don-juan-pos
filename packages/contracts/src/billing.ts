import { z } from "zod";
import { NonNegativeDecimalStringSchema, PositiveDecimalStringSchema } from "./catalog.js";

const EntityIdSchema = z.string().uuid();
const MoneySchema = NonNegativeDecimalStringSchema;
const PositiveMoneySchema = PositiveDecimalStringSchema;
const PositiveVersionSchema = z.number().int().positive();
const NotesSchema = z.string().max(10_000).nullable().optional();

/** All financial amounts are decimal strings; the backend is authoritative. */
export const PaymentMethodTypeSchema = z.enum(["CASH", "CARD", "QR"]);
export const PaymentStatusSchema = z.enum(["REGISTERED", "VOID"]);
export const DiscountTypeSchema = z.enum(["PERCENTAGE", "FIXED"]);
export const SettlementModeSchema = z.enum(["DIRECT", "SPLIT"]);
export const CashSessionStatusSchema = z.enum(["OPEN", "CLOSED"]);
export const CashMovementTypeSchema = z.enum(["SALE", "EXPENSE", "WITHDRAWAL", "DEPOSIT", "ADJUSTMENT", "PURCHASE", "EMPLOYEE_PAYMENT"]);

export const PaymentMethodSchema = z.object({ id: EntityIdSchema, name: z.string(), type: PaymentMethodTypeSchema, active: z.boolean() });
export const PaymentSnapshotSchema = z.object({
  id: EntityIdSchema, accountId: EntityIdSchema, accountSplitId: EntityIdSchema.nullable(), paymentMethodId: EntityIdSchema,
  paymentMethodName: z.string(), paymentMethodType: PaymentMethodTypeSchema, status: PaymentStatusSchema,
  amountApplied: PositiveMoneySchema, cashReceived: MoneySchema.nullable(), changeAmount: MoneySchema,
  reference: z.string().nullable(), notes: z.string().nullable(), cashSessionId: EntityIdSchema.nullable(),
  receivedByUserId: EntityIdSchema, receivedAt: z.string().datetime(),
});
export const BillingDiscountSchema = z.object({ id: EntityIdSchema, name: z.string(), type: DiscountTypeSchema, value: MoneySchema, appliedAmount: MoneySchema, createdAt: z.string().datetime() });
export const AccountSplitSchema = z.object({
  id: EntityIdSchema, number: z.number().int().positive(), type: z.enum(["BY_ITEM", "BY_PERCENTAGE"]), percentage: MoneySchema.nullable(),
  subtotal: MoneySchema, discountTotal: MoneySchema, servicePercentage: MoneySchema, serviceTotal: MoneySchema, taxTotal: MoneySchema, total: MoneySchema,
  paidTotal: MoneySchema, remainingBalance: MoneySchema, status: z.enum(["OPEN", "PAID", "VOID"]), finalizedAt: z.string().datetime().nullable(),
});
export const BillingSnapshotSchema = z.object({
  accountId: EntityIdSchema, status: z.enum(["OPEN", "PAID", "VOID"]), version: PositiveVersionSchema, settlementMode: SettlementModeSchema,
  subtotal: MoneySchema, discountTotal: MoneySchema, taxTotal: MoneySchema, servicePercentage: MoneySchema, serviceTotal: MoneySchema, total: MoneySchema,
  paidTotal: MoneySchema, remainingBalance: MoneySchema, hasPayments: z.boolean(), discounts: z.array(BillingDiscountSchema), splits: z.array(AccountSplitSchema), payments: z.array(PaymentSnapshotSchema),
});
export const ApplyAccountDiscountRequestSchema = z.object({ expectedVersion: PositiveVersionSchema, name: z.string().trim().min(1).max(150), type: DiscountTypeSchema, value: PositiveMoneySchema })
  .superRefine((value, ctx) => { if (value.type === "PERCENTAGE" && Number(value.value) > 100) ctx.addIssue({ code: "custom", path: ["value"], message: "Percentage discount cannot exceed 100" }); });
export const ConfigureServiceRequestSchema = z.object({ expectedVersion: PositiveVersionSchema, percentage: MoneySchema.refine((value) => Number(value) < 100, "Service percentage must be less than 100") });
export const SplitItemAllocationSchema = z.object({ accountItemId: EntityIdSchema, quantity: z.string().regex(/^[1-9]\d*$/, "quantity must be a positive whole number") });
export const CreateItemSplitsRequestSchema = z.object({ expectedVersion: PositiveVersionSchema, splits: z.array(z.object({ items: z.array(SplitItemAllocationSchema).min(1), servicePercentage: MoneySchema.default("0") })).min(2) });
export const CreatePercentageSplitsRequestSchema = z.object({ expectedVersion: PositiveVersionSchema, splits: z.array(z.object({ percentage: PositiveMoneySchema, servicePercentage: MoneySchema.default("0") })).min(2) });
export const RegisterPaymentRequestSchema = z.object({
  expectedVersion: PositiveVersionSchema, paymentMethodId: EntityIdSchema, accountSplitId: EntityIdSchema.nullable().optional(), amountApplied: PositiveMoneySchema,
  cashReceived: PositiveMoneySchema.optional(), cashSessionId: EntityIdSchema.nullable().optional(), reference: z.string().trim().min(1).max(150).nullable().optional(), notes: NotesSchema, printReceipt: z.boolean().default(true),
});
export const CashRegisterSchema = z.object({ id: EntityIdSchema, name: z.string(), active: z.boolean() });
export const CashSessionSchema = z.object({
  id: EntityIdSchema, cashRegisterId: EntityIdSchema, status: CashSessionStatusSchema, openingAmount: MoneySchema, expectedCash: MoneySchema.nullable(), countedCash: MoneySchema.nullable(), difference: MoneySchema.nullable(),
  openedByUserId: EntityIdSchema, openedAt: z.string().datetime(), closedAt: z.string().datetime().nullable(), version: PositiveVersionSchema,
});
export const OpenCashSessionRequestSchema = z.object({ cashRegisterId: EntityIdSchema, openingAmount: MoneySchema, notes: NotesSchema });
export const CashAdjustmentDirectionSchema = z.enum(["INCREASE", "DECREASE"]);
export const CashAdjustmentRequestSchema = z.object({ expectedVersion: PositiveVersionSchema, amount: PositiveMoneySchema, direction: CashAdjustmentDirectionSchema, reason: z.string().trim().min(1).max(2_000) });
export const CloseCashSessionRequestSchema = z.object({ expectedVersion: PositiveVersionSchema, countedCash: MoneySchema, notes: NotesSchema, printReceipt: z.boolean().default(true) });

export type PaymentSnapshot = z.infer<typeof PaymentSnapshotSchema>;
export type BillingSnapshot = z.infer<typeof BillingSnapshotSchema>;
export type RegisterPaymentRequest = z.infer<typeof RegisterPaymentRequestSchema>;
export type ApplyAccountDiscountRequest = z.infer<typeof ApplyAccountDiscountRequestSchema>;
export type ConfigureServiceRequest = z.infer<typeof ConfigureServiceRequestSchema>;
export type CreateItemSplitsRequest = z.infer<typeof CreateItemSplitsRequestSchema>;
export type CreatePercentageSplitsRequest = z.infer<typeof CreatePercentageSplitsRequestSchema>;
export type CashSession = z.infer<typeof CashSessionSchema>;
export type CashAdjustmentRequest = z.infer<typeof CashAdjustmentRequestSchema>;
export type OpenCashSessionRequest = z.infer<typeof OpenCashSessionRequestSchema>;
export type CloseCashSessionRequest = z.infer<typeof CloseCashSessionRequestSchema>;