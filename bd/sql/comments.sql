BEGIN;

-- ============================================================
-- TABLE DESCRIPTIONS
-- ============================================================

COMMENT ON TABLE companies IS
'Negocio principal al que pertenecen las sucursales, usuarios y demás información del sistema.';

COMMENT ON TABLE branches IS
'Sucursales del negocio. Agrupa la operación, inventario, ventas, empleados y configuración de cada establecimiento.';

COMMENT ON TABLE branch_settings IS
'Configuración flexible y específica de cada sucursal, almacenada como JSONB.';


-- ============================================================
-- USERS / ROLES / PERMISSIONS
-- ============================================================

COMMENT ON TABLE users IS
'Usuarios que pueden autenticarse y operar el sistema.';

COMMENT ON TABLE roles IS
'Roles configurables del sistema, utilizados para agrupar permisos y controlar el acceso de los usuarios.';

COMMENT ON TABLE permissions IS
'Permisos disponibles para controlar el acceso a vistas y acciones específicas del sistema.';

COMMENT ON TABLE role_permissions IS
'Relación entre roles y permisos.';

COMMENT ON TABLE user_roles IS
'Relación entre usuarios y roles, opcionalmente restringida a una sucursal específica.';


-- ============================================================
-- INVENTORY / CATALOG
-- ============================================================

COMMENT ON TABLE inventory_items IS
'Items físicos del inventario. Cada item tiene una unidad de medida, costo por unidad configurada, existencia actual y stock mínimo.';

COMMENT ON TABLE accompaniments IS
'Agrupadores reutilizables de ingredientes que pueden formar parte de productos o utilizarse como adicionales.';

COMMENT ON TABLE accompaniment_components IS
'Ingredientes y cantidades que componen un acompañante.';

COMMENT ON TABLE tax_rates IS
'Tasas de impuestos configurables para productos y operaciones de una sucursal.';

COMMENT ON TABLE products IS
'Productos vendidos por el negocio. Contienen precio de venta, composición y costo calculado a partir de los componentes de inventario.';

COMMENT ON TABLE product_components IS
'Define los componentes que forman un producto, pudiendo ser items directos de inventario o acompañantes reutilizables.';

COMMENT ON TABLE product_additional_accompaniments IS
'Define los acompañantes que pueden agregarse como adicionales a un producto, incluyendo su precio y configuración de cobro.';


-- ============================================================
-- CUSTOMERS
-- ============================================================

COMMENT ON TABLE customers IS
'Clientes registrados del negocio, con información básica, observaciones e historial de compras derivado de sus cuentas.';


-- ============================================================
-- DINING AREAS / TABLES
-- ============================================================

COMMENT ON TABLE dining_areas IS
'Salones o áreas físicas de una sucursal donde se encuentran las mesas.';

COMMENT ON TABLE restaurant_tables IS
'Mesas de un salón, con nombre, capacidad y estado operativo actual.';


-- ============================================================
-- DISCOUNTS
-- ============================================================

COMMENT ON TABLE discount_rules IS
'Reglas reutilizables para aplicar descuentos porcentuales o fijos a cuentas o productos.';

COMMENT ON TABLE account_discounts IS
'Registro histórico de descuentos aplicados directamente a una cuenta.';

COMMENT ON TABLE account_item_discounts IS
'Registro histórico de descuentos aplicados a productos específicos dentro de una cuenta.';


-- ============================================================
-- ACCOUNTS / SALES
-- ============================================================

COMMENT ON TABLE accounts IS
'Cuenta de consumo asociada a una mesa. Agrupa los productos solicitados, descuentos, impuestos, servicio y pagos hasta su cierre.';

COMMENT ON TABLE account_items IS
'Productos individuales incluidos en una cuenta. Conserva snapshots históricos del nombre, precio, costo, información fiscal y consumo de inventario.';

COMMENT ON TABLE account_item_accompaniments IS
'Acompañantes o adicionales seleccionados para un producto dentro de una cuenta. Conserva la información histórica utilizada en la venta.';

COMMENT ON TABLE account_splits IS
'Divisiones de una cuenta realizadas por productos o porcentajes. Cada división puede tener su propio servicio, impuestos y total.';

COMMENT ON TABLE account_split_items IS
'Productos y cantidades asignados a cada división de una cuenta.';

COMMENT ON TABLE payment_methods IS
'Métodos de pago disponibles en una sucursal, como efectivo, QR y tarjeta.';

