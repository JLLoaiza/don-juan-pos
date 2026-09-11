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

## 2026-09-10 — Feature Manager — Revisión de calidad de producto

- **Tipo:** `RESOLUCIÓN`
- **Contexto:** Revisión del entregable del Product Expert.
- **Evidencia:** No hay marcadores vacíos, lenguaje evasivo ni solución técnica impuesta; se cubren permisos, transiciones, errores, concurrencia, auditoría, local-first, compatibilidad y aceptación verificable.
- **Impacto:** La definición versión `0.2` puede presentarse para aprobación.
- **Acción requerida:** Esperar una aprobación o cambios explícitos del usuario. No iniciar Technical Planner.
- **Responsable:** `Usuario / Feature Manager`
- **Estado:** `RESOLVED`
