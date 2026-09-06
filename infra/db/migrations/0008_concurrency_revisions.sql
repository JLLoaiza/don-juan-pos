ALTER TABLE inventory_items
  ADD COLUMN version BIGINT NOT NULL DEFAULT 1,
  ADD CONSTRAINT inventory_items_version_positive CHECK (version > 0);

ALTER TABLE products
  ADD COLUMN version BIGINT NOT NULL DEFAULT 1,
  ADD CONSTRAINT products_version_positive CHECK (version > 0);

ALTER TABLE accompaniments
  ADD COLUMN version BIGINT NOT NULL DEFAULT 1,
  ADD CONSTRAINT accompaniments_version_positive CHECK (version > 0);

ALTER TABLE branch_settings
  ADD COLUMN version BIGINT NOT NULL DEFAULT 1,
  ADD CONSTRAINT branch_settings_version_positive CHECK (version > 0);

CREATE OR REPLACE FUNCTION bump_row_version()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.version = OLD.version THEN
    NEW.version = OLD.version + 1;
  ELSIF NEW.version <> OLD.version + 1 THEN
    RAISE EXCEPTION '% version must increment by one', TG_TABLE_NAME;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_inventory_items_version
BEFORE UPDATE ON inventory_items
FOR EACH ROW
EXECUTE FUNCTION bump_row_version();

CREATE TRIGGER trg_products_version
BEFORE UPDATE ON products
FOR EACH ROW
EXECUTE FUNCTION bump_row_version();

CREATE TRIGGER trg_accompaniments_version
BEFORE UPDATE ON accompaniments
FOR EACH ROW
EXECUTE FUNCTION bump_row_version();

CREATE TRIGGER trg_branch_settings_version
BEFORE UPDATE ON branch_settings
FOR EACH ROW
EXECUTE FUNCTION bump_row_version();

