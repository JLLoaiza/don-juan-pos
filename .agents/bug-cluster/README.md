# Cluster de análisis y solución de bugs

Este cluster convierte un reporte informal de un bug en diagnóstico reproducible,
plan técnico, corrección backend verificada y, cuando corresponda, un prompt
autocontenido para que Claude realice el trabajo frontend.

## Punto de entrada

```text
Actúa como Analista Técnico de Bugs de Don Juan POS/ERP. Lee y cumple
`.agents/bug-cluster/bug-analyst.md`.

Bug observado:
<DESCRIPCIÓN LIBRE, ERROR, PASOS O EVIDENCIA DISPONIBLE>
```

El usuario no está obligado a completar un formulario. El Analista Técnico debe
investigar los datos faltantes que pueda obtener del repositorio y preguntar solo
cuando no exista una forma segura de continuar.

## Agentes

- `bug-analyst.md`: es el punto de entrada, reproduce, diagnostica, planifica,
  gestiona el expediente y se comunica con el usuario.
- `backend-developer.md`: es creado por el Analista Técnico cuando existe trabajo
  backend; implementa y verifica la corrección contra el plan.

Solo existen esos dos roles. El Analista Técnico puede crear una instancia del
Backend Developer cuando corresponda, pero no debe introducir un tercer agente
gestor ni delegar su responsabilidad de análisis.

## Expediente

Cada bug se registra en `.agents/bugs/<bug-slug>/` usando `templates/`:

```text
README.md
analysis.md
implementation-plan.md
progress.md
coordination.md
handoffs/backend-fix.md
handoffs/frontend-prompt.md
```

## Enrutamiento

- `BACKEND`: el Backend Developer implementa y verifica la solución.
- `FRONTEND`: no se modifica frontend; se genera `frontend-prompt.md` para Claude.
- `MIXED`: se corrige backend y luego se genera el prompt frontend con los
  contratos reales resultantes.
- `INFRASTRUCTURE_OR_UNKNOWN`: se conserva el diagnóstico y se solicita la
  autorización o especialidad que falte; no se fuerza una solución backend.

## Estados

- `REPORTED`
- `INVESTIGATING`
- `NEEDS_INFORMATION`
- `DIAGNOSED`
- `BACKEND_FIX_IN_PROGRESS`
- `BACKEND_FIXED`
- `FRONTEND_HANDOFF_READY`
- `PARTIAL`
- `BLOCKED`
- `RESOLVED`

`RESOLVED` exige evidencia de que el resultado actual defectuoso ya no ocurre y
el resultado esperado se cumple. La existencia de un parche, por sí sola, no es
resolución.
