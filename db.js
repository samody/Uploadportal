const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'portal.db'));

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS upload_links (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    token    TEXT    UNIQUE NOT NULL,
    code     TEXT    UNIQUE NOT NULL,
    label    TEXT    NOT NULL DEFAULT '',
    max_files INTEGER DEFAULT NULL,
    expires_at TEXT  DEFAULT NULL,
    files_uploaded INTEGER NOT NULL DEFAULT 0,
    created_at TEXT  NOT NULL DEFAULT (datetime('now')),
    active   INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS files (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    original_name TEXT NOT NULL,
    stored_name   TEXT NOT NULL UNIQUE,
    size          INTEGER NOT NULL,
    mimetype      TEXT NOT NULL DEFAULT '',
    upload_link_id INTEGER REFERENCES upload_links(id) ON DELETE SET NULL,
    uploaded_at   TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS share_links (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    token    TEXT UNIQUE NOT NULL,
    code     TEXT UNIQUE NOT NULL,
    file_id  INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
    label    TEXT NOT NULL DEFAULT '',
    expires_at TEXT DEFAULT NULL,
    download_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    active   INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS admin_sessions (
    id         TEXT PRIMARY KEY,
    expires_at TEXT NOT NULL
  );
`);

module.exports = db;
