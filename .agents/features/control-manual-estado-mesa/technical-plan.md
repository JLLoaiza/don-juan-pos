# Plan técnico — Control manual del estado de una mesa

- **Estado:** `TECHNICALLY_PLANNED`
- **Versión:** `1.0`
- **Definición de producto:** versión `0.2`
- **Última actualización:** `2026-09-10`

## 1. Resumen de la solución

Agregar un comando idempotente y versionado para cambiar una mesa activa a `OCCUPIED` o `AVAILABLE`. La API Edge revalidará permiso, alcance, versión y ausencia de cuenta `OPEN` dentro de una transacción que bloquea la mesa; estado, auditoría y outbox se persistirán juntos. `/floor` expondrá versión y elegibilidad para que la PWA presente en `PendingOrderPage` únicamente la transición contextual.

Ocupar manualmente no abrirá cuentas ni generará consumo, cocina, impresión, inventario, pagos o caja. Una mesa ocupada sin cuenta seguirá admitiendo un pedido: `openAccount` decidirá por la existencia real de cuenta `OPEN`, no solo por el estado. Inspeccionar seguirá sin mutar y confirmar el primer consumo seguirá ocupando.

## 2. Estado actual verificado

- `restaurant_tables.status` ya usa los tres estados, pero no tiene `version` (`bd/sql/initial-ddl.sql`).
- `RestaurantTableSchema` tiene `openAccountId`, sin versión, elegibilidad ni contrato de cambio (`packages/contracts/src/floor.ts`).
- No existe ruta de cambio manual en `apps/api/src/app.ts`.
- `FloorService.command` ya aporta transacción e idempotencia; `audit` y `outbox` participan de ella (`apps/api/src/floor.ts`).
- `openAccount` rechaza todo `OCCUPIED`; `confirmConsumption` ocupa al final de su transacción.
- `BillingService.registerPayment` libera al quedar `PAID` (`apps/api/src/billing.ts`).
- `0002_accounts_integrity.sql` impide más de una cuenta `OPEN`; `0013_floor_consumption_integrity.sql` registra `tables.change_status`.
- Outbox/change feed existen en migraciones `0007` y `0024`.
- `FloorPage` y `PendingOrderPage` hoy no abren una mesa `OCCUPIED` sin cuenta.
- No existe entidad separada “pedido activo”: la actividad vigente queda comprendida por una cuenta `OPEN`; cuentas `PAID`/`VOID` no bloquean.

## 3. Límites y componentes afectados

- Contratos: `packages/contracts/src/floor.ts` e `index.ts` si aplica.
- Backend: `apps/api/src/floor.ts`, `app.ts` y ajuste de liberación en `billing.ts`.
- PWA: `floorApi.ts`, `useFloor.ts`, `FloorPage.tsx`, `PendingOrderPage.tsx`, pruebas y estilos.
- Persistencia: migración incremental propuesta `0029_restaurant_table_status_concurrency.sql`; confirmar ordinal al implementar.
- Se reutilizan auditoría, idempotencia, outbox, change feed y worker existentes.
- Sin impacto funcional: moneda, inventario/Kardex, cocina/impresión, compras y workforce.
- No modificar DDL inicial ni migraciones aplicadas.

## 4. Diseño de dominio y aplicación

### TECH-001 — Contrato versionado y elegibilidad (`PRD-001`, `PRD-004`, `PRD-005`, `PRD-006`, `PRD-007`)

- **Propósito:** representar estado, transición visible e intención concurrente sin tenant en payload.
- **Ubicación:** `packages/contracts/src/floor.ts`.
- **Cambio:** agregar `version`, `canMarkAvailable` y `availabilityBlocker: "OPEN_ACCOUNT_OR_ACTIVE_ORDERS" | null`; request `{ targetStatus: "AVAILABLE" | "OCCUPIED", expectedVersion }` y response con mesa actualizada. No aceptar datos de tenant, actor ni estado anterior.
- **Dependencias:** Zod y contratos compartidos.
- **Validación:** schemas, targets, versión y ausencia de tenant.

### TECH-002 — Comando autoritativo (`PRD-002`, `PRD-003`, `PRD-004`, `PRD-005`, `PRD-006`, `PRD-007`, `PRD-008`)

- **Propósito:** efectuar una transición válida sin efectos comerciales.
- **Ubicación propuesta:** `FloorService.changeTableStatus` en `apps/api/src/floor.ts`.
- **Cambio:** ejecutar vía `FloorService.command` como `tables.change_status`; cargar mesa activa de la sucursal `FOR UPDATE`; comparar versión; para `AVAILABLE`, rechazar cuenta `OPEN`; para `OCCUPIED`, no tocar entidades comerciales; actualizar estado/versión, auditar before/after con origen manual y emitir outbox.
- **No-op:** target vigente devuelve snapshot sin auditoría/outbox adicional; misma clave idempotente devuelve resultado persistido.
- **Validación:** éxito, no-op, versión, cuenta vacía/con consumo, alcance, auditoría, outbox y rollback.

