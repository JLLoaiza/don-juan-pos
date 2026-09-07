-- Development-only minimum identity data. Production deployments may deactivate or replace it after bootstrap.
INSERT INTO companies (id,name,legal_name,currency,timezone)
VALUES ('00000000-0000-7000-8000-000000000001','Don Juan Development','Don Juan Development','COP','America/Bogota')
ON CONFLICT (id) DO NOTHING;
INSERT INTO branches (id,company_id,name,code)
VALUES ('00000000-0000-7000-8000-000000000002','00000000-0000-7000-8000-000000000001','Don Juan Centro','CENTRO')
ON CONFLICT (id) DO NOTHING;
INSERT INTO branch_settings(branch_id,settings)
VALUES ('00000000-0000-7000-8000-000000000002','{"receipt_footer":"Gracias por su visita"}'::jsonb)
ON CONFLICT (branch_id) DO NOTHING;
INSERT INTO roles(id,company_id,name,description)
VALUES ('00000000-0000-7000-8000-000000000003','00000000-0000-7000-8000-000000000001','Administrator','Development administrator')
ON CONFLICT (id) DO NOTHING;
INSERT INTO users(id,company_id,username,password_hash,display_name)
VALUES ('00000000-0000-7000-8000-000000000004','00000000-0000-7000-8000-000000000001','admin',crypt('ChangeMe!123',gen_salt('bf',12)),'Development Administrator')
ON CONFLICT (id) DO NOTHING;
INSERT INTO user_branch_access(user_id,branch_id)
VALUES ('00000000-0000-7000-8000-000000000004','00000000-0000-7000-8000-000000000002')
ON CONFLICT DO NOTHING;
INSERT INTO user_roles(user_id,role_id,branch_id)
VALUES ('00000000-0000-7000-8000-000000000004','00000000-0000-7000-8000-000000000003',NULL)
ON CONFLICT DO NOTHING;
INSERT INTO role_permissions(role_id,permission_id)
SELECT '00000000-0000-7000-8000-000000000003',id FROM permissions
ON CONFLICT DO NOTHING;
