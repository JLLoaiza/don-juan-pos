# Coordinación del bug — Una mesa disponible pasa a ocupada al inspeccionarla

Registro append-only de hallazgos y handoffs entre agentes.

## 2026-09-10 00:00 — Analista Técnico — Diagnóstico y handoff backend

- **Tipo:** `HANDOFF`
- **Contexto:** Al inspeccionar una mesa disponible, `/floor` crea una cuenta borrador mediante `POST /accounts`; el servicio cambia la mesa a `OCCUPIED` antes de que exista pedido.
- **Evidencia:** `FloorPage.tsx`, `floorApi.ts`, `app.ts`, `floor.ts`, prueba de integración y `git blame` descritos en `analysis.md`.
- **Impacto:** Estado y reporte operativo de ocupación falsos hasta que la cuenta se pague o se confirme consumo.
- **Acción:** Implementar el plan diagnosticado y añadir regresión que separe apertura de cuenta de confirmación de pedido.
- **Responsable:** `Backend Developer`
- **Estado:** `OPEN`

## 2026-09-10 20:22 - Backend Developer - Implementacion entregada, integracion bloqueada

- **Tipo:** `BLOQUEO`
- **Contexto:** Se retiro la ocupacion de `openAccount` y se traslado a `confirmConsumption` tras completar sus efectos y antes de crear el resultado, dentro de la transaccion existente.
- **Evidencia:** La regresion exige `AVAILABLE` tras abrir la cuenta y mantiene `OCCUPIED` tras confirmar. Typecheck y `git diff --check` pasaron. La integracion no se ejecuto porque `DATABASE_URL_TEST` no esta configurada.
- **Impacto:** No se puede declarar la correccion backend verificada hasta ejecutar el caso contra PostgreSQL; el parche y la prueba estan listos para ello.
- **Accion:** Configurar una base de pruebas aislada en `DATABASE_URL_TEST`, ejecutar `pnpm --filter @don-juan/api test -- floor.integration.test.ts` y revisar el resultado/diff.
- **Responsable:** `Analista Tecnico / entorno de integracion`
- **Estado:** `OPEN`

## 2026-09-10 20:27 — Analista Técnico — Verificación independiente y resolución

- **Tipo:** `RESOLUCIÓN`
- **Contexto:** Se revisó el diff entregado: la transición se eliminó de `openAccount` y se realiza desde `confirmConsumption` dentro de su transacción. No hubo cambios de frontend, contratos, permisos ni migraciones.
- **Evidencia:** `DATABASE_URL_TEST=postgresql://postgres:postgres@localhost:5433/app pnpm --filter @don-juan/api test src/floor.integration.test.ts` pasó (1 archivo, 1 prueba); `pnpm --filter @don-juan/api typecheck` y `git diff --check` pasaron.
- **Impacto:** El estado persistido coincide con el pedido confirmado; el flujo de cuenta borrador e idempotencia conservan su comportamiento.
- **Acción:** Ninguna adicional para el alcance reportado.
- **Responsable:** `Analista Técnico`
- **Estado:** `RESOLVED`

## 2026-09-10 20:35 — Analista Técnico — Alcance frontend confirmado

- **Tipo:** `CAMBIO_DE_PLAN`
- **Contexto:** Tras la verificación backend, el usuario informó que el flujo sigue ocurriendo. La inspección de `FloorPage` todavía crea una cuenta vía `POST /accounts`, aunque el backend ya conserva `AVAILABLE` hasta confirmar consumo.
- **Evidencia:** `FloorPage.tsx` y la prueba «opens an account on an available table…» demuestran el comando emitido al clic; la integración backend pasó y descarta que ese comando cambie el estado de la mesa.
- **Impacto:** Se crean borradores involuntarios y se confunden inspección e inicio de pedido.
- **Acción:** Se generó `handoffs/frontend-prompt.md` para Claude con contratos, recuperación ante errores y pruebas requeridas.
- **Responsable:** `Claude (frontend)`
- **Estado:** `OPEN`
