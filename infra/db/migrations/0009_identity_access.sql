ALTER TABLE user_roles DROP CONSTRAINT user_roles_pkey;
ALTER TABLE user_roles ALTER COLUMN branch_id DROP NOT NULL;
ALTER TABLE user_roles ADD COLUMN id UUID DEFAULT gen_random_uuid();
UPDATE user_roles SET id = gen_random_uuid() WHERE id IS NULL;
ALTER TABLE user_roles ALTER COLUMN id SET NOT NULL;
ALTER TABLE user_roles ADD CONSTRAINT user_roles_pkey PRIMARY KEY (id);
CREATE UNIQUE INDEX user_roles_global_unique ON user_roles(user_id, role_id) WHERE branch_id IS NULL;
CREATE UNIQUE INDEX user_roles_branch_unique ON user_roles(user_id, role_id, branch_id) WHERE branch_id IS NOT NULL;

CREATE TABLE user_branch_access (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, branch_id)
);

CREATE OR REPLACE FUNCTION validate_user_access_company()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM users u JOIN branches b ON b.id = NEW.branch_id
    WHERE u.id = NEW.user_id AND u.company_id = b.company_id
  ) THEN RAISE EXCEPTION 'user and branch must belong to the same company'; END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_user_branch_access_company BEFORE INSERT OR UPDATE ON user_branch_access
FOR EACH ROW EXECUTE FUNCTION validate_user_access_company();

CREATE OR REPLACE FUNCTION validate_user_role_company()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM users u JOIN roles r ON r.id = NEW.role_id
    WHERE u.id = NEW.user_id AND u.company_id = r.company_id
  ) THEN RAISE EXCEPTION 'user and role must belong to the same company'; END IF;
  IF NEW.branch_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM users u JOIN branches b ON b.id = NEW.branch_id
    WHERE u.id = NEW.user_id AND u.company_id = b.company_id
  ) THEN RAISE EXCEPTION 'user role branch must belong to the same company'; END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_user_roles_company BEFORE INSERT OR UPDATE ON user_roles
FOR EACH ROW EXECUTE FUNCTION validate_user_role_company();

CREATE TABLE auth_sessions (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  active_branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
  refresh_token_hash CHAR(64) NOT NULL,
  refresh_expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  rotated_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (refresh_expires_at > created_at)
);
CREATE INDEX idx_auth_sessions_user_active ON auth_sessions(user_id) WHERE revoked_at IS NULL;
CREATE UNIQUE INDEX auth_sessions_refresh_token_hash_unique ON auth_sessions(refresh_token_hash);
