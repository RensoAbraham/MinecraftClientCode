CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  submitted_at TEXT NOT NULL,
  app_version TEXT NOT NULL,
  pack_id TEXT NOT NULL,
  launcher_id TEXT NOT NULL,
  account_mode TEXT NOT NULL,
  nickname TEXT,
  operating_system TEXT NOT NULL,
  cpu TEXT NOT NULL,
  cpu_cores INTEGER NOT NULL,
  total_memory_mb INTEGER NOT NULL,
  available_memory_mb INTEGER NOT NULL,
  disk_free_gb INTEGER NOT NULL,
  outcome TEXT NOT NULL,
  source_hash TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS reports_submitted_at ON reports (submitted_at);
