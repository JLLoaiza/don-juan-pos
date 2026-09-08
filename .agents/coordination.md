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

## 2026-09-07 — Decisión de producto: precio de producto se fija en el propio formulario de crear/editar

**Decisión (pedida explícitamente por el dueño del producto).** Se eliminó la acción separada "Precio" de la lista de productos y su selector de radio-buttons (precio fijo / utilidad objetivo / margen objetivo). En su lugar, el formulario de crear/editar producto (`apps/web/src/features/catalog/ProductForm.tsx` + `PriceFields.tsx`) muestra tres campos enlazados — precio de venta, utilidad, margen — justo después de la receta; editar cualquiera de los tres recalcula los otros dos en vivo usando un costo estimado en el navegador (`pricing.ts`, misma fórmula que `CatalogService.recalculateProducts`, pero solo con los costos de componentes que el usuario ya puede ver). Solo `salePrice` se envía, dentro del mismo comando de crear/editar producto de siempre — exactamente igual que si el usuario hubiera escrito el precio a mano.

**Efecto en el contrato.** El frontend dejó de llamar a `POST /catalog/products/:id/price`. El permiso `pricing.update` y ese endpoint quedan sin consumidor en la UI (no se tocó el backend). Si Codex necesita ese endpoint para otra herramienta (p. ej. reprecio masivo), sigue disponible tal cual; si no, podría considerarse deprecarlo — decisión de Codex/ChatGPT, no bloquea nada.

**Estado.** Implementado, probado y verificado en vivo (editar margen de 60% a 50% recalculó el precio de venta correctamente y persistió con el mismo `PUT /catalog/products/:id` de siempre).

**Estado.** Frontend de Fase 3 completo, listo para integración. No bloquea ni fue bloqueado por lo anterior.

## 2026-09-07 — Corrección de `unitCost` nullable verificada; Fase 4 sin contrato todavía

**Verificación.** El cambio de Codex en `cd16e36` (`AccountItemSnapshot.unitCost` ahora nullable, redactado sin `products.view_cost`) no requirió ningún cambio en frontend: `apps/web/src/features/floor/AccountPage.tsx` ya formateaba `unitCost` con una función que trata `null` como "—" y ya ocultaba la columna completa sin el permiso. `pnpm -w typecheck` y `pnpm --filter @don-juan/web test` (114/114) confirman que sigue correcto. El vacío que documenté para Fase 3 queda cerrado.

**Fase 4.** Revisé `packages/contracts/src`, `apps/api/src` e `infra/db/migrations` buscando algo de Cobro (descuentos, servicio, divisiones, pagos, caja) — no existe todavía ningún archivo, ruta ni migración para esto. No hay contrato que implementar; no se inventó nada. Frontend queda a la espera de que Codex/ChatGPT publiquen `packages/contracts` para Fase 4 antes de tocar `/billing` o `/cash`.

## 2026-09-07 — Decisiones necesarias antes de contratos de Fase 4

**Contexto.** Fase 4 une descuentos, servicio, divisiones, pagos y caja en una única frontera transaccional. Claude trabaja en paralelo en frontend, por lo que los contratos no se publicarán hasta resolver estas ambigüedades.

1. **Estado de pago.** El esquema/migración histórica usa `REGISTERED`/`VOID`, mientras que la especificación de billing recomienda `CONFIRMED`/`VOID`. Propuesta: conservar `REGISTERED` como estado persistido y público en esta fase para evitar migración transversal; documentar su semántica como pago financiero confirmado.
2. **Impuestos después de descuentos.** Los `account_items` de Fase 3 ya guardan `tax_total` histórico. Falta decidir cómo prorratear/recalcular el impuesto cuando se aplica un descuento de cuenta. Propuesta: prorratear determinísticamente el descuento entre ítems confirmados y recalcular impuesto por línea con el `tax_rate_snapshot`, conciliando el residuo de redondeo a la última línea por ID.
3. **Anulación de cuenta/ítem.** El plan de Fase 4 exige compensación de consumo, pero la especificación de billing se concentra en pagos y no fija endpoint/permiso/efecto de cocina para la anulación de cuentas abiertas. Requiere decisión antes de publicar ese comando; no se implementará como borrado ni con cálculo de receta actual.
4. **Contexto de caja para pagos no efectivo.** CASH debe exigir una sesión OPEN explícita de la misma sede. Para CARD/QR la especificación admite referencia opcional; propuesta: aceptar `cashSessionId` opcional para conciliación y hacerlo obligatorio solo para CASH.
5. **Efectivo recibido y cambio.** Un pago CASH puede tener `cashReceived > amountApplied`. Propuesta: persistir ambos valores/su cambio en el pago, pero crear movimiento de caja únicamente por `amountApplied`; nunca por el efectivo entregado físicamente.

