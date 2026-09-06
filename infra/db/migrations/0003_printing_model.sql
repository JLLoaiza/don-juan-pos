CREATE TABLE printers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID NOT NULL REFERENCES branches(id),
  name VARCHAR(150) NOT NULL,
  printer_type printer_type NOT NULL,
  connection_type printer_connection_type NOT NULL,
  connection_config JSONB NOT NULL DEFAULT '{}'::JSONB,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (branch_id, name)
);

CREATE TRIGGER trg_printers_updated_at
BEFORE UPDATE ON printers
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

ALTER TABLE kitchen_orders
  ADD COLUMN order_type kitchen_order_type NOT NULL DEFAULT 'ORDER',
  ADD COLUMN cancellation_of_order_id UUID REFERENCES kitchen_orders(id),
  ADD COLUMN cancelled_account_item_id UUID REFERENCES account_items(id),
  ADD CONSTRAINT kitchen_orders_cancellation_reference CHECK (
    (order_type = 'ORDER' AND cancellation_of_order_id IS NULL)
    OR (order_type = 'CANCELLATION' AND cancellation_of_order_id IS NOT NULL)
  );

CREATE UNIQUE INDEX ux_kitchen_orders_branch_ticket
  ON kitchen_orders(branch_id, ticket_number);

ALTER TABLE print_jobs
  ADD COLUMN printer_id UUID REFERENCES printers(id),
  ADD COLUMN locked_at TIMESTAMPTZ,
  ADD COLUMN locked_by VARCHAR(150),
  ADD COLUMN next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN is_reprint BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN original_print_job_id UUID REFERENCES print_jobs(id),
  ADD COLUMN reprint_reason TEXT,
  ADD COLUMN reprint_requested_by_user_id UUID REFERENCES users(id),
  ADD CONSTRAINT print_jobs_reprint_reference CHECK (
    (is_reprint = FALSE AND original_print_job_id IS NULL)
    OR (is_reprint = TRUE AND original_print_job_id IS NOT NULL)
  );

CREATE INDEX idx_print_jobs_claimable
  ON print_jobs(next_attempt_at, created_at)
  WHERE status IN ('PENDING', 'FAILED') AND locked_at IS NULL;

CREATE OR REPLACE FUNCTION prevent_print_snapshot_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.payload IS DISTINCT FROM OLD.payload THEN
    RAISE EXCEPTION 'print_jobs.payload is immutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_print_jobs_payload_immutable
BEFORE UPDATE ON print_jobs
FOR EACH ROW
EXECUTE FUNCTION prevent_print_snapshot_change();

CREATE OR REPLACE FUNCTION prevent_kitchen_content_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.content IS DISTINCT FROM OLD.content THEN
    RAISE EXCEPTION 'kitchen_orders.content is immutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_kitchen_orders_content_immutable
BEFORE UPDATE ON kitchen_orders
FOR EACH ROW
EXECUTE FUNCTION prevent_kitchen_content_change();

