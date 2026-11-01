export async function publishToDevto(title: string, body: string, tags: string[] = [], description = "") {
  const key = process.env.DEVTO_API_KEY;
  if (!key) throw new Error("DEVTO_API_KEY missing");
  const res = await fetch("https://dev.to/api/articles", {
    method: "POST",
    headers: { "api-key": key, "Content-Type": "application/json", "Accept": "application/vnd.forem.api-v1+json" },
    body: JSON.stringify({ article: { title, body_markdown: body, published: true, tags: tags.slice(0,4), description } }),
  });
  if (!res.ok) throw new Error(`devto ${res.status}: ${await res.text()}`);
  return res.json();
}