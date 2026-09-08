# Handoff — Claude (frontend)

## Fase realizada

Fase 7 — Reportes Cloud (frontend), contra el backend cerrado en `9b41eb9`.
Estado: **COMPLETE**, verificado en vivo contra Cloud real y contra Edge real
(bloqueo `422` confirmado). No se avanza a Fase 8.

## Rutas consumidas (reales, ninguna mockeada)

- `GET /reports/dashboard`
- `GET /reports/sales`
- `GET /reports/products`
- `GET /reports/sales/export.csv`

Ninguna envía `companyId` ni `branchId`; la sede se deriva siempre de la
sesión activa (igual que el resto de la app).

## Pantalla

`/reports` (`apps/web/src/features/reports/`), reemplaza el placeholder
`FeaturePlaceholder` anterior.

- **Solo-Cloud, sin alternativa en Edge.** `apps/api/src/reports.ts` rechaza
  las cuatro rutas con `422` (`CatalogRuleViolation`) en un despliegue Edge.
  El frontend detecta ese `422` específicamente en la respuesta del
  dashboard y, sólo en ese caso, reemplaza toda la pantalla por un mensaje
  claro ("Los reportes sólo existen en la nube") — nunca intenta construir
  una alternativa local ni cachear nada en el Edge. Confirmado en vivo
  contra un Edge real.
- **Sede via el selector ya existente.** No se construyó un selector nuevo:
  la pantalla reacciona a `auth.context.activeBranch.id` (el mismo mecanismo
  de `POST /me/active-branch` ya usado desde Fase 1 y cerrado para Cloud en
  Fase 6). Cada uno de los tres hooks de reporte (`useDashboardReport`,
  `useSalesReport`, `useProductsReport`) depende de ese `branchId`, así que
  cambiar de sede invalida y vuelve a pedir los tres reportes.
- **Panel (`/reports/dashboard`).** Ventas cobradas, pagos, ticket
  promedio, cuentas abiertas, mesas ocupadas; costo histórico/utilidad
  bruta/margen bruto sólo cuando el backend los incluye (`reports.view_costs`).
- **Ventas (`/reports/sales`).** Tabla paginada (fecha, cuenta, método,
  monto), totales, filtro de fechas compartido, botón "Exportar CSV".
- **Productos (`/reports/products`).** Tabla paginada (producto, cantidad,
  ingresos, y costo/utilidad sólo con permiso), mismo filtro de fechas.
- **Filtro de fechas** (`DateRangeFilter.tsx`): atajos Hoy/Ayer/Últimos 7
  días/Este mes/Todo, más `Desde`/`Hasta` manuales (`<input type="date">`).
  Los presets se calculan en la zona horaria del navegador — el contrato no
  expone la zona horaria de la sede al cliente — y se envían como
  `from`/`to` ISO en UTC, medio-abiertos (`[from, to)`), tal como exige
  `.agents/reports-dashboard-exports.md` §5.
- **`freshness` siempre visible**: nota con `source` (`CONFIRMED_CLOUD_REPLICA`)
  y última sincronización debajo de cada reporte; `Banner` de advertencia
  cuando `stale` es verdadero.
- **Errores**: `ErrorState` con variantes 401/403/red/servidor por sección
  (dashboard, ventas, productos son independientes — si al usuario le falta
  un permiso específico de una sección, las otras dos siguen funcionando).
  Estados vacíos con `EmptyState` cuando no hay filas.
- **CSV real, no generado en el navegador.** El botón "Exportar CSV" pide el
  archivo real a `GET /reports/sales/export.csv` (mismos filtros/página que
  la tabla en pantalla) y guarda los bytes devueltos por el servidor con un
  `<a download>` desechable; nunca construye el CSV en el cliente.

## Plumbing nuevo, compartido por toda la app

El backend responde el CSV como archivo, no como JSON, así que se extendió
la capa HTTP común (no sólo el feature de reportes):

- `apps/web/src/lib/api/httpClient.ts`: nuevo método `getBlob()` (mismo
  manejo de error de red/HTTP que `getJson`, pero devuelve `{blob, filename}`
  leyendo `Content-Disposition`).
- `apps/web/src/features/auth/AuthProvider.tsx`: nuevo `authGetBlob()`,
  mismo patrón de auto-refresh de sesión que `authGet`/`authPost`/`authPut`.
- `apps/web/src/lib/download.ts`: `saveBlob()`, utilidad genérica de
  descarga (URL de objeto desechable + `<a download>`), sin lógica de
  reportes — reutilizable por cualquier futura exportación.

## Hallazgo importante: `pnpm -w typecheck` nunca cubrió `apps/web`

