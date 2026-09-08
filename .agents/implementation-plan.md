# Plan de implementación — Don Juan POS / ERP

## 1. Alcance, fuentes y decisión inicial

Este plan parte de que el repositorio aún no contiene una aplicación: solo el DDL inicial en `bd/sql/initial-ddl.sql`, un `docker-compose.yml` limitado a PostgreSQL y las especificaciones funcionales de `.agents/`.

Los documentos de `.agents/` son la fuente funcional y técnica autoritativa. El DDL es un punto de partida ya aplicado o aplicable, por lo que nunca se reescribirá como mecanismo de evolución: todo cambio posterior se hará mediante migraciones incrementales.

No existe un archivo `inventory.md` (ni otro archivo con `inventory` o `catalog` en el nombre) dentro de `.agents/`. La especificación autoritativa de inventario, catálogo y costos es `purchases_expenses.md`; las reglas de compras, gastos y Kardex están en `purchases-expenses-kardex.md`.

Antes de esta lista, léase `.agents/architecture/local-first-edge-replication.md`,
que formaliza la arquitectura aprobada de topología, autoridad de datos y
alcance (servidor local por sede, réplica hacia la nube, sin catálogos
globales) y sustituye cualquier supuesto de sincronización basada solo en
navegadores/dispositivos.

Orden recomendado para leer las especificaciones:

1. `organization_access.md`
2. `purchases_expenses.md`
3. `tables-accounts-orders.md`
4. `kitchen-printing.md`
5. `billing-splits-service-payments.md`
6. `cash-register-day-close.md`
7. `purchases-expenses-kardex.md`
8. `employees-shifts-payments.md`
9. `offline-sync-edge.md`
10. `reports-dashboard-exports.md`

La primera entrega no implementará todo el ERP. Será un vertical slice que permita autenticarse, elegir sucursal, ver mesas, abrir una cuenta, confirmar consumo, descontar inventario, registrar Kardex y encolar una comanda de cocina imprimible.

## 2. Arquitectura propuesta

### 2.1 Forma del repositorio

Se propone un monorepo TypeScript con `pnpm`, sin microservicios:

```text
apps/
  api/                  API HTTP, autenticación, comandos y consultas
  worker/               mismo monolito; procesos de trabajos persistentes
  web/                  PWA para caja, salón, cocina y administración
packages/
  domain/               reglas, comandos, puertos y tipos compartidos
  database/             acceso PostgreSQL, migraciones SQL y repositorios
  contracts/            contratos API, validadores y tipos compartidos
  ui/                   componentes y tokens visuales reutilizables
infra/
  compose/              Compose local, Edge y Cloud
  db/migrations/        migraciones SQL numeradas, inmutables
```

La elección de TypeScript/Fastify para la API, React/Vite para la PWA, `node-postgres` para PostgreSQL y migraciones SQL explícitas es una propuesta concreta para este repositorio vacío. Mantiene un modelo sencillo, buenas validaciones de entrada y SQL visible para las reglas transaccionales. No se añadirá un ORM que esconda bloqueos, transacciones o consultas de reportes.

`apps/api` y `apps/worker` comparten los mismos módulos de dominio y la misma base. Son dos modos de ejecución del monolito, no servicios independientes: el primero atiende HTTP y el segundo reclama trabajos persistidos.

### 2.2 Capas y responsabilidades

```text
HTTP / PWA / sincronización
          ↓
Adaptadores: rutas, sesión, validación, autorización, DTOs
          ↓
Aplicación: comandos, consultas y límites transaccionales
          ↓
Dominio: invariantes, cálculo monetario, recetas, estados
          ↓
Infraestructura: PostgreSQL, impresión, IndexedDB, reloj, UUIDv7
```

- Las rutas nunca escriben tablas directamente; invocan un comando de aplicación.
- Los comandos reciben identidad, sucursal activa, `operation_id` y, cuando aplique, `expected_version`.
- El dominio calcula precios, impuestos, descuentos, servicios, costos y consumo. El cliente solo propone selección y cantidades permitidas.
- Los repositorios solo se usan dentro de una transacción iniciada por el caso de uso. Las operaciones que afectan inventario, pagos, caja, impresión o sincronización comparten una misma transacción PostgreSQL.
- Las consultas de pantalla y reportes son de lectura; no alteran estado y aplican siempre el alcance de sucursal y permisos.

