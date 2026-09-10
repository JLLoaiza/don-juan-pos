# Handoff — Frontend, Fase 5

## Estado

Fase 5 — Compras, inventario y personal (frontend): **COMPLETE** contra los contratos y rutas reales publicados por backend. La integración formal está **COMPLETE**. No se avanzó a Fase 6.

## Pantallas entregadas

- `/procurement`: proveedores, confirmación de compras, gastos, Kardex y anulaciones.
- `/workforce`: empleados, tarifas por hora, turnos, bonos, pagos y anulación de pagos.

No hay campos ni visualización de `companyId` o `branchId`. La sucursal activa se deriva del contexto autenticado; cuando cambia, las consultas de compras, gastos, inventario y personal se vuelven a cargar. Los IDs técnicos solo existen dentro de selectores con nombres legibles; no se solicitan UUIDs manuales.

## Rutas reales consumidas

| Ruta | UI | Permiso de UX |
| --- | --- | --- |
| `GET/POST/PUT /suppliers` | proveedores | `suppliers.view/create/update` |
| `GET/POST /purchases`, `POST /purchases/:id/void` | compras y anulación | `purchases.view/confirm/void` |
| `GET/POST /expenses`, `POST /expenses/:id/void` | gastos y anulación | `expenses.view/create/void` |
| `GET /catalog/inventory-movements` | Kardex | `inventory.view_movements` |
| `GET /catalog`, `GET /payment-methods`, `GET /cash-registers` | selectores de inventario, pago y caja | contratos de lectura publicados |
| `GET/POST/PUT /employees` | empleados | `employees.view/create/update` |
| `GET /employees/:id/wage-rates`, `POST /employee-wage-rates` | tarifas | `employees.view_rates/manage_rates` |
| `GET /employee-shifts`, `POST /employee-shifts/clock-in`, `POST /employee-shifts/:id/clock-out` | turnos | `employees.view_shifts/create_shift/complete_shift` |
| `GET/POST /employee-bonuses` | bonos | `employees.view_bonuses/create_bonus` |
| `GET /employee-payments`, `POST /employee-shifts/:id/payments`, `POST /employee-payments/:id/void` | pagos | `employees.view_payments/pay/void_payment` |

Todas las mutaciones generan una `Idempotency-Key` UUID por intento. Las cantidades, costos ponderados, costo derivado, efectivo, nómina y compensaciones provienen de la respuesta/validación del servidor; el navegador solo recoge selecciones permitidas y entradas del operador.

## Comportamientos importantes

- Los botones de mutación se ocultan sin permiso, pero el backend sigue siendo la autoridad.
- Estados de carga, vacío, 401/403, 409 y validaciones usan el patrón común de la aplicación.
- Una compra solo permite seleccionar inventario, proveedor, método y caja por nombre. El costo final y la afectación de Kardex se resuelven en backend.
- Los pagos de empleado solo muestran turnos completados y bonos pendientes compatibles. El frontend no calcula el pago: muestra explícitamente que lo calcula el servidor.
- Para pagos `CASH`, compras y gastos, se selecciona una caja que ya tiene sesión abierta. No se introducen IDs.
- Anular una compra, gasto o pago abre un formulario separado con explicación de impacto, motivo obligatorio y casilla de confirmación explícita. Nunca se presenta como edición silenciosa.
- El Kardex es solo de lectura y muestra trazabilidad de fecha, tipo, cantidad, stock antes/después y motivo.

## Pruebas ejecutadas

- `pnpm --filter @don-juan/web test`: **147/147** correctas.
- `pnpm -w typecheck`: correcto.

Cobertura agregada:
- `ProcurementPage.test.tsx`: 403, visibilidad por permiso, confirmación explícita de anulación e invalidación tras cambiar sede.
- `procurementApi.test.ts`: rutas reales, cuerpo sin tenancy de cliente e `Idempotency-Key`.
- `WorkforcePage.test.tsx`: 403, permiso de creación, cuerpo sin tenancy, idempotencia e invalidación tras cambiar sede.

## Para integración

No quedan mocks de producción en las pantallas de Fase 5. La verificación integrada con API/PostgreSQL local pasó (13/13 pruebas de integración); Fase 6 no se implementó.
