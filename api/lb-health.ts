// GET /api/lb-health — diagnostic: is leaderboard storage wired up, and which
// candidate env var NAMES exist (names only — never values). Safe to expose;
// remove once the integration is confirmed.

export default function handler(_req: { method?: string }, res: {
  status: (n: number) => { json: (v: unknown) => void };
}): void {
  const names = Object.keys(process.env).filter((k) => /REDIS|UPSTASH|KV/i.test(k));
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL ||
    Object.entries(process.env).find(([k, v]) => /(REST_API_URL|REDIS_REST_URL)$/.test(k) && !!v && /^https:/.test(String(v)))?.[1];
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN ||
    Object.entries(process.env).find(([k, v]) => /(REST_API_TOKEN|REDIS_REST_TOKEN)$/.test(k) && !/READ_ONLY/.test(k) && !!v)?.[1];
  res.status(200).json({ configured: !!(url && token), candidateEnvNames: names });
}
