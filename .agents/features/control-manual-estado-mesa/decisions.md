# Decisiones — Control manual del estado de una mesa

Registro append-only de decisiones confirmadas. Las correcciones no borran el historial.

## DEC-001 — Acciones manuales solicitadas

- **Fecha:** `2026-09-10`
- **Estado:** `APPROVED`
- **Origen:** `Usuario`
- **Decisión:** Al abrir una mesa desde `/floor`, ofrecer “Marcar como ocupada” y “Marcar como disponible”; esta última solo debe estar disponible si la mesa no tiene pedidos.
- **Motivo:** Solicitud original del usuario.
- **Impacto:** Introduce control manual de ocupación y una restricción funcional para liberar mesas.
- **Reemplaza a:** `No aplica`
- **Evidencia de aprobación:** El usuario respondió “Listo, está bien” después de recibir el resumen de la definición versión `0.2` y la interpretación explícita sobre cuentas abiertas vacías.

## DEC-002 — Una cuenta abierta vacía bloquea liberar la mesa

- **Fecha:** `2026-09-10`
- **Estado:** `APPROVED`
- **Origen:** `Usuario`
- **Decisión:** “Marcar como disponible” no se ofrece ni se acepta cuando existe una cuenta `OPEN`, aunque todavía no tenga productos, ni cuando exista consumo o pedido activo.
- **Motivo:** Preservar el invariante vigente y evitar cuentas abiertas asociadas a mesas presentadas como libres.
- **Impacto:** El criterio de liberación es más estricto que comprobar únicamente ítems confirmados.
- **Reemplaza a:** `No aplica`
- **Evidencia de aprobación:** El usuario respondió “Listo, está bien” tras presentarse esta interpretación como la única decisión material de la versión `0.2`.
