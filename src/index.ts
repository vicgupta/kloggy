import { serve } from "bun";
import { runOpenCode } from "./opencode";
import { publishToDevto } from "./publish";
import { initDb, isPostgres, q, run, lastId } from "./db";

const VERSION = "0.1.19";
// ensure .env exists
try {
  const fs = await import("node:fs");
  if (!fs.existsSync(".env")) {
    fs.writeFileSync(".env", `HOST=0.0.0.0
PORT=3000
DEVTO_API_KEY=
SEARCH_API_KEY=
OPENCODE_MODEL=opencode-go/beam-free
OPENCODE_MODEL_FALLBACK=opencode-go/iceman-contributor-free
SCHEDULE_BUSY_MINUTES=5
SCHEDULE_IDLE_MINUTES=60
`);
    console.log("Created default .env");
  }
} catch (e) {}

console.log("Kloggy v" + VERSION);
if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(`
Usage: kloggy [command] [options]

Commands:
  (default)   Start the server and open the browser
  update      Self-update to the latest release

Options:
  --version, -v   Print version and exit
  --help, -h      Show this help and exit

Environment (.env):
  HOST, PORT, DEVTO_API_KEY, SEARCH_API_KEY
  OPENCODE_MODEL, OPENCODE_MODEL_FALLBACK
  POSTGRESQL_URL (optional, uses Postgres instead of SQLite)
  SCHEDULE_BUSY_MINUTES (default 5), SCHEDULE_IDLE_MINUTES (default 60)
`);
  process.exit(0);
}
if (process.argv.includes("--version") || process.argv.includes("-v")) {
  process.exit(0);
}
if (process.argv.includes("update") || process.argv.includes("--update") || process.argv.includes("-u")) {
  try {
    // kill existing running instance on the port
    try {
      const { execSync } = await import("node:child_process");
      const out = execSync(`lsof -t -i:${PORT}`, { encoding: "utf8" }).trim();
      if (out) {
        for (const pid of out.split(/\s+/)) {
          if (pid && Number(pid) !== process.pid) {
            try { process.kill(Number(pid), "SIGTERM"); console.log("Killed existing process", pid); } catch (e) {}
          }
        }
      }
    } catch (e) { /* no process or lsof unavailable */ }
    await new Promise((r) => setTimeout(r, 1000));
    console.log("Checking for updates...");
    const res = await fetch("https://api.github.com/repos/vicgupta/kloggy/releases/latest");
    if (!res.ok) { console.error("Failed to fetch release:", res.status); process.exit(1); }
    const rel: any = await res.json();
    let assetName = "kloggy";
    if (process.platform === "linux") {
      assetName = process.arch === "arm64" ? "kloggy-linux-arm64" : "kloggy-linux-x64";
    }
    const asset = (rel.assets || []).find((a: any) => a.name === assetName);
    if (!asset) { console.error("No binary asset for this platform in latest release."); process.exit(1); }
    console.log("Downloading", asset.name, "from", rel.tag_name, "...");
    const bin = await fetch(asset.browser_download_url);
    if (!bin.ok) { console.error("Download failed:", bin.status); process.exit(1); }
    const buf = await bin.arrayBuffer();
    const target = process.execPath;
    await Bun.write(target, buf);
    try { const fs = await import("node:fs"); fs.chmodSync(target, 0o755); } catch (e) {}
    console.log("Updated to", rel.tag_name, "at", target);
  } catch (e: any) {
    console.error("Update failed:", e?.message || e);
  }
  process.exit(0);
}

await initDb();

const HOST = process.env.HOST || "0.0.0.0";
const PORT = Number(process.env.PORT || 3000);

