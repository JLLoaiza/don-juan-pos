# Coordinación de arquitectura

## 2026-09-06 — Roles globales y acceso de sucursal

**Problema.** `bd/sql/initial-ddl.sql` declara `user_roles.branch_id` como nullable, pero lo incluye en la clave primaria `(user_id, role_id, branch_id)`. PostgreSQL convierte las columnas de una clave primaria en `NOT NULL`, por lo que no se pueden representar los roles globales que `organization_access.md` define con `branch_id = NULL`. Además, el esquema no contiene una asignación explícita de usuario a sucursal; sin ella, no se puede expresar ni validar de forma independiente el conjunto de sucursales autorizadas de un usuario.

**Opciones.**

1. Reemplazar la clave primaria por un identificador técnico y dos índices únicos parciales: uno para roles globales `(user_id, role_id) WHERE branch_id IS NULL` y otro para roles por sucursal `(user_id, role_id, branch_id) WHERE branch_id IS NOT NULL`; crear `user_branch_access(user_id, branch_id)`.
2. Prohibir roles globales y exigir siempre una sucursal. Esto contradice la especificación funcional.
3. Hacer que un rol global otorgue acceso a todas las sucursales activas de la compañía. Simplifica el esquema, pero elimina la distinción entre rol global y autorización de sucursal que requiere el documento.

**Recomendación.** Opción 1. Mantiene la semántica especificada, permite revocar acceso a una sucursal sin editar roles y da al middleware una fuente inequívoca para validar el contexto activo. Debe ser una migración incremental: no se edita el DDL inicial.

**Módulos afectados.** `packages/database`, `packages/domain`, `apps/api`, `packages/contracts`, migraciones PostgreSQL y `apps/web` al consumir el contexto de sucursal.

**Estado.** Pendiente de revisión de ChatGPT antes de la Fase 1 de identidad. La Fase 0 puede avanzar sin asumir una política de autorización.

## 2026-09-06 — Sesiones revocables y datos mínimos tempranos

**Problema.** La Fase 1 exige una sesión breve, refresh controlado y revocación efectiva al desactivar un usuario o cambiar sus permisos, pero no establece si el mecanismo será opaco persistido, JWT con refresh-rotation u otro. Además, el plan sitúa los datos iniciales en la migración `0010`, después de módulos que aún no existen, aunque la identidad necesita permisos y datos de desarrollo antes.

**Opciones.**

1. Sesiones opacas persistidas con identificador aleatorio en cookie segura y rotación de refresh; mover un seed idempotente mínimo de identidad a la Fase 1.
2. Access JWT breve + refresh opaco persistido/rotado; el middleware consulta estado y revisión de autorización para revocación. Mover igualmente el seed temprano.
3. JWT autocontenido sin consulta de servidor y seed únicamente al final. No satisface con seguridad la revocación ni permite arrancar la Fase 1.

**Recomendación.** Opción 2: access token de corta vida y refresh token opaco, almacenado como hash y rotado en PostgreSQL. El middleware debe comprobar que usuario y asignaciones siguen activas, de modo que los cambios de autorización toman efecto antes del vencimiento. Crear una migración de seed mínima e idempotente de identidad en la Fase 1; reservar `0010` para datos opcionales de desarrollo de módulos posteriores.

**Módulos afectados.** `apps/api`, `packages/database`, `packages/contracts`, migraciones, pruebas HTTP y `apps/web` por el transporte y renovación de sesión.

**Estado.** Pendiente de revisión de ChatGPT. La Fase 0 solo publica salud y no elige aún este mecanismo.

## 2026-09-06 — Destino de impresión y control de versión del primer consumo

**Problema.** El vertical slice exige crear el trabajo de impresión en el mismo commit del consumo, pero no fija qué ocurre cuando no hay una impresora activa/configurada para cocina. También hay diferencias de redacción sobre `expectedVersion`: unas secciones lo tratan como opcional y el plan como parte de los comandos concurrentes.

**Opciones.**

1. Exigir impresora configurada y rechazar el consumo. Contradice que un fallo de impresión no revierta una venta.
2. Persistir el pedido y un trabajo sin destino como `FAILED` con causa explícita; permitir configurar/reintentar después. Hacer `expectedVersion` obligatorio para confirmar consumo y opcional solo para apertura, que ya bloquea la mesa.
3. Inventar un estado `UNROUTABLE` o ignorar la versión. El primero amplía el modelo sin necesidad probada; el segundo empeora conflictos de clientes offline.

**Recomendación.** Opción 2. Un consumo válido nunca se pierde por infraestructura de impresión; un job sin destino queda auditable y reintentable. Exigir `expectedVersion` en `confirm-consumption` desde el contrato inicial. El endpoint de apertura usa bloqueo de mesa e índice parcial; devuelve la versión creada.

**Módulos afectados.** `packages/contracts`, `packages/domain`, `packages/database`, `apps/api`, `apps/worker`, migraciones, frontend de salón y cocina.

**Estado.** Pendiente de revisión de ChatGPT antes de publicar contratos de cuenta y consumo. No bloquea la infraestructura de Fase 0.

