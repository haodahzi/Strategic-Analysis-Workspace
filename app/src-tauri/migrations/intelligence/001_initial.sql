PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;

CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS business_units (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS companies (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    website TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS company_business_units (
    company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    business_unit_id TEXT NOT NULL REFERENCES business_units(id) ON DELETE CASCADE,
    PRIMARY KEY (company_id, business_unit_id)
);

CREATE TABLE IF NOT EXISTS company_aliases (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    alias TEXT NOT NULL,
    UNIQUE (company_id, alias)
);

CREATE TABLE IF NOT EXISTS sources (
    id TEXT PRIMARY KEY,
    company_id TEXT REFERENCES companies(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    base_url TEXT NOT NULL,
    expected_host TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS collection_runs (
    id TEXT PRIMARY KEY,
    source_id TEXT REFERENCES sources(id) ON DELETE SET NULL,
    status TEXT NOT NULL,
    started_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    finished_at TEXT,
    error_code TEXT
);

CREATE TABLE IF NOT EXISTS raw_documents (
    id TEXT PRIMARY KEY,
    source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE RESTRICT,
    collection_run_id TEXT REFERENCES collection_runs(id) ON DELETE SET NULL,
    final_url TEXT NOT NULL,
    content_type TEXT NOT NULL,
    content_hash TEXT NOT NULL UNIQUE,
    snapshot_path TEXT NOT NULL,
    fetched_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,
    company_id TEXT REFERENCES companies(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    summary TEXT,
    occurred_at TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS event_sources (
    event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    raw_document_id TEXT NOT NULL REFERENCES raw_documents(id) ON DELETE CASCADE,
    PRIMARY KEY (event_id, raw_document_id)
);

CREATE TABLE IF NOT EXISTS evidence_spans (
    id TEXT PRIMARY KEY,
    event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    raw_document_id TEXT NOT NULL REFERENCES raw_documents(id) ON DELETE CASCADE,
    start_offset INTEGER NOT NULL,
    end_offset INTEGER NOT NULL,
    quote TEXT NOT NULL,
    CHECK (start_offset >= 0 AND end_offset >= start_offset)
);

CREATE TABLE IF NOT EXISTS event_analysis_versions (
    id TEXT PRIMARY KEY,
    event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    version INTEGER NOT NULL,
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    analysis_json TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    UNIQUE (event_id, version)
);

CREATE TABLE IF NOT EXISTS app_checkpoints (
    checkpoint_key TEXT PRIMARY KEY,
    checkpoint_value TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS read_states (
    event_id TEXT PRIMARY KEY REFERENCES events(id) ON DELETE CASCADE,
    read_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS bookmarks (
    event_id TEXT PRIMARY KEY REFERENCES events(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS feedback (
    id TEXT PRIMARY KEY,
    event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    feedback_type TEXT NOT NULL,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE VIRTUAL TABLE IF NOT EXISTS intelligence_fts USING fts5(
    event_id UNINDEXED,
    title,
    summary,
    content
);

INSERT OR IGNORE INTO schema_migrations (version) VALUES (1);
