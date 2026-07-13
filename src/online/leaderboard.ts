// Global highscores via Supabase's PostgREST API — plain fetch, no SDK (~0 KB).
// Fully optional: when VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are absent
// (local dev, or Vercel before the keys are added), everything no-ops and the
// game stays 100% offline-playable. Schema + policies: docs/supabase-setup.sql.

const URL_ = (import.meta as { env?: Record<string, string | undefined> }).env?.VITE_SUPABASE_URL;
const KEY = (import.meta as { env?: Record<string, string | undefined> }).env?.VITE_SUPABASE_ANON_KEY;

export const onlineEnabled = !!(URL_ && KEY);

export interface ScoreRow {
  name: string;
  score: number;
  depth: number;
  kills: number;
  stratum: number;
  won: boolean;
}

function headers(): Record<string, string> {
  return {
    apikey: KEY!,
    Authorization: `Bearer ${KEY}`,
    "Content-Type": "application/json",
  };
}

/** Fire-and-forget run submission. Never throws; returns whether it landed. */
export async function submitScore(guestId: string, row: ScoreRow): Promise<boolean> {
  if (!onlineEnabled) return false;
  try {
    const res = await fetch(`${URL_}/rest/v1/scores`, {
      method: "POST",
      headers: { ...headers(), Prefer: "return=minimal" },
      body: JSON.stringify({
        guest_id: guestId,
        name: row.name.slice(0, 20),
        score: Math.round(row.score),
        depth: Math.round(row.depth),
        kills: row.kills,
        stratum: row.stratum,
        won: row.won,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Top runs, one best entry per player (the `leaderboard` view dedupes). */
export async function fetchTop(limit = 8): Promise<ScoreRow[]> {
  if (!onlineEnabled) return [];
  try {
    const res = await fetch(
      `${URL_}/rest/v1/leaderboard?select=name,score,depth,kills,stratum,won&order=score.desc&limit=${limit}`,
      { headers: headers() }
    );
    if (!res.ok) return [];
    return (await res.json()) as ScoreRow[];
  } catch {
    return [];
  }
}
