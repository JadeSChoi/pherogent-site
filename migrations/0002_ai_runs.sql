-- The shared AI spending ledger, ported unchanged from the legacy deployment's
-- schema (drizzle 0000_petite_shotgun). Every paid request reserves a row here
-- before any provider call; rows are never deleted, so allowance never refills.
CREATE TABLE ai_runs (
  run_id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  request_id TEXT NOT NULL,
  day TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  status TEXT NOT NULL,
  reserved_micros INTEGER NOT NULL,
  usage_json TEXT,
  completed_at INTEGER
);

CREATE UNIQUE INDEX ai_runs_user_request ON ai_runs (user_id, request_id);
CREATE INDEX ai_runs_day ON ai_runs (day);
CREATE INDEX ai_runs_user_created ON ai_runs (user_id, created_at);

UPDATE app_meta SET value = '0002' WHERE key = 'schema_version';
