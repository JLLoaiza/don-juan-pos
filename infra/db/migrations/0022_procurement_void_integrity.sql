-- Separate references preserve one original cash outflow and one compensating inflow per purchase.
ALTER TABLE cash_movements ADD COLUMN purchase_void_id UUID REFERENCES purchases(id);
CREATE UNIQUE INDEX ux_cash_movements_purchase_void_once ON cash_movements(purchase_void_id) WHERE purchase_void_id IS NOT NULL;
CREATE INDEX idx_cash_movements_purchase_void ON cash_movements(purchase_void_id);

INSERT INTO permissions(key,name,module) VALUES
 ('purchases.void','Void purchases','procurement'),('expenses.void','Void expenses','procurement')
ON CONFLICT(key) DO NOTHING;
INSERT INTO role_permissions(role_id,permission_id)
SELECT '00000000-0000-7000-8000-000000000003',id FROM permissions
WHERE key IN ('purchases.void','expenses.void')
ON CONFLICT DO NOTHING;
