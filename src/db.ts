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
    // strip sslmode to avoid libpq warning; use rejectUnauthorized:false for self-signed certs
    const connStr = (PG_URL || "").replace(/[?&]sslmode=[^&]*/g, "");
    pgClient = new Client({ connectionString: connStr, ssl: { rejectUnauthorized: false } });
    await pgClient.connect();
    // create schema first
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
    // verify schema
    const tCheck = await pgClient.query("SELECT to_regclass('public.topics') as t");
    if (!tCheck.rows[0].t) throw new Error("topics table not created");
    console.log("[db] PostgreSQL schema ready");
    // migration prompt
    try {
      const fs = await import("node:fs");
      if (fs.existsSync(DB_PATH)) {
        const { Database } = await import("bun:sqlite");
        const sdb = new Database(DB_PATH, { readonly: true });
        const cnt = (sdb.query("SELECT COUNT(*) as c FROM topics").get() as any)?.c ?? 0;
        sdb.close();
        if (cnt > 0) {
          console.log(`Found ${cnt} existing topics in SQLite.`);
          // ask
          const readline = await import("node:readline");
          const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
          const answer: string = await new Promise((resolve) => rl.question("Copy existing blogs to PostgreSQL? (y/n) ", resolve));
          rl.close();
          if (answer.trim().toLowerCase() === "y") {
            // copy
            const sdb2 = new Database(DB_PATH, { readonly: true });
            const topics = sdb2.query("SELECT * FROM topics").all() as any[];
            const sources = sdb2.query("SELECT * FROM sources").all() as any[];
            const posts = sdb2.query("SELECT * FROM posts").all() as any[];
            const pubs = sdb2.query("SELECT * FROM publications").all() as any[];
            for (const t of topics) {
              await pgClient.query("INSERT INTO topics (id,title,brief,cadence_cron,status,next_run_at,deleted_at,parent_id,selected,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT (id) DO NOTHING",
                [t.id,t.title,t.brief,t.cadence_cron,t.status,t.next_run_at,t.deleted_at,t.parent_id,t.selected,t.created_at]);
            }
            for (const s of sources) {
              await pgClient.query("INSERT INTO sources (id,url,title,fetched_at,cleaned_text,summary,content_hash) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (id) DO NOTHING",
                [s.id,s.url,s.title,s.fetched_at,s.cleaned_text,s.summary,s.content_hash]);
            }
            for (const p of posts) {
              await pgClient.query("INSERT INTO posts (id,topic_id,title,draft_md,humanized_md,final_md,status,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (id) DO NOTHING",
                [p.id,p.topic_id,p.title,p.draft_md,p.humanized_md,p.final_md,p.status,p.created_at,p.updated_at]);
            }
            for (const pu of pubs) {
              await pgClient.query("INSERT INTO publications (id,post_id,platform,external_id,url,publish_status,published_at) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (id) DO NOTHING",
                [pu.id,pu.post_id,pu.platform,pu.external_id,pu.url,pu.publish_status,pu.published_at]);
            }
            // reset sequences
            await pgClient.query("SELECT setval('topics_id_seq', (SELECT MAX(id) FROM topics))");
            await pgClient.query("SELECT setval('sources_id_seq', (SELECT MAX(id) FROM sources))");
            await pgClient.query("SELECT setval('posts_id_seq', (SELECT MAX(id) FROM posts))");
            await pgClient.query("SELECT setval('publications_id_seq', (SELECT MAX(id) FROM publications))");
            sdb2.close();
            console.log("Migration complete.");
          } else {
            console.log("Skipping migration.");
          }
        }
      }
    } catch (e) { console.error("migration check failed:", e); }
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