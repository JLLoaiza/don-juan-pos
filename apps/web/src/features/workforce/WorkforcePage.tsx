import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Banner, Button, EmptyState, ErrorState, LoadingState } from "@don-juan/ui";
import {
  CreateEmployeeBonusRequestSchema, CreateEmployeeRequestSchema, CreateWageRateRequestSchema, PayEmployeeShiftRequestSchema,
  UpdateEmployeeRequestSchema, VoidEmployeePaymentRequestSchema,
  type CreateEmployeeBonusRequest, type CreateWageRateRequest, type PayEmployeeShiftRequest,
} from "@don-juan/contracts";
import { ApiRequestError } from "../../lib/api/httpClient";
import { useAuth } from "../auth/useAuth";
import { formatMoney } from "../catalog/format";
import { hasPermission } from "../catalog/permissions";
import { commandErrorMessage } from "../shared/commandErrorMessage";
import { createProcurementApi, type CashRegister, type PaymentMethod } from "../procurement/procurementApi";
import { useWorkforce } from "./useWorkforce";
import type { Employee, EmployeeBonus, EmployeePayment, EmployeeShift, WageRate } from "./workforceApi";
import "../catalog/CatalogPage.css";

type Tab = "employees" | "shifts" | "bonuses" | "payments";
type EmployeeDraft = Employee | null | undefined;
type PaymentVoid = EmployeePayment | null;
const blankToNull = (value: string) => value.trim() || null;
const employeeName = (employee: Employee | undefined) => employee ? `${employee.firstName} ${employee.lastName}` : "Empleado";
const errorVariant = (error: unknown): "network" | "forbidden" | "server" => error instanceof ApiRequestError ? (error.kind === "network" ? "network" : error.status === 403 ? "forbidden" : "server") : "server";

function EmployeeForm({ employee, onDone, onCancel }: { employee: Employee | null; onDone: (input: unknown) => Promise<unknown>; onCancel: () => void }) {
  const [firstName, setFirstName] = useState(employee?.firstName ?? "");
  const [lastName, setLastName] = useState(employee?.lastName ?? "");
  const [documentNumber, setDocumentNumber] = useState(employee?.documentNumber ?? "");
  const [phone, setPhone] = useState(employee?.phone ?? "");
  const [email, setEmail] = useState(employee?.email ?? "");
  const [position, setPosition] = useState(employee?.position ?? "");
  const [notes, setNotes] = useState(employee?.notes ?? "");
  const [active, setActive] = useState(employee?.active ?? true);
  const [error, setError] = useState<string | null>(null); const [sending, setSending] = useState(false);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const body = { firstName, lastName, documentNumber: blankToNull(documentNumber), phone: blankToNull(phone), email: blankToNull(email), position: blankToNull(position), notes: blankToNull(notes), ...(employee ? { expectedVersion: employee.version, active } : {}) };
    const parsed = (employee ? UpdateEmployeeRequestSchema : CreateEmployeeRequestSchema).safeParse(body);
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? "Completa los datos requeridos."); return; }
    setSending(true); onDone(parsed.data).catch((cause) => { setError(commandErrorMessage(cause, "No se pudo guardar el empleado.")); setSending(false); });
  };
  return <form className="dj-catalog-form" onSubmit={submit}><h3>{employee ? "Editar empleado" : "Nuevo empleado"}</h3>{error ? <Banner tone="danger" title={error} /> : null}
    <label className="dj-catalog-form__field"><span>Nombres</span><input value={firstName} onChange={(e) => setFirstName(e.target.value)} required /></label>
    <label className="dj-catalog-form__field"><span>Apellidos</span><input value={lastName} onChange={(e) => setLastName(e.target.value)} required /></label>
    <label className="dj-catalog-form__field"><span>Documento</span><input value={documentNumber} onChange={(e) => setDocumentNumber(e.target.value)} /></label>
    <label className="dj-catalog-form__field"><span>Teléfono</span><input value={phone} onChange={(e) => setPhone(e.target.value)} /></label>
    <label className="dj-catalog-form__field"><span>Correo</span><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
    <label className="dj-catalog-form__field"><span>Cargo</span><input value={position} onChange={(e) => setPosition(e.target.value)} /></label>
    <label className="dj-catalog-form__field"><span>Notas</span><textarea value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
    {employee ? <label className="dj-catalog-form__checkbox"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /><span>Empleado activo</span></label> : null}
    <div className="dj-catalog-form__actions"><Button type="submit" disabled={sending}>{sending ? "Guardando…" : "Guardar"}</Button><Button type="button" variant="secondary" onClick={onCancel}>Cancelar</Button></div>
  </form>;
}

