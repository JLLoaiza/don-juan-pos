# Bug: Una mesa disponible pasa a ocupada al inspeccionarla

- **Slug:** `floor-mesa-disponible-ocupada-al-inspeccionar`
- **Estado:** `PARTIAL`
- **Clasificación:** `MIXED`
- **Severidad:** `MEDIUM`
- **Creado:** `2026-09-10`
- **Última actualización:** `2026-09-10`

## Reporte original

> Vale, en la página /floor, las mesas se cambian de estado a "Ocupada" cuando entro a inspeccionar una mesa Disponible.
> Estas no deberían cambiar su estado sino hasta cuando se hace un pedido.

## Resumen operativo

- **Bug:** El clic de inspección todavía crea una cuenta borrador, aunque el estado persistido ya no cambia a `OCCUPIED` hasta confirmar el pedido.
- **Resultado actual:** Un clic sobre una mesa `AVAILABLE` sigue llamando a `POST /accounts` y navega a la cuenta; el backend correctamente conserva `AVAILABLE` hasta el consumo.
- **Resultado esperado:** Inspeccionar no crea cuenta ni emite comandos; solo confirmar el primer pedido crea la cuenta y confirma su consumo, con lo cual la mesa queda `OCCUPIED`.
- **Siguiente acción:** entregar `handoffs/frontend-prompt.md` a Claude y verificar su implementación.

## Entorno y evidencia aportada

- Ruta afectada: `/floor`.
- Reproducción estática demostrada contra el flujo web y la transacción del servicio de salón.
- La prueba de integración se ejecutó contra PostgreSQL local en `localhost:5433` y pasó.

## Documentos

- [Análisis](analysis.md)
- [Plan de implementación](implementation-plan.md)
- [Progreso](progress.md)
- [Coordinación](coordination.md)
- [Corrección backend](handoffs/backend-fix.md)
- [Prompt frontend para Claude](handoffs/frontend-prompt.md)
