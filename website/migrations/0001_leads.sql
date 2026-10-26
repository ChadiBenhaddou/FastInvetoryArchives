-- Lead form requests (server/lead.ts creates the same table if missing).
CREATE TABLE IF NOT EXISTS leads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL,
    type TEXT NOT NULL,
    nom TEXT NOT NULL,
    email TEXT NOT NULL,
    organisation TEXT NOT NULL,
    telephone TEXT,
    type_organisation TEXT,
    ville TEXT,
    volume TEXT,
    langues TEXT,
    besoin TEXT,
    delai TEXT,
    budget TEXT,
    message TEXT,
    consent_at TEXT NOT NULL,
    ip_hash TEXT NOT NULL,
    emailed INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS leads_ip_created ON leads (ip_hash, created_at);
CREATE INDEX IF NOT EXISTS leads_created ON leads (created_at);