### 2.3 Módulos backend

| Módulo | Responsabilidad principal | Tablas/recursos principales |
| --- | --- | --- |
| `identity-access` | Login, sesiones, compañía, sucursal, roles, permisos y auditoría administrativa | companies, branches, users, roles, permissions, user_roles, branch_settings |
| `catalog-costing` | Inventario, recetas, acompañamientos, costos, precio y rentabilidad actual | inventory_items, products, accompaniments, componentes |
| `floor-accounts` | Áreas, mesas, cuentas, clientes, consumo y anulaciones | dining_areas, restaurant_tables, accounts, account_items |
| `inventory-kardex` | Movimientos inmutables, ajustes, compensaciones y bloqueo de existencias | inventory_movements, inventory_items |
| `kitchen-printing` | Órdenes de cocina, snapshots, impresoras y cola de impresión | kitchen_orders, printers, print_jobs |
| `billing-payments` | Descuentos, servicio, divisiones, pagos y recibos | account_discounts, account_splits, payments |
| `cash` | Cajas, sesiones, movimientos y cierres | cash_registers, cash_sessions, cash_movements |
| `procurement-expenses` | Proveedores, compras, gastos y su impacto contable-operativo | suppliers, purchases, purchase_items, expenses |
| `workforce` | Empleados, horarios, turnos, bonos y pagos | employees, employee_wage_rates, employee_shifts, employee_payments |
| `sync-edge` | Dispositivos, comandos idempotentes, outbox, change feed y conflictos | sync_devices, sync_operations, sync_outbox, sync_changes |
| `reporting` | Dashboard, reportes paginados y exportaciones CSV | proyecciones SQL y snapshots históricos |
| `audit` | Bitácora transversal de cambios sensibles | audit_logs |

Los módulos colaboran mediante application/domain services y repositorios con el mismo contexto transaccional; no mediante llamadas HTTP entre módulos ni mediante un bus o event store genérico. Solo se persisten mecanismos asíncronos con un propósito concreto: `sync_outbox`, `print_jobs` y `audit_logs` cuando corresponda.

## 3. Reglas transversales obligatorias

1. Toda entidad creada por un dispositivo o Edge puede recibir un UUIDv7 generado por la aplicación. PostgreSQL conserva valores por defecto solo como respaldo para operaciones exclusivamente centrales.
2. Toda mutación reintentable acepta un `operation_id` UUID único. Un reintento devuelve el resultado previamente persistido, no ejecuta el efecto dos veces.
3. Los cambios sensibles usan transacciones y bloqueos de fila (`SELECT ... FOR UPDATE`) cuando cambian saldo, inventario, caja o un estado exclusivo. Los módulos que participan en una operación comparten ese mismo contexto transaccional.
4. Las cuentas, pagos, movimientos, compras confirmadas, órdenes de cocina y documentos impresos no se borran físicamente desde operaciones normales. Las correcciones son anulaciones o movimientos compensatorios.
5. Las cantidades y los valores monetarios se calculan en el servidor con `NUMERIC`/aritmética decimal. Nunca con números binarios del navegador.
6. Cada comando valida usuario activo, compañía, acceso a sucursal, permiso y coherencia de todas sus referencias antes de escribir.
7. Los snapshots históricos ganan frente a configuraciones actuales. Una venta conserva nombre, precio, impuesto, costo y receta; una impresión conserva su payload; un cierre conserva su snapshot.
8. `IndexedDB` no es una fuente compartida de verdad. Solo guarda cache, cola de comandos y snapshots locales necesarios para la operación temporal.
9. La impresión y sincronización son asíncronas, pero sus trabajos se insertan junto con la mutación de negocio que los provoca.
10. El stock negativo está permitido. Una venta confirmada nunca se rechaza por existencias insuficientes; genera sus movimientos de Kardex y la alerta/estado visible de stock negativo. No existe un setting `allow_negative_stock` en este alcance.

