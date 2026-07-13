// The Cradle Guardian — the boss at the floor of the Descent Column. A single
// high-HP creature with a legible telegraph→fire rhythm and a second phase that
// opens below half health (faster bursts, spiral fire, summoned adds, eruptions).
// Built to reuse the existing Enemy shape + projectile/hazard systems, so it dies
// and takes damage through the normal pipeline; dive.ts drives it by reference.

import { Container, Graphics, Sprite } from "pixi.js";
import type { Enemy, EmitterSpec, Player, Vec2 } from "../core/types";
import { SPITTER_RADIAL } from "../content/emitters";
import { getGlowTexture } from "../engine/glow";
import { COLOR } from "../palette";
import type { SpitterView } from "../render/actors";

export const BOSS_TELEGRAPH = 0.9;
const HOVER = 240; // preferred distance it keeps from the player

export function makeBoss(pos: Vec2, hp: number): Enemy {
  return {
    alive: true,
    kind: "drifter",
    pos: { x: pos.x, y: pos.y },
    vel: { x: 0, y: 0 },
    radius: 46,
    hp,
    maxHp: hp,
    attackTimer: 2.4,
    telegraphTimer: 0,
    pendingSpec: null,
    strafeDir: 1,
    strafeTimer: 3,
    attackCount: 0,
    spinSeed: 0.3,
    flash: 0,
    elite: true,
    bulletCount: 22,
    speed: 42,
    lungeTimer: 0,
    contactDamage: 16,
  };
}

export function buildBossView(): SpitterView {
  const root = new Container();
  const body = new Graphics();
  // A dark bulbous mass with a ring of tendrils and a bright core "eye".
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const r = 34;
    const tip = 58;
    body.poly([Math.cos(a) * r, Math.sin(a) * r, Math.cos(a + 0.18) * tip, Math.sin(a + 0.18) * tip, Math.cos(a + 0.36) * r, Math.sin(a + 0.36) * r]).fill({ color: 0x2a1440, alpha: 0.95 });
  }
  body.circle(0, 0, 40).fill(0x160a26).stroke({ width: 3, color: 0x6a3fa0 });
  body.circle(0, 0, 26).fill(0x241038);
  body.circle(0, 0, 13).fill(COLOR.coralBright); // core / eye
  body.circle(0, 0, 6).fill(0xffe6c0);
  root.addChild(body);

  const glow = new Sprite(getGlowTexture());
  glow.anchor.set(0.5);
  glow.tint = 0xb85cff;
  glow.alpha = 0.5;
  glow.scale.set(360 / 128);
  return { root, glow, body };
}

export interface BossCtx {
  fire: (spec: EmitterSpec, pos: Vec2, base: number) => void;
  hazard: (x: number, y: number) => void;
  spawnAdd: (pos: Vec2) => void;
  hitPlayer: (dmg: number, at: Vec2) => void;
  bounds: { w: number; h: number };
}

const RADIAL: EmitterSpec = { ...SPITTER_RADIAL, telegraph: undefined };

/** Drives the guardian one sim step. `phase` is 1 (>=50% hp) or 2 (below). */
export function updateBoss(e: Enemy, dt: number, player: Player, ctx: BossCtx, phase: number): void {
  e.flash = Math.max(0, e.flash - dt);

  const dx = player.pos.x - e.pos.x;
  const dy = player.pos.y - e.pos.y;
  const dist = Math.hypot(dx, dy) || 1;
  const nx = dx / dist;
  const ny = dy / dist;

  // Slow hover: hold a ring around the player, drifting menacingly.
  e.strafeTimer -= dt;
  if (e.strafeTimer <= 0) {
    e.strafeDir *= -1;
    e.strafeTimer = 3;
  }
  let ax = 0;
  let ay = 0;
  if (dist > HOVER + 40) {
    ax += nx;
    ay += ny;
  } else if (dist < HOVER - 40) {
    ax -= nx;
    ay -= ny;
  }
  ax += -ny * e.strafeDir * 0.5;
  ay += nx * e.strafeDir * 0.5;
  const k = Math.min(1, dt * 2.5);
  e.vel.x += (ax * e.speed - e.vel.x) * k;
  e.vel.y += (ay * e.speed - e.vel.y) * k;
  const moveScale = e.telegraphTimer > 0 ? 0.2 : 1;
  e.pos.x += e.vel.x * dt * moveScale;
  e.pos.y += e.vel.y * dt * moveScale;
  const m = e.radius + 8;
  e.pos.x = Math.max(m, Math.min(ctx.bounds.w - m, e.pos.x));
  e.pos.y = Math.max(m, Math.min(ctx.bounds.h - m, e.pos.y));

  // Contact damage (with the player's own i-frames gating repeats in dive.ts).
  if (player.alive && dist < e.radius + player.radius) {
    ctx.hitPlayer(e.contactDamage, { x: player.pos.x, y: player.pos.y });
  }

  // Telegraph → fire cycle.
  if (e.telegraphTimer > 0) {
    e.telegraphTimer -= dt;
    if (e.telegraphTimer <= 0) {
      fireAttack(e, player, ctx, phase);
      e.attackCount++;
      e.attackTimer = phase >= 2 ? 1.5 : 2.4;
    }
    return;
  }
  e.attackTimer -= dt;
  if (e.attackTimer <= 0) {
    e.telegraphTimer = BOSS_TELEGRAPH;
    // Phase 2 pre-seeds eruptions around the player during the wind-up.
    if (phase >= 2) {
      for (let i = 0; i < 3; i++) {
        const a = e.spinSeed + (i / 3) * Math.PI * 2;
        ctx.hazard(player.pos.x + Math.cos(a) * 90, player.pos.y + Math.sin(a) * 90);
      }
    }
  }
}

function fireAttack(e: Enemy, player: Player, ctx: BossCtx, phase: number): void {
  const kind = e.attackCount % (phase >= 2 ? 3 : 2);
  const aimBase = Math.atan2(player.pos.y - e.pos.y, player.pos.x - e.pos.x);
  if (kind === 0) {
    // Wide radial wall.
    ctx.fire({ ...RADIAL, count: phase >= 2 ? 30 : 22, speed: 135, ttl: 4.2 }, e.pos, e.spinSeed);
  } else if (kind === 1) {
    // Two offset rings — a denser weave.
    ctx.fire({ ...RADIAL, count: 16, speed: 120, ttl: 4 }, e.pos, e.spinSeed);
    ctx.fire({ ...RADIAL, count: 16, speed: 175, ttl: 4 }, e.pos, e.spinSeed + Math.PI / 16);
  } else {
    // Phase 2: aimed spiral + summon two adds to pressure your position.
    ctx.fire({ ...RADIAL, count: 20, speed: 150, ttl: 4 }, e.pos, aimBase);
    ctx.fire({ ...RADIAL, count: 20, speed: 150, ttl: 4 }, e.pos, aimBase + 0.3);
    ctx.spawnAdd({ x: e.pos.x - 40, y: e.pos.y });
    ctx.spawnAdd({ x: e.pos.x + 40, y: e.pos.y });
  }
  e.spinSeed += 0.5;
}
