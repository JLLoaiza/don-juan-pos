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