### TECH-003 — Ruta, permiso y errores (`PRD-002`, `PRD-007`)

- **Propósito:** exponer el comando solo en Edge y con permiso.
- **Ubicación propuesta:** `POST /restaurant-tables/:id/status` en `apps/api/src/app.ts`.
- **Cambio:** validar UUID, `Idempotency-Key`, request/response y usar `floorActor(..., ["tables.change_status"])`.
- **Errores:** `403` sin permiso, `409` por versión/intención incompatible y `422` por actividad/transición inválida, sin revelar otra sucursal. Cloud rechaza la mutación.
- **Validación:** HTTP 401/403/409/422, payload, idempotencia, alcance y Cloud.

### TECH-004 — Read model coherente (`PRD-004`, `PRD-005`, `PRD-007`)

- **Propósito:** presentación contextual sin autoridad frontend.
- **Ubicación:** `FloorService.floor` y helper de snapshot.
- **Cambio:** devolver versión; `canMarkAvailable = status === "OCCUPIED" && !openAccount`; poblar blocker con cuenta `OPEN`; reutilizar helper tras comando.
- **Validación:** mesa disponible, ocupada manual, cuenta vacía y cuenta con consumo.

### TECH-005 — Compatibilidad del pedido (`PRD-003`, `PRD-010`)

- **Propósito:** operar mesas ocupadas manualmente y preservar automatismos.
- **Ubicación:** `openAccount`/`confirmConsumption`, pago final, `FloorPage` y `PendingOrderPage`.
- **Cambio:** aceptar `OCCUPIED` sin cuenta y decidir por cuenta real, manteniendo lock e índice único. Confirmación y pago incrementan versión al cambiar estado. La PWA permite pedido para `OCCUPIED` sin cuenta.
- **Validación:** inspección, ocupación manual→pedido, consumo→ocupada, pago→disponible y doble cuenta concurrente.

### TECH-006 — Persistencia incremental (`PRD-006`, `PRD-010`)

- **Propósito:** control optimista uniforme.
- **Ubicación propuesta:** siguiente migración libre, tentativamente `0029_restaurant_table_status_concurrency.sql`.
- **Cambio:** `restaurant_tables.version BIGINT NOT NULL DEFAULT 1 CHECK (version > 0)` e incremento en cambios manuales/automáticos.
- **Backfill:** default determinista `1`.
- **Rollback:** conservar columna; remover solo con migración compensatoria.
- **Validación:** base previa/limpia, constraint e incrementos.

### TECH-007 — Auditoría y réplica (`PRD-008`, `PRD-009`)

- **Propósito:** evidencia y réplica posterior a confirmación local.
- **Ubicación:** `audit`, `outbox`, `audit_logs`, `sync_outbox`, `sync_changes` y worker.
- **Cambio:** evento `restaurant_table.status_changed` con actor, alcance, estados/versiones, timestamp DB y origen `MANUAL`; outbox `tables.change_status` con snapshot/version, todo en la transacción del update. Verificar allowlists.
- **Validación:** commit/rollback conjunto, change feed, reintento, duplicado y recepción Cloud.

### TECH-008 — Experiencia en la mesa (`PRD-001`, `PRD-002`, `PRD-004`, `PRD-005`, `PRD-007`)

- **Propósito:** acción contextual y recuperación autoritativa.
- **Ubicación:** `floorApi.ts`, `FloorPage.tsx`, `PendingOrderPage.tsx`, CSS y componente opcional.
- **Cambio:** agregar cliente; abrir pedido pendiente para `OCCUPIED` sin cuenta; mostrar acción contextual solo con permiso/elegibilidad; refrescar tras éxito.
- **Recuperación:** deshabilitar durante envío; ante 409/422/red no asumir éxito, explicar, recargar y reintentar solo tras conocer estado. Con `openAccountId`, ir a `AccountPage` sin ofrecer liberar.
- **Validación:** permiso, contexto, pending, éxito, conflicto, incertidumbre y navegación.

### TECH-009 — Observabilidad (`PRD-007`, `PRD-008`, `PRD-009`)

- **Propósito:** diagnosticar transición, rechazo y réplica.
- **Ubicación:** logging API, auditoría y estado de réplica.
- **Cambio:** correlacionar comando, `operationId`, mesa, sucursal, resultado y latencia; medir éxito/no-op/bloqueo/conflicto/outbox sin datos sensibles.
- **Validación:** logs correlacionados y consultas de auditoría/outbox.

