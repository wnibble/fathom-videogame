// Functional environment objects — the answer to "props are just decoration."
// Loot pods open, crates/crystals break for loot, probes scan for XP + reveal
// hidden relics, vents push you, and relics grant a guaranteed level-up. Shootable
// ones expose a Damageable face to the projectile system.

import { Container, Graphics, Sprite } from "pixi.js";
import type { Vec2 } from "../core/types";
import type { Damageable } from "./projectiles";
import type { AssetStore } from "../engine/assets";
import type { PickupKind } from "./pickups";
import { getGlowTexture } from "../engine/glow";
import { COLOR } from "../palette";

export type InteractableKind =
  | "loot_pod" | "salvage_crate" | "mineral_crystal" | "research_probe" | "bubble_vent" | "relic" | "ascend_vent";

export interface InteractableData {
  kind: InteractableKind;
  pos: Vec2;
}

interface Def {
  radius: number;
  hp: number; // 0 = not shootable
  samples: number;
  xpOrbs: number;
  upgradeChance: number;
  score: number;
  sprite: string;
}
const DEFS: Record<InteractableKind, Def> = {
  loot_pod: { radius: 15, hp: 0, samples: 3, xpOrbs: 1, upgradeChance: 0.15, score: 80, sprite: "loot_pod_closed" },
  salvage_crate: { radius: 17, hp: 30, samples: 2, xpOrbs: 1, upgradeChance: 0.1, score: 80, sprite: "salvage_crate" },
  mineral_crystal: { radius: 20, hp: 90, samples: 5, xpOrbs: 2, upgradeChance: 0.22, score: 250, sprite: "mineral_crystal" },
  research_probe: { radius: 22, hp: 0, samples: 0, xpOrbs: 0, upgradeChance: 0, score: 60, sprite: "research_probe" },
  bubble_vent: { radius: 44, hp: 0, samples: 0, xpOrbs: 0, upgradeChance: 0, score: 0, sprite: "bubble_vent" },
  relic: { radius: 16, hp: 0, samples: 0, xpOrbs: 0, upgradeChance: 0, score: 500, sprite: "fish_skeleton" },
  ascend_vent: { radius: 26, hp: 0, samples: 0, xpOrbs: 0, upgradeChance: 0, score: 0, sprite: "" },
};

export interface Interactable extends Damageable {
  kind: InteractableKind;
  pos: Vec2;
  radius: number;
  hp: number;
  alive: boolean; // for shootables: still standing; for touch: still active
  def: Def;
  state: "idle" | "spent";
  dwell: number;
  scanned: boolean;
  revealed: boolean;
  view: Container;
  glow?: Sprite;
  ring: Graphics; // affordance: marks the object as INTERACTIVE (vs decoration)
  ventBubbles?: Graphics[]; // procedural bubble-vent animation
}

export interface InteractableSink {
  loot(kind: PickupKind, x: number, y: number, value: number): void;
  score(base: number): void;
  xp(amount: number): void;
  relicClaimed(x: number, y: number): void;
  scan(x: number, y: number): void;
  push(fx: number, fy: number): void;
  fx(anim: string, x: number, y: number): void;
  surface(): void; // ascend vent — bank 100% and return to the station
}

export class Interactables {
  readonly items: Interactable[] = [];

  constructor(data: InteractableData[], private world: Container, private light: Container, private assets: AssetStore) {
    for (const d of data) this.add(d);
  }

  /** Add an interactable at runtime (depth resupply). */
  spawnOne(kind: InteractableKind, pos: Vec2): void {
    this.add({ kind, pos });
  }

