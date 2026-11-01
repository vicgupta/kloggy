import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

const PG_URL = process.env.POSTGRESQL_URL || process.env.POSTGRES_URL;
const DB_PATH = process.env.DB_PATH || "./data/kloggy.db";

let backend: "sqlite" | "postgres" = PG_URL ? "postgres" : "sqlite";

// --- SQLite ---
let sqliteDb: any = null;
// --- Postgres ---
let pgClient: any = null;
let lastInsertedId: number | null = null;

function normalizeSql(sql: string): string {
  if (backend === "postgres") {
    return sql.replace(/datetime\('now'\)/gi, "NOW()");
  }
  return sql.replace(/\bNOW\(\)/gi, "datetime('now')");
}
function toPgParams(sql: string): { sql: string; } {
  let i = 0;
  const converted = sql.replace(/\?/g, () => `$${++i}`);
  return { sql: converted };
}

export async function initDb() {
  if (backend === "postgres") {
    const { Client } = await import("pg");
    pgClient = new Client({ connectionString: PG_URL });
    await pgClient.connect();
    await pgClient.query(`CREATE TABLE IF NOT EXISTS topics (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      brief TEXT,
      cadence_cron TEXT NOT NULL DEFAULT '0 9 * * 2,5',
      status TEXT NOT NULL DEFAULT 'active',
      next_run_at TEXT,
      deleted_at TIMESTAMP,
      parent_id INTEGER REFERENCES topics(id),
      selected INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );`);
    await pgClient.query(`CREATE TABLE IF NOT EXISTS sources (
      id SERIAL PRIMARY KEY,
      url TEXT NOT NULL UNIQUE,
      title TEXT,
      fetched_at TIMESTAMP NOT NULL DEFAULT NOW(),
      cleaned_text TEXT NOT NULL,
      summary TEXT,
      content_hash TEXT NOT NULL
    );`);
    await pgClient.query(`CREATE TABLE IF NOT EXISTS posts (
      id SERIAL PRIMARY KEY,
      topic_id INTEGER NOT NULL REFERENCES topics(id),
      title TEXT, draft_md TEXT, humanized_md TEXT, final_md TEXT,
      status TEXT NOT NULL DEFAULT 'researching',
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );`);
    await pgClient.query(`CREATE TABLE IF NOT EXISTS publications (
      id SERIAL PRIMARY KEY,
      post_id INTEGER NOT NULL REFERENCES posts(id),
      platform TEXT NOT NULL DEFAULT 'devto',
      external_id TEXT, url TEXT, publish_status TEXT, published_at TIMESTAMP
    );`);
    console.log("[db] PostgreSQL connected");
  } else {
    const { Database } = await import("bun:sqlite");
    mkdirSync(dirname(DB_PATH), { recursive: true });
    sqliteDb = new Database(DB_PATH, { create: true });
    sqliteDb.run("PRAGMA journal_mode = WAL;");
    sqliteDb.run("PRAGMA foreign_keys = ON;");
    sqliteDb.run(`CREATE TABLE IF NOT EXISTS topics (
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
    sqliteDb.run(`CREATE TABLE IF NOT EXISTS sources (
      id INTEGER PRIMARY KEY,
      url TEXT NOT NULL UNIQUE,
      title TEXT,
      fetched_at TEXT NOT NULL DEFAULT (datetime('now')),
      cleaned_text TEXT NOT NULL,
      summary TEXT,
      content_hash TEXT NOT NULL
    );`);
    sqliteDb.run(`CREATE VIRTUAL TABLE IF NOT EXISTS sources_fts USING fts5(title, cleaned_text, content='sources', content_rowid='id');`);
    sqliteDb.run(`CREATE TABLE IF NOT EXISTS posts (
      id INTEGER PRIMARY KEY,
      topic_id INTEGER NOT NULL REFERENCES topics(id),
      title TEXT, draft_md TEXT, humanized_md TEXT, final_md TEXT,
      status TEXT NOT NULL DEFAULT 'researching',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );`);
    sqliteDb.run(`CREATE TABLE IF NOT EXISTS publications (
      id INTEGER PRIMARY KEY,
      post_id INTEGER NOT NULL REFERENCES posts(id),
      platform TEXT NOT NULL DEFAULT 'devto',
      external_id TEXT, url TEXT, publish_status TEXT, published_at TEXT
    );`);
    // migrations
    try { sqliteDb.run("ALTER TABLE topics ADD COLUMN deleted_at TEXT;"); } catch(e){}
    try { sqliteDb.run("ALTER TABLE topics ADD COLUMN parent_id INTEGER;"); } catch(e){}
    try { sqliteDb.run("ALTER TABLE topics ADD COLUMN selected INTEGER NOT NULL DEFAULT 0;"); } catch(e){}
    console.log("[db] SQLite ready");
  }
}

export function isPostgres() { return backend === "postgres"; }

export async function q<T = any>(sql: string, params: any[] = []): Promise<T[]> {
  sql = normalizeSql(sql);
  if (backend === "postgres") {
    const r = await pgClient.query(toPgParams(sql).sql, params);
    return r.rows as T[];
  }
  return sqliteDb.query(sql).all(...params) as T[];
}

export async function run(sql: string, params: any[] = []): Promise<{ id?: number }> {
  sql = normalizeSql(sql);
  if (backend === "postgres") {
    const isInsert = /^\s*INSERT/i.test(sql);
    const qsql = isInsert && !/RETURNING/i.test(sql) ? sql + " RETURNING id" : sql;
    const r = await pgClient.query(toPgParams(qsql).sql, params);
    const id = r.rows?.[0]?.id;
    if (id !== undefined) lastInsertedId = Number(id);
    return { id: lastInsertedId ?? undefined };
  }
  const info = sqliteDb.run(sql, params);
  try { lastInsertedId = Number(sqliteDb.query("SELECT last_insert_rowid() as id").get().id); } catch(e){}
  return { id: lastInsertedId ?? undefined };
}

export function lastId() { return { id: lastInsertedId ?? 0 }; }

export async function closeDb() {
  if (backend === "postgres" && pgClient) await pgClient.end();
}