# Handoff — Codex

## Fase 1 — identidad y contexto de sucursal

Implementada y verificada contra PostgreSQL mediante Compose.

### Contratos ya disponibles para Claude

Desde `@don-juan/contracts`:

- `POST /auth/login` recibe `{ companyId, username, password }` y devuelve `AuthenticatedContext`.
- `POST /auth/refresh` recibe `{ refreshToken }` y devuelve un `AuthenticatedContext` con refresh rotado.
- `GET /me/context` requiere `Authorization: Bearer <accessToken>` y devuelve `AuthContext`.
- `POST /me/active-branch` requiere el mismo bearer y recibe `{ branchId }`; devuelve el contexto recalculado.

`AuthContext` expone `user`, `company`, `branches`, `activeBranch` (puede ser `null` cuando hay más de una sucursal y ninguna seleccionada) y `permissions` como lista plana. Cada sucursal incluye su `settings` JSON.

### Semántica de seguridad

- Access token JWT HMAC de 15 minutos; refresh opaco, hasheado, persistido y rotado en transacción.
- Cada endpoint protegido vuelve a comprobar sesión, compañía/usuario activos, sucursal accesible y permisos actuales desde PostgreSQL. Desactivar usuario/compañía o revocar una sucursal toma efecto inmediatamente.
- Los roles globales (`branch_id = NULL`) aplican únicamente dentro de las sucursales presentes en `user_branch_access`; roles y accesos entre compañías se rechazan también por triggers SQL.

### Datos de desarrollo

Compose deja un acceso de desarrollo:

- companyId: `00000000-0000-7000-8000-000000000001`
- username: `admin`
- password: `ChangeMe!123`

Es exclusivamente bootstrap local. Producción debe proporcionar `AUTH_JWT_SECRET` seguro y reemplazar/desactivar ese usuario tras aprovisionamiento.

### Cambios de migración

- `0009_identity_access.sql`: rol global, acceso a sucursal y sesión revocable.
- `0010_identity_initial_data.sql`: catálogo inicial de permisos.
- `0011_development_identity_seed.sql`: empresa/sucursal/admin de desarrollo, separado para conservar inmutables las migraciones ya aplicadas.

### Verificación

- `pnpm build` correcto.
- `pnpm test` correcto: 56 pruebas; 2 de integración PostgreSQL se omiten si no se provee `DATABASE_URL_TEST`.
- Compose reconstruido y migrado. Smoke test real `login → /me/context` correcto (Centro, 9 permisos).

### Próximo backend

Fase 2: catálogo e inventario base, empezando por contratos antes de persistencia. Claude ya puede avanzar con login/contexto/selector de sucursal contra las rutas reales o mocks con estos esquemas.
