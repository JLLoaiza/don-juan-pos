ALTER TABLE cash_movements ADD COLUMN employee_payment_void_id UUID REFERENCES employee_payments(id);
CREATE UNIQUE INDEX ux_cash_movements_employee_payment_void_once ON cash_movements(employee_payment_void_id) WHERE employee_payment_void_id IS NOT NULL;

INSERT INTO permissions(key,name,module) VALUES
 ('employees.void_payment','Void employee payments','workforce')
ON CONFLICT(key) DO NOTHING;
INSERT INTO role_permissions(role_id,permission_id)
SELECT '00000000-0000-7000-8000-000000000003',id FROM permissions WHERE key='employees.void_payment'
ON CONFLICT DO NOTHING;
