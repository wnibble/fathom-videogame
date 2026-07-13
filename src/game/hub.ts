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
// The metal deck occupies most of the hub; open water + reef fringe the edges.
const DECK = { x0: 132, y0: 150, x1: BOUNDS.w - 132, y1: BOUNDS.h - 128 };

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
    // The station DECK — a tiled metal-slab base you move around on.
    this.buildDeck();

    // The depth monument — the station's centerpiece, high on the deck.
    const cx = BOUNDS.w / 2;
    const cy = BOUNDS.h * 0.5;
    // Scales sized against the 63px tile + 34px diver (a device ≈ 1.5-2 diver heights).
    this.placeDevice("depth_monument", cx, DECK.y0 + 190, 1.5, 0xffb64a, 0.32);

    // Station devices dressing the deck — a real facility.
    this.placeDevice("communications_dish_idle", DECK.x0 + 130, DECK.y0 + 150, 1.3);
    this.placeDevice("specimen_lab_a", DECK.x1 - 150, DECK.y0 + 150, 1.3);
    this.placeDevice("vault_door_powered", cx - 300, DECK.y0 + 118, 1.4, 0x9db8ff, 0.22);
    this.placeDevice("core_socket_off", cx + 300, DECK.y0 + 150, 1.3);
    this.placeDevice("bank_lantern_on", DECK.x0 + 150, DECK.y1 - 120, 1.3, 0xffb64a, 0.34);
    this.placeDevice("bank_lantern_on", DECK.x1 - 150, DECK.y1 - 120, 1.3, 0xffb64a, 0.34);
    // The companion portal — where the bichon comes from.
    this.placeDevice("companion_portal_on", DECK.x1 - 220, DECK.y1 - 240, 1.3, 0x8ff6ff, 0.32);
    // The station keeper tends the deck.
    if (this.assets.has("keeper_idle")) {
      const keeper = this.assets.anim("keeper_idle");
      keeper.position.set(cx + 150, DECK.y0 + 210);
      keeper.scale.set(1.05);
      this.root.addChild(keeper);
    }
    // The weather buoy — reads the sea you'll dive into.
    this.placeDevice("surface_buoy", DECK.x0 + 220, DECK.y1 - 240, 1.3, 0xffe08a, 0.3);

    // Industrial clutter + lighting — authored positions so the deck reads busy but
    // never blocks movement (hub props are decoration only).
    const clutter: [string, number, number, number][] = [
      ["pipe_cluster", DECK.x0 + 60, DECK.y0 + 320, 1.25], ["pipe_cluster", DECK.x1 - 60, DECK.y0 + 360, 1.25],
      ["cargo_crate_closed", DECK.x0 + 90, DECK.y1 - 300, 1.15], ["rusted_barrel", DECK.x0 + 170, DECK.y1 - 300, 1.1],
      ["cargo_crate_closed", DECK.x1 - 100, DECK.y1 - 300, 1.15], ["rusted_barrel", DECK.x1 - 185, DECK.y1 - 290, 1.1],
      ["floor_grate", cx - 210, cy + 40, 1.3], ["floor_grate", cx + 210, cy + 40, 1.3],
      ["bollard", cx - 120, DECK.y1 - 90, 1.1], ["bollard", cx + 120, DECK.y1 - 90, 1.1],
      ["large_valve", DECK.x1 - 250, cy - 20, 1.15],
    ];
    for (const [name, x, y, sc] of clutter) this.placeDevice(name, x, y, sc);
    // Floodlights at the corners cast warm pools across the deck.
    for (const [x, y] of [[DECK.x0 + 70, DECK.y0 + 70], [DECK.x1 - 70, DECK.y0 + 70], [DECK.x0 + 70, DECK.y1 - 40], [DECK.x1 - 70, DECK.y1 - 40]] as [number, number][]) {
      this.placeDevice("floodlight_on", x, y, 1.15, 0xffe08a, 0.26);
    }

    // Reef flora in the OPEN WATER fringing the deck (never on the metal).
    const reef = this.assets.spritesInSheet("kelp_forest_props").filter((n) => /kelp|sprout|tangle|coral|frond/i.test(n));
    if (reef.length) {
      const spots: Vec2[] = [
        { x: 60, y: BOUNDS.h - 210 }, { x: 66, y: BOUNDS.h - 90 }, { x: BOUNDS.w - 62, y: BOUNDS.h - 200 },
        { x: BOUNDS.w - 70, y: BOUNDS.h - 80 }, { x: 60, y: 360 }, { x: BOUNDS.w - 60, y: 360 },
        { x: DECK.x0 + 240, y: BOUNDS.h - 46 }, { x: DECK.x1 - 240, y: BOUNDS.h - 46 },
      ];
      spots.forEach((p, i) => {
        const name = reef[(i * 3 + 1) % reef.length];
        if (!this.assets.has(name)) return;
        const s = this.assets.sprite(name);
        s.position.set(p.x, p.y);
        const sc = 1.1 + ((i * 37) % 40) / 100;
        s.scale.set(sc);
        this.root.addChild(s);
        this.decor.push({ node: s, baseX: p.x, phase: (i * 1.7) % (Math.PI * 2), amp: 0.025, speed: 0.55 + (i % 3) * 0.12 });
      });
    }

    // Kiosks.
    // Each shop is a themed device: OUTFITTER = upgrade shrine, MARKET = sample
    // scanner, ARCHIVE = codex terminal.
    const kioskDefs: { tab: number; name: string; color: number; device: string; pos: Vec2 }[] = [
      { tab: 0, name: "OUTFITTER", color: COLOR.amberBright, device: "upgrade_shrine", pos: { x: cx - 360, y: BOUNDS.h * 0.5 } },
      { tab: 1, name: "MARKET", color: COLOR.hpFull, device: "sample_scanner", pos: { x: cx, y: BOUNDS.h * 0.5 } },
      { tab: 2, name: "ARCHIVE", color: COLOR.aqua, device: "codex_terminal", pos: { x: cx + 360, y: BOUNDS.h * 0.5 } },
    ];
    for (const d of kioskDefs) {
      const placed = this.placeDevice(d.device, d.pos.x, d.pos.y + 30, 1.5) ?? this.placeDevice("shop_console", d.pos.x, d.pos.y + 28, 1.1);
      if (!placed) {
        const pillar = new Graphics();
        pillar.roundRect(d.pos.x - 16, d.pos.y - 8, 32, 54, 6).fill({ color: 0x0d2233, alpha: 0.96 }).stroke({ width: 2, color: 0x1d4a66 });
        this.root.addChild(pillar);
      }
      const core = new Graphics();
      core.circle(d.pos.x, d.pos.y - 52, 6).fill({ color: d.color, alpha: 0.95 });
      this.root.addChild(core);
      const beacon = new Sprite(getGlowTexture());
      beacon.anchor.set(0.5);
      beacon.tint = d.color;
      beacon.alpha = 0.5;
      beacon.scale.set(150 / 128);
      beacon.position.set(d.pos.x, d.pos.y - 30);
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
      vent.scale.set(1.35);
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

  /** Tile the metal station deck you move around on, with a raised frame + railings. */
  private buildDeck(): void {
    // Raised base beneath the tiles — gives the platform edge + reads as "solid".
    const base = new Graphics();
    base.roundRect(DECK.x0 - 26, DECK.y0 - 20, DECK.x1 - DECK.x0 + 52, DECK.y1 - DECK.y0 + 46, 30).fill({ color: 0x060c14 });
    base.roundRect(DECK.x0 - 16, DECK.y0 - 12, DECK.x1 - DECK.x0 + 32, DECK.y1 - DECK.y0 + 28, 24).fill({ color: 0x0b1826 }).stroke({ width: 5, color: 0x1c3a56 });
    this.root.addChildAt(base, 0);

    if (this.assets.has("station_floor")) {
      const deck = new Container();
      const tw = 63, th = 64; // station_floor at native scale 1 — small tiles, lots of them
      let row = 0;
      for (let y = DECK.y0; y < DECK.y1; y += th, row++) {
        let col = 0;
        for (let x = DECK.x0; x < DECK.x1; x += tw, col++) {
          const t = this.assets.sprite("station_floor");
          t.anchor.set(0, 0);
          t.position.set(x, y);
          t.tint = (row + col) % 2 === 0 ? 0xffffff : 0xe9eff5; // whisper checker for grid legibility
          deck.addChild(t);
        }
      }
      // Clip the tile grid to a rounded platform so the edge reads clean.
      const mask = new Graphics();
      mask.roundRect(DECK.x0 - 8, DECK.y0 - 6, DECK.x1 - DECK.x0 + 16, DECK.y1 - DECK.y0 + 14, 22).fill(0xffffff);
      deck.addChild(mask);
      deck.mask = mask;
      this.root.addChildAt(deck, 1);
    }

    // Railings along the top + bottom edges (bottom-center anchored props).
    if (this.assets.has("railing_edge")) {
      for (let x = DECK.x0 + 42; x < DECK.x1; x += 82) {
        const rTop = this.assets.sprite("railing_edge");
        rTop.scale.set(1.3);
        rTop.position.set(x, DECK.y0 + 8);
        rTop.alpha = 0.92;
        this.root.addChild(rTop);
        const rBot = this.assets.sprite("railing_edge");
        rBot.scale.set(1.3);
        rBot.position.set(x, DECK.y1 + 6);
        rBot.alpha = 0.92;
        this.root.addChild(rBot);
      }
    }
  }

  /** Place a station device sprite on the deck, with an optional under-glow.
   * Animated entries are frozen on frame 1 — the generated frames aren't
   * pixel-aligned, so playing them makes devices visibly wobble. */
  private placeDevice(name: string, x: number, y: number, scale: number, glowTint?: number, glowAlpha = 0): Container | null {
    let node: Container | null = null;
    if (this.assets.anims[name]) {
      const a = this.assets.anim(name);
      a.gotoAndStop(0);
      node = a;
    } else if (this.assets.sprites[name]) node = this.assets.sprite(name);
    if (!node) return null;
    node.position.set(x, y);
    node.scale.set(scale);
    this.root.addChild(node);
    if (glowTint !== undefined && glowAlpha > 0) {
      const g = new Sprite(getGlowTexture());
      g.anchor.set(0.5);
      g.tint = glowTint;
      g.alpha = glowAlpha;
      g.scale.set(180 / 128);
      g.position.set(x, y - 30);
      this.light.addChild(g);
    }
    return node;
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
      d.node.position.x = d.baseX + d.amp * 10 * w;
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
    const ty = this.player.pos.y - Math.sin(this.facing) * 46 - 26 + Math.sin(c.phase * 2.1) * 3.5;
    const ox = c.pos.x, oy = c.pos.y;
    c.pos.x = approach(c.pos.x, tx, 4, dt);
    c.pos.y = approach(c.pos.y, ty, 4, dt);
    const dx = tx - c.pos.x;
    const moved = Math.hypot(c.pos.x - ox, c.pos.y - oy) / Math.max(dt, 0.001);
    c.root.position.set(c.pos.x, c.pos.y);
    c.root.rotation = Math.sin(c.phase * 2.1) * 0.05;
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
