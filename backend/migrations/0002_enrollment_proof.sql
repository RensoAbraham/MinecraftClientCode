ALTER TABLE enrollments ADD COLUMN proof_status TEXT NOT NULL DEFAULT 'verified'
  CHECK (proof_status IN ('verified', 'manual'));
