# Handoff técnico a futura implementación — Control manual del estado de una mesa

- **Estado:** `READY`
- **Versión de producto:** `0.2`
- **Versión del plan técnico:** `1.0`
- **Fecha:** `2026-09-10`

## Objetivo

Implementar el control manual versionado de estado de mesa, sin crear actividad comercial al ocupar y sin permitir liberar cuando exista cuenta `OPEN`.

## Alcance vinculante

- Implementar `PRD-001` a `PRD-010` y verificar `AC-001` a `AC-011`.
- Comando manual `AVAILABLE ↔ OCCUPIED` con `tables.change_status`.
- Ocupación manual sin cuenta, pedido, consumo ni efectos colaterales.
- Liberación bloqueada por cualquier cuenta `OPEN`, incluso vacía.

## Arquitectura y decisiones principales

- Edge/PostgreSQL local confirma; Cloud recibe réplica posterior.
- Nuevo comando idempotente y optimistamente versionado.
- Lock de mesa y validación de cuenta `OPEN` en la misma transacción.
- Estado, auditoría y outbox atómicos.
- Sucursal, compañía y actor derivados de sesión.

## Orden recomendado de implementación

1. Persistencia y contratos.
2. Comando, read model, ruta, permiso, auditoría y outbox.
3. Compatibilidad de apertura de cuenta, confirmación de consumo y pago final.
4. PWA y recuperación de errores.
5. Réplica, observabilidad y validación integral.

## Migraciones y compatibilidad

Agregar mediante la siguiente migración libre `restaurant_tables.version BIGINT NOT NULL DEFAULT 1 CHECK (version > 0)`. No modificar DDL inicial ni migraciones aplicadas. Conservar la columna durante rollback de aplicación.

## Contratos afectados

- Extensión aditiva del snapshot de mesa con versión/elegibilidad.
- Nuevo request/response de cambio de estado.
- Nueva ruta `POST /restaurant-tables/:id/status` con `Idempotency-Key`.

## Estrategia de pruebas

Contrato, HTTP, integración PostgreSQL, concurrencia multiconexión, UI, regresión comercial, réplica sin WAN y E2E de todos los criterios `AC-*`.

## Riesgos y controles

- Adaptar supuestos antiguos `OCCUPIED = cuenta`.
- Mantener orden de locks y probar deadlocks/carreras.
- Incrementar versión en todos los automatismos.
- Preservar versión monotónica en réplica.

## Dependencias y prerrequisitos

- Definición versión `0.2` aprobada.
- Permiso existente `tables.change_status`.
- Infraestructura vigente de comandos, auditoría, outbox y réplica.

## Fuera del alcance

Reservas, estados nuevos, cierre automático de cuentas, cambios masivos, traslado/unión de mesas y cualquier cambio en inventario, cocina o impresión.

## Criterio de entrada para desarrollo

- [x] Producto aprobado
- [x] Plan técnico `TECHNICALLY_PLANNED`
- [x] Matriz de trazabilidad completa
- [x] Sin bloqueos críticos abiertos
