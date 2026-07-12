// Projectile system: one pooled bullet store shared by player + enemies, driven
// entirely by EmitterSpec data. Bullets render in the WORLD layer with normal
// blend so their colors stay true and readable (pillar 1) — the light layer is
// for glows/telegraphs, not the danger itself.
//
// Collision is direct circle-circle: one player vs N enemy-bullets, and player-
// bullets vs a handful of enemies — trivial at slice scale. A spatial hash is a
// documented pass-2 optimization once enemy density climbs.

import { Container, Sprite } from "pixi.js";
import type { Bullet, EmitterSpec, Enemy, Faction, Player, Vec2 } from "../core/types";
import type { AssetStore } from "../engine/assets";

const CAP = 1200;

export interface HitSink {
  onPlayerHit(damage: number, at: Vec2): void;
  onEnemyHit(enemy: Enemy, damage: number, at: Vec2): void;
  onEnemyKilled(enemy: Enemy): void;
}

export class Projectiles {
  readonly bullets: Bullet[] = [];
  private sprites: (Sprite | null)[] = [];
  private free: number[] = [];

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
      });
      this.sprites.push(null);
      this.free.push(i);
    }
  }

  get activeCount(): number {
    return CAP - this.free.length;
  }

  /** Fire one burst of `spec` from origin, oriented by baseAngle (radians). */
  fireBurst(spec: EmitterSpec, origin: Vec2, baseAngle: number, faction: Faction): void {
    const n = Math.max(1, spec.count);
    const spread = spec.spread;
    // Center the fan on baseAngle. For a full radial, distribute evenly around.
    const isFullRadial = spread >= Math.PI * 2 - 1e-3;
    const start = isFullRadial ? baseAngle : baseAngle - spread / 2;
    const step = n > 1 ? (isFullRadial ? spread / n : spread / (n - 1)) : 0;
    for (let i = 0; i < n; i++) {
      const a = start + step * i + (spec.arcOffset ?? 0);
      this.spawn(spec, origin.x, origin.y, a, faction);
    }
  }

  private spawn(spec: EmitterSpec, x: number, y: number, angle: number, faction: Faction): void {
    const idx = this.free.pop();
    if (idx === undefined) return; // pool exhausted — drop (never allocate mid-frame)
    const b = this.bullets[idx];
    b.active = true;
    b.pos.x = x;
    b.pos.y = y;
    b.vel.x = Math.cos(angle) * spec.speed;
    b.vel.y = Math.sin(angle) * spec.speed;
    b.radius = spec.bulletRadius;
    b.ttl = spec.ttl;
    b.faction = faction;
    b.sprite = spec.sprite;
    b.tint = spec.tint ?? 0xffffff;
    b.damage = spec.damage ?? 10;

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

  update(dt: number, player: Player, enemies: Enemy[], sink: HitSink, worldBounds: { w: number; h: number }): void {
    const pad = 64;
    for (let i = 0; i < CAP; i++) {
      const b = this.bullets[i];
      if (!b.active) continue;
      b.pos.x += b.vel.x * dt;
      b.pos.y += b.vel.y * dt;
      b.ttl -= dt;
      if (
        b.ttl <= 0 ||
        b.pos.x < -pad ||
        b.pos.y < -pad ||
        b.pos.x > worldBounds.w + pad ||
        b.pos.y > worldBounds.h + pad
      ) {
        this.kill(i);
        continue;
      }

      if (b.faction === "enemy") {
        if (player.alive && player.invuln <= 0) {
          const dx = b.pos.x - player.pos.x;
          const dy = b.pos.y - player.pos.y;
          const rr = b.radius + player.radius;
          if (dx * dx + dy * dy <= rr * rr) {
            sink.onPlayerHit(b.damage, { x: b.pos.x, y: b.pos.y });
            this.kill(i);
            continue;
          }
        }
      } else {
        for (const e of enemies) {
          if (!e.alive) continue;
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
            this.kill(i);
            break;
          }
        }
      }

      const s = this.sprites[i];
      if (s) s.position.set(b.pos.x, b.pos.y);
    }
  }

  clear(): void {
    for (let i = 0; i < CAP; i++) this.kill(i);
  }

  /** Remove all bullet sprites from the layer (call on scene teardown). */
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
