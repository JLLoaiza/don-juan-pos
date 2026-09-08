-- Phase 6 local-first Edge identity and Cloud replica receipt/projection.
-- Both deployments share schema; endpoint behavior is selected by SERVER_ROLE.

CREATE TABLE edge_servers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID NOT NULL REFERENCES branches(id),
  display_name VARCHAR(150) NOT NULL,
  credential_hash TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  enrolled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ,
  last_received_at TIMESTAMPTZ,
  UNIQUE (branch_id, display_name)
);
CREATE UNIQUE INDEX idx_edge_servers_one_active_per_branch ON edge_servers(branch_id) WHERE active;

CREATE TABLE edge_enrollment_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID NOT NULL REFERENCES branches(id),
  display_name VARCHAR(150) NOT NULL,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_by_user_id UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_edge_enrollment_tokens_active ON edge_enrollment_tokens(expires_at) WHERE consumed_at IS NULL;

CREATE TABLE edge_local_identity (
  singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton),
  edge_server_id UUID NOT NULL,
  branch_id UUID NOT NULL REFERENCES branches(id),
  enrolled_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE cloud_replica_events (
  receipt_cursor BIGSERIAL PRIMARY KEY,
  edge_server_id UUID NOT NULL REFERENCES edge_servers(id),
  branch_id UUID NOT NULL REFERENCES branches(id),
  operation_id UUID NOT NULL,
  command_name VARCHAR(150) NOT NULL,
  aggregate_type VARCHAR(100) NOT NULL,
  aggregate_id UUID NOT NULL,
  payload JSONB NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (edge_server_id, operation_id)
);
CREATE INDEX idx_cloud_replica_events_branch_cursor ON cloud_replica_events(branch_id, receipt_cursor);

CREATE TABLE cloud_replica_entities (
  branch_id UUID NOT NULL REFERENCES branches(id),
  entity_type VARCHAR(100) NOT NULL,
  entity_id UUID NOT NULL,
  entity_version BIGINT,
  payload JSONB NOT NULL,
  replicated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source_operation_id UUID NOT NULL,
  PRIMARY KEY(branch_id, entity_type, entity_id)
);

INSERT INTO permissions (id, key, name, module)
VALUES
  ('00000000-0000-7000-8000-000000000197', 'replication.servers.manage', 'Enroll branch Edge server', 'replication'),
  ('00000000-0000-7000-8000-000000000198', 'replication.status.view', 'View branch replication status', 'replication')
ON CONFLICT (key) DO NOTHING;
INSERT INTO role_permissions(role_id, permission_id)
SELECT r.id,p.id FROM roles r JOIN permissions p ON p.key IN ('replication.servers.manage','replication.status.view')
WHERE r.name='Administrator'
ON CONFLICT DO NOTHING;