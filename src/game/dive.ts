// The dive (a run). Ties every system into one roguelite stratum: fixed-timestep
// sim, telegraphed combat, score/combo, XP → level-up upgrades, dash, functional
// interactables + hidden relics, magnetized loot, and depth/level difficulty
// scaling. Permadeath: dying loses unbanked samples but banks depth + score.

import { Container, Graphics, Sprite, Text, TextStyle } from "pixi.js";
import { getGlowTexture } from "../engine/glow";
import type { Engine } from "../engine/app";
import type { AssetStore } from "../engine/assets";
import { Input, KEYS } from "../engine/input";
import type { Enemy, EnemyKind, Player, Vec2 } from "../core/types";
import type { Damageable, HitSink } from "../systems/projectiles";
import { Projectiles } from "../systems/projectiles";
import { Hazards } from "../systems/hazards";
import { updatePlayerMovement } from "../systems/movement";
import { makeSpitter, updateSpitter } from "../systems/spitter";
import { makeDarter, updateDarter } from "../systems/darter";
import { makeDrifter, updateDrifter } from "../systems/drifter";
import { buildStratum, STRATA, STRATA_DEPTH, type ArenaData } from "../content/strata";
import { buildPlayerView, buildSpitterView, buildDarterView, buildDrifterView, type SpitterView } from "../render/actors";
import { PLAYER_SHOT } from "../content/emitters";
import { bus } from "../core/events";
import { COLOR } from "../palette";
import { Rng } from "../core/rng";
import { audio } from "../engine/audio";
import { Pickups, type PickupKind, type PickupSink } from "../systems/pickups";
import { Interactables, type InteractableSink } from "../systems/interactables";
import { freshDash, tickDash, tryDash, type DashState, DASH_COOLDOWN } from "../systems/dash";
import { tickShield, absorb } from "./shield";
import { freshMeta, type MetaState } from "./meta";
import type { DiveResult } from "./persistence";
import {
  freshRun,
  addScore,
  addXp,
  onKill,
  onPlayerHitScore,
  tickScore,
  depthMilestone,
  depthTier,
  applyUpgrade as applyRunUpgrade,
  rollChoices,
  hasUpgradesAvailable,
  maxedAnyUpgrade,
  BASE_HP,
  type RunState,
  type UpgradeChoice,
} from "./progression";

const FIXED = 1 / 60;

export class DiveScene implements HitSink, PickupSink {
  private player: Player;
  private enemies: Enemy[] = [];
  private proj: Projectiles;
  private pickups: Pickups;
  private interactables: Interactables;
  private hazards!: Hazards;
  private arena: ArenaData;
  private stratumIndex = 0;
  private nextStrataDepth = STRATA_DEPTH;
  private charge = 0; // glow-charge from grazing (0..1)
  private dread = 0; // dread clock (0..1) — the deep closing in
  private haulGlow?: Sprite;
  private cardRoot?: Container; // stratum threshold title card
  private cardTimer = 0;
  private run: RunState;
  private dash: DashState = freshDash();
  private rng: Rng;

  private playerView = buildPlayerView();
  private enemyViews = new Map<Enemy, SpitterView>();
  private telegraphs = new Map<Enemy, Sprite>();
  private staticNodes: Container[] = [];
  private liveFx: Sprite[] = [];
  private hitFx: { ring: Graphics; glow: Sprite; age: number; life: number; rMax: number; color: number; sparks: number[] }[] = [];
  private streams: { s: Sprite; axisStart: number; cross: number; span: number; base: number; dir: number; horiz: boolean }[] = [];

  private acc = 0;
  private elapsed = 0;
  private hitstop = 0;
  private depth = 0;
  private shake = 0;
  private spawnTimer = 2;
  private nextResupply = 200; // depth (m) of next interactable resupply
  private eliteKills = 0;
  private lowHp = false;
  private depthAudioT = 0;
  private stepDt = FIXED;
  private shakeEnabled: boolean;
  private lastAim: Vec2 = { x: 1, y: 0 };
  ended = false;

  onGameOver: (r: DiveResult) => void = () => {};
  private interactSink: InteractableSink;

