// The dive (a run). Ties every system into one roguelite stratum: fixed-timestep
// sim, telegraphed combat, score/combo, XP → level-up upgrades, dash, functional
// interactables + hidden relics, magnetized loot, and depth/level difficulty
// scaling. Permadeath: dying loses unbanked samples but banks depth + score.

import { Container, Sprite } from "pixi.js";
import type { Engine } from "../engine/app";
import type { AssetStore } from "../engine/assets";
import { Input, KEYS } from "../engine/input";
import type { Enemy, Player, Vec2 } from "../core/types";
import type { Damageable, HitSink } from "../systems/projectiles";
import { Projectiles } from "../systems/projectiles";
import { updatePlayerMovement } from "../systems/movement";
import { makeSpitter, updateSpitter } from "../systems/spitter";
import { buildTwilightArena, type ArenaData } from "../content/biome_twilight";
import { buildPlayerView, buildSpitterView, type SpitterView } from "../render/actors";
import { PLAYER_SHOT } from "../content/emitters";
import { bus } from "../core/events";
import { COLOR } from "../palette";
import { Rng } from "../core/rng";
import { Pickups, type PickupKind, type PickupSink } from "../systems/pickups";
import { Interactables, type InteractableSink } from "../systems/interactables";
import { freshDash, tickDash, tryDash, type DashState, DASH_COOLDOWN } from "../systems/dash";
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
  private arena: ArenaData;
  private run: RunState;
  private dash: DashState = freshDash();
  private rng: Rng;

  private playerView = buildPlayerView();
  private enemyViews = new Map<Enemy, SpitterView>();
  private telegraphs = new Map<Enemy, Sprite>();
  private staticNodes: Container[] = [];
  private liveFx: Sprite[] = [];
  private streams: { s: Sprite; axisStart: number; cross: number; span: number; base: number; dir: number; horiz: boolean }[] = [];

  private acc = 0;
  private elapsed = 0;
  private hitstop = 0;
  private depth = 0;
  private shake = 0;
  private spawnTimer = 2;
  private stepDt = FIXED;
  private shakeEnabled: boolean;
  private lastAim: Vec2 = { x: 1, y: 0 };
  ended = false;

  onGameOver: (depth: number, score: number, samples: number) => void = () => {};
  private interactSink: InteractableSink;

  constructor(
    private engine: Engine,
    private assets: AssetStore,
    seed: number,
    private reducedMotion = false,
    screenShake = true
  ) {
    this.shakeEnabled = screenShake && !reducedMotion;
    this.rng = new Rng((seed ^ 0x9e3779b9) >>> 0);
    this.arena = buildTwilightArena(seed, assets);
    this.proj = new Projectiles(assets, engine.worldLayer);
    this.pickups = new Pickups(engine.worldLayer, engine.lightLayer);
    this.interactables = new Interactables(this.arena.interactables, engine.worldLayer, engine.lightLayer, assets);
    this.run = freshRun(PLAYER_SHOT);
    this.player = {
      pos: { ...this.arena.playerStart },
      vel: { x: 0, y: 0 },
      radius: 10,
      hp: BASE_HP,
      maxHp: BASE_HP,
      fireCooldown: 0,
      invuln: 0,
      alive: true,
    };
    this.interactSink = {
      loot: (kind, x, y, value) => this.pickups.spawn(kind, x + this.rng.range(-8, 8), y + this.rng.range(-8, 8), value),
      score: (base) => addScore(this.run, base, true),
      xp: (amount) => addXp(this.run, amount),
      relicClaimed: () => {
        this.run.relics += 1;
        this.run.xp.pendingLevelUps += 1; // guaranteed level-up
      },
      scan: (x, y) => this.spawnFx("scan_ring", x, y),
      push: (fx, fy) => {
        this.player.vel.x += fx * this.stepDt;
        this.player.vel.y += fy * this.stepDt;
      },
      fx: (anim, x, y) => this.spawnFx(anim, x, y),
    };
    this.buildStaticViews();
    engine.worldLayer.addChild(this.playerView.root);
    engine.lightLayer.addChild(this.playerView.lamp);
    engine.centerOn(this.player.pos.x, this.player.pos.y, true);
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
      while (this.acc >= FIXED && steps < 5) {
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
      }
    }

    updatePlayerMovement(p, input.state.move, this.arena.currents, dt, this.arena.bounds, this.run.stats.moveSpeedMult);

    // firing (run weapon, with post-dash haste)
    if (input.state.firing && p.fireCooldown <= 0 && p.alive) {
      const ang = Math.atan2(this.lastAim.y, this.lastAim.x);
      this.proj.fireBurst(this.run.weapon, p.pos, ang, "player");
      const haste = this.dash.postHaste > 0 ? 1 + this.run.stats.postDashHaste : 1;
      p.fireCooldown = this.run.fireInterval / haste;
    }

    for (const e of this.enemies) if (e.alive) updateSpitter(e, dt, p, this.proj, this.arena.bounds);

    this.proj.enemySlow = this.run.stats.enemyBulletSlow;
    this.proj.update(dt, p, this.enemies, this.interactables.destructibles(), this, this.arena.bounds);
    this.pickups.update(dt, p, this.run.stats.magnetRadius, this.elapsed, this);
    this.interactables.update(dt, p.pos, p.alive, p.radius, this.elapsed, this.interactSink);

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
      this.spawnSpitter(tier);
      this.spawnTimer = interval;
    }
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 60);

    if (!p.alive && !this.ended) {
      this.ended = true;
      this.onGameOver(this.depth, this.run.score.score, this.run.samples);
    }
  }

  private spawnSpitter(tier: number): void {
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
    const baseHp = 60 * (1 + tier * 0.18) * (elite ? 3 : 1);
    const speed = Math.min(78 * 1.5, 78 * (1 + tier * 0.06));
    const bulletCount = Math.min(22, 14 + Math.floor(tier)) + (elite ? 4 : 0);
    const e = makeSpitter(best, { elite, hp: Math.round(baseHp), speed, bulletCount });
    this.enemies.push(e);
    const v = buildSpitterView(elite);
    this.enemyViews.set(e, v);
    this.engine.worldLayer.addChild(v.root);
    this.engine.lightLayer.addChild(v.glow);
  }

  // ---- HitSink ----
  onPlayerHit(damage: number, at: Vec2): void {
    this.player.hp -= damage;
    this.player.invuln = 0.85;
    if (this.shakeEnabled) this.shake = 10;
    if (!this.reducedMotion) this.hitstop = 0.05;
    onPlayerHitScore(this.run);
    this.spawnFx("impact_coral", at.x, at.y);
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
    this.spawnFx("impact_aqua", at.x, at.y);
  }
  onEnemyKilled(enemy: Enemy): void {
    onKill(this.run, enemy.elite);
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
    this.spawnFx("impact_aqua", at.x, at.y);
  }
  onDestructibleDestroyed(d: Damageable): void {
    this.interactables.onDestroyed(d, this.interactSink);
  }

  // ---- PickupSink ----
  onPickup(kind: PickupKind, value: number): void {
    const p = this.player;
    switch (kind) {
      case "sample":
        this.run.samples += 1;
        addScore(this.run, 15, false);
        addXp(this.run, 4);
        break;
      case "hp":
        p.hp = Math.min(p.maxHp, p.hp + 22);
        break;
      case "xp":
        addXp(this.run, value || 16);
        break;
      case "upgrade":
        this.run.xp.pendingLevelUps += 1;
        this.spawnFx("codex_flash", p.pos.x, p.pos.y);
        break;
    }
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

    this.playerView.root.visible = p.alive;
    this.playerView.root.position.set(p.pos.x, p.pos.y);
    this.playerView.root.rotation = Math.atan2(this.lastAim.y, this.lastAim.x);
    this.playerView.root.alpha = p.invuln > 0 ? (Math.floor(p.invuln * 20) % 2 ? 0.4 : 1) : 1;
    this.playerView.lamp.position.set(p.pos.x, p.pos.y);
    this.playerView.lamp.visible = p.alive;

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
    if (e.telegraphTimer > 0 && e.pendingSpec?.telegraph) {
      const spec = e.pendingSpec;
      const name = spec.telegraph!.sprite;
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
      const total = spec.telegraph!.time;
      const t = 1 - e.telegraphTimer / total;
      tg.visible = true;
      tg.position.set(e.pos.x, e.pos.y);
      tg.alpha = 0.35 + 0.55 * t;
      const base = spec.telegraph!.scale ?? 1;
      tg.scale.set(base * (0.7 + 0.5 * t));
      if (spec.aim === "aimed") tg.rotation = Math.atan2(this.player.pos.y - e.pos.y, this.player.pos.x - e.pos.x);
    } else if (tg) {
      tg.visible = false;
    }
  }

  // ---- level-up API (driven by main.ts) ----
  consumeLevelUp(): boolean {
    return this.run.xp.pendingLevelUps > 0;
  }
  rollUpgradeChoices(): UpgradeChoice[] {
    return rollChoices(this.run);
  }
  applyUpgrade(id: string): void {
    const dHp = applyRunUpgrade(this.run, id, PLAYER_SHOT);
    if (dHp > 0) {
      this.player.maxHp += dHp;
      this.player.hp = Math.min(this.player.maxHp, this.player.hp + dHp);
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
    this.pickups.destroy();
    this.interactables.destroy();
    for (const a of this.liveFx) {
      a.parent?.removeChild(a);
      a.destroy();
    }
    this.liveFx = [];
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
  get bulletCount(): number {
    return this.proj.activeCount;
  }
}
