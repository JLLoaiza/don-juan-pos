# Feature: Control manual del estado de una mesa

- **Slug:** `control-manual-estado-mesa`
- **Estado:** `DRAFT`
- **Creada:** `2026-09-10`
- **Última actualización:** `2026-09-10`
- **Feature Manager:** `Codex /root`

## Solicitud original

> En la página /floor, cuando abro una mesa: Debo poder tener la opción adentro de "Marcar como ocupada" y "Marcar como disponible". El botón "Marcar como disponible" debe estar sólo disponible si la mesa no tiene pedidos
> Alguna duda?

## Intención preservada

Permitir que, al abrir una mesa desde `/floor`, el usuario pueda marcarla manualmente como ocupada o disponible. La acción para marcarla disponible solo puede ofrecerse cuando la mesa no tenga pedidos. El significado exacto de “no tiene pedidos” debe validarse contra el dominio vigente sin rebajar la restricción expresada por el usuario.

## Resultado esperado del expediente

- [ ] Definición de producto completa
- [ ] Aprobación explícita de producto registrada
- [ ] Plan técnico trazable
- [ ] Handoff listo para futura orquestación de desarrollo

## Documentos

- [Definición de producto](product-definition.md)
- [Plan técnico](technical-plan.md)
- [Decisiones](decisions.md)
- [Progreso](progress.md)
- [Coordinación](coordination.md)
- [Handoff producto → técnico](handoffs/product-to-technical.md)
- [Handoff técnico → implementación](handoffs/technical-to-implementation.md)

## Fuentes autoritativas relacionadas

- `.agents/architecture/local-first-edge-replication.md` — autoridad operativa local por sede y réplica posterior.
- `.agents/tables-accounts-orders.md` — estados, cambios manuales e invariantes de mesas y cuentas.
- `.agents/organization_access.md` — permisos de mesas y alcance por sucursal.
- `.agents/implementation-plan.md` — arquitectura modular, transacciones, idempotencia, auditoría y sincronización.
- `.agents/progress.md` y `.agents/coordination.md` — estado global, decisiones y handoffs vigentes.
- `.agents/bugs/floor-mesa-disponible-ocupada-al-inspeccionar/` — antecedente relacionado, no equivalente.
- `apps/web/src/features/floor/` — experiencia vigente de `/floor` y cuenta.
- `apps/api/src/floor.ts`, `apps/api/src/app.ts`, `packages/contracts/src/floor.ts` — comportamiento, rutas y contratos vigentes.

## Estado resumido

Expediente admitido. No existe una feature equivalente. La definición funcional fue delegada al Product Expert; el Technical Planner permanece sin iniciar hasta aprobación explícita del usuario.
