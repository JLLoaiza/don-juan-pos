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

## Actualización — Docker Compose y CORS

- `infra/compose/docker-compose.yml` ahora levanta PostgreSQL, migración, API, worker y la PWA de Claude; PostgreSQL se expone por defecto en `5433`, API en `3000` y PWA en `5173`.
- Se añadió `.dockerignore` para no enviar datos locales de PostgreSQL ni dependencias al build; las imágenes compilan una vez y se ejecutan sin invocar `pnpm` anidado.
- La API permite únicamente los orígenes configurados en `CORS_ORIGINS` (por defecto `http://localhost:5173`) y prueba el preflight HTTP.
- Verificación real: Compose build correcto; PostgreSQL healthy; migración exitosa; API `/health` 200; preflight CORS 204; PWA 200; worker activo.
- Cambio backend confirmado: `b12631e feat(api): allow configured PWA origins`. Los cambios de Compose permanecen sin commit hasta que se confirme el trabajo frontend de Claude, pues la composición referencia `apps/web` y `packages/ui` aún no confirmados.
## Actualización — Script de arranque

- Se añadió `up.sh` en la raíz. Ejecuta Compose desde cualquier directorio, hace build por defecto, muestra el estado y las URLs; `./up.sh --no-build` omite la reconstrucción.
- Validado con Git Bash contra el stack activo.
- Commit: `60f94f8 chore(infra): add compose startup script`.
## Actualización — Script PowerShell

- Se añadió `up.ps1` en la raíz con los mismos controles que `up.sh`; admite `-NoBuild`.
- Validado contra el stack activo.
- Commit: `eb07fb0 chore(infra): add PowerShell startup script`.