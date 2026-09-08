# Progreso del proyecto Don Juan POS/ERP

Tabla de estado por fase y agente. Cada agente actualiza únicamente su propia columna al terminar una ejecución. La columna `Integrado` está reservada al proceso de integración/revisión (ChatGPT) — ningún otro agente debe marcarla `YES`.

Estados usados: `PENDING` (no iniciado), `READY` (desbloqueado pero no iniciado), `PARTIAL` (avance parcial, ver handoff), `COMPLETE` (terminado y probado), `N/A` (no aplica a este agente).

| Fase | Alcance | Backend (Codex) | Frontend (Claude) | Integrado |
| --- | --- | --- | --- | --- |
| Fase 0 | Workspace, migrador, salud de API, worker de impresión | COMPLETE | N/A | - |
| Fase 1 | Identidad, sesión, contexto de sucursal y permisos | COMPLETE | COMPLETE (login, refresh, selector de sucursal, logout local, snapshot offline de auth) | - |
| Fase 2 | Catálogo e inventario base | COMPLETE | COMPLETE (inventario, acompañamientos, productos y precio en `/catalog`) | - |
| Fase 3 | Salón: áreas, mesas, cuentas, consumo | COMPLETE | COMPLETE (salón, cuenta y consumo en `/floor` y `/floor/accounts/:id`) | - |
| Fase 4 | Cobro: descuentos, servicio, divisiones, pagos, caja | COMPLETE | COMPLETE | YES |
| Fase 5 | Compras, gastos, Kardex, empleados | COMPLETE | COMPLETE | YES |
| Fase 6 | Local-first: servidor por sede + réplica cloud (`replication/*`) | COMPLETE | COMPLETE (`/replication`: estado y consulta de réplica reales, selector multi-sede en Cloud y `/health` público en Edge, verificados en vivo tras `ac5181e`) | - |
| Fase 7 | Reportes y operación a escala | PENDING | PENDING (placeholder en `/reports`) | - |

## Notas de la fase actual (Fase 1, frontend)

- Contratos consumidos: `POST /auth/login`, `POST /auth/refresh`, `GET /me/context`, `POST /me/active-branch` (todos de `@don-juan/contracts`, ya publicados por Codex).
- Verificado en vivo contra la API real (Compose) con el usuario de desarrollo (`admin` / sucursal única "Don Juan Centro"): login, persistencia de sesión tras recarga, selector de sucursal (solo texto para 1 sucursal), logout, manejo de 401/red.
- Detalle completo en `.agents/handoffs/claude-latest.md`.

## Nota backend — corrección de contexto (2026-09-07)

Fase 1 sigue `COMPLETE`. El contrato público dejó de requerir/exponer compañía: login por credenciales y selección exclusiva de `branch_id`; la compañía se deriva internamente desde sesión y usuario. Ver `.agents/handoffs/codex-latest.md`.

## Nota frontend — adaptado al contrato corregido (2026-09-07)

`apps/web` ya no pide ni envía `companyId` en ningún punto (formulario, estado, tipos, tests). Una sola sucursal entra automáticamente; varias sucursales muestran el selector con `activeBranch: null` hasta elegir. Sin selección de compañía en ninguna pantalla. Ver `.agents/handoffs/claude-latest.md`.

## Nota backend — Fase 2 (2026-09-07)

Catálogo, recetas de un nivel, costo derivado, Kardex inmutable, ajustes concurrentes e idempotencia HTTP están `COMPLETE` para backend. Contratos y rutas en `.agents/handoffs/codex-latest.md`; frontend permanece pendiente.

## Nota frontend — Fase 2 (2026-09-07)

