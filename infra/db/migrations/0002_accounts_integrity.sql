ALTER TABLE accounts
  ADD COLUMN version BIGINT NOT NULL DEFAULT 1,
  ADD COLUMN voided_at TIMESTAMPTZ,
  ADD COLUMN voided_by_user_id UUID REFERENCES users(id),
  ADD COLUMN void_reason TEXT,
  ADD CONSTRAINT accounts_version_positive CHECK (version > 0);

ALTER TABLE account_items
  ADD COLUMN status account_item_status NOT NULL DEFAULT 'CONFIRMED',
  ADD COLUMN voided_at TIMESTAMPTZ,
  ADD COLUMN voided_by_user_id UUID REFERENCES users(id),
  ADD COLUMN void_reason TEXT,
  ADD CONSTRAINT account_items_commercial_quantity_is_whole CHECK (quantity = trunc(quantity));

CREATE UNIQUE INDEX ux_accounts_one_open_account_per_table
  ON accounts(table_id)
  WHERE status = 'OPEN' AND table_id IS NOT NULL;

CREATE OR REPLACE FUNCTION bump_accounts_version()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.version = OLD.version THEN
    NEW.version = OLD.version + 1;
  ELSIF NEW.version <> OLD.version + 1 THEN
    RAISE EXCEPTION 'accounts.version must increment by one';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_accounts_version
BEFORE UPDATE ON accounts
FOR EACH ROW
EXECUTE FUNCTION bump_accounts_version();

