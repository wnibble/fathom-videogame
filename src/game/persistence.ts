// Local-first persistence (browser localStorage). Guest id + meta save. Cloud
// sync (Supabase) is a later pass; this contract stays identical so it can be
// swapped without touching callers.

import { evaluateBadges } from "../content/badges";
import { META_BY_ID, metaCost } from "../content/meta_upgrades";

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
  // ---- meta economy (pass 5) ----
  pearls: number;
  metaTiers: Record<string, number>;
  badges: string[];
  totalKills: number;
  totalElites: number;
  totalRelics: number;
  totalPearlsEarned: number;
}

export interface DiveResult {
  depth: number;
  score: number;
  samples: number;
  kills: number;
  elites: number;
  relics: number;
  level: number;
  surfaced: boolean; // false = death (partial bank), true = voluntary surface (full)
  maxedUpgrade: boolean;
  seen: string[];
}

export const DEATH_BANK_RATIO = 0.4;

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
  return {
    guestId: makeGuestId(),
    bestDepth: 0,
    bestScore: 0,
    totalSamples: 0,
    runs: 0,
    codexSeen: [],
    settings: defaultSettings(),
    pearls: 0,
    metaTiers: {},
    badges: [],
    totalKills: 0,
    totalElites: 0,
    totalRelics: 0,
    totalPearlsEarned: 0,
  };
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
      pearls: num(parsed.pearls, 0),
      metaTiers: coerceTiers(parsed.metaTiers),
      badges: Array.isArray(parsed.badges) ? parsed.badges.filter((s) => typeof s === "string") : [],
      totalKills: num(parsed.totalKills, 0),
      totalElites: num(parsed.totalElites, 0),
      totalRelics: num(parsed.totalRelics, 0),
      totalPearlsEarned: num(parsed.totalPearlsEarned, 0),
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

function coerceTiers(v: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (v && typeof v === "object") {
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if (typeof val === "number" && Number.isFinite(val) && val > 0) out[k] = Math.floor(val);
    }
  }
  return out;
}

/** Bank a finished dive: grant pearls (partial on death, full on surface) + evaluate
 * badges + update records. Single source of truth for all meta writes. */
export function bankDive(
  data: SaveData,
  r: DiveResult
): { save: SaveData; pearlsEarned: number; newBadges: string[] } {
  const ratio = r.surfaced ? 1 : DEATH_BANK_RATIO + 0.05 * (data.metaTiers["salvage-training"] ?? 0);
  const pearlsEarned = Math.floor(r.samples * Math.min(1, ratio));
  let next: SaveData = {
    ...data,
    bestDepth: Math.max(data.bestDepth, r.depth),
    bestScore: Math.max(data.bestScore, r.score),
    totalSamples: data.totalSamples + r.samples,
    runs: data.runs + 1,
    pearls: data.pearls + pearlsEarned,
    totalPearlsEarned: data.totalPearlsEarned + pearlsEarned,
    totalKills: data.totalKills + r.kills,
    totalElites: data.totalElites + r.elites,
    totalRelics: data.totalRelics + r.relics,
    codexSeen: Array.from(new Set([...data.codexSeen, ...r.seen])),
  };
  const satisfied = evaluateBadges({
    bestDepth: next.bestDepth,
    bestScore: next.bestScore,
    totalKills: next.totalKills,
    totalElites: next.totalElites,
    totalRelics: next.totalRelics,
    runMaxedUpgrade: r.maxedUpgrade,
    runs: next.runs,
    totalPearlsEarned: next.totalPearlsEarned,
  });
  const newBadges = satisfied.filter((id) => !next.badges.includes(id));
  if (newBadges.length) next = { ...next, badges: Array.from(new Set([...next.badges, ...newBadges])) };
  save(next);
  return { save: next, pearlsEarned, newBadges };
}

/** Buy the next tier of a meta upgrade. Returns ok=false if unaffordable/maxed/gated. */
export function purchaseMeta(data: SaveData, id: string): { save: SaveData; ok: boolean } {
  const u = META_BY_ID[id];
  if (!u) return { save: data, ok: false };
  const tier = data.metaTiers[id] ?? 0;
  if (tier >= u.maxTier) return { save: data, ok: false };
  if (u.requires && (data.metaTiers[u.requires] ?? 0) < 1) return { save: data, ok: false };
  const cost = metaCost(u, tier);
  if (data.pearls < cost) return { save: data, ok: false };
  const next: SaveData = { ...data, pearls: data.pearls - cost, metaTiers: { ...data.metaTiers, [id]: tier + 1 } };
  save(next);
  return { save: next, ok: true };
}

export function saveSettings(data: SaveData, settings: Settings): SaveData {
  const next = { ...data, settings };
  save(next);
  return next;
}