## 2026-09-06 — Registro canónico de idempotencia para comandos online

**Problema.** El plan exige `operation_id` para toda mutación reintentable, pero el DDL solo tiene `sync_operations`, que requiere un `sync_device`. Los clientes online autenticados no necesariamente se identifican como dispositivo y no existe aún una tabla que conserve de manera canónica el resultado de un comando HTTP para devolverlo en un reintento.

**Opciones.**

1. Reutilizar `sync_operations` y obligar a todos los clientes, incluidos los online, a registrar un dispositivo.
2. Crear un `command_operations` genérico por compañía/sucursal con `operation_id`, nombre de comando, actor, estado, versión esperada, request/response seguros y referencias; usar `sync_operations` solo como bitácora de recepción/protocolo de sync.

**Recomendación.** Opción 2. Separa la idempotencia transaccional del protocolo offline, evita un dispositivo ficticio para operaciones online y permite que Edge→Cloud use la misma clave de negocio sin duplicar efectos.

**Módulos afectados.** Migraciones, `packages/database`, `packages/domain`, `apps/api`, `apps/worker`, sincronización y pruebas de reintento.

**Estado.** Pendiente de revisión de ChatGPT. No se creará la tabla hasta acordar el modelo; la migración base de sync no se usa aún para comandos HTTP.

## 2026-09-06 — CORS bloquea al frontend contra la API real desde el navegador

**Problema.** `apps/web` (Vite, `http://localhost:5173` en desarrollo) ya consume `GET /health` con un cliente HTTP real. Verificado en vivo contra `apps/api` corriendo localmente: el navegador bloquea la respuesta (`No 'Access-Control-Allow-Origin' header is present`) aunque `curl`/Node reciben 200 sin problema, porque `apps/api` no envía cabeceras CORS. El frontend maneja el fallo con gracia (muestra el estado de error de red con reintento), pero ningún flujo real podrá verificarse en navegador —ni ahora con `/health` ni después con auth/salón/cuentas— hasta resolver esto.

**Opciones.**

1. Habilitar CORS en `apps/api` solo para los orígenes de desarrollo del frontend (p. ej. `http://localhost:5173`), vía config/env, deshabilitado o restringido en producción.
2. Servir `apps/web` y `apps/api` bajo el mismo origen en desarrollo (proxy de Vite hacia la API), evitando CORS por completo.
3. No hacer nada y depender de que cada agente pruebe por separado (curl/Postman para backend, mocks para frontend). Retrasa cualquier prueba end-to-end real en navegador.

**Recomendación.** Combinar 1 (CORS explícito por entorno, nunca `*` en producción) y 2 (proxy de Vite en desarrollo para evitar exponer CORS más allá de lo necesario). Es una decisión pequeña pero cruza ambos ownership (`apps/api` de Codex, `apps/web` de Claude) y afecta cómo se probarán todos los vertical slices futuros en navegador.

**Módulos afectados.** `apps/api` (Codex), `apps/web` (Claude, configuración de proxy/env si aplica).

**Estado.** Pendiente de que Codex decida el mecanismo. No implementé nada en `apps/api` (fuera de mi ownership); ver detalle en `.agents/handoffs/claude-latest.md`.

## 2026-09-06 — Resolución aplicada: identidad y orden de migraciones

Se implementó la opción recomendada para roles globales y sesiones: `0009_identity_access.sql` reemplaza la PK incompatible de `user_roles`, crea `user_branch_access`, validaciones defensivas de compañía y `auth_sessions` persistidas. `0010_identity_initial_data.sql` fija el catálogo mínimo de permisos y `0011_development_identity_seed.sql` incorpora solo el bootstrap de desarrollo. El plan original reservaba `0009` para reporting; se priorizó la siguiente fase realmente dependiente (identidad) y reporting deberá usar la siguiente versión disponible, sin reescribir migraciones ya aplicadas.

**Estado.** Implementado. ChatGPT debe revisar la decisión de orden, pero no hay una ambigüedad operativa pendiente para que Claude consuma los contratos publicados.

## 2026-09-07 — Company internal; branch is public operational context

**Decisión aplicada por requisito de producto.** El contrato público de `POST /auth/login` ya no recibe `companyId`; identifica al usuario con sus credenciales y el backend deriva su `company_id` internamente. `AuthContext` ya no expone el objeto `company`; solamente expone usuario, sucursales accesibles, sucursal activa y permisos.

`POST /me/active-branch` conserva únicamente `{ branchId }`. Antes de persistirlo, el backend resuelve usuario y compañía desde la sesión, comprueba que la sucursal pertenece a esa compañía y que existe `user_branch_access`. Una coincidencia ambigua de las mismas credenciales en más de una compañía se rechaza sin revelar tenancy.

**Compatibilidad.** Es un breaking change deliberado para los consumidores de `LoginRequest` y `AuthContext`. El dominio y PostgreSQL conservan `companies` y `company_id` como frontera interna de tenancy.

## 2026-09-07 — Criterios de catálogo e idempotencia de Fase 2