Frontend `COMPLETE` contra los contratos ya publicados por Codex: inventario (listar/buscar/filtrar/crear/editar/ajustar stock), acompañamientos (crear/editar con receta) y productos (crear/editar con receta + adicionales, y precio vía margen/utilidad/precio fijo resuelto siempre por el servidor). Costo y margen solo se muestran cuando el backend los devuelve (permiso `*.view_cost`); acciones de escritura ocultas sin el permiso correspondiente. Verificado en vivo contra API+PostgreSQL reales (crear ítem → acompañamiento → producto → cambiar precio por margen objetivo → ajustar stock a negativo, sin bloqueos). Dos vacíos de contrato menores documentados (no bloquean): `ProductSchema` no incluye `notes` en la lectura, y la respuesta de `adjust` no tiene schema publicado en `packages/contracts`. Detalle completo en `.agents/handoffs/claude-latest.md`.

## Nota backend — Fase 3 (2026-09-07)

Backend `COMPLETE`: contratos de salón, mesas, cuenta y confirmación transaccional de consumo disponibles; incluye Kardex, snapshots, ticket de cocina, print job, auditoría, outbox e idempotencia. Ver `.agents/handoffs/codex-latest.md`.

## Nota frontend — Fase 3 (2026-09-07)

Frontend `COMPLETE` contra los contratos publicados por Codex: vista de salón agrupada por área con mesas coloreadas por estado (disponible/ocupada/reservada), creación de áreas y mesas (`dining_areas.create`/`tables.create`), abrir cuenta desde una mesa disponible/reservada, vista de cuenta con ítems/adicionales/totales, y confirmación de consumo (selección de productos, adicionales configurados con opción "sin costo", notas) que muestra el ticket de cocina y las alertas de stock negativo devueltas por el servidor sin bloquear la venta. Verificado en vivo end-to-end contra API+PostgreSQL reales: crear área → crear mesa → abrir cuenta → confirmar consumo → mesa pasa a "Ocupada" → alerta de stock negativo mostrada correctamente. Un vacío de contrato detectado (no bloquea, ver `.agents/coordination.md`): `AccountItemSnapshotSchema.unitCost` no es nullable y el backend siempre lo envía, a diferencia de `products.view_cost` en catálogo; el frontend oculta la columna igualmente sin el permiso pero el dato ya viaja en la respuesta HTTP. Detalle completo en `.agents/handoffs/claude-latest.md`.

## Nota backend — Fase 4 parcial (2026-09-07)

Contratos publicados y backend disponible para snapshot de cobro, apertura de caja y pagos directos. Descuentos, servicio, divisiones, cierre y ajustes permanecen pendientes; ver .agents/handoffs/codex-latest.md.

## Nota frontend — Fase 4 parcial (2026-09-07)

Frontend `PARTIAL` contra lo que Codex publicó como rutas reales: dentro de `/floor/accounts/:id` se agregó una sección "Cobro" con el snapshot de cuenta (pagado, saldo pendiente, descuentos, servicio, historial de pagos), formulario para aplicar descuento (`sales.apply_discount`) y para configurar servicio (`sales.modify_service`); ambos se ocultan una vez `hasPayments` es verdadero, igual que el propio backend bloquea cambios comerciales tras el primer pago (también oculté "Agregar consumo" en ese caso, ya que el backend lo rechaza aunque la cuenta siga `OPEN`). Registrar un pago nuevo y abrir sesión de caja NO se implementaron: no existe ningún endpoint para listar métodos de pago activos ni cajas registradoras de la sucursal, así que no hay forma de ofrecer esos selectores sin inventar datos; se muestra un aviso explicando esto a quien tiene `payments.create`. Detalle completo en `.agents/handoffs/claude-latest.md`.

## Nota frontend — Fase 4 cierre (2026-09-07)

Frontend `COMPLETE`: Codex publicó `GET /payment-methods`, `GET /cash-registers`, `GET /cash-registers/:id/open-session`, `POST /cash-sessions/:id/adjustments` y `POST /cash-sessions/:id/close`, así que se completó lo que quedaba pendiente. Nuevo selector de método de pago y registro de pago (efectivo con caja+recibido+cambio, tarjeta/QR sin esos campos) dentro de la cuenta; pantalla `/cash` completa (antes placeholder) con listado de cajas, abrir/ajustar/cerrar sesión. Verificado en vivo end-to-end: abrir caja → cobrar en efectivo con cambio correcto → cuenta pasa a Pagada → mesa vuelve a Disponible; abrir/ajustar/cerrar caja con diferencia negativa mostrada correctamente. Se corrigieron dos bugs reales encontrados durante esa verificación (uno de contrato compartido, uno propio) — ver `.agents/coordination.md` y `.agents/handoffs/codex-frontend-latest.md` para el detalle completo. `pnpm -w typecheck`/`pnpm -w test`: correctos (139/139 en `apps/web`, sin romper las pruebas de `apps/api`). No avanza a Fase 5.

