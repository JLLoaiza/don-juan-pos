-- Phase 7: Cloud report access. Reports query confirmed replica projections only.
INSERT INTO permissions (id,key,name,module) VALUES
('00000000-0000-7000-8000-000000000201','reports.dashboard','View reports dashboard','reports'),
('00000000-0000-7000-8000-000000000202','reports.sales','View sales reports','reports'),
('00000000-0000-7000-8000-000000000203','reports.products','View product performance reports','reports'),
('00000000-0000-7000-8000-000000000204','reports.export','Export reports','reports'),
('00000000-0000-7000-8000-000000000205','reports.view_costs','View historical report costs','reports')
ON CONFLICT (key) DO NOTHING;
INSERT INTO role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM roles r JOIN permissions p ON p.key IN ('reports.view','reports.dashboard','reports.sales','reports.products','reports.export','reports.view_costs')
WHERE r.name='Administrator' ON CONFLICT DO NOTHING;
CREATE INDEX IF NOT EXISTS idx_cloud_replica_events_branch_command_received ON cloud_replica_events(branch_id,command_name,received_at DESC);
CREATE INDEX IF NOT EXISTS idx_cloud_replica_entities_branch_type_replicated ON cloud_replica_entities(branch_id,entity_type,replicated_at DESC);
