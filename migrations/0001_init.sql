-- Walking-skeleton schema: a single metadata table the status route reads to
-- prove the Worker is talking to a migrated D1 database.
CREATE TABLE app_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT INTO app_meta (key, value) VALUES ('schema_version', '0001');