## Integración — Fase 4 completa (2026-09-07)

Backend y frontend integrados satisfactoriamente. `GET /payment-methods`, cajas/sesiones, pagos, ajustes y cierres respetan la sucursal derivada de sesión, permisos backend, versiones e idempotencia. `pnpm --filter @don-juan/api test:integration` pasó 10/10 contra PostgreSQL local; `pnpm -w typecheck` pasó. La suite global de migraciones sigue exponiendo un defecto histórico de `0009_identity_access.sql` contra el DDL base (`user_roles.id`), ajeno a Fase 4 y no se reescribió para preservar checksums. Fase 5 queda READY y no se retoma.
## Nota frontend — Fase 5 completa (2026-09-07)

Frontend **COMPLETE** contra los contratos de compras, gastos, Kardex, proveedores, empleados, turnos, bonos y pagos/anulaciones de empleado. Las pantallas `/procurement` y `/workforce` consumen exclusivamente rutas reales, con claves de idempotencia para toda mutación, selectores legibles, invalidación al cambiar sede y confirmación explícita de anulaciones. No exponen ni envían `companyId`/`branchId`, y los cálculos de inventario, efectivo y nómina se mantienen en backend. `pnpm --filter @don-juan/web test` pasó 147/147 y `pnpm -w typecheck` pasó. La integración posterior quedó satisfactoria; no se avanzó a Fase 6. Ver `.agents/handoffs/codex-frontend-latest.md`.
## Integración — Fase 5 completa (2026-09-07)

Backend y frontend integrados satisfactoriamente para proveedores, compras, gastos, Kardex, empleados, turnos, bonos y pagos/anulaciones de empleado. Las rutas reales derivan la sucursal de la sesión, mantienen permisos como autoridad backend y no aceptan `companyId` ni `branchId` de cliente. Las mutaciones usan idempotencia, las anulaciones son compensatorias y confirmadas explícitamente en UI, y el navegador no calcula costo, efectivo ni nómina de forma autoritativa. Validado con `pnpm --filter @don-juan/api test:integration` contra PostgreSQL local: 13/13; API: 38 pasaron (26 omitidas sin variable de entorno); web: 147/147; `pnpm -w typecheck`: correcto. Fase 6 queda PENDING y no se inició.
## Nota backend — Fase 6, primer slice Edge (2026-09-07)

Backend `PARTIAL`: se publicaron registro/desactivación de dispositivos, `GET /sync/status` y PULL branch-scoped con cursor monotónico; el feed nace transaccionalmente desde el outbox existente. La migración `0024_sync_protocol_core.sql` fue aplicada a PostgreSQL local y las integraciones pasaron 15/15. PUSH, IndexedDB, conflictos y el transporte a una Cloud separada siguen pendientes; no se implementó Fase 7. Ver `.agents/handoffs/codex-latest.md` y `.agents/coordination.md`.
## Hotfix backend — Fase 5: normalización DATE de personal (2026-09-07)

Se corrigió un 400 post-commit en las respuestas de tarifas, turnos, bonos y pagos de empleado: PostgreSQL podía entregar `DATE` como `Date` y el mapper devolvía una cadena no ISO. El backend ahora emite siempre `YYYY-MM-DD` sin conversión de zona horaria, y `0025_workforce_date_response_repair.sql` sanea los resultados históricos del ledger idempotente para que un retry no reciba el mismo 400 ni duplique la operación. La migración se aplicó a PostgreSQL local; integración 16/16, API 42 correctas y typecheck global correcto. Fase 5 backend sigue COMPLETE; Fase 6 no se retomó en este ciclo.
## Nota frontend — Fase 5, verificación en vivo tras el hotfix de fechas y dos correcciones propias (2026-09-07)

