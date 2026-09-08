-- Phase 5 procurement integrity. This migration intentionally extends the paused local work;
-- it is additive and keeps the historical purchase and expense facts immutable.
ALTER TABLE purchases
  ADD COLUMN cash_session_id UUID REFERENCES cash_sessions(id),
  ADD COLUMN operation_id UUID NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN voided_at TIMESTAMPTZ,
  ADD COLUMN voided_by_user_id UUID REFERENCES users(id),
  ADD COLUMN void_reason TEXT,
  ADD CONSTRAINT purchases_operation_unique UNIQUE(operation_id);

ALTER TABLE expenses
  ADD COLUMN status expense_status NOT NULL DEFAULT 'CONFIRMED',
  ADD COLUMN voided_at TIMESTAMPTZ,
  ADD COLUMN voided_by_user_id UUID REFERENCES users(id),
  ADD COLUMN void_reason TEXT,
  ADD COLUMN operation_id UUID NOT NULL DEFAULT gen_random_uuid(),
  ADD CONSTRAINT expenses_operation_unique UNIQUE(operation_id);

ALTER TABLE cash_movements
  ADD COLUMN purchase_id UUID REFERENCES purchases(id);
CREATE UNIQUE INDEX ux_cash_movements_purchase_once ON cash_movements(purchase_id) WHERE purchase_id IS NOT NULL;

CREATE INDEX idx_purchases_operation_id ON purchases(operation_id);
CREATE INDEX idx_expenses_operation_id ON expenses(operation_id);
CREATE INDEX idx_cash_movements_purchase ON cash_movements(purchase_id);

CREATE OR REPLACE FUNCTION validate_procurement_branch_reference()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.supplier_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM suppliers s WHERE s.id=NEW.supplier_id AND s.branch_id=NEW.branch_id
  ) THEN RAISE EXCEPTION 'supplier must belong to branch'; END IF;
  IF NEW.payment_method_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM payment_methods p WHERE p.id=NEW.payment_method_id AND p.branch_id=NEW.branch_id
  ) THEN RAISE EXCEPTION 'payment method must belong to branch'; END IF;
  IF TG_TABLE_NAME='purchases' AND NEW.cash_session_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM cash_sessions cs JOIN cash_registers cr ON cr.id=cs.cash_register_id
    WHERE cs.id=NEW.cash_session_id AND cr.branch_id=NEW.branch_id
  ) THEN RAISE EXCEPTION 'cash session must belong to branch'; END IF;
  IF TG_TABLE_NAME='expenses' AND NEW.cash_session_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM cash_sessions cs JOIN cash_registers cr ON cr.id=cs.cash_register_id
    WHERE cs.id=NEW.cash_session_id AND cr.branch_id=NEW.branch_id
  ) THEN RAISE EXCEPTION 'cash session must belong to branch'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_purchases_branch_reference BEFORE INSERT OR UPDATE ON purchases
FOR EACH ROW EXECUTE FUNCTION validate_procurement_branch_reference();
CREATE TRIGGER trg_expenses_branch_reference BEFORE INSERT OR UPDATE ON expenses
FOR EACH ROW EXECUTE FUNCTION validate_procurement_branch_reference();

CREATE OR REPLACE FUNCTION prevent_purchase_financial_rewrite()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.branch_id IS DISTINCT FROM OLD.branch_id OR NEW.supplier_id IS DISTINCT FROM OLD.supplier_id
    OR NEW.document_number IS DISTINCT FROM OLD.document_number OR NEW.purchase_date IS DISTINCT FROM OLD.purchase_date
    OR NEW.subtotal IS DISTINCT FROM OLD.subtotal OR NEW.tax_total IS DISTINCT FROM OLD.tax_total
    OR NEW.discount_total IS DISTINCT FROM OLD.discount_total OR NEW.total IS DISTINCT FROM OLD.total
    OR NEW.payment_method_id IS DISTINCT FROM OLD.payment_method_id OR NEW.cash_session_id IS DISTINCT FROM OLD.cash_session_id
    OR NEW.operation_id IS DISTINCT FROM OLD.operation_id
  THEN RAISE EXCEPTION 'confirmed purchase financial facts are immutable'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_purchases_financial_immutable BEFORE UPDATE ON purchases
FOR EACH ROW EXECUTE FUNCTION prevent_purchase_financial_rewrite();

CREATE OR REPLACE FUNCTION prevent_expense_financial_rewrite()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.branch_id IS DISTINCT FROM OLD.branch_id OR NEW.supplier_id IS DISTINCT FROM OLD.supplier_id
    OR NEW.concept IS DISTINCT FROM OLD.concept OR NEW.amount IS DISTINCT FROM OLD.amount
    OR NEW.expense_date IS DISTINCT FROM OLD.expense_date OR NEW.payment_method_id IS DISTINCT FROM OLD.payment_method_id
    OR NEW.cash_session_id IS DISTINCT FROM OLD.cash_session_id OR NEW.operation_id IS DISTINCT FROM OLD.operation_id
  THEN RAISE EXCEPTION 'confirmed expense financial facts are immutable'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_expenses_financial_immutable BEFORE UPDATE ON expenses
FOR EACH ROW EXECUTE FUNCTION prevent_expense_financial_rewrite();
INSERT INTO permissions(key,name,module) VALUES
 ('suppliers.view','View suppliers','procurement'),('suppliers.create','Create suppliers','procurement'),('suppliers.update','Update suppliers','procurement'),
 ('purchases.view','View purchases','procurement'),('purchases.confirm','Confirm purchases','procurement'),
 ('expenses.view','View expenses','procurement'),('expenses.create','Create expenses','procurement')
ON CONFLICT(key) DO NOTHING;
INSERT INTO role_permissions(role_id,permission_id)
SELECT '00000000-0000-7000-8000-000000000003',id FROM permissions
WHERE key IN ('suppliers.view','suppliers.create','suppliers.update','purchases.view','purchases.confirm','expenses.view','expenses.create')
ON CONFLICT DO NOTHING;