async function runPipeline(topicId: number) {
  console.log(`[pipeline] start topic ${topicId}`);
  const topics = await q<{id:number;title:string;brief:string|null}>("SELECT * FROM topics WHERE id=?", [topicId]);
  const topic = topics[0];
  if (!topic) throw new Error("topic not found");
  console.log(`[pipeline] topic: ${topic.title}`);
  console.log("[stage 1/3] Research: calling OpenCode...");
  const researchPrompt = `Do not use any tools or skills. From your own knowledge, research the topic "${topic.title}" (${topic.brief ?? ""}). Produce markdown with 3-5 sources: for each, title, url (plausible), summary (150-250 words). Output ONLY the markdown, no preamble.`;
  const research = await runOpenCode(researchPrompt);
  console.log(`[stage 1/3] Research done: ${research.length} chars`);
  const url = `topic:${topic.id}`;
  const hash = Bun.hash(research).toString();
  await run("INSERT INTO sources(url,title,cleaned_text,content_hash) VALUES(?,?,?,?)", [url, topic.title, research, hash]);
  console.log("[stage 2/3] Draft: calling OpenCode...");
  const draftPrompt = `Using this research:\n${research}\n\nWrite an SEO-optimized blog post titled "${topic.title}" in a direct, plain, first-person tone. 900-1400 words. Markdown. Requirements: include a compelling H1 title, a meta description (150-160 chars) as the first paragraph, proper H2/H3 heading structure, relevant keywords naturally integrated, a short FAQ section, and 3-4 lowercase tags. Output only the post.`;
  const draft = await runOpenCode(draftPrompt);
  console.log(`[stage 2/3] Draft done: ${draft.length} chars`);
  console.log("[stage 3/3] Humanize: calling OpenCode...");
  const humanizePrompt = `Edit this draft for rhythm, varied sentence length, fewer generic phrases, concrete examples, natural transitions. Keep facts and SEO structure (headings, meta description, keywords, FAQ, tags). Output only the final markdown.\n\n${draft}`;
  const humanized = await runOpenCode(humanizePrompt);
  console.log(`[stage 3/3] Humanize done: ${humanized.length} chars`);
  await run("INSERT INTO posts(topic_id,title,draft_md,humanized_md,final_md,status) VALUES(?,?,?,?,?,?)",
    [topicId, topic.title, draft, humanized, humanized, "awaiting_approval"]);
  const id = lastId().id;
  console.log(`[pipeline] complete: post ${id} awaiting_approval`);
  return id;
}

// Adaptive scheduler
async function schedulerTick() {
  console.log("[scheduler] tick");
  const subs = await q<{id:number}>("SELECT id FROM topics WHERE parent_id IS NOT NULL AND selected=1 AND deleted_at IS NULL");
  const pending: number[] = [];
  for (const s of subs) {
    const has = (await q<{c:number}>("SELECT COUNT(*) as c FROM posts WHERE topic_id=?", [s.id]))[0].c;
    if (has === 0) pending.push(s.id);
  }
  if (pending.length === 0) {
    console.log("[scheduler] no pending posts");
  } else {
    const next = pending[0];
    console.log("[scheduler] processing one post: subtopic", next, "(pending:", pending.length, ")");
    try { await runPipeline(next); }
    catch (e:any) { console.error("[scheduler] subtopic", next, "failed:", e?.message); }
  }
  const busyMin = Number(process.env.SCHEDULE_BUSY_MINUTES || 30);
  const idleMin = Number(process.env.SCHEDULE_IDLE_MINUTES || 60);
  const interval = (pending.length >= 2 ? busyMin : idleMin) * 60 * 1000;
  const nextRun = new Date(Date.now() + interval);
  console.log(`[scheduler] next tick in ${interval / 60000} min (at ${nextRun.toLocaleString()})`);
  setTimeout(schedulerTick, interval);
}
const firstDelay = 60 * 1000;
console.log(`[scheduler] first run in ${firstDelay / 60000} min (at ${new Date(Date.now() + firstDelay).toLocaleString()})`);
setTimeout(schedulerTick, firstDelay);

// read embedded html
import html from "../web/index.html" with { type: "text" };