**Invariantes ya no ambiguas.** Todo pago debe bloquear cuenta (y split si aplica), recalcular saldo autoritativo, ser idempotente, evitar sobrepago, y confirmar en el mismo commit pago, movimiento de caja si aplica, cuenta `PAID`/liberación de mesa, recibo, auditoría y outbox. Ningún worker participa en esa consistencia.

**Estado.** Las propuestas fueron autorizadas por el usuario el 2026-09-07. Codex las aplicará en contratos/migraciones de Fase 4; Claude puede usar mocks provisionales hasta que cada ruta se publique en el handoff.

## 2026-09-07 — Frontend de Fase 4 (parcial) implementado; falta listar métodos de pago y cajas registradoras

**Contexto.** Implementé la UI contra las cinco rutas que Codex publicó de verdad (`GET /accounts/:id/billing`, `POST /accounts/:id/discounts`, `PUT /accounts/:id/service`, `POST /accounts/:id/payments`, `POST /cash-sessions`), integradas dentro de `/floor/accounts/:id` (una sección "Cobro" junto a la cuenta, no una pantalla `/billing` aparte, porque las cinco rutas son todas por cuenta o de comando puntual). No usé mocks para las tres primeras porque son contratos reales y completos.

**Lo que SÍ se implementó (sin mocks, contra rutas reales).**

1. Snapshot de cobro: pagado, saldo pendiente, descuentos, servicio, historial de pagos (solo lectura de lo ya registrado).
2. Aplicar descuento (`sales.apply_discount`) — nombre, tipo (porcentaje/monto fijo), valor.
3. Configurar servicio (`sales.modify_service`) — porcentaje.
4. Ambos se ocultan una vez `billing.hasPayments` es verdadero, igual que `lockedCommercialAccount` en `apps/api/src/billing.ts` los rechaza. También oculté "Agregar consumo" (Fase 3) en ese caso: `apps/api/src/floor.ts` ahora rechaza consumo nuevo tras el primer pago aunque la cuenta siga `OPEN`, y el frontend ya lo refleja.

**Vacío detectado que SÍ bloquea (no hay mock razonable, no se inventó nada).** `POST /accounts/:id/payments` requiere `paymentMethodId`, y `POST /cash-sessions` requiere `cashRegisterId` — ambos son válidos y funcionan, pero no existe ningún `GET` para listar los métodos de pago activos ni las cajas registradoras de una sucursal (`payment_methods`/`cash_registers` tampoco tienen seed de desarrollo en ninguna migración). Sin eso no hay forma de construir un selector real: la única alternativa sería pedirle al cajero que escriba un UUID a mano, que no es una interfaz utilizable ni cumple "no uses IDs internos como campos visibles". Dejé un aviso visible (solo para quien tiene `payments.create`) explicando que registrar pago está pendiente de ese endpoint, y no implementé nada de apertura/cierre de caja.

**Sugerencia para Codex.** Publicar `GET /payment-methods` y `GET /cash-registers` (listado activo de la sucursal) antes de que el frontend pueda completar pagos y caja. **Actualización (mismo día, más tarde):** Codex publicó `POST /cash-sessions/:id/adjustments` y `POST /cash-sessions/:id/close` mientras el frontend seguía en curso — buenas rutas, pero comparten el mismo bloqueo: sin `GET /cash-registers` ni una forma de consultar la sesión abierta de una caja dada, el frontend tampoco puede ofrecerlas sin inventar un `cashSessionId`. División de cuenta (`sales.split`) sigue sin ruta.