**Decisiones aplicadas.** La Fase 2 usará `NUMERIC` de PostgreSQL como fuente de cálculo monetario/costos (precio a escala 2 y costo a escala 6); los contratos transportan decimales como strings, nunca `number` de JavaScript. `sale_price = 0` no admite una actualización basada en margen y `targetMargin` debe ser menor que 100. Los redondeos persisten con la escala de las columnas.

No se adelanta `CONFIRM_PURCHASE`: compras son Fase 5. En Fase 2 el costo se fija solo al crear el ítem y los ajustes de stock no lo alteran. Se publica un ledger `command_operations` para `operation_id` de comandos HTTP, según la recomendación ya documentada, porque ajustes y recetas requieren reintentos sin duplicar Kardex/auditoría.

**Integridad.** Las referencias de receta y adicionales reciben triggers defensivos de sucursal además de validación transaccional. Esto impide que una FK válida pero perteneciente a otra sede se introduzca por SQL directo.

**Estado.** Implementación en curso; ChatGPT puede revisar estas decisiones sin bloquear los contratos de catálogo.

## 2026-09-07 — Frontend de Fase 2 implementado; dos vacíos de contrato menores

**Contexto.** El frontend de Catálogo (`/catalog`: inventario, acompañamientos, productos, precio) quedó implementado contra los contratos de `packages/contracts/src/catalog.ts` ya publicados por Codex, y verificado en vivo (crear ítem → acompañamiento → producto → cambiar precio por margen objetivo → ajustar stock a negativo). Detalle en `.agents/handoffs/claude-latest.md`.

**Vacíos detectados (no bloquean, no se inventó nada para evitarlos).**

1. `ProductSchema` no incluye `notes` en la lectura aunque `Create/UpdateProductRequestSchema` sí lo aceptan (`apps/api/src/catalog.ts`, método `product()` no selecciona esa columna). Efecto: el frontend no puede precargar las notas de un producto existente al editarlo, así que guardar sin tocarlas las sobrescribe a `null`. Se agregó un aviso visible en el formulario de edición mientras tanto.
2. La respuesta de `POST /catalog/inventory-items/:id/adjust` (`{id, previousStock, currentStock, stockState, version}`) no tiene un schema exportado en `packages/contracts` — solo existe `AdjustInventoryRequestSchema`. El frontend la validó componiendo únicamente schemas primitivos ya publicados (`DecimalStringSchema`, `StockStateSchema`, `CatalogVersionSchema`) en `apps/web/src/features/catalog/catalogApi.ts`, sin inventar campos.

**Sugerencia.** Cuando Codex retome catálogo: agregar `notes` a la proyección de `ProductSchema` y publicar un `AdjustInventoryResultSchema` oficial en `packages/contracts/src/catalog.ts`.

**Estado.** Frontend de Fase 2 completo, listo para integración. No bloquea ni fue bloqueado por lo anterior.

## 2026-09-07 — Aplicación del criterio de impresión en Fase 3

**Implementación.** Se aplicó la alternativa recomendada para ausencia de impresora: la venta, snapshots y Kardex confirman en la misma transacción; se crea un `print_job` `FAILED` con causa explícita, reintentable por worker al configurarse un destino. Con impresora activa el job inicia `PENDING`. `expectedVersion` es obligatorio en `confirm-consumption`.

**Estado.** Backend listo para revisión/integración de ChatGPT; no cambia el modelo multi-company ni introduce consistencia eventual en la venta.

## 2026-09-07 — Frontend de Fase 3 implementado; costo de ítem de cuenta siempre viaja en la respuesta

**Contexto.** El frontend de Salón (`/floor` y `/floor/accounts/:id`) quedó implementado contra `packages/contracts/src/floor.ts`, incluyendo la creación de áreas/mesas (`POST /dining-areas`, `POST /restaurant-tables`) que Codex publicó durante este mismo ciclo. Verificado en vivo: crear área → crear mesa → abrir cuenta → agregar producto → confirmar consumo → ticket de cocina y alerta de stock negativo mostrados → mesa pasa a "Ocupada". Detalle en `.agents/handoffs/claude-latest.md`.

**Vacío detectado (no bloquea, mitigado solo en presentación).** `AccountItemSnapshotSchema.unitCost` (`packages/contracts/src/floor.ts`) es `NonNegativeDecimalStringSchema`, no nullable — `apps/api/src/floor.ts` (método `accountSnapshot`) siempre incluye el costo unitario histórico de cada ítem, sin condicionarlo a `products.view_cost` como sí hace `GET /catalog`. organization_access.md §85 y tables-accounts-orders.md §85 exigen que un usuario sin ese permiso (ej. un mesero) no vea costo/rentabilidad. El frontend oculta la columna de costo en la tabla de la cuenta cuando el usuario no tiene `products.view_cost`, pero el valor ya llegó en el cuerpo de la respuesta HTTP — el ocultamiento es solo de presentación, no una barrera real. Sugerencia para Codex: que `GET /accounts/:id` (y la respuesta de `confirm-consumption`) omitan `unitCost` por ítem cuando el actor carezca de `products.view_cost`, igual que ya hace catálogo.

**Estado.** Frontend de Fase 3 completo, listo para integración. No bloquea ni fue bloqueado por lo anterior.
