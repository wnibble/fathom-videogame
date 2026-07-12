// The dive (a run). Ties every system together into one runnable stratum:
// Twilight Drift. Fixed-timestep simulation (determinism), telegraphed combat,
// juice (hit flash, impact VFX, screen shake), rising depth, permadeath.

import { Container, Sprite } from "pixi.js";
import type { Engine } from "../engine/app";
import type { AssetStore } from "../engine/assets";
import type { Input } from "../engine/input";
import type { Enemy, Player, Vec2 } from "../core/types";
import type { HitSink } from "../systems/projectiles";
import { Projectiles } from "../systems/projectiles";
import { updatePlayerMovement } from "../systems/movement";
import { makeSpitter, updateSpitter } from "../systems/spitter";
import { buildTwilightArena, type ArenaData } from "../content/biome_twilight";
import { buildPlayerView, buildSpitterView, type SpitterView } from "../render/actors";
import { PLAYER_SHOT } from "../content/emitters";
import { bus } from "../core/events";
import { COLOR } from "../palette";

const FIXED = 1 / 60;
const FIRE_COOLDOWN = 0.13;

export class DiveScene implements HitSink {
  readonly root = new Container(); // (unused holder; views live in engine layers)
  private player: Player;
  private enemies: Enemy[] = [];
  private proj: Projectiles;
  private arena: ArenaData;

  private playerView = buildPlayerView();
  private enemyViews = new Map<Enemy, SpitterView>();
  private telegraphs = new Map<Enemy, Sprite>();
  private staticNodes: Container[] = [];

  private acc = 0;
  private depth = 0;
  private samples = 0;
  private shake = 0;
  private spawnTimer = 2;
  ended = false;

  onGameOver: (depth: number, samples: number) => void = () => {};

  constructor(
    private engine: Engine,
    private assets: AssetStore,
    seed: number
  ) {
    this.arena = buildTwilightArena(seed, assets);
    this.proj = new Projectiles(assets, engine.worldLayer);
    this.player = {
      pos: { ...this.arena.playerStart },
      vel: { x: 0, y: 0 },
      radius: 10,
      hp: 100,
      maxHp: 100,
      fireCooldown: 0,
      invuln: 0,
      alive: true,
    };
    this.buildStaticViews();
    // player views
    this.engine.worldLayer.addChild(this.playerView.root);
    this.engine.lightLayer.addChild(this.playerView.lamp);
    this.engine.centerOn(this.player.pos.x, this.player.pos.y, true);
  }

