# Progreso del bug — Una mesa disponible pasa a ocupada al inspeccionarla

- **Estado:** `RESOLVED`
- **Responsable actual:** `Analista Técnico`
- **Última actualización:** `2026-09-10`
- **Siguiente acción:** ninguna; preservar las pruebas de regresión.

## Checklist

**Nota de resolución:** la regresión backend fue implementada y revisada. El frontend ya separa inspección y pedido pendiente; la validación final pasó contra PostgreSQL y en la suite web completa.

- [x] Reporte original preservado
- [x] Estado Git y cambios ajenos identificados
- [x] Resultado actual documentado
- [x] Resultado esperado confirmado
- [x] Reproducción o mecanismo causal demostrado
- [x] Causa raíz identificada
- [x] Clasificación confirmada
- [x] Plan de implementación revisado
- [x] Prueba de regresión definida
- [x] Corrección backend verificada o marcada no aplicable
- [x] Prompt frontend generado o marcado no aplicable
- [x] Resultado final comprobado

## Historial

### 2026-09-10 — Bug reportado y diagnosticado

- **Resultado:** La apertura de la cuenta al inspeccionar persiste la mesa como `OCCUPIED`; la transición se localizó en `FloorService.openAccount`.
- **Evidencia:** Flujo web `POST /accounts`, servicio backend y prueba de integración existente inspeccionados; `DATABASE_URL_TEST` no está configurada localmente.
- **Pendiente:** corrección y prueba backend, seguida de revisión analítica de diff y resultados.

### 2026-09-10 — Corrección backend verificada

- **Resultado:** La cuenta borrador conserva la mesa `AVAILABLE`; la primera confirmación de consumo la persiste como `OCCUPIED` dentro de la misma transacción.
- **Evidencia:** `pnpm --filter @don-juan/api test src/floor.integration.test.ts` (1 archivo, 1 prueba pasada), `pnpm --filter @don-juan/api typecheck` y `git diff --check` pasaron; el analista revisó el diff limitado a `floor.ts` y su integración.
- **Pendiente:** separar inspección de creación de cuenta en frontend.

### 2026-09-10 — Alcance frontend confirmado

- **Resultado:** El backend conserva `AVAILABLE` hasta el pedido, pero `FloorPage` aún llama `POST /accounts` al pulsar una mesa disponible.
- **Evidencia:** Implementación y prueba actual de `FloorPage` inspeccionadas; se generó prompt autocontenido para Claude con los contratos backend estabilizados.
- **Pendiente:** implementación y pruebas frontend por Claude.

### 2026-09-10 — Verificación final de frontend y resolución

- **Resultado:** Inspeccionar una mesa disponible navega a un pedido pendiente sin crear una cuenta. Confirmar productos abre una sola cuenta y confirma el consumo con la versión retornada; solo esa transacción ocupa la mesa.
- **Evidencia:** `pnpm --filter @don-juan/web test -- FloorPage.test.tsx PendingOrderPage.test.tsx` pasó (31 archivos, 188 pruebas), ambos typechecks pasaron y la integración backend focalizada pasó contra PostgreSQL local.
- **Pendiente:** ninguno para el alcance reportado.
