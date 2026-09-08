-- Phase 6 core: Edge device traceability and a branch-scoped, cursor-based change feed.
-- No Cloud topology is assumed here; outbox delivery remains durable and separate.

ALTER TABLE sync_devices
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS version BIGINT NOT NULL DEFAULT 1;

ALTER TABLE sync_operations
  ADD COLUMN IF NOT EXISTS actor_user_id UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS depends_on_operation_ids UUID[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS schema_version INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS last_attempt_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS conflict_type VARCHAR(150),
  ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS resolved_by_user_id UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS resolution_type VARCHAR(80);

ALTER TABLE sync_operations
  ADD CONSTRAINT sync_operations_schema_version_positive CHECK (schema_version > 0);

CREATE INDEX IF NOT EXISTS idx_sync_operations_branch_status_created
  ON sync_operations(branch_id, status, created_at);

INSERT INTO permissions (id, key, name, module)
VALUES
  ('00000000-0000-7000-8000-000000000190', 'sync.devices.view', 'View sync devices', 'sync'),
  ('00000000-0000-7000-8000-000000000191', 'sync.devices.manage', 'Manage sync devices', 'sync'),
  ('00000000-0000-7000-8000-000000000192', 'sync.changes.pull', 'Pull branch changes', 'sync'),
  ('00000000-0000-7000-8000-000000000193', 'sync.status.view', 'View sync status', 'sync')
ON CONFLICT (key) DO NOTHING;

-- Development administrators retain access after the permission catalog grows.
INSERT INTO role_permissions(role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.key IN ('sync.devices.view', 'sync.devices.manage', 'sync.changes.pull', 'sync.status.view')
WHERE r.name = 'Administrator'
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION publish_sync_change_from_outbox()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  payload_version BIGINT;
BEGIN
  IF NEW.payload ? 'version' AND (NEW.payload ->> 'version') ~ '^[0-9]+$' THEN
    payload_version := (NEW.payload ->> 'version')::BIGINT;
  END IF;

  INSERT INTO sync_changes(branch_id, operation_id, entity_type, entity_id, entity_version, payload)
  VALUES (
    NEW.branch_id,
    NEW.operation_id,
    NEW.aggregate_type,
    NEW.aggregate_id,
    payload_version,
    jsonb_build_object(
      'operationName', NEW.command_name,
      'aggregateType', NEW.aggregate_type,
      'aggregateId', NEW.aggregate_id,
      'payload', NEW.payload
    )
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_outbox_publish_change ON sync_outbox;
CREATE TRIGGER trg_sync_outbox_publish_change
AFTER INSERT ON sync_outbox
FOR EACH ROW EXECUTE FUNCTION publish_sync_change_from_outbox();