const server = serve({
  hostname: HOST, port: PORT, idleTimeout: 255,
  async fetch(req) {
    const u = new URL(req.url);
    if (u.pathname === "/") return new Response(html, { headers: { "Content-Type": "text/html", "Cache-Control": "no-store, no-cache, must-revalidate" } });
    if (u.pathname === "/api/topics" && req.method === "GET") return Response.json(await q("SELECT * FROM topics WHERE deleted_at IS NULL AND parent_id IS NULL"));
    if (u.pathname.match(/^\/api\/topics\/\d+\/subtopics$/) && req.method === "GET") {
      const id = Number(u.pathname.split("/")[3]);
      return Response.json(await q("SELECT * FROM topics WHERE parent_id=? AND deleted_at IS NULL", [id]));
    }
    if (u.pathname === "/api/topics" && req.method === "POST") {
      const b = await req.json() as any;
      await run("INSERT INTO topics(title,brief,parent_id) VALUES(?,?,NULL)", [b.title, b.brief ?? null]);
      const newId = lastId().id;
      let subtopics: string[] = [];
      try {
        const prompt = `Given the topic "${b.title}" (angle: ${b.brief ?? "general"}), generate 8-12 nuanced subtopics that are semantically relevant, long tail, distinct, and current (reflecting 2025-2026 developments). Each subtopic should be a specific, non-overlapping angle that a knowledgeable reader would search for. Output ONLY a JSON array of strings, no markdown, no explanation.`;
        const out = await runOpenCode(prompt);
        const m = out.match(/\[[\s\S]*\]/);
        if (m) subtopics = JSON.parse(m[0]);
      } catch (e) { console.error("subtopic gen failed", e); }
      if (!Array.isArray(subtopics)) subtopics = [];
      const inserted: {id:number;title:string}[] = [];
      for (const st of subtopics) {
        await run("INSERT INTO topics(title,brief,parent_id,selected) VALUES(?,?,?,0)", [String(st), b.brief ?? null, newId]);
        inserted.push({ id: lastId().id, title: String(st) });
      }
      return Response.json({ id: newId, subtopics: inserted });
    }
    if (u.pathname.match(/^\/api\/topics\/\d+\/subtopics$/) && req.method === "PUT") {
      const id = Number(u.pathname.split("/")[3]);
      const b = await req.json() as any;
      const selected: number[] = Array.isArray(b.selected) ? b.selected : [];
      await run("UPDATE topics SET selected=0 WHERE parent_id=?", [id]);
      for (const sid of selected) await run("UPDATE topics SET selected=1 WHERE id=? AND parent_id=?", [sid, id]);
      return Response.json({ ok: true });
    }
    if (u.pathname.match(/^\/api\/topics\/\d+$/) && req.method === "DELETE") {
      const id = Number(u.pathname.split("/").pop());
      await run("UPDATE topics SET deleted_at=NOW(), status='deleted' WHERE id=?", [id]);
      await run("UPDATE topics SET deleted_at=NOW(), status='deleted' WHERE parent_id=?", [id]);
      return Response.json({ ok: true });
    }
    if (u.pathname === "/api/pending" && req.method === "GET") {
      const subs = await q<{id:number}>("SELECT id FROM topics WHERE parent_id IS NOT NULL AND selected=1 AND deleted_at IS NULL");
      let pending = 0;
      for (const s of subs) {
        const has = (await q<{c:number}>("SELECT COUNT(*) as c FROM posts WHERE topic_id=?", [s.id]))[0].c;
        if (has === 0) pending++;
      }
      return Response.json({ pending });
    }
    if (u.pathname === "/api/scheduled" && req.method === "GET") {
      const subs = await q<{id:number;title:string;parent_id:number}>("SELECT id,title,parent_id FROM topics WHERE parent_id IS NOT NULL AND selected=1 AND deleted_at IS NULL");
      const out: any[] = [];
      for (const s of subs) {
        const has = (await q<{c:number}>("SELECT COUNT(*) as c FROM posts WHERE topic_id=?", [s.id]))[0].c;
        if (has === 0) {
          const parent = (await q<{title:string}>("SELECT title FROM topics WHERE id=?", [s.parent_id]))[0];
          out.push({ id: s.id, title: s.title, parent: parent ? parent.title : "" });
        }
      }
      return Response.json(out);
    }
    if (u.pathname.startsWith("/api/run/") && req.method === "POST") {
      const id = Number(u.pathname.split("/").pop());
      const t = (await q<{id:number;parent_id:number|null}>("SELECT id,parent_id FROM topics WHERE id=?", [id]))[0];
      if (!t) return Response.json({ error: "not found" }, { status: 404 });
      if (t.parent_id !== null) {
        try { const postId = await runPipeline(id); return Response.json({ postId }); }
        catch (e:any) { return Response.json({ error: e.message }, { status: 500 }); }
      }
      const subs = await q<{id:number}>("SELECT id FROM topics WHERE parent_id=? AND selected=1 AND deleted_at IS NULL", [id]);
      if (subs.length === 0) return Response.json({ error: "No subtopics selected" }, { status: 400 });
      (async () => {
        for (const s of subs) {
          try { await runPipeline(s.id); }
          catch (e:any) { console.error("[run] subtopic", s.id, e?.message); }
        }
      })();
      return Response.json({ started: subs.length });
    }
    if (u.pathname === "/api/posts" && req.method === "GET") return Response.json(await q("SELECT id,topic_id,title,status,created_at FROM posts ORDER BY id DESC"));
    if (u.pathname.match(/^\/api\/posts\/\d+$/) && req.method === "GET") {
      const id = Number(u.pathname.split("/").pop());
      const rows = await q("SELECT * FROM posts WHERE id=?", [id]);
      return Response.json(rows[0] ?? null);
    }
    if (u.pathname.match(/^\/api\/posts\/\d+$/) && req.method === "PUT") {
      const id = Number(u.pathname.split("/").pop());
      const b = await req.json() as any;
      await run("UPDATE posts SET final_md=?, updated_at=NOW() WHERE id=?", [b.final_md, id]);
      return Response.json({ ok: true });
    }
    if (u.pathname.match(/^\/api\/posts\/\d+\/approve$/) && req.method === "POST") {
      const id = Number(u.pathname.split("/")[3]);
      const posts = await q<any>("SELECT * FROM posts WHERE id=?", [id]);
      const post = posts[0];
      if (!post) return Response.json({ error: "not found" }, { status: 404 });
      const finalMd = post.final_md || post.humanized_md;
      if (!process.env.DEVTO_API_KEY) {
        await run("UPDATE posts SET status='approved', updated_at=NOW() WHERE id=?", [id]);
        return Response.json({ url: null, message: "DEVTO_API_KEY missing; post marked approved (not published)" });
      }
      try {
        const res: any = await publishToDevto(post.title, finalMd);
        await run("INSERT INTO publications(post_id,external_id,url,publish_status,published_at) VALUES(?,?,?,?,NOW())",
          [id, String(res.id), res.url, res.published ? "published" : "draft"]);
        await run("UPDATE posts SET status='published', updated_at=NOW() WHERE id=?", [id]);
        return Response.json({ url: res.url });
      } catch (e: any) {
        return Response.json({ error: e.message }, { status: 500 });
      }
    }
    if (u.pathname.match(/^\/api\/posts\/\d+\/reject$/) && req.method === "POST") {
      const id = Number(u.pathname.split("/")[3]);
      await run("UPDATE posts SET status='rejected', updated_at=NOW() WHERE id=?", [id]);
      return Response.json({ ok: true });
    }
    if (u.pathname === "/api/publications" && req.method === "GET") return Response.json(await q("SELECT * FROM publications ORDER BY id DESC"));
    return new Response("not found", { status: 404 });
  },
});

console.log(`Kloggy v${VERSION} running on http://${HOST}:${PORT}`);

// open browser
const url = `http://${HOST === "0.0.0.0" ? "localhost" : HOST}:${PORT}`;
try {
  const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
  Bun.spawn([cmd, url], { stdio: "ignore" });
} catch (e) { /* ignore */ }

function shutdown() {
  console.log("\nShutting down...");
  try { server.stop(true); } catch (e) {}
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);