**Nota operativa para quien reconstruya contenedores.** El servicio `migrate` de `infra/compose/docker-compose.yml` tiene su propia imagen Docker aunque comparte Dockerfile con `api`/`web` — reconstruir solo `api web` deja `migrate` con una imagen vieja que no aplica migraciones nuevas, sin ningún error visible ("Database is current"). Verificado hoy: esto dejó la base sin las migraciones `0016`-`0018` (permisos de Fase 4), causando `403` en `GET /accounts/:id/billing` incluso para el admin. Reconstruir `migrate` junto con `api`/`web` cuando haya migraciones nuevas.

**Estado.** Frontend de Fase 4 `PARTIAL`, listo para integración de lo ya construido. Pagos, caja y divisiones quedan pendientes de las rutas/listados faltantes.

## 2026-09-07 — Cierre de Fase 4: pagos y caja completos; dos bugs corregidos

**Contexto.** Codex publicó `GET /payment-methods`, `GET /cash-registers`, `GET /cash-registers/:id/open-session`, `POST /cash-sessions/:id/adjustments` y `POST /cash-sessions/:id/close`, además del seed `0020_development_cash_seed.sql`. Con eso completé lo que faltaba: selector de método de pago y registro de pago (efectivo con caja+recibido+cambio; tarjeta/QR sin esos campos) dentro de `/floor/accounts/:id`, y una pantalla `/cash` nueva (antes placeholder) con listado de cajas, abrir/ajustar/cerrar sesión. Todo consumido tal cual, sin inventar campos. Detalle completo en `.agents/handoffs/codex-frontend-latest.md`.

**Bug 1 — contrato compartido, corregido.** `packages/contracts/src/billing.ts`, `CashSessionSchema.difference` usaba `MoneySchema` (no-negativo), pero `apps/api/src/billing.ts` calcula `difference = countedCash - expected`, que es legítimamente negativo cuando falta efectivo. El backend ya devolvía el valor correcto; el frontend simplemente no podía parsear esa respuesta válida (`Zod` rechazaba `"-500.00"` contra un schema no-negativo) y mostraba "No se pudo cerrar la caja" pese a que el cierre sí se había guardado — un falso negativo confuso para el cajero. Corregí esa única línea a un `SignedMoneySchema` (alias de `DecimalStringSchema`, ya publicado), sin tocar ningún otro campo. `pnpm -w typecheck`/`pnpm -w test` correctos, incluidas las 32 pruebas de `apps/api` (ninguna rota). Verificado en vivo: contar menos de lo esperado ahora muestra "Diferencia -1250" en vez de un error.

**Bug 2 — propio del frontend, corregido.** `CashRegisterCard` guardaba el resultado del cierre en estado local; como `reload()` hace que `CashPage` retorne `<LoadingState/>` mientras recarga, la tarjeta se desmontaba y el banner de confirmación desaparecía antes de que el usuario lo viera. Se subió ese estado a `CashPage` (mismo patrón que `lastResult` en `AccountPage`, que sí sobrevive por vivir en el componente que persiste). Verificado en vivo tras el fix.

**Nota operativa.** `infra/db/migrations/0019_procurement_integrity.sql` (Fase 5, pausada, no confirmada) sigue en el directorio de migraciones sin commitear. No corrí el migrador para aplicar `0020` porque también recogería `0019` y lo dejaría con checksum registrado antes de que Codex lo termine, bloqueando ediciones futuras de ese archivo. Apliqué el contenido de `0020` directamente vía `psql` (aditivo, `ON CONFLICT DO NOTHING`) sin tocar `schema_migrations`; se re-aplicará sin problema cuando el migrador corra normalmente más adelante.

**Estado.** Frontend de Fase 4 `COMPLETE`. División de cuenta (`sales.split`) sigue sin ruta; `/billing` como pantalla de nivel superior sigue siendo placeholder (no hay endpoint de "cuentas pendientes de cobro" para darle contenido). No se avanza a Fase 5.
## 2026-09-07 — Fase 6: frontera Edge/Cloud y primer slice de sincronización

**Contexto.** La especificación exige un escritor operativo único por sucursal (Edge PostgreSQL) y una Cloud consolidada. El Compose actual contiene una sola instancia PostgreSQL/API, válida como Edge de desarrollo, pero no una Cloud separada ni credenciales Edge→Cloud. Tratar esa misma instancia como dos escritores violaría la prevención de split-brain.

