import { z } from "zod";
import {
  CashRegisterListSchema,
  ExpenseListSchema,
  ExpenseSchema,
  PaymentMethodListSchema,
  PurchaseListSchema,
  PurchaseSchema,
  SupplierSchema,
  type ConfirmPurchaseRequest,
  type CreateExpenseRequest,
  type CreateSupplierRequest,
  type UpdateSupplierRequest,
  type VoidProcurementRequest,
} from "@don-juan/contracts";
import type { AuthContextValue } from "../auth/AuthProvider";

export type Supplier = z.infer<typeof SupplierSchema>;
export type Purchase = z.infer<typeof PurchaseSchema>;
export type Expense = z.infer<typeof ExpenseSchema>;
export type PaymentMethod = z.infer<typeof PaymentMethodListSchema>["paymentMethods"][number];
export type CashRegister = z.infer<typeof CashRegisterListSchema>["cashRegisters"][number];
type AuthClient = Pick<AuthContextValue, "authGet" | "authPost" | "authPut">;
const headers = () => ({ "idempotency-key": crypto.randomUUID() });

export interface ProcurementApi {
  getSuppliers(): Promise<Supplier[]>;
  createSupplier(input: CreateSupplierRequest): Promise<Supplier>;
  updateSupplier(id: string, input: UpdateSupplierRequest): Promise<Supplier>;
  getPurchases(): Promise<Purchase[]>;
  confirmPurchase(input: ConfirmPurchaseRequest): Promise<Purchase>;
  voidPurchase(id: string, input: VoidProcurementRequest): Promise<Purchase>;
  getExpenses(): Promise<Expense[]>;
  createExpense(input: CreateExpenseRequest): Promise<Expense>;
  voidExpense(id: string, input: VoidProcurementRequest): Promise<Expense>;
  getPaymentMethods(): Promise<PaymentMethod[]>;
  getCashRegisters(): Promise<CashRegister[]>;
}

export function createProcurementApi(auth: AuthClient): ProcurementApi {
  return {
    getSuppliers: () => auth.authGet("/suppliers", z.object({ suppliers: z.array(SupplierSchema) })).then((x) => x.suppliers),
    createSupplier: (input) => auth.authPost("/suppliers", SupplierSchema, input, headers()),
    updateSupplier: (id, input) => auth.authPut(`/suppliers/${id}`, SupplierSchema, input, headers()),
    getPurchases: () => auth.authGet("/purchases", PurchaseListSchema).then((x) => x.purchases),
    confirmPurchase: (input) => auth.authPost("/purchases", PurchaseSchema, input, headers()),
    voidPurchase: (id, input) => auth.authPost(`/purchases/${id}/void`, PurchaseSchema, input, headers()),
    getExpenses: () => auth.authGet("/expenses", ExpenseListSchema).then((x) => x.expenses),
    createExpense: (input) => auth.authPost("/expenses", ExpenseSchema, input, headers()),
    voidExpense: (id, input) => auth.authPost(`/expenses/${id}/void`, ExpenseSchema, input, headers()),
    getPaymentMethods: () => auth.authGet("/payment-methods", PaymentMethodListSchema).then((x) => x.paymentMethods),
    getCashRegisters: () => auth.authGet("/cash-registers", CashRegisterListSchema).then((x) => x.cashRegisters),
  };
}
