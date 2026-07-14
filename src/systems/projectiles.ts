// Projectile system: one pooled bullet store shared by player + enemies, driven
// by EmitterSpec data. Player bullets can PIERCE (with a same-target double-hit
// guard) and hit destructible interactables; enemy bullets can be SLOWED by an
// upgrade. Bullets render in the world layer (readable, un-bloomed).

import { Container, Sprite } from "pixi.js";
import type { Bullet, EmitterSpec, Enemy, Faction, Player, Vec2 } from "../core/types";
import type { AssetStore } from "../engine/assets";

const CAP = 1400;

/** Anything a player bullet can damage (enemies + destructible interactables). */
export interface Damageable {
  pos: Vec2;
  radius: number;
  hp: number;
  alive: boolean;
}

export interface HitSink {
  onPlayerHit(damage: number, at: Vec2): void;
  onEnemyHit(enemy: Enemy, damage: number, at: Vec2): void;
  onEnemyKilled(enemy: Enemy): void;
  onDestructibleHit(d: Damageable, damage: number, at: Vec2): void;
  onDestructibleDestroyed(d: Damageable): void;
  onGraze(): void; // near-miss on an enemy bullet — charges the glow
}

const GRAZE_BAND = 16; // px beyond the collision radius that counts as a graze

export class Projectiles {
  readonly bullets: Bullet[] = [];
  private sprites: (Sprite | null)[] = [];
  private free: number[] = [];
  enemySlow = 0; // fraction; enemy bullet speed ×(1-this)
  /** Set per stratum: returns true when a point is inside solid cavern wall. */
  wallQuery: ((x: number, y: number) => boolean) | null = null;
  /** Set per stratum: outward wall normal at a point (for ricochets), or null. */
  wallNormal: ((x: number, y: number) => { x: number; y: number } | null) | null = null;
  private patternSeed = 0; // deterministic per-burst variation without an Rng

  constructor(private assets: AssetStore, private layer: Container) {
    for (let i = 0; i < CAP; i++) {
      this.bullets.push({
        active: false,
        pos: { x: 0, y: 0 },
        vel: { x: 0, y: 0 },
        radius: 4,
        ttl: 0,
        faction: "enemy",
        sprite: "aqua_pearl",
        tint: 0xffffff,
        damage: 10,
        pierce: 0,
        lastHit: null,
        grazed: false,
        homing: 0,
        bounces: 0,
      });
      this.sprites.push(null);
      this.free.push(i);
    }
  }

  get activeCount(): number {
    return CAP - this.free.length;
  }

