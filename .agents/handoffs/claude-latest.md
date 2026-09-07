# Handoff — Claude (frontend)

## Fase realizada

Fase 1 — Identidad y contexto de sucursal (frontend). Estado: **COMPLETE**.

Backend publicó los contratos de auth (`codex-latest.md`, commit `d97e4ca`) y este ciclo implementa el consumo real de esos contratos en `apps/web`, reemplazando el placeholder de sesión del ciclo anterior.

## Pantallas / features implementadas

- `POST /login`: formulario con `companyId` (oculto/prefijado si `VITE_DEFAULT_COMPANY_ID` está configurado, editable si no), usuario, contraseña. Sin doble submit (deshabilita mientras está pendiente), mensajes de error diferenciados (401 credenciales, red, genérico), redirige de vuelta a la ruta originalmente solicitada tras iniciar sesión.
- `RequireAuth`: guarda de ruta — `bootstrapping` muestra loading de página completa, `unauthenticated` redirige a `/login` (conservando la ruta de origen), `authenticated` renderiza el resto del árbol.
- `AppShell`: selector de sucursal real (texto plano si el usuario tiene una sola sucursal, `<select>` si tiene varias — `organization_access.md` §5-7), menú de usuario con nombre y botón "Cerrar sesión", banner de sucursal-vacía si `activeBranch` es `null` (caso borde: sucursal revocada después de crear la sesión).
- Todas las rutas de dominio (`/floor`, `/catalog`, `/kitchen`, `/billing`, `/cash`, `/procurement`, `/workforce`, `/reports`, `/sync`) ahora viven detrás de `RequireAuth`; siguen siendo placeholders (ningún contrato nuevo para ellas todavía).
- `useConnectivity`/`ConnectivityBadge` del ciclo anterior no cambiaron de contrato, solo se re-cablearon dentro del nuevo shell autenticado.

## Contratos consumidos

Desde `@don-juan/contracts` (`auth.ts`), sin inventar nada adicional:

- `POST /auth/login` → `AuthenticatedContext`
- `POST /auth/refresh` → `AuthenticatedContext`
- `GET /me/context` (Bearer) → `AuthContext`
- `POST /me/active-branch` (Bearer) → `AuthContext`

`httpClient` se amplió con `postJson` (antes solo tenía `getJson`) y soporte de headers/body, necesario para consumir estos cuatro endpoints. Contrato de errores (`ApiErrorSchema`, 401/403/400/500) reutilizado sin cambios.

## Mocks temporales

Ninguno. Los cuatro endpoints de auth están implementados y verificados en vivo contra la API real (ver "Problemas encontrados y resueltos").

## Decisión de UX no especificada (documentada, no bloqueante)

`POST /auth/login` exige `companyId` (UUID) pero no existe un flujo de "resolver compañía" (por subdominio, invitación, etc.). Se resolvió con `VITE_DEFAULT_COMPANY_ID` (env de frontend, ver `.env.example`): si está configurado, el campo se omite del formulario (UX de single-tenant); si no, se muestra un campo de texto editable como *fallback*. No es una decisión de dominio, es puramente de UX de frontend — no se registró en `coordination.md` porque no cruza ownership de otro agente ni bloquea nada.

## Tests ejecutados

- `pnpm --filter @don-juan/web test`: **54/54 tests**, 13 archivos — incluye `httpClient` (GET+POST), `authApi`, `session` (localStorage), `authCache` (IndexedDB vía `fake-indexeddb`), `AuthProvider` (bootstrap con/sin sesión guardada, éxito/fracaso de refresh, fallback a snapshot offline marcado `isStale`, login, logout, retry transparente de `setActiveBranch` tras 401), `LoginPage` (render, anti doble-submit, mensajes de error, redirect post-login), `RequireAuth`, `AppShell` (selector de sucursal single/multi, logout), `App` (integración end-to-end con router).
- `pnpm typecheck` (raíz) y `pnpm --filter @don-juan/web typecheck`: sin errores.
- `pnpm test` (raíz, build + todos los paquetes): verde — 7/7 paquetes con tests.
- Corrida repetida 3 veces seguidas para descartar flakiness (ver más abajo, ya resuelto).
- Verificación manual en navegador contra la API real (Compose de Codex, usuario de desarrollo `admin` / sucursal única "Don Juan Centro"): login, persistencia de sesión tras recargar (múltiples veces), navegación protegida (`/floor`, `/sync`), logout. Todo correcto tras el fix descrito abajo.

## Problemas encontrados y resueltos

1. **Bug real de producción (no solo de test): doble `POST /auth/refresh` con el mismo token en el arranque.** `React.StrictMode` (activo en `main.tsx`) invoca los efectos dos veces en desarrollo; el `useEffect` de bootstrap de `AuthProvider` no tenía guarda, así que en cada carga de página se enviaban dos refresh casi simultáneos con el mismo refresh token. Como el backend rota el token en cada uso, la segunda petición fallaba con 401 y la sesión se cerraba inmediatamente — reproducible SOLO en navegador real (los tests unitarios no usan `StrictMode`, por eso no lo detectaban). Corregido con una guarda `useRef` que asegura que el efecto de bootstrap solo ejecute su lado real una vez, sin importar cuántas veces StrictMode invoque el callback. Verificado con múltiples recargas reales sin `401` espurios.
2. **Flakiness de tests en `AuthProvider.test.tsx`**: los tests que simulaban clic + `waitFor` sobre texto del DOM eran no confiables bajo carga (IndexedDB vía `fake-indexeddb` puede tardar más de 1s en su primera transacción de un archivo de test bajo contención de CPU). Se resolvió (a) con un *warm-up* de IndexedDB en `beforeAll` del setup global y (b) reescribiendo esos tests para invocar los métodos de `AuthProvider` directamente (patrón `ref` + `act()`) en vez de simular clics y sondear el DOM — más rápido y determinista para probar lógica de máquina de estados.
3. **CORS** (reportado en el ciclo anterior): ya resuelto por Codex (`feat(api): allow configured PWA origins`, commit `b12631e`) y verificado en vivo.

## Dependencias backend pendientes

Ninguna para completar Fase 1. Para la siguiente fase frontend (salón/mesas/cuentas) se necesita que Codex publique contratos de `dining_areas`/`restaurant_tables`/`accounts` en `packages/contracts` antes de implementar UI real (por ahora sigue siendo placeholder explícito, sin inventar endpoints).

## Siguiente fase frontend esperada

Salón (`/floor`): áreas, mesas y apertura de cuenta — bloqueada hasta que exista el contrato correspondiente (ver `implementation-plan.md` Fase 3, "Vertical slice funcional"). Si al ejecutar `continúa` el contrato de salón todavía no existe, la siguiente fase implementable es reforzar catálogo/permisos visuales u otra área cuyo contrato ya esté publicado en ese momento — debe determinarse leyendo `packages/contracts` y `codex-latest.md` en ese momento, no asumirse desde aquí.

## Commit/rama relevante

Todo committeado en `main` en 3 commits temáticos de este ciclo: extensión de `httpClient` + módulo de auth/sesión/IndexedDB (`packages/ui` sin cambios), enrutamiento protegido y `AppShell` con selector de sucursal real, y este handoff/progreso. (Ver `git log` para hashes exactos — se commitea al final de esta ejecución.)
