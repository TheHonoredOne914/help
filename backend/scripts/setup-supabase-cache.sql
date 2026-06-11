-- Supabase Cache Tables Setup
-- Run this in your Supabase SQL Editor: https://app.supabase.com/project/_/sql

-- Cache entries table for persistent caching
CREATE TABLE IF NOT EXISTS cache_entries (
  id BIGSERIAL PRIMARY KEY,
  namespace TEXT NOT NULL DEFAULT 'default',
  key TEXT NOT NULL,
  value_jsonb JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  source_hash TEXT,
  agenda_fingerprint TEXT,
  mode TEXT,
  run_tags JSONB,
  UNIQUE(namespace, key)
);

-- Index for efficient lookups by namespace and key
CREATE INDEX IF NOT EXISTS idx_cache_entries_lookup
  ON cache_entries(namespace, key, expires_at);

-- Index for cleanup operations (finding expired entries)
CREATE INDEX IF NOT EXISTS idx_cache_entries_expires
  ON cache_entries(expires_at);

-- Index for filtering by namespace
CREATE INDEX IF NOT EXISTS idx_cache_entries_namespace
  ON cache_entries(namespace);

-- Enable Row Level Security (optional but recommended for production)
ALTER TABLE cache_entries ENABLE ROW LEVEL SECURITY;

-- Policy to allow all operations (adjust for production as needed)
-- For production, you may want to restrict this to authenticated users only
CREATE POLICY "Allow all operations on cache_entries"
  ON cache_entries FOR ALL
  USING (true)
  WITH CHECK (true);

-- Grant permissions (if needed)
-- GRANT ALL ON cache_entries TO authenticated;
-- GRANT ALL ON cache_entries TO service_role;

COMMENT ON TABLE cache_entries IS 'Persistent cache storage for retrieval results, search results, and other cached data';
COMMENT ON COLUMN cache_entries.namespace IS 'Cache namespace for organizing different types of cached data';
COMMENT ON COLUMN cache_entries.key IS 'Unique cache key within the namespace';
COMMENT ON COLUMN cache_entries.value_jsonb IS 'Cached data stored as JSONB';
COMMENT ON COLUMN cache_entries.expires_at IS 'Timestamp when the cache entry expires';
COMMENT ON COLUMN cache_entries.source_hash IS 'Optional hash of the source data for validation';
COMMENT ON COLUMN cache_entries.agenda_fingerprint IS 'Optional fingerprint of the agenda for context-aware caching';
COMMENT ON COLUMN cache_entries.mode IS 'Optional mode identifier for different caching strategies';
COMMENT ON COLUMN cache_entries.run_tags IS 'Optional tags for categorizing cache entries by run/research session';
