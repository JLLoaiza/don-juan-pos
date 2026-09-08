# Handoff — Backend, Fase 6 (primer slice Edge)

## Estado

Fase 6 backend: **PARTIAL**. Se publicó el núcleo Edge de dispositivos, feed de cambios cursorizado y estado del outbox. No se implementó una Cloud ficticia ni se inició Fase 7.

La arquitectura Edge/Cloud y el límite pendiente de resolver están documentados en `.agents/coordination.md`.

## Contratos y rutas reales

Todos derivan la sucursal de la sesión autenticada: no reciben ni aceptan `companyId` o `branchId`.

| Ruta | Permiso | Uso |
| --- | --- | --- |
| `GET /sync/devices` | `sync.devices.view` | Lista dispositivos de la sucursal activa. |
| `POST /sync/devices` | `sync.devices.manage` | Registra/actualiza el dispositivo actual; requiere `Idempotency-Key`. |
| `POST /sync/devices/:id/deactivate` | `sync.devices.manage` | Desactiva un dispositivo; requiere `Idempotency-Key`. |
| `GET /sync/status` | `sync.status.view` | Expone conteos del outbox y cursor más reciente. |
| `GET /sync/changes?deviceId=…&after=0&limit=100` | `sync.changes.pull` | PULL cursorizado de cambios de la sucursal. |

Contratos publicados en `packages/contracts/src/sync.ts`:
- `SyncDeviceSchema`, `RegisterSyncDeviceRequestSchema`.
- `PullSyncChangesRequestSchema` y `PullSyncChangesResponseSchema`.
- `SyncStatusSchema`.
- `SyncOperationRequestSchema`/resultado y batch PUSH están publicados para mocks compatibles, pero **aún no existe `POST /sync/push`**.

El frontend debe persistir `deviceId` internamente tras registrarse y usarlo en cada PULL; nunca lo pide como UUID manual al operador.

## Garantías del slice

- Registro/desactivación de dispositivo usa el ledger `command_operations`: reintentar el mismo `Idempotency-Key` devuelve el resultado anterior.
- Un dispositivo desactivado no puede volver a registrarse ni hacer PULL.
- El trigger `trg_sync_outbox_publish_change` convierte cada inserción transaccional existente en `sync_outbox` en un registro branch-scoped de `sync_changes`. Si el comando de negocio revierte, también revierte el feed.
- El cursor es `BIGSERIAL`, transportado como string para no perder precisión JavaScript.
- El PULL bloquea y valida el dispositivo activo dentro de la sucursal autenticada y actualiza `last_sync_at`; no filtra cambios de otra sede.
- Se añadieron permisos de sincronización y se asignan idempotentemente al rol de desarrollo Administrator.

## Migración

`infra/db/migrations/0024_sync_protocol_core.sql`:
- añade metadatos de protocolo/conflicto a `sync_operations`;
- añade trazabilidad/versionado a `sync_devices`;
- crea permisos de sync;
- instala el trigger transaccional de change feed.

Aplicada correctamente al PostgreSQL local mediante el migrador.

## Verificación

- `DATABASE_URL_TEST=postgresql://postgres:postgres@localhost:5433/app pnpm --filter @don-juan/api test:integration`: **15/15**.
- `pnpm --filter @don-juan/api test -- --run src/sync.http.test.ts`: **2/2**.
- `pnpm -w typecheck`: correcto.

## Pendiente antes de declarar Fase 6 completa

1. `POST /sync/push`: almacenar operaciones por dispositivo, respetar dependencias y despachar comandos de dominio con reautorización, resultados `PROCESSED/FAILED/CONFLICT`.
2. Cola local IndexedDB y aplicación de PULL en PWA; UI de estado, pendientes y conflictos.
3. Worker Edge→Cloud con identidad Edge y endpoint Cloud autenticado/versionado.
4. Política completa de conflicto/resolución, backoff y recuperación tras reinicio.
5. Topología Cloud separada revisada por arquitectura. No hay failover automático de clientes hacia Cloud.

## Hotfix backend — Fase 5: respuestas DATE de personal (2026-09-07)

**Corregido.** Los mapeadores de `employee_wage_rates`, `employee_shifts`, `employee_bonuses` y `employee_payments` usaban `String(row.date).slice(0,10)`. Cuando el driver entregaba una columna PostgreSQL `DATE` como objeto `Date`, el valor resultaba en texto no ISO (por ejemplo `Sun Sep 07`) y los schemas HTTP devolvían 400 después de que la transacción ya hubiese confirmado.

`apps/api/src/workforce.ts` ahora normaliza `DATE` con `dateOnly`: conserva strings ISO y, para objetos `Date`, extrae componentes UTC, evitando un corrimiento de día por zona horaria. La misma normalización se usa al resolver la vigencia de tarifas. `0025_workforce_date_response_repair.sql` repara resultados históricos en `command_operations` desde las filas canónicas de tarifa/turno/bono/pago, de modo que un reintento con la misma clave idempotente ya no repite el 400 ni duplica el hecho previamente confirmado.

**Verificado.** La nueva integración fuerza el parser PostgreSQL de `DATE` a devolver `Date` y confirma respuestas exactas `YYYY-MM-DD` para crear/listar tarifa, clock-in/out, bono y pago, incluido replay idempotente. Migración aplicada localmente; integración API 16/16, suite API 42 pasaron (32 omitidas sin `DATABASE_URL_TEST`) y `pnpm -w typecheck` correcto. Fase 5 backend permanece COMPLETE; Fase 6 sigue pausada durante este hotfix.
## Integración limpia — Fase 5 (2026-09-07)

