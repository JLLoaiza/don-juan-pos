-- Phase 6 PUSH processing and explicit conflict lifecycle.
-- Existing protocol core remains in 0024 to preserve already-applied local history.

ALTER TABLE sync_operations
  ADD COLUMN IF NOT EXISTS request_hash CHAR(64);

CREATE INDEX IF NOT EXISTS idx_sync_operations_branch_entity_pending
  ON sync_operations(branch_id, entity_type, entity_id, created_at)
  WHERE status IN ('PENDING', 'PROCESSING');

CREATE INDEX IF NOT EXISTS idx_sync_operations_branch_conflicts
  ON sync_operations(branch_id, created_at DESC)
  WHERE status = 'CONFLICT' AND resolved_at IS NULL;

INSERT INTO permissions (id, key, name, module)
VALUES
  ('00000000-0000-7000-8000-000000000194', 'sync.operations.push', 'Push device operations', 'sync'),
  ('00000000-0000-7000-8000-000000000195', 'sync.conflicts.view', 'View sync conflicts', 'sync'),
  ('00000000-0000-7000-8000-000000000196', 'sync.conflicts.resolve', 'Resolve sync conflicts', 'sync')
ON CONFLICT (key) DO NOTHING;

INSERT INTO role_permissions(role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.key IN ('sync.operations.push', 'sync.conflicts.view', 'sync.conflicts.resolve')
WHERE r.name = 'Administrator'
ON CONFLICT DO NOTHING;