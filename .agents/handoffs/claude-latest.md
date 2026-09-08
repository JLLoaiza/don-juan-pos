# Handoff — Claude (frontend)

## Fase realizada

Fase 5 — Compras, gastos, Kardex y personal (frontend). Estado: **COMPLETE**, verificado en vivo end-to-end contra API + PostgreSQL reales, incluida la corrección backend de fechas de personal (`0025_workforce_date_response_repair.sql`). No se avanza a Fase 6.

## Rutas consumidas (todas reales, ninguna mockeada)

Compras/gastos: `GET/POST /suppliers`, `PUT /suppliers/:id`, `GET/POST /purchases`, `POST /purchases/:id/void`, `GET/POST /expenses`, `POST /expenses/:id/void`, más `GET /catalog` (para el selector de ítems), `GET /catalog/inventory-movements` (Kardex), `GET /payment-methods` y `GET /cash-registers` (Fase 4, reutilizadas).

Personal: `GET/POST /employees`, `PUT /employees/:id`, `GET /employees/:id/wage-rates`, `POST /employee-wage-rates`, `GET /employee-shifts`, `POST /employee-shifts/clock-in`, `POST /employee-shifts/:id/clock-out`, `GET/POST /employee-bonuses`, `GET /employee-payments`, `POST /employee-shifts/:id/payments`, `POST /employee-payments/:id/void`.

## Pantallas

- `/procurement` (`apps/web/src/features/procurement/`): pestañas Compras/Gastos/Proveedores/Kardex. Confirmar compra construye líneas de inventario con costo unitario; anulación de compra/gasto exige motivo y confirmación explícita.
- `/workforce` (`apps/web/src/features/workforce/`): pestañas Empleados/Turnos/Bonos/Pagos. Alta/edición de empleado, tarifas por hora, marcar entrada/salida, registrar bono, pagar turno (con selección de bonos pendientes) y anular pago.

Reglas ya establecidas en Fase 4 se mantienen: sucursal siempre derivada de sesión (nunca `companyId`/`branchId`), selectores por nombre, `Idempotency-Key` en toda mutación, invalidación al cambiar sucursal, backend como autoridad de montos/costo/nómina.

## Dos bugs propios corregidos durante la verificación en vivo (no de contrato ni backend)

1. **`ProcurementPage.tsx`**: el selector de ítems de la compra no filtraba por `active`, a diferencia del patrón ya establecido en `ProductComponentsEditor.tsx`/`InventoryComponentsEditor.tsx`. Un ítem desactivado era seleccionable pero el backend lo rechazaba con 422. Corregido filtrando a ítems activos.
2. **`WorkforcePage.tsx`**: el botón "Registrar salida" no manejaba el rechazo de `clockOut` (promesa sin `.catch`), dejando al cajero sin ningún aviso ante un turno sin cobertura completa de tarifa. Corregido con manejo de error explícito (`Banner`) y prueba nueva en `WorkforcePage.test.tsx`.

## Bug de backend encontrado, documentado y ya corregido (no lo toqué yo)

Reporté en `.agents/coordination.md` un bug sistemático en `apps/api/src/workforce.ts`: toda columna `DATE` (tarifas, turnos, bonos, pagos) se guardaba bien en PostgreSQL pero la respuesta HTTP siempre fallaba con 400 porque `node-postgres` devuelve `DATE` como `Date` de JS y el mapper hacía `String(...).slice(0,10)`. El usuario lo resolvió directamente (función `dateOnly()` + migración `0025` que sanea el ledger de idempotencia histórico). Verifiqué en vivo tras el fix que las cuatro rutas afectadas responden `200` correctamente.

## Tests y verificación

`pnpm -w typecheck`: correcto. `pnpm --filter @don-juan/web test`: **148/148** (incluye la prueba nueva del bug de `clockOut`). Verificación en vivo completa: proveedor → compra confirmada (Kardex actualizado, costo promedio recalculado) → anulación de compra → gasto confirmado → alta de empleado → tarifa por hora → marcar entrada → marcar salida (rechazada sin cobertura, luego exitosa) → bono → pago de turno con bono incluido (total calculado por servidor) → anulación de pago.

## Lo que no se tocó

`apps/api/**`, `packages/contracts/src/procurement.ts`, `packages/contracts/src/workforce.ts`, `packages/contracts/src/sync.ts` y las migraciones nuevas son trabajo de Codex; no los commiteo desde este handoff — quedan para que Codex los confirme en su propio commit.

## Siguiente fase frontend esperada

Ninguna todavía. Fase 6 (sincronización Edge) tiene un primer slice de backend (`PARTIAL`); frontend no la retoma en este ciclo.
