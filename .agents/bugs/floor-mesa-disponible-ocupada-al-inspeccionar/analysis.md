# Análisis del bug — Una mesa disponible pasa a ocupada al inspeccionarla

- **Estado:** `RESOLVED`
- **Clasificación:** `MIXED`
- **Confianza de causa raíz:** `HIGH`

## Bug

La apertura de una cuenta asociada a una mesa, que es el efecto de inspeccionarla desde `/floor`, cambia anticipadamente el estado persistido de la mesa a `OCCUPIED`.

## Resultado actual

Al seleccionar una mesa `AVAILABLE`, `FloorPage.handleTableClick` navega a `/floor/tables/:tableId/order` y no llama `POST /accounts`. La página de pedido pendiente mantiene los ítems en memoria; solo al confirmar los ítems válidos crea una cuenta y confirma el consumo con la `version` devuelta. La mesa sigue `AVAILABLE` después de abrir la cuenta y cambia a `OCCUPIED` dentro de la transacción de confirmación.

## Resultado esperado

Inspeccionar una mesa no crea cuenta ni cambia estado. La UI debe permitir preparar/revisar el pedido sin comando persistente; al confirmar el primer pedido, crea la cuenta y confirma el consumo. La transición a `OCCUPIED` ocurre únicamente dentro de la confirmación exitosa (`POST /accounts/:id/confirm-consumption`). Este resultado fue especificado directamente en el reporte original y precisado por el usuario tras verificar el backend.

## Entorno y precondiciones

- Aplicación web en la ruta `/floor`.
- Mesa activa de la sucursal con estado `AVAILABLE`.
- Usuario con `accounts.open`; para confirmar el pedido además `accounts.update`, `sales.add_items` y `kitchen.send`.
- No existe una cuenta abierta previa para la mesa.

## Reproducción

1. Crear o elegir una mesa activa en estado `AVAILABLE`.
2. Abrir `/floor` con el permiso `accounts.open`.
3. Pulsar la mesa. El cliente llama a `POST /accounts` con `{ tableId, notes: null }` y navega a `/floor/accounts/:accountId`, sin que el usuario haya confirmado un producto.
4. La corrección backend mantiene `status: "AVAILABLE"`, pero ya existe una cuenta abierta y la siguiente pulsación lleva a esa cuenta borrador.

La integración backend comprobó que la mesa sigue `AVAILABLE` inmediatamente después de `floor.openAccount(...)` y pasa a `OCCUPIED` tras `confirmConsumption(...)`. La prueba frontend existente comprueba explícitamente el comportamiento restante: al pulsar «Mesa 1» llama `POST /accounts` y navega a la cuenta.

## Primera divergencia observable

No queda divergencia observable: la inspección no emite comando y la primera mutación ocurre solo al confirmar un pedido válido.

## Causa raíz

El defecto original tenía dos acoplamientos. `apps/web/src/features/floor/FloorPage.tsx` trataba el clic como apertura de una cuenta borrador; antes, `FloorService.openAccount` además acoplaba esa creación al cambio de estado `OCCUPIED`. El backend eliminó esa transición prematura y el frontend ahora separa el borrador local de los comandos backend.

La UI debe separar el borrador local de ítems de los comandos backend. Al confirmar el borrador, debe obtener una cuenta real mediante `POST /accounts`, usar la `version` devuelta y llamar a `POST /accounts/:id/confirm-consumption`. La corrección backend ya persiste `OCCUPIED` dentro de esta última transacción.

## Evidencia

- `apps/web/src/features/floor/FloorPage.tsx:57-69`: el clic sin `openAccountId` llama `api.openAccount` y solo después navega a la cuenta; no confirma consumo.
- `apps/web/src/features/floor/floorApi.ts:38`: `openAccount` usa `POST /accounts`.
- `apps/api/src/app.ts:56`: la ruta invoca `floor.openAccount`.
- `apps/web/src/features/floor/FloorPage.tsx:57-69`: el clic sin `openAccountId` llama `api.openAccount` y navega a la cuenta.
- `apps/web/src/features/floor/FloorPage.test.tsx:96-112`: prueba que hoy exige ese `POST /accounts` al pulsar la mesa disponible.
- `apps/api/src/floor.ts`: `openAccount` ya no actualiza la mesa; `confirmConsumption` la actualiza a `OCCUPIED` dentro de la transacción.
- `apps/api/src/floor.integration.test.ts`: ejecutada contra PostgreSQL local el 2026-09-10; exige `AVAILABLE` tras abrir y `OCCUPIED` tras confirmar.
- `git blame` atribuye la mutación al commit `0e52c3a feat(floor): add transactional table consumption` (2026-09-07).
- El índice único `ux_accounts_one_open_account_per_table` de `infra/db/migrations/0002_accounts_integrity.sql` sigue evitando más de una cuenta abierta aunque la mesa se conserve `AVAILABLE` durante la inspección.
- `apps/web/src/features/floor/FloorPage.tsx:54-62` ahora navega a `/floor/tables/:tableId/order` para una mesa disponible sin cuenta y no invoca `api.openAccount`.
- `apps/web/src/features/floor/PendingOrderPage.tsx` conserva el borrador local y, al confirmar, llama secuencialmente `openAccount` y `confirmConsumption` con la versión devuelta. Si la confirmación falla, recupera la misma cuenta antes del reintento.
- 2026-09-10: pasaron 188 pruebas web, los typechecks web/API y la integración de salón focalizada contra PostgreSQL local.

## Alcance e impacto

- **Usuarios:** personal de salón con permiso de abrir cuentas.
- **Módulos:** plano del salón, cuentas, reportes operativos y sincronización de comandos.
- **Datos:** no se crea cuenta ni se cambia la mesa al inspeccionar; el cambio persiste únicamente con el consumo confirmado.
- **Frecuencia:** la regresión está cubierta por pruebas automatizadas de interacción y de integración.
- **Impacto operativo:** la interacción distingue revisar una mesa de comenzar un pedido.

## Regresión y problemas hermanos

- Introducido por `0e52c3a` el 2026-09-07 junto al flujo transaccional de consumo.
- Problema hermano revisado: el pago final en `apps/api/src/billing.ts` ya devuelve la mesa a `AVAILABLE`; no se debe modificar.
- No se detectó otra ruta que asigne `OCCUPIED` a `restaurant_tables`.

## Clasificación y justificación

`MIXED`

El backend era responsable de la transición prematura de estado y ya quedó estabilizado. El frontend es responsable de emitir el comando de apertura durante una inspección. No requiere cambio de contrato, pero sí un flujo de composición local que cree/confirmé la cuenta solo al enviar el primer pedido.

## Información faltante

Ninguna para el alcance reportado. La validación automatizada comprueba la ausencia de mutación al inspeccionar y la transición correcta tras confirmar consumo.
