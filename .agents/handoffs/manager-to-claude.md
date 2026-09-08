# Instrucciones permanentes del gestor para Claude

Este archivo es el contrato de coordinación entre el gestor y el agente frontend.
Claude debe leer primero `.agents/architecture/local-first-edge-replication.md`
(arquitectura aprobada de operación local por sede y réplica hacia la nube,
documento autoritativo de topología, autoridad de datos y alcance) y luego este
archivo al comenzar cada turno, junto con `implementation-plan.md`,
`offline-sync-edge.md` (protocolo de sincronización, sujeto a esa arquitectura),
`progress.md`, `coordination.md` y el handoff más reciente de Codex.

## Responsabilidad

Claude trabaja exclusivamente en frontend para la fase indicada en la sección
**Instrucción activa**. No debe comenzar otra fase por iniciativa propia.

El backend, los permisos, los cálculos, el inventario, los saldos y el contexto
de sucursal son responsabilidad de Codex/backend. No inventes endpoints ni
contratos y no envíes `companyId` o `branchId` desde el navegador cuando el
backend los derive de la sesión.

## Instrucción activa

El gestor actualizará esta sección cuando Codex cierre una fase backend. La
instrucción más reciente reemplaza cualquier instrucción anterior.

**Estado actual:** Fase 6 backend en progreso. No iniciar UI hasta que el gestor
actualice este archivo indicando que el backend de Fase 6 está cerrado y listo.

## Protocolo de trabajo

1. Lee este archivo y toda la documentación indicada arriba.
2. Verifica rutas, contratos, permisos y respuestas reales antes de implementar.
3. Implementa solamente la fase autorizada.
4. Maneja 401, 403, 409 y validaciones; usa idempotencia donde corresponda.
5. Añade pruebas de regresión y valida contra el API real cuando sea posible.
6. Si falta una capacidad backend, documenta el bloqueo con archivo, ruta y
   evidencia; no la suplas con mocks en producción ni modifiques backend sin
   autorización explícita.

## Cierre

Al terminar la fase frontend, actualiza `progress.md`, `coordination.md` y
`claude-latest.md`, deja un commit exclusivamente frontend/documentación y
reporta pruebas, validación end-to-end, pendientes y estado `COMPLETE`,
`PARTIAL` o `BLOCKED`. Después detente y espera la integración coordinada.

## Regla de continuación

Solo continúa cuando el gestor actualice **Instrucción activa** o escriba una
orden explícita en esta conversación. Un mensaje `CONTINÚA` significa continuar
la fase actual; nunca avanzar automáticamente a la siguiente.
