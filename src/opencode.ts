import { spawn } from "node:child_process";

export async function runOpenCode(prompt: string, timeoutMs = 180000): Promise<string> {
  const model = process.env.OPENCODE_MODEL;
  const args = model ? ["run", "--model", model, prompt] : ["run", prompt];
  console.log(`[opencode] invoking: opencode ${args.slice(0,-1).join(" ")} <prompt ${prompt.length} chars>`);
  return new Promise((resolve, reject) => {
    const proc = spawn("opencode", args, {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "", err = "";
    proc.stdout.on("data", (d) => (out += d));
    proc.stderr.on("data", (d) => (err += d));
    const timer = setTimeout(() => { proc.kill("SIGKILL"); reject(new Error("timeout")); }, timeoutMs);
    proc.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) { console.log(`[opencode] failed exit ${code}: ${err.slice(0,200)}`); reject(new Error(err || `exit ${code}`)); }
      else { console.log(`[opencode] ok: ${out.trim().length} chars`); resolve(out.trim()); }
    });
  });
}