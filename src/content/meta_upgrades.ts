// Permanent (meta) upgrade catalog — bought at the Surface Station with pearls,
// persists across runs, seeds each fresh dive stronger. Pure data.

import type { MetaState } from "../game/meta";

export type MetaCategory = "offense" | "defense" | "utility";

export interface MetaUpgrade {
  id: string;
  name: string;
  desc: string;
  icon: string;
  category: MetaCategory;
  maxTier: number;
  baseCost: number;
  growth: number;
  requires?: string;
  apply(m: MetaState, tier: number): void; // tier = purchased count (final)
}

/** Cost of the NEXT tier given the current owned tier. */
export function metaCost(u: MetaUpgrade, currentTier: number): number {
  return Math.round(u.baseCost * Math.pow(u.growth, currentTier));
}

export const META_UPGRADES: MetaUpgrade[] = [
  { id: "reinforced-hull", name: "Reinforced Hull", desc: "+20 base max HP / tier", icon: "♥", category: "defense", maxTier: 5, baseCost: 40, growth: 1.5, apply: (m, t) => (m.bonusMaxHp += 20 * t) },
  { id: "honed-barrel", name: "Honed Barrel", desc: "+8% base damage / tier", icon: "✦", category: "offense", maxTier: 5, baseCost: 50, growth: 1.5, apply: (m, t) => (m.damageMultAdd += 0.08 * t) },
  { id: "rapid-coils", name: "Rapid Coils", desc: "+6% base fire rate / tier", icon: "≋", category: "offense", maxTier: 5, baseCost: 50, growth: 1.5, apply: (m, t) => (m.fireRateMultAdd += 0.06 * t) },
  { id: "hydrojets", name: "Hydrojets", desc: "+5% base move speed / tier", icon: "»", category: "utility", maxTier: 4, baseCost: 35, growth: 1.55, apply: (m, t) => (m.moveSpeedMultAdd += 0.05 * t) },
  { id: "shield-emitter", name: "Shield Emitter", desc: "unlock shield; +30 cap, +25/tier", icon: "◇", category: "defense", maxTier: 4, baseCost: 80, growth: 1.55, apply: (m, t) => (m.shieldCapacity += 30 + 25 * (t - 1)) },
  { id: "shield-dynamo", name: "Shield Dynamo", desc: "faster shield regen (needs Emitter)", icon: "⟳", category: "defense", maxTier: 3, baseCost: 60, growth: 1.7, requires: "shield-emitter", apply: (m, t) => { m.shieldRegenRate += 4 * t; m.shieldRegenDelay = Math.max(1.2, 3.5 - 0.6 * t); } },
  { id: "lure-field", name: "Lure Field", desc: "+18 pickup magnet / tier", icon: "◎", category: "utility", maxTier: 3, baseCost: 30, growth: 1.6, apply: (m, t) => (m.magnetBonus += 18 * t) },
  { id: "vent-tuning", name: "Vent Tuning", desc: "-8% base dash cooldown / tier", icon: "✸", category: "utility", maxTier: 3, baseCost: 45, growth: 1.6, apply: (m, t) => (m.dashCdMult = Math.pow(0.92, t)) },
  { id: "dive-cache", name: "Dive Cache", desc: "+1 starting upgrade pick / tier", icon: "▣", category: "utility", maxTier: 3, baseCost: 100, growth: 1.8, apply: (m, t) => (m.startingLevelUps += t) },
  { id: "salvage-training", name: "Salvage Training", desc: "+5% death-bank ratio / tier", icon: "◈", category: "defense", maxTier: 3, baseCost: 80, growth: 1.75, apply: () => {} },
];

export const META_BY_ID: Record<string, MetaUpgrade> = Object.fromEntries(META_UPGRADES.map((u) => [u.id, u]));