## 4. Estrategia de migraciones

### 4.1 Convención

- La inicial se conserva sin editar en `bd/sql/initial-ddl.sql`.
- Las migraciones vivirán en `infra/db/migrations/` con prefijo ordenable: `0001_...sql`, `0002_...sql`.
- Una tabla `schema_migrations` registrará versión, checksum y fecha de aplicación. El migrador fallará si el checksum de una migración ya aplicada cambia.
- Cada migración tendrá una prueba sobre una base vacía inicializada desde el DDL y otra sobre la versión inmediatamente anterior.
- Las migraciones de datos grandes se diseñarán en fases: agregar nullable/default seguro, backfill determinista, validar, y solo después volver obligatorio si corresponde.
- No se alterarán masivamente los UUID existentes. Las nuevas escrituras de origen offline llevarán UUIDv7 desde el comando de aplicación.

### 4.2 Migraciones ordenadas necesarias

| Orden | Migración | Contenido |
| --- | --- | --- |
| 0001 | `domain_lifecycle_types` | Tipos para estado de ítem, pago, gasto, pago de empleado, modo de liquidación, dirección de ajuste, tipo de orden de cocina y conexión de impresora; agrega `PURCHASE` y `EMPLOYEE_PAYMENT` a `cash_movement_type`, `KITCHEN_CANCELLATION` a documento de impresión y `CONFLICT` a estado de sincronización. |
| 0002 | `accounts_integrity` | Índice único parcial de una cuenta OPEN por mesa; `settlement_mode`, metadata de anulación y `version` en cuentas; estado y metadata de anulación en ítems; restricción de cantidad comercial entera. |
| 0003 | `printing_model` | `printers`, relación de impresora con trabajo, metadata de reimpresión y tipo/referencia de cancelación de órdenes de cocina. Se conservan snapshots inmutables en `print_jobs.payload`. |
| 0004 | `payments_and_cash_integrity` | Estado, anulación, snapshots, monto recibido/cambio, `cash_session_id` y `operation_id` único de pagos; finalización de divisiones; sesión abierta única por caja, dirección de ajuste, notas, snapshot de cierre y versión. |
| 0005 | `purchases_expenses_cash_links` | `purchase_id` y `employee_payment_id` en movimientos de caja; `cash_session_id` en compras; estado y metadata de anulación en gastos, compras y gastos según corresponda; índices de trazabilidad. |
| 0006 | `workforce_history` | Vigencia de tarifa; snapshot y metadata de cancelación de turnos; ciclo de vida, anulaciones, snapshot y `operation_id` de pagos; tabla puente `employee_payment_bonuses`; índice parcial para impedir pago normal duplicado de un turno. |
| 0007 | `sync_operation_model` | Amplía `sync_operations` con sucursal, nombre de comando, versión esperada, intentos y metadata de conflicto. Crea `sync_outbox` y `sync_changes` con índices para push/pull ordenado. |
| 0008 | `concurrency_revisions` | `version` en productos, inventario, acompañamientos y revisión de configuración de sucursal; índices de cursor, búsquedas por sucursal y colas pendientes. |
| 0009 | `reporting_indexes_and_views` | Índices que validen las consultas reales y vistas/materialized views solo para proyecciones ya medidas. Nunca sustituyen las tablas transaccionales. |
| 0010 | `initial_data` | Permisos canónicos, roles de ejemplo, settings mínimos de sucursal y datos de desarrollo, en migración separada e idempotente. |

Las validaciones de que una referencia pertenece a la misma sucursal se implementarán primero dentro de los comandos transaccionales y sus pruebas. Se evaluarán restricciones o triggers defensivos únicamente para relaciones de alto riesgo cuya integridad no pueda expresarse con claves foráneas simples.

## 5. Comandos y APIs principales

La API será REST orientada a comandos. Los endpoints mutantes reciben `Idempotency-Key` (mapeado a `operation_id`) y devuelven el recurso/snapshot resultante. Para comandos concurrentes reciben además `expectedVersion` cuando el agregado sea versionado.

| Área | Comandos iniciales |
| --- | --- |
| Acceso | `POST /auth/login`, `POST /auth/refresh`, `GET /me/context`, `POST /me/active-branch` |
| Organización | Crear/editar sucursal, usuario, rol, asignación de permiso y rol; todos auditados |
| Catálogo | Crear/editar inventario, producto y acompañamiento; configurar receta; recalcular costo; ajustar inventario |
| Salón | Abrir/mover/anular cuenta; asociar cliente; agregar selección en borrador local; confirmar lote de consumo; anular ítem confirmado |
| Cocina | Consultar órdenes y trabajos; reintentar/reimprimir; administrar impresoras |
| Cobro | Aplicar descuento/servicio; crear/finalizar división; registrar/anular pago; emitir recibo |
| Caja | Abrir caja; depósito/retiro/ajuste; vista previa y cierre |
| Compras | Confirmar/anular compra; registrar/anular gasto; ajustes de Kardex |
| Empleados | Entrada/salida, calcular/cancelar turno, bono, pagar/anular pago |
| Sync | Registrar dispositivo, `push` de comandos, `pull` por cursor, listar/resolver conflictos |
| Reportes | Consultas paginadas por alcance, CSV asíncrono si el volumen lo exige |

Ejemplo crítico: `POST /accounts/{id}/confirm-consumption` no acepta total, costo ni receta. Recibe ítems seleccionados, acompañamientos permitidos, notas, `operation_id` y versión esperada. Dentro de una transacción bloquea la cuenta y el inventario afectado, resuelve snapshots, inserta ítems confirmados, escribe Kardex, recalcula la cuenta, crea orden de cocina y encola el `print_job`.

## 6. Workers persistentes

No se introduce Redis, Kafka ni RabbitMQ inicialmente. PostgreSQL provee la persistencia y reclamación de trabajo mediante estado, `FOR UPDATE SKIP LOCKED`, contador de intentos, `next_attempt_at` y backoff.

1. **Impresión:** reclama `print_jobs`, llama al adaptador de impresora, registra éxito o fallo y permite reintento/reimpresión sin repetir la operación comercial.
2. **Sync outbox (Edge):** envía comandos de `sync_outbox` a Cloud de forma idempotente, actualiza intentos y conserva conflictos para resolución humana.
3. **Change feed (Cloud/Edge):** expone cambios ordenados por cursor y compacta solo después de una política de retención segura.
4. **Mantenimiento y reconciliación:** detecta anomalías operativas, reprocesa proyecciones no autoritativas o realiza mantenimiento medido. No calcula el costo actual requerido por una mutación: el recálculo de `products.calculated_cost` afectado se hace siempre de forma síncrona dentro de la transacción que cambia costo de inventario o composición.
5. **Reportes:** refresca proyecciones medidas y procesa exportaciones grandes. No es necesario antes de tener operaciones históricas.

## 7. Arquitectura de frontend y PWA

La PWA comparte un cliente de API tipado y se organiza por dominio, no por tablas:

```text
web/src/features/
  auth/             login, sesión, selector de sucursal
  floor/            plano/lista de mesas, cuenta y consumo
  catalog/          productos e inventario
  kitchen/          cola y reimpresiones
  billing/ cash/ procurement/ workforce/ reports/
  sync/             estado de conexión, cola y conflictos
web/src/local/      IndexedDB, cache y command queue
```

- La autorización visual oculta o deshabilita acciones, pero el backend decide siempre.
- La interfaz de salón mantiene una selección en borrador local y solo persiste cuando se confirma consumo. Por ello no se necesita un estado `DRAFT` persistente en `account_items`.
- El Service Worker cachea el shell de aplicación y recursos estáticos versionados; no cachea respuestas mutantes como si fueran verdad definitiva.
- Todas las fechas visibles, cierres y agrupaciones usan la zona de la sucursal, no la zona del navegador como fuente de negocio.

### IndexedDB

Almacenes mínimos:

- `cache`: catálogo, mesas, contexto de cuenta, permisos efectivos y cursor de cambios, con versión/fecha de sincronización.
- `pending_commands`: comando, `operation_id`, usuario, sucursal, payload validado, `expected_version`, hora y estado local.
- `print_receipts`: solo snapshots locales necesarios para impresión de emergencia, con referencia a operación para no duplicar al reconciliar.
- `conflicts`: respuesta de conflicto recibida del servidor y acción de resolución pendiente.

La cola es append-only para un comando de negocio. Tras respuesta idempotente exitosa se marca aplicada; nunca se elimina antes de que la UI haya consolidado su resultado. En modo sin conexión, la PWA mostrará explícitamente que está trabajando con datos potencialmente desactualizados.

## 8. Estrategia Edge / Cloud

> **Nota (2026-09-08):** La topología, la autoridad de datos y los límites
> explícitos de esta estrategia quedaron formalizados en
> `.agents/architecture/local-first-edge-replication.md`, documento
> autoritativo (sin catálogos globales, sin operación remota en tiempo real
> ni facturación electrónica en este alcance). Esta sección conserva su
> validez como resumen técnico Edge/Cloud del plan de implementación.

```text
PWA y dispositivos
        ↓ (LAN preferida)
API + PostgreSQL del Edge de sucursal
        ↓ (outbox de comandos, reintentos)
API + PostgreSQL Cloud consolidado
```

- El Edge es la fuente operativa compartida de una sucursal mientras está disponible. Evita que cada dispositivo tenga su propia versión de la realidad.
- Cloud conserva el estado consolidado y recibe comandos, no replicación multi-master de PostgreSQL.
- Se desplegará la misma imagen del monolito con configuración de rol `edge` o `cloud`; cambia configuración y workers habilitados, no el modelo de dominio.
- Cada Edge mantiene una única secuencia de escritor para su sucursal.

### 8.1 DEVICE → EDGE: propuesta todavía no autoritativa

Un dispositivo puede enviar un comando desde la red local o desde su cola de IndexedDB. El Edge no confía en el snapshot local: revalida usuario activo, permisos actuales, compañía/sucursal, versión esperada e invariantes del dominio antes de mutar estado. Responde de manera explícita `PROCESSED`, `FAILED` o `CONFLICT`. Solo después de una respuesta `PROCESSED` y un commit local la operación se convierte en un hecho operativo de la sucursal.

### 8.2 EDGE → CLOUD: hecho operativo ya confirmado

Un comando de negocio confirmado y committed por el Edge se escribe junto con `sync_outbox` en la misma transacción. Cloud no vuelve a autorizar al usuario final ni rechaza ese hecho histórico porque su permiso haya cambiado después del commit del Edge. Cloud valida la identidad/autorización del Edge, la sucursal, `operation_id`, idempotencia, versión de protocolo/schema, integridad, causalidad y duplicados. Conserva el `user_id` original en datos y auditoría. Al reintentar, reconoce `operation_id` y devuelve el resultado previo; una operación committed en Edge no puede desaparecer del consolidado por un cambio posterior de permisos.
- `sync_changes` permite a un cliente o Edge pedir cambios desde un cursor ordenado. Los payloads deben ser read models/snapshots seguros, nunca SQL arbitrario ni secretos.
- Cuando el Edge no esté disponible, el dispositivo puede almacenar comandos seguros en IndexedDB. Al reconectar, vuelven a pasar por DEVICE → EDGE; pagos, cierres y acciones de caja tienen restricciones más estrictas y pueden requerir reconfirmación al sincronizar.

## 9. Dependencias entre módulos

```text
identity-access
   ├── catalog-costing ──┐
   ├── floor-accounts ──┼── inventory-kardex ── kitchen-printing
   │                    └── billing-payments ── cash
   ├── procurement-expenses ────────────────────┘
   └── workforce ─────────────────────────────── cash

sync-edge atraviesa los comandos mutantes.
reporting lee snapshots e historiales de todos los módulos.
audit atraviesa administración y operaciones sensibles.
```

- Acceso es requisito de todo comando.
- Catálogo e inventario son requisito de consumo, compras y Kardex.
- Salón requiere catálogo y produce inventario, cocina y después cobro.
- Cobros requieren cuenta y se conectan a caja si el medio es efectivo.
- Compras y gastos se conectan a inventario/caja; nómina se conecta a caja.
- Reportes se implementan después de que los snapshots de sus módulos existan.
- Sincronización se diseña desde el inicio pero su UI y capacidad completa se entrega después del núcleo online/Edge.

