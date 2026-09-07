# Handoff — Codex

## Corrección de Fase 1 — compañía interna, sucursal pública

La Fase 1 continúa completa. Se corrigió el contrato para que la compañía sea tenancy interno y la única selección operativa del cliente sea una sucursal.

### Breaking change para Claude

- `POST /auth/login` ahora recibe exactamente `{ username, password }`. Se eliminó `companyId`.
- `AuthenticatedContext` y `AuthContext` ya no incluyen `company`. Conservan `user`, `branches`, `activeBranch`, `permissions` y, cuando aplica, `session`.
- `POST /me/active-branch` sigue recibiendo solamente `{ branchId }`.

No envíes `company_id` ni lo uses para construir contexto, seleccionar sede o autorizar una operación. El backend obtiene la compañía desde el usuario de la sesión.

### Reglas vigentes

- Una sola sucursal accesible se selecciona y persiste automáticamente al iniciar sesión.
- Varias sucursales accesibles devuelven `activeBranch: null` hasta que el cliente ejecute `POST /me/active-branch` con el `branchId` elegido.
- El cambio de sede resuelve usuario y compañía desde el bearer token, exige que la sede pertenezca a esa compañía y que exista `user_branch_access`; ambos fallos son `403`.
- La consulta de credenciales rechaza un resultado ambiguo entre compañías sin revelar cuál tenancy coincide.

### Verificación

- Compilación completa del workspace: correcta.
- Pruebas API: correctas.
- Pruebas PostgreSQL de identidad: 4 correctas (sede única automática, multisedes, sede de otra compañía prohibida y sede propia sin acceso prohibida).
- Smoke test HTTP real: `POST /auth/login` sin compañía seguido de `GET /me/context`; no expone `company` y selecciona `CENTRO` automáticamente para el usuario de desarrollo.

### Scope

No se modificaron `companies` ni `company_id` en PostgreSQL y no se avanzó a Fase 2.
