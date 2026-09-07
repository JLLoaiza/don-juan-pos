# Progreso del proyecto Don Juan POS/ERP

Tabla de estado por fase y agente. Cada agente actualiza únicamente su propia columna al terminar una ejecución. La columna `Integrado` está reservada al proceso de integración/revisión (ChatGPT) — ningún otro agente debe marcarla `YES`.

Estados usados: `PENDING` (no iniciado), `PARTIAL` (avance parcial, ver handoff), `COMPLETE` (terminado y probado), `N/A` (no aplica a este agente).

| Fase | Alcance | Backend (Codex) | Frontend (Claude) | Integrado |
| --- | --- | --- | --- | --- |
| Fase 0 | Workspace, migrador, salud de API, worker de impresión | COMPLETE | N/A | - |
| Fase 1 | Identidad, sesión, contexto de sucursal y permisos | COMPLETE | COMPLETE (login, refresh, selector de sucursal, logout local, snapshot offline de auth) | - |
| Fase 2 | Catálogo e inventario base | COMPLETE | PENDING (placeholder en `/catalog`) | - |
| Fase 3 | Salón: áreas, mesas, cuentas, consumo | PENDING | PENDING (placeholder en `/floor`) | - |
| Fase 4 | Cobro: descuentos, servicio, divisiones, pagos, caja | PENDING | PENDING (placeholders en `/billing`, `/cash`) | - |
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