  private add(d: InteractableData): void {
    const def = DEFS[d.kind];
    const view = new Container();
    let node: Container;
    let ventBubbles: Graphics[] | undefined;
    if (d.kind === "bubble_vent") {
      // Drawn procedurally (the concept sprite had a stray artifact) — a clean
      // dark nozzle with rising bubbles.
      const c = new Container();
      const base = new Graphics();
      base.ellipse(0, 11, 13, 5).fill(COLOR.deepNavy).stroke({ width: 1.5, color: COLOR.teal });
      base.rect(-4, 2, 8, 9).fill(COLOR.navy);
      c.addChild(base);
      ventBubbles = [];
      for (let i = 0; i < 4; i++) {
        const g = new Graphics();
        g.circle(0, 0, 2 + (i % 2)).fill({ color: COLOR.aquaBright, alpha: 0.7 });
        g.position.set(i % 2 ? 4 : -4, -i * 9);
        c.addChild(g);
        ventBubbles.push(g);
      }
      node = c;
    } else if (d.kind === "ascend_vent") {
      // The extract point — an upward beam of light with rising chevrons.
      const c = new Container();
      const beam = new Graphics();
      beam.roundRect(-6, -34, 12, 44, 6).fill({ color: COLOR.aquaBright, alpha: 0.18 });
      beam.ellipse(0, 12, 14, 5).fill(COLOR.deepNavy).stroke({ width: 1.5, color: COLOR.aqua });
      c.addChild(beam);
      ventBubbles = [];
      for (let i = 0; i < 3; i++) {
        const g = new Graphics();
        g.poly([0, -6, -6, 4, 6, 4]).fill({ color: COLOR.aquaBright, alpha: 0.85 });
        g.position.set(0, i * -13 - 4);
        c.addChild(g);
        ventBubbles.push(g);
      }
      node = c;
    } else if (this.assets.sprites[def.sprite]) node = this.assets.sprite(def.sprite);
    else if (this.assets.anims[def.sprite]) node = this.assets.anim(def.sprite);
    else node = new Container();
    node.scale.set(d.kind === "relic" ? 0.9 : 1);
    view.addChild(node);
    view.position.set(d.pos.x, d.pos.y);

    let glow: Sprite | undefined;
    if (d.kind === "loot_pod" || d.kind === "mineral_crystal" || d.kind === "relic" || d.kind === "research_probe" || d.kind === "ascend_vent") {
      glow = new Sprite(getGlowTexture());
      glow.anchor.set(0.5);
      glow.scale.set((d.kind === "relic" ? 70 : d.kind === "ascend_vent" ? 90 : 48) / 128);
      glow.tint = d.kind === "relic" ? COLOR.sample : d.kind === "loot_pod" ? COLOR.aqua : COLOR.aquaBright;
      glow.alpha = d.kind === "relic" ? 0 : d.kind === "ascend_vent" ? 0.5 : 0.4;
      glow.position.set(d.pos.x, d.pos.y);
      this.light.addChild(glow);
    }
    this.world.addChild(view);

    const hidden = d.kind === "relic";
    view.alpha = hidden ? 0.12 : 1;

    // Affordance ring — a clean outline that reads "you can act on this" so
    // interactables are never mistaken for the (glowy) decoration.
    const ringColor = def.hp > 0 ? COLOR.amberBright : d.kind === "relic" ? COLOR.sample : COLOR.aquaBright;
    const ring = new Graphics();
    ring.circle(0, 0, def.radius + 9).stroke({ width: 1.5, color: ringColor, alpha: 0.7 });
    ring.circle(0, 0, def.radius + 4).stroke({ width: 1, color: ringColor, alpha: 0.3 });
    ring.position.set(d.pos.x, d.pos.y);
    ring.visible = !hidden;
    this.world.addChild(ring);

    this.items.push({
      kind: d.kind,
      pos: { x: d.pos.x, y: d.pos.y },
      radius: def.radius,
      hp: def.hp,
      alive: true,
      def,
      state: "idle",
      dwell: 0,
      scanned: false,
      revealed: !hidden,
      view,
      glow,
      ring,
      ventBubbles,
    });
  }

  /** Shootable, still-standing interactables — targets for player bullets. */
  destructibles(): Damageable[] {
    return this.items.filter((i) => i.def.hp > 0 && i.alive && i.state === "idle");
  }

  /** Called when a bullet destroys a shootable one (projectiles → dive → here). */
  onDestroyed(d: Damageable, sink: InteractableSink): void {
    const it = this.items.find((i) => i === d);
    if (it) this.trigger(it, sink);
  }

  private trigger(it: Interactable, sink: InteractableSink): void {
    if (it.state === "spent") return;
    it.state = "spent";
    it.alive = false;
    const { def, pos } = it;
    for (let i = 0; i < def.samples; i++) sink.loot("sample", pos.x, pos.y, 1);
    for (let i = 0; i < def.xpOrbs; i++) sink.loot("xp", pos.x, pos.y, 16);
    if (def.upgradeChance > 0 && Math.random() < def.upgradeChance) sink.loot("upgrade", pos.x, pos.y, 0);
    if (def.score > 0) sink.score(def.score);
    if (it.kind === "loot_pod" && this.assets.has("loot_pod_open")) {
      (it.view.children[0] as Sprite).texture = this.assets.texture("loot_pod_open");
    } else {
      it.view.alpha = 0.35;
    }
    sink.fx(it.kind === "mineral_crystal" ? "sample_burst" : "pickup_sparkle", pos.x, pos.y);
    if (it.glow) it.glow.alpha = 0;
    it.ring.visible = false;
  }