  constructor(
    private engine: Engine,
    private assets: AssetStore,
    private seed: number,
    private reducedMotion = false,
    screenShake = true,
    private meta: MetaState = freshMeta()
  ) {
    this.shakeEnabled = screenShake && !reducedMotion;
    this.rng = new Rng((seed ^ 0x9e3779b9) >>> 0);
    this.arena = buildStratum(0, seed, assets);
    engine.setBgTint(this.arena.bg);
    this.proj = new Projectiles(assets, engine.worldLayer);
    this.pickups = new Pickups(engine.worldLayer, engine.lightLayer);
    this.interactables = new Interactables(this.arena.interactables, engine.worldLayer, engine.lightLayer, assets);
    this.hazards = new Hazards(engine.lightLayer);
    this.run = freshRun(PLAYER_SHOT, meta);
    const maxHp = BASE_HP + meta.bonusMaxHp;
    const shieldMax = meta.shieldCapacity + this.run.stats.shieldCapBonus;
    this.player = {
      pos: { ...this.arena.playerStart },
      vel: { x: 0, y: 0 },
      radius: 10,
      hp: maxHp,
      maxHp,
      fireCooldown: 0,
      invuln: 0,
      alive: true,
      shieldMax,
      shield: shieldMax,
      shieldRegenT: 0,
    };
    this.run.xp.pendingLevelUps += meta.startingLevelUps;
    this.interactSink = {
      loot: (kind, x, y, value) => this.pickups.spawn(kind, x + this.rng.range(-8, 8), y + this.rng.range(-8, 8), value),
      score: (base) => addScore(this.run, base, true),
      xp: (amount) => addXp(this.run, amount),
      relicClaimed: () => {
        this.run.relics += 1;
        this.run.xp.pendingLevelUps += 1; // guaranteed level-up
        audio.relic();
      },
      scan: (x, y) => this.spawnFx("scan_ring", x, y),
      push: (fx, fy) => {
        this.player.vel.x += fx * this.stepDt;
        this.player.vel.y += fy * this.stepDt;
      },
      fx: (anim, x, y) => this.spawnFx(anim, x, y),
      surface: () => this.onSurface(),
    };
    this.buildStaticViews();
    engine.worldLayer.addChild(this.playerView.root);
    engine.lightLayer.addChild(this.playerView.lamp);
    // Haul trail — carried (unbanked) samples glow behind the diver (glow-as-treasure).
    this.haulGlow = new Sprite(getGlowTexture());
    this.haulGlow.anchor.set(0.5);
    this.haulGlow.tint = COLOR.sample;
    this.haulGlow.alpha = 0;
    engine.lightLayer.addChild(this.haulGlow);
    engine.centerOn(this.player.pos.x, this.player.pos.y, true);
    this.showStratumCard();
  }

  // ---- static views ----
  private buildStaticViews(): void {
    for (const c of this.arena.currents) {
      if (!this.assets.has(c.sprite)) continue;
      const horiz = c.half.x >= c.half.y;
      const along = horiz ? c.half.x : c.half.y;
      const span = along * 2;
      const dir = Math.sign(horiz ? c.force.x : c.force.y) || 1;
      const count = Math.max(4, Math.floor(span / 220));
      const startX = horiz ? c.pos.x - c.half.x : c.pos.x;
      const startY = horiz ? c.pos.y : c.pos.y - c.half.y;
      for (let i = 0; i < count; i++) {
        const s = this.assets.sprite(c.sprite);
        s.rotation = horiz ? 0 : Math.PI / 2;
        s.scale.set(0.75);
        s.alpha = 0.22;
        s.tint = COLOR.aqua;
        const jitter = ((i * 53) % 70) - 35;
        const base = span * ((i + 0.5) / count);
        const cross = horiz ? startY + jitter : startX + jitter;
        s.position.set(horiz ? startX + base : cross, horiz ? cross : startY + base);
        this.engine.worldLayer.addChild(s);
        this.staticNodes.push(s as unknown as Container);
        this.streams.push({ s, axisStart: horiz ? startX : startY, cross, span, base, dir, horiz });
      }
    }
    for (const p of this.arena.props) {
      let node: Container;
      if (p.animation && this.assets.has(p.animation)) node = this.assets.anim(p.animation);
      else if (this.assets.has(p.sprite)) node = this.assets.sprite(p.sprite);
      else continue;
      node.position.set(p.pos.x, p.pos.y);
      node.scale.set(p.scale);
      (p.glow ? this.engine.lightLayer : this.engine.worldLayer).addChild(node);
      this.staticNodes.push(node);
    }
  }

  // ---- update ----
  update(dt: number, input: Input): void {
    this.elapsed += dt;
    if (this.hitstop > 0) this.hitstop -= dt;
    if (!this.ended && this.hitstop <= 0) {
      this.acc += dt;
      let steps = 0;
      while (this.acc >= FIXED && steps < 5 && !this.ended) {
        this.step(FIXED, input);
        this.acc -= FIXED;
        steps++;
      }
    }
    this.renderSync(dt, input);
  }

  /** Zero the accumulator so a pause/level-up doesn't cause a catch-up burst. */
  resume(): void {
    this.acc = 0;
  }

