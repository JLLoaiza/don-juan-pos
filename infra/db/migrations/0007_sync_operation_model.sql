ALTER TABLE sync_operations
  ADD COLUMN branch_id UUID REFERENCES branches(id),
  ADD COLUMN command_name VARCHAR(150),
  ADD COLUMN expected_version BIGINT,
  ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN conflict_metadata JSONB,
  ADD COLUMN result JSONB,
  ADD CONSTRAINT sync_operations_attempts_nonnegative CHECK (attempts >= 0);

UPDATE sync_operations operation
SET branch_id = device.branch_id
FROM sync_devices device
WHERE operation.device_id = device.id AND operation.branch_id IS NULL;

ALTER TABLE sync_operations
  ALTER COLUMN branch_id SET NOT NULL;

CREATE INDEX idx_sync_operations_branch_created
  ON sync_operations(branch_id, created_at);

CREATE TABLE sync_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID NOT NULL REFERENCES branches(id),
  operation_id UUID NOT NULL,
  command_name VARCHAR(150) NOT NULL,
  aggregate_type VARCHAR(100) NOT NULL,
  aggregate_id UUID NOT NULL,
  payload JSONB NOT NULL,
  status sync_outbox_status NOT NULL DEFAULT 'PENDING',
  attempts INTEGER NOT NULL DEFAULT 0,
  locked_at TIMESTAMPTZ,
  locked_by VARCHAR(150),
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  error_message TEXT,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (operation_id),
  CHECK (attempts >= 0)
);

CREATE INDEX idx_sync_outbox_claimable
  ON sync_outbox(next_attempt_at, created_at)
  WHERE status IN ('PENDING', 'FAILED') AND locked_at IS NULL;

CREATE TABLE sync_changes (
  cursor BIGSERIAL PRIMARY KEY,
  branch_id UUID NOT NULL REFERENCES branches(id),
  operation_id UUID,
  entity_type VARCHAR(100) NOT NULL,
  entity_id UUID NOT NULL,
  entity_version BIGINT,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sync_changes_branch_cursor
  ON sync_changes(branch_id, cursor);

