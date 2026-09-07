# Handoff — Claude (frontend)

## Tarea realizada

Shell de la PWA (`apps/web`) y sistema de diseño base (`packages/ui`): navegación entre las áreas de dominio del plan, estados de carga/error/vacío reutilizables, un indicador de conectividad real y un cliente HTTP tipado que consume únicamente el contrato ya publicado `GET /health`. No se inventó ningún endpoint, DTO ni semántica de sesión/sucursal/permisos: donde falta contrato, la pantalla lo declara explícitamente como pendiente.

## Archivos principales

- `packages/ui/`: `GlobalStyles` + tokens CSS, y componentes `LoadingState`, `ErrorState` (variantes `network`/`unauthenticated`/`forbidden`/`not-found`/`server`), `EmptyState`, `Banner`, `ConnectivityBadge` (`ONLINE`/`LOCAL_ONLY`/`DEVICE_ONLY`/`CHECKING`), `Button`. Todo con tests (`vitest` + Testing Library).
- `apps/web/src/app-shell/AppShell.tsx`: layout con navegación (`Salón`, `Catálogo`, `Cocina`, `Cobros`, `Caja`, `Compras`, `Personal`, `Reportes`, `Sincronización`), badge de conectividad y un placeholder de sucursal explícitamente marcado como "pendiente de sesión" (sin inventar datos).
- `apps/web/src/lib/api/httpClient.ts` + `health.ts` + `client.ts`: cliente HTTP desacoplado (`z.ZodType` genérico), adaptador de `/health` y el singleton `apiClient`. Reemplazable/ampliable sin reescribir features cuando existan más contratos.
- `apps/web/src/lib/connectivity/useConnectivity.ts`: hook que deriva `ONLINE`/`DEVICE_ONLY` a partir de `navigator.onLine` + `GET /health`. `LOCAL_ONLY` (Edge alcanzable, Cloud no) queda en el tipo pero no es observable todavía porque `/health` no distingue Edge de Cloud — anotado en el código.
- `apps/web/src/features/{auth,floor,catalog,kitchen,billing,cash,procurement,workforce,reports,sync}/`: páginas por dominio. `HomePage` (ruta `/`) consume `GET /health` real con loading/success/error+retry. `SyncPage` muestra el estado de conectividad real. El resto son `FeaturePlaceholder` que declaran qué contrato falta.
- `apps/web/public/sw.js` + `manifest.webmanifest` + `icons/icon.svg`: Service Worker manual (cache-first solo para shell/estáticos same-origin; nunca cachea `/health` ni cualquier otra respuesta) y manifest PWA.
- `tsconfig.json` (raíz): añadida referencia a `packages/ui` en el grafo de `tsc -b`.
- `pnpm-workspace.yaml`: `allowBuilds.esbuild` tenía el placeholder literal `"set this to true or false"`, lo que bloqueaba `pnpm install` (`ERR_PNPM_IGNORED_BUILDS`) para cualquiera. Lo fijé en `true` (esbuild es dependencia transitiva de vite/vitest/tsx, su postinstall solo coloca el binario de la plataforma). No es una decisión de arquitectura, era un valor inválido.

## Contratos

Ninguno nuevo. Solo se consume `GET /health` de `packages/contracts` (ya publicado por Codex). No se creó ningún mock de auth/sucursal/mesas/cuentas/consumo, conforme a `codex-latest.md`.

## Migraciones

Ninguna (fuera de mi ownership).

## Decisiones tomadas

- Conectividad modelada con 4 estados (`ONLINE`/`LOCAL_ONLY`/`DEVICE_ONLY`/`CHECKING`) según `offline-sync-edge.md` §27–31, pero solo `ONLINE`/`DEVICE_ONLY`/`CHECKING` son alcanzables hoy porque el único signal disponible es `GET /health`, que no distingue Edge de Cloud. `LOCAL_ONLY` queda tipado para cuando exista esa distinción.
- Service Worker escrito a mano (sin `vite-plugin-pwa`) para controlar con precisión que solo cachea shell/estáticos same-origin y nunca respuestas de API — evita depender de generación de manifiesto en build para este alcance.
- `packages/ui` se compila con `tsc` (mismo patrón que `contracts`/`domain`/`database`); `apps/web` usa `moduleResolution: "Bundler"` y `noEmit: true` porque Vite (no `tsc`) hace el bundling — por eso `apps/web` no participa en el grafo `tsc -b` de la raíz (solo `packages/ui` se añadió a `tsconfig.json`).