  private step(dt: number, input: Input): void {
    this.stepDt = dt;
    const p = this.player;
    p.invuln = Math.max(0, p.invuln - dt);
    p.fireCooldown = Math.max(0, p.fireCooldown - dt);
    if (p.alive && this.run.stats.regenPerSec > 0) p.hp = Math.min(p.maxHp, p.hp + this.run.stats.regenPerSec * dt);
    tickShield(p, { regenRate: this.meta.shieldRegenRate + this.run.stats.shieldRegenBonus, regenDelay: this.meta.shieldRegenDelay }, dt);

    // aim
    const aim = this.engine.screenToWorld(input.state.aimScreen.x, input.state.aimScreen.y);
    const adx = aim.x - p.pos.x;
    const ady = aim.y - p.pos.y;
    const al = Math.hypot(adx, ady) || 1;
    this.lastAim = { x: adx / al, y: ady / al };

    // dash
    tickDash(this.dash, dt);
    if (input.pressed(KEYS.dash)) {
      if (tryDash(p, this.dash, input.state.move, this.lastAim, this.run.stats.dashCooldownMult, this.run.stats.postDashHaste)) {
        this.spawnFx("boost", p.pos.x, p.pos.y);
        this.spawnFx("wake_bubbles", p.pos.x, p.pos.y);
        audio.dash();
      }
    }

    updatePlayerMovement(p, input.state.move, this.arena.currents, dt, this.arena.bounds, this.run.stats.moveSpeedMult);

    // firing (run weapon, with post-dash haste)
    if (input.state.firing && p.fireCooldown <= 0 && p.alive) {
      const ang = Math.atan2(this.lastAim.y, this.lastAim.x);
      this.proj.fireBurst(this.run.weapon, p.pos, ang, "player");
      audio.shoot();
      const haste = this.dash.postHaste > 0 ? 1 + this.run.stats.postDashHaste : 1;
      p.fireCooldown = this.run.fireInterval / haste;
    }

    // enemies — dispatch by archetype (each a distinct verb)
    for (const e of this.enemies) {
      if (!e.alive) continue;
      if (e.kind === "darter") {
        updateDarter(e, dt, p, this.arena.bounds);
        if (p.alive && p.invuln <= 0) {
          const dx = e.pos.x - p.pos.x;
          const dy = e.pos.y - p.pos.y;
          const rr = e.radius + p.radius;
          if (dx * dx + dy * dy <= rr * rr) this.onPlayerHit(e.contactDamage, { x: p.pos.x, y: p.pos.y });
        }
      } else if (e.kind === "drifter") {
        updateDrifter(e, dt, p, this.arena.bounds, (x, y) => this.hazards.spawn(x, y, 26, 4.2, 10, COLOR.coralBright));
      } else {
        updateSpitter(e, dt, p, this.proj, this.arena.bounds);
      }
    }

    this.proj.enemySlow = this.run.stats.enemyBulletSlow;
    this.proj.update(dt, p, this.enemies, this.interactables.destructibles(), this, this.arena.bounds);
    this.hazards.update(dt, p, this);
    this.pickups.update(dt, p, this.run.stats.magnetRadius, this.elapsed, this);
    this.interactables.update(dt, p.pos, p.alive, p.radius, this.elapsed, this.interactSink);

    // Glow double-bind: charge bleeds slowly; dread rises faster the brighter you are
    // (charge) and the longer you linger. The deep hunts the bright.
    this.charge = Math.max(0, this.charge - dt * 0.02);
    this.dread = Math.min(1, this.dread + dt * (0.017 + this.charge * 0.03));
    if (this.dread >= 1) {
      const a = this.rng.range(0, Math.PI * 2);
      this.hazards.spawn(p.pos.x + Math.cos(a) * 95, p.pos.y + Math.sin(a) * 95, 46, 2.4, 16, COLOR.coralBright);
      this.dread = 0.5;
    }

    // Descend to the next authored stratum at the depth threshold (resets dread).
    if (this.stratumIndex < STRATA.length - 1 && this.depth >= this.nextStrataDepth) {
      this.nextStrataDepth += STRATA_DEPTH;
      this.transitionStratum(this.stratumIndex + 1);
    }

    // scoring + depth
    tickScore(this.run, dt);
    this.depth += dt * 3;
    depthMilestone(this.run, this.depth);

    // waves (scaled by depth AND build power)
    this.spawnTimer -= dt;
    const tier = depthTier(this.depth, this.run.xp.level);
    const maxAlive = Math.min(6, 2 + Math.floor(tier));
    const interval = Math.max(1.2, 3.2 - tier * 0.28);
    const aliveCount = this.enemies.reduce((n, e) => n + (e.alive ? 1 : 0), 0);
    if (this.spawnTimer <= 0 && aliveCount < maxAlive) {
      this.spawnEnemy(tier);
      this.spawnTimer = interval;
    }

    // Resupply: seed a fresh set of interactables every 200 m so the loot/explore
    // loop never goes permanently dark (the fixed-budget problem).
    if (this.depth >= this.nextResupply) {
      this.nextResupply += 200;
      this.resupplyInteractables();
    }

    // Ambient drone deepens with depth; low-HP warning.
    this.depthAudioT += dt;
    if (this.depthAudioT >= 0.5) {
      this.depthAudioT = 0;
      audio.setDepth(this.depth);
    }
    const lowNow = p.alive && p.hp / p.maxHp < 0.25;
    if (lowNow && !this.lowHp) audio.lowHp();
    this.lowHp = lowNow;

    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 60);

