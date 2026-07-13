// Enemy #3 — the Drifter. A slow AREA-DENIER: it doesn't shoot or lunge, it
// patrols and drops fading glow-spore mines (Hazards) that deny the space it
// crossed. A third verb — zone control — forcing you to reposition rather than
// kite (Spitter) or dodge a lunge (Darter). Deterministic.

import type { Enemy, Player, Vec2 } from "../core/types";

const SPEED = 58;
const MINE_INTERVAL = 2.1;

export function makeDrifter(pos: Vec2, opts: { elite?: boolean; hp?: number; speed?: number } = {}): Enemy {
  const elite = opts.elite ?? false;
  const hp = opts.hp ?? (elite ? 120 : 42);
  return {
    alive: true,
    kind: "drifter",
    pos: { x: pos.x, y: pos.y },
    vel: { x: 0, y: 0 },
    radius: elite ? 16 : 12,
    hp,
    maxHp: hp,
    attackTimer: 1.4, // time to next mine
    telegraphTimer: 0,
    pendingSpec: null,
    strafeDir: 1,
    strafeTimer: 2.6,
    attackCount: 0,
    spinSeed: 0,
    flash: 0,
    elite,
    bulletCount: 0,
    speed: opts.speed ?? (elite ? SPEED * 1.15 : SPEED),
    lungeTimer: 0,
    contactDamage: 0, // the mines do the damage, not the body
  };
}

/** `lay(x,y)` spawns a spore-mine hazard at the drifter's wake. */
export function updateDrifter(e: Enemy, dt: number, player: Player, bounds: { w: number; h: number }, lay: (x: number, y: number) => void): void {
  e.flash = Math.max(0, e.flash - dt);
  const dx = player.pos.x - e.pos.x;
  const dy = player.pos.y - e.pos.y;
  const dist = Math.hypot(dx, dy) || 1;
  const nx = dx / dist;
  const ny = dy / dist;

  // Drift toward a mid orbit around the player with a slow weave.
  e.strafeTimer -= dt;
  if (e.strafeTimer <= 0) {
    e.strafeDir *= -1;
    e.strafeTimer = 2.6;
  }
  const desire = 240;
  const radial = dist > desire ? 1 : dist < desire - 90 ? -1 : 0;
  const ax = nx * radial * 0.7 - ny * e.strafeDir * 0.7;
  const ay = ny * radial * 0.7 + nx * e.strafeDir * 0.7;
  const k = Math.min(1, dt * 2.5);
  e.vel.x += (ax * e.speed - e.vel.x) * k;
  e.vel.y += (ay * e.speed - e.vel.y) * k;
  e.pos.x += e.vel.x * dt;
  e.pos.y += e.vel.y * dt;

  const m = e.radius + 6;
  e.pos.x = Math.max(m, Math.min(bounds.w - m, e.pos.x));
  e.pos.y = Math.max(m, Math.min(bounds.h - m, e.pos.y));

  // Lay a mine in its wake on a steady cadence.
  e.attackTimer -= dt;
  if (e.attackTimer <= 0) {
    e.attackTimer = MINE_INTERVAL;
    e.attackCount++;
    lay(e.pos.x, e.pos.y);
  }
}
