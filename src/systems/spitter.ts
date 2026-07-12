// Spitter AI: maintains a preferred range, strafes, and attacks in a strict
// telegraph→fire cycle. Its behavior must be legible on its own (Part 5 §7):
// it backs off when you close, circles you, and ALWAYS winds up before firing.
//
// Deterministic: no Math.random — strafe flips on a timer, radial offset uses a
// per-enemy spinSeed, attack choice alternates via attackCount.

import type { Enemy, Player, Vec2 } from "../core/types";
import { SPITTER_RADIAL, SPITTER_AIMED } from "../content/emitters";
import type { Projectiles } from "./projectiles";

// Ranges kept inside the ZOOM-2 viewport (~640×360 → ~180px half-height) so the
// Spitter AND its wind-up telegraph stay on screen — the whole point of Pillar 1.
const DESIRED = 155;
const TOO_CLOSE = 95;
const ENGAGE = 300; // only telegraph/fire within this range (keeps it on-screen)

export interface SpitterOpts {
  elite?: boolean;
  hp?: number;
  speed?: number;
  bulletCount?: number;
}

function angleTo(from: Vec2, to: Vec2): number {
  return Math.atan2(to.y - from.y, to.x - from.x);
}

export function makeSpitter(pos: Vec2, opts: SpitterOpts = {}): Enemy {
  const elite = opts.elite ?? false;
  const hp = opts.hp ?? (elite ? 180 : 60);
  return {
    alive: true,
    kind: "spitter",
    pos: { x: pos.x, y: pos.y },
    vel: { x: 0, y: 0 },
    radius: elite ? 18 : 13,
    hp,
    maxHp: hp,
    attackTimer: 1.2,
    telegraphTimer: 0,
    pendingSpec: null,
    strafeDir: 1,
    strafeTimer: 2.2,
    attackCount: 0,
    spinSeed: (pos.x * 0.013 + pos.y * 0.017) % (Math.PI * 2),
    flash: 0,
    elite,
    bulletCount: opts.bulletCount ?? (elite ? 18 : 14),
    speed: opts.speed ?? (elite ? 66 : 78),
    lungeTimer: 0,
    contactDamage: 0,
  };
}

export function updateSpitter(
  e: Enemy,
  dt: number,
  player: Player,
  proj: Projectiles,
  bounds: { w: number; h: number }
): void {
  e.flash = Math.max(0, e.flash - dt);

  const dx = player.pos.x - e.pos.x;
  const dy = player.pos.y - e.pos.y;
  const dist = Math.hypot(dx, dy) || 1;
  const nx = dx / dist;
  const ny = dy / dist;

  // Range-keeping + strafe
  e.strafeTimer -= dt;
  if (e.strafeTimer <= 0) {
    e.strafeDir *= -1;
    e.strafeTimer = 2.2;
  }
  let ax = 0;
  let ay = 0;
  if (dist > DESIRED) {
    ax += nx;
    ay += ny;
  } else if (dist < TOO_CLOSE) {
    ax -= nx;
    ay -= ny;
  }
  ax += -ny * e.strafeDir * 0.7;
  ay += nx * e.strafeDir * 0.7;

  const k = Math.min(1, dt * 4);
  e.vel.x += (ax * e.speed - e.vel.x) * k;
  e.vel.y += (ay * e.speed - e.vel.y) * k;
  // Hold still while telegraphing so the wind-up reads clearly.
  const moveScale = e.telegraphTimer > 0 ? 0.15 : 1;
  e.pos.x += e.vel.x * dt * moveScale;
  e.pos.y += e.vel.y * dt * moveScale;

  // Keep on the field
  const m = e.radius + 8;
  e.pos.x = Math.max(m, Math.min(bounds.w - m, e.pos.x));
  e.pos.y = Math.max(m, Math.min(bounds.h - m, e.pos.y));

  // Attack cycle — GATED on proximity so a wind-up + shot can never happen while
  // the Spitter (and its telegraph) are off-screen (Pillar 1: readable danger).
  if (e.telegraphTimer > 0) {
    if (dist > ENGAGE * 1.35) {
      // Player fled mid-wind-up — abort rather than fire blind off-screen.
      e.telegraphTimer = 0;
      e.pendingSpec = null;
      e.attackTimer = 0.8;
    } else {
      e.telegraphTimer -= dt;
      if (e.telegraphTimer <= 0 && e.pendingSpec) {
        const spec = e.pendingSpec;
        const base = spec.aim === "aimed" ? angleTo(e.pos, player.pos) : e.spinSeed;
        // radial burst size scales with the enemy (depth tier / elite)
        const fired = spec.aim === "radial" ? { ...spec, count: e.bulletCount } : spec;
        proj.fireBurst(fired, e.pos, base, "enemy");
        e.spinSeed += 0.6;
        e.pendingSpec = null;
        e.attackCount++;
        e.attackTimer = 1.7;
      }
    }
  } else {
    e.attackTimer -= dt;
    if (e.attackTimer <= 0 && dist < ENGAGE) {
      // Alternate radial / aimed for variety and readability.
      const spec = e.attackCount % 2 === 0 ? SPITTER_RADIAL : SPITTER_AIMED;
      e.pendingSpec = spec;
      e.telegraphTimer = spec.telegraph!.time;
    }
  }
}
