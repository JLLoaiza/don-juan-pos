CREATE TABLE command_operations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id),
  branch_id UUID NOT NULL REFERENCES branches(id),
  operation_id UUID NOT NULL,
  command_name VARCHAR(150) NOT NULL,
  user_id UUID NOT NULL REFERENCES users(id),
  request_hash CHAR(64) NOT NULL,
  result JSONB NOT NULL DEFAULT '{}'::jsonb,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, operation_id)
);
CREATE INDEX idx_command_operations_branch_created ON command_operations(branch_id, created_at);

ALTER TABLE inventory_movements
  ADD CONSTRAINT inventory_movements_stock_arithmetic CHECK (stock_after = stock_before + quantity);

CREATE OR REPLACE FUNCTION validate_catalog_branch_reference()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME = 'accompaniment_components' THEN
    IF NOT EXISTS (SELECT 1 FROM accompaniments a JOIN inventory_items i ON i.id=NEW.inventory_item_id WHERE a.id=NEW.accompaniment_id AND a.branch_id=i.branch_id) THEN
      RAISE EXCEPTION 'accompaniment component must reference inventory from the same branch';
    END IF;
  ELSIF TG_TABLE_NAME = 'product_components' THEN
    IF NEW.component_type = 'INVENTORY_ITEM' AND NOT EXISTS (SELECT 1 FROM products p JOIN inventory_items i ON i.id=NEW.inventory_item_id WHERE p.id=NEW.product_id AND p.branch_id=i.branch_id) THEN
      RAISE EXCEPTION 'product component must reference inventory from the same branch';
    END IF;
    IF NEW.component_type = 'ACCOMPANIMENT' AND NOT EXISTS (SELECT 1 FROM products p JOIN accompaniments a ON a.id=NEW.accompaniment_id WHERE p.id=NEW.product_id AND p.branch_id=a.branch_id) THEN
      RAISE EXCEPTION 'product component must reference accompaniment from the same branch';
    END IF;
  ELSIF TG_TABLE_NAME = 'product_additional_accompaniments' THEN
    IF NOT EXISTS (SELECT 1 FROM products p JOIN accompaniments a ON a.id=NEW.accompaniment_id WHERE p.id=NEW.product_id AND p.branch_id=a.branch_id) THEN
      RAISE EXCEPTION 'product additional must reference accompaniment from the same branch';
    END IF;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_accompaniment_components_branch BEFORE INSERT OR UPDATE ON accompaniment_components FOR EACH ROW EXECUTE FUNCTION validate_catalog_branch_reference();
CREATE TRIGGER trg_product_components_branch BEFORE INSERT OR UPDATE ON product_components FOR EACH ROW EXECUTE FUNCTION validate_catalog_branch_reference();
CREATE TRIGGER trg_product_additionals_branch BEFORE INSERT OR UPDATE ON product_additional_accompaniments FOR EACH ROW EXECUTE FUNCTION validate_catalog_branch_reference();

CREATE OR REPLACE FUNCTION prevent_inventory_unit_change_after_movement()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.unit <> OLD.unit AND EXISTS (SELECT 1 FROM inventory_movements WHERE inventory_item_id=OLD.id) THEN
    RAISE EXCEPTION 'inventory item unit cannot change after movements exist';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_inventory_items_unit_immutable BEFORE UPDATE ON inventory_items FOR EACH ROW EXECUTE FUNCTION prevent_inventory_unit_change_after_movement();

INSERT INTO permissions(key,name,module) VALUES
 ('inventory.create','Create inventory','inventory'),('inventory.update','Update inventory','inventory'),('inventory.deactivate','Deactivate inventory','inventory'),
 ('accompaniments.view','View accompaniments','accompaniments'),('accompaniments.create','Create accompaniments','accompaniments'),('accompaniments.update','Update accompaniments','accompaniments'),('accompaniments.deactivate','Deactivate accompaniments','accompaniments'),
 ('products.view','View products','products'),('products.create','Create products','products'),('products.update','Update products','products'),('products.deactivate','Deactivate products','products'),('products.view_cost','View product cost','products'),
 ('pricing.update','Update product pricing','products'),('inventory.view_cost','View inventory cost','inventory'),('inventory.view_movements','View inventory movements','inventory')
ON CONFLICT(key) DO NOTHING;
INSERT INTO role_permissions(role_id,permission_id)
SELECT '00000000-0000-7000-8000-000000000003', p.id FROM permissions p
ON CONFLICT DO NOTHING;
