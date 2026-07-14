// Spitter AI: maintains a preferred range, strafes, and attacks in a strict
// telegraph→fire cycle. Its behavior must be legible on its own (Part 5 §7):
// it backs off when you close, circles you, and ALWAYS winds up before firing.
//
// Deterministic: no Math.random — strafe flips on a timer, radial offset uses a
// per-enemy spinSeed, attack choice alternates via attackCount.

import type { Enemy, EmitterSpec, Player, Vec2 } from "../core/types";
import { SPITTER_RADIAL, SPITTER_AIMED, SPITTER_GAP_RING, SPITTER_WAVE, SPITTER_CROSS, SPITTER_SPIRAL_SHOT } from "../content/emitters";
import type { Projectiles } from "./projectiles";

/** Advance a sequential volley (spiral/stream) — shared by spitter + boss. */
export function tickVolley(e: Enemy, dt: number, fire: (spec: EmitterSpec, pos: Vec2, base: number) => void): boolean {
  if (!e.volley) return false;
  const v = e.volley;
  v.timer -= dt;
  while (v.timer <= 0 && v.shotsLeft > 0) {
    fire(v.spec, e.pos, v.base);
    v.base += v.step;
    v.shotsLeft--;
    v.timer += v.interval;
  }
  if (v.shotsLeft <= 0) e.volley = null;
  return true;
}

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

  // Sequential volley in flight (spiral stream) — keep releasing it.
  if (tickVolley(e, dt, (spec, pos, base) => proj.fireBurst(spec, pos, base, "enemy"))) return;

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
        if (spec === SPITTER_SPIRAL_SHOT) {
          // Fire hose: sweep an arc toward-then-past the player over ~0.9s.
          e.volley = { spec, shotsLeft: 9, interval: 0.1, timer: 0, base: angleTo(e.pos, player.pos) - 0.9 * e.strafeDir, step: 0.22 * e.strafeDir };
        } else if (spec === SPITTER_CROSS) {
          // Four tight prongs at 90° — wide lanes between, rotated by spinSeed.
          for (let k = 0; k < 4; k++) proj.fireBurst({ ...spec, count: 3, spread: 0.2, gapArc: 0 }, e.pos, e.spinSeed + (k * Math.PI) / 2, "enemy");
        } else {
          // radial burst size scales with the enemy (depth tier / elite)
          const fired = spec.aim === "radial" && !spec.gapArc ? { ...spec, count: e.bulletCount } : spec;
          proj.fireBurst(fired, e.pos, base, "enemy");
        }
        e.spinSeed += 0.6;
        e.pendingSpec = null;
        e.attackCount++;
        e.attackTimer = 1.7;
      }
    }
  } else {
    e.attackTimer -= dt;
    if (e.attackTimer <= 0 && dist < ENGAGE) {
      // Pattern table (pass: new shot patterns) — elites get the whole songbook;
      // common spitters rotate a lighter set. Every pattern telegraphs.
      const table = e.elite
        ? [SPITTER_GAP_RING, SPITTER_SPIRAL_SHOT, SPITTER_WAVE, SPITTER_CROSS, SPITTER_AIMED]
        : [SPITTER_RADIAL, SPITTER_WAVE, SPITTER_GAP_RING, SPITTER_AIMED];
      const spec = table[e.attackCount % table.length];
      e.pendingSpec = spec;
      e.telegraphTimer = spec.telegraph!.time;
    }
  }
}
