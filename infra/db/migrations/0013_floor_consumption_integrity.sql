CREATE OR REPLACE FUNCTION validate_floor_branch_reference()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME = 'accounts' AND NEW.table_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM restaurant_tables t JOIN dining_areas d ON d.id=t.dining_area_id WHERE t.id=NEW.table_id AND d.branch_id=NEW.branch_id
  ) THEN RAISE EXCEPTION 'account table must belong to account branch'; END IF;
  IF TG_TABLE_NAME = 'kitchen_orders' AND NOT EXISTS (SELECT 1 FROM accounts a WHERE a.id=NEW.account_id AND a.branch_id=NEW.branch_id) THEN
    RAISE EXCEPTION 'kitchen order account must belong to branch';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_accounts_table_branch BEFORE INSERT OR UPDATE ON accounts FOR EACH ROW EXECUTE FUNCTION validate_floor_branch_reference();
CREATE TRIGGER trg_kitchen_orders_account_branch BEFORE INSERT OR UPDATE ON kitchen_orders FOR EACH ROW EXECUTE FUNCTION validate_floor_branch_reference();

CREATE OR REPLACE FUNCTION prevent_account_item_snapshot_change()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.product_id IS DISTINCT FROM OLD.product_id OR NEW.product_name_snapshot IS DISTINCT FROM OLD.product_name_snapshot OR NEW.unit_price IS DISTINCT FROM OLD.unit_price OR NEW.unit_cost IS DISTINCT FROM OLD.unit_cost OR NEW.quantity IS DISTINCT FROM OLD.quantity OR NEW.tax_rate_snapshot IS DISTINCT FROM OLD.tax_rate_snapshot OR NEW.tax_total IS DISTINCT FROM OLD.tax_total OR NEW.line_subtotal IS DISTINCT FROM OLD.line_subtotal OR NEW.line_total IS DISTINCT FROM OLD.line_total OR NEW.notes IS DISTINCT FROM OLD.notes OR NEW.consumption_snapshot IS DISTINCT FROM OLD.consumption_snapshot THEN
    RAISE EXCEPTION 'confirmed account item snapshots are immutable';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_account_items_snapshot_immutable BEFORE UPDATE ON account_items FOR EACH ROW EXECUTE FUNCTION prevent_account_item_snapshot_change();

INSERT INTO permissions(key,name,module) VALUES
 ('dining_areas.view','View dining areas','floor'),('dining_areas.create','Create dining areas','floor'),('dining_areas.update','Update dining areas','floor'),
 ('tables.view','View tables','floor'),('tables.create','Create tables','floor'),('tables.update','Update tables','floor'),('tables.change_status','Change table status','floor'),
 ('accounts.open','Open accounts','accounts'),('accounts.view','View accounts','accounts'),('accounts.update','Update accounts','accounts'),('sales.add_items','Confirm consumption','sales'),('kitchen.send','Send kitchen orders','kitchen')
ON CONFLICT(key) DO NOTHING;
INSERT INTO role_permissions(role_id,permission_id)
SELECT '00000000-0000-7000-8000-000000000003',id FROM permissions ON CONFLICT DO NOTHING;
