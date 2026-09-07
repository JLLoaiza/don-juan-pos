# Handoff — Codex

## Fase 3 — salón, mesas, cuentas y consumo

Backend completado. La sucursal se deriva exclusivamente de la sesión autenticada: ningún endpoint acepta `company_id` ni `branch_id` del cliente.

### Contratos y endpoints disponibles

Todos requieren `Authorization: Bearer`. Los comandos mutantes requieren `Idempotency-Key` UUID.

- `GET /floor` — áreas y mesas activas de la sede, con `openAccountId` si existe.
- `POST /dining-areas` — `{ name }`; permiso `dining_areas.create`.
- `POST /restaurant-tables` — `{ diningAreaId, name, capacity, status? }`; permiso `tables.create`. No permite crear una mesa como `OCCUPIED`.
- `POST /accounts` — `{ tableId, customerId?, notes? }`; permiso `accounts.open`. Bloquea la mesa, admite `AVAILABLE` o `RESERVED`, y la deja `OCCUPIED`.
- `GET /accounts/:id` — snapshot histórico de cuenta; permiso `accounts.view`.
- `POST /accounts/:id/confirm-consumption` — `{ expectedVersion, items: [{ productId, quantity, selectedAdditionals, notes? }] }`; requiere `accounts.update`, `sales.add_items` y `kitchen.send`.

Los schemas Zod y tipos están en `packages/contracts/src/floor.ts`, exportados por `@don-juan/contracts`.

### Reglas para Claude

- El frontend solo selecciona `branch_id` mediante `POST /me/active-branch`; no mostrar, guardar ni enviar compañía.
- Mantener un UUID por cada intento de comando y reenviarlo como `Idempotency-Key` ante reintentos.
- `confirm-consumption` exige la `version` de la cuenta leída. Un `409 CONFLICT` significa recargar la cuenta antes de volver a confirmar.
- Cambio de contrato compatible: `AccountItemSnapshot.unitCost` ahora puede ser `null`. El backend solo lo devuelve con `products.view_cost`; también elimina `totalCost` y `unitCost` de `consumptionSnapshot` sin ese permiso. El frontend actual ya maneja `null` al formatear montos.
- `quantity` es string entero positivo. El cliente solo expresa intención: no manda precio, costo, impuesto, total ni receta.
- `selectedAdditionals[].noCharge` solo funciona si el producto permite el adicional gratuito; incluso gratuito descuenta inventario.
- La respuesta de confirmación contiene la cuenta actualizada, ticket de cocina, print job y alertas `NEGATIVE_STOCK`. No bloquear la venta por alerta de stock.

### Integridad aplicada

- Las operaciones mutantes usan ledger idempotente por compañía interna + `operation_id` y validan acceso efectivo a la sucursal.
- Abrir cuenta bloquea la mesa (`FOR UPDATE`) y conserva el índice SQL de una única cuenta `OPEN` por mesa.
- Confirmar consumo bloquea cuenta y todas las existencias afectadas en orden determinista. En el mismo commit crea los snapshots de ítems/adicionales, descuenta inventario, registra Kardex inmutable, recalcula totales, genera orden de cocina, print job, auditoría y transactional outbox.
- Precios, impuestos, costo y receta se resuelven en backend. Las recetas y montos de inventario quedan en `consumptionSnapshot`; el SQL impide reescribir snapshots de ítems confirmados.
- Sin impresora de cocina activa el consumo sigue siendo válido: el print job se persiste como `FAILED` con motivo explícito y el worker puede reintentarlo cuando exista destino. Con impresora activa inicia `PENDING`.
- Las migraciones `0013`–`0015` agregan permisos y defensas SQL de aislamiento por sede/snapshots. `0014`–`0015` corrigen de forma compatible el trigger compartido ya aplicado; no reescriben historial de migración.

### Verificación

- API HTTP: 20 pruebas correctas.
- Integración PostgreSQL: flujo área → mesa → cuenta → consumo → Kardex → cocina → print job → outbox correcto, incluido replay idempotente.
- Typecheck de contratos y API correcto.
## Fase 4 — pagos directos y apertura de caja

Backend parcialmente disponible. La compañía y sucursal se derivan siempre de la sesión autenticada: los requests de cobro y caja no aceptan `companyId` ni `branchId`.

### Endpoints disponibles

Todos requieren `Authorization: Bearer`; los comandos requieren `Idempotency-Key` UUID.

- `GET /accounts/:id/billing` — snapshot de liquidación, pagos registrados y saldo; permiso `payments.view`.
- `POST /cash-sessions` — `{ cashRegisterId, openingAmount, notes? }`; permiso `cash.open`. Bloquea la caja y solo permite una sesión `OPEN` por caja.
- `POST /accounts/:id/discounts` — `{ expectedVersion, name, type: PERCENTAGE|FIXED, value }`; permiso `sales.apply_discount`.
- `PUT /accounts/:id/service` — `{ expectedVersion, percentage }`; permiso `sales.modify_service`.
- `POST /accounts/:id/payments` — `{ expectedVersion, paymentMethodId, accountSplitId?, amountApplied, cashReceived?, cashSessionId?, reference?, notes?, printReceipt? }`; permiso `payments.create`.

`RegisterPaymentRequest` solo cubre liquidación directa por ahora. Enviar `accountSplitId` recibe `422` hasta que se finalicen divisiones. Para CASH se exige una sesión abierta de la sede y `cashReceived >= amountApplied`; CARD/QR no modifican efectivo físico. Un pago CASH crea exactamente un movimiento `SALE` por el monto aplicado (no por el efectivo recibido), registra el cambio y, al saldar, marca la cuenta como `PAID` y libera su mesa.

