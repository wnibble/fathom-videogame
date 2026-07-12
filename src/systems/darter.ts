// Enemy #2 — the Darter. A distinct verb from the Spitter: it doesn't shoot, it
// LUNGES. It stalks, telegraphs a wind-up (freezes + recoils), then dashes fast at
// where you are — punishing standing still and rewarding a reactive dodge/dash.
// Contact during the lunge hurts. Deterministic (no Math.random in sim).

import type { Enemy, Player, Vec2 } from "../core/types";

const STALK_SPEED = 96;
const LUNGE_SPEED = 560;
const LUNGE_TIME = 0.32;
const WINDUP = 0.55;
const LUNGE_RANGE = 260; // starts a lunge when within this
const RECOVER = 1.0;

export function makeDarter(pos: Vec2, opts: { elite?: boolean; hp?: number; speed?: number } = {}): Enemy {
  const elite = opts.elite ?? false;
  const hp = opts.hp ?? (elite ? 90 : 32);
  return {
    alive: true,
    kind: "darter",
    pos: { x: pos.x, y: pos.y },
    vel: { x: 0, y: 0 },
    radius: elite ? 15 : 11,
    hp,
    maxHp: hp,
    attackTimer: 0.8,
    telegraphTimer: 0,
    pendingSpec: null,
    strafeDir: 1,
    strafeTimer: 1.6,
    attackCount: 0,
    spinSeed: 0,
    flash: 0,
    elite,
    bulletCount: 0,
    speed: opts.speed ?? (elite ? STALK_SPEED * 1.2 : STALK_SPEED),
    lungeTimer: 0,
    contactDamage: elite ? 18 : 12,
  };
}

export function updateDarter(e: Enemy, dt: number, player: Player, bounds: { w: number; h: number }): void {
  e.flash = Math.max(0, e.flash - dt);
  const dx = player.pos.x - e.pos.x;
  const dy = player.pos.y - e.pos.y;
  const dist = Math.hypot(dx, dy) || 1;
  const nx = dx / dist;
  const ny = dy / dist;

  if (e.lungeTimer > 0) {
    // Committed lunge — fly along the locked velocity, decelerating.
    e.lungeTimer -= dt;
    e.pos.x += e.vel.x * dt;
    e.pos.y += e.vel.y * dt;
    e.vel.x *= 1 / (1 + 2 * dt);
    e.vel.y *= 1 / (1 + 2 * dt);
  } else if (e.telegraphTimer > 0) {
    // Wind-up — freeze + slight recoil away (a clear tell), face the player.
    e.telegraphTimer -= dt;
    e.pos.x -= nx * 22 * dt;
    e.pos.y -= ny * 22 * dt;
    if (e.telegraphTimer <= 0) {
      // Fire the lunge toward the player's CURRENT position (readable, dodgeable).
      e.vel.x = nx * LUNGE_SPEED;
      e.vel.y = ny * LUNGE_SPEED;
      e.lungeTimer = LUNGE_TIME;
      e.attackTimer = RECOVER;
      e.attackCount++;
    }
  } else {
    // Stalk — approach with a little weave.
    e.strafeTimer -= dt;
    if (e.strafeTimer <= 0) {
      e.strafeDir *= -1;
      e.strafeTimer = 1.6;
    }
    const ax = nx + -ny * e.strafeDir * 0.5;
    const ay = ny + nx * e.strafeDir * 0.5;
    const k = Math.min(1, dt * 3);
    e.vel.x += (ax * e.speed - e.vel.x) * k;
    e.vel.y += (ay * e.speed - e.vel.y) * k;
    e.pos.x += e.vel.x * dt;
    e.pos.y += e.vel.y * dt;
    e.attackTimer -= dt;
    if (e.attackTimer <= 0 && dist < LUNGE_RANGE) e.telegraphTimer = WINDUP;
  }

  const m = e.radius + 6;
  e.pos.x = Math.max(m, Math.min(bounds.w - m, e.pos.x));
  e.pos.y = Math.max(m, Math.min(bounds.h - m, e.pos.y));
}
