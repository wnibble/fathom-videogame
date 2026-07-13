// Achievement/badge catalog — milestones evaluated at bank time (dive end). Pure data.

export interface BadgeCtx {
  bestDepth: number;
  bestScore: number;
  totalKills: number;
  totalElites: number;
  totalRelics: number;
  runMaxedUpgrade: boolean;
  runs: number;
  totalPearlsEarned: number;
  cradleCleared: boolean;
}
export interface Badge {
  id: string;
  name: string;
  icon: string;
  desc: string;
  test(c: BadgeCtx): boolean;
}

export const BADGES: Badge[] = [
  { id: "first-blood", name: "First Blood", icon: "☠", desc: "Kill your first creature", test: (c) => c.totalKills >= 1 },
  { id: "depth-100", name: "The Twilight", icon: "▽", desc: "Reach 100 m", test: (c) => c.bestDepth >= 100 },
  { id: "depth-250", name: "Into the Dark", icon: "▼", desc: "Reach 250 m", test: (c) => c.bestDepth >= 250 },
  { id: "depth-500", name: "Abyssward", icon: "⧫", desc: "Reach 500 m", test: (c) => c.bestDepth >= 500 },
  { id: "centurion", name: "Centurion", icon: "✦", desc: "100 lifetime kills", test: (c) => c.totalKills >= 100 },
  { id: "slayer", name: "Leviathan's Bane", icon: "✦✦", desc: "1000 lifetime kills", test: (c) => c.totalKills >= 1000 },
  { id: "first-relic", name: "Relic Hunter", icon: "◈", desc: "Claim a hidden relic", test: (c) => c.totalRelics >= 1 },
  { id: "first-elite", name: "Elite Hunter", icon: "★", desc: "Kill an elite", test: (c) => c.totalElites >= 1 },
  { id: "score-10k", name: "Bright Spark", icon: "✸", desc: "Score 10,000", test: (c) => c.bestScore >= 10000 },
  { id: "score-50k", name: "Supernova", icon: "✸✸", desc: "Score 50,000", test: (c) => c.bestScore >= 50000 },
  { id: "veteran", name: "Veteran Diver", icon: "⚓", desc: "Complete 25 dives", test: (c) => c.runs >= 25 },
  { id: "maxed-build", name: "Perfected", icon: "⬢", desc: "Max any upgrade in a run", test: (c) => c.runMaxedUpgrade },
  { id: "pearl-hoard", name: "Pearl Diver", icon: "⬤", desc: "Earn 500 lifetime pearls", test: (c) => c.totalPearlsEarned >= 500 },
  { id: "the-cradle", name: "Cradle-Breaker", icon: "❂", desc: "Defeat the guardian of the Cradle", test: (c) => c.cradleCleared },
];
export const BADGE_BY_ID: Record<string, Badge> = Object.fromEntries(BADGES.map((b) => [b.id, b]));

/** Ids currently satisfied (caller unions the new ones into save.badges). */
export function evaluateBadges(c: BadgeCtx): string[] {
  return BADGES.filter((b) => b.test(c)).map((b) => b.id);
}