function WageRateForm({ employees, onDone, onCancel }: { employees: Employee[]; onDone: (input: CreateWageRateRequest) => Promise<unknown>; onCancel: () => void }) {
  const [employeeId, setEmployeeId] = useState(""); const [startTime, setStartTime] = useState("08:00"); const [endTime, setEndTime] = useState("17:00");
  const [hourlyRate, setHourlyRate] = useState(""); const [effectiveFrom, setEffectiveFrom] = useState(new Date().toISOString().slice(0, 10)); const [error, setError] = useState<string | null>(null); const [sending, setSending] = useState(false);
  const submit = (event: FormEvent) => { event.preventDefault(); const parsed = CreateWageRateRequestSchema.safeParse({ employeeId, startTime, endTime, hourlyRate, effectiveFrom, effectiveTo: null }); if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? "Datos de tarifa inválidos."); return; } setSending(true); onDone(parsed.data).catch((cause) => { setError(commandErrorMessage(cause, "No se pudo registrar la tarifa.")); setSending(false); }); };
  return <form className="dj-catalog-form" onSubmit={submit}><h3>Nueva tarifa por hora</h3>{error ? <Banner tone="danger" title={error} /> : null}
    <label className="dj-catalog-form__field"><span>Empleado</span><select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} required><option value="">Selecciona un empleado</option>{employees.filter((x) => x.active).map((x) => <option key={x.id} value={x.id}>{employeeName(x)}</option>)}</select></label>
    <label className="dj-catalog-form__field"><span>Inicio</span><input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} required /></label>
    <label className="dj-catalog-form__field"><span>Fin</span><input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} required /></label>
    <label className="dj-catalog-form__field"><span>Valor por hora</span><input inputMode="decimal" value={hourlyRate} onChange={(e) => setHourlyRate(e.target.value)} required /></label>
    <label className="dj-catalog-form__field"><span>Vigente desde</span><input type="date" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} required /></label>
    <div className="dj-catalog-form__actions"><Button type="submit" disabled={sending}>{sending ? "Guardando…" : "Guardar tarifa"}</Button><Button type="button" variant="secondary" onClick={onCancel}>Cancelar</Button></div>
  </form>;
}

function BonusForm({ employees, shifts, onDone, onCancel }: { employees: Employee[]; shifts: EmployeeShift[]; onDone: (input: CreateEmployeeBonusRequest) => Promise<unknown>; onCancel: () => void }) {
  const [employeeId, setEmployeeId] = useState(""); const [shiftId, setShiftId] = useState(""); const [amount, setAmount] = useState(""); const [comments, setComments] = useState(""); const [error, setError] = useState<string | null>(null); const [sending, setSending] = useState(false);
  const employeeShifts = shifts.filter((x) => x.employeeId === employeeId);
  const submit = (event: FormEvent) => { event.preventDefault(); const parsed = CreateEmployeeBonusRequestSchema.safeParse({ employeeId, shiftId: shiftId || null, amount, comments: blankToNull(comments) }); if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? "Datos de bono inválidos."); return; } setSending(true); onDone(parsed.data).catch((cause) => { setError(commandErrorMessage(cause, "No se pudo registrar el bono.")); setSending(false); }); };
  return <form className="dj-catalog-form" onSubmit={submit}><h3>Registrar bono</h3>{error ? <Banner tone="danger" title={error} /> : null}
    <label className="dj-catalog-form__field"><span>Empleado</span><select value={employeeId} onChange={(e) => { setEmployeeId(e.target.value); setShiftId(""); }} required><option value="">Selecciona un empleado</option>{employees.filter((x) => x.active).map((x) => <option key={x.id} value={x.id}>{employeeName(x)}</option>)}</select></label>
    <label className="dj-catalog-form__field"><span>Turno relacionado</span><select value={shiftId} onChange={(e) => setShiftId(e.target.value)}><option value="">Sin turno específico</option>{employeeShifts.map((x) => <option key={x.id} value={x.id}>{x.workDate} · {x.status}</option>)}</select></label>
    <label className="dj-catalog-form__field"><span>Monto</span><input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} required /></label>
    <label className="dj-catalog-form__field"><span>Comentarios</span><textarea value={comments} onChange={(e) => setComments(e.target.value)} /></label>
    <div className="dj-catalog-form__actions"><Button type="submit" disabled={sending}>{sending ? "Guardando…" : "Registrar bono"}</Button><Button type="button" variant="secondary" onClick={onCancel}>Cancelar</Button></div>
  </form>;
}

