// Dash/boost: a snappy directional impulse with i-frames + cooldown. Reuses the
// player's existing invuln window. Mechanical, so it stays enabled under
// reduced-motion (only the screen-shake/juice is suppressed elsewhere).

import type { Player, Vec2 } from "../core/types";

export interface DashState {
  cooldown: number;
  active: number;
  postHaste: number; // sec of fire-rate haste remaining (Adrenal Surge)
}

export const DASH_SPEED = 620;
export const DASH_TIME = 0.16;
export const DASH_IFRAMES = 0.3;
export const DASH_COOLDOWN = 1.15;

export function freshDash(): DashState {
  return { cooldown: 0, active: 0, postHaste: 0 };
}

/** Attempt a dash in `dir` (falls back to `aimDir` if no move intent). Returns true if it fired. */
export function tryDash(player: Player, dash: DashState, dir: Vec2, aimDir: Vec2, cooldownMult: number, postHasteAmount: number): boolean {
  if (dash.cooldown > 0 || !player.alive) return false;
  let dx = dir.x;
  let dy = dir.y;
  if (Math.hypot(dx, dy) < 0.1) {
    dx = aimDir.x;
    dy = aimDir.y;
  }
  const len = Math.hypot(dx, dy) || 1;
  player.vel.x += (dx / len) * DASH_SPEED;
  player.vel.y += (dy / len) * DASH_SPEED;
  dash.active = DASH_TIME;
  player.invuln = Math.max(player.invuln, DASH_IFRAMES);
  dash.cooldown = DASH_COOLDOWN * cooldownMult;
  if (postHasteAmount > 0) dash.postHaste = 2;
  return true;
}

export function tickDash(dash: DashState, dt: number): void {
  dash.cooldown = Math.max(0, dash.cooldown - dt);
  dash.active = Math.max(0, dash.active - dt);
  dash.postHaste = Math.max(0, dash.postHaste - dt);
}
