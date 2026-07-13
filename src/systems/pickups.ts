// Generalized drop orbs: samples / xp / hp / upgrade. They magnetize to the
// player within the (upgradeable) magnet radius, then are collected. Color
// language: sample=mint, xp=aqua, hp=green, upgrade=amber.

import { Container, Graphics, Sprite } from "pixi.js";
import type { Player, Vec2 } from "../core/types";
import { getGlowTexture } from "../engine/glow";
import { COLOR } from "../palette";

export type PickupKind = "hp" | "sample" | "xp" | "upgrade";

const TINT: Record<PickupKind, number> = {
  hp: COLOR.hpFull,
  sample: COLOR.sample,
  xp: COLOR.aqua,
  upgrade: COLOR.amberBright,
};

interface Pickup {
  kind: PickupKind;
  pos: Vec2;
  vel: Vec2;
  ttl: number;
  value: number;
  node: Container;
  glow: Sprite;
}

export interface PickupSink {
  onPickup(kind: PickupKind, value: number): void;
}

export class Pickups {
  private items: Pickup[] = [];

  constructor(private world: Container, private light: Container) {}

  get count(): number {
    return this.items.length;
  }

  spawn(kind: PickupKind, x: number, y: number, value: number, spreadVel = 60): void {
    const tint = TINT[kind];
    const node = new Container();
    const core = new Graphics();
    if (kind === "hp") {
      core.roundRect(-2, -6, 4, 12, 2).fill(tint);
      core.roundRect(-6, -2, 12, 4, 2).fill(tint);
    } else if (kind === "upgrade") {
      core.star(0, 0, 5, 7, 3).fill(tint);
    } else {
      core.circle(0, 0, 4).fill(tint);
    }
    node.addChild(core);
    node.position.set(x, y);
    this.world.addChild(node);

    const glow = new Sprite(getGlowTexture());
    glow.anchor.set(0.5);
    glow.scale.set((kind === "upgrade" ? 64 : 44) / 128);
    glow.tint = tint;
    glow.alpha = 0.55;
    glow.position.set(x, y);
    this.light.addChild(glow);

    // little outward pop on spawn (deterministic-ish via index count)
    const a = (this.items.length * 2.399963) % (Math.PI * 2);
    this.items.push({ kind, pos: { x, y }, vel: { x: Math.cos(a) * spreadVel, y: Math.sin(a) * spreadVel }, ttl: 20, value, node, glow });
  }

  update(dt: number, player: Player, magnetRadius: number, elapsed: number, sink: PickupSink): void {
    if (!this.items.length) return;
    const pulse = 0.5 + 0.5 * Math.sin(elapsed * 6);
    for (const p of this.items) {
      p.ttl -= dt;
      const dx = player.pos.x - p.pos.x;
      const dy = player.pos.y - p.pos.y;
      const dist = Math.hypot(dx, dy) || 1;
      if (dist < magnetRadius) {
        const pull = 1 - dist / magnetRadius;
        p.vel.x += (dx / dist) * pull * 1100 * dt;
        p.vel.y += (dy / dist) * pull * 1100 * dt;
      } else if (player.alive && dist < 560) {
        // Soft always-pull so orbs are never permanently abandoned in the field.
        p.vel.x += (dx / dist) * 130 * dt;
        p.vel.y += (dy / dist) * 130 * dt;
      }
      p.vel.x *= 1 / (1 + 4 * dt);
      p.vel.y *= 1 / (1 + 4 * dt);
      p.pos.x += p.vel.x * dt;
      p.pos.y += p.vel.y * dt;
      p.node.position.set(p.pos.x, p.pos.y);
      p.glow.position.set(p.pos.x, p.pos.y);
      p.glow.alpha = 0.4 + 0.25 * pulse;

      if (player.alive && dist <= player.radius + 16) {
        sink.onPickup(p.kind, p.value);
        p.ttl = -1;
      }
    }
    if (this.items.some((p) => p.ttl <= 0)) {
      for (const p of this.items) {
        if (p.ttl > 0) continue;
        p.node.parent?.removeChild(p.node);
        p.node.destroy({ children: true });
        p.glow.parent?.removeChild(p.glow);
        p.glow.destroy();
      }
      this.items = this.items.filter((p) => p.ttl > 0);
    }
  }

  destroy(): void {
    for (const p of this.items) {
      p.node.parent?.removeChild(p.node);
      p.node.destroy({ children: true });
      p.glow.parent?.removeChild(p.glow);
      p.glow.destroy();
    }
    this.items = [];
  }
}
