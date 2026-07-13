// Hazards — pooled persistent damaging zones (spore mines, vent bursts, dread
// spikes, damage trails). Mirrors the Projectiles pool shape. Warm-tinted glow so
// they read as danger (pillar 1). Checked against the player each step; damage is
// gated by the player's i-frames, so a zone ticks once per invuln window.

import { Container, Sprite } from "pixi.js";
import type { Player, Vec2 } from "../core/types";
import { getGlowTexture } from "../engine/glow";

const CAP = 128;

export interface HazardSink {
  onPlayerHit(damage: number, at: Vec2): void;
}

interface Hazard {
  active: boolean;
  x: number;
  y: number;
  r: number;
  ttl: number;
  maxTtl: number;
  dmg: number;
  tint: number;
}

export class Hazards {
  private items: Hazard[] = [];
  private sprites: (Sprite | null)[] = [];
  private free: number[] = [];

  constructor(private layer: Container) {
    for (let i = 0; i < CAP; i++) {
      this.items.push({ active: false, x: 0, y: 0, r: 0, ttl: 0, maxTtl: 1, dmg: 0, tint: 0xffffff });
      this.sprites.push(null);
      this.free.push(i);
    }
  }

  get activeCount(): number {
    return CAP - this.free.length;
  }

  spawn(x: number, y: number, r: number, ttl: number, dmg: number, tint: number): void {
    const idx = this.free.pop();
    if (idx === undefined) return;
    const h = this.items[idx];
    h.active = true;
    h.x = x;
    h.y = y;
    h.r = r;
    h.ttl = ttl;
    h.maxTtl = ttl;
    h.dmg = dmg;
    h.tint = tint;
    let s = this.sprites[idx];
    if (!s) {
      s = new Sprite(getGlowTexture());
      s.anchor.set(0.5);
      this.sprites[idx] = s;
      this.layer.addChild(s);
    }
    s.tint = tint;
    s.scale.set((r * 2.2) / 128);
    s.position.set(x, y);
    s.visible = true;
  }

  private kill(idx: number): void {
    const h = this.items[idx];
    if (!h.active) return;
    h.active = false;
    const s = this.sprites[idx];
    if (s) s.visible = false;
    this.free.push(idx);
  }

  update(dt: number, player: Player, sink: HazardSink): void {
    for (let i = 0; i < CAP; i++) {
      const h = this.items[i];
      if (!h.active) continue;
      h.ttl -= dt;
      if (h.ttl <= 0) {
        this.kill(i);
        continue;
      }
      const s = this.sprites[i];
      if (s) {
        // fade in over first 0.2s, hold, fade out over last 0.4s (a legible pulse)
        const inF = Math.min(1, (h.maxTtl - h.ttl) / 0.2);
        const outF = Math.min(1, h.ttl / 0.4);
        s.alpha = 0.5 * Math.min(inF, outF) + 0.12;
      }
      if (player.alive && player.invuln <= 0) {
        const dx = h.x - player.pos.x;
        const dy = h.y - player.pos.y;
        const rr = h.r + player.radius;
        if (dx * dx + dy * dy <= rr * rr) sink.onPlayerHit(h.dmg, { x: player.pos.x, y: player.pos.y });
      }
    }
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