Validada entre backend `de7f54b` y frontend `8ece060` sobre PostgreSQL temporal nuevo, creado desde el árbol exacto de backend sin `0024`. El migrador aplicó `0001`–`0023` y `0025` y la segunda pasada devolvió `[]`; el defecto histórico atribuido a `0009_identity_access.sql` no se reprodujo. Integraciones de negocio 14/14, HTTP 3/3, frontend 148/148 y typecheck correcto. Fase 5 queda `Integrated = YES`; Fase 6 no se tocó. El detalle está en `.agents/handoffs/phase5-integration.md`.
# Handoff — Backend, Fase 6 completa (Edge Sync)

## Estado

Backend Fase 6: **COMPLETE**, listo para integración. No se inició Fase 7. La Cloud sigue siendo una topología externa separada y opcional; no se habilita ni se suplanta con la misma base Edge.

## Contratos y rutas

Todos usan la sucursal de la sesión autenticada. Ninguna ruta recibe, acepta ni autoriza por `companyId`/`branchId` enviados por cliente.

| Ruta | Permiso | Resultado |
| --- | --- | --- |
| `POST /sync/push` | `sync.operations.push` | Procesa 1–100 comandos del dispositivo y devuelve resultado individual (`PENDING`, `PROCESSED`, `FAILED` o `CONFLICT`). |
| `GET /sync/conflicts` | `sync.conflicts.view` | Lista únicamente conflictos no resueltos de la sede activa. |
| `POST /sync/conflicts/:operationId/resolve` | `sync.conflicts.resolve` | Descarta explícitamente un conflicto con motivo e `Idempotency-Key`; conserva auditoría. |
| `GET /sync/devices`, `POST /sync/devices`, `POST /sync/devices/:id/deactivate` | existentes | Registro y ciclo de vida de dispositivos. |
| `GET /sync/changes`, `GET /sync/status` | existentes | Feed cursorizado y salud local del outbox. |

`packages/contracts/src/sync.ts` publica `PushSyncOperationsRequestSchema`, `PushSyncOperationsResponseSchema`, `SyncConflictListSchema` y `ResolveSyncConflictRequestSchema`, además de los contratos de dispositivos/PULL ya existentes. Un ejemplo de PUSH es:

```json
{
  "deviceId": "<uuid-del-dispositivo-registrado>",
  "operations": [{
    "operationId": "<uuid-global>",
    "operationName": "employees.update",
    "entityType": "employee",
    "entityId": "<uuid-entidad>",
    "expectedVersion": 3,
    "dependsOnOperationIds": [],
    "schemaVersion": 1,
    "payload": { "firstName": "Ana", "lastName": "López", "expectedVersion": 3, "active": true }
  }]
}
```

El frontend no debe pedir UUIDs al operador: conserva `deviceId` y `operationId` internamente/IndexedDB. Para reintentar, reenvía exactamente la misma operación; no genera otro `operationId`.

## Garantías

- `operationId` no puede reutilizarse para otro dispositivo, sucursal, comando o payload.
- PUSH bloquea el dispositivo, verifica que siga activo y deriva tenancy de acceso actual del usuario.
- Cada comando se reautoriza con su permiso de negocio, no sólo con `sync.operations.push`; una revocación produce fallo por operación sin elevar permisos históricos.
- Dependencias no procesadas y operaciones anteriores del mismo agregado permanecen `PENDING`; operaciones independientes del lote continúan.
- `CatalogConflict` se persiste como `CONFLICT`, separado de `FAILED`; puede auditarse y descartarse de forma explícita. No existe una edición silenciosa ni last-write-wins.
- Los comandos de negocio conservan sus propios límites transaccionales, `SELECT ... FOR UPDATE`, idempotencia, Kardex/outbox y snapshots. El protocolo no calcula ni sustituye reglas monetarias/costos.
- `0026_sync_push_conflicts.sql` es aditiva: agrega hash de solicitud, índices de orden/conflictos y permisos `sync.operations.push`, `sync.conflicts.view`, `sync.conflicts.resolve`.
- `apps/worker/src/sync-worker.ts` reclama outbox con `FOR UPDATE SKIP LOCKED`, reintenta exponencialmente y usa HTTPS sólo cuando ambos `CLOUD_SYNC_URL` y `CLOUD_SYNC_TOKEN` están configurados. Sin ambos valores no consume eventos ni simula una Cloud.

## Verificación

- Typecheck global: correcto.
- Integración PostgreSQL API: 17/17 correcta (incluye PUSH idempotente, dependencias, conflicto, descarte, PULL y dispositivo desactivado).
- HTTP Sync: 3/3 correcta.
- Worker: 2/2 correcta.
- Instalación limpia validada desde el árbol exacto de Fase 6: `0000` + `0001`–`0026`, incluida `0024` y `0026`; segunda pasada `[]`; integración PostgreSQL 17/17 correcta.

## Pendiente de integración

Frontend Fase 6 debe implementar IndexedDB, cola persistente, aplicación de PULL, visualización/resolución UX de conflictos e indicadores ONLINE/LOCAL_ONLY/DEVICE_ONLY contra estos contratos. La configuración/infraestructura de una Cloud consolidada real sigue requiriendo URL, credencial de servicio y receptor Cloud desplegado; no bloquea el backend Edge ni autoriza una segunda escritura operacional.