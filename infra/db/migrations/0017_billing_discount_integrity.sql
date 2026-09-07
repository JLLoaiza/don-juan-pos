CREATE OR REPLACE FUNCTION prevent_account_discount_change()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'account discount snapshots are immutable';
END;
$$;

CREATE TRIGGER trg_account_discounts_immutable_update
BEFORE UPDATE ON account_discounts
FOR EACH ROW EXECUTE FUNCTION prevent_account_discount_change();

CREATE TRIGGER trg_account_discounts_immutable_delete
BEFORE DELETE ON account_discounts
FOR EACH ROW EXECUTE FUNCTION prevent_account_discount_change();