function PaymentForm({ employees, shifts, bonuses, methods, registers, onDone, onCancel }: { employees: Employee[]; shifts: EmployeeShift[]; bonuses: EmployeeBonus[]; methods: PaymentMethod[]; registers: CashRegister[]; onDone: (shiftId: string, input: PayEmployeeShiftRequest) => Promise<unknown>; onCancel: () => void }) {
  const [shiftId, setShiftId] = useState(""); const [methodId, setMethodId] = useState(""); const [cashSessionId, setCashSessionId] = useState(""); const [selectedBonuses, setSelectedBonuses] = useState<string[]>([]); const [notes, setNotes] = useState(""); const [error, setError] = useState<string | null>(null); const [sending, setSending] = useState(false);
  const shift = shifts.find((x) => x.id === shiftId); const method = methods.find((x) => x.id === methodId); const openSessions = registers.filter((x) => x.openSession).map((x) => ({ id: x.openSession!.id, name: x.name }));
  const availableBonuses = shift ? bonuses.filter((x) => !x.paid && x.employeeId === shift.employeeId && (!x.shiftId || x.shiftId === shift.id)) : [];
  const submit = (event: FormEvent) => { event.preventDefault(); if (!shift) { setError("Selecciona un turno terminado."); return; } const parsed = PayEmployeeShiftRequestSchema.safeParse({ bonusIds: selectedBonuses, paymentMethodId: methodId || null, cashSessionId: method?.type === "CASH" ? cashSessionId || null : null, notes: blankToNull(notes) }); if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? "Datos de pago inválidos."); return; } setSending(true); onDone(shift.id, parsed.data).catch((cause) => { setError(commandErrorMessage(cause, "No se pudo registrar el pago.")); setSending(false); }); };
  return <form className="dj-catalog-form" onSubmit={submit}><h3>Pagar turno</h3>{error ? <Banner tone="danger" title={error} /> : null}<Banner tone="info" title="El servidor calcula el valor del turno y los bonos." description="Esta pantalla no calcula ni modifica valores de nómina." />
    <label className="dj-catalog-form__field"><span>Turno terminado</span><select value={shiftId} onChange={(e) => { setShiftId(e.target.value); setSelectedBonuses([]); }} required><option value="">Selecciona un turno</option>{shifts.filter((x) => x.status === "COMPLETED").map((x) => <option key={x.id} value={x.id}>{employeeName(employees.find((y) => y.id === x.employeeId))} · {x.workDate}</option>)}</select></label>
    <label className="dj-catalog-form__field"><span>Método de pago</span><select value={methodId} onChange={(e) => { setMethodId(e.target.value); setCashSessionId(""); }}><option value="">Sin método registrado</option>{methods.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
    {method?.type === "CASH" ? <label className="dj-catalog-form__field"><span>Caja abierta</span><select value={cashSessionId} onChange={(e) => setCashSessionId(e.target.value)}><option value="">Selecciona una caja</option>{openSessions.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label> : null}
    {availableBonuses.length > 0 ? <fieldset className="dj-catalog-form__components"><legend>Bonos por incluir</legend>{availableBonuses.map((x) => <label key={x.id} className="dj-catalog-form__checkbox"><input type="checkbox" checked={selectedBonuses.includes(x.id)} onChange={(e) => setSelectedBonuses((prev) => e.target.checked ? [...prev, x.id] : prev.filter((id) => id !== x.id))} /><span>{formatMoney(x.amount)} · {x.comments ?? "Sin comentario"}</span></label>)}</fieldset> : null}
    <label className="dj-catalog-form__field"><span>Notas</span><textarea value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
    <div className="dj-catalog-form__actions"><Button type="submit" disabled={sending}>{sending ? "Registrando…" : "Registrar pago"}</Button><Button type="button" variant="secondary" onClick={onCancel}>Cancelar</Button></div>
  </form>;
}

function VoidPaymentForm({ payment, onCancel, onDone }: { payment: EmployeePayment; onCancel: () => void; onDone: (reason: string) => Promise<unknown> }) {
  const [reason, setReason] = useState(""); const [confirmed, setConfirmed] = useState(false); const [error, setError] = useState<string | null>(null); const [sending, setSending] = useState(false);
  const submit = (event: FormEvent) => { event.preventDefault(); const parsed = VoidEmployeePaymentRequestSchema.safeParse({ reason }); if (!parsed.success) { setError("Indica el motivo de la anulación."); return; } setSending(true); onDone(parsed.data.reason).catch((cause) => { setError(commandErrorMessage(cause, "No se pudo anular el pago.")); setSending(false); }); };
  return <form className="dj-catalog-form" onSubmit={submit}><h3>Anular pago de empleado</h3><Banner tone="warning" title="Esta acción conserva el pago original." description="El backend registra la reversión correspondiente; no es una edición silenciosa." />{error ? <Banner tone="danger" title={error} /> : null}
    <p>{formatMoney(payment.totalAmount)} · {payment.paymentDate}</p><label className="dj-catalog-form__field"><span>Motivo</span><textarea value={reason} onChange={(e) => setReason(e.target.value)} /></label><label className="dj-catalog-form__checkbox"><input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} /><span>Confirmo la anulación del pago.</span></label>
    <div className="dj-catalog-form__actions"><Button type="submit" disabled={!confirmed || sending}>{sending ? "Anulando…" : "Confirmar anulación"}</Button><Button type="button" variant="secondary" onClick={onCancel}>Cancelar</Button></div>
  </form>;
}