**Decisión de implementación inicial.** Se implementará primero la frontera Edge: registro y desactivación de dispositivos por sucursal, operaciones y resultados idempotentes, feed de cambios cursorizado, y outbox transaccional ya producido por los comandos de dominio. El worker solo intentará entrega Cloud si recibe una URL/credencial explícita de Cloud; la ausencia de esa configuración deja los eventos pendientes y no reenvía escrituras de clientes a otro destino.

**Pendiente para revisión de arquitectura.** Antes de habilitar una topología Cloud real se debe fijar: URL/identidad autenticada del Edge, formato y versión del endpoint Cloud receptor, y despliegue de una base consolidada separada. No se introducirá replicación PostgreSQL ni un failover automático de clientes hacia Cloud.

**Impacto.** Este slice permite que Claude implemente cola/PULL y visibilidad de estado sin inventar Cloud. El carril completo Edge→Cloud queda PARTIAL hasta la revisión indicada.
## 2026-09-07 — Bug bloqueante en Fase 5 backend: columnas DATE devuelven 400 "Invalid request" pese a persistir correctamente

**Contexto.** Al continuar el carril frontend de Fase 5 (Compras/Gastos/Kardex ya con contratos y rutas reales publicadas por Codex), verifiqué en vivo contra API + PostgreSQL reales. Proveedores, compras (con Kardex e inventario), anulación de compra, gastos y creación de empleados funcionan correctamente end-to-end. Al pasar a tarifas por hora, turnos, bonos y pagos de empleados, encontré un bug sistemático que **no es de mi carril** (vive enteramente en `apps/api/src/workforce.ts`), documentado aquí en vez de corregido, a la espera de que el usuario lo resuelva directamente.

**Síntoma.** `POST /employee-wage-rates` y `POST /employee-shifts/clock-in` responden `400 {"code":"VALIDATION_ERROR","message":"Invalid request"}`, pero la fila **sí queda insertada correctamente en PostgreSQL** (confirmado con `SELECT` directo tras cada intento). El mismo patrón de código está presente en los cuatro mappers de este módulo, así que muy probablemente afecta también a `POST /employee-bonuses` y `POST /employee-shifts/:id/payments` aunque no llegué a ejercitarlos en vivo (no hay forma de alcanzarlos sin tarifa/turno funcionando primero).

**Causa raíz.** `node-postgres` (`pg`) deserializa columnas `DATE` (OID 1082) como objeto `Date` de JS por defecto — no hay ningún `pg.types.setTypeParser` registrado en `packages/database` que lo evite. Los cuatro mappers de `apps/api/src/workforce.ts` asumen que la columna ya es texto:

- `wageRate()` (línea 60): `effectiveFrom:String(row.effective_from).slice(0,10)`
- `shift()` (línea 61): `workDate:String(row.work_date).slice(0,10)`
- `bonus()` (línea 62): `bonusDate:String(row.bonus_date).slice(0,10)`
- `payment()` (línea 63): `paymentDate:String(row.payment_date).slice(0,10)`

Cuando `row.X` es un `Date` de JS, `String(row.X)` produce algo como `"Mon Sep 07 2026 00:00:00 GMT+0000 (Coordinated Universal Time)"`, y `.slice(0,10)` da `"Mon Sep 07"` — no calza con `DateSchema` (`/^\d{4}-\d{2}-\d{2}$/` en `packages/contracts/src/workforce.ts`). La ruta hace `WageRateSchema.parse(...)`/`EmployeeShiftSchema.parse(...)` etc. sobre el resultado antes de responder (`apps/api/src/app.ts`), así que el `ZodError` resultante cae en el manejador genérico y se traduce a `400 "Invalid request"` — **después** de que el comando ya se ejecutó y confirmó en la misma transacción. Esto es más grave que un error de validación normal: el cajero ve un fallo y puede reintentar (mismo o distinto `Idempotency-Key`), arriesgando turnos abiertos duplicados si reintenta sin la misma clave.

Este defecto es nuevo en Fase 5 porque es la primera vez que el proyecto lee una columna `DATE` (no `TIMESTAMP`) de vuelta al cliente; `purchases.purchase_date` y `expenses.expense_date` son `TIMESTAMP` y por eso no lo sufren — confirmé ambos funcionando correctamente en vivo.