Con el hotfix backend de fechas ya aplicado, verifiqué en vivo end-to-end el flujo completo de `/procurement` y `/workforce` contra API + PostgreSQL reales: proveedor → compra confirmada (con línea de inventario, Kardex actualizado, costo promedio recalculado) → anulación de compra → gasto confirmado → empleado → tarifa por hora → marcar entrada → marcar salida (bloqueada correctamente sin cobertura de tarifa, luego exitosa con cobertura completa) → bono → pago de turno incluyendo el bono (total calculado por el servidor) → anulación de pago. Todo consumido contra rutas reales, sin mocks.

Encontré y corregí dos bugs propios del frontend durante esa verificación:

1. **`ProcurementPage.tsx` — el selector de ítems para una compra no filtraba por `active`.** A diferencia de `ProductComponentsEditor.tsx`/`InventoryComponentsEditor.tsx` (que sí filtran), el formulario de compra ofrecía ítems de inventario desactivados; el backend los rechaza correctamente (`422`), pero el usuario podía seleccionarlos sin ninguna señal previa. Corregido filtrando a `inventoryItems.filter(x => x.active)` antes de pasarlos al formulario.
2. **`WorkforcePage.tsx` — el botón "Registrar salida" no manejaba ningún error.** `onClick={() => void api.clockOut(x.id, {}).then(afterMutation)}` no tenía `.catch`; un rechazo (por ejemplo, turno sin cobertura completa de tarifa) quedaba como una promesa no manejada, sin ningún aviso visible para el cajero — justo el tipo de caso que la regla "maneja errores de validación de manera clara" busca cubrir. Corregido con un manejador que captura el error y lo muestra en un `Banner`, igual que el resto de mutaciones de esta página. Se agregó una prueba en `WorkforcePage.test.tsx` que cubre este caso.

`pnpm -w typecheck` correcto; `pnpm --filter @don-juan/web test` 148/148 (147 previas + la nueva prueba de este bug). Fase 5 frontend queda `COMPLETE` y verificado en vivo con el backend ya corregido. No se avanza a Fase 6.

## Integración — Fase 5 verificada en instalación limpia (2026-09-07)

La integración entre backend `de7f54b` y frontend `8ece060` quedó satisfactoria. Se creó una base PostgreSQL temporal desde el árbol exacto del commit backend, sin la migración local no confirmada `0024`. El migrador aplicó `0001`–`0023` y `0025`, y una segunda ejecución devolvió `[]`; `0009_identity_access.sql` no bloqueó la instalación. Integraciones de negocio 14/14, HTTP 3/3, frontend 148/148 y typecheck global correcto. Fase 5 mantiene `Integrated = YES`; Fase 6 no se inició en esta integración. Ver `.agents/handoffs/phase5-integration.md`.
## Nota backend — Fase 6 completa (2026-09-07)

El carril backend Edge Sync está **COMPLETE** y preparado para integración: dispositivos branch-scoped, PULL cursorizado, PUSH por lotes con resultados individuales, deduplicación por `operationId`, orden por entidad/dependencias, reautorización por comando y conflictos explícitos/resolubles por descarte auditado. El outbox permanece transaccional y el worker sólo entrega hacia una Cloud si `CLOUD_SYNC_URL` y `CLOUD_SYNC_TOKEN` se configuran explícitamente; de otro modo conserva eventos pendientes sin alterar el escritor Edge. La UI/IndexedDB es responsabilidad frontend y sigue `PARTIAL`; Fase 7 no se inició. Instalación limpia desde el árbol exacto de Fase 6: migraciones `0000` + `0001`–`0026` y segunda pasada vacía; integraciones PostgreSQL 17/17.

## Nota documental — Arquitectura local-first formalizada (2026-09-08)

