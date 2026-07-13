// The Surface Station as a WALKABLE overworld. You pilot the diver around a small
// home reef, swim up to three kiosks (Outfitter / Market / Archive) to shop, and
// swim into the launch vent to dive. A companion drifts alongside you. Shopping
// reuses the proven StationOverlay (opened on the matching tab), so the walkable
// layer is pure gain on top of a working UI. Stardew-cozy, bioluminescent.

import { Container, Graphics, Sprite, Text, TextStyle } from "pixi.js";
import type { Engine } from "../engine/app";
import type { AssetStore } from "../engine/assets";
import type { Input } from "../engine/input";
import { KEYS } from "../engine/input";
import type { Player, Vec2 } from "../core/types";
import { buildPlayerView } from "../render/actors";
import { updatePlayerMovement } from "../systems/movement";
import { getGlowTexture } from "../engine/glow";
import { approach } from "../engine/tween";
import { COLOR } from "../palette";
import { audio } from "../engine/audio";
import type { SaveData } from "./persistence";
import type { Weather } from "../content/weather";
import { StationOverlay } from "../ui/station";
import { squashStretch } from "../render/vitality";

export interface HubCallbacks {
  getSave: () => SaveData;
  getWeather: () => Weather;
  getLastBank: () => { pearlsEarned: number; newBadges: string[] } | null;
  onLaunch: () => void; // begin a dive
  onExit: () => void; // back to the main menu
  onBuy: (id: string) => SaveData;
  onBuyBoon: (id: string) => SaveData;
}

interface Kiosk {
  pos: Vec2;
  tab: number; // StationOverlay tab index
  name: string;
  color: number;
  beacon: Sprite;
  core: Graphics;
  label: Text;
  prompt: Text;
}

const BOUNDS = { w: 1500, h: 1050 };
const INTERACT_R = 96;

export class Hub {
  private root = new Container(); // world-layer scene
  private light = new Container(); // light-layer glows
  private ui = new Container(); // screen-space prompts
  private view!: ReturnType<typeof buildPlayerView>;
  private player: Player;
  private facing = -Math.PI / 2;
  private kiosks: Kiosk[] = [];
  private gate!: { pos: Vec2; core: Graphics; ring: Graphics; glow: Sprite; label: Text; prompt: Text };
  private companion!: { root: Container; glow: Sprite; pos: Vec2; phase: number; idle?: Container; swim?: Container; flip?: Container };
  private decor: { node: Container; baseX: number; phase: number; amp: number; speed: number }[] = [];
  private hasVent = false;
  private t = 0;
  private elapsed = 0;
  private mode: "walk" | "shop" = "walk";
  private overlay: StationOverlay | null = null;
  private near: Kiosk | "gate" | null = null;

  constructor(private engine: Engine, private assets: AssetStore, private cbs: HubCallbacks) {
    this.engine.worldLayer.addChild(this.root);
    this.engine.lightLayer.addChild(this.light);
    this.engine.uiRoot.addChild(this.ui);
    this.engine.setBgTint(0x0a1826);
    this.engine.setDread(0);

    this.player = {
      pos: { x: BOUNDS.w / 2, y: BOUNDS.h * 0.62 },
      vel: { x: 0, y: 0 },
      radius: 10,
      hp: 1,
      maxHp: 1,
      fireCooldown: 0,
      invuln: 0,
      alive: true,
      shieldMax: 0,
      shield: 0,
      shieldRegenT: 0,
    };

    this.view = buildPlayerView(this.assets);
    this.buildScene();
    this.root.addChild(this.view.root);
    this.light.addChild(this.view.lamp);
    this.view.root.position.set(this.player.pos.x, this.player.pos.y);
    this.engine.centerOn(this.player.pos.x, this.player.pos.y, true);
    this.engine.updateCamera(0); // snap the scene transform now so frame 1 is correct
  }

