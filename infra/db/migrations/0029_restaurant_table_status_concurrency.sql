-- Optimistic concurrency for manual and automatic restaurant table status changes.
ALTER TABLE restaurant_tables
  ADD COLUMN version BIGINT NOT NULL DEFAULT 1,
  ADD CONSTRAINT restaurant_tables_version_positive CHECK (version > 0);