Se formalizó `.agents/architecture/local-first-edge-replication.md` como
arquitectura autoritativa de topología, autoridad de datos y alcance
(servidor local por sede como autoridad operativa, réplica hacia la nube, sin
catálogos globales, sin operación remota en tiempo real ni facturación
electrónica en este alcance). Es documental únicamente y no cambia el estado
de ninguna fase: Fase 6 backend sigue en progreso (Codex) y el frontend de
Fase 6 sigue sin iniciar por instrucción del gestor. Ver
`.agents/coordination.md` (2026-09-08) y la nota agregada en
`.agents/offline-sync-edge.md`.

## Nota frontend — Fase 6, admin cloud de solo lectura (2026-09-08)

Frontend `PARTIAL` contra `packages/contracts/src/replication.ts` y las
rutas `replication/*` (commits backend `2760cfc`/`a7abb0c`). Pantalla nueva
`/replication` (reemplaza el placeholder `/sync`, eliminado): estado y
consulta de réplica reales para la sede activa, tanto en modo Edge
(pendientes/con error/replicados del outbox local) como en modo Cloud
(servidor, actividad, última sincronización, réplica agrupada por tipo de
dato). Verificado en vivo de punta a punta contra un Edge y un Cloud reales
(Postgres + `apps/api` + `apps/worker`, sin Docker, enrolamiento real,
operación de dominio replicada de extremo a extremo). `pnpm -w typecheck`
correcto; `pnpm --filter @don-juan/web test` 157/157.

Dos capacidades pedidas quedan bloqueadas por una decisión de backend, no
por falta de tiempo: (1) `POST /me/active-branch` está bloqueado con `403`
en todo despliegue Cloud (`apps/api/src/app.ts:30-32`), así que no hay forma
real de cambiar de sede activa desde el navegador — confirmado con una
prueba `app.inject` y en vivo contra un Cloud real; esto bloquea el selector
multi-sede y el panel consolidado real (ambos construidos hasta donde el
contrato lo permite, con avisos explícitos citando el bloqueo en vez de
datos inventados). (2) `GET /health` exige autenticación en cuanto un Edge
queda enrolado (`apps/api/src/app.ts:25-29` no exceptúa `/health`), lo que
deja el badge global "SERVIDOR NO DISPONIBLE" permanentemente encendido en
un Edge real y sano — confirmado en vivo con captura de pantalla. Detalle
completo, con las rutas exactas y la evidencia de cada verificación, en
`.agents/handoffs/claude-latest.md` y `.agents/coordination.md`. No se
avanza a Fase 7.

## Nota frontend — Fase 6 cierre (2026-09-08)

Frontend `COMPLETE`. Backend corrigió los dos bloqueos anteriores en
`ac5181e` (exenta `/health` de ambos candados de sólo-lectura; exenta
`POST /me/active-branch` del candado Cloud). Se ajustó únicamente el copy de
`ReplicationPage.tsx` que ya no reflejaba la realidad (mensaje de bloqueo
permanente al cambiar de sede, aviso "Panel consolidado parcial") y se
unificó el cambio de sede entre el `<select>` y las filas de la nueva
sección "Sedes autorizadas"; ningún otro comportamiento cambió. Verificado
en vivo contra un Edge y un Cloud reales, esta vez con un usuario admin
autorizado en dos sedes: el selector (en sus tres puntos de entrada — barra
superior, selector propio de `/replication`, filas de la tabla) cambia de
sede correctamente y el panel se actualiza con datos reales y honestos por
sede; `/health` de un Edge enrolado responde `200` sin credenciales y el
badge global muestra "En línea". Reglas local-first re-confirmadas sin
regresión (`grep` limpio de `/sync`, `IndexedDB`, `DEVICE_ONLY`). `pnpm -w
typecheck` correcto; `pnpm --filter @don-juan/web test` 159/159 (2 pruebas
nuevas, una reescrita). No se avanza a Fase 7. Detalle completo en
`.agents/handoffs/claude-latest.md` y `.agents/coordination.md`.