  // ---- world set-dressing (created once) ----
  private buildStaticViews(): void {
    // Currents: scattered, low-alpha ribbon streaks in the WORLD layer (never
    // bloomed) so they read as gentle flow, not glowing slabs. Oriented along
    // the band's long axis, drifting the way the force pushes.
    for (const c of this.arena.currents) {
      if (!this.assets.has(c.sprite)) continue;
      const horizontal = c.half.x >= c.half.y;
      const along = horizontal ? c.half.x : c.half.y;
      const count = Math.max(3, Math.floor((along * 2) / 260));
      for (let i = 0; i < count; i++) {
        const t = (i + 0.5) / count;
        const s = this.assets.sprite(c.sprite);
        s.rotation = horizontal ? 0 : Math.PI / 2;
        s.scale.set(0.8);
        s.alpha = 0.16;
        s.tint = COLOR.teal;
        const jitter = ((i * 53) % 60) - 30;
        s.position.set(
          horizontal ? c.pos.x - c.half.x + along * 2 * t : c.pos.x + jitter,
          horizontal ? c.pos.y + jitter : c.pos.y - c.half.y + along * 2 * t
        );
        this.engine.worldLayer.addChild(s);
        this.staticNodes.push(s as unknown as Container);
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

  // ---- main update: fixed-step sim + render ----
  update(dt: number, input: Input): void {
    if (!this.ended) {
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

  private step(dt: number, input: Input): void {
    const p = this.player;
    p.invuln = Math.max(0, p.invuln - dt);
    p.fireCooldown = Math.max(0, p.fireCooldown - dt);

    updatePlayerMovement(p, input.state.move, this.arena.currents, dt, this.arena.bounds);

    // Firing (aim from mouse → world)
    if (input.state.firing && p.fireCooldown <= 0 && p.alive) {
      const aim = this.engine.screenToWorld(input.state.aimScreen.x, input.state.aimScreen.y);
      const ang = Math.atan2(aim.y - p.pos.y, aim.x - p.pos.x);
      this.proj.fireBurst(PLAYER_SHOT, p.pos, ang, "player");
      p.fireCooldown = FIRE_COOLDOWN;
    }

    // Enemies
    for (const e of this.enemies) {
      if (e.alive) updateSpitter(e, dt, p, this.proj, this.arena.bounds);
    }

    // Bullets + collisions
    this.proj.update(dt, p, this.enemies, this, this.arena.bounds);

    // Depth drifts down as you survive; killing deepens (banked on surface/death).
    this.depth += dt * 3;

    // Waves
    this.spawnTimer -= dt;
    const tier = this.depth / 100;
    const maxAlive = Math.min(4, 2 + Math.floor(tier));
    const interval = Math.max(1.6, 3.2 - tier * 0.3);
    const aliveCount = this.enemies.reduce((n, e) => n + (e.alive ? 1 : 0), 0);
    if (this.spawnTimer <= 0 && aliveCount < maxAlive) {
      this.spawnSpitter();
      this.spawnTimer = interval;
    }

    // Reap dead enemies (after views cleaned in renderSync)
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 60);

    if (!p.alive && !this.ended) {
      this.ended = true;
      this.onGameOver(this.depth, this.samples);
    }
  }

  private spawnSpitter(): void {
    // pick the spawn point farthest from the player for a fair entrance
    let best = this.arena.spawns[0];
    let bestD = -1;
    for (const s of this.arena.spawns) {
      const d = Math.hypot(s.x - this.player.pos.x, s.y - this.player.pos.y);
      if (d > bestD) {
        bestD = d;
        best = s;
      }
    }
    const e = makeSpitter(best);
    this.enemies.push(e);
    const v = buildSpitterView();
    this.enemyViews.set(e, v);
    this.engine.worldLayer.addChild(v.root);
    this.engine.lightLayer.addChild(v.glow);
  }

  // ---- HitSink ----
  onPlayerHit(damage: number, at: Vec2): void {
    this.player.hp -= damage;
    this.player.invuln = 0.85;
    this.shake = 10;
    this.spawnFx("impact_coral", at.x, at.y);
    bus.emit("player:hit", { damage });
    if (this.player.hp <= 0) {
      this.player.hp = 0;
      this.player.alive = false;
      bus.emit("player:died", undefined);
    }
  }
  onEnemyHit(enemy: Enemy, _damage: number, at: Vec2): void {
    enemy.flash = 0.12;
    this.spawnFx("impact_aqua", at.x, at.y);
  }
  onEnemyKilled(enemy: Enemy): void {
    this.samples += 5;
    this.depth += 10;
    this.shake = 6;
    this.spawnFx("sample_burst", enemy.pos.x, enemy.pos.y);
    bus.emit("enemy:killed", { kind: enemy.kind, pos: { ...enemy.pos } });
    bus.emit("sample:collected", { value: 5 });
  }

  private spawnFx(anim: string, x: number, y: number): void {
    if (!this.assets.has(anim)) return;
    const a = this.assets.anim(anim);
    a.loop = false;
    a.position.set(x, y);
    a.gotoAndPlay(0);
    a.onComplete = () => {
      a.parent?.removeChild(a);
      a.destroy();
    };
    this.engine.lightLayer.addChild(a);
  }

  // ---- render ----
  private renderSync(dt: number, _input: Input): void {
    const p = this.player;
    // Player
    this.playerView.root.visible = p.alive;
    this.playerView.root.position.set(p.pos.x, p.pos.y);
    const aim = this.engine.screenToWorld(_input.state.aimScreen.x, _input.state.aimScreen.y);
    this.playerView.root.rotation = Math.atan2(aim.y - p.pos.y, aim.x - p.pos.x);
    this.playerView.root.alpha = p.invuln > 0 ? (Math.floor(p.invuln * 20) % 2 ? 0.4 : 1) : 1;
    this.playerView.lamp.position.set(p.pos.x, p.pos.y);
    this.playerView.lamp.visible = p.alive;

    // Enemies + telegraphs
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
      // hit feedback: a brief scale-pop reads better than a tint on a dark body
      v.root.scale.set(e.flash > 0 ? 1.15 : 1);
      this.syncTelegraph(e);
    }
    this.enemies = this.enemies.filter((e) => e.alive || this.enemyViews.has(e));

    // Camera follows the player; add decaying shake.
    this.engine.centerOn(p.pos.x, p.pos.y);
    this.engine.updateCamera(dt);
    if (this.shake > 0) {
      const sx = (Math.sin(this.depth * 137.13) * this.shake) | 0;
      const sy = (Math.cos(this.depth * 91.7) * this.shake) | 0;
      this.engine.sceneRoot.position.x += sx;
      this.engine.sceneRoot.position.y += sy;
    }
  }

  private syncTelegraph(e: Enemy): void {
    let tg = this.telegraphs.get(e);
    if (e.telegraphTimer > 0 && e.pendingSpec?.telegraph) {
      const spec = e.pendingSpec;
      const name = spec.telegraph!.sprite;
      if (!this.assets.has(name)) return;
      if (!tg) {
        tg = this.assets.sprite(name);
        this.telegraphs.set(e, tg);
        this.engine.lightLayer.addChild(tg);
      } else if (tg.texture !== this.assets.texture(name)) {
        tg.texture = this.assets.texture(name);
      }
      const total = spec.telegraph!.time;
      const t = 1 - e.telegraphTimer / total; // 0→1 as it nears firing
      tg.visible = true;
      tg.position.set(e.pos.x, e.pos.y);
      tg.alpha = 0.35 + 0.55 * t;
      const base = spec.telegraph!.scale ?? 1;
      tg.scale.set(base * (0.7 + 0.5 * t));
      if (spec.aim === "aimed") {
        tg.rotation = Math.atan2(this.player.pos.y - e.pos.y, this.player.pos.x - e.pos.x);
      }
    } else if (tg) {
      tg.visible = false;
    }
  }

  destroy(): void {
    this.proj.destroy();
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

  get hpRatio(): number {
    return this.player.hp / this.player.maxHp;
  }
  get currentDepth(): number {
    return this.depth;
  }
  get bankedSamples(): number {
    return this.samples;
  }
  get enemyCount(): number {
    return this.enemies.reduce((n, e) => n + (e.alive ? 1 : 0), 0);
  }
  get bulletCount(): number {
    return this.proj.activeCount;
  }
}