  revealNearestRelic(x: number, y: number): void {
    let best: Interactable | null = null;
    let bd = Infinity;
    for (const it of this.items) {
      if (it.kind !== "relic" || it.revealed) continue;
      const d = Math.hypot(it.pos.x - x, it.pos.y - y);
      if (d < bd) {
        bd = d;
        best = it;
      }
    }
    if (best) {
      best.revealed = true;
      best.view.alpha = 1;
      best.ring.visible = true;
      if (best.glow) best.glow.alpha = 0.7;
    }
  }

  update(dt: number, player: Vec2, playerAlive: boolean, playerRadius: number, elapsed: number, sink: InteractableSink): void {
    const pulse = 0.5 + 0.5 * Math.sin(elapsed * 5);
    for (const it of this.items) {
      if (it.state === "spent") continue;
      if (it.ring.visible) it.ring.alpha = 0.5 + 0.3 * pulse;
      if (it.glow && (it.kind === "loot_pod" || it.kind === "mineral_crystal")) it.glow.alpha = 0.3 + 0.2 * pulse;
      const dx = it.pos.x - player.x;
      const dy = it.pos.y - player.y;
      const dist = Math.hypot(dx, dy);
      const touchR = it.radius + playerRadius;

      switch (it.kind) {
        case "loot_pod":
          if (playerAlive && dist <= touchR) this.trigger(it, sink);
          break;
        case "bubble_vent": {
          if (it.ventBubbles) {
            for (const g of it.ventBubbles) {
              g.y -= dt * 26;
              g.alpha = Math.max(0.05, 0.7 * (1 - -g.y / 42));
              if (g.y < -42) g.y = 0;
            }
          }
          if (dist <= it.radius) {
            const s = 1 - dist / it.radius;
            sink.push(0, -320 * s); // upward push
          }
          break;
        }
        case "ascend_vent": {
          if (it.ventBubbles) {
            for (const g of it.ventBubbles) {
              g.y -= dt * 34;
              g.alpha = Math.max(0.1, 0.85 * (1 - -g.y / 40));
              if (g.y < -40) g.y = 0;
            }
          }
          if (it.glow) it.glow.alpha = 0.4 + 0.25 * pulse;
          if (playerAlive && dist <= it.radius + playerRadius) sink.surface();
          break;
        }
        case "research_probe":
          if (playerAlive && dist <= it.radius + playerRadius + 10) {
            it.dwell += dt;
            if (it.glow) it.glow.alpha = 0.4 + 0.4 * (it.dwell / 0.8);
            if (it.dwell >= 0.8 && !it.scanned) {
              it.scanned = true;
              sink.xp(20);
              sink.score(60);
              sink.scan(it.pos.x, it.pos.y);
              this.revealNearestRelic(it.pos.x, it.pos.y);
            }
          } else {
            it.dwell = Math.max(0, it.dwell - dt);
          }
          break;
        case "relic":
          if (!it.revealed && dist < 130) {
            it.revealed = true;
            it.view.alpha = 1;
            it.ring.visible = true;
            if (it.glow) it.glow.alpha = 0.7;
            sink.scan(it.pos.x, it.pos.y);
          }
          if (it.glow && it.revealed) it.glow.alpha = 0.5 + 0.3 * pulse;
          if (it.revealed && playerAlive && dist <= touchR) {
            it.state = "spent";
            it.alive = false;
            it.view.alpha = 0;
            it.ring.visible = false;
            if (it.glow) it.glow.alpha = 0;
            sink.score(it.def.score);
            sink.fx("codex_flash", it.pos.x, it.pos.y);
            sink.relicClaimed(it.pos.x, it.pos.y);
          }
          break;
        default:
          break;
      }
    }
  }

  destroy(): void {
    for (const it of this.items) {
      it.view.parent?.removeChild(it.view);
      it.view.destroy({ children: true });
      it.ring.parent?.removeChild(it.ring);
      it.ring.destroy();
      if (it.glow) {
        it.glow.parent?.removeChild(it.glow);
        it.glow.destroy();
      }
    }
    this.items.length = 0;
  }
}
