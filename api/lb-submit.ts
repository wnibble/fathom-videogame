// POST /api/lb-submit — log a run to the global leaderboard.
// Storage: Upstash Redis (add via Vercel Marketplace; connecting it to the
// project injects the env vars). A sorted set keeps each player's BEST score
// (ZADD GT); a hash keeps that run's details. Keys never reach the browser.

// Marketplace integrations name their env vars differently per install (UPSTASH_*,
// KV_*, or a custom prefix chosen at connect time) — resolve any REST url/token pair.
function resolveRedisEnv(): { url?: string; token?: string } {
  const env = process.env;
  const url =
    env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL ||
    Object.entries(env).find(([k, v]) => /(REST_API_URL|REDIS_REST_URL)$/.test(k) && !!v && /^https:/.test(v))?.[1];
  const token =
    env.UPSTASH_REDIS_REST_TOKEN || env.KV_REST_API_TOKEN ||
    Object.entries(env).find(([k, v]) => /(REST_API_TOKEN|REDIS_REST_TOKEN)$/.test(k) && !/READ_ONLY/.test(k) && !!v)?.[1];
  return { url, token };
}
const { url: URL_, token: TOKEN } = resolveRedisEnv();

interface Body {
  guestId?: string;
  name?: string;
  score?: number;
  depth?: number;
  kills?: number;
  stratum?: number;
  won?: boolean;
}

async function redis(commands: (string | number)[][]): Promise<{ result?: unknown }[] | null> {
  const res = await fetch(`${URL_}/pipeline`, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(commands),
  });
  if (!res.ok) return null;
  return (await res.json()) as { result?: unknown }[];
}

export default async function handler(req: { method?: string; body?: Body }, res: {
  status: (n: number) => { json: (v: unknown) => void };
  setHeader: (k: string, v: string) => void;
}): Promise<void> {
  if (req.method !== "POST") {
    res.status(405).json({ error: "POST only" });
    return;
  }
  if (!URL_ || !TOKEN) {
    res.status(503).json({ error: "leaderboard storage not configured" });
    return;
  }
  const b = req.body ?? {};
  // Sanity rails (client scores are never tamper-proof; keep casual garbage out).
  const guestId = typeof b.guestId === "string" ? b.guestId.slice(0, 64) : "";
  const name = (typeof b.name === "string" ? b.name : "").replace(/[^\w \-'.!]/g, "").trim().slice(0, 20);
  const score = Math.round(Number(b.score));
  const depth = Math.round(Number(b.depth) || 0);
  const kills = Math.round(Number(b.kills) || 0);
  const stratum = Math.round(Number(b.stratum) || 0);
  const won = b.won === true;
  if (guestId.length < 4 || name.length < 1 || !Number.isFinite(score) || score < 0 || score > 10_000_000 ||
      depth < 0 || depth > 100_000 || kills < 0 || kills > 100_000 || stratum < 0 || stratum > 5) {
    res.status(400).json({ error: "bad run" });
    return;
  }

  // Only better runs overwrite: ZADD GT returns the member's presence; compare
  // the stored best after the write to know whether details should update.
  const first = await redis([
    ["ZADD", "lb", "GT", score, guestId],
    ["ZSCORE", "lb", guestId],
  ]);
  if (!first) {
    res.status(502).json({ error: "storage unreachable" });
    return;
  }
  const bestNow = Number(first[1]?.result);
  if (bestNow === score) {
    await redis([[
      "HSET", `lb:run:${guestId}`,
      "name", name, "score", String(score), "depth", String(depth),
      "kills", String(kills), "stratum", String(stratum), "won", won ? "1" : "0",
    ]]);
  }
  res.status(200).json({ ok: true, best: bestNow });
}