Descuentos y servicio ya tienen las rutas indicadas. Los contratos de divisiones, cierre y ajustes de caja siguen publicados en `packages/contracts/src/billing.ts`, pero esos comandos todavía **no tienen rutas**: Claude puede mantenerlos como mocks, sin anticipar una API distinta.

### Integridad aplicada

- La migración `0016_payments_and_cash_integrity.sql` añade snapshots de método, sesión, efectivo/cambio y `operation_id`; valida en SQL que método, sesión, cuenta y split pertenezcan a la misma sede.
- Pago y apertura de sesión son transacciones idempotentes con auditoría y transactional outbox. El cobro bloquea cuenta, método, pagos previos y sesión según corresponda; nunca usa un worker para confirmar dinero, cuenta o caja.
- Todo pago, descuento o cambio de servicio incrementa la versión de cuenta. Un cliente debe recargar `GET /accounts/:id/billing` tras un `409 CONFLICT` antes de reintentar con una nueva clave.
- Los descuentos quedan como snapshots inmutables. Los totales, impuesto y servicio se recalculan con decimales desde los ítems confirmados y descuentos registrados; el descuento de cuenta se prorratea determinísticamente sin reescribir snapshots de consumo. Tras el primer pago se rechaza cualquier cambio comercial, incluido nuevo consumo.
- `cash_movements` es inmutable y no admite inserciones en sesiones cerradas. Ausencia de impresora de recibos no revierte el cobro: persiste un `print_job` `FAILED` auditable; con impresora activa inicia `PENDING`.

### Verificación

- Compilación de contratos y typecheck de API correctos.
- API HTTP: 25 pruebas correctas; incluye validación de autenticación, idempotencia, permisos de descuentos/servicio y eliminación de `companyId` en comandos de Fase 4.
- Se añadió prueba PostgreSQL de apertura, pago efectivo, movimiento, cierre de cuenta, recibo, outbox y replay idempotente. Queda pendiente ejecutarla en el entorno local porque Docker Desktop no está iniciado.

Actualización: POST /cash-sessions/:id/adjustments recibe { expectedVersion, amount, direction: INCREASE|DECREASE, reason } con cash.adjust; POST /cash-sessions/:id/close recibe { expectedVersion, countedCash, notes?, printReceipt? } con cash.close. Ambos usan Idempotency-Key; el cierre bloquea la sesión, calcula efectivo esperado desde movimientos y persiste snapshot inmutable.

Actualización de cierre: cuando printReceipt es verdadero, el cierre crea un print_job DAY_CLOSE con el snapshot persistido. Sin impresora CASH activa queda FAILED con causa explícita, sin revertir la sesión cerrada.

## Pausa segura — Fase 5

Fase 5 queda pausada por instrucción del usuario y no debe retomarse hasta integración de Fase 4. El commit `d30ca23` publicó solamente contratos iniciales de proveedores, compras y gastos. La migración local no confirmada `infra/db/migrations/0019_procurement_integrity.sql` conserva el avance SQL de aislamiento por sucursal, permisos y `operation_id`; no está mezclada con este corte de Fase 4 ni debe eliminarse.

## Actualización Fase 4 — lectura de caja para frontend

Rutas disponibles con `Authorization: Bearer` y sucursal derivada de la sesión:

- `GET /cash-registers` — permiso `cash.view`; devuelve las cajas de la sucursal activa y `openSession` (o `null`) por cada una.
- `GET /cash-registers/:id/open-session` — permiso `cash.view`; devuelve la sesión `OPEN` de esa caja o `null`. Una caja de otra sucursal no se revela.

Los contratos son `CashRegisterContextSchema` y `CashRegisterListSchema` en `@don-juan/contracts`. Claude ya puede completar las pantallas de ajustes y cierre usando la sesión incluida, y los comandos existentes `POST /cash-sessions/:id/adjustments` y `POST /cash-sessions/:id/close`; no debe enviar compañía ni sucursal.
## Cierre backend — Fase 4

Se añade `GET /payment-methods`, con permiso `payments.view`, que devuelve exclusivamente métodos activos de la sucursal autenticada: `{ paymentMethods: [{ id, name, type, active }] }`. No recibe ni expone compañía o sucursal.

El seed de desarrollo `0020_development_cash_seed.sql` crea únicamente para la sucursal de desarrollo una `Caja Principal` y los métodos activos Efectivo/CASH, Tarjeta/CARD y QR/QR. Es idempotente y está marcado como datos de desarrollo: producción puede reemplazarlo o desactivarlo, sin depender de credenciales ni de esos IDs.

Para cerrar ajustes y cierres, Claude debe cargar `GET /cash-registers` y seleccionar `openSession`; después usa `POST /cash-sessions/:id/adjustments` o `POST /cash-sessions/:id/close` con la `version` de esa sesión e `Idempotency-Key`. También puede cargar `GET /payment-methods` para el selector de cobro. Todas las rutas trabajan sobre la sucursal activa de la sesión.

Verificación: typecheck API correcto y 30 pruebas HTTP correctas. La prueba PostgreSQL cubre cajas, sesión abierta, métodos activos y que una sucursal no pueda leer la caja ni métodos de otra; está lista para ejecutarse cuando Docker Desktop vuelva a estar disponible.