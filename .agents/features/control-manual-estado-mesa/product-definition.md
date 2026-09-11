# Definición de producto — Control manual del estado de una mesa

- **Estado:** `DRAFT`
- **Versión:** `0.2`
- **Última actualización:** `2026-09-10`

## 1. Problema y contexto

En `/floor`, el usuario puede abrir una mesa, pero no indicar manualmente dentro de ella que está ocupada o disponible. Se necesita ese control sin que ocuparla cree por sí solo una cuenta, pedido o consumo.

La solicitud condiciona liberar a que la mesa “no tenga pedidos”. El dominio vigente prohíbe `AVAILABLE` mientras exista una cuenta `OPEN`. Por eso esta definición interpreta “sin pedidos” como ausencia de cuenta abierta y de consumo/pedido activo. Esta interpretación conservadora se somete visiblemente a aprobación.

## 2. Objetivo y resultado observable

Permitir que una persona autorizada cambie explícitamente el estado desde la mesa abierta a partir de `/floor`, preservando la actividad comercial y evitando liberar mesas con actividad vigente. Una transición válida se refleja; una inválida no se ofrece ni puede completarse por datos obsoletos.

## 3. Actores y permisos

- Usuario autenticado con acceso a la compañía y sucursal de la mesa.
- Ambas acciones requieren `tables.change_status`; entrar a `/floor` no lo concede.
- Solo se actúa sobre mesas de la compañía y sucursal activas.

## 4. Alcance

### Incluido

- Acciones “Marcar como ocupada” y “Marcar como disponible” dentro de la mesa abierta.
- `AVAILABLE → OCCUPIED` sin crear actividad comercial.
- `OCCUPIED → AVAILABLE` solo sin cuenta `OPEN` ni consumo/pedido activo.
- Estado de las acciones según permiso, estado y elegibilidad; concurrencia, auditoría y local-first.

### Excluido

- Crear, modificar, cerrar o eliminar cuentas, pedidos o consumos.
- Nuevos automatismos, cambios masivos, reservas, unión/traslado o estados nuevos.
- Plan técnico, migraciones e implementación.

## 5. Glosario

- **Mesa abierta:** experiencia al acceder a una mesa desde `/floor`; no implica cuenta `OPEN`.
- **Cuenta abierta:** cuenta `OPEN`, aunque no tenga ítems.
- **Consumo/pedido activo:** operación aún vigente según los estados del dominio.
- **`OCCUPIED`:** mesa no disponible; no prueba actividad comercial.
- **`AVAILABLE`:** mesa libre, sujeta a invariantes.

## 6. Precondiciones y disparadores

Sesión válida, alcance activo, mesa existente y permiso `tables.change_status`. El disparador es elegir una acción dentro de la mesa. Para liberar, la autoridad operativa confirma en ese momento que no hay cuenta `OPEN` ni consumo/pedido activo.

## 7. Flujos funcionales

### Flujo principal

1. El usuario abre la mesa desde `/floor`.
2. Si está autorizado, ve la transición válida para el estado vigente.
3. Al marcar ocupada, se valida y cambia a `OCCUPIED` sin crear ni modificar actividad comercial.
4. Al marcar disponible, se revalida la ausencia de actividad y cambia a `AVAILABLE`.
5. El cambio confirmado se refleja y audita.

### Flujos alternos y recuperación

- Si ya coincide el estado, no hay segunda transición; se presenta el vigente.
- Sin permiso o alcance, se rechaza sin cambios.
- Si aparece actividad antes de liberar, se rechaza, permanece ocupada y se actualiza la vista.
- Si la autoridad local no confirma o la respuesta es incierta, no se muestra éxito; se consulta el estado antes de reintentar.

## 8. Estados y transiciones

| Inicial | Acción | Condición | Final |
|---|---|---|---|
| `AVAILABLE` | Marcar ocupada | Autorizado | `OCCUPIED` |
| `OCCUPIED` | Marcar disponible | Sin cuenta `OPEN` ni actividad | `AVAILABLE` |
| `OCCUPIED` | Marcar disponible | Hay cuenta `OPEN` o actividad | Sin cambio |
| Estado solicitado | Repetir | Ya coincide | Sin cambio |

Invariantes: una cuenta `OPEN`, aun vacía, o consumo/pedido activo impide `AVAILABLE`; ocupar manualmente no crea actividad; el cambio no altera importes ni ciclos comerciales.

## 9. Reglas de negocio

### PRD-001 — Ubicación
Las acciones están dentro de la mesa abierta desde `/floor`.

### PRD-002 — Autorización y alcance
Solo `tables.change_status` permite verlas como ejecutables y efectuarlas dentro de la compañía y sucursal activas.

### PRD-003 — Ocupación sin efectos comerciales
Marcar `OCCUPIED` cambia solo el estado y no crea ni modifica cuentas, pedidos o consumos.

### PRD-004 — Liberación sin actividad
“Marcar como disponible” solo se ofrece y acepta sin cuenta `OPEN` ni consumo/pedido activo. Una cuenta abierta vacía también bloquea.

### PRD-005 — Coherencia contextual
En `AVAILABLE` se ofrece ocupar; en `OCCUPIED`, liberar solo si es elegible. No se induce una transición redundante o prohibida.

### PRD-006 — Concurrencia
La autoridad operativa revalida al ejecutar; la presentación previa no autoriza liberar si cambió la actividad.

### PRD-007 — Resultado y recuperación
Solo se comunica éxito confirmado. Rechazo, conflicto o incertidumbre conservan/consultan el estado autoritativo, explican el motivo y permiten recuperar sin duplicar efectos.

### PRD-008 — Auditoría
Cada transición conserva actor, compañía, sucursal, mesa, estados anterior/nuevo, fecha/hora y origen manual.

### PRD-009 — Local-first
La sede es autoridad durante desconexiones de Cloud; confirma localmente y replica después sin vulnerar invariantes.

### PRD-010 — Compatibilidad
No reemplaza automatismos válidos, incluido ocupar al confirmar consumo. Abrir o inspeccionar no cambia el estado.

## 10. Validaciones y errores

- Sin permiso/alcance: “No tienes permiso para cambiar el estado de esta mesa.”
- Con actividad: “La mesa no puede marcarse como disponible porque tiene una cuenta abierta o pedidos activos.”
- Cambio concurrente: “El estado de la mesa cambió. Revisa la información actualizada.”
- Mesa inaccesible: recurso no disponible, sin revelar otro alcance.
- Resultado incierto: “No se pudo confirmar el cambio. Verifica el estado antes de reintentar.”

Los textos pueden adaptarse al patrón vigente conservando motivo y recuperación. La validación visual no sustituye la autoritativa.

## 11. Auditoría e historial

Se conserva la evidencia de `PRD-008`; los rechazos dejan evidencia cuando la política vigente lo exige, sin fingir una transición. El historial comercial no cambia.

## 12. Operación local-first, Edge y Cloud

Edge/sede confirma aun sin Cloud y la interfaz no depende de Cloud para operar localmente. La réplica es posterior. Ante incompatibilidad, no se consolida `AVAILABLE` con cuenta `OPEN` o actividad; el conflicto queda observable.

## 13. Compatibilidad e impacto funcional

- Se preservan ocupación al confirmar consumo e inspección sin cambio de estado.
- Una cuenta abierta vacía bloquea liberar; no se cierra automáticamente.
- Cálculos, moneda y redondeo: **No aplica**, solo cambia estado.
- Tratamiento histórico: **No aplica**, no reclasifica transiciones previas.

## 14. Criterios de aceptación

### AC-001 — Acción contextual (`PRD-001`, `PRD-005`)
```gherkin
Given un usuario autorizado abre una mesa desde /floor
When se presenta la mesa
Then encuentra dentro de ella la transición válida para su estado vigente
```

### AC-002 — Ocupar sin actividad (`PRD-002`, `PRD-003`, `PRD-008`)
```gherkin
Given una mesa AVAILABLE y un usuario autorizado en su alcance
When selecciona "Marcar como ocupada"
Then queda OCCUPIED y se audita
And no se crea ni modifica cuenta, pedido o consumo
```

### AC-003 — Liberar (`PRD-004`, `PRD-006`, `PRD-008`)
```gherkin
Given una mesa OCCUPIED sin cuenta OPEN ni consumo o pedido activo
When selecciona "Marcar como disponible"
Then la autoridad permite dejarla AVAILABLE y audita la transición
```

### AC-004 — Cuenta vacía bloquea (`PRD-004`)
```gherkin
Given una mesa OCCUPIED con cuenta OPEN sin ítems
When se evalúa "Marcar como disponible"
Then la acción no es ejecutable y permanece OCCUPIED
```

### AC-005 — Actividad bloquea (`PRD-004`)
```gherkin
Given una mesa OCCUPIED con consumo o pedido activo
When se evalúa la liberación
Then no es ejecutable y permanece OCCUPIED
```

### AC-006 — Concurrencia (`PRD-006`, `PRD-007`)
```gherkin
Given que la liberación fue ofrecida y luego aparece actividad
When el usuario intenta completarla
Then la autoridad la rechaza, informa y no deja la mesa AVAILABLE
```

### AC-007 — Sin autorización (`PRD-002`)
```gherkin
Given un usuario sin permiso o fuera del alcance
When abre la mesa o intenta el cambio directamente
Then no puede ejecutarlo y el estado no cambia
```

### AC-008 — Reintento (`PRD-005`, `PRD-007`)
```gherkin
Given que la mesa ya está en el estado solicitado
When se repite la intención
Then no existe otra transición y se presenta el estado vigente
```

### AC-009 — Sin Cloud (`PRD-009`)
```gherkin
Given Edge operativo y Cloud no disponible
When se realiza una transición válida
Then se confirma localmente y queda pendiente su réplica
```

### AC-010 — Automatismos (`PRD-010`)
```gherkin
Given una mesa sin cambio manual
When solo se abre o se confirma consumo por el flujo vigente
Then abrir no cambia su estado y confirmar conserva el automatismo
```

### AC-011 — Evidencia (`PRD-008`)
```gherkin
Given una transición manual confirmada
When se consulta su evidencia
Then identifica actor, alcance, mesa, estados, fecha/hora y origen manual
```

## 15. Métricas o señales de éxito

- Cero liberaciones con cuenta `OPEN` o actividad vigente.
- Cero cuentas/pedidos/consumos creados al solo ocupar.
- Resultados de intentos observables; sin regresiones en automatismos.

## 16. Riesgos y supuestos

- **Interpretación sometida a aprobación:** “sin pedidos” incluye no tener cuenta `OPEN`, aunque esté vacía, ni consumo/pedido activo.
- “Activo” reutiliza estados existentes; no crea otro ciclo de vida.
- Una mesa puede quedar ocupada manualmente sin cuenta.
- La concurrencia puede retirar o rechazar una acción antes ofrecida.

## 17. Decisiones pendientes

No hay preguntas materiales abiertas. `PRD-004` debe aprobarse integralmente y no por silencio.

## 18. Referencias

- `README.md` del expediente.
- `.agents/tables-accounts-orders.md`.
- `.agents/organization_access.md`.
- `.agents/architecture/local-first-edge-replication.md`.
- `.agents/implementation-plan.md`.
- `.agents/bugs/floor-mesa-disponible-ocupada-al-inspeccionar/`.
- Código citado en el `README.md`, como evidencia vigente y no definición de producto.