  fireBurst(spec: EmitterSpec, origin: Vec2, baseAngle: number, faction: Faction): void {
    const n = Math.max(1, spec.count);
    const spread = spec.spread;
    const isFullRadial = spread >= Math.PI * 2 - 1e-3;
    const start = isFullRadial ? baseAngle : baseAngle - spread / 2;
    const step = n > 1 ? (isFullRadial ? spread / n : spread / (n - 1)) : 0;
    this.patternSeed = (this.patternSeed + 1) | 0;
    for (let i = 0; i < n; i++) {
      const a = start + step * i + (spec.arcOffset ?? 0);
      // Ring-with-gap: skip bullets inside the dodge lane (relative to base).
      if (spec.gapArc) {
        const rel = ((a - baseAngle - (spec.gapAt ?? 0)) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI;
        if (Math.abs(rel) < spec.gapArc / 2) continue;
      }
      // Wave walls: speed varies smoothly across the burst.
      let speedMul = 1;
      if (spec.speedSpread) speedMul = 1 + Math.sin((i / n) * Math.PI * 2 + this.patternSeed * 1.7) * spec.speedSpread;
      this.spawn(spec, origin.x, origin.y, a, faction, speedMul);
    }
  }

  private spawn(spec: EmitterSpec, x: number, y: number, angle: number, faction: Faction, speedMul = 1): void {
    const idx = this.free.pop();
    if (idx === undefined) return;
    const b = this.bullets[idx];
    const speed = (faction === "enemy" ? spec.speed * (1 - this.enemySlow) : spec.speed) * speedMul;
    b.active = true;
    b.pos.x = x;
    b.pos.y = y;
    b.vel.x = Math.cos(angle) * speed;
    b.vel.y = Math.sin(angle) * speed;
    b.radius = spec.bulletRadius;
    b.ttl = spec.ttl;
    b.faction = faction;
    b.sprite = spec.sprite;
    b.tint = spec.tint ?? 0xffffff;
    b.damage = spec.damage ?? 10;
    b.pierce = faction === "player" ? spec.pierce ?? 0 : 0;
    b.lastHit = null;
    b.grazed = false;
    b.homing = faction === "player" ? spec.homing ?? 0 : 0;
    b.bounces = faction === "player" ? spec.bounces ?? 0 : 0;

    let s = this.sprites[idx];
    if (!s) {
      s = this.assets.sprite(spec.sprite);
      this.sprites[idx] = s;
      this.layer.addChild(s);
    } else {
      s.texture = this.assets.texture(spec.sprite);
    }
    s.tint = b.tint;
    s.rotation = angle;
    s.visible = true;
    s.position.set(x, y);
  }

  private kill(idx: number): void {
    const b = this.bullets[idx];
    if (!b.active) return;
    b.active = false;
    const s = this.sprites[idx];
    if (s) s.visible = false;
    this.free.push(idx);
  }

  update(
    dt: number,
    player: Player,
    enemies: Enemy[],
    destructibles: Damageable[],
    sink: HitSink,
    worldBounds: { w: number; h: number }
  ): void {
    const pad = 80;
    for (let i = 0; i < CAP; i++) {
      const b = this.bullets[i];
      if (!b.active) continue;
      // Seeker steer: player bullets with homing curve toward the nearest enemy.
      if (b.homing > 0 && b.faction === "player") {
        let tx = 0;
        let ty = 0;
        let bestD2 = 360 * 360;
        for (const e of enemies) {
          if (!e.alive) continue;
          const dx = e.pos.x - b.pos.x;
          const dy = e.pos.y - b.pos.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < bestD2) {
            bestD2 = d2;
            tx = dx;
            ty = dy;
          }
        }
        if (tx !== 0 || ty !== 0) {
          const cur = Math.atan2(b.vel.y, b.vel.x);
          const want = Math.atan2(ty, tx);
          let d = want - cur;
          while (d > Math.PI) d -= Math.PI * 2;
          while (d < -Math.PI) d += Math.PI * 2;
          const turn = Math.max(-b.homing * dt, Math.min(b.homing * dt, d));
          const sp = Math.hypot(b.vel.x, b.vel.y);
          b.vel.x = Math.cos(cur + turn) * sp;
          b.vel.y = Math.sin(cur + turn) * sp;
        }
      }
      b.pos.x += b.vel.x * dt;
      b.pos.y += b.vel.y * dt;
      b.ttl -= dt;
      if (b.ttl <= 0 || b.pos.x < -pad || b.pos.y < -pad || b.pos.x > worldBounds.w + pad || b.pos.y > worldBounds.h + pad) {
        this.kill(i);
        continue;
      }
      // Cavern walls stop shots (both factions) — the barrier is real, and wall
      // lips become tactical cover. Rebound slugs ricochet off instead.
      if (this.wallQuery && this.wallQuery(b.pos.x, b.pos.y)) {
        const n = b.bounces > 0 && this.wallNormal ? this.wallNormal(b.pos.x, b.pos.y) : null;
        if (n) {
          b.bounces--;
          const dot = b.vel.x * n.x + b.vel.y * n.y;
          b.vel.x -= 2 * dot * n.x;
          b.vel.y -= 2 * dot * n.y;
          b.pos.x += n.x * 8; // step back into open water
          b.pos.y += n.y * 8;
          const s0 = this.sprites[i];
          if (s0) s0.rotation = Math.atan2(b.vel.y, b.vel.x);
        } else {
          this.kill(i);
          continue;
        }
      }

      if (b.faction === "enemy") {
        if (player.alive) {
          const dx = b.pos.x - player.pos.x;
          const dy = b.pos.y - player.pos.y;
          const d2 = dx * dx + dy * dy;
          const rr = b.radius + player.radius;
          if (player.invuln <= 0 && d2 <= rr * rr) {
            sink.onPlayerHit(b.damage, { x: b.pos.x, y: b.pos.y });
            this.kill(i);
            continue;
          }
          // Graze: a near-miss (once per bullet) charges the glow — dodging as agency.
          if (!b.grazed) {
            const gr = rr + GRAZE_BAND;
            if (d2 <= gr * gr) {
              b.grazed = true;
              sink.onGraze();
            }
          }
        }
      } else {
        let consumed = false;
        // Enemies (pierceable, with same-target guard)
        for (const e of enemies) {
          if (!e.alive || e === b.lastHit) continue;
          const dx = b.pos.x - e.pos.x;
          const dy = b.pos.y - e.pos.y;
          const rr = b.radius + e.radius;
          if (dx * dx + dy * dy <= rr * rr) {
            e.hp -= b.damage;
            sink.onEnemyHit(e, b.damage, { x: b.pos.x, y: b.pos.y });
            if (e.hp <= 0 && e.alive) {
              e.alive = false;
              sink.onEnemyKilled(e);
            }
            b.lastHit = e;
            if (b.pierce > 0) {
              b.pierce--;
            } else {
              consumed = true;
            }
            break;
          }
        }
        if (!consumed) {
          // Destructible interactables (no pierce — one bullet, one hit)
          for (const d of destructibles) {
            if (!d.alive) continue;
            const dx = b.pos.x - d.pos.x;
            const dy = b.pos.y - d.pos.y;
            const rr = b.radius + d.radius;
            if (dx * dx + dy * dy <= rr * rr) {
              d.hp -= b.damage;
              sink.onDestructibleHit(d, b.damage, { x: b.pos.x, y: b.pos.y });
              if (d.hp <= 0 && d.alive) {
                d.alive = false;
                sink.onDestructibleDestroyed(d);
              }
              consumed = true;
              break;
            }
          }
        }
        if (consumed) {
          this.kill(i);
          continue;
        }
      }

      const s = this.sprites[i];
      if (s) s.position.set(b.pos.x, b.pos.y);
    }
  }

  /** Bio-pulse: destroy enemy bullets within radius r of (x,y). Returns count. */
  popRadius(x: number, y: number, r: number): number {
    const r2 = r * r;
    let n = 0;
    for (let i = 0; i < CAP; i++) {
      const b = this.bullets[i];
      if (!b.active || b.faction !== "enemy") continue;
      const dx = b.pos.x - x;
      const dy = b.pos.y - y;
      if (dx * dx + dy * dy <= r2) {
        this.kill(i);
        n++;
      }
    }
    return n;
  }

  clear(): void {
    for (let i = 0; i < CAP; i++) this.kill(i);
  }
  destroy(): void {
    for (let i = 0; i < CAP; i++) {
      const s = this.sprites[i];
      if (s) {
        s.parent?.removeChild(s);
        s.destroy();
        this.sprites[i] = null;
      }
    }
  }
}