  // ---- scene construction ----
  private buildScene(): void {
    // Seafloor gradient + a soft home glow.
    const floor = new Graphics();
    floor.rect(0, BOUNDS.h - 220, BOUNDS.w, 220).fill({ color: 0x0c2130, alpha: 0.9 });
    floor.rect(0, BOUNDS.h - 120, BOUNDS.w, 120).fill({ color: 0x123049, alpha: 0.6 });
    this.root.addChildAt(floor, 0);

    // The station structure — a stylized dome with lit windows, drawn to read as
    // "home" without needing bespoke art.
    const cx = BOUNDS.w / 2;
    const cy = BOUNDS.h * 0.34;
    const dome = new Graphics();
    dome.ellipse(cx, cy + 46, 200, 60).fill({ color: 0x0a1a28, alpha: 0.95 });
    dome.moveTo(cx - 150, cy + 46).arc(cx, cy + 46, 150, Math.PI, 0).fill({ color: 0x123044, alpha: 0.97 });
    dome.circle(cx, cy - 30, 70).fill({ color: 0x14384f, alpha: 0.95 }).stroke({ width: 3, color: 0x1d5170 });
    dome.rect(cx - 150, cy + 40, 300, 12).fill({ color: 0x1d5170, alpha: 0.9 });
    for (let i = -2; i <= 2; i++) {
      dome.circle(cx + i * 46, cy + 22, 9).fill({ color: COLOR.aquaBright, alpha: 0.85 });
    }
    this.root.addChild(dome);
    const homeGlow = new Sprite(getGlowTexture());
    homeGlow.anchor.set(0.5);
    homeGlow.tint = COLOR.aqua;
    homeGlow.alpha = 0.22;
    homeGlow.scale.set(560 / 128);
    homeGlow.position.set(cx, cy);
    this.light.addChild(homeGlow);

    // The station keeper — a friendly figure tending the surface (idle animation).
    if (this.assets.has("keeper_idle")) {
      const keeper = this.assets.anim("keeper_idle");
      keeper.position.set(cx + 96, cy + 46);
      keeper.scale.set(1.1);
      this.root.addChild(keeper);
    }
    // A weather buoy off to the side, a lit landmark by the dome.
    if (this.assets.has("weather_buoy")) {
      const buoy = this.assets.sprite("weather_buoy");
      buoy.position.set(cx - 190, cy + 60);
      buoy.scale.set(1.1);
      this.root.addChild(buoy);
      const bglow = new Sprite(getGlowTexture());
      bglow.anchor.set(0.5);
      bglow.tint = COLOR.amberBright;
      bglow.alpha = 0.3;
      bglow.scale.set(120 / 128);
      bglow.position.set(cx - 190, cy + 20);
      this.light.addChild(bglow);
    }

    // Decorative flora (reef around the station) — swaying, from real assets.
    const reef = this.assets.spritesInSheet("kelp_forest_props").filter((n) => /kelp|sprout|tangle|coral|frond/i.test(n));
    if (reef.length) {
      const spots: Vec2[] = [
        { x: 150, y: BOUNDS.h - 150 }, { x: 360, y: BOUNDS.h - 120 }, { x: BOUNDS.w - 180, y: BOUNDS.h - 150 },
        { x: BOUNDS.w - 380, y: BOUNDS.h - 110 }, { x: 90, y: BOUNDS.h - 340 }, { x: BOUNDS.w - 110, y: BOUNDS.h - 330 },
        { x: 520, y: BOUNDS.h - 90 }, { x: BOUNDS.w - 560, y: BOUNDS.h - 95 },
      ];
      spots.forEach((p, i) => {
        const name = reef[(i * 3 + 1) % reef.length];
        if (!this.assets.has(name)) return;
        const s = this.assets.sprite(name);
        s.position.set(p.x, p.y);
        const sc = 1.1 + ((i * 37) % 40) / 100;
        s.scale.set(sc);
        this.root.addChild(s);
        this.decor.push({ node: s, baseX: p.x, phase: (i * 1.7) % (Math.PI * 2), amp: 0.06, speed: 0.7 + (i % 3) * 0.15 });
      });
    }

    // Kiosks.
    const kioskDefs: { tab: number; name: string; color: number; pos: Vec2 }[] = [
      { tab: 0, name: "OUTFITTER", color: COLOR.amberBright, pos: { x: cx - 340, y: BOUNDS.h * 0.55 } },
      { tab: 1, name: "MARKET", color: COLOR.hpFull, pos: { x: cx, y: BOUNDS.h * 0.5 } },
      { tab: 2, name: "ARCHIVE", color: COLOR.aqua, pos: { x: cx + 340, y: BOUNDS.h * 0.55 } },
    ];
    for (const d of kioskDefs) {
      // Real console prop (bottom-center anchored) when available, else a pillar.
      if (this.assets.has("shop_console")) {
        const con = this.assets.sprite("shop_console");
        con.position.set(d.pos.x, d.pos.y + 28);
        con.scale.set(1.1);
        this.root.addChild(con);
      } else {
        const pillar = new Graphics();
        pillar.roundRect(d.pos.x - 16, d.pos.y - 8, 32, 54, 6).fill({ color: 0x0d2233, alpha: 0.96 }).stroke({ width: 2, color: 0x1d4a66 });
        this.root.addChild(pillar);
      }
      const core = new Graphics();
      core.circle(d.pos.x, d.pos.y - 24, 7).fill({ color: d.color, alpha: 0.95 });
      this.root.addChild(core);
      const beacon = new Sprite(getGlowTexture());
      beacon.anchor.set(0.5);
      beacon.tint = d.color;
      beacon.alpha = 0.5;
      beacon.scale.set(140 / 128);
      beacon.position.set(d.pos.x, d.pos.y - 20);
      this.light.addChild(beacon);
      const label = this.mkLabel(d.name, 15, d.color, "bold");
      const prompt = this.mkLabel("press E", 12, COLOR.aquaBright);
      prompt.visible = false;
      this.kiosks.push({ pos: d.pos, tab: d.tab, name: d.name, color: d.color, beacon, core, label, prompt });
    }

    // Launch vent — swim in to dive. Real dive_vent prop when available.
    const gpos = { x: cx, y: BOUNDS.h * 0.84 };
    if (this.assets.has("dive_vent")) {
      const vent = this.assets.sprite("dive_vent");
      vent.position.set(gpos.x, gpos.y + 40);
      vent.scale.set(1.6);
      this.root.addChild(vent);
      this.hasVent = true;
    }
    const gring = new Graphics();
    const gcore = new Graphics();
    this.root.addChild(gring, gcore);
    const gglow = new Sprite(getGlowTexture());
    gglow.anchor.set(0.5);
    gglow.tint = COLOR.aquaBright;
    gglow.alpha = 0.4;
    gglow.scale.set(260 / 128);
    gglow.position.set(gpos.x, gpos.y);
    this.light.addChild(gglow);
    const glabel = this.mkLabel("▼ THE DESCENT", 16, COLOR.aquaBright, "bold");
    const gprompt = this.mkLabel("press E to dive", 12, COLOR.aquaBright);
    gprompt.visible = false;
    this.gate = { pos: gpos, core: gcore, ring: gring, glow: gglow, label: glabel, prompt: gprompt };

    // Companion — the astronaut bichon, a small drifting friend.
    const c = new Container();
    let idle: Container | undefined;
    let swim: Container | undefined;
    let flip: Container | undefined;
    if (this.assets.has("dog_idle") && this.assets.has("dog_swim")) {
      flip = new Container();
      idle = this.assets.anim("dog_idle");
      swim = this.assets.anim("dog_swim");
      swim.visible = false;
      flip.addChild(idle, swim);
      c.addChild(flip);
    } else {
      const body = new Graphics();
      body.ellipse(0, 0, 13, 9).fill({ color: 0x2a6a86 });
      body.ellipse(-2, 2, 9, 5).fill({ color: 0x8fe6ff, alpha: 0.5 });
      body.moveTo(11, 0).lineTo(20, -7).lineTo(20, 7).closePath().fill({ color: 0x2a6a86 });
      body.circle(-6, -2, 2.4).fill({ color: 0x06121a });
      c.addChild(body);
    }
    this.root.addChild(c);
    const cglow = new Sprite(getGlowTexture());
    cglow.anchor.set(0.5);
    cglow.tint = COLOR.aqua;
    cglow.alpha = 0.4;
    cglow.scale.set(90 / 128);
    this.light.addChild(cglow);
    this.companion = { root: c, glow: cglow, pos: { x: this.player.pos.x - 40, y: this.player.pos.y - 30 }, phase: 0, idle, swim, flip };
  }