    if (!p.alive && !this.ended) {
      this.ended = true;
      this.onGameOver(this.buildResult(false));
    }
  }

  private buildResult(surfaced: boolean): DiveResult {
    return {
      depth: this.depth,
      score: this.run.score.score,
      samples: this.run.samples,
      kills: this.run.kills,
      elites: this.eliteKills,
      relics: this.run.relics,
      level: this.run.xp.level,
      surfaced,
      maxedUpgrade: maxedAnyUpgrade(this.run),
      seen: [],
    };
  }

  private spawnEnemy(tier: number): void {
    let best = this.arena.spawns[0];
    let bestD = -1;
    for (const s of this.arena.spawns) {
      const d = Math.hypot(s.x - this.player.pos.x, s.y - this.player.pos.y);
      if (d > bestD) {
        bestD = d;
        best = s;
      }
    }
    const elite = this.rng.chance(Math.min(0.35, tier * 0.06));
    const kind = this.pickFauna();

    let e: Enemy;
    let v: SpitterView;
    if (kind === "darter") {
      const hp = Math.round(32 * (1 + tier * 0.16) * (elite ? 2.6 : 1));
      const speed = Math.min(96 * 1.6, 96 * (1 + tier * 0.05)) * (elite ? 1.2 : 1);
      e = makeDarter(best, { elite, hp, speed });
      v = buildDarterView(elite);
    } else if (kind === "drifter") {
      const hp = Math.round(42 * (1 + tier * 0.16) * (elite ? 2.6 : 1));
      const speed = 58 * (1 + tier * 0.05) * (elite ? 1.15 : 1);
      e = makeDrifter(best, { elite, hp, speed });
      v = buildDrifterView(elite);
    } else {
      const baseHp = 60 * (1 + tier * 0.18) * (elite ? 3 : 1);
      const speed = Math.min(78 * 1.5, 78 * (1 + tier * 0.06));
      const bulletCount = Math.min(22, 14 + Math.floor(tier)) + (elite ? 4 : 0);
      e = makeSpitter(best, { elite, hp: Math.round(baseHp), speed, bulletCount });
      v = buildSpitterView(elite);
    }
    this.enemies.push(e);
    this.enemyViews.set(e, v);
    this.engine.worldLayer.addChild(v.root);
    this.engine.lightLayer.addChild(v.glow);
  }

  private pickFauna(): EnemyKind {
    const f = this.arena.fauna;
    let total = 0;
    for (const x of f) total += x.weight;
    let r = this.rng.next() * total;
    for (const x of f) {
      r -= x.weight;
      if (r <= 0) return x.kind;
    }
    return f[0].kind;
  }

  /** Descend to the next authored stratum: tear down the world, rebuild the place,
   * keep player + run. Reuses the destroy()-style teardown. */
  private transitionStratum(next: number): void {
    this.clearWorld();
    this.stratumIndex = next;
    this.arena = buildStratum(next, this.seed, this.assets);
    this.engine.setBgTint(this.arena.bg);
    this.interactables = new Interactables(this.arena.interactables, this.engine.worldLayer, this.engine.lightLayer, this.assets);
    this.pickups = new Pickups(this.engine.worldLayer, this.engine.lightLayer);
    this.buildStaticViews();
    this.player.pos.x = this.arena.playerStart.x;
    this.player.pos.y = this.arena.playerStart.y;
    this.player.vel.x = 0;
    this.player.vel.y = 0;
    this.engine.centerOn(this.player.pos.x, this.player.pos.y, true);
    this.dread = 0;
    this.spawnTimer = 2;
    this.showStratumCard();
    audio.relic();
  }

  private clearWorld(): void {
    this.proj.clear();
    this.hazards.clear();
    this.pickups.destroy();
    this.interactables.destroy();
    for (const fx of this.liveFx) {
      fx.parent?.removeChild(fx);
      fx.destroy();
    }
    this.liveFx = [];
    for (const fx of this.hitFx) {
      fx.ring.parent?.removeChild(fx.ring);
      fx.ring.destroy();
      fx.glow.parent?.removeChild(fx.glow);
      fx.glow.destroy();
    }
    this.hitFx = [];
    for (const n of this.staticNodes) {
      n.parent?.removeChild(n);
      n.destroy({ children: true });
    }
    this.staticNodes = [];
    this.streams = [];
    for (const [, v] of this.enemyViews) {
      v.root.destroy({ children: true });
      v.glow.destroy();
    }
    this.enemyViews.clear();
    for (const [, tg] of this.telegraphs) tg.destroy();
    this.telegraphs.clear();
    this.enemies = [];
  }

  private showStratumCard(): void {
    if (this.cardRoot) {
      this.cardRoot.parent?.removeChild(this.cardRoot);
      this.cardRoot.destroy({ children: true });
    }
    const c = new Container();
    const w = this.engine.width;
    const h = this.engine.height;
    const style = (size: number, color: number, weight: "normal" | "bold" = "normal") =>
      new TextStyle({ fontFamily: "Consolas, monospace", fontSize: size, fill: color, fontWeight: weight, letterSpacing: 4, align: "center" });
    const num = new Text({ text: `STRATUM ${this.stratumIndex + 1}${this.arena.isFloor ? "  ·  THE FLOOR" : ""}`, style: style(13, COLOR.teal) });
    const name = new Text({ text: this.arena.name.toUpperCase(), style: style(34, COLOR.aquaBright, "bold") });
    const tag = new Text({ text: this.arena.tagline, style: style(15, COLOR.teal) });
    for (const t of [num, name, tag]) t.anchor.set(0.5);
    num.position.set(w / 2, h * 0.34);
    name.position.set(w / 2, h * 0.34 + 30);
    tag.position.set(w / 2, h * 0.34 + 66);
    c.addChild(num, name, tag);
    this.engine.uiRoot.addChild(c);
    this.cardRoot = c;
    this.cardTimer = 2.6;
  }

  private resupplyInteractables(): void {
    const b = this.arena.bounds;
    const kinds: ("loot_pod" | "salvage_crate" | "mineral_crystal")[] = ["loot_pod", "loot_pod", "salvage_crate", "mineral_crystal"];
    for (const k of kinds) {
      const pos = { x: this.rng.range(90, b.w - 90), y: this.rng.range(90, b.h - 90) };
      if (Math.hypot(pos.x - this.player.pos.x, pos.y - this.player.pos.y) < 220) continue;
      this.interactables.spawnOne(k, pos);
    }
    if (this.rng.chance(0.5)) {
      const edge = this.rng.chance(0.5)
        ? { x: this.rng.range(80, 160), y: this.rng.range(120, b.h - 120) }
        : { x: this.rng.range(b.w - 160, b.w - 80), y: this.rng.range(120, b.h - 120) };
      this.interactables.spawnOne("relic", edge);
    }
  }

  // ---- HitSink ----
  onPlayerHit(damage: number, at: Vec2): void {
    const { hpDamage, absorbed } = absorb(this.player, damage);
    this.player.hp -= hpDamage;
    this.player.invuln = 0.85;
    if (this.shakeEnabled) this.shake = absorbed ? 5 : 10;
    if (!this.reducedMotion) this.hitstop = absorbed ? 0.03 : 0.05;
    // A fully-shielded hit keeps your combo — the payoff for a shield build.
    if (!absorbed) onPlayerHitScore(this.run);
    audio.playerHit();
    this.spawnHitFx(at.x, at.y, absorbed ? COLOR.aquaBright : COLOR.coralBright, true);
    bus.emit("player:hit", { damage });
    if (this.player.hp <= 0) {
      this.player.hp = 0;
      this.player.alive = false;
      bus.emit("player:died", undefined);
    }
  }
  onEnemyHit(enemy: Enemy, damage: number, at: Vec2): void {
    enemy.flash = 0.12;
    if (this.run.stats.lifestealFrac > 0 && this.player.alive) {
      this.player.hp = Math.min(this.player.maxHp, this.player.hp + damage * this.run.stats.lifestealFrac);
    }
    this.spawnHitFx(at.x, at.y, COLOR.aquaBright, false);
  }
  onEnemyKilled(enemy: Enemy): void {
    onKill(this.run, enemy.elite);
    if (enemy.elite) this.eliteKills++;
    audio.kill();
    if (this.shakeEnabled) this.shake = enemy.elite ? 10 : 6;
    if (!this.reducedMotion) this.hitstop = 0.04;
    this.spawnFx("sample_burst", enemy.pos.x, enemy.pos.y);
    // Loot: elites drop richer.
    const drops = enemy.elite ? 2 : 1;
    for (let i = 0; i < drops; i++) this.pickups.spawn("sample", enemy.pos.x, enemy.pos.y, 1);
    if (enemy.elite) {
      this.pickups.spawn("xp", enemy.pos.x, enemy.pos.y, 20);
      if (this.rng.chance(0.25)) this.pickups.spawn("upgrade", enemy.pos.x, enemy.pos.y, 0);
    }
    bus.emit("enemy:killed", { kind: enemy.kind, pos: { ...enemy.pos } });
  }
  onDestructibleHit(_d: Damageable, _damage: number, at: Vec2): void {
    this.spawnHitFx(at.x, at.y, COLOR.aquaBright, false);
  }
  onDestructibleDestroyed(d: Damageable): void {
    this.interactables.onDestroyed(d, this.interactSink);
  }
  onGraze(): void {
    this.charge = Math.min(1, this.charge + 0.05);
    if (this.charge >= 1) this.bioPulse();
  }

  /** Full glow charge → a bullet-clearing shockwave that also damages nearby enemies. */
  private bioPulse(): void {
    const p = this.player;
    this.charge = 0;
    this.proj.popRadius(p.pos.x, p.pos.y, 165);
    this.spawnHitFx(p.pos.x, p.pos.y, COLOR.aquaBright, true);
    if (this.shakeEnabled) this.shake = 8;
    const r2 = 165 * 165;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const dx = e.pos.x - p.pos.x;
      const dy = e.pos.y - p.pos.y;
      if (dx * dx + dy * dy <= r2) {
        e.hp -= 24;
        e.flash = 0.12;
        if (e.hp <= 0) {
          e.alive = false;
          this.onEnemyKilled(e);
        }
      }
    }
    audio.pickup();
  }

  private onSurface(): void {
    if (this.ended) return;
    this.ended = true;
    this.onGameOver(this.buildResult(true));
  }

  // ---- PickupSink ----
  onPickup(kind: PickupKind, value: number): void {
    const p = this.player;
    switch (kind) {
      case "sample":
        this.run.samples += 1;
        addScore(this.run, 15, false);
        addXp(this.run, 4);
        audio.sample();
        break;
      case "hp":
        p.hp = Math.min(p.maxHp, p.hp + 22);
        audio.pickup();
        break;
      case "xp":
        addXp(this.run, value || 16);
        audio.pickup();
        break;
      case "upgrade":
        this.run.xp.pendingLevelUps += 1;
        this.spawnFx("codex_flash", p.pos.x, p.pos.y);
        audio.pickup();
        break;
    }
  }

  // Procedural hit burst — an expanding additive ring + radial sparks. Replaces the
  // extracted impact sprites (which had a clipped flat edge) for the frequent hits.
  private spawnHitFx(x: number, y: number, color: number, big = false): void {
    const ring = new Graphics();
    ring.position.set(x, y);
    this.engine.lightLayer.addChild(ring);
    const glow = new Sprite(getGlowTexture());
    glow.anchor.set(0.5);
    glow.tint = color;
    glow.position.set(x, y);
    this.engine.lightLayer.addChild(glow);
    const n = big ? 8 : 5;
    const seed = x * 0.7 + y * 0.31;
    const sparks: number[] = [];
    for (let i = 0; i < n; i++) sparks.push((i / n) * Math.PI * 2 + seed);
    this.hitFx.push({ ring, glow, age: 0, life: big ? 0.32 : 0.22, rMax: big ? 34 : 22, color, sparks });
  }

  private spawnFx(anim: string, x: number, y: number): void {
    if (!this.assets.has(anim)) return;
    const a = this.assets.anim(anim);
    a.loop = false;
    a.position.set(x, y);
    a.gotoAndPlay(0);
    this.liveFx.push(a);
    a.onComplete = () => {
      const i = this.liveFx.indexOf(a);
      if (i >= 0) this.liveFx.splice(i, 1);
      a.parent?.removeChild(a);
      a.destroy();
    };
    this.engine.lightLayer.addChild(a);
  }

  // ---- render ----
  private renderSync(dt: number, _input: Input): void {
    const p = this.player;
    const flowSpeed = 45;
    for (const st of this.streams) {
      const along = (((st.base + this.elapsed * flowSpeed * st.dir) % st.span) + st.span) % st.span;
      if (st.horiz) st.s.position.set(st.axisStart + along, st.cross);
      else st.s.position.set(st.cross, st.axisStart + along);
    }

    // Procedural hit bursts — expand + fade, then self-remove.
    if (this.hitFx.length) {
      for (const fx of this.hitFx) {
        fx.age += dt;
        const t = Math.min(1, fx.age / fx.life);
        const ease = 1 - (1 - t) * (1 - t);
        const r = fx.rMax * ease;
        const a = 1 - t;
        fx.ring.clear();
        fx.ring.circle(0, 0, r).stroke({ width: 2 * (1 - t) + 0.5, color: fx.color, alpha: a * 0.9 });
        for (const ang of fx.sparks) {
          fx.ring
            .moveTo(Math.cos(ang) * r * 0.5, Math.sin(ang) * r * 0.5)
            .lineTo(Math.cos(ang) * r * 1.4, Math.sin(ang) * r * 1.4)
            .stroke({ width: 1.5 * (1 - t) + 0.3, color: fx.color, alpha: a });
        }
        fx.glow.alpha = a * 0.55;
        fx.glow.scale.set((r * 1.6) / 128);
      }
      if (this.hitFx.some((fx) => fx.age >= fx.life)) {
        for (const fx of this.hitFx) {
          if (fx.age < fx.life) continue;
          fx.ring.parent?.removeChild(fx.ring);
          fx.ring.destroy();
          fx.glow.parent?.removeChild(fx.glow);
          fx.glow.destroy();
        }
        this.hitFx = this.hitFx.filter((fx) => fx.age < fx.life);
      }
    }

    this.playerView.root.visible = p.alive;
    this.playerView.root.position.set(p.pos.x, p.pos.y);
    this.playerView.root.rotation = Math.atan2(this.lastAim.y, this.lastAim.x);
    this.playerView.root.alpha = p.invuln > 0 ? (Math.floor(p.invuln * 20) % 2 ? 0.4 : 1) : 1;
    this.playerView.lamp.position.set(p.pos.x, p.pos.y);
    this.playerView.lamp.visible = p.alive;
    // glow-as-weapon: the core brightens + pulses with graze charge
    const ch = this.charge;
    this.playerView.lamp.alpha = (0.3 + ch * 0.5) * (p.alive ? 1 : 0);
    this.playerView.lamp.scale.set((155 / 128) * (1 + ch * 0.4 + (ch >= 1 ? 0.12 * Math.sin(this.elapsed * 18) : 0)));
    // glow-as-treasure: unbanked haul glows behind the diver, growing with the haul
    if (this.haulGlow) {
      const s = this.run.samples;
      this.haulGlow.visible = p.alive && s > 0;
      this.haulGlow.position.set(p.pos.x - this.lastAim.x * 20, p.pos.y - this.lastAim.y * 20);
      this.haulGlow.scale.set(Math.min(150, 30 + s * 2.5) / 128);
      this.haulGlow.alpha = Math.min(0.5, 0.14 + s * 0.014);
    }
    // glow-as-beacon: dread darkens the screen edges (the deep closing in)
    this.engine.setDread(this.dread);
    // threshold title card fade in/out
    if (this.cardTimer > 0 && this.cardRoot) {
      this.cardTimer -= dt;
      this.cardRoot.alpha = this.cardTimer > 1.6 ? (2.6 - this.cardTimer) / 1.0 : Math.min(1, this.cardTimer / 0.8);
      if (this.cardTimer <= 0) {
        this.cardRoot.parent?.removeChild(this.cardRoot);
        this.cardRoot.destroy({ children: true });
        this.cardRoot = undefined;
      }
    }

    for (const e of this.enemies) {
      const v = this.enemyViews.get(e);
      if (!v) continue;
      if (!e.alive) {
        this.engine.worldLayer.removeChild(v.root);
        this.engine.lightLayer.removeChild(v.glow);
        v.root.destroy({ children: true });
        v.glow.destroy();
        this.enemyViews.delete(e);
        const tg = this.telegraphs.get(e);
        if (tg) {
          tg.parent?.removeChild(tg);
          tg.destroy();
          this.telegraphs.delete(e);
        }
        continue;
      }
      v.root.position.set(e.pos.x, e.pos.y);
      v.glow.position.set(e.pos.x, e.pos.y);
      v.root.scale.set(e.flash > 0 ? 1.15 : 1);
      if (e.kind === "darter") {
        if (Math.hypot(e.vel.x, e.vel.y) > 6) v.root.rotation = Math.atan2(e.vel.y, e.vel.x);
        else v.root.rotation = Math.atan2(this.player.pos.y - e.pos.y, this.player.pos.x - e.pos.x);
      }
      this.syncTelegraph(e);
    }
    this.enemies = this.enemies.filter((e) => e.alive || this.enemyViews.has(e));

    this.engine.centerOn(p.pos.x, p.pos.y);
    this.engine.updateCamera(dt);
    if (this.shake > 0) {
      const sx = (Math.sin(this.elapsed * 137.13) * this.shake) | 0;
      const sy = (Math.cos(this.elapsed * 91.7) * this.shake) | 0;
      this.engine.sceneRoot.position.x += sx;
      this.engine.sceneRoot.position.y += sy;
    }
  }

  private syncTelegraph(e: Enemy): void {
    let tg = this.telegraphs.get(e);
    // Resolve the tell from the spitter's pending attack OR the darter's lunge wind-up.
    let name: string | null = null;
    let total = 0;
    let aimed = false;
    let baseScale = 1;
    if (e.telegraphTimer > 0) {
      if (e.pendingSpec?.telegraph) {
        name = e.pendingSpec.telegraph.sprite;
        total = e.pendingSpec.telegraph.time;
        aimed = e.pendingSpec.aim === "aimed";
        baseScale = e.pendingSpec.telegraph.scale ?? 1;
      } else if (e.kind === "darter") {
        name = "telegraph_aim_line"; // a growing aim line = "I'm about to lunge here"
        total = 0.55;
        aimed = true;
        baseScale = 1.6;
      }
    }
    if (name) {
      const hasArt = this.assets.has(name);
      if (!tg) {
        tg = hasArt ? this.assets.sprite(name) : new Sprite((this.playerView.lamp as Sprite).texture);
        if (!hasArt) {
          tg.anchor.set(0.5);
          tg.tint = COLOR.coral;
        }
        this.telegraphs.set(e, tg);
        this.engine.lightLayer.addChild(tg);
      } else if (hasArt && tg.texture !== this.assets.texture(name)) {
        tg.texture = this.assets.texture(name);
      }
      const t = 1 - e.telegraphTimer / total;
      tg.visible = true;
      tg.position.set(e.pos.x, e.pos.y);
      tg.alpha = 0.35 + 0.55 * t;
      tg.scale.set(baseScale * (0.7 + 0.5 * t));
      if (aimed) tg.rotation = Math.atan2(this.player.pos.y - e.pos.y, this.player.pos.x - e.pos.x);
    } else if (tg) {
      tg.visible = false;
    }
  }

  // ---- level-up API (driven by main.ts) ----
  consumeLevelUp(): boolean {
    // If the upgrade pool is exhausted (all maxed), a pending pick can't be filled
    // — drain it into a fallback reward instead of opening an empty (crashing) card.
    while (this.run.xp.pendingLevelUps > 0 && !hasUpgradesAvailable(this.run)) {
      this.player.maxHp += 15;
      this.player.hp = Math.min(this.player.maxHp, this.player.hp + 15);
      addScore(this.run, 500, false);
      this.run.xp.pendingLevelUps -= 1;
    }
    return this.run.xp.pendingLevelUps > 0;
  }
  rollUpgradeChoices(): UpgradeChoice[] {
    return rollChoices(this.run);
  }
  applyUpgrade(id: string): void {
    const beforeShield = this.run.stats.shieldCapBonus;
    const dHp = applyRunUpgrade(this.run, id, PLAYER_SHOT);
    if (dHp > 0) {
      this.player.maxHp += dHp;
      this.player.hp = Math.min(this.player.maxHp, this.player.hp + dHp);
    }
    const dCap = this.run.stats.shieldCapBonus - beforeShield;
    if (dCap > 0) {
      this.player.shieldMax += dCap;
      this.player.shield += dCap;
    }
    this.run.xp.pendingLevelUps = Math.max(0, this.run.xp.pendingLevelUps - 1);
  }

  threatMarkers(w: number, h: number): { x: number; y: number; angle: number }[] {
    const out: { x: number; y: number; angle: number }[] = [];
    const m = 26;
    const cx = w / 2;
    const cy = h / 2;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const s = this.engine.worldToScreen(e.pos.x, e.pos.y);
      if (s.x >= 0 && s.x <= w && s.y >= 0 && s.y <= h) continue;
      const angle = Math.atan2(s.y - cy, s.x - cx);
      out.push({ x: Math.max(m, Math.min(w - m, s.x)), y: Math.max(m, Math.min(h - m, s.y)), angle });
    }
    return out;
  }

  destroy(): void {
    this.proj.destroy();
    this.hazards.destroy();
    this.pickups.destroy();
    this.interactables.destroy();
    this.haulGlow?.destroy();
    if (this.cardRoot) {
      this.cardRoot.parent?.removeChild(this.cardRoot);
      this.cardRoot.destroy({ children: true });
      this.cardRoot = undefined;
    }
    this.engine.setDread(0);
    this.engine.setBgTint(COLOR.deepNavy);
    for (const a of this.liveFx) {
      a.parent?.removeChild(a);
      a.destroy();
    }
    this.liveFx = [];
    for (const fx of this.hitFx) {
      fx.ring.parent?.removeChild(fx.ring);
      fx.ring.destroy();
      fx.glow.parent?.removeChild(fx.glow);
      fx.glow.destroy();
    }
    this.hitFx = [];
    for (const n of this.staticNodes) {
      n.parent?.removeChild(n);
      n.destroy({ children: true });
    }
    for (const [, v] of this.enemyViews) {
      v.root.destroy({ children: true });
      v.glow.destroy();
    }
    for (const [, tg] of this.telegraphs) tg.destroy();
    this.enemyViews.clear();
    this.telegraphs.clear();
    this.playerView.root.destroy({ children: true });
    this.playerView.lamp.destroy();
  }

  // ---- getters for HUD / gameover ----
  get runState(): RunState {
    return this.run;
  }
  get hpRatio(): number {
    return this.player.hp / this.player.maxHp;
  }
  get hp(): number {
    return this.player.hp;
  }
  get maxHp(): number {
    return this.player.maxHp;
  }
  get shield(): number {
    return this.player.shield;
  }
  get shieldMax(): number {
    return this.player.shieldMax;
  }
  get currentDepth(): number {
    return this.depth;
  }
  get scoreValue(): number {
    return this.run.score.score;
  }
  get bankedSamples(): number {
    return this.run.samples;
  }
  get level(): number {
    return this.run.xp.level;
  }
  get relicsFound(): number {
    return this.run.relics;
  }
  get kills(): number {
    return this.run.kills;
  }
  get dashCooldownFrac(): number {
    return Math.max(0, Math.min(1, this.dash.cooldown / (DASH_COOLDOWN * this.run.stats.dashCooldownMult)));
  }
  get enemyCount(): number {
    return this.enemies.reduce((n, e) => n + (e.alive ? 1 : 0), 0);
  }
  get darterCount(): number {
    return this.enemies.reduce((n, e) => n + (e.alive && e.kind === "darter" ? 1 : 0), 0);
  }
  get drifterCount(): number {
    return this.enemies.reduce((n, e) => n + (e.alive && e.kind === "drifter" ? 1 : 0), 0);
  }
  get stratum(): number {
    return this.stratumIndex;
  }
  get chargeVal(): number {
    return this.charge;
  }
  get dreadVal(): number {
    return this.dread;
  }
  get hazardCount(): number {
    return this.hazards.activeCount;
  }
  /** Debug: jump depth (QA only). */
  debugSetDepth(d: number): void {
    this.depth = d;
  }
  get bulletCount(): number {
    return this.proj.activeCount;
  }
}
