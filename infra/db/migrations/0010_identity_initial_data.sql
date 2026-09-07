INSERT INTO permissions (id, key, name, module)
VALUES
  ('00000000-0000-7000-8000-000000000101', 'users.manage', 'Manage users', 'users'),
  ('00000000-0000-7000-8000-000000000102', 'roles.manage', 'Manage roles', 'roles'),
  ('00000000-0000-7000-8000-000000000103', 'branches.manage', 'Manage branches', 'branches'),
  ('00000000-0000-7000-8000-000000000104', 'settings.manage', 'Manage settings', 'settings'),
  ('00000000-0000-7000-8000-000000000105', 'tables.view', 'View tables', 'tables'),
  ('00000000-0000-7000-8000-000000000106', 'sales.create', 'Create sales', 'sales'),
  ('00000000-0000-7000-8000-000000000107', 'inventory.view', 'View inventory', 'inventory'),
  ('00000000-0000-7000-8000-000000000108', 'inventory.adjust', 'Adjust inventory', 'inventory'),
  ('00000000-0000-7000-8000-000000000109', 'reports.view', 'View reports', 'reports')
ON CONFLICT (key) DO NOTHING;
