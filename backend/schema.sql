PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL CHECK (provider IN ('microsoft', 'offline')),
  external_id TEXT NOT NULL,
  canonical_name TEXT NOT NULL COLLATE NOCASE UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('approved', 'revoked')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(provider, external_id)
);

CREATE TABLE IF NOT EXISTS devices (
  id TEXT PRIMARY KEY,
  public_key TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('approved', 'revoked')),
  created_at TEXT NOT NULL,
  last_seen_at TEXT,
  revoked_at TEXT
);

CREATE TABLE IF NOT EXISTS account_devices (
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('approved', 'revoked')),
  created_at TEXT NOT NULL,
  revoked_at TEXT,
  PRIMARY KEY (account_id, device_id)
);
CREATE INDEX IF NOT EXISTS account_devices_device_status ON account_devices(device_id, status);

CREATE TABLE IF NOT EXISTS enrollments (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL CHECK (provider IN ('microsoft', 'offline')),
  external_id TEXT NOT NULL,
  requested_name TEXT NOT NULL COLLATE NOCASE,
  device_id TEXT NOT NULL,
  public_key TEXT NOT NULL,
  proof_status TEXT NOT NULL DEFAULT 'verified' CHECK (proof_status IN ('verified', 'manual')),
  status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'denied')),
  account_id TEXT REFERENCES accounts(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  reviewed_at TEXT
);
CREATE INDEX IF NOT EXISTS enrollments_status_created ON enrollments(status, created_at);
CREATE INDEX IF NOT EXISTS enrollments_device ON enrollments(device_id, created_at);

CREATE TABLE IF NOT EXISTS challenges (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  nonce TEXT NOT NULL,
  audience TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT
);
CREATE INDEX IF NOT EXISTS challenges_device_expiry ON challenges(device_id, expires_at);
