// The upgrade catalog — pure data (like emitters.ts). Each upgrade mutates
// PlayerStats; the weapon is re-derived after. Offense=amber, defense=mint,
// utility=aqua (colorblind-safe: shape+text too, never color alone).

import type { PlayerStats } from "../game/progression";

export type UpgradeCategory = "offense" | "defense" | "utility";

export interface Upgrade {
  id: string;
  name: string;
  desc: string;
  category: UpgradeCategory;
  weight: number; // lower = rarer
  maxStacks: number;
  apply(s: PlayerStats): void;
}

export const UPGRADES: Upgrade[] = [
  { id: "dmg", name: "Pressure Rounds", desc: "+25% damage", category: "offense", weight: 10, maxStacks: 6, apply: (s) => (s.damageMult += 0.25) },
  { id: "firerate", name: "Rapid Cycler", desc: "+18% fire rate", category: "offense", weight: 10, maxStacks: 6, apply: (s) => (s.fireRateMult += 0.18) },
  { id: "multishot", name: "Split Beam", desc: "+1 projectile", category: "offense", weight: 5, maxStacks: 4, apply: (s) => (s.extraProjectiles += 1) },
  { id: "maxhp", name: "Reinforced Hull", desc: "+25 max HP & heal", category: "defense", weight: 8, maxStacks: 6, apply: (s) => (s.maxHpBonus += 25) },
  { id: "movespeed", name: "Thruster Tune", desc: "+12% move speed", category: "utility", weight: 8, maxStacks: 5, apply: (s) => (s.moveSpeedMult += 0.12) },
  { id: "dashcd", name: "Kinetic Vents", desc: "-18% dash cooldown", category: "utility", weight: 7, maxStacks: 4, apply: (s) => (s.dashCooldownMult *= 0.82) },
  { id: "bulletsize", name: "Focusing Lens", desc: "+28% bullet size", category: "offense", weight: 7, maxStacks: 4, apply: (s) => (s.bulletRadiusMult += 0.28) },
  { id: "magnet", name: "Sample Magnet", desc: "+55 pickup range", category: "utility", weight: 8, maxStacks: 4, apply: (s) => (s.magnetRadius += 55) },
  { id: "pierce", name: "Piercing Slug", desc: "bullets pierce +1 enemy", category: "offense", weight: 4, maxStacks: 3, apply: (s) => (s.pierce += 1) },
  { id: "lifesteal", name: "Biolum Leech", desc: "+4% lifesteal", category: "defense", weight: 3, maxStacks: 3, apply: (s) => (s.lifestealFrac += 0.04) },
  { id: "slow", name: "Predator's Calm", desc: "slow enemy bullets", category: "defense", weight: 4, maxStacks: 3, apply: (s) => (s.enemyBulletSlow = Math.min(0.3, s.enemyBulletSlow + 0.08)) },
  { id: "range", name: "Long Barrel", desc: "+range & bullet speed", category: "offense", weight: 7, maxStacks: 4, apply: (s) => { s.projSpeedMult += 0.2; s.ttlMult += 0.15; } },
  { id: "haste", name: "Adrenal Surge", desc: "fire faster after a dash", category: "utility", weight: 5, maxStacks: 3, apply: (s) => (s.postDashHaste += 0.4) },
  { id: "regen", name: "Symbiont Bloom", desc: "slowly regenerate HP", category: "defense", weight: 5, maxStacks: 3, apply: (s) => (s.regenPerSec += 1.2) },
  { id: "shieldcap", name: "Aegis Cell", desc: "+30 shield capacity", category: "defense", weight: 5, maxStacks: 3, apply: (s) => (s.shieldCapBonus += 30) },
  { id: "shieldregen", name: "Aegis Flow", desc: "+3 shield regen/sec", category: "defense", weight: 4, maxStacks: 3, apply: (s) => (s.shieldRegenBonus += 3) },
  // ---- shot-pattern upgrades (pass: new shot patterns) ----
  { id: "seeker", name: "Seeker Filaments", desc: "shots curve toward prey", category: "offense", weight: 4, maxStacks: 2, apply: (s) => (s.homing += 2.4) },
  { id: "rebound", name: "Rebound Slugs", desc: "shots ricochet off walls +1", category: "offense", weight: 4, maxStacks: 2, apply: (s) => (s.bounces += 1) },
  { id: "rearguard", name: "Rear Guard", desc: "fire a half-power shot backward", category: "defense", weight: 4, maxStacks: 2, apply: (s) => (s.rearShots += 1) },
];

export const UPGRADE_BY_ID: Record<string, Upgrade> = Object.fromEntries(UPGRADES.map((u) => [u.id, u]));