export function WorkforcePage() {
  const auth = useAuth(); const { status, employees, shifts, bonuses, payments, error, api, reload } = useWorkforce();
  const procurementApi = useMemo(() => createProcurementApi(auth), [auth]); const permissions = auth.context?.permissions ?? [];
  const [tab, setTab] = useState<Tab>("employees"); const [employeeForm, setEmployeeForm] = useState<EmployeeDraft>(); const [rateForm, setRateForm] = useState(false); const [bonusForm, setBonusForm] = useState(false); const [paymentForm, setPaymentForm] = useState(false); const [voidPayment, setVoidPayment] = useState<PaymentVoid>(null);
  const [rates, setRates] = useState<WageRate[]>([]); const [methods, setMethods] = useState<PaymentMethod[]>([]); const [registers, setRegisters] = useState<CashRegister[]>([]);
  const [clockOutError, setClockOutError] = useState<string | null>(null);
  const afterMutation = () => { setEmployeeForm(undefined); setRateForm(false); setBonusForm(false); setPaymentForm(false); setVoidPayment(null); reload(); };
  const clockOut = (shiftId: string) => { setClockOutError(null); api.clockOut(shiftId, {}).then(afterMutation).catch((cause) => setClockOutError(commandErrorMessage(cause, "No se pudo registrar la salida."))); };
  useEffect(() => { if (tab !== "payments" || !paymentForm) return; procurementApi.getPaymentMethods().then(setMethods).catch(() => setMethods([])); procurementApi.getCashRegisters().then(setRegisters).catch(() => setRegisters([])); }, [tab, paymentForm, procurementApi]);
  useEffect(() => { if (tab !== "employees" || !rateForm) return; Promise.all((employees ?? []).filter((x) => x.active).map((x) => api.getWageRates(x.id))).then((all) => setRates(all.flat())).catch(() => setRates([])); }, [tab, rateForm, employees, api]);
  if (status === "loading") return <LoadingState label="Cargando personal…" />;
  if (status === "error" || !employees || !shifts || !bonuses || !payments) return <ErrorState variant={errorVariant(error)} {...(errorVariant(error) === "forbidden" ? { description: "Tu usuario no tiene los permisos de consulta requeridos." } : {})} onRetry={reload} />;
  return <section className="dj-catalog" aria-labelledby="workforce-title"><h1 id="workforce-title">Personal</h1><nav className="dj-catalog__tabs" aria-label="Secciones de personal">
    <button className={`dj-catalog__tab${tab === "employees" ? " dj-catalog__tab--active" : ""}`} onClick={() => setTab("employees")}>Empleados</button>
    <button className={`dj-catalog__tab${tab === "shifts" ? " dj-catalog__tab--active" : ""}`} onClick={() => setTab("shifts")}>Turnos</button>
    <button className={`dj-catalog__tab${tab === "bonuses" ? " dj-catalog__tab--active" : ""}`} onClick={() => setTab("bonuses")}>Bonos</button>
    <button className={`dj-catalog__tab${tab === "payments" ? " dj-catalog__tab--active" : ""}`} onClick={() => setTab("payments")}>Pagos</button>
  </nav>
  {tab === "employees" ? <div className="dj-catalog-section"><div className="dj-catalog-section__toolbar">{hasPermission(permissions, "employees.create") ? <Button onClick={() => setEmployeeForm(null)}>Nuevo empleado</Button> : null}{hasPermission(permissions, "employees.manage_rates") ? <Button variant="secondary" onClick={() => setRateForm(true)}>Nueva tarifa</Button> : null}</div>
    {employeeForm !== undefined ? <EmployeeForm employee={employeeForm} onCancel={() => setEmployeeForm(undefined)} onDone={(input) => employeeForm ? api.updateEmployee(employeeForm.id, input as Parameters<typeof api.updateEmployee>[1]).then(afterMutation) : api.createEmployee(input as Parameters<typeof api.createEmployee>[0]).then(afterMutation)} /> : null}
    {rateForm ? <><WageRateForm employees={employees} onCancel={() => setRateForm(false)} onDone={(input) => api.createWageRate(input).then(afterMutation)} />{rates.length > 0 ? <table className="dj-catalog-table"><thead><tr><th>Empleado</th><th>Horario</th><th>Valor/hora</th><th>Vigente desde</th></tr></thead><tbody>{rates.map((x) => <tr key={x.id}><td>{employeeName(employees.find((y) => y.id === x.employeeId))}</td><td>{x.startTime}–{x.endTime}</td><td>{formatMoney(x.hourlyRate)}</td><td>{x.effectiveFrom}</td></tr>)}</tbody></table> : null}</> : null}
    {employees.length === 0 ? <EmptyState title="Sin empleados" description="Crea empleados para registrar turnos, bonos y pagos." /> : <table className="dj-catalog-table"><thead><tr><th>Nombre</th><th>Cargo</th><th>Contacto</th><th>Activo</th><th /></tr></thead><tbody>{employees.map((x) => <tr key={x.id}><td>{employeeName(x)}</td><td>{x.position ?? "—"}</td><td>{x.phone ?? x.email ?? "—"}</td><td>{x.active ? "Sí" : "No"}</td><td>{hasPermission(permissions, "employees.update") ? <button type="button" onClick={() => setEmployeeForm(x)}>Editar</button> : null}</td></tr>)}</tbody></table>}</div> : null}
  {tab === "shifts" ? <div className="dj-catalog-section"><div className="dj-catalog-section__toolbar">{hasPermission(permissions, "employees.create_shift") ? <ClockInControl employees={employees} onClockIn={(employeeId) => api.clockIn({ employeeId }).then(afterMutation)} /> : null}</div>{clockOutError ? <Banner tone="danger" title={clockOutError} /> : null}{shifts.length === 0 ? <EmptyState title="Sin turnos" description="Registra la entrada para iniciar un turno." /> : <table className="dj-catalog-table"><thead><tr><th>Empleado</th><th>Fecha</th><th>Entrada</th><th>Salida</th><th>Estado</th><th /></tr></thead><tbody>{shifts.map((x) => <tr key={x.id}><td>{employeeName(employees.find((y) => y.id === x.employeeId))}</td><td>{x.workDate}</td><td>{new Date(x.clockIn).toLocaleTimeString()}</td><td>{x.clockOut ? new Date(x.clockOut).toLocaleTimeString() : "—"}</td><td>{x.status}</td><td>{x.status === "OPEN" && hasPermission(permissions, "employees.complete_shift") ? <button type="button" onClick={() => clockOut(x.id)}>Registrar salida</button> : null}</td></tr>)}</tbody></table>}</div> : null}
  {tab === "bonuses" ? <div className="dj-catalog-section"><div className="dj-catalog-section__toolbar">{hasPermission(permissions, "employees.create_bonus") ? <Button onClick={() => setBonusForm(true)}>Registrar bono</Button> : null}</div>{bonusForm ? <BonusForm employees={employees} shifts={shifts} onCancel={() => setBonusForm(false)} onDone={(input) => api.createBonus(input).then(afterMutation)} /> : null}{bonuses.length === 0 ? <EmptyState title="Sin bonos" description="No hay bonos registrados en esta sucursal." /> : <table className="dj-catalog-table"><thead><tr><th>Empleado</th><th>Fecha</th><th>Monto</th><th>Estado</th><th>Comentario</th></tr></thead><tbody>{bonuses.map((x) => <tr key={x.id}><td>{employeeName(employees.find((y) => y.id === x.employeeId))}</td><td>{x.bonusDate}</td><td>{formatMoney(x.amount)}</td><td>{x.paid ? "Pagado" : "Pendiente"}</td><td>{x.comments ?? "—"}</td></tr>)}</tbody></table>}</div> : null}
  {tab === "payments" ? <div className="dj-catalog-section"><div className="dj-catalog-section__toolbar">{hasPermission(permissions, "employees.pay") ? <Button onClick={() => setPaymentForm(true)}>Pagar turno</Button> : null}</div>{paymentForm ? <PaymentForm employees={employees} shifts={shifts} bonuses={bonuses} methods={methods} registers={registers} onCancel={() => setPaymentForm(false)} onDone={(shiftId, input) => api.payShift(shiftId, input).then(afterMutation)} /> : null}{voidPayment ? <VoidPaymentForm payment={voidPayment} onCancel={() => setVoidPayment(null)} onDone={(reason) => api.voidPayment(voidPayment.id, { reason }).then(afterMutation)} /> : null}{payments.length === 0 ? <EmptyState title="Sin pagos" description="Los pagos confirmados aparecerán aquí." /> : <table className="dj-catalog-table"><thead><tr><th>Empleado</th><th>Fecha</th><th>Total</th><th>Método</th><th>Estado</th><th /></tr></thead><tbody>{payments.map((x) => <tr key={x.id}><td>{employeeName(employees.find((y) => y.id === x.employeeId))}</td><td>{x.paymentDate}</td><td>{formatMoney(x.totalAmount)}</td><td>{x.paymentMethodType ?? "—"}</td><td>{x.status}</td><td>{x.status === "CONFIRMED" && hasPermission(permissions, "employees.void_payment") ? <button type="button" onClick={() => setVoidPayment(x)}>Anular</button> : null}</td></tr>)}</tbody></table>}</div> : null}
  </section>;
}

function ClockInControl({ employees, onClockIn }: { employees: Employee[]; onClockIn: (employeeId: string) => Promise<unknown> }) {
  const [employeeId, setEmployeeId] = useState(""); const [error, setError] = useState<string | null>(null); const [sending, setSending] = useState(false);
  const submit = (event: FormEvent) => { event.preventDefault(); if (!employeeId) { setError("Selecciona un empleado."); return; } setSending(true); onClockIn(employeeId).catch((cause) => { setError(commandErrorMessage(cause, "No se pudo registrar la entrada.")); setSending(false); }); };
  return <form className="dj-catalog-form" onSubmit={submit}><h3>Registrar entrada</h3>{error ? <Banner tone="danger" title={error} /> : null}<p>La hora se registra en el servidor.</p><label className="dj-catalog-form__field"><span>Empleado</span><select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}><option value="">Selecciona un empleado</option>{employees.filter((x) => x.active).map((x) => <option key={x.id} value={x.id}>{employeeName(x)}</option>)}</select></label><div className="dj-catalog-form__actions"><Button type="submit" disabled={sending}>{sending ? "Registrando…" : "Registrar entrada"}</Button></div></form>;
}
