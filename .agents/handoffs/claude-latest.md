# Handoff — Claude (frontend)

## Fase realizada

Fase 1 — Identidad y contexto de sucursal (frontend). Estado: **COMPLETE**. Este ciclo corrige el flujo de auth para adaptarse al contrato que Codex corrigió (`d97e4ca` → corrección posterior "Corrección de Fase 1 — compañía interna, sucursal pública"): la compañía dejó de ser un concepto de UX.

## Qué cambió y por qué

Codex eliminó `companyId` de `POST /auth/login` y `company` de `AuthContext`/`AuthenticatedContext` (la compañía se resuelve internamente desde la sesión del usuario). En paralelo, ya había recibido instrucción explícita de eliminar cualquier selección de compañía del frontend. Ambas cosas apuntaban en la misma dirección, así que:

- **Login**: solo pide usuario/contraseña. Se eliminó por completo `companyId` del formulario, del estado, del payload y de los tipos. También se eliminó el módulo intermedio `companyConfig.ts`/`VITE_DEFAULT_COMPANY_ID` que había creado en el ciclo anterior como workaround temporal (ya no hace falta: el backend ya no requiere ese dato).
- **Una sola sucursal accesible**: se entra automáticamente, sin paso de selección (`AppShell` ya mostraba esto como texto plano; sin cambios).
- **Varias sucursales accesibles**: el backend ahora devuelve `activeBranch: null` explícitamente hasta que el cliente llama `POST /me/active-branch`. Antes el backend auto-seleccionaba la primera sucursal por orden de ID (un comportamiento no especificado); con la corrección, `AppShell` distingue dos casos que antes eran indistinguibles:
  - **multi-sucursal sin activa** → estado "Elige una sucursal" (normal, no es un error; el selector ya está visible en el header).
  - **una sola sucursal sin activa** → estado de error real ("contacta a un administrador"), caso que no debería ocurrir según la especificación pero se mantiene como red de seguridad.
- Ningún dato de `company` se muestra en ninguna pantalla (nunca se mostró, pero ahora tampoco existe en el tipo — no hay riesgo de reintroducirlo por accidente).

## Estado conceptual del frontend

Ya coincidía con lo pedido antes de este ciclo y sigue así: `AuthContextValue` expone `context.user`, `context.branches`, `context.activeBranch`, `context.permissions` (más `status`/`session`/`isStale` de manejo de sesión). Nada depende de seleccionar compañía.

## Contratos consumidos

`POST /auth/login` `{ username, password }`, `POST /auth/refresh`, `GET /me/context`, `POST /me/active-branch` `{ branchId }` — todos desde `@don-juan/contracts` (reconstruido en este ciclo para tomar el cambio de Codex).

## Limpieza realizada

- Eliminado: `apps/web/src/features/auth/companyConfig.ts`, campo/estado `companyId` en `LoginPage.tsx`, `VITE_DEFAULT_COMPANY_ID` de `.env.example` y `vite-env.d.ts`, todo fixture de test con `companyId`/`company: {...}`.
- No quedó ningún componente, mock ni test que obligue a elegir compañía.

## Tests añadidos/actualizados

- `LoginPage.test.tsx`: nunca aparece un campo/etiqueta de compañía; el login se envía con `{ username, password }` exactamente.
- `AuthProvider.test.tsx`: una sola sucursal → `activeBranch` se resuelve automáticamente tras login; varias sucursales → `activeBranch: null` hasta elegir; cambio de sucursal actualiza `activeBranch` y `permissions` (la clave que cualquier feature branch-scoped debería usar en su `useEffect` para recargar/invalidar).
- `AppShell.test.tsx`: sucursal única → texto plano, sin combobox; varias sucursales → combobox y cambia sucursal al seleccionar; varias sucursales sin activa → prompt "Elige una sucursal" (no outlet, no error); una sola sucursal sin activa → error real; ninguna variante muestra nombre/etiqueta de compañía.
- `App.test.tsx`: integración end-to-end sin campo de compañía en ningún punto del flujo.
- `pnpm --filter @don-juan/web test`: **60/60**. `pnpm test` (monorepo completo): verde.

## Verificación manual

Reconstruí y reinicié el contenedor `compose-web-1` (estaba desactualizado, ver nota abajo) y verifiqué en vivo contra la API real con el usuario de desarrollo (`admin`, una sola sucursal "Don Juan Centro"): login sin pedir compañía, entra directo a la sucursal, nombre de usuario y botón de logout visibles, sin ningún rastro de compañía en la UI.

## Nota operativa (no relacionada con esta tarea, pero relevante)

Detecté que `compose-web-1` se había quedado con una imagen construida *antes* de mis commits de la fase de auth anterior, lo que causaba que rutas protegidas no redirigieran a `/login` (se veía "No encontrado" en su lugar). Lo reconstruí dos veces en esta sesión (antes y después de este cambio). Si en el futuro algo del frontend se ve desactualizado en Compose, lo primero a revisar es si la imagen `compose-web` es más vieja que el último commit de `apps/web`.

## Dependencias backend pendientes

Ninguna para esta corrección. Para la siguiente fase (Salón/mesas/cuentas) sigue pendiente el contrato de `dining_areas`/`restaurant_tables`/`accounts`.

## Siguiente fase frontend esperada

No se avanza de fase (instrucción explícita de este ciclo). Sigue pendiente Salón (`/floor`) en cuanto exista su contrato.
