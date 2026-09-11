# Handoff de producto a planificación técnica — Control manual del estado de una mesa

- **Estado:** `APPROVED`
- **Versión de producto:** `0.2`
- **Fecha de aprobación:** `2026-09-10`
- **Aprobado por:** `Usuario propietario del producto`
- **Evidencia de aprobación explícita:** Después de recibir el resumen integral y la interpretación destacada sobre cuentas `OPEN` vacías, el usuario respondió literalmente: “Listo, está bien”.

## Alcance aprobado

Control manual, dentro de la mesa abierta desde `/floor`, para pasar `AVAILABLE → OCCUPIED` sin crear actividad comercial y `OCCUPIED → AVAILABLE` únicamente cuando no exista cuenta `OPEN`, consumo ni pedido activo.

## Requisitos y criterios de aceptación

Aplican íntegramente `PRD-001` a `PRD-010` y `AC-001` a `AC-011` de `product-definition.md` versión `0.2`.

## Decisiones vinculantes

- Ambas acciones requieren `tables.change_status` y alcance sobre la sucursal activa.
- Ocupar manualmente no crea cuenta, pedido ni consumo.
- Cualquier cuenta `OPEN`, incluso vacía, bloquea liberar.
- La autoridad local revalida concurrencia, confirma la transición, audita y replica posteriormente.
- Se conservan los automatismos vigentes de apertura/inspección y confirmación de consumo.

## Exclusiones

Cerrar o modificar cuentas, reservas, cambios masivos, traslados/uniones, nuevos estados y cualquier implementación dentro de este cluster.

## Riesgos conocidos

- Divergencia histórica entre la especificación que asocia `OCCUPIED` con cuenta `OPEN` y la nueva ocupación manual sin cuenta.
- Carreras entre la elegibilidad mostrada y la aparición de actividad antes de ejecutar.
- Compatibilidad de contratos y réplica para el nuevo comando, por evaluar técnicamente.

## Preguntas pendientes no bloqueantes

Ninguna.

## Instrucción al Technical Planner

Planificar exclusivamente `product-definition.md` versión `0.2`. Si el análisis exige una decisión funcional nueva, detenerse y devolverla al Feature Manager.
