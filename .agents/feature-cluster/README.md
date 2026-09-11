# Cluster de definición de funcionalidades

Este directorio define un flujo multiagente para convertir una solicitud informal
del propietario del producto en dos artefactos robustos y trazables:

1. una definición de producto aprobada;
2. un plan técnico basado exclusivamente en esa definición aprobada.

El cluster termina al completar esos dos artefactos. No implementa código, no crea
migraciones y no coordina el desarrollo.

## Punto de entrada

Inicia una conversación con el agente que pueda gestionar subagentes y usa este
mensaje:

```text
Actúa como Feature Manager de Don Juan POS. Lee y cumple
`.agents/feature-cluster/feature-manager.md`.

Quiero definir la siguiente funcionalidad:

<DESCRIPCIÓN LIBRE>
```

El usuario no necesita completar un formulario previo. El Feature Manager debe
extraer la intención, investigar el contexto del repositorio y pedir únicamente
las decisiones que cambien materialmente el producto.

## Agentes

- `feature-manager.md`: orquesta el expediente y es el único interlocutor con el
  usuario.
- `product-expert.md`: produce la definición funcional y sus criterios de
  aceptación.
- `technical-planner.md`: produce el plan técnico después de la aprobación
  explícita del producto.

## Expediente de una funcionalidad

Cada funcionalidad vive en `.agents/features/<feature-slug>/`. El slug debe ser
breve, descriptivo, estable, en minúsculas y separado por guiones.

```text
.agents/features/<feature-slug>/
├── README.md
├── product-definition.md
├── technical-plan.md
├── decisions.md
├── progress.md
├── coordination.md
└── handoffs/
    ├── product-to-technical.md
    └── technical-to-implementation.md
```

La estructura se crea copiando los archivos de `templates/`. No se debe crear
una carpeta de funcionalidad hasta que el Feature Manager haya comprobado que no
existe ya un expediente equivalente.

## Compuerta obligatoria

El planificador técnico no puede trabajar mientras `product-definition.md` no
tenga estado `PRODUCT_APPROVED` y `product-to-technical.md` no registre la
aprobación explícita del usuario. Una respuesta ambigua, el silencio o la mera
ausencia de objeciones no constituyen aprobación.

Si el alcance funcional cambia después de la aprobación, la definición vuelve a
`DRAFT`, el plan técnico queda `STALE` y el flujo regresa al experto de producto.

## Estados permitidos

- `DRAFT`
- `NEEDS_PRODUCT_DECISION`
- `PRODUCT_APPROVED`
- `TECHNICAL_PLANNING`
- `TECHNICALLY_PLANNED`
- `STALE`
- `BLOCKED`
- `COMPLETE`

`COMPLETE` significa que la definición de producto y el plan técnico están
terminados y son coherentes entre sí. No significa que la funcionalidad esté
implementada.