## Tests ejecutados

- `pnpm typecheck` (raíz, `tsc -b`) y `pnpm --filter @don-juan/web typecheck`: sin errores.
- `pnpm test` (raíz: build + `pnpm -r test`): **7/7 paquetes con test, todos verdes** — incluye `packages/ui` (14 tests) y `apps/web` (16 tests: `httpClient`, adaptador `health`, `useConnectivity`, `HomePage`, `App` de integración con router).
- Verificación manual en navegador (Vite dev server en `:5173` vía `.claude/launch.json`, API real en `:3000` contra el Postgres ya migrado): navegación entre las 9 áreas, estado `DEVICE_ONLY`/error de red visible, retry funcional, `/sync` reportando el estado real, responsive en viewport móvil (375px) tras un ajuste de `flex-wrap` en el header.

### Bug encontrado y corregido durante la verificación

Un patrón de valor-por-defecto-de-función recreado en cada render (`fetchHealth = () => apiClient.health.getHealth()` en `HomePage`, y el equivalente inline en `AppShell`) producía un **bucle de render infinito** en cuanto el componente se montaba sin la prop inyectada (o sea, en uso real de la app, no en sus tests unitarios aislados). Se manifestó como un proceso `vitest` worker consumiendo varios GB de RAM al 100% CPU en el test de integración `App.test.tsx`. Corregido moviendo esos defaults a constantes de módulo (identidad estable) y, en `useConnectivity`, guardando `checkHealth` en un `ref` en vez de en el arreglo de dependencias del `useCallback`. Si algún otro componente futuro reutiliza este hook, debe pasarle una función con identidad estable (module-level o memoizada), no una arrow function inline.

## Pendiente

- Todas las pantallas de dominio (`floor`, `catalog`, `kitchen`, `billing`, `cash`, `procurement`, `workforce`, `reports`) están vacías a propósito: necesitan que Codex publique los contratos correspondientes en `packages/contracts` antes de implementar UI real, mocks o IndexedDB.
- IndexedDB (`cache`, `pending_commands`, `print_receipts`, `conflicts`) no se implementó todavía: no hay ningún comando de dominio con contrato publicado que encolar.
- El selector de sucursal es un placeholder deshabilitado ("Sucursal: pendiente de sesión"); falta el contrato de `GET /me/context` / sesión para implementarlo de verdad (ver `coordination.md`, entradas de sesión/roles pendientes de revisión de ChatGPT).

## Dependencia para Codex (bloqueante para probar el frontend contra la API real desde el navegador)

`apps/api` no envía cabeceras CORS. Verificado en vivo: `apps/web` en `http://localhost:5173` contra la API real en `http://localhost:3000` (Postgres ya migrado) recibe `GET /health` bloqueado por el navegador (`No 'Access-Control-Allow-Origin' header`), aunque `curl`/Node sí reciben 200. El frontend maneja esto correctamente (muestra `ErrorState` de red con retry), pero ningún flujo real podrá probarse en navegador hasta que la API permita el origen de desarrollo del frontend (o un proxy). Registrado también en `.agents/coordination.md`. No toqué `apps/api` — está fuera de mi ownership.

## Breaking changes

Ninguno.

## Estado del repo

Todo sin commitear (no se pidió commit). Cambios: `packages/ui/` (nuevo), `apps/web/` (nuevo), `.claude/launch.json` (nuevo, config del dev server para el Browser tool), `tsconfig.json` y `pnpm-workspace.yaml` (raíz, ver arriba), `pnpm-lock.yaml` (nuevas dependencias: react, react-dom, react-router-dom, vite, @vitejs/plugin-react, vitest testing-library/jsdom, zod ya existía).
