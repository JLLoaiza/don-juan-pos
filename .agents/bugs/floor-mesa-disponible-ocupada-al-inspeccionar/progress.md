# Progreso del bug — Una mesa disponible pasa a ocupada al inspeccionarla

- **Estado:** `PARTIAL`
- **Responsable actual:** `Claude (frontend)`
- **Última actualización:** `2026-09-10`
- **Siguiente acción:** implementar y verificar el handoff frontend.

## Checklist

**Nota backend:** la regresión backend fue implementada y revisada. `pnpm --filter @don-juan/api test src/floor.integration.test.ts` pasó contra PostgreSQL local (`DATABASE_URL_TEST=postgresql://postgres:postgres@localhost:5433/app`); `pnpm --filter @don-juan/api typecheck` y `git diff --check` también pasaron. El frontend sigue creando una cuenta al inspeccionar y requiere el handoff adjunto.

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
- [ ] Resultado final comprobado

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
