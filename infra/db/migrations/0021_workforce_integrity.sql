-- Phase 5 workforce historical integrity.
ALTER TABLE employees ADD COLUMN version BIGINT NOT NULL DEFAULT 1,
  ADD CONSTRAINT employees_version_positive CHECK (version > 0);
CREATE TRIGGER trg_employees_version BEFORE UPDATE ON employees FOR EACH ROW EXECUTE FUNCTION bump_row_version();

ALTER TABLE employee_wage_rates
  ADD COLUMN effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
  ADD COLUMN effective_to DATE;
ALTER TABLE employee_wage_rates ADD CONSTRAINT employee_wage_rates_effective_dates CHECK (effective_to IS NULL OR effective_to >= effective_from);

ALTER TABLE employee_shifts
  ADD COLUMN wage_calculation_snapshot JSONB,
  ADD COLUMN cancelled_at TIMESTAMPTZ,
  ADD COLUMN cancelled_by_user_id UUID REFERENCES users(id),
  ADD COLUMN cancel_reason TEXT,
  ADD COLUMN created_by_user_id UUID REFERENCES users(id);
CREATE UNIQUE INDEX ux_employee_shifts_one_open_per_employee ON employee_shifts(employee_id) WHERE status='OPEN';

ALTER TABLE employee_payments
  ADD COLUMN status employee_payment_status NOT NULL DEFAULT 'CONFIRMED',
  ADD COLUMN voided_at TIMESTAMPTZ,
  ADD COLUMN voided_by_user_id UUID REFERENCES users(id),
  ADD COLUMN void_reason TEXT,
  ADD COLUMN payment_snapshot JSONB,
  ADD COLUMN operation_id UUID NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN cash_session_id UUID REFERENCES cash_sessions(id),
  ADD CONSTRAINT employee_payments_operation_unique UNIQUE(operation_id);
CREATE UNIQUE INDEX uq_confirmed_employee_payment_per_shift ON employee_payments(shift_id) WHERE status='CONFIRMED';

CREATE TABLE employee_payment_bonuses (
  employee_payment_id UUID NOT NULL REFERENCES employee_payments(id),
  employee_bonus_id UUID NOT NULL REFERENCES employee_bonuses(id),
  amount_snapshot NUMERIC(14,2) NOT NULL CHECK(amount_snapshot > 0),
  PRIMARY KEY(employee_payment_id,employee_bonus_id)
);

ALTER TABLE cash_movements ADD COLUMN employee_payment_id UUID REFERENCES employee_payments(id);
CREATE UNIQUE INDEX ux_cash_movements_employee_payment_once ON cash_movements(employee_payment_id) WHERE employee_payment_id IS NOT NULL;

CREATE OR REPLACE FUNCTION validate_employee_shift_branch_reference()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM employees e WHERE e.id=NEW.employee_id AND e.branch_id=NEW.branch_id) THEN
    RAISE EXCEPTION 'shift employee must belong to branch';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_employee_shifts_branch_reference BEFORE INSERT OR UPDATE ON employee_shifts
FOR EACH ROW EXECUTE FUNCTION validate_employee_shift_branch_reference();

CREATE OR REPLACE FUNCTION validate_employee_payment_branch_reference()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM employee_shifts s WHERE s.id=NEW.shift_id AND s.employee_id=NEW.employee_id) THEN
    RAISE EXCEPTION 'employee payment must match shift employee';
  END IF;
  IF NEW.cash_session_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM employee_shifts s JOIN cash_sessions cs ON cs.id=NEW.cash_session_id
    JOIN cash_registers cr ON cr.id=cs.cash_register_id
    WHERE s.id=NEW.shift_id AND cr.branch_id=s.branch_id
  ) THEN RAISE EXCEPTION 'employee payment cash session must belong to shift branch'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_employee_payments_branch_reference BEFORE INSERT OR UPDATE ON employee_payments
FOR EACH ROW EXECUTE FUNCTION validate_employee_payment_branch_reference();
INSERT INTO permissions(key,name,module) VALUES
 ('employees.view','View employees','workforce'),('employees.create','Create employees','workforce'),('employees.update','Update employees','workforce'),
 ('employees.activate','Activate employees','workforce'),('employees.deactivate','Deactivate employees','workforce'),
 ('employees.view_rates','View wage rates','workforce'),('employees.manage_rates','Manage wage rates','workforce'),
 ('employees.view_shifts','View shifts','workforce'),('employees.create_shift','Create shifts','workforce'),('employees.complete_shift','Complete shifts','workforce'),
 ('employees.view_bonuses','View bonuses','workforce'),('employees.create_bonus','Create bonuses','workforce'),
 ('employees.view_payments','View employee payments','workforce'),('employees.pay','Pay employees','workforce')
ON CONFLICT(key) DO NOTHING;
INSERT INTO role_permissions(role_id,permission_id)
SELECT '00000000-0000-7000-8000-000000000003',id FROM permissions WHERE key LIKE 'employees.%'
ON CONFLICT DO NOTHING;
