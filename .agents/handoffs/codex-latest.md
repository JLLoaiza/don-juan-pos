# Handoff — Codex

## Fase 2 — catálogo e inventario base

Completada para backend. No se avanzó a salón, cuentas ni consumo.

### Contratos y endpoints disponibles

Todas las rutas requieren `Authorization: Bearer` y obtienen la sucursal desde la sesión; no aceptan `company_id` ni `branch_id` del cliente.

- `GET /catalog`: inventario, acompañamientos y productos de la sede activa. Costos se ocultan (`null`) sin `inventory.view_cost` y `products.view_cost`.
- `GET /catalog/inventory-movements`: Kardex de la sede; requiere `inventory.view_movements` y oculta costo sin `inventory.view_cost`.
- `POST /catalog/inventory-items`, `PUT /catalog/inventory-items/:id`, `POST /catalog/inventory-items/:id/adjust`.
- `POST`/`PUT /catalog/accompaniments`.
- `POST`/`PUT /catalog/products` y `POST /catalog/products/:id/price`.

Todo comando mutante requiere `Idempotency-Key` UUID. Los payloads y esquemas están en `@don-juan/contracts` (`catalog.ts`). Las cantidades y montos viajan como strings decimales, no `number`.

### Reglas implementadas

- Un único servicio transaccional cambia stock: bloquea `inventory_items` con `FOR UPDATE`, escribe Kardex/auditoría y actualiza stock en el mismo commit. Stock negativo se permite y se reporta como `NEGATIVE_STOCK`.
- Kardex es inmutable en SQL y verifica `stock_after = stock_before + quantity`.
- Recetas tienen un solo nivel: productos usan inventario y/o acompañamientos; acompañamientos solo inventario. Triggers SQL y validación de aplicación impiden cruces de sucursal.
- Costos derivados se recalculan sincrónicamente al crear/editar receta o subreceta. El precio de venta no cambia al recalcular costo.
- Edición de precio acepta exactamente uno de `salePrice`, `targetProfit` o `targetMarginPercent`; margen de 100% o más se rechaza.
- Reintentos con el mismo `Idempotency-Key` devuelven el resultado almacenado; reutilizarlo para otro comando/payload da conflicto.

### Para Claude

Puede implementar el catálogo contra los contratos ya publicados. No envíe costo calculado, compañía ni sede en el body. Para mutaciones genere y conserve un UUID como `Idempotency-Key`; para editar use `expectedVersion` de la respuesta. `active: false` se envía en los `PUT` administrativos.

Compras y cambios de costo por compra continúan deliberadamente en Fase 5; no existe una edición genérica de `unit_cost` en esta fase.

### Verificación

- `pnpm test`: 120 pruebas correctas.
- Integración PostgreSQL: auth y catálogo, 7 pruebas correctas, incluyendo Kardex inmutable, reintento idempotente, costo derivado, aislamiento de sede y conflicto concurrente.
- Compose: `POST /auth/login` y `GET /catalog` comprobados en vivo.

### Migración

`0012_catalog_integrity_and_commands.sql` añade ledger de comandos, verificación de Kardex, triggers defensivos de receta por sede, unidad inmutable tras movimiento y permisos canónicos de catálogo.