  private mkLabel(s: string, size: number, color: number, weight: "normal" | "bold" = "normal"): Text {
    const t = new Text({ text: s, style: new TextStyle({ fontFamily: "Consolas, ui-monospace, monospace", fontSize: size, fill: color, fontWeight: weight }) });
    t.anchor.set(0.5, 1);
    this.ui.addChild(t);
    return t;
  }

  // ---- update ----
  update(dt: number, input: Input): void {
    this.elapsed += dt;
    if (this.mode === "shop") {
      this.updateShop(input);
      return;
    }
    this.t += dt;
    const p = this.player;

    // Movement (no currents in the safe harbor).
    updatePlayerMovement(p, input.state.move, [], dt, BOUNDS, 1);
    const spd = Math.hypot(p.vel.x, p.vel.y);
    if (spd > 12) this.facing = approach(this.facing, angleLerpTarget(this.facing, Math.atan2(p.vel.y, p.vel.x)), 10, dt);

    this.view.root.position.set(Math.round(p.pos.x), Math.round(p.pos.y));
    if (this.view.update) {
      this.view.root.rotation = 0;
      this.view.update(dt, spd > 20, input.state.move.x || Math.cos(this.facing), false);
    } else {
      this.view.root.rotation = this.facing;
      squashStretch(this.view.root, spd, 0.24, 0.02, this.elapsed, 0);
    }
    this.view.lamp.position.set(p.pos.x, p.pos.y);

    this.engine.centerOn(p.pos.x, p.pos.y);
    this.engine.updateCamera(dt); // apply the camera target to the scene transform
    this.animateScene();
    this.updateCompanion(dt);
    this.updateProximity();
    this.updateLabels();

    // Interact / exit.
    if (input.pressed(KEYS.interact) && this.near) {
      if (this.near === "gate") {
        audio.uiConfirm();
        this.cbs.onLaunch();
        return;
      }
      this.openShop(this.near);
      return;
    }
    if (input.pressed(KEYS.pause)) this.cbs.onExit();
  }

