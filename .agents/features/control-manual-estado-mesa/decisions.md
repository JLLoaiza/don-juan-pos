# Decisiones — Control manual del estado de una mesa

Registro append-only de decisiones confirmadas. Las correcciones no borran el historial.

## DEC-001 — Acciones manuales solicitadas

- **Fecha:** `2026-09-10`
- **Estado:** `PROPOSED`
- **Origen:** `Usuario`
- **Decisión:** Al abrir una mesa desde `/floor`, ofrecer “Marcar como ocupada” y “Marcar como disponible”; esta última solo debe estar disponible si la mesa no tiene pedidos.
- **Motivo:** Solicitud original del usuario.
- **Impacto:** Introduce control manual de ocupación y una restricción funcional para liberar mesas.
- **Reemplaza a:** `No aplica`
- **Evidencia de aprobación:** La solicitud confirma la intención, pero la definición integral de producto aún requiere revisión y aprobación explícita.
