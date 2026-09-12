# Coordinación — Control manual del estado de una mesa

Registro append-only de hallazgos, contradicciones, bloqueos y mensajes entre agentes.

## 2026-09-10 20:52 — Feature Manager — Admisión y antecedente relacionado

- **Tipo:** `HALLAZGO`
- **Contexto:** Se verificó si la solicitud ya estaba cubierta por otra feature o corrección.
- **Evidencia:** `.agents/features/` no contiene expedientes equivalentes. El bug `.agents/bugs/floor-mesa-disponible-ocupada-al-inspeccionar/` corrige la ocupación automática al inspeccionar y conserva la ocupación automática al confirmar consumo; no añade controles manuales.
- **Impacto:** La solicitud es una feature nueva relacionada con ese antecedente, no un duplicado.
- **Acción requerida:** Incorporar compatibilidad con ese flujo en la definición funcional.
- **Responsable:** `Product Expert`
- **Estado:** `OPEN`

## 2026-09-10 20:52 — Feature Manager — Tensión semántica sobre pedidos y cuentas

- **Tipo:** `CONTRADICCIÓN`
- **Contexto:** El usuario restringe “Marcar como disponible” cuando la mesa tenga pedidos.
- **Evidencia:** `.agents/tables-accounts-orders.md` §12 prohíbe `AVAILABLE` cuando existe una cuenta `OPEN`; el código actual puede conservar temporalmente una cuenta abierta vacía con mesa `AVAILABLE`, y ocupa la mesa al confirmar consumo.
- **Impacto:** Debe definirse si “sin pedidos” significa sin consumo confirmado, sin cuenta abierta, o ambas condiciones, sin debilitar el invariante autoritativo.
- **Acción requerida:** Resolver desde producto y elevar al usuario solo si cambia materialmente la experiencia solicitada.
- **Responsable:** `Product Expert`
- **Estado:** `OPEN`

## 2026-09-10 20:52 — Feature Manager — Estado técnico vigente

- **Tipo:** `HALLAZGO`
- **Contexto:** Inspección inicial de contratos, backend, frontend y permisos.
- **Evidencia:** Existe `tables.change_status` en migración de permisos, pero no hay contrato, ruta o método vigente para cambiar el estado manualmente. `/floor` navega a cuenta existente o pedido pendiente; `AccountPage` no muestra acciones de estado.
- **Impacto:** La definición debe cubrir permisos, ubicación de las acciones y consistencia ante cambios concurrentes, sin prescribir aún la implementación.
- **Acción requerida:** Reflejarlo en el PRD; reservar solución técnica hasta la compuerta de aprobación.
- **Responsable:** `Product Expert`
- **Estado:** `OPEN`

## 2026-09-10 — Product Expert — Handoff de definición funcional

- **Tipo:** `HANDOFF`
- **Contexto:** Definición funcional redactada a partir de la solicitud original y las fuentes autoritativas.
- **Evidencia:** `product-definition.md` versión `0.2`, requisitos `PRD-001` a `PRD-010` y criterios `AC-001` a `AC-011`.
- **Impacto:** El documento está listo para revisión y aprobación explícita; no habilita todavía planificación técnica.
- **Acción requerida:** Presentar al usuario alcance, exclusiones, interpretación vinculante y riesgos.
- **Responsable:** `Feature Manager`
- **Estado:** `RESOLVED`

## 2026-09-10 — Feature Manager — Aprobación explícita y apertura de compuerta técnica

- **Tipo:** `HANDOFF`
- **Contexto:** El usuario revisó el resumen de la versión `0.2`, incluida la interpretación de que una cuenta `OPEN` vacía bloquea liberar.
- **Evidencia:** Respuesta literal del usuario: “Listo, está bien”; `handoffs/product-to-technical.md` completado.
- **Impacto:** Se autoriza iniciar planificación técnica exclusivamente sobre la versión `0.2`.
- **Acción requerida:** Inspeccionar el repositorio real y producir `technical-plan.md` trazable.
- **Responsable:** `Technical Planner`
- **Estado:** `OPEN`

## 2026-09-10 — Technical Planner — Handoff de planificación

- **Tipo:** `HANDOFF`
- **Contexto:** Planificación realizada exclusivamente sobre producto versión `0.2` aprobada.
- **Evidencia:** `technical-plan.md` en `TECHNICALLY_PLANNED`, con `TECH-001..009`, pruebas y matrices completas.
- **Impacto:** Existe una ruta incremental para contratos, persistencia, API, compatibilidad comercial, PWA, réplica y observabilidad.
- **Acción requerida:** Control final del Feature Manager.
- **Responsable:** `Feature Manager`
- **Estado:** `RESOLVED`

## 2026-09-10 — Feature Manager — Control de calidad y cierre

- **Tipo:** `RESOLUCIÓN`
- **Contexto:** Revisión de robustez, coherencia y trazabilidad del expediente.
- **Evidencia:** Los diez `PRD-*` tienen cobertura `TECH-*`; los once `AC-*` tienen pruebas previstas; migración, compatibilidad, seguridad, permisos, auditoría, concurrencia, idempotencia, Edge/Cloud y observabilidad fueron evaluados; no hay bloqueos críticos.
- **Impacto:** El expediente queda listo para futura orquestación de desarrollo.
- **Acción requerida:** Ninguna dentro de este cluster.
- **Responsable:** `Feature Manager`
- **Estado:** `RESOLVED`

## 2026-09-11 — Codex — Registro de implementación e integración

- **Tipo:** `HANDOFF`
- **Contexto:** El usuario confirmó que backend y frontend estaban listos y solicitó commit, push y registro.
- **Evidencia:** Backend en `7dcbcb0`; cambios frontend en siete archivos de `apps/web/src/features/floor/`; pruebas backend adicionales en cinco archivos. Typechecks, suite web, contratos y pruebas API sin PostgreSQL pasaron.
- **Impacto:** La funcionalidad queda preparada para versionarse y publicarse en `main` con trazabilidad documental.
- **Acción requerida:** Ejecutar integraciones PostgreSQL en CI o en un entorno con `DATABASE_URL_TEST`; no fueron ejecutables localmente por variable ausente.
- **Responsable:** `Pipeline / futura validación de despliegue`
- **Estado:** `OPEN`

## 2026-09-10 — Feature Manager — Revisión de calidad de producto

- **Tipo:** `RESOLUCIÓN`
- **Contexto:** Revisión del entregable del Product Expert.
- **Evidencia:** No hay marcadores vacíos, lenguaje evasivo ni solución técnica impuesta; se cubren permisos, transiciones, errores, concurrencia, auditoría, local-first, compatibilidad y aceptación verificable.
- **Impacto:** La definición versión `0.2` puede presentarse para aprobación.
- **Acción requerida:** Esperar una aprobación o cambios explícitos del usuario. No iniciar Technical Planner.
- **Responsable:** `Usuario / Feature Manager`
- **Estado:** `RESOLVED`