  private animateScene(): void {
    for (const d of this.decor) {
      const w = Math.sin(this.t * d.speed + d.phase);
      d.node.rotation = d.amp * w;
      d.node.position.x = d.baseX + d.amp * 20 * w;
    }
    // Beacons breathe; the launch ring pulses like a held breath.
    for (const k of this.kiosks) {
      k.beacon.alpha = 0.42 + 0.14 * (0.5 + 0.5 * Math.sin(this.t * 1.6 + k.pos.x));
    }
    const pulse = 0.5 + 0.5 * Math.sin(this.t * 1.1);
    this.gate.glow.alpha = 0.32 + 0.22 * pulse;
    this.gate.ring.clear();
    this.gate.ring.circle(this.gate.pos.x, this.gate.pos.y, 42 + pulse * 6).stroke({ width: 3, color: COLOR.aquaBright, alpha: 0.5 + 0.3 * pulse });
    this.gate.ring.circle(this.gate.pos.x, this.gate.pos.y, 60 + pulse * 10).stroke({ width: 1.5, color: COLOR.aqua, alpha: 0.25 });
    this.gate.core.clear();
    if (!this.hasVent) this.gate.core.circle(this.gate.pos.x, this.gate.pos.y, 20).fill({ color: 0x0a2436, alpha: 0.7 });
  }

  private updateCompanion(dt: number): void {
    const c = this.companion;
    c.phase += dt;
    // Trail behind + to the side of the diver, with lazy easing + a bob.
    const tx = this.player.pos.x - Math.cos(this.facing) * 46 + 10;
    const ty = this.player.pos.y - Math.sin(this.facing) * 46 - 26 + Math.sin(c.phase * 2.1) * 6;
    const ox = c.pos.x, oy = c.pos.y;
    c.pos.x = approach(c.pos.x, tx, 4, dt);
    c.pos.y = approach(c.pos.y, ty, 4, dt);
    const dx = tx - c.pos.x;
    const moved = Math.hypot(c.pos.x - ox, c.pos.y - oy) / Math.max(dt, 0.001);
    c.root.position.set(c.pos.x, c.pos.y);
    c.root.rotation = Math.sin(c.phase * 2.1) * 0.12;
    if (c.flip) {
      if (Math.abs(dx) > 1) c.flip.scale.x = dx > 0 ? -1 : 1; // dog art faces left
      const swimming = moved > 26;
      if (c.idle) c.idle.visible = !swimming;
      if (c.swim) c.swim.visible = swimming;
    } else {
      c.root.scale.x = dx < -1 ? -1 : 1;
    }
    c.glow.position.set(c.pos.x, c.pos.y);
    c.glow.alpha = 0.32 + 0.1 * (0.5 + 0.5 * Math.sin(c.phase * 3));
  }

