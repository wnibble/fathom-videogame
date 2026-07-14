// Global highscores — two interchangeable backends, zero SDKs:
//  1. Supabase PostgREST (if VITE_SUPABASE_URL/ANON_KEY are baked in at build)
//  2. Same-origin Vercel functions (/api/lb-*) backed by Upstash Redis from the
//     Vercel Marketplace — no extra accounts, keys stay server-side.
// Fully optional either way: on any failure the game stays offline-playable and
// the TOP DIVERS panel simply doesn't show.

const SB_URL = (import.meta as { env?: Record<string, string | undefined> }).env?.VITE_SUPABASE_URL;
const SB_KEY = (import.meta as { env?: Record<string, string | undefined> }).env?.VITE_SUPABASE_ANON_KEY;
const useSupabase = !!(SB_URL && SB_KEY);
// The /api functions only exist on the deployed site — don't probe them from
// local dev/preview (404 noise in the console, QA flags it).
const apiAvailable = typeof location !== "undefined" && !/^(localhost|127\.)/.test(location.hostname);

export interface ScoreRow {
  name: string;
  score: number;
  depth: number;
  kills: number;
  stratum: number;
  won: boolean;
}

function sbHeaders(): Record<string, string> {
  return { apikey: SB_KEY!, Authorization: `Bearer ${SB_KEY}`, "Content-Type": "application/json" };
}

/** Fire-and-forget run submission. Never throws; returns whether it landed. */
export async function submitScore(guestId: string, row: ScoreRow): Promise<boolean> {
  const body = {
    guest_id: guestId,
    guestId,
    name: row.name.slice(0, 20),
    score: Math.round(row.score),
    depth: Math.round(row.depth),
    kills: row.kills,
    stratum: row.stratum,
    won: row.won,
  };
  try {
    if (useSupabase) {
      const res = await fetch(`${SB_URL}/rest/v1/scores`, {
        method: "POST",
        headers: { ...sbHeaders(), Prefer: "return=minimal" },
        body: JSON.stringify(body),
      });
      return res.ok;
    }
    if (!apiAvailable) return false;
    const res = await fetch("/api/lb-submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Top runs, one best entry per player. Returns null when no backend is live
 * (local dev, storage not configured) — callers hide the board entirely. */
export async function fetchTop(limit = 8): Promise<ScoreRow[] | null> {
  try {
    if (useSupabase) {
      const res = await fetch(
        `${SB_URL}/rest/v1/leaderboard?select=name,score,depth,kills,stratum,won&order=score.desc&limit=${limit}`,
        { headers: sbHeaders() }
      );
      if (!res.ok) return null;
      return (await res.json()) as ScoreRow[];
    }
    if (!apiAvailable) return null;
    const res = await fetch("/api/lb-top");
    if (!res.ok) return null;
    const data = (await res.json()) as { rows?: ScoreRow[] };
    return Array.isArray(data.rows) ? data.rows.slice(0, limit) : null;
  } catch {
    return null;
  }
}
