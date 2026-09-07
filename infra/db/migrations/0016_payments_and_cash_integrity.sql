CREATE TYPE account_settlement_mode AS ENUM ('DIRECT', 'SPLIT');

ALTER TABLE accounts
  ADD COLUMN settlement_mode account_settlement_mode NOT NULL DEFAULT 'DIRECT';

ALTER TABLE account_splits
  ADD COLUMN finalized_at TIMESTAMPTZ;

ALTER TABLE payments
  ADD COLUMN status payment_status NOT NULL DEFAULT 'REGISTERED',
  ADD COLUMN voided_at TIMESTAMPTZ,
  ADD COLUMN voided_by_user_id UUID REFERENCES users(id),
  ADD COLUMN void_reason TEXT,
  ADD COLUMN payment_method_name_snapshot VARCHAR(100) NOT NULL DEFAULT '',
  ADD COLUMN payment_method_type_snapshot payment_method_type,
  ADD COLUMN cash_session_id UUID REFERENCES cash_sessions(id),
  ADD COLUMN cash_received NUMERIC(14,2),
  ADD COLUMN change_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN operation_id UUID NOT NULL DEFAULT gen_random_uuid(),
  ADD CONSTRAINT payments_cash_received_nonnegative CHECK (cash_received IS NULL OR cash_received >= 0),
  ADD CONSTRAINT payments_cash_change_nonnegative CHECK (change_amount >= 0),
  ADD CONSTRAINT payments_cash_tender_covers_applied CHECK (cash_received IS NULL OR cash_received >= amount);

ALTER TABLE payments
  ADD CONSTRAINT payments_operation_id_unique UNIQUE (operation_id);
CREATE INDEX idx_payments_account_status ON payments(account_id,status);
CREATE INDEX idx_payments_cash_session_status ON payments(cash_session_id,status);

ALTER TABLE cash_sessions
  ADD COLUMN notes TEXT,
  ADD COLUMN close_snapshot JSONB,
  ADD COLUMN version BIGINT NOT NULL DEFAULT 1,
  ADD CONSTRAINT cash_sessions_version_positive CHECK (version > 0);
CREATE UNIQUE INDEX ux_cash_sessions_one_open_per_register ON cash_sessions(cash_register_id) WHERE status='OPEN';
CREATE TRIGGER trg_cash_sessions_version BEFORE UPDATE ON cash_sessions FOR EACH ROW EXECUTE FUNCTION bump_row_version();

ALTER TABLE cash_movements
  ADD COLUMN adjustment_direction inventory_adjustment_direction,
  ADD COLUMN operation_id UUID,
  ADD CONSTRAINT cash_movements_adjustment_direction_only CHECK (adjustment_direction IS NULL OR movement_type='ADJUSTMENT');
CREATE UNIQUE INDEX ux_cash_movements_payment_once ON cash_movements(payment_id) WHERE payment_id IS NOT NULL;
CREATE UNIQUE INDEX ux_cash_movements_operation_once ON cash_movements(operation_id) WHERE operation_id IS NOT NULL;

CREATE OR REPLACE FUNCTION validate_payment_branch_reference()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM accounts a JOIN payment_methods pm ON pm.id=NEW.payment_method_id
    WHERE a.id=NEW.account_id AND a.branch_id=pm.branch_id
  ) THEN RAISE EXCEPTION 'payment method must belong to payment account branch'; END IF;
  IF NEW.account_split_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM account_splits s WHERE s.id=NEW.account_split_id AND s.account_id=NEW.account_id
  ) THEN RAISE EXCEPTION 'payment split must belong to payment account'; END IF;
  IF NEW.cash_session_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM cash_sessions cs JOIN cash_registers cr ON cr.id=cs.cash_register_id JOIN accounts a ON a.id=NEW.account_id
    WHERE cs.id=NEW.cash_session_id AND cr.branch_id=a.branch_id
  ) THEN RAISE EXCEPTION 'payment cash session must belong to payment account branch'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_payments_branch_reference BEFORE INSERT OR UPDATE ON payments FOR EACH ROW EXECUTE FUNCTION validate_payment_branch_reference();

CREATE OR REPLACE FUNCTION prevent_payment_financial_rewrite()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.account_id IS DISTINCT FROM OLD.account_id OR NEW.account_split_id IS DISTINCT FROM OLD.account_split_id
    OR NEW.payment_method_id IS DISTINCT FROM OLD.payment_method_id OR NEW.amount IS DISTINCT FROM OLD.amount
    OR NEW.payment_method_name_snapshot IS DISTINCT FROM OLD.payment_method_name_snapshot
    OR NEW.payment_method_type_snapshot IS DISTINCT FROM OLD.payment_method_type_snapshot
    OR NEW.cash_session_id IS DISTINCT FROM OLD.cash_session_id OR NEW.cash_received IS DISTINCT FROM OLD.cash_received
    OR NEW.change_amount IS DISTINCT FROM OLD.change_amount OR NEW.operation_id IS DISTINCT FROM OLD.operation_id
  THEN RAISE EXCEPTION 'payment financial snapshots are immutable'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_payments_financial_immutable BEFORE UPDATE ON payments FOR EACH ROW EXECUTE FUNCTION prevent_payment_financial_rewrite();

CREATE OR REPLACE FUNCTION prevent_cash_movement_change()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'cash movements are immutable'; END;
$$;
CREATE TRIGGER trg_cash_movements_immutable_update BEFORE UPDATE ON cash_movements FOR EACH ROW EXECUTE FUNCTION prevent_cash_movement_change();
CREATE TRIGGER trg_cash_movements_immutable_delete BEFORE DELETE ON cash_movements FOR EACH ROW EXECUTE FUNCTION prevent_cash_movement_change();

CREATE OR REPLACE FUNCTION reject_closed_cash_session_movement()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cash_sessions WHERE id=NEW.cash_session_id AND status='OPEN') THEN
    RAISE EXCEPTION 'cash movement requires an open cash session';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_cash_movements_open_session BEFORE INSERT ON cash_movements FOR EACH ROW EXECUTE FUNCTION reject_closed_cash_session_movement();

INSERT INTO permissions(key,name,module) VALUES
 ('sales.apply_discount','Apply sale discounts','billing'),('sales.modify_service','Modify service charge','billing'),('sales.split','Split accounts','billing'),
 ('payments.view','View payments','payments'),('payments.create','Create payments','payments'),('payments.receive_cash','Receive cash payments','payments'),('payments.receive_card','Receive card payments','payments'),('payments.receive_qr','Receive QR payments','payments'),
 ('cash.view','View cash','cash'),('cash.open','Open cash sessions','cash'),('cash.close','Close cash sessions','cash'),('cash.deposit','Deposit cash','cash'),('cash.withdraw','Withdraw cash','cash'),('cash.adjust','Adjust cash','cash'),('cash.view_movements','View cash movements','cash'),('cash.view_difference','View cash differences','cash')
ON CONFLICT(key) DO NOTHING;
INSERT INTO role_permissions(role_id,permission_id)
SELECT '00000000-0000-7000-8000-000000000003',id FROM permissions ON CONFLICT DO NOTHING;
