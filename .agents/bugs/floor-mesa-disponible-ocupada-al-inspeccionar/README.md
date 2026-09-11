# Bug: Una mesa disponible pasa a ocupada al inspeccionarla

- **Slug:** `floor-mesa-disponible-ocupada-al-inspeccionar`
- **Estado:** `RESOLVED`
- **Clasificación:** `MIXED`
- **Severidad:** `MEDIUM`
- **Creado:** `2026-09-10`
- **Última actualización:** `2026-09-10`

## Reporte original

> Vale, en la página /floor, las mesas se cambian de estado a "Ocupada" cuando entro a inspeccionar una mesa Disponible.
> Estas no deberían cambiar su estado sino hasta cuando se hace un pedido.

## Resumen operativo

- **Bug:** Inspeccionar una mesa disponible creaba una cuenta y la marcaba ocupada antes de confirmar un pedido.
- **Resultado actual verificado:** Inspeccionar navega al pedido pendiente sin llamar `POST /accounts`; al confirmar productos se crea una única cuenta y se confirma el consumo, que cambia la mesa a `OCCUPIED`.
- **Resultado esperado:** Inspeccionar no crea cuenta ni emite comandos; solo confirmar el primer pedido crea la cuenta y confirma su consumo, con lo cual la mesa queda `OCCUPIED`.
- **Siguiente acción:** ninguna; conservar la cobertura de regresión.

## Entorno y evidencia aportada

- Ruta afectada: `/floor`.
- Reproducción estática demostrada contra el flujo web y la transacción del servicio de salón.
- La prueba de integración se ejecutó contra PostgreSQL local en `localhost:5433` y pasó.
- El 2026-09-10 pasaron 188 pruebas web, los typechecks web/API y la integración de salón focalizada.

## Documentos

- [Análisis](analysis.md)
- [Plan de implementación](implementation-plan.md)
- [Progreso](progress.md)
- [Coordinación](coordination.md)
- [Corrección backend](handoffs/backend-fix.md)
- [Prompt frontend para Claude](handoffs/frontend-prompt.md)
