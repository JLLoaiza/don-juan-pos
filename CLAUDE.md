# Don Juan POS/ERP — coordinación frontend

Antes de trabajar, lee obligatoriamente, en este orden:

1. `.agents/architecture/local-first-edge-replication.md` — arquitectura
   aprobada de operación local por sede y réplica hacia la nube. Es el
   documento autoritativo de topología, autoridad de datos y alcance; sustituye
   cualquier supuesto de sincronización basada solo en navegadores/dispositivos.
2. `.agents/handoffs/manager-to-claude.md`

Ese segundo archivo contiene la instrucción activa del gestor, la fase
autorizada y el protocolo de cierre. Respétalo junto con
`.agents/implementation-plan.md`, `.agents/offline-sync-edge.md` (protocolo de
sincronización, sujeto a la arquitectura del punto 1), `.agents/progress.md`,
`.agents/coordination.md` y los handoffs de Codex.

No avances de fase por iniciativa propia. Si la instrucción activa indica que
el backend aún está en progreso, revisa el estado y espera sin implementar UI.
