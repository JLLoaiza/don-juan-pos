import { z } from "zod";
import { NonNegativeDecimalStringSchema, PositiveDecimalStringSchema } from "./catalog.js";

const Id = z.string().uuid();
const Notes = z.string().max(10_000).nullable().optional();
const DateTime = z.string().datetime().optional();
const DateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const TimeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/);
const PaymentMethodTypeSchema = z.enum(["CASH", "CARD", "QR"]);

export const EmployeeSchema = z.object({ id: Id, firstName: z.string(), lastName: z.string(), documentNumber: z.string().nullable(), phone: z.string().nullable(), email: z.string().nullable(), position: z.string().nullable(), notes: z.string().nullable(), active: z.boolean(), version: z.number().int().positive() });
export const EmployeeListSchema = z.object({ employees: z.array(EmployeeSchema) });
export const CreateEmployeeRequestSchema = z.object({ firstName: z.string().trim().min(1).max(100), lastName: z.string().trim().min(1).max(100), documentNumber: z.string().trim().max(50).nullable().optional(), phone: z.string().trim().max(50).nullable().optional(), email: z.string().trim().email().max(150).nullable().optional(), position: z.string().trim().max(100).nullable().optional(), notes: Notes });
export const UpdateEmployeeRequestSchema = CreateEmployeeRequestSchema.extend({ expectedVersion: z.number().int().positive(), active: z.boolean() });

export const WageRateSchema = z.object({ id: Id, employeeId: Id, startTime: TimeSchema, endTime: TimeSchema, hourlyRate: NonNegativeDecimalStringSchema, effectiveFrom: DateSchema, effectiveTo: DateSchema.nullable(), active: z.boolean() });
export const WageRateListSchema = z.object({ wageRates: z.array(WageRateSchema) });
export const CreateWageRateRequestSchema = z.object({ employeeId: Id, startTime: TimeSchema, endTime: TimeSchema, hourlyRate: NonNegativeDecimalStringSchema, effectiveFrom: DateSchema, effectiveTo: DateSchema.nullable().optional() }).refine((value) => value.startTime !== value.endTime, "The wage range must have duration");

export const EmployeeShiftSchema = z.object({ id: Id, employeeId: Id, workDate: DateSchema, clockIn: z.string().datetime(), clockOut: z.string().datetime().nullable(), regularHours: NonNegativeDecimalStringSchema, calculatedPay: NonNegativeDecimalStringSchema, status: z.enum(["OPEN", "COMPLETED", "CANCELLED"]), notes: z.string().nullable(), wageCalculationSnapshot: z.record(z.string(), z.unknown()).nullable() });
export const EmployeeShiftListSchema = z.object({ shifts: z.array(EmployeeShiftSchema) });
export const ClockInRequestSchema = z.object({ employeeId: Id, clockIn: DateTime, notes: Notes });
export const ClockOutRequestSchema = z.object({ clockOut: DateTime });

export const EmployeeBonusSchema = z.object({ id: Id, employeeId: Id, shiftId: Id.nullable(), bonusDate: DateSchema, amount: PositiveDecimalStringSchema, comments: z.string().nullable(), paid: z.boolean() });
export const CreateEmployeeBonusRequestSchema = z.object({ employeeId: Id, shiftId: Id.nullable().optional(), bonusDate: DateSchema.optional(), amount: PositiveDecimalStringSchema, comments: Notes });
export const EmployeeBonusListSchema = z.object({ bonuses: z.array(EmployeeBonusSchema) });

export const EmployeePaymentSchema = z.object({ id: Id, employeeId: Id, shiftId: Id, paymentDate: DateSchema, baseAmount: NonNegativeDecimalStringSchema, bonusAmount: NonNegativeDecimalStringSchema, totalAmount: NonNegativeDecimalStringSchema, paymentMethodId: Id.nullable(), paymentMethodType: PaymentMethodTypeSchema.nullable(), cashSessionId: Id.nullable(), status: z.enum(["CONFIRMED", "VOID"]), notes: z.string().nullable(), createdAt: z.string().datetime() });
export const EmployeePaymentListSchema = z.object({ payments: z.array(EmployeePaymentSchema) });
export const VoidEmployeePaymentRequestSchema = z.object({ reason: z.string().trim().min(1).max(2_000) });
export const PayEmployeeShiftRequestSchema = z.object({ bonusIds: z.array(Id).default([]), paymentMethodId: Id.nullable().optional(), cashSessionId: Id.nullable().optional(), notes: Notes });

export type CreateEmployeeRequest = z.infer<typeof CreateEmployeeRequestSchema>;
export type UpdateEmployeeRequest = z.infer<typeof UpdateEmployeeRequestSchema>;
export type CreateWageRateRequest = z.infer<typeof CreateWageRateRequestSchema>;
export type ClockInRequest = z.infer<typeof ClockInRequestSchema>;
export type ClockOutRequest = z.infer<typeof ClockOutRequestSchema>;
export type CreateEmployeeBonusRequest = z.infer<typeof CreateEmployeeBonusRequestSchema>;
export type VoidEmployeePaymentRequest = z.infer<typeof VoidEmployeePaymentRequestSchema>;
export type PayEmployeeShiftRequest = z.infer<typeof PayEmployeeShiftRequestSchema>;
