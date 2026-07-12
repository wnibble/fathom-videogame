// The meta seam: turns purchased permanent-upgrade tiers into a MetaState that
// seeds each fresh run stronger. Keeps progression.ts unaware of persistence.

import type { PlayerStats } from "./progression";
import { META_UPGRADES } from "../content/meta_upgrades";

export interface MetaState {
  bonusMaxHp: number;
  damageMultAdd: number;
  fireRateMultAdd: number;
  moveSpeedMultAdd: number;
  magnetBonus: number;
  dashCdMult: number;
  startingLevelUps: number;
  shieldCapacity: number;
  shieldRegenRate: number;
  shieldRegenDelay: number;
}

export function freshMeta(): MetaState {
  return {
    bonusMaxHp: 0,
    damageMultAdd: 0,
    fireRateMultAdd: 0,
    moveSpeedMultAdd: 0,
    magnetBonus: 0,
    dashCdMult: 1,
    startingLevelUps: 0,
    shieldCapacity: 0,
    shieldRegenRate: 8,
    shieldRegenDelay: 3.5,
  };
}

/** Fold a fresh MetaState with every purchased tier (apply receives the final tier). */
export function deriveMeta(tiers: Record<string, number>): MetaState {
  const m = freshMeta();
  for (const u of META_UPGRADES) {
    const t = tiers[u.id] ?? 0;
    if (t > 0) u.apply(m, t);
  }
  return m;
}

/** Bias a fresh PlayerStats by the meta layer (HP + shield seed applied in dive.ts). */
export function applyMetaToStats(s: PlayerStats, m: MetaState): void {
  s.damageMult += m.damageMultAdd;
  s.fireRateMult += m.fireRateMultAdd;
  s.moveSpeedMult += m.moveSpeedMultAdd;
  s.magnetRadius += m.magnetBonus;
  s.dashCooldownMult *= m.dashCdMult;
}
