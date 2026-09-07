# Handoff — Claude (frontend)

## Fase realizada

Fase 3 — Salón, mesas, cuentas y consumo (frontend). Estado: **COMPLETE**. Backend, contratos y migraciones de Fase 3 fueron publicados y commiteados por Codex durante este mismo ciclo (`0e52c3a feat(floor): add transactional table consumption`, más los ajustes de trigger `0014`/`0015` y la publicación posterior de `POST /dining-areas`/`POST /restaurant-tables`); implementé la UI completa contra esos contratos, incluyendo la creación de áreas/mesas que se agregó a mitad de sesión.

## Pantallas y flujos implementados

Todo bajo `apps/web/src/features/floor/`, montado en `/floor` (reemplaza el placeholder) y en la nueva ruta `/floor/accounts/:accountId`:

- **Salón (`FloorPage`)**: mesas agrupadas por área, coloreadas por estado (disponible=blanco, ocupada=amarillo, reservada=naranja, según §8 de `tables-accounts-orders.md`). Click en una mesa con cuenta abierta navega a esa cuenta; click en una mesa disponible/reservada abre una cuenta nueva (`POST /accounts`) y navega a ella. Botones "Nueva área" / "Nueva mesa" (gateados por `dining_areas.create` / `tables.create`) para dar de alta áreas y mesas — necesarios porque antes de este ciclo no existía forma de poblar el salón salvo SQL directo; Codex publicó `POST /dining-areas` y `POST /restaurant-tables` durante la sesión y los consumí en cuanto aparecieron.
- **Cuenta (`AccountPage`)**: encabezado con estado (Abierta/Pagada/Anulada), tabla de ítems confirmados (producto, cantidad, precio, costo si hay permiso, total de línea, estado, notas, adicionales anidados), totales (subtotal, descuentos, servicio, impuestos, total). Banner de confirmación tras enviar consumo: número de ticket de cocina y estado del trabajo de impresión, o alerta de stock negativo (nunca bloquea la venta).
- **Agregar consumo (`ConsumptionForm`)**: solo visible en cuenta `OPEN` con los tres permisos que exige el endpoint (`accounts.update`, `sales.add_items`, `kitchen.send`). Permite agregar varias líneas de producto (desde el catálogo ya cargado), cantidad entera positiva, notas por línea, y selección de adicionales configurados para ese producto específico (con casilla "sin costo" solo si el adicional lo permite). Valida con el mismo `ConfirmConsumptionRequestSchema` publicado antes de enviar.
- Estados de carga/error/vacío en ambas pantallas (`ErrorState` forbidden/network/server con reintento); evita doble envío con `submitting` por formulario; recarga la cuenta tras confirmar consumo.
- El precio, costo, impuesto, receta y totales los resuelve siempre el servidor; el frontend solo envía intención (`productId`, `quantity`, `selectedAdditionals`, `notes`) — nunca precio ni costo.

## Contratos consumidos

`GET /floor`, `POST /dining-areas`, `POST /restaurant-tables`, `GET /accounts/:id`, `POST /accounts`, `POST /accounts/:id/confirm-consumption` — todos desde `@don-juan/contracts` (`packages/contracts/src/floor.ts`). Para el selector de productos/adicionales dentro de una cuenta reutilicé `useCatalog()` de Fase 2 (ya construido), que exige `products.view` + `inventory.view` + `accompaniments.view` juntos — si un rol de mesero no tiene esos tres permisos, ese bloque muestra su propio `ErrorState`, sin tumbar el resto de la pantalla de cuenta.

## Vacío de contrato detectado (documentado, no inventado)

`AccountItemSnapshotSchema.unitCost` no es nullable — el backend siempre lo envía en `GET /accounts/:id` y en la respuesta de `confirm-consumption`, a diferencia de `GET /catalog` que sí oculta costo sin `products.view_cost`/`inventory.view_cost`. El frontend oculta la columna de costo en la tabla de ítems cuando el usuario no tiene `products.view_cost`, pero es solo ocultamiento de presentación: el valor ya viaja en el cuerpo de la respuesta HTTP que el navegador recibió. Documentado en `.agents/coordination.md` con la sugerencia de que el backend omita `unitCost` por ítem según permiso, igual que ya hace catálogo.

