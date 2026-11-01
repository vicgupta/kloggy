import { spawn } from "node:child_process";

function runOnce(model: string | undefined, prompt: string, timeoutMs: number): Promise<string> {
  const args = model ? ["run", "--model", model, prompt] : ["run", prompt];
  return new Promise((resolve, reject) => {
    const proc = spawn("opencode", args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "", err = "";
    proc.stdout.on("data", (d) => (out += d));
    proc.stderr.on("data", (d) => (err += d));
    const timer = setTimeout(() => { proc.kill("SIGKILL"); reject(new Error("timeout")); }, timeoutMs);
    proc.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) { console.log(`[opencode:${model ?? "default"}] failed exit ${code}: ${err.slice(0,120)}`); reject(new Error(err || `exit ${code}`)); }
      else { console.log(`[opencode:${model ?? "default"}] ok: ${out.trim().length} chars`); resolve(out.trim()); }
    });
  });
}

export async function runOpenCode(prompt: string, timeoutMs = 180000): Promise<string> {
  const primary = process.env.OPENCODE_MODEL;
  const fallback = process.env.OPENCODE_MODEL_FALLBACK;
  console.log(`[opencode] primary=${primary ?? "default"} fallback=${fallback ?? "none"}`);
  try {
    return await runOnce(primary, prompt, timeoutMs);
  } catch (e: any) {
    if (!fallback || fallback === primary) throw e;
    console.log(`[opencode] primary failed, trying fallback ${fallback}...`);
    return await runOnce(fallback, prompt, timeoutMs);
  }
}