## 10. Orden de implementación

### Fase 0 — Base ejecutable

1. Crear el workspace, configuración TypeScript, calidad, tests y variables de entorno.
2. Ampliar Compose con API, worker y PostgreSQL; mantener un volumen de datos local ignorado por control de versiones.
3. Implementar migrador, `schema_migrations`, pruebas de migración y salud de API.
4. Aplicar migraciones 0001–0003 y las partes de 0007/0008 necesarias para UUIDv7, versiones e idempotencia desde el primer comando.

### Fase 1 — Identidad y contexto de sucursal

1. Usuarios con contraseñas seguras, sesión de corta duración y refresh controlado.
2. Resolución de compañía, sucursales accesibles y permisos efectivos.
3. Middleware obligatorio de autenticación, permiso y sucursal.
4. Auditoría de cambios administrativos y seed mínimo para desarrollo.

### Fase 2 — Catálogo e inventario base

1. Inventario, unidades, acompañamientos, productos, recetas y costo derivado.
2. Lecturas de catálogo para salón y regla de producto activo.
3. Servicio transaccional de movimiento de inventario/Kardex con bloqueo por ítem. El stock negativo está permitido y debe quedar visible como alerta; nunca bloquea la venta por falta de existencias.
4. Recalcular sincrónicamente los `products.calculated_cost` afectados dentro de la transacción que cambia un costo de inventario o composición. En una compra: bloquear ítems, crear compra, calcular costo promedio, crear Kardex, actualizar inventario, recalcular productos, escribir auditoría/outbox y hacer commit.

### Fase 3 — Vertical slice funcional

1. Áreas y mesas; vista de salón.
2. Abrir una cuenta con la restricción de una abierta por mesa.
3. Seleccionar productos en borrador, confirmar consumo y crear snapshots.
4. En la misma transacción: descuento de inventario, Kardex, recálculo de cuenta, orden de cocina, `print_job`, auditoría y outbox.
5. Worker de impresión con un adaptador simulado/archivo para desarrollo y manejo de reintentos.
6. Pruebas end-to-end del flujo Login → sucursal → mesa → cuenta → consumo → Kardex → comanda.

### Fase 4 — Operación comercial y caja

1. Anulación/compensación de ítems y cuentas abiertas.
2. Descuentos, servicio, divisiones, pagos, recibos y migración de pagos/caja.
3. Apertura, movimientos y cierre de caja con snapshot inmutable.

### Fase 5 — Compras, gastos y empleados

1. Compras confirmadas, costo promedio ponderado, Kardex, gastos y trazas de caja.
2. Empleados, rangos tarifarios, turnos, bonos, pagos y salida de efectivo.

### Fase 6 — Sincronización Edge completa

1. Dispositivos, outbox, push idempotente, change feed y cursores.
2. Cache de PWA y cola de comandos con señalización visible de conexión.
3. Conflictos: cuentas abiertas, versiones, pagos, conteos y permisos revocados.
4. Pruebas de corte de red, reintento, reinicio de proceso y recuperación sin duplicados.

### Fase 7 — Reportes y operación a escala

1. Consultas históricas con snapshots, paginación y permisos de costo.
2. Dashboard operativo y alertas actuales.
3. CSV coherente con las mismas consultas de reportes.
4. Índices y proyecciones solo después de medir planes de consulta y volumen real.

## 11. Vertical slice: criterios de aceptación

Un primer slice está terminado solo si:

1. Un usuario activo inicia sesión, ve únicamente sus sucursales y elige una.
2. La vista de salón muestra mesas de la sucursal y su estado.
3. Abrir una cuenta marca la mesa como ocupada y no permite crear otra cuenta abierta concurrente para ella.
4. El servidor resuelve producto, precio, costo, impuesto y receta; no acepta esos valores del navegador.
5. Confirmar el consumo escribe ítems históricos, decrementa exactamente los ítems de inventario necesarios y crea movimientos de Kardex inmutables en una transacción.
6. El mismo commit crea una orden de cocina snapshot y un trabajo persistente de impresión.
7. Un fallo de impresora no revierte la venta ni el inventario; el trabajo queda fallido/reintentable.
8. Reintentar el mismo `operation_id` no duplica ítems, Kardex ni comanda.
9. Las pruebas cubren permisos, aislamiento de sucursal, venta con inventario negativo y alerta correspondiente, concurrencia de cuenta y reintento idempotente.

## 12. Riesgos y decisiones pendientes

| Riesgo | Mitigación o decisión |
| --- | --- |
| El DDL usa `gen_random_uuid()` mientras offline exige UUIDv7 | El generador de aplicación será obligatorio en comandos sincronizables; se documentará qué entidades nacen solo en Cloud. |
| Integridad entre sucursales no siempre puede expresarse con FKs actuales | Validación centralizada dentro de cada comando; tests de aislamiento; endurecer con restricciones/triggers únicamente donde sea necesario. |
| Precios/costos y reportes pueden desviarse si se recalculan desde catálogo actual | Snapshots obligatorios al confirmar consumo, pago, cierre y pago de empleado. |
| Duplicar impresión durante recuperación offline | `operation_id`, snapshot estable, relación con trabajo impreso y reimpresión explícita. |
| Caja y pagos offline tienen riesgo financiero alto | Permitir preparación/cola con controles; exigir sesión válida y reconciliación; no permitir cierre final offline en MVP. |
| Costos promedio con stock negativo y concurrencia | Un único servicio de Kardex, bloqueo de `inventory_items`, regla especial de adquisición tras déficit y pruebas de escenarios negativos/reversos. |
| Documentos extensos y solapados | Los módulos de catálogo y compras se separan como arriba; las reglas más específicas prevalecen sobre el DDL inicial. |

## 13. Ambigüedades resueltas para la implementación

No se encontró una contradicción funcional insalvable. Sí hay cinco puntos que deben quedar fijados explícitamente en ADRs antes de sus respectivas fases:

1. **`.agents/` frente a referencias antiguas a `.ai/`:** la fuente real y autoritativa de este repositorio es `.agents/`.
2. **Edge y Cloud como “fuente de verdad”:** Edge es la verdad operativa de la sucursal; Cloud es la verdad consolidada. Esto se resuelve con comandos, outbox y validación idempotente, no replicación multi-master.
3. **Borrador de consumo:** el documento distingue estado UI de consumo persistido, mientras la migración solo requiere `CONFIRMED` y `VOID`. Se mantendrá el borrador en cliente y se persistirá únicamente al confirmar.
4. **`sync_operations` y outbox:** el DDL tiene una tabla de operaciones genérica y la especificación recomienda outbox. Se conservarán ambos propósitos separados: `sync_operations` para recepción/resultado y `sync_outbox` para entrega durable.
5. **Tipos de enum en PostgreSQL:** sus adiciones se aislarán en migraciones pequeñas y probadas. Si una futura necesidad exige evoluciones frecuentes, se preferirán tablas de catálogo/constraints sobre ampliar enums sin control.
6. **Sincronización en dos saltos:** DEVICE → EDGE revalida la propuesta con permisos actuales; EDGE → CLOUD consolida un hecho ya autorizado por el Edge y conserva el actor histórico, sin reautorizar al usuario final.
7. **Stock negativo:** algunos pasajes condicionales dicen “when negative inventory is enabled”, pero la especificación de catálogo declara que el stock negativo está permitido. Para el alcance actual prevalece la regla no condicional: vender no se bloquea y el déficit se muestra.

## 14. Definición de listo por fase

Cada fase requiere: migraciones aplicables desde cero, pruebas unitarias del dominio, pruebas de integración PostgreSQL para transacciones/índices, pruebas HTTP de autorización, datos de desarrollo mínimos, documentación de comandos y sin acciones destructivas expuestas por la API. Ninguna fase avanza porque “la pantalla parece funcionar” si no conserva idempotencia, auditoría, aislamiento de sucursal e historial.