COMMENT ON TABLE payments IS
'Pagos realizados sobre una cuenta o sobre una división de cuenta. Permite múltiples pagos y pagos mixtos.';


-- ============================================================
-- CASH
-- ============================================================

COMMENT ON TABLE cash_registers IS
'Cajas físicas o lógicas disponibles en una sucursal.';

COMMENT ON TABLE cash_sessions IS
'Turnos de caja desde su apertura hasta el cierre, incluyendo efectivo inicial, efectivo esperado, efectivo contado y diferencia.';

COMMENT ON TABLE cash_movements IS
'Movimientos de dinero asociados a un turno de caja, como ventas, gastos, retiros, depósitos y ajustes.';


-- ============================================================
-- PROCUREMENT
-- ============================================================

COMMENT ON TABLE suppliers IS
'Proveedores asociados a una sucursal para compras de inventario u otros gastos.';

COMMENT ON TABLE purchases IS
'Compras de inventario realizadas a proveedores. Al confirmarse pueden generar movimientos de entrada de inventario.';

COMMENT ON TABLE purchase_items IS
'Items de inventario incluidos en una compra, junto con sus cantidades y costos de adquisición.';

COMMENT ON TABLE expenses IS
'Gastos operativos que no necesariamente generan entradas de inventario, como servicios públicos, limpieza u otros gastos del negocio.';


-- ============================================================
-- INVENTORY KARDEX
-- ============================================================

COMMENT ON TABLE inventory_movements IS
'Kardex inmutable de entradas y salidas de inventario. Registra compras, ventas, ajustes, correcciones y devoluciones.';


-- ============================================================
-- EMPLOYEES / PAYROLL
-- ============================================================

COMMENT ON TABLE employees IS
'Empleados que trabajan en una sucursal. Los empleados son independientes de los usuarios que pueden autenticarse en el sistema.';

COMMENT ON TABLE employee_wage_rates IS
'Rangos horarios y tarifas por hora aplicables al cálculo del pago de un empleado.';

COMMENT ON TABLE employee_shifts IS
'Jornadas trabajadas por los empleados, incluyendo hora de entrada, hora de salida y pago calculado.';

COMMENT ON TABLE employee_bonuses IS
'Bonos adicionales asignados a un empleado, opcionalmente vinculados a una jornada específica.';

COMMENT ON TABLE employee_payments IS
'Registro de pagos realizados a empleados, incluyendo el valor base de la jornada y los bonos correspondientes.';


-- ============================================================
-- KITCHEN / PRINTING
-- ============================================================

COMMENT ON TABLE kitchen_orders IS
'Órdenes enviadas a cocina. Conserva un snapshot en JSONB del contenido que debe imprimirse.';

COMMENT ON TABLE print_jobs IS
'Cola de trabajos de impresión para cocina, caja, cuentas, comprobantes de pago y cierres de día.';


-- ============================================================
-- AUDIT
-- ============================================================

COMMENT ON TABLE audit_logs IS
'Registro histórico de acciones relevantes realizadas por los usuarios, incluyendo datos anteriores y posteriores mediante JSONB.';


-- ============================================================
-- OFFLINE / SYNCHRONIZATION
-- ============================================================

COMMENT ON TABLE sync_devices IS
'Dispositivos autorizados para operar de forma offline y sincronizar información con el servidor.';

COMMENT ON TABLE sync_operations IS
'Operaciones generadas localmente durante el uso offline y utilizadas para sincronizar cambios con el servidor de forma idempotente.';


-- ============================================================
-- BACKUPS
-- ============================================================

COMMENT ON TABLE backup_records IS
'Registro de los backups generados, incluyendo ubicación, estado, tamaño y checksum.';


-- ============================================================
-- VIEWS
-- ============================================================

COMMENT ON VIEW product_profitability IS
'Vista con el precio de venta, costo calculado, utilidad y margen actual de cada producto.';

COMMENT ON VIEW inventory_stock_alerts IS
'Vista que identifica items de inventario sin stock o por debajo del stock mínimo.';

COMMENT ON VIEW table_overview IS
'Vista resumida de los salones y mesas con su capacidad y estado actual.';

COMMENT ON VIEW daily_sales_summary IS
'Resumen agregado de ventas por sucursal y fecha para facilitar reportes y dashboards.';

COMMIT;