## Mocks temporales

Ninguno. Todo consume la API real.

## Tests ejecutados

- `pnpm --filter @don-juan/web test`: **98/98** (77 previos de Fase 1+2 + 1 nuevo test de `putJson` que ya estaba + 20 nuevos de Fase 3: `floorApi.test.ts` cubre forma de cada request incluyendo `Idempotency-Key`; `FloorPage.test.tsx` cubre loading, 403→forbidden con reintento, error de red, estado vacío, navegación a cuenta existente al hacer click en mesa ocupada, apertura de cuenta en mesa disponible con permiso, mesa deshabilitada sin permiso, ocultar/mostrar acciones de crear área/mesa según permiso, y creación end-to-end de área y de mesa con recarga; `AccountPage.test.tsx` cubre loading, ítems/totales renderizados, ocultar/mostrar costo unitario según `products.view_cost`, no ofrecer "agregar consumo" en cuenta `PAID` ni sin los tres permisos requeridos, confirmación de consumo end-to-end con banner de ticket de cocina, y banner de alerta de stock negativo sin tratarlo como fallo). Tuve que corregir `App.test.tsx` (el test de `/floor` esperaba el placeholder anterior) y ajustar dos fixtures de test que usaban IDs no-UUID donde el propio `ConfirmConsumptionRequestSchema`/`CreateRestaurantTableRequestSchema` sí exige UUID.
- `pnpm -w typecheck` y `pnpm -w test`: correctos en todo el workspace.

## Verificación manual

Reconstruí y reinicié `compose-web-1` dos veces en este ciclo (antes y después de agregar creación de áreas/mesas). Con el usuario de desarrollo (`admin`, permisos completos), contra la API y PostgreSQL reales del Compose local, de punta a punta:

1. Creé un área ("Salón principal") y una mesa ("Mesa 1", 4 personas, Disponible) desde la UI — antes de esto no existía ningún dato de salón en la base de desarrollo.
2. Click en la mesa disponible → abrió una cuenta nueva y navegó a `/floor/accounts/:id`.
3. Agregué "Combo pollo" (producto creado en la verificación de Fase 2) y confirmé consumo.
4. La cuenta mostró el ítem con precio/costo/línea correctos, totales recalculados por el servidor, banner "Enviado a cocina (ticket …)" y una alerta de stock negativo real (el ítem de inventario "Carne de res" ya estaba en stock negativo desde la prueba de Fase 2; la venta se registró igual, sin bloquear, tal como exige la especificación).
5. Volví a `/floor`: la mesa ahora se ve "Ocupada" en amarillo, confirmando la transición automática de estado.

## Dependencias backend pendientes

- El vacío de contrato de `unitCost` no-nullable en ítems de cuenta (no bloquea).
- Para Fase 4 (Cobro: descuentos, servicio, divisiones, pagos, caja) no hay contrato publicado aún.

## Riesgos o deudas reales

- No implementé anulación de cuenta (`accounts.void`), anulación de ítem confirmado, mover cuenta entre mesas, ni asociar/cambiar cliente — ninguno de esos endpoints existe todavía en el backend (`tables-accounts-orders.md` los define, pero Codex documentó explícitamente que Fase 3 fue solo el vertical slice: abrir cuenta → confirmar consumo). No inventé esos endpoints.
- El picker de productos dentro de una cuenta depende de que el rol tenga los tres permisos de vista de catálogo (`products.view`, `inventory.view`, `accompaniments.view`); un rol "Mesero" real necesitaría que un administrador se los conceda para poder tomar pedidos — es una decisión de configuración de roles, no algo que el frontend deba resolver.

## Siguiente fase frontend esperada

No avanzo a Fase 4. Fase 3 queda con frontend completo y lista para integración.
