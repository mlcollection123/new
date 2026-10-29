const NOW = "(strftime('%Y-%m-%dT%H:%M:%fZ','now'))";

export const SCHEMA = `
CREATE TABLE IF NOT EXISTS campaigns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  offer TEXT NOT NULL,
  icp TEXT NOT NULL,
  min_score INTEGER NOT NULL DEFAULT 60,
  created_at TEXT NOT NULL DEFAULT ${NOW}
);

CREATE TABLE IF NOT EXISTS leads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  first_name TEXT,
  last_name TEXT,
  title TEXT,
  segment TEXT,
  company TEXT,
  domain TEXT,
  linkedin_url TEXT,
  raw TEXT,
  score INTEGER,
  score_reason TEXT,
  -- new (to review) | chosen | skipped | drafted | contacted | replied | closed
  status TEXT NOT NULL DEFAULT 'new',
  created_at TEXT NOT NULL DEFAULT ${NOW},
  UNIQUE (campaign_id, email)
);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  step INTEGER NOT NULL DEFAULT 1,
  channel TEXT NOT NULL DEFAULT 'email',
  subject TEXT,
  body TEXT NOT NULL,
  -- draft | approved | rejected | sending | sent | failed
  status TEXT NOT NULL DEFAULT 'draft',
  sent_at TEXT,
  error TEXT,
  message_id TEXT,
  created_at TEXT NOT NULL DEFAULT ${NOW},
  UNIQUE (lead_id, step, channel)
);

CREATE TABLE IF NOT EXISTS sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'custom',
  enabled INTEGER NOT NULL DEFAULT 1,
  config TEXT NOT NULL,
  secret TEXT,
  created_at TEXT NOT NULL DEFAULT ${NOW}
);

CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS suppression (
  email TEXT PRIMARY KEY,
  reason TEXT,
  created_at TEXT NOT NULL DEFAULT ${NOW}
);

CREATE TABLE IF NOT EXISTS replies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  message_id TEXT NOT NULL UNIQUE,
  received_at TEXT,
  subject TEXT,
  body TEXT,
  category TEXT NOT NULL,
  summary TEXT,
  suggested_reply TEXT,
  handled INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT ${NOW}
);
`;