**Sugerencia de corrección (una de dos, a elección de Codex).**
1. Registrar una vez, globalmente, `pg.types.setTypeParser(1082, (value) => value)` en `packages/database` para que toda columna `DATE` del proyecto vuelva como texto `YYYY-MM-DD` sin tocar cada mapper.
2. O corregir cada mapper para formatear explícitamente: reemplazar `String(row.X).slice(0,10)` por algo que tolere tanto `Date` como `string` (p. ej. `row.X instanceof Date ? row.X.toISOString().slice(0,10) : String(row.X).slice(0,10)`).

**Estado.** No se tocó `apps/api` ni `packages/contracts`. El usuario indicó que lo resuelve directamente; frontend queda en pausa sobre Turnos/Bonos/Pagos/tarifas hasta que se confirme el fix. El resto de Fase 5 frontend (proveedores, compras, gastos, Kardex, alta/edición de empleados) está implementado, probado y verificado en vivo — ver nota de progreso.

## 2026-09-07 — Resolución confirmada: fechas de personal, más dos correcciones propias del frontend

El bug de columnas `DATE` reportado más arriba fue corregido en backend (`dateOnly()` en `apps/api/src/workforce.ts`, migración `0025_workforce_date_response_repair.sql` saneando el ledger de idempotencia). Verifiqué en vivo tras el fix: `POST /employee-wage-rates`, `POST /employee-shifts/clock-in` y `POST /employee-shifts/:id/clock-out` responden `200` correctamente, y las tarifas/turnos creados antes del fix (cuyo dato ya estaba bien en PostgreSQL) ahora se leen y muestran con el formato de fecha correcto.

Durante esa misma verificación encontré y corregí dos bugs propios del frontend (no de contrato ni de backend), documentados con detalle en `.agents/progress.md`:

1. `ProcurementPage.tsx` ofrecía ítems de inventario inactivos en el selector de compra (el backend los rechaza con 422, pero sin filtro previo el usuario no tenía forma de saberlo).
2. `WorkforcePage.tsx`, botón "Registrar salida", no manejaba el rechazo de `clockOut` — quedaba como promesa no capturada sin ningún aviso al cajero. Corregido con manejo de error explícito y prueba nueva.

`pnpm -w typecheck` y `pnpm --filter @don-juan/web test` (148/148) correctos tras ambas correcciones. Fase 5 frontend queda `COMPLETE`, verificado en vivo de punta a punta (proveedores, compras con Kardex, anulaciones, gastos, empleados, tarifas, turnos, bonos y pagos con anulación). No se avanza a Fase 6.

## 2026-09-08 — Arquitectura aprobada y formalizada: operación local por sede y réplica cloud

**Decisión de producto, ya en vigor.** Se formalizó en
`.agents/architecture/local-first-edge-replication.md` la arquitectura de
referencia para todo el proyecto: cada sede opera con su propio servidor
local (frontend POS, API local, PostgreSQL local, impresión local) como
autoridad operativa de su sede; ese servidor replica sus cambios hacia una
nube que administra sedes, servidores, usuarios, roles y permisos, y que
conserva réplicas para consulta y dashboards administrativos. Productos,
recetas, acompañantes, precios, inventario y operación son propios de cada
sede — no existen catálogos globales. No hay operación remota en tiempo real
contra una sede, edición remota de catálogo ni facturación electrónica en
este alcance.

**Coherencia con decisiones previas.** Esta formalización no contradice la
nota del 2026-09-07 "Fase 6: frontera Edge/Cloud y primer slice de
sincronización" de esta misma bitácora: el escritor operativo único por
sucursal (Edge PostgreSQL) ya asumido ahí es exactamente el servidor local de
sede que describe la arquitectura formal. Sí reemplaza cualquier lectura de
`.agents/offline-sync-edge.md` que asumiera catálogo administrado o editado
desde la nube (sus secciones 84-87); ver la nota agregada en ese documento y
en `.agents/architecture/local-first-edge-replication.md` §"Documentos
relacionados".

