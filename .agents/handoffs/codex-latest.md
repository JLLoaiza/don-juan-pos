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