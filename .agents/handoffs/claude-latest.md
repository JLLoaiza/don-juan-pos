# Handoff — Claude (frontend)

## Fase realizada

Fase 6 — Revalidación y cierre del frontend administrativo cloud de solo
lectura sobre la arquitectura local-first, tras el hotfix backend `ac5181e`
("fix(phase6): allow cloud context and edge health") que corrigió los dos
bloqueos reportados en el ciclo anterior. Estado: **COMPLETE**.

## Bloqueos previos, ahora cerrados

`ac5181e` modifica únicamente `apps/api/src/app.ts:25-33`:

1. Exenta `GET /health` de ambos candados (bloqueo local-branch-lock y
   cloud-read-only), incluso con un Edge ya enrolado.
2. Exenta `POST /me/active-branch` del candado de sólo-lectura en Cloud
   (cambio de contexto de lectura autorizado, no una escritura operacional).
3. En Edge, `POST /me/active-branch` ahora responde antes de exigir un
   `activeBranch` ya resuelto: si el `branchId` del cuerpo coincide con la
   sucursal enrolada, deja pasar la petición a `setActiveBranch`; si no
   coincide, `403` inmediato — un Edge sigue sin poder operar otra sucursal.

No fue necesario ningún cambio de contrato (`packages/contracts` intacto).

## Cambios de frontend (sólo los que la nueva respuesta backend exigía)

`apps/web/src/features/replication/ReplicationPage.tsx`:

- El mensaje de error al cambiar de sede en Cloud ya no afirma un bloqueo
  arquitectónico permanente (`"POST /me/active-branch está bloqueado por
  diseño..."`); ahora es un mensaje genérico apropiado para un `403` real
  ocasional (p. ej. acceso revocado a esa sede mientras tanto).
- "Panel consolidado parcial" (el aviso que explicaba que cambiar de sede
  estaba bloqueado) se eliminó por quedar factualmente incorrecto. La
  sección se renombró a "Sedes autorizadas": lista las sedes autorizadas del
  usuario y cada fila (salvo la activa) es un botón que cambia de sede — la
  misma función que ya usa el `<select>` de arriba, ahora compartida entre
  ambos puntos de entrada (`selectBranch`, un solo `useCallback`).
- El contrato sigue exponiendo el estado de una sola sede a la vez (la
  activa de la sesión); no hay una consulta que traiga el estado de todas
  las sedes autorizadas simultáneamente, así que el panel sigue sin ser un
  "dashboard" con todas las filas pobladas a la vez — es honesto al
  respecto en su propio texto. Elegir una sede (selector o fila) actualiza
  el panel completo de esa sede, que es lo que pidió esta revalidación.

Nada más cambió: la vista Edge (`EdgeReplicationView`), la consulta de
réplica agrupada por tipo (`ReplicationEntitiesSection`/`EntityGroups`), el
manejo de 401/403/red (`ErrorState`) y las rutas consumidas
(`GET /replication/status`, `GET /replication/cloud/entities`) siguen
idénticas — ya funcionaban correctamente y no dependían del bloqueo.

## Verificación en vivo (Edge y Cloud reales, backend `ac5181e`)

Se repitió la validación de punta a punta descrita en el ciclo anterior, con
dos Postgres desechables nuevos (fuera del repo, ya eliminados) y, esta vez,
una segunda sede (`Don Juan Norte`) otorgada al mismo usuario admin en Cloud
para poder ejercitar el caso multi-sede real.

1. **Cloud, selector multi-sede (ítem 1 pedido).** Con el admin autorizado
   en dos sedes y sesión nueva (`activeBranch: null` al iniciar, el mismo
   caso antes irrecuperable): `POST /me/active-branch` a cualquiera de las
   dos sedes respondió `200` en vivo. En el navegador, el selector superior
   ("Sucursal", ya existente desde Fase 1) y el selector propio de
   `/replication` ("Sede") cambiaron correctamente de "Don Juan Centro" a
   "Don Juan Norte" y viceversa, y el panel completo se actualizó cada vez
   con datos reales y honestos: Norte (sin servidor Edge enrolado) mostró
   "Sin servidor enrolado", "Inactivo", "Nunca", "0 eventos" y los avisos de
   datos desactualizados/sin servidor; Centro (con un Edge recién enrolado
   en esta verificación) mostró "Servidor Centro revalidacion", "Activo".
   También se probó el tercer punto de entrada — la fila de "Sedes
   autorizadas" — haciendo clic en "Don Juan Norte", que cambió de sede
   igual que los selectores.
2. **Edge enrolado, `/health` público (ítem 2 pedido).** Con
   `EDGE_SERVER_ID`/`EDGE_BRANCH_ID` configurados (servidor realmente
   enrolado), `curl` sin `Authorization` a `GET /health` respondió `200`. En
   el navegador, tras iniciar sesión contra ese Edge, el badge superior
   mostró **"En línea"** (no "SERVIDOR NO DISPONIBLE"/"Sin conexión al
   servidor" que se documentó como falso negativo en el ciclo anterior), y
   `/replication` mostró el estado local esperado sin selector de sede.
3. **Reglas local-first intactas (ítem 3 pedido).** `grep` sobre
   `apps/web/src/features/replication/*` confirma que no hay ninguna
   referencia a `/sync`, `IndexedDB`/`indexedDB` ni `DEVICE_ONLY`. No se
   reintrodujo ningún selector de sede dentro del modo Edge (sigue sin
   selector, confirmado también en vivo). No hay edición remota de
   catálogo ni escritura Cloud→sede en ningún punto de este código.

**Incidente de entorno durante la verificación (ajeno al código).** A mitad
de esta revalidación, Docker Desktop se cayó (`com.docker.service` quedó
`Stopped`; todos los contenedores Docker de la máquina, incluidos los de
Codex si tenía alguno arriba, quedaron `Exited`). No se relanzó ningún
contenedor de Codex — sólo los propios, desechables, de esta verificación.
Si Codex tenía servicios Docker corriendo para su propio trabajo, pueden
necesitar reiniciarlos. El fix backend en sí y esta verificación no
dependen de ese incidente ni lo causaron; quedó documentado por
transparencia.

## Tests

Se actualizaron los tests existentes que asumían el bloqueo (mensaje de
error, ausencia del panel) y se añadieron pruebas de regresión nuevas para
ambos flujos: cambio de sede exitoso desde el selector (verifica que
dispara `setActiveBranch` y que `useReplicationStatus` vuelve a consultar
`/replication/status`), cambio de sede desde una fila de "Sedes
autorizadas", y un 403 real que ya no se atribuye a un bloqueo permanente.

`pnpm -w typecheck`: correcto. `pnpm --filter @don-juan/web test`:
**159/159** (157 previas + 2 nuevas; una prueba antigua se reescribió para
reflejar el nuevo copy, no se perdió cobertura). `apps/api`: no se tocó
código backend; se corrieron igualmente sus 94 pruebas sin base de datos
(sin regresiones) y las 5 pruebas HTTP nuevas de `ac5181e`
(`replication.http.test.ts`), todas correctas.

## Lo que no se tocó

`apps/api/**`, `packages/contracts/**`, `infra/db/migrations/**`. No se
avanza a Fase 7.

## Siguiente fase frontend esperada

Ninguna todavía. Fase 6 frontend queda `COMPLETE`. El panel de réplica sigue
limitado, por diseño de contrato (no por un defecto), a mostrar el estado de
una sede a la vez; si en el futuro se publica una consulta multi-sede real
o bulk, el panel "Sedes autorizadas" es el lugar natural para consumirla.
