import { z } from "zod";
import {
  ClockInRequestSchema, EmployeeBonusListSchema, EmployeeBonusSchema, EmployeeListSchema, EmployeePaymentListSchema, EmployeePaymentSchema,
  EmployeeSchema, EmployeeShiftListSchema, EmployeeShiftSchema, WageRateListSchema, WageRateSchema,
  type ClockInRequest, type ClockOutRequest, type CreateEmployeeBonusRequest, type CreateEmployeeRequest,
  type CreateWageRateRequest, type PayEmployeeShiftRequest, type UpdateEmployeeRequest, type VoidEmployeePaymentRequest,
} from "@don-juan/contracts";
import type { AuthContextValue } from "../auth/AuthProvider";

export type Employee = z.infer<typeof EmployeeSchema>;
export type WageRate = z.infer<typeof WageRateSchema>;
export type EmployeeShift = z.infer<typeof EmployeeShiftSchema>;
export type EmployeeBonus = z.infer<typeof EmployeeBonusSchema>;
export type EmployeePayment = z.infer<typeof EmployeePaymentSchema>;
type AuthClient = Pick<AuthContextValue, "authGet" | "authPost" | "authPut">;
const headers = () => ({ "idempotency-key": crypto.randomUUID() });

export interface WorkforceApi {
  getEmployees(): Promise<Employee[]>;
  createEmployee(input: CreateEmployeeRequest): Promise<Employee>;
  updateEmployee(id: string, input: UpdateEmployeeRequest): Promise<Employee>;
  getWageRates(employeeId: string): Promise<WageRate[]>;
  createWageRate(input: CreateWageRateRequest): Promise<WageRate>;
  getShifts(): Promise<EmployeeShift[]>;
  clockIn(input: ClockInRequest): Promise<EmployeeShift>;
  clockOut(id: string, input: ClockOutRequest): Promise<EmployeeShift>;
  getBonuses(): Promise<EmployeeBonus[]>;
  createBonus(input: CreateEmployeeBonusRequest): Promise<EmployeeBonus>;
  getPayments(): Promise<EmployeePayment[]>;
  payShift(shiftId: string, input: PayEmployeeShiftRequest): Promise<EmployeePayment>;
  voidPayment(id: string, input: VoidEmployeePaymentRequest): Promise<EmployeePayment>;
}

export function createWorkforceApi(auth: AuthClient): WorkforceApi {
  return {
    getEmployees: () => auth.authGet("/employees", EmployeeListSchema).then((x) => x.employees),
    createEmployee: (input) => auth.authPost("/employees", EmployeeSchema, input, headers()),
    updateEmployee: (id, input) => auth.authPut(`/employees/${id}`, EmployeeSchema, input, headers()),
    getWageRates: (employeeId) => auth.authGet(`/employees/${employeeId}/wage-rates`, WageRateListSchema).then((x) => x.wageRates),
    createWageRate: (input) => auth.authPost("/employee-wage-rates", WageRateSchema, input, headers()),
    getShifts: () => auth.authGet("/employee-shifts", EmployeeShiftListSchema).then((x) => x.shifts),
    clockIn: (input) => auth.authPost("/employee-shifts/clock-in", EmployeeShiftSchema, input, headers()),
    clockOut: (id, input) => auth.authPost(`/employee-shifts/${id}/clock-out`, EmployeeShiftSchema, input, headers()),
    getBonuses: () => auth.authGet("/employee-bonuses", EmployeeBonusListSchema).then((x) => x.bonuses),
    createBonus: (input) => auth.authPost("/employee-bonuses", EmployeeBonusSchema, input, headers()),
    getPayments: () => auth.authGet("/employee-payments", EmployeePaymentListSchema).then((x) => x.payments),
    payShift: (shiftId, input) => auth.authPost(`/employee-shifts/${shiftId}/payments`, EmployeePaymentSchema, input, headers()),
    voidPayment: (id, input) => auth.authPost(`/employee-payments/${id}/void`, EmployeePaymentSchema, input, headers()),
  };
}
