# Prompt frontend para Claude — Separar inspección y creación de pedido en el salón

Implementa únicamente el frontend de este bug. No modifiques backend, contratos compartidos, migraciones, permisos backend ni pruebas API. No hagas commits, push ni PR.

## Objetivo y resultado esperado

En `/floor`, pulsar una mesa `AVAILABLE` debe permitir inspeccionar/preparar el pedido **sin crear una cuenta ni llamar `POST /accounts`**. La cuenta se crea solo cuando el usuario confirma al menos un producto; en ese momento se confirma el consumo y el backend cambia la mesa a `OCCUPIED` atómicamente.

El backend ya fue corregido y verificado: una llamada aislada a `POST /accounts` conserva la mesa `AVAILABLE`; `POST /accounts/:id/confirm-consumption` la cambia a `OCCUPIED` únicamente si el pedido se confirma exitosamente. No intentes cambiar esta semántica en frontend.

## Evidencia de la causa frontend

`apps/web/src/features/floor/FloorPage.tsx`, `handleTableClick`, hace actualmente:

```ts
api.openAccount({ tableId: table.id, notes: null })
  .then((account) => navigate(`/floor/accounts/${account.id}`));
```

Por tanto, inspeccionar una mesa muta el backend. `apps/web/src/features/floor/FloorPage.test.tsx` también codifica el comportamiento defectuoso con la prueba «opens an account on an available table…».

## Contratos backend reales y estables

- `GET /floor` devuelve `FloorSnapshot` con `tables[]`: `{ id, diningAreaId, name, capacity, status: "AVAILABLE" | "OCCUPIED" | "RESERVED", active, openAccountId: string | null }`.
- `POST /accounts`, con encabezado `idempotency-key`, recibe `{ tableId: UUID, customerId?: UUID | null, notes?: string | null }` y devuelve `AccountSnapshot`, que incluye `{ id, tableId, status: "OPEN", version: positive integer, items }`.
- `POST /accounts/:id/confirm-consumption`, con encabezado `idempotency-key`, recibe `{ expectedVersion: positive integer, items: [{ productId: UUID, quantity: positive whole-number string, selectedAdditionals: [{ accompanimentId, noCharge }], notes?: string | null }] }` y devuelve `ConfirmConsumptionResponse`.
- Los dos métodos ya existen en `apps/web/src/features/floor/floorApi.ts`: `openAccount(input)` y `confirmConsumption(accountId, input)`. Cada uno genera su propia idempotency key.
- El backend impide más de una cuenta `OPEN` por mesa. Tras un fallo luego de crear la cuenta, `GET /floor` puede devolver `status: "AVAILABLE"` junto con `openAccountId`; ese borrador se debe recuperar, no crear otro.
- Permisos: crear cuenta exige `accounts.open`; confirmar consumo exige conjuntamente `accounts.update`, `sales.add_items` y `kitchen.send`. No repliques la autorización como fuente de verdad; úsala para presentar/inhabilitar acciones de forma coherente.

## Implementación propuesta

1. En `FloorPage`, mantener la navegación a `/floor/accounts/:openAccountId` si `openAccountId` existe.
2. Para una mesa sin cuenta, reemplazar la llamada inmediata a `api.openAccount` por navegación a un flujo nuevo de **pedido pendiente para la mesa**. Usa una ruta explícita, por ejemplo `/floor/tables/:tableId/order`, y registra la ruta en `apps/web/src/App.tsx`. No dependas solo de `location.state`, porque se pierde al recargar.
3. Implementa una página/componente de pedido pendiente que valide que la mesa existe, está activa y no tiene `openAccountId` usando el snapshot de `GET /floor`; muestra nombre de mesa y un camino claro de volver/cancelar sin mutación.
4. Reutiliza el comportamiento y la validación de productos/adicionales de `ConsumptionForm.tsx`, sin duplicar reglas de cantidad, adicionales o notas. Puedes extraer una pieza reutilizable si mantiene las pruebas existentes claras.
5. Cuando el usuario pulse «Confirmar y enviar a cocina» con al menos un ítem válido:
   - llama `api.openAccount({ tableId, notes: null })` una sola vez;
   - toma el `id` y `version` realmente devueltos;
   - llama inmediatamente `api.confirmConsumption(account.id, { ...consumo, expectedVersion: account.version })`;
   - tras éxito, navega a `/floor/accounts/:account.id` y conserva o muestra la confirmación de cocina de manera equivalente al flujo actual.
6. Si falla `openAccount`, muestra el error y conserva el borrador local para reintentar. Si `openAccount` pasa pero `confirmConsumption` falla, no abras una segunda cuenta: navega a la cuenta creada o presenta una recuperación inequívoca que permita reintentar el consumo con su versión actual. Al volver a `/floor`, `openAccountId` debe abrir esa cuenta existente.
7. Si la mesa cambia entre carga y confirmación (cuenta abierta por otra sesión, mesa inactiva, conflicto/versionado), muestra el error del backend, no sobrescribas estado ni inventes un nuevo contrato; recarga el floor cuando sea necesario.

## Archivos candidatos

- `apps/web/src/features/floor/FloorPage.tsx`
- `apps/web/src/features/floor/FloorPage.test.tsx`
- `apps/web/src/features/floor/AccountPage.tsx` y/o `ConsumptionForm.tsx` si extraer el editor reutilizable es necesario
- Nuevo componente de pedido pendiente y su prueba en `apps/web/src/features/floor/`
- `apps/web/src/App.tsx` y, solo si son necesarias, sus pruebas
- Estilos específicos mínimos en los CSS ya existentes o un CSS nuevo de la feature

No modifiques `apps/api`, `packages/contracts`, `infra`, ni el expediente de backend salvo para registrar evidencia si corresponde.

## Casos límite y pruebas obligatorias

- Pulsar una mesa disponible sin cuenta navega al pedido pendiente y **no** llama `POST /accounts`.
- Cancelar o volver desde el pedido pendiente no llama mutaciones y la mesa sigue disponible.
- Agregar productos y confirmar llama `POST /accounts` una vez y luego `POST /accounts/:id/confirm-consumption` con el `expectedVersion` devuelto por la cuenta.
- Tras éxito se navega a la cuenta y el siguiente `GET /floor` refleja la ocupación proveniente del backend.
- Si existe `openAccountId`, pulsar la mesa navega a la cuenta existente, incluso si su `status` es `AVAILABLE`.
- Usuario sin `accounts.open` no puede comenzar pedido; usuario sin los tres permisos de consumo no puede confirmar y recibe una UI consistente.
- Error al crear cuenta: no pierde ítems locales ni navega.
- Error al confirmar después de crear cuenta: no crea otra cuenta; ofrece recuperación de la cuenta existente.
- Conserva las pruebas existentes de áreas, mesas, cuenta, consumo, descuentos y pagos.

Ejecuta al menos:

```text
pnpm --filter @don-juan/web test -- FloorPage.test.tsx
pnpm --filter @don-juan/web test
pnpm --filter @don-juan/web typecheck
```

Entrega el diff, pruebas ejecutadas/resultados y cualquier limitación. No declares resuelto el bug completo: el Analista Técnico revisará tu trabajo junto con la verificación backend ya existente.
