# Handoff — Claude (frontend)

## Fase realizada

Fase 6 — Frontend administrativo cloud de solo lectura sobre la arquitectura
local-first (`.agents/architecture/local-first-edge-replication.md`), contra
los contratos y rutas `replication/*` publicados por Codex en `2760cfc` y
`a7abb0c`. Estado: **PARTIAL** — la parte construible con el contrato actual
está completa, probada y verificada en vivo; dos capacidades pedidas
(selector de sede en la nube y panel consolidado real multi-sede) están
bloqueadas por una decisión de backend, documentada con precisión abajo.

No se tocó `/sync/*`, `DEVICE_ONLY`, PULL de navegador, IndexedDB, edición
remota de catálogo/precios/inventario ni facturación electrónica. No se
avanza a Fase 7.

## Rutas consumidas (reales, ninguna mockeada)

- `GET /replication/status` — única fuente de estado; el propio
  `deploymentMode` de la respuesta decide si se renderiza la vista Edge o
  la vista Cloud.
- `GET /replication/cloud/entities` — sólo se invoca cuando el estado
  resuelto es `deploymentMode: "cloud"`.

No se llamó nunca a `/replication/cloud/enrollment-tokens`,
`/replication/cloud/enroll` ni `/replication/cloud/events`: son operaciones
de enrolamiento/ingesta técnica, no de la experiencia de consulta pedida.

## Pantalla

`/replication` (`apps/web/src/features/replication/`, nav "Réplica"),
reemplaza el placeholder antiguo `/sync` (`SyncPage.tsx`, eliminado — describía
`sync_operations`/`sync_outbox`/`sync_changes`, el diseño explícitamente
sustituido por la arquitectura local-first).

- **Modo Edge** (`deploymentMode: "edge"`): tarjeta de la sede (nombre desde
  `auth.context.activeBranch`, real), ID del servidor Edge, pendientes/con
  error/replicados y última réplica enviada (`outbox.*`). Sin selector de
  sede — texto explícito indicando que la sede queda derivada del servidor.
  Aviso si hay operaciones con error.
- **Modo Cloud** (`deploymentMode: "cloud"`): selector de sede (reutiliza
  `auth.context.branches`/`activeBranch`/`setActiveBranch`, el mismo
  mecanismo ya usado en Fase 1), tarjeta de estado (servidor Edge, activo/
  inactivo, última sincronización, eventos replicados), aviso de datos
  desactualizados cuando `stale`, aviso si no hay servidor enrolado, consulta
  de réplica agrupada por `entityType` con filtro y payload crudo inspeccio-
  nable (sin asumir campos no garantizados por el contrato — `payload` es
  `z.unknown()`), y un panel "consolidado" que lista todas las sedes
  autorizadas con el estado real de la sede activa y una nota explícita para
  el resto (ver bloqueo).

Manejo de errores: `ErrorState` con variantes `unauthenticated` (401),
`forbidden` (403, mensaje menciona `replication.status.view`), `network`
(servidor sin conexión) y `server`.

## Bloqueos de contrato encontrados y documentados (no se modificó backend)

### 1. `POST /me/active-branch` está bloqueado en un despliegue Cloud

`apps/api/src/app.ts:30-32` rechaza con `403` cualquier método no
GET/HEAD/OPTIONS fuera de `/auth/*` y `/replication/cloud/*` cuando
`SERVER_ROLE=cloud`. `POST /me/active-branch` no está exento, así que **no
hay forma de cambiar de sede activa desde el navegador en Cloud**, ni para un
usuario que ya tiene una sede activa ni, más grave, para uno que aún no la
tiene: `GET /replication/status` también exige `activeBranch` no nulo
(`floorActor`), y ese campo sólo se resuelve solo si el usuario tiene
exactamente una sucursal autorizada (`apps/api/src/auth.ts:57`). Un
administrador Cloud con dos o más sedes autorizadas y sin `active_branch_id`
ya persistido queda permanentemente bloqueado: no puede elegir ninguna sede
ni ver el estado de ninguna.

**Verificado, no sólo leído:**
- Prueba `app.inject` directa contra `buildApi` real (`deploymentMode:
  "cloud"`): `POST /me/active-branch` → `403`; `GET /replication/status` con
  `activeBranch: null` → `403`.
- Repetido contra una instancia Cloud real corriendo (Postgres real,
  `SERVER_ROLE=cloud`, usuario admin autenticado con sesión válida):
  `POST /me/active-branch` → `403` real.

**Efecto en los requisitos pedidos.** El selector de sede (ítem 2) sólo
funciona hoy para la sede que ya viene activa en la sesión (login con una
sola sucursal autorizada, o `active_branch_id` ya persistido por otro medio);
un intento real de cambiar de sede en Cloud siempre falla, y el frontend lo
muestra con un aviso explícito que cita el archivo/línea real. El panel
"consolidado" (ítem 5) sólo puede mostrar el estado real de la sede activa;
para las demás sedes autorizadas muestra su nombre (dato real de
`auth.context.branches`) con una nota de bloqueo, en vez de inventar datos o
iterar silenciosamente cambiando la sede activa de la sesión (que además
fallaría de inmediato).

