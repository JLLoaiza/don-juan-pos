# Progreso del proyecto Don Juan POS/ERP

Tabla de estado por fase y agente. Cada agente actualiza únicamente su propia columna al terminar una ejecución. La columna `Integrado` está reservada al proceso de integración/revisión (ChatGPT) — ningún otro agente debe marcarla `YES`.

Estados usados: `PENDING` (no iniciado), `PARTIAL` (avance parcial, ver handoff), `COMPLETE` (terminado y probado), `N/A` (no aplica a este agente).

| Fase | Alcance | Backend (Codex) | Frontend (Claude) | Integrado |
| --- | --- | --- | --- | --- |
| Fase 0 | Workspace, migrador, salud de API, worker de impresión | COMPLETE | N/A | - |
| Fase 1 | Identidad, sesión, contexto de sucursal y permisos | COMPLETE | COMPLETE (login, refresh, selector de sucursal, logout local, snapshot offline de auth) | - |
| Fase 2 | Catálogo e inventario base | COMPLETE | COMPLETE (inventario, acompañamientos, productos y precio en `/catalog`) | - |
| Fase 3 | Salón: áreas, mesas, cuentas, consumo | COMPLETE | COMPLETE (salón, cuenta y consumo en `/floor` y `/floor/accounts/:id`) | - |
| Fase 4 | Cobro: descuentos, servicio, divisiones, pagos, caja | PARTIAL (pagos directos y apertura de caja) | PENDING (placeholders en `/billing`, `/cash`) | - |
| Fase 5 | Compras, gastos, Kardex, empleados | PENDING | PENDING (placeholders en `/procurement`, `/workforce`) | - |
| Fase 6 | Sincronización Edge completa (outbox, pull, conflictos) | PENDING | PARTIAL (conectividad ONLINE/DEVICE_ONLY real; sin cola de comandos aún — ver `/sync`) | - |
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
