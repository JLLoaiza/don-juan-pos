CREATE OR REPLACE FUNCTION validate_floor_branch_reference()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME = 'accounts'
    AND (to_jsonb(NEW)->>'table_id') IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM restaurant_tables t JOIN dining_areas d ON d.id=t.dining_area_id
      WHERE t.id=((to_jsonb(NEW)->>'table_id')::uuid)
        AND d.branch_id=((to_jsonb(NEW)->>'branch_id')::uuid)
    ) THEN
    RAISE EXCEPTION 'account table must belong to account branch';
  END IF;
  IF TG_TABLE_NAME = 'kitchen_orders' AND NOT EXISTS (
    SELECT 1 FROM accounts a
    WHERE a.id=((to_jsonb(NEW)->>'account_id')::uuid)
      AND a.branch_id=((to_jsonb(NEW)->>'branch_id')::uuid)
  ) THEN
    RAISE EXCEPTION 'kitchen order account must belong to branch';
  END IF;
  RETURN NEW;
END;
$$;