## 5. Contratos y compatibilidad

- Endpoint: `POST /restaurant-tables/{tableId}/status`, con `Idempotency-Key` UUID.
- Body: `{ "targetStatus": "AVAILABLE" | "OCCUPIED", "expectedVersion": <entero positivo> }`.
- Respuesta: mesa con `version`, `openAccountId`, `canMarkAvailable` y blocker.
- `GET /floor` cambia aditivamente; desplegar contratos/API antes o junto a PWA.
- `RESERVED` no recibe acción; no hay estados nuevos.
- Clientes antiguos ignoran campos aditivos; rutas existentes no cambian.

## 6. Persistencia y migraciones

Solo se agrega `version BIGINT NOT NULL DEFAULT 1 CHECK (version > 0)` a `restaurant_tables`. No hay tablas nuevas, backfill por lotes, reclasificación histórica ni cambios a DDL/migraciones aplicadas. Se reutilizan `audit_logs`, `command_operations`, `sync_outbox` y `sync_changes`. Confirmar ordinal libre al implementar.

## 7. Transacciones, concurrencia e idempotencia

Bloquear mesa, consultar cuenta `OPEN` y actualizar en una transacción. Coordinar orden con `openAccount`. Probar cambios opuestos, liberar contra apertura/confirmación, misma clave, versiones obsoletas y deadlocks. `expectedVersion` detecta UI obsoleta; `operation_id` evita efectos repetidos. Tras resultado incierto, consultar `/floor` antes de otra intención.

## 8. Seguridad, permisos y auditoría

Servidor deriva compañía, sucursal y usuario. Exige sesión, sucursal activa, acceso, `tables.change_status` y mesa/área activas. Cloud rechaza. Auditoría: actor, alcance, mesa, estados/versiones, fecha DB y origen manual.

## 9. Local-first, Edge, Cloud y sincronización

Edge confirma sin WAN y encola atómicamente. Cloud no decide ni reejecuta. Probar caída tras commit, reinicio, duplicados, fuera de orden, aislamiento y recuperación. Cloud conserva versión mayor y hace observable la anomalía.

## 10. Frontend/PWA y experiencia operativa

La acción vive en `PendingOrderPage`. `FloorPage` prioriza `openAccountId`. El frontend usa elegibilidad, pero backend revalida. No se agrega cola IndexedDB: se usa API/PostgreSQL local compartido. Sin servidor local, no se comunica éxito.

## 11. Workers, impresión e integraciones

- Réplica: worker/outbox existentes.
- Impresión, cocina, inventario, Kardex, compras, gastos y workforce: sin impacto.
- Pagos/caja: solo incrementar versión al liberar automáticamente.
- Integraciones externas: ninguna.

## 12. Observabilidad

Correlacionar comando, auditoría y outbox por `operationId`. Medir éxitos, no-op, bloqueos, conflictos, errores, edad/reintentos del outbox y demora Cloud. Alertar `AVAILABLE` con cuenta `OPEN`, sin autocorrección silenciosa.

## 13. Estrategia de pruebas

- **Contrato/unitarias:** schemas, targets, versión, elegibilidad, blocker y ausencia de tenant.
- **HTTP:** auth, permiso, alcance, idempotencia, payload, 409/422 y Cloud.
- **Integración:** transiciones, cero efectos comerciales, bloqueos, histórico cerrado, no-op, versión, audit/outbox/feed, rollback y aislamiento.
- **Concurrencia:** liberar contra apertura/confirmación, cambios opuestos, misma versión, deadlocks e invariante.
- **Frontend:** API, navegación, permiso, acción contextual, pending/doble clic, éxito, conflicto/red y recarga.
- **Regresión:** `AccountPage`, pago final, inspección, primer consumo, migrador y réplica.
- **E2E:** `AC-001` a `AC-011`, autorizaciones y Edge sin WAN.

## 14. Despliegue y compatibilidad entre versiones

1. Migración aditiva Edge y adaptación de réplica Cloud.
2. Contratos/API, comando, auditoría/outbox y automatismos versionados.
3. Verificar consumo, pago y réplica.
4. Desplegar PWA/actualizar service worker.
5. Observar conflictos y demora.

No requiere feature flag si se respeta el orden; en despliegue escalonado, ocultar hasta detectar capacidad. Rollback conserva columna/datos.

## 15. Fases de implementación futura

1. Persistencia/contratos: migración, schemas y pruebas.
2. Aplicación/API: comando, read model, ruta, permiso, audit/outbox.
3. Compatibilidad: `openAccount`, consumo y pago.
4. PWA: cliente, navegación, acción y recuperación.
5. Réplica/observabilidad: duplicados, WAN, orden y diagnósticos.
6. Validación: E2E `AC-001..011`, despliegue y rollback.

Cada fase debe cerrar con pruebas verdes y salida verificable antes de iniciar la siguiente.

## 16. Riesgos y mitigaciones

- Supuesto antiguo `OCCUPIED = cuenta`: decidir por cuenta real y mantener índice.
- Carrera al liberar: lock y consulta en la misma transacción.
- Automatismos sin versión: inventariar escrituras y probar incrementos.
- Réplica fuera de orden: versión monotónica.
- UI antigua: orden de despliegue/service worker.
- Pedido activo sin entidad: cuenta `OPEN` como agregado.
- Deadlocks: orden de locks y pruebas multiconexión.

## 17. Preguntas o bloqueos

No hay decisiones funcionales nuevas ni bloqueos críticos. Aceptar `OCCUPIED` sin cuenta en `openAccount` es consecuencia necesaria del alcance aprobado.

## 18. Matriz de trazabilidad

| Requisito | Elementos técnicos | Pruebas/criterios | Estado |
| --- | --- | --- | --- |
| `PRD-001` | `TECH-001`, `TECH-008` | `AC-001`, UI contextual | Cubierto |
| `PRD-002` | `TECH-002`, `TECH-003`, `TECH-008` | `AC-002`, `AC-007`, auth/scope/UI | Cubierto |
| `PRD-003` | `TECH-002`, `TECH-005` | `AC-002`, cero efectos comerciales | Cubierto |
| `PRD-004` | `TECH-001`, `TECH-002`, `TECH-004`, `TECH-008` | `AC-003..005`, cuenta vacía/con consumo | Cubierto |
| `PRD-005` | `TECH-001`, `TECH-002`, `TECH-004`, `TECH-008` | `AC-001`, `AC-008`, render/no-op | Cubierto |
| `PRD-006` | `TECH-001`, `TECH-002`, `TECH-006` | `AC-003`, `AC-006`, concurrencia/versión | Cubierto |
| `PRD-007` | `TECH-001..004`, `TECH-008`, `TECH-009` | `AC-006`, `AC-008`, errores/reload | Cubierto |
| `PRD-008` | `TECH-002`, `TECH-007`, `TECH-009` | `AC-002`, `AC-003`, `AC-011`, auditoría | Cubierto |
| `PRD-009` | `TECH-007`, `TECH-009` | `AC-009`, Edge/WAN/outbox/réplica | Cubierto |
| `PRD-010` | `TECH-005`, `TECH-006` | `AC-010`, inspección/consumo/pago | Cubierto |

| Criterio | Requisitos | TECH | Evidencia prevista |
| --- | --- | --- | --- |
| `AC-001` | `PRD-001`, `005` | `TECH-001`, `004`, `008` | Acción contextual en `PendingOrderPage` |
| `AC-002` | `PRD-002`, `003`, `008` | `TECH-002`, `003`, `007`, `008` | Ocupación sin efectos + audit |
| `AC-003` | `PRD-004`, `006`, `008` | `TECH-002`, `004`, `006`, `007` | Liberación, versión y audit |
| `AC-004` | `PRD-004` | `TECH-002`, `004`, `008` | Cuenta vacía bloquea UI/backend |
| `AC-005` | `PRD-004` | `TECH-002`, `004`, `008` | Consumo bloquea UI/backend |
| `AC-006` | `PRD-006`, `007` | `TECH-002`, `006`, `008`, `009` | Carrera, rechazo y reload |
| `AC-007` | `PRD-002` | `TECH-003`, `008` | HTTP 403/scope/UI |
| `AC-008` | `PRD-005`, `007` | `TECH-002`, `008` | No-op y estado vigente |
| `AC-009` | `PRD-009` | `TECH-007`, `009` | Edge sin WAN y réplica posterior |
| `AC-010` | `PRD-010` | `TECH-005`, `006` | Inspección/consumo/pago |
| `AC-011` | `PRD-008` | `TECH-002`, `007`, `009` | Auditoría completa |

## 19. Referencias inspeccionadas

- Instrucciones del cluster, definición aprobada, handoff y expediente.
- Arquitectura local-first, plan de implementación, especificaciones de mesas, acceso y sync.
- Bug `floor-mesa-disponible-ocupada-al-inspeccionar` y handoffs.
- Contratos de floor/errores/index.
- API `app.ts`, `floor.ts`, `billing.ts` y pruebas.
- PWA `features/floor/` y pruebas.
- DDL; migraciones `0002`, `0007`, `0013`, `0014`, `0015`, `0024`, `0027`.
- Migrador, worker/transportes de réplica e infraestructura Edge/Compose.