**Estado.** Documental únicamente; no se tocó código, contratos ni
migraciones. Fase 6 backend sigue en implementación por Codex bajo este
marco. El frontend de Fase 6 no debe comenzar hasta que el gestor actualice
`.agents/handoffs/manager-to-claude.md` indicando que el backend de Fase 6
está cerrado y listo.

## 2026-09-08 — Dos bloqueos de contrato encontrados al implementar el frontend de Fase 6 (`/replication`)

**Contexto.** Con el backend de Fase 6 cerrado (`2760cfc`, `a7abb0c`), se
implementó `/replication` contra `packages/contracts/src/replication.ts` y
las rutas `replication/*`. Dos de los siete requisitos del gestor (selector
de sede en la nube y panel consolidado multi-sede) no se pudieron completar
por el contrato/backend actual, no por falta de tiempo del frontend. Ambos
se verificaron en vivo, no sólo leyendo el código. Detalle completo en
`.agents/handoffs/claude-latest.md`.

**Bloqueo 1 — `POST /me/active-branch` bloqueado en Cloud.**
`apps/api/src/app.ts:30-32` rechaza con `403` cualquier método mutante fuera
de `/auth/*` y `/replication/cloud/*` cuando `SERVER_ROLE=cloud`. Esa ruta no
está exenta, así que un usuario Cloud **nunca** puede cambiar de sede activa
desde el navegador — ni siquiera para elegir su primera sede si tiene dos o
más autorizadas y ninguna `active_branch_id` persistida (`GET
/replication/status` exige `activeBranch` no nulo, que sólo se resuelve solo
con exactamente una sucursal). Verificado con `app.inject` sobre `buildApi`
real y, en vivo, contra un Cloud real (Postgres + `apps/api`): `403` en
ambos casos.

**Opciones.**
1. Exentar `POST /me/active-branch` del candado de sólo-lectura Cloud (es un
   cambio de contexto de lectura administrativa, no una escritura operacional
   de una sede), validando igualmente contra `user_branch_access` como ya
   hace `setActiveBranch`.
2. Publicar una consulta de réplica que no dependa de la sucursal activa de
   sesión — por ejemplo `branchId` como parámetro en `GET /replication/status`
   y `GET /replication/cloud/entities`, validado contra las sedes autorizadas
   del usuario en vez de derivarlo de `context.activeBranch`.
3. Publicar un endpoint que devuelva el estado de todas las sedes autorizadas
   del usuario en una sola llamada, para el panel consolidado.

**Recomendación frontend.** 1 y 2 combinadas resuelven el selector de sede;
3 es necesaria además para que el panel consolidado muestre datos reales de
más de una sede sin depender de cambiar de contexto repetidamente. Sin
alguna de estas, el selector y el panel consolidado quedan `PARTIAL`
indefinidamente para cualquier administrador con más de una sede autorizada.

**Bloqueo 2 — `GET /health` exige autenticación en un Edge enrolado.**
`apps/api/src/app.ts:25-29` aplica el candado "este servidor sólo opera su
sucursal enrolada" a toda ruta que no sea `/auth/*` o `/replication/cloud/*`,
sin exceptuar `/health`, en cuanto `localBranchId` deja de ser `null` (Edge
enrolado). `apps/web` llama `GET /health` sin credenciales cada 15s
(`useConnectivity`) para el badge global de conectividad. Verificado en vivo
contra un Edge real y sano, ya enrolado: `/health` responde `401` y el
`AppShell` queda permanentemente en "SERVIDOR NO DISPONIBLE", aunque la
sede, la réplica y todo lo demás funcionen. No es un defecto de
`/replication/*`; afecta a toda la aplicación y sólo se manifiesta con un
Edge realmente enrolado (no existía una instalación así en el repositorio
hasta esta verificación).

**Recomendación.** Excluir `/health` del hook de `apps/api/src/app.ts:25-29`,
igual que ya se excluyen `/auth/*` y `/replication/cloud/*`.

**Estado.** Ninguno de los dos bloqueos se corrigió desde frontend (son
`apps/api`, fuera de mi alcance en esta fase). El resto de `/replication`
(estado y consulta de réplica de la sede activa, tanto Edge como Cloud) está
`COMPLETE` y verificado en vivo. Pendiente de que Codex/el gestor decidan
sobre las opciones anteriores antes de cerrar Fase 6 frontend por completo.
