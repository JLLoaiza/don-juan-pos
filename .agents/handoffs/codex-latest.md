# Handoff — Codex

## Tarea realizada

Completada la Fase 0: monorepo TypeScript ejecutable, migrador PostgreSQL con checksum y bloqueo asesor, API de salud, worker de impresión persistente de desarrollo y Compose local.

## Archivos principales

- `apps/api/`: `GET /health` y prueba HTTP.
- `apps/worker/`: reclamación de `print_jobs` con `FOR UPDATE SKIP LOCKED`, backoff y adaptador a archivo para desarrollo.
- `packages/contracts/`: contrato público de salud y error API base.
- `packages/domain/`: generador UUIDv7 para comandos/entidades sincronizables.
- `packages/database/`: pool, transacciones, migrador, CLI y pruebas.
- `infra/db/migrations/`: `0001`, `0002`, `0003`, `0007` y `0008`.
- `infra/compose/docker-compose.yml` y `infra/Dockerfile`.

## Contratos

Solo está publicado `GET /health`. Aún no hay contratos de auth, salón, cuentas ni consumo; no crear mocks frontend que inventen esas rutas. Los contratos de cuenta/consumo quedan pendientes de las decisiones de coordinación antes de la Fase 1/3.

## Migraciones

La base local vacía fue inicializada con el DDL original y las cinco migraciones. El migrador conserva `0000_initial_ddl` y checksums en `schema_migrations`, rechaza una base existente no baselined y evita carreras con `pg_advisory_lock`.

## Decisiones y coordinación requerida

Registradas en `.agents/coordination.md` para revisión de ChatGPT:

1. roles globales y `user_branch_access`;
2. estrategia de sesión/refresh y seed temprano;
3. trabajos sin impresora y obligatoriedad de `expectedVersion`;
4. registro canónico de idempotencia para comandos online.

## Pruebas ejecutadas

- Compilación TypeScript limpia: correcta.
- Vitest: 7 pruebas correctas; 1 integración PostgreSQL omitida sin `DATABASE_URL_TEST`.
- PostgreSQL local: DDL+migraciones aplicados correctamente; segunda ejecución idempotente (`Database is current`).
- Verificado índice parcial de cuenta abierta, `printers` y `sync_outbox`.

## Pendiente

- Fase 1 de identidad después de resolver las decisiones de coordinación.
- Contratos command-oriented de auth/context, salón, cuenta y consumo antes de que Claude implemente los clientes/mocks.
- Pruebas de integración PostgreSQL con `DATABASE_URL_TEST` apuntando a una base vacía desechable.

## Breaking changes

Ninguno: no existían contratos ni clientes previos.
