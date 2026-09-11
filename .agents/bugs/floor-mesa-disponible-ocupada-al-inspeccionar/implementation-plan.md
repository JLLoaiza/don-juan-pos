# Plan de implementación del bug — Una mesa disponible pasa a ocupada al inspeccionarla

- **Estado:** `RESOLVED`
- **Clasificación:** `MIXED`
- **Última actualización:** `2026-09-10`

## Solución propuesta

Separar la creación de una cuenta borrador de la ocupación física de la mesa:

1. **Completado backend:** `openAccount` conserva `AVAILABLE`; `confirmConsumption` cambia a `OCCUPIED` en su transacción; la integración cubre ambos estados.
2. **Completado frontend:** la inspección abre un pedido pendiente en memoria; solo confirmar al menos un producto crea la cuenta y confirma el consumo.

## Alternativas descartadas

- Cambiar solo `FloorPage` para ocultar el estado: descartado porque el estado falso ya está persistido, se replica y alimenta reportes.
- Crear una nueva entidad o endpoint de inspección: descartado; una cuenta abierta ya representa el borrador y el contrato actual contiene `openAccountId`.
- Alterar directamente una migración aplicada o introducir migración de datos: descartado; el defecto es comportamiento de servicio y la corrección no cambia esquema ni requiere reescribir datos históricos.

## Alcance y archivos afectados

- `apps/api/src/floor.ts`: mover la transición de estado al comando de confirmación.
- `apps/api/src/floor.integration.test.ts`: regresión de la transición temporal.
- `.agents/bugs/floor-mesa-disponible-ocupada-al-inspeccionar/*`: evidencia y seguimiento del expediente.

No se permiten cambios a `apps/web` ni a otros archivos de producción.

## Pasos backend

1. Añadir la aserción de que la mesa sigue `AVAILABLE` después de `openAccount`; confirmar que falla con el código base cuando se ejecute con `DATABASE_URL_TEST`.
2. Retirar la actualización a `OCCUPIED` de `openAccount`.
3. Tras completar con éxito los efectos de `confirmConsumption` y antes de responder, actualizar el estado de la mesa de la cuenta a `OCCUPIED` dentro de la misma transacción.
4. Mantener la aserción final de `OCCUPIED` y ejecutar la repetición idempotente existente; la repetición no debe crear una orden ni cambiar el resultado.
5. Ejecutar pruebas focalizadas y typecheck; si no hay base de pruebas, documentar el bloqueo exacto sin falsear la ejecución.

## Pasos frontend

Definidos de forma ejecutable en `handoffs/frontend-prompt.md`. Claude debe crear un flujo de nuevo pedido por mesa que no invoque `POST /accounts` al inspeccionar; debe llamar secuencialmente `openAccount` y `confirmConsumption` al confirmar los ítems y recuperar correctamente un borrador existente.

## Contratos y compatibilidad

- Sin cambios de rutas, payloads, permisos ni esquemas Zod públicos.
- `POST /accounts` continuará retornando una cuenta `OPEN`; la mesa conserva `AVAILABLE` hasta una confirmación exitosa.
- `GET /floor` puede exponer temporalmente `{ status: "AVAILABLE", openAccountId: <cuenta abierta> }` para borradores preexistentes o creados tras una confirmación fallida. La UI debe priorizar `openAccountId` para recuperar ese borrador.
- `POST /accounts/:id/confirm-consumption` mantiene la misma respuesta y gana el efecto persistente correcto sobre la mesa.

## Datos y migraciones

No se requieren migraciones ni reparación masiva. Las mesas que ya fueron ocupadas por cuentas vacías conservan el estado histórico hasta que se salden o se gestione operativamente; modificar esos datos sería una reparación funcional riesgosa fuera del alcance.

## Seguridad, permisos y auditoría

- Conservar `accounts.open` para crear la cuenta y los permisos compuestos de confirmación para ocupar mediante pedido.
- No alterar validaciones de sucursal, cuenta única abierta, auditoría ni eventos outbox.

## Transacciones, concurrencia, idempotencia y sincronización

- La actualización debe quedarse dentro de `FloorService.command` y su transacción existente: si falla cualquier efecto del pedido, la mesa no cambia a ocupada.
- El bloqueo de `accounts` y los bloqueos de inventario existentes se conservan.
- El índice único de cuenta abierta por mesa previene dos borradores para una misma mesa aunque su estado permanezca `AVAILABLE`.
- La repetición de la misma `operationId` devuelve el resultado inmutable del comando y no debe duplicar pedidos ni producir una nueva transición material.
- La outbox sigue publicando los mismos comandos; no se cambia su contrato.

## Prueba de regresión

En `floor.integration.test.ts`:

- Antes de confirmar consumo: abrir cuenta y consultar `restaurant_tables.status`; debe ser `AVAILABLE`.
- Después de confirmar el primer consumo: debe ser `OCCUPIED`, junto con las aserciones existentes de Kardex, orden de cocina, trabajo de impresión y outbox.
- Repetir la confirmación con la misma operación y comprobar la igualdad del resultado existente.

## Verificación

1. `pnpm --filter @don-juan/api test -- floor.integration.test.ts`
2. `pnpm --filter @don-juan/api typecheck`
3. Revisar `git diff --check` y `git diff -- apps/api/src/floor.ts apps/api/src/floor.integration.test.ts`.

### Evidencia de ejecución final (2026-09-10)

- `pnpm --filter @don-juan/web test -- FloorPage.test.tsx PendingOrderPage.test.tsx`: pasó (31 archivos, 188 pruebas).
- `pnpm --filter @don-juan/web typecheck`: pasó.
- `DATABASE_URL_TEST=postgresql://postgres:postgres@localhost:5433/app pnpm --filter @don-juan/api test src/floor.integration.test.ts`: pasó (1 archivo, 1 prueba).
- `pnpm --filter @don-juan/api typecheck` y `git diff --check`: pasaron.

## Rollback o mitigación

Revertir únicamente el cambio de servicio y su prueba restaura la semántica anterior. Como mitigación temporal sin despliegue, evitar abrir cuentas al inspeccionar, aunque no corrige los datos ya afectados.

## Riesgos residuales

- Una cuenta borrador impide otra cuenta abierta para la misma mesa, pero seguirá visualmente disponible hasta el pedido por requerimiento explícito.
- Si el producto espera cancelar borradores o cobrar una cuenta sin ítems, se requiere una decisión funcional separada; no se introducirá en este arreglo.

## Criterios de finalización

- Backend: integración focalizada, typecheck y `git diff --check` pasaron el 2026-09-10.
- Frontend: inspeccionar no emite `POST /accounts`; confirmar el primer pedido crea una sola cuenta y confirma el consumo con la versión retornada.
- Se cubren cancelación, permisos insuficientes, cuenta borrador preexistente y fallo entre los dos comandos.
- Las pruebas web, typechecks y la integración focalizada fueron ejecutados; el Analista revisó el commit `d6e8e49` sin cambios ajenos.