  private updateProximity(): void {
    let best: Kiosk | "gate" | null = null;
    let bestD = INTERACT_R;
    for (const k of this.kiosks) {
      const d = Math.hypot(k.pos.x - this.player.pos.x, k.pos.y - this.player.pos.y);
      if (d < bestD) {
        bestD = d;
        best = k;
      }
    }
    const gd = Math.hypot(this.gate.pos.x - this.player.pos.x, this.gate.pos.y - this.player.pos.y);
    if (gd < bestD) {
      best = "gate";
    }
    this.near = best;
  }

  private updateLabels(): void {
    for (const k of this.kiosks) {
      const s = this.engine.worldToScreen(k.pos.x, k.pos.y - 44);
      k.label.position.set(s.x, s.y);
      const isNear = this.near === k;
      k.label.alpha = isNear ? 1 : 0.7;
      k.label.scale.set(isNear ? 1.08 : 1);
      k.prompt.visible = isNear;
      if (isNear) {
        const ps = this.engine.worldToScreen(k.pos.x, k.pos.y - 24);
        k.prompt.position.set(ps.x, ps.y);
      }
    }
    const gs = this.engine.worldToScreen(this.gate.pos.x, this.gate.pos.y - 74);
    this.gate.label.position.set(gs.x, gs.y);
    const gNear = this.near === "gate";
    this.gate.label.alpha = gNear ? 1 : 0.8;
    this.gate.label.scale.set(gNear ? 1.08 : 1);
    this.gate.prompt.visible = gNear;
    if (gNear) {
      const gp = this.engine.worldToScreen(this.gate.pos.x, this.gate.pos.y - 54);
      this.gate.prompt.position.set(gp.x, gp.y);
    }
  }

  // ---- shopping (delegates to the proven overlay) ----
  private openShop(k: Kiosk): void {
    audio.uiConfirm();
    this.overlay = new StationOverlay(this.cbs.getSave(), this.cbs.getLastBank(), this.cbs.getWeather(), {
      onLaunch: () => this.cbs.onLaunch(),
      onBack: () => this.closeShop(),
      onBuy: (id) => this.cbs.onBuy(id),
      onBuyBoon: (id) => this.cbs.onBuyBoon(id),
    });
    this.overlay.layout(this.engine.width, this.engine.height);
    this.overlay.setTab(k.tab);
    this.engine.uiRoot.addChild(this.overlay.root);
    this.ui.visible = false;
    this.mode = "shop";
  }

  private closeShop(): void {
    this.overlay?.destroy();
    this.overlay = null;
    this.ui.visible = true;
    this.mode = "walk";
  }

  private updateShop(input: Input): void {
    const o = this.overlay;
    if (!o) return;
    if (input.pressed(KEYS.up)) o.move(-1);
    if (input.pressed(KEYS.down)) o.move(1);
    if (input.pressed(KEYS.left)) o.switchTab(-1);
    if (input.pressed(KEYS.right)) o.switchTab(1);
    if (input.pressed(KEYS.confirm)) o.activate();
    if (input.pressed(KEYS.pause)) this.closeShop();
  }

  layout(): void {
    this.overlay?.layout(this.engine.width, this.engine.height);
  }

  destroy(): void {
    this.overlay?.destroy();
    this.root.destroy({ children: true });
    this.light.destroy({ children: true });
    this.ui.destroy({ children: true });
    this.engine.setBgTint(COLOR.deepNavy);
  }
}

// Shortest-arc target so easing toward a new facing never spins the long way.
function angleLerpTarget(from: number, to: number): number {
  let d = to - from;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return from + d;
}