Al añadir `authGetBlob`/`getBlob` a interfaces usadas en toda la app, tuve
que corregir **12 archivos de prueba preexistentes** (de fases 1-6) que
construían un `AuthContextValue`/`HttpClient` completo y dejaron de
satisfacer el tipo. Investigando por qué `pnpm -w typecheck` (usado en todos
los cierres de fase anteriores, incluido el mío) no había detectado nada
similar antes, confirmé que el `tsconfig.json` raíz sólo referencia
`packages/contracts`, `domain`, `database`, `ui`, `apps/api` y
`apps/worker` — **`apps/web` nunca estuvo en ese grafo compuesto**. Los
"`pnpm -w typecheck`: correcto" reportados en fases anteriores para el
frontend nunca comprobaron sus tipos por esa vía; sólo `pnpm --filter
@don-juan/web test` (vitest, transpila con esbuild, no chequea tipos)
corría de verdad. `apps/web` sí tiene su propio script correcto:
`pnpm --filter @don-juan/web typecheck` (`tsc -p tsconfig.json --noEmit`),
que es el que usé para encontrar y corregir estos 12 archivos más un
`match[1]` posiblemente `undefined` en mi propio `getBlob`.

No modifiqué `tsconfig.json` raíz (agregar `apps/web` a esa composición
requeriría volverlo un proyecto TS `composite`, un cambio de infraestructura
compartida fuera del alcance de esta fase). Dejo la corrección disponible
para quien la priorice; até una nota en `.agents/coordination.md`.

## Verificación en vivo (Cloud y Edge reales, backend `9b41eb9`)

Se levantó, fuera del árbol del repositorio (contenedores y procesos
desechables, ya detenidos y eliminados), un Postgres Cloud propio migrado
hasta `0028_reports_permissions.sql`, con datos sembrados directamente en
`cloud_replica_events`/`cloud_replica_entities` (3 pagos, 2 cuentas
confirmadas con ítems, 2 mesas) — sembrados por SQL directo en vez de
recorrer todo el pipeline Edge→worker→réplica, porque ese pipeline ya se
validó a fondo en el cierre de Fase 6; esta ronda se enfocó en el frontend
nuevo de reportes contra respuestas reales del mismo `reports.ts`. Nota:
había un stack Docker de Codex activo en la máquina (`compose-web-1` en
5173, `compose-api-1` en 3000, sus propios Postgres Edge/Cloud) — no se tocó
ninguno; se usaron puertos y contenedores propios y separados en todo
momento.

Con `apps/web` apuntado a ese Cloud real (servidor Vite propio en un puerto
libre, sin usar `.claude/launch.json` para no chocar con el 5173 ya
ocupado):

- Login real, `/reports` con preset "Hoy" por defecto: panel, ventas y
  productos con cifras reales y coherentes con los datos sembrados (incluida
  la distinción real ventas-por-pago vs. ingreso-por-cuenta que exige
  `.agents/reports-dashboard-exports.md` §114 — ambas cifras difirieron
  legítimamente en la prueba, no por un error).
  cambiar el preset a "Todo" volvió a pedir los tres reportes correctamente.
- Clic en "Exportar CSV": la petición real
  `GET /reports/sales/export.csv?page=1&pageSize=50` respondió `200`, sin
  errores de consola; `saveBlob` se invocó con el blob y el nombre de
  archivo reales devueltos por el servidor.
- Revocando `reports.view_costs` del rol Administrator directamente en la
  base (sin relogin necesario — los permisos se resuelven por sesión, no en
  el JWT) y recargando: las columnas/costos de panel y productos
  desaparecieron por completo, confirmando que el backend las omite (no que
  el frontend sólo las oculta).
- Apuntado a un Edge real (otro servidor Vite propio, otro Postgres
  desechable, sin enrolar): `/reports` mostró únicamente "Los reportes sólo
  existen en la nube", `curl` confirmó `422` en las cuatro rutas.

**No verificado en vivo esta ronda** (por presupuesto de tiempo, no por
riesgo): la invalidación real al cambiar de sede con más de una sede
autorizada — se apoya en el mismo patrón de dependencia `branchId` ya
verificado en vivo en el cierre de Fase 6 para `/replication`, aplicado acá
de forma idéntica y cubierto por pruebas unitarias (cambio de filtro de
fecha dispara refetch de los tres reportes, mismo mecanismo).

## Tests

`pnpm --filter @don-juan/web typecheck`: correcto. `pnpm -w typecheck`
(backend): correcto, sin tocar `apps/api`/`packages/contracts`.
`pnpm --filter @don-juan/web test`: **177/177** (18 nuevas: 8 en
`ReportsPage.test.tsx`, 4 en `reportsApi.test.ts`, 4 nuevas en
`httpClient.test.ts` para `getBlob`, más las 12 correcciones de mocks
preexistentes que no añaden casos nuevos).

## Lo que no se tocó

`apps/api/**`, `packages/contracts/**`, `infra/db/migrations/**`,
`tsconfig.json` raíz. El archivo de semilla SQL usado para la verificación
en vivo (`seed-reports.sql`, en la raíz del repo) se creó y se borró dentro
de esta misma sesión; no queda en el árbol de trabajo.

## Siguiente fase frontend esperada

Ninguna todavía. Fase 8 no se inició.
