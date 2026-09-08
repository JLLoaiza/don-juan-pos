# Arquitectura aprobada: operación local por sede y réplica cloud

**Estado:** acordada por producto. Sustituye cualquier interpretación de Fase 6 basada únicamente en colas offline por navegador o en la nube como autoridad operativa de una sede.

## Propósito

Cada sede debe poder operar durante una caída total de internet. Meseros, caja e impresoras siguen conectados por la LAN de la sede a un único servidor local. Ese servidor confirma la operación y replica posteriormente sus cambios a la nube.

La nube centraliza respaldos, consulta administrativa y dashboards; no debe bloquear una operación diaria por indisponibilidad de internet.

## Topología

```text
Tablets de meseros ─┐
PC de caja/impresión ├─ LAN de la sede ──> Servidor local de la sede
Otros clientes       ┘                         ├─ frontend POS
                                                ├─ API local
                                                ├─ PostgreSQL local
                                                ├─ impresión local
                                                └─ agente de réplica
                                                          │
                                                    cuando haya WAN
                                                          │
                                                          v
                                                   Nube central
                                                   ├─ réplica por sede
                                                   ├─ identidad y administración
                                                   └─ frontend administrativo
```

Dentro de la sede, `pos.churrasqueriadonjuan.com` se resuelve mediante DNS local hacia el servidor local. Fuera de la sede se resuelve por DNS público hacia la nube. Ambas instalaciones sirven la misma aplicación, pero la sede opera contra su API y base de datos locales.

## Autoridad de datos

Cada sede es un mundo operativo independiente. No existe un catálogo, inventario, receta, acompañante o precio global que se imponga a las demás sedes.

### Datos cuya autoridad es la sede

El servidor local de cada sede es la fuente de verdad inicial para:

- productos, categorías, precios, activación y disponibilidad;
- recetas, subrecetas, acompañantes, cantidades e ingredientes;
- ítems de inventario, existencias, costos y Kardex;
- mesas, pedidos, cuentas, comandas, pagos, cajas y sesiones;
- compras, gastos, empleados, turnos, bonos y pagos de personal;
- configuración y estado de impresión de esa sede.

Estos datos se guardan primero en PostgreSQL local y después se replican a una partición de esa sede en la nube. Una sede nunca lee ni modifica datos operativos de otra.

### Datos cuya autoridad es la nube

La nube administra únicamente el ámbito central:

- registro de sedes;
- registro y estado de servidores locales;
- usuarios, credenciales, roles y asignaciones de acceso por sede;
- distribución de actualizaciones del sistema;
- copias replicadas, auditoría y dashboards consolidados.

Las credenciales y permisos autorizados para una sede se replican hacia su servidor local. Durante una caída de WAN, ese servidor puede autenticar a un usuario que ya haya sido sincronizado y aplicar sus últimos permisos conocidos. Un usuario nuevo, o un cambio de permisos aún no sincronizado, no tiene efecto local hasta recuperar conexión.

## Identidad de servidor y aislamiento

Cada servidor local tiene un nombre visible, por ejemplo `Servidor Chipre`, además de un identificador inmutable, una sede asignada y una credencial propia que pueda rotarse o revocarse.

Al crear una sede desde la administración cloud se crea su registro y un proceso de enrolamiento de un solo uso. El servidor instalado intercambia ese proceso por su identidad técnica y queda enlazado exclusivamente a esa sede.

La nube deduce la sede desde la identidad del servidor, no desde un `branch_id` proporcionado por un navegador o un servidor. Toda sincronización debe quedar limitada por ese vínculo.

## Réplica

Cada cambio operativo confirmado localmente debe escribirse en la misma transacción que un registro durable de réplica. El agente local envía esos registros a la nube hasta recibir confirmación.

El protocolo deberá incluir como mínimo:

- identificadores únicos e idempotencia para no duplicar operaciones;
- orden, dependencias y cursores/checkpoints de sincronización;
- confirmación de recepción y reintentos seguros;
- aislamiento estricto por sede;
- auditoría y visibilidad de pendientes, errores y última sincronización;
- recuperación después de reinicio, pérdida temporal de WAN o reemplazo del servidor local.

La nube almacena la réplica y construye vistas de consulta; no confirma ni reescribe directamente una operación diaria de una sede.

## Experiencia de uso

### Dentro de una sede

Los clientes usan el servidor local. La sede queda derivada de ese servidor y no se muestra selector de sede. El usuario ve solamente lo autorizado por sus permisos locales sincronizados.

Si se pierde internet, la LAN, caja, meseros e impresoras continúan operando. La aplicación no depende de que un navegador individual conserve una cola para que otros equipos vean sus pedidos: todos comparten el mismo PostgreSQL local.

### Frontend administrativo cloud

La nube ofrece un frontend administrativo de consulta. Un usuario autorizado puede escoger una sede y ver su réplica: inventario, mesas, cuentas, ventas, caja y demás información disponible. También puede ver dashboards consolidados de sus sedes autorizadas.

El frontend debe mostrar el estado del servidor y la hora de la última sincronización. Cuando una sede está sin conexión, la información cloud puede estar desactualizada y debe indicarlo claramente.

Este primer alcance **no incluye** operación remota en tiempo real contra una sede, edición remota de su catálogo/recetas/precios ni túneles de control.

## Límites explícitos

- No hay facturación electrónica ni integración tributaria.
- Una factura o recibo operativo se calcula y se imprime localmente.
- No hay productos, recetas, acompañantes, inventario ni precios globales.
- No se abre un puerto público entrante hacia el servidor de una sede; la conexión de réplica se inicia desde ese servidor hacia la nube.
- HTTPS, DNS local, IP fija, UPS y respaldos físicos son responsabilidades de infraestructura y se configurarán posteriormente.

## Criterios para rediseñar Fase 6

Antes de declarar completa Fase 6 deben existir un diseño y pruebas que demuestren:

1. Operación compartida de varios clientes contra el servidor local durante una caída de WAN.
2. Persistencia local y réplica idempotente posterior a la nube.
3. Registro de servidor vinculado a una sola sede y rechazo de accesos o datos de otra sede.
4. Inicio de sesión offline de usuarios previamente sincronizados.
5. Consulta cloud por sede con indicador de última sincronización y un dashboard consolidado.
6. Recuperación controlada del servidor local y continuidad de la cola de réplica.

## Documentos relacionados

- `.agents/offline-sync-edge.md` sigue vigente como referencia técnica del
  protocolo de sincronización operación por operación (idempotencia,
  `operation_id`, outbox, cursores, PUSH/PULL, tipos de conflicto, niveles de
  capacidad offline). Sus secciones sobre catálogo administrado o editado
  desde la nube (§§84-87) quedan **reemplazadas** por este documento: no
  existen catálogos globales y la nube no edita remotamente el catálogo de
  una sede.
- `.agents/implementation-plan.md` §8 conserva el resumen Edge/Cloud del plan
  de implementación; sigue siendo válido como resumen técnico, pero este
  documento es la referencia autoritativa de topología, autoridad de datos y
  límites explícitos.
- `.agents/coordination.md` (2026-09-08) registra la formalización de esta
  decisión y su coherencia con las decisiones previas de Fase 6.
