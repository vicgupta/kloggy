import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

const DB_PATH = process.env.DB_PATH || "./data/kloggy.db";
mkdirSync(dirname(DB_PATH), { recursive: true });
export const db = new Database(DB_PATH, { create: true });
db.run("PRAGMA journal_mode = WAL;");
db.run("PRAGMA foreign_keys = ON;");

db.run(`CREATE TABLE IF NOT EXISTS topics (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  brief TEXT,
  cadence_cron TEXT NOT NULL DEFAULT '0 9 * * 2,5',
  status TEXT NOT NULL DEFAULT 'active',
  next_run_at TEXT,
  deleted_at TEXT,
  parent_id INTEGER REFERENCES topics(id),
  selected INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);`);
try { db.run("ALTER TABLE topics ADD COLUMN deleted_at TEXT;"); } catch(e){}
try { db.run("ALTER TABLE topics ADD COLUMN parent_id INTEGER;"); } catch(e){}
try { db.run("ALTER TABLE topics ADD COLUMN selected INTEGER NOT NULL DEFAULT 0;"); } catch(e){}

db.run(`CREATE TABLE IF NOT EXISTS sources (
  id INTEGER PRIMARY KEY,
  url TEXT NOT NULL UNIQUE,
  title TEXT,
  fetched_at TEXT NOT NULL DEFAULT (datetime('now')),
  cleaned_text TEXT NOT NULL,
  summary TEXT,
  content_hash TEXT NOT NULL
);`);

db.run(`CREATE VIRTUAL TABLE IF NOT EXISTS sources_fts USING fts5(title, cleaned_text, content='sources', content_rowid='id');`);

db.run(`CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY,
  topic_id INTEGER NOT NULL REFERENCES topics(id),
  title TEXT, draft_md TEXT, humanized_md TEXT, final_md TEXT,
  status TEXT NOT NULL DEFAULT 'researching',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);`);

db.run(`CREATE TABLE IF NOT EXISTS publications (
  id INTEGER PRIMARY KEY,
  post_id INTEGER NOT NULL REFERENCES posts(id),
  platform TEXT NOT NULL DEFAULT 'devto',
  external_id TEXT, url TEXT, publish_status TEXT, published_at TEXT
);`);

export function q<T = any>(sql: string, params: any[] = []): T[] {
  return db.query(sql).all(...params) as T[];
}
export function run(sql: string, params: any[] = []) {
  return db.run(sql, params);
}
export function lastId() { return db.query("SELECT last_insert_rowid() as id").get() as { id: number }; }