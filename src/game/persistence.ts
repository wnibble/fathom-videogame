// Local-first persistence (browser localStorage). Guest id + meta save. Cloud
// sync (Supabase) is a later pass; this contract stays identical so it can be
// swapped without touching callers.

export interface Settings {
  reducedMotion: boolean;
  screenShake: boolean;
  sound: boolean;
}
export interface SaveData {
  guestId: string;
  bestDepth: number;
  bestScore: number;
  totalSamples: number;
  runs: number;
  codexSeen: string[]; // species keys catalogued
  settings: Settings;
}

const KEY = "fathom.save.v1";

function makeGuestId(): string {
  // Not crypto — just a stable local id. (No Date.now/Math.random constraints here;
  // this runs in the browser, not the workflow sandbox.)
  return "guest-" + Math.floor(Math.random() * 1e9).toString(36) + Date.now().toString(36);
}

function defaultSettings(): Settings {
  return { reducedMotion: false, screenShake: true, sound: true };
}
function fresh(): SaveData {
  return { guestId: makeGuestId(), bestDepth: 0, bestScore: 0, totalSamples: 0, runs: 0, codexSeen: [], settings: defaultSettings() };
}

export function load(): SaveData {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) {
      const s = fresh();
      save(s);
      return s;
    }
    const parsed = JSON.parse(raw) as Partial<SaveData>;
    const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);
    const bool = (v: unknown, d: boolean) => (typeof v === "boolean" ? v : d);
    const ps = (parsed.settings ?? {}) as Partial<Settings>;
    // Coerce every field — stored JSON may be tampered, legacy, or wrong-typed.
    return {
      guestId: typeof parsed.guestId === "string" ? parsed.guestId : makeGuestId(),
      bestDepth: num(parsed.bestDepth, 0),
      bestScore: num(parsed.bestScore, 0),
      totalSamples: num(parsed.totalSamples, 0),
      runs: num(parsed.runs, 0),
      codexSeen: Array.isArray(parsed.codexSeen) ? parsed.codexSeen.filter((s) => typeof s === "string") : [],
      settings: { reducedMotion: bool(ps.reducedMotion, false), screenShake: bool(ps.screenShake, true), sound: bool(ps.sound, true) },
    };
  } catch {
    return fresh();
  }
}

export function save(data: SaveData): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    /* storage full / disabled — non-fatal for a slice */
  }
}

/** Record the outcome of a dive, banking depth/score/samples. Returns updated save. */
export function recordDive(data: SaveData, depthReached: number, score: number, bankedSamples: number, seen: string[]): SaveData {
  const next: SaveData = {
    ...data,
    bestDepth: Math.max(data.bestDepth, depthReached),
    bestScore: Math.max(data.bestScore, score),
    totalSamples: data.totalSamples + bankedSamples,
    runs: data.runs + 1,
    codexSeen: Array.from(new Set([...data.codexSeen, ...seen])),
  };
  save(next);
  return next;
}

export function saveSettings(data: SaveData, settings: Settings): SaveData {
  const next = { ...data, settings };
  save(next);
  return next;
}