**Decisión pendiente de backend/arquitectura** antes de poder cerrar estos
dos ítems: exentar `POST /me/active-branch` del candado de sólo-lectura en
Cloud (es un cambio de contexto de lectura, no una escritura operacional de
sucursal), o publicar una consulta de estado que no dependa de la sucursal
activa de sesión (p. ej. `branchId` como parámetro validado contra las sedes
autorizadas del usuario, o un endpoint que devuelva el estado de todas las
sedes autorizadas en una sola llamada).

### 2. `GET /health` exige autenticación en un Edge ya enrolado

`apps/api/src/app.ts:25-29` aplica el candado "este servidor local sólo
opera su sucursal enrolada" a **toda** ruta que no empiece por `/auth/` o
`/replication/cloud/*` (ni siquiera excluye `/health`) en cuanto
`localBranchId` deja de ser `null` (es decir, en cuanto el servidor Edge está
enrolado). `apps/web/src/lib/connectivity/useConnectivity.ts` llama
`GET /health` sin credenciales cada 15s para pintar el badge/aviso "SERVIDOR
NO DISPONIBLE" del `AppShell`.

**Efecto verificado en vivo** (Edge real, enrolado, con la API sana):
`/health` responde `401`, así que el badge global marca permanentemente
"Sin conexión al servidor" / "SERVIDOR NO DISPONIBLE" aunque el servidor y la
réplica funcionen correctamente — visible en la captura tomada durante esta
verificación. No es un defecto de `/replication/*` ni de la pantalla nueva;
es un efecto secundario del candado de sucursal aplicado sin excepción a un
endpoint de salud público preexistente (Fase 0). Lo documento aquí porque
sólo se manifiesta con una instalación Edge realmente enrolada — algo que
no existía en el repositorio hasta esta verificación — y afecta a toda la
aplicación, no sólo a Réplica. No lo corregí: es `apps/api/src/app.ts`,
fuera de mi alcance en esta fase.

**Sugerencia para Codex:** excluir `/health` (además de `/auth/*` y
`/replication/cloud/*`) del hook de bloqueo de sucursal.

## Verificación en vivo (Edge y Cloud reales, sin mocks)

Se levantaron, fuera del árbol del repositorio (contenedores/procesos
descartables, ya detenidos y eliminados), un Postgres Edge y un Postgres
Cloud independientes, migrados hasta `0027`, con un enrolamiento real
(`POST /replication/cloud/enrollment-tokens` → `POST /replication/cloud/enroll`),
un servidor Edge y worker reales (`apps/api`, `apps/worker` vía `tsx`, sin
Docker) y una operación de dominio real (`POST /dining-areas`) replicada de
punta a punta por el worker (`sync_outbox` → `POST /replication/cloud/events`).
Con eso:

- `apps/web` apuntado al Edge real (`VITE_API_BASE_URL` por defecto,
  `localhost:3000`): login con el usuario de desarrollo, `/replication`
  muestra la sede ("Don Juan Centro"), 0 pendientes, 0 con error, 1
  replicado, hora real de última réplica.
- `apps/web` apuntado al Cloud real (`localhost:3100`): login independiente
  (la sesión del Edge es rechazada correctamente por ser otro backend),
  `/replication` muestra servidor "Servidor Centro validacion", estado
  Activo, última sincronización real, `dining_area (1)` con el payload JSON
  real (`{"id":...,"name":"Terraza validacion","active":true}`) al expandir,
  y el panel consolidado con esa única sede autorizada.
- Confirmado con `read_console_messages`/`read_network_requests` que, tras el
  login correcto, todas las llamadas a `/replication/status` y
  `/replication/cloud/entities` devuelven `200` sin errores.

## Tests

`pnpm -w typecheck`: correcto. `pnpm --filter @don-juan/web test`: **157/157**
(nuevos: `replicationApi.test.ts`, `ReplicationPage.test.tsx` con 8 casos —
edge sin selector, aviso de error de outbox, cloud con selector/entidades,
cloud de una sola sede sin panel de aviso, 403 real al intentar cambiar de
sede, 401/403/red — más el test de `/replication` en `App.test.tsx`
reemplazando el de `/sync`). No se tocó `apps/api`, `packages/contracts` ni
migraciones.

## Lo que no se tocó

`apps/**` backend, `packages/contracts/**`, `infra/db/migrations/**`. El
archivo de depuración usado para diagnosticar el bloqueo #1
(`apps/api/src/__scratch_cloud_active_branch.test.ts`) se creó y se borró
dentro de esta misma sesión; no queda en el árbol de trabajo.

## Siguiente fase frontend esperada

Ninguna todavía. Fase 7 no se inició. Si se toma la decisión de backend para
los bloqueos #1/#2, el selector de sede y el panel consolidado de Réplica
pueden completarse sin rediseño — sólo falta la ruta/regla de backend.
