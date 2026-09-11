# Handoff backend — Una mesa disponible pasa a ocupada al inspeccionarla

- **Estado:** `BACKEND_FIXED`
- **Fecha:** `2026-09-10`
- **Clasificación:** `BACKEND`

## Diagnóstico entregado

El clic de inspección de una mesa disponible en `/floor` llama `POST /accounts`, no confirma un pedido. `FloorService.openAccount` crea correctamente la cuenta borrador, pero también cambia de inmediato `restaurant_tables.status` a `OCCUPIED`. El cambio de estado debe ocurrir solo si `FloorService.confirmConsumption` termina exitosamente.

Consulta el expediente completo antes de editar:

- `../analysis.md`
- `../implementation-plan.md`
- `../progress.md`
- `../coordination.md`

## Cambios autorizados

- `apps/api/src/floor.ts`
- `apps/api/src/floor.integration.test.ts`

## Implementacion realizada

- Se elimino la actualizacion de estado de `FloorService.openAccount`.
- Tras insertar los items, movimientos de inventario, orden de cocina y trabajo de impresion exitosamente, `FloorService.confirmConsumption` actualiza a `OCCUPIED` la mesa asociada, dentro de la misma transaccion del comando.
- La mutacion es defensiva para `accounts.table_id = NULL`. La idempotencia permanece en `command_operations`: una repeticion de la misma operacion devuelve el resultado previamente almacenado y no reejecuta el comando.
- Documentacion actualizada: este handoff, `progress.md` y el registro append-only de `coordination.md`.

## Prueba de regresion y evidencia

La integracion ahora consulta `restaurant_tables.status` inmediatamente despues de `floor.openAccount(...)` y exige `AVAILABLE`. Con el codigo anterior esta asercion falla porque `openAccount` persistia `OCCUPIED`. La asercion final preexistente exige `OCCUPIED` despues de `confirmConsumption(...)`, junto con inventario, Kardex, cocina, impresion, outbox e idempotencia.

- `pnpm --filter @don-juan/api typecheck` - **PASS** (`tsc -p tsconfig.json --noEmit`).
- `pnpm --filter @don-juan/api test src/floor.integration.test.ts` - proceso **PASS**, pero `1 skipped (1)` porque `DATABASE_URL_TEST` no esta configurada.
- `pnpm --filter @don-juan/api test -- floor.integration.test.ts` - proceso **PASS**, con `20 passed | 20 skipped` archivos y `58 passed | 42 skipped` pruebas. La integracion de piso fue omitida porque `DATABASE_URL_TEST` no esta configurada; por eso no constituye evidencia de ejecucion de esta regresion.
- `git diff --check` - **PASS**; sin errores de espacios. Git mostro solo advertencias de normalizacion LF/CRLF ya presentes en el arbol de trabajo.

## Compatibilidad, migraciones y riesgos

No cambian rutas, payloads, permisos, contratos publicos ni migraciones. El indice de cuenta abierta por mesa, auditoria y outbox no se modifican.

La integración focalizada fue verificada posteriormente por el Analista Técnico contra PostgreSQL local con `DATABASE_URL_TEST=postgresql://postgres:postgres@localhost:5433/app`: `pnpm --filter @don-juan/api test src/floor.integration.test.ts` pasó (1 archivo, 1 prueba). La prueba demuestra en ejecución `AVAILABLE` antes y `OCCUPIED` después. Una cuenta borrador continúa impidiendo abrir una segunda cuenta para la mesa por el índice único, aunque la mesa permanezca visualmente disponible; es el comportamiento previsto por el plan.

## Trabajo frontend requerido

No aplica. El contrato `GET /floor` ya expone `openAccountId` y el cliente lo usa para reabrir el borrador; no se modifico frontend.
- Archivos del presente expediente necesarios para evidencia y seguimiento.

No modificar frontend, contratos públicos, migraciones, permisos ni archivos ajenos.

## Estado Git previo identificado

Cambios ajenos que se deben preservar:

- `.env.example`
- `apps/api/src/workforce.date-mapping.integration.test.ts`
- `packages/database/src/migrator.integration.test.ts`
- Directorios de protocolo/expedientes `.agents/*` no pertenecientes a este arreglo.

## Criterios de finalización

1. Una cuenta abierta sin consumo deja la mesa `AVAILABLE`.
2. La primera confirmación exitosa de consumo deja la mesa `OCCUPIED` en la misma transacción.
3. Se conserva cuenta única abierta por mesa, idempotencia, auditoría, outbox e invariantes de inventario/cocina.
4. Se añade una prueba que falla antes y pasa después cuando exista `DATABASE_URL_TEST`.
5. Ejecutar pruebas focalizadas, typecheck y revisión de diff; documentar exactamente cualquier prueba no ejecutable.
6. Completar este archivo con evidencia y actualizar `progress.md`; no declarar corregido sin pruebas.
