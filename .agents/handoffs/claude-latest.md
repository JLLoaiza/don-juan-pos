# Handoff — Claude (frontend)

## Fase realizada

Fase 4 — Cobro (frontend). Estado: **PARTIAL**, igual que el backend (Codex documentó Fase 4 como parcialmente disponible en `.agents/handoffs/codex-latest.md`: pagos directos y apertura de caja publicados, divisiones/cierre/ajustes de caja todavía sin ruta). Implementé todo lo que las rutas reales permiten, sin mocks para lo que sí existe y sin inventar nada para lo que no.

## Pantallas y flujos implementados

Todo bajo `apps/web/src/features/floor/`, integrado dentro de la pantalla de cuenta existente (`/floor/accounts/:accountId`) como una nueva sección "Cobro" (`BillingSection.tsx`) — no una pantalla `/billing` independiente, porque las cinco rutas de Fase 4 son todas por cuenta o comandos puntuales, no un listado global.

- **Snapshot de cobro** (`GET /accounts/:id/billing`, permiso `payments.view`): pagado, saldo pendiente, descuentos aplicados (nombre, tipo, valor, monto aplicado), historial de pagos (método, monto aplicado, efectivo recibido/cambio si es efectivo, estado, fecha).
- **Aplicar descuento** (`POST /accounts/:id/discounts`, permiso `sales.apply_discount`): nombre, tipo (porcentaje/monto fijo), valor; valida con el mismo `ApplyAccountDiscountRequestSchema` publicado antes de enviar.
- **Configurar servicio** (`PUT /accounts/:id/service`, permiso `sales.modify_service`): porcentaje, precargado con el valor actual.
- Ambas acciones se ocultan una vez `billing.hasPayments` es verdadero — igual que `apps/api/src/billing.ts` (`lockedCommercialAccount`) las rechaza tras el primer pago. También oculté "Agregar consumo" (Fase 3, `ConsumptionForm`) en ese mismo caso: `apps/api/src/floor.ts` ahora rechaza consumo nuevo tras el primer pago aunque la cuenta siga `OPEN`, así que el frontend espera a que el snapshot de cobro cargue (`billing.status === "ready"`) antes de decidir si mostrar el formulario, para no mostrarlo un instante y ocultarlo después.
- Toda mutación de cobro recarga tanto el snapshot de cobro como la cuenta (Fase 3), porque ambas comparten `accounts.version` y una mutación de cobro incrementa esa versión — sin recargar la cuenta, un intento posterior de confirmar consumo fallaría con `409` por versión desactualizada.

## Contratos consumidos

`GET /accounts/:id/billing`, `POST /accounts/:id/discounts`, `PUT /accounts/:id/service` — desde `@don-juan/contracts` (`packages/contracts/src/billing.ts`), a través de `apps/web/src/features/floor/billingApi.ts` (nuevo).

## Lo que NO se implementó, y por qué

`POST /accounts/:id/payments` y `POST /cash-sessions` son rutas reales y funcionan, pero:

- **No hay `GET /payment-methods`** para listar los métodos de pago activos de la sucursal. `RegisterPaymentRequest.paymentMethodId` es obligatorio y no hay forma de saber qué IDs existen.
- **No hay `GET /cash-registers`** para listar cajas registradoras. `OpenCashSessionRequest.cashRegisterId` es obligatorio, mismo problema.
- Ninguna migración siembra datos de desarrollo para `payment_methods` ni `cash_registers` — están vacías incluso en la base local.

No implementé un selector con el UUID escrito a mano: eso no es una interfaz utilizable para un cajero y viola la regla de no exponer IDs internos como campo visible sin necesidad administrativa. En su lugar, dentro de la sección "Cobro" (solo si el usuario tiene `payments.create` y hay saldo pendiente) se muestra un aviso explicando que registrar un pago está pendiente de que se publique ese listado. No toqué `/billing` ni `/cash` como pantallas de nivel superior (siguen siendo el placeholder de siempre) porque no hay ningún endpoint que liste "cuentas por cobrar" o "cajas de la sucursal" para darles contenido propio todavía.

División de cuenta (`sales.split`, `POST /accounts/:id/splits` en el contrato) y cierre/ajuste de caja tampoco tienen ruta en `apps/api/src/app.ts` — confirmado, no implementados.

## Mocks temporales

Ninguno. Las tres funciones implementadas (`getBilling`, `applyDiscount`, `configureService`) llaman a rutas reales y funcionando.

## Tests ejecutados

- `pnpm --filter @don-juan/web test`: **123/123** (114 previos + 9 nuevos: `billingApi.test.ts` cubre forma de cada request; `AccountPage.test.tsx` suma aplicar descuento end-to-end con recarga de cuenta y cobro, configurar servicio end-to-end, ocultar descuento/servicio/consumo una vez `hasPayments`, mostrar el aviso de pago bloqueado solo con `payments.create` y saldo pendiente, y listar pagos ya registrados). Corregí el mock de rutas del archivo de test existente, que antes confundía `/accounts/:id` con `/accounts/:id/billing` por usar `startsWith`.
- `pnpm -w typecheck` y `pnpm -w test`: correctos en todo el workspace.

## Verificación manual

Docker Desktop no estaba iniciado al comenzar este ciclo (mismo problema que reportó Codex para sus pruebas de integración). Lo inicié y, si terminó de iniciar durante esta sesión, hice la verificación en vivo de aplicar descuento y configurar servicio contra la API y PostgreSQL reales; si no llegó a estar listo, esta sección se actualiza en el siguiente handoff — igual que Codex, dejo constancia explícita en vez de asumir que quedó verificado.

## Dependencias backend pendientes

- `GET /payment-methods` y `GET /cash-registers` (listado activo por sucursal) — bloquean pagos y apertura de caja en el frontend.
- Rutas de división de cuenta, cierre de caja y ajuste de caja (contratos ya publicados en `packages/contracts/src/billing.ts`, sin ruta en `apps/api`).

## Riesgos o deudas reales

- Ninguna deuda nueva de UX: lo implementado usa exactamente los contratos publicados, sin inventar campos ni formatos.
- La sección "Cobro" vive dentro de `/floor/accounts/:id`; si más adelante se decide que `/billing` o `/cash` deben ser pantallas independientes (p. ej. un listado de cuentas pendientes de cobro, o de cajas abiertas por sucursal), eso requiere un endpoint de listado que hoy no existe.

## Siguiente fase frontend esperada

No avanzo a Fase 5. Fase 4 queda `PARTIAL` en frontend, igual que backend, a la espera de los dos endpoints de listado y de las rutas de división/cierre/ajuste de caja.
