// GET /api/lb-top — the TOP DIVERS board (best run per player, highest first).
// Reads the Upstash sorted set + per-player run hashes; responses are edge-cached
// briefly so a busy menu screen costs almost nothing.

const URL_ = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

async function redis(commands: (string | number)[][]): Promise<{ result?: unknown }[] | null> {
  const res = await fetch(`${URL_}/pipeline`, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(commands),
  });
  if (!res.ok) return null;
  return (await res.json()) as { result?: unknown }[];
}

export default async function handler(req: { method?: string }, res: {
  status: (n: number) => { json: (v: unknown) => void };
  setHeader: (k: string, v: string) => void;
}): Promise<void> {
  if (req.method !== "GET") {
    res.status(405).json({ error: "GET only" });
    return;
  }
  if (!URL_ || !TOKEN) {
    res.status(503).json({ error: "leaderboard storage not configured" });
    return;
  }
  const top = await redis([["ZRANGE", "lb", 0, 7, "REV"]]);
  const ids = (top?.[0]?.result as string[] | undefined) ?? [];
  if (!ids.length) {
    res.setHeader("Cache-Control", "s-maxage=15, stale-while-revalidate=60");
    res.status(200).json({ rows: [] });
    return;
  }
  const metas = await redis(ids.map((id) => ["HGETALL", `lb:run:${id}`]));
  const rows = ids.map((id, i) => {
    // Upstash HGETALL returns a flat [k1, v1, k2, v2, ...] array.
    const flat = (metas?.[i]?.result as string[] | undefined) ?? [];
    const m: Record<string, string> = {};
    for (let k = 0; k + 1 < flat.length; k += 2) m[flat[k]] = flat[k + 1];
    return {
      name: m.name || "DIVER",
      score: Number(m.score) || 0,
      depth: Number(m.depth) || 0,
      kills: Number(m.kills) || 0,
      stratum: Number(m.stratum) || 0,
      won: m.won === "1",
    };
  }).filter((r) => r.score > 0);
  res.setHeader("Cache-Control", "s-maxage=15, stale-while-revalidate=60");
  res.status(200).json({ rows });
}
