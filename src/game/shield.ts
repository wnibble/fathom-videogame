// Shield: a regenerating buffer absorbed before HP. Pure functions (mirrors dash.ts);
// only dive.ts calls them. Unlocked/scaled by the shield-emitter meta upgrade and the
// in-run Aegis Cell upgrade.

import type { Player } from "../core/types";

export interface ShieldParams {
  regenRate: number; // shield points / sec
  regenDelay: number; // sec after last hit before regen resumes
}

export function tickShield(p: Player, sp: ShieldParams, dt: number): void {
  if (p.shieldMax <= 0) return;
  p.shieldRegenT += dt;
  if (p.shieldRegenT >= sp.regenDelay && p.shield < p.shieldMax) {
    p.shield = Math.min(p.shieldMax, p.shield + sp.regenRate * dt);
  }
}

/** Absorb incoming damage with shield first. Returns HP damage + whether fully absorbed. */
export function absorb(p: Player, damage: number): { hpDamage: number; absorbed: boolean } {
  p.shieldRegenT = 0; // any hit resets the regen delay
  if (p.shieldMax <= 0 || p.shield <= 0) return { hpDamage: damage, absorbed: false };
  const taken = Math.min(p.shield, damage);
  p.shield -= taken;
  const overflow = damage - taken;
  return { hpDamage: overflow, absorbed: overflow <= 0 };
}
