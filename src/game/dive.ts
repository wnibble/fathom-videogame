// The dive (a run). Ties every system into one roguelite stratum: fixed-timestep
// sim, telegraphed combat, score/combo, XP → level-up upgrades, dash, functional
// interactables + hidden relics, magnetized loot, and depth/level difficulty
// scaling. Permadeath: dying loses unbanked samples but banks depth + score.

import { Container, Graphics, Sprite, Text, TextStyle } from "pixi.js";
import { getGlowTexture } from "../engine/glow";
import { clamp } from "../engine/tween";
import { squashStretch, phaseOf } from "../render/vitality";
import { Floaters } from "../render/floaters";
import type { Engine } from "../engine/app";
import type { AssetStore } from "../engine/assets";
import { Input, KEYS } from "../engine/input";
import type { Enemy, EnemyKind, Player, Vec2 } from "../core/types";
import type { Damageable, HitSink } from "../systems/projectiles";
import { Projectiles } from "../systems/projectiles";
import { Hazards } from "../systems/hazards";
import { updatePlayerMovement, resolveObstacles } from "../systems/movement";
import { FlowField, FlowParticles } from "../systems/flow";
import { makeSpitter, updateSpitter } from "../systems/spitter";
import { makeDarter, updateDarter } from "../systems/darter";
import { makeDrifter, updateDrifter } from "../systems/drifter";
import { makeBoss, buildBossView, updateBoss, BOSS_TELEGRAPH, type BossCtx } from "../systems/boss";
import { buildStratum, STRATA, STRATA_DEPTH, type ArenaData } from "../content/strata";
import { SPECIES_FOR_STRATUM } from "../content/species";
import { WEATHER, type Weather } from "../content/weather";
import { buildPlayerView, buildSpitterView, buildDarterView, buildDrifterView, type SpitterView, type PlayerView } from "../render/actors";
import { PLAYER_SHOT, SPITTER_RADIAL } from "../content/emitters";
import { rollMutation, MUTATION_BY_ID } from "../content/mutations";
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
  deriveWeapon,
  rollChoices,
  hasUpgradesAvailable,
  maxedAnyUpgrade,
  leanHue,
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
  private charge = 0; // glow-charge from grazing (0..1)
  private dread = 0; // dread clock (0..1) — the deep closing in
  private seen = new Set<string>(); // species catalogued this run
  private runResources: Record<string, number> = {}; // materials gathered this dive
  // Weather/boon modifiers (1 = neutral)
  private lootMult = 1;
  private currentMult = 1;
  private eliteMult = 1;
  private enemySpeedMult = 1;
  private spawnIntervalMult = 1;
  private dreadMult = 1;
  private haulGlow?: Sprite;
  private cardRoot?: Container; // stratum threshold title card
  private cardTimer = 0;
  // Smooth stratum transition (fade out → rebuild hidden → fade in)
  private transitioning = false;
  private transitionT = 0;
  private transitionNext = 0;
  private transitionDone = false;
  private fadeG?: Graphics;
  private run: RunState;
  private dash: DashState = freshDash();
  private rng: Rng;

  private playerView!: PlayerView;
  private enemyViews = new Map<Enemy, SpitterView>();
  private telegraphs = new Map<Enemy, Sprite>();
  private staticNodes: Container[] = [];
  private liveFx: Sprite[] = [];
  private hitFx: { ring: Graphics; glow: Sprite; age: number; life: number; rMax: number; color: number; sparks: number[] }[] = [];
  private wisps: { s: Sprite; age: number; life: number }[] = [];
  private wispTimer = 0;
  private currentBase: Vec2[] = []; // base current forces (for dynamic ebb/flow)
  private streams: { s: Sprite; axisStart: number; cross: number; span: number; base: number; dir: number; horiz: boolean }[] = [];
  private sway: { node: Container; baseX: number; baseRot: number; phase: number; amp: number; speed: number }[] = [];
  private flow!: FlowField; // ambient sea drift over the whole arena
  private flowFx: FlowParticles | null = null;
  private flowVec: Vec2 = { x: 0, y: 0 };
  // The Cradle guardian (boss) — only present on the floor.
  private boss: Enemy | null = null;
  private bossView: SpitterView | null = null;
  private bossHpG: Graphics | null = null;
  private bossHpText: Text | null = null;
  private bossRing: Graphics | null = null;
  private bossCtx: BossCtx | null = null;
  private winSeqT = -1; // >=0 while the victory sequence plays
  private winCard: Container | null = null;
  private floaters!: Floaters;
  private lastMult = 1; // combo multiplier last frame (detect tier-ups)

  private acc = 0;
  private elapsed = 0;
  private hitstop = 0;
  private depth = 0;
  private shake = 0; // trauma 0..1
  private recoil = { x: 0, y: 0 }; // camera kick
  private muzzles: { s: Sprite; age: number }[] = [];
  private dyingViews: { root: Container; glow: Sprite; age: number; life: number }[] = [];
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
    private meta: MetaState = freshMeta(),
    weather: Weather = WEATHER[0],
    boons: string[] = []
  ) {
    this.shakeEnabled = screenShake && !reducedMotion;
    this.rng = new Rng((seed ^ 0x9e3779b9) >>> 0);
    this.arena = buildStratum(0, seed, assets);
    engine.setBgTint(this.arena.bg);
    this.proj = new Projectiles(assets, engine.worldLayer);
    this.pickups = new Pickups(engine.worldLayer, engine.lightLayer);
    this.interactables = new Interactables(this.arena.interactables, engine.worldLayer, engine.lightLayer, assets);
    this.hazards = new Hazards(engine.lightLayer);
    this.floaters = new Floaters(engine.sceneRoot); // above world+light, moves with camera
    this.playerView = buildPlayerView(assets);
    this.run = freshRun(PLAYER_SHOT, meta);

    // Weather modifiers (a double-edged climate) + one-run Market boons.
    const wm = weather.mods;
    this.run.scoreMult = wm.scoreMult;
    this.run.stats.dashCooldownMult *= wm.dashCdMult;
    this.lootMult = wm.lootCountMult * wm.sampleMult;
    this.currentMult = wm.currentMult;
    this.eliteMult = wm.eliteMult;
    this.enemySpeedMult = wm.enemySpeedMult;
    this.spawnIntervalMult = wm.spawnIntervalMult;
    this.dreadMult = wm.dreadMult;
    let bonusShield = 0;
    for (const b of boons) {
      if (b === "charged-cell") bonusShield += 40;
      else if (b === "chum-bag") this.lootMult *= 1.6;
      else if (b === "ballast") this.currentMult *= 0.4;
      else if (b === "stim") this.run.xp.pendingLevelUps += 1;
      else if (b === "ember-core") this.run.stats.damageMult += 0.25;
    }
    this.run.weapon = deriveWeapon(PLAYER_SHOT, this.run.stats);
    this.applyWeatherCurrents();

    const maxHp = BASE_HP + meta.bonusMaxHp;
    const shieldMax = meta.shieldCapacity + this.run.stats.shieldCapBonus + bonusShield;
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
      scan: (x, y) => {
        this.spawnFx("scan_ring", x, y);
        const sp = SPECIES_FOR_STRATUM[this.stratumIndex];
        if (sp) this.seen.add(sp.key);
      },
      push: (fx, fy) => {
        this.player.vel.x += fx * this.stepDt;
        this.player.vel.y += fy * this.stepDt;
      },
      fx: (anim, x, y) => this.spawnFx(anim, x, y),
      surface: () => this.onSurface(),
      descend: () => {
        if (!this.transitioning && !this.ended && this.stratumIndex < STRATA.length - 1) {
          this.transitionStratum(this.stratumIndex + 1);
        }
      },
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
    // Hero landmark — an oversized, cool, low-alpha beacon far in the field that
    // gives the stratum a memorable silhouette (drawn behind everything).
    const lm = this.arena.landmark;
    if (lm && this.assets.sprites[lm.sprite]) {
      const node = this.assets.sprite(lm.sprite);
      node.position.set(lm.pos.x, lm.pos.y);
      node.scale.set(lm.scale);
      node.alpha = 0.32;
      node.tint = 0x7f9fb5;
      this.engine.worldLayer.addChildAt(node, 0);
      this.staticNodes.push(node as unknown as Container);
    }

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
        s.scale.set(0.85);
        s.alpha = 0.32;
        s.tint = COLOR.aquaBright;
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
      // Organic flora sways with the current — the sea breathes (Stardew-style).
      if (/kelp|sprout|tangle|coral|tube_worm|jelly|weed|frond/i.test(p.sprite)) {
        const ph = phaseOf(p.pos.x, p.pos.y);
        this.sway.push({ node, baseX: p.pos.x, baseRot: node.rotation, phase: ph, amp: 0.05 + (p.scale - 1) * 0.03, speed: 0.7 + (ph % 1) * 0.5 });
      }
    }

    // Solid rock/cave obstacles — a soft contact shadow beneath, then the sprite.
    for (const o of this.arena.obstacles) {
      const shadow = new Graphics();
      shadow.ellipse(o.pos.x, o.pos.y + o.radius * 0.55, o.radius * 1.05, o.radius * 0.4).fill({ color: COLOR.abyss, alpha: 0.4 });
      this.engine.worldLayer.addChild(shadow);
      this.staticNodes.push(shadow as unknown as Container);
      if (this.assets.has(o.sprite)) {
        const node = this.assets.sprite(o.sprite);
        node.position.set(o.pos.x, o.pos.y);
        node.scale.set(o.scale);
        this.engine.worldLayer.addChild(node);
        this.staticNodes.push(node);
      } else {
        const g = new Graphics();
        g.circle(o.pos.x, o.pos.y, o.radius).fill({ color: 0x0c1826, alpha: 0.96 }).stroke({ width: 2, color: 0x1d3346 });
        this.engine.worldLayer.addChild(g);
        this.staticNodes.push(g as unknown as Container);
      }
    }
  }

  // ---- update ----
  update(dt: number, input: Input): void {
    this.elapsed += dt;
    if (this.transitioning) {
      this.tickTransition(dt);
      this.renderSync(dt, input);
      return;
    }
    if (this.winSeqT >= 0) {
      // Combat is over — play out the victory beat, then bank the win.
      this.tickWinSequence(dt);
      this.renderSync(dt, input);
      return;
    }
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

  private setFade(a: number): void {
    if (!this.fadeG) {
      this.fadeG = new Graphics();
      this.engine.uiRoot.addChild(this.fadeG);
    }
    this.fadeG.clear();
    if (a > 0) this.fadeG.rect(0, 0, this.engine.width, this.engine.height).fill({ color: 0x02040a, alpha: Math.min(1, a) });
  }

  private tickTransition(dt: number): void {
    this.transitionT += dt;
    const half = 0.34;
    if (this.transitionT < half) {
      this.setFade(this.transitionT / half); // fade to black
    } else if (!this.transitionDone) {
      this.transitionDone = true;
      this.doStratumRebuild(this.transitionNext); // rebuild hidden behind the curtain
    } else {
      const t2 = (this.transitionT - half) / half;
      this.setFade(1 - t2); // fade back into the new place
      if (t2 >= 1) {
        this.transitioning = false;
        this.transitionDone = false;
        this.setFade(0);
      }
    }
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

    // Dynamic currents — the sea ebbs and flows instead of a constant push.
    for (let i = 0; i < this.arena.currents.length; i++) {
      const b = this.currentBase[i];
      if (!b) continue;
      const osc = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(this.elapsed * 0.55 + i * 1.7));
      this.arena.currents[i].force.x = b.x * osc;
      this.arena.currents[i].force.y = b.y * osc;
    }

    // Ambient flow drifts the whole sea — a gentle omnipresent nudge so you
    // always feel the current, even outside the strong authored bands.
    if (p.alive) {
      this.flow.sample(p.pos.x, p.pos.y, this.elapsed, this.flowVec);
      p.vel.x += this.flowVec.x * dt;
      p.vel.y += this.flowVec.y * dt;
    }

    updatePlayerMovement(p, input.state.move, this.arena.currents, dt, this.arena.bounds, this.run.stats.moveSpeedMult, this.arena.obstacles);

    // Movement wisps — trailing motes while moving (juice, no new art).
    const spd = Math.hypot(p.vel.x, p.vel.y);
    this.wispTimer -= dt;
    if (spd > 90 && this.wispTimer <= 0 && p.alive) {
      this.wispTimer = 0.055;
      this.spawnWisp(p.pos.x - (p.vel.x / spd) * p.radius, p.pos.y - (p.vel.y / spd) * p.radius);
    }

    // firing (run weapon, with post-dash haste)
    if (input.state.firing && p.fireCooldown <= 0 && p.alive) {
      const ang = Math.atan2(this.lastAim.y, this.lastAim.x);
      this.proj.fireBurst(this.run.weapon, p.pos, ang, "player");
      audio.shoot();
      this.spawnMuzzle(p.pos.x + this.lastAim.x * 11, p.pos.y + this.lastAim.y * 11);
      this.recoil.x -= this.lastAim.x * 2.2;
      this.recoil.y -= this.lastAim.y * 2.2;
      const haste = this.dash.postHaste > 0 ? 1 + this.run.stats.postDashHaste : 1;
      p.fireCooldown = this.run.fireInterval / haste;
    }

    // enemies — dispatch by archetype (each a distinct verb)
    for (const e of this.enemies) {
      if (!e.alive) continue;
      if (e === this.boss) {
        const phase = e.hp / e.maxHp < 0.5 ? 2 : 1;
        updateBoss(e, dt, p, this.bossCtx!, phase);
      } else if (e.kind === "darter") {
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
      // Irradiated mutation: lay a poison damage-trail in its wake.
      if (e.mutation === "irradiated") {
        e.mineTimer = (e.mineTimer ?? 0.6) - dt;
        if (e.mineTimer <= 0) {
          e.mineTimer = 0.6;
          this.hazards.spawn(e.pos.x, e.pos.y, 20, 3, 8, 0x8fe04a);
        }
      }
      // Enemies collide with rocks too (except the boss, which hovers above).
      if (e !== this.boss && this.arena.obstacles.length) resolveObstacles(e.pos, e.radius, e.vel, this.arena.obstacles);
    }

    this.proj.enemySlow = this.run.stats.enemyBulletSlow;
    this.proj.update(dt, p, this.enemies, this.interactables.destructibles(), this, this.arena.bounds);
    this.hazards.update(dt, p, this);
    this.pickups.update(dt, p, this.run.stats.magnetRadius, this.elapsed, this);
    this.interactables.update(dt, p.pos, p.alive, p.radius, this.elapsed, this.interactSink);

    // Glow double-bind: charge bleeds slowly; dread rises faster the brighter you are
    // (charge) and the longer you linger. The deep hunts the bright.
    this.charge = Math.max(0, this.charge - dt * 0.02);
    this.dread = Math.min(1, this.dread + dt * (0.017 + this.charge * 0.03) * this.dreadMult);
    if (this.dread >= 1) {
      const a = this.rng.range(0, Math.PI * 2);
      this.hazards.spawn(p.pos.x + Math.cos(a) * 95, p.pos.y + Math.sin(a) * 95, 46, 2.4, 16, COLOR.coralBright);
      this.dread = 0.5;
    }

    // Strata now change ONLY when you swim into a descent portal (interactSink
    // .descend) — the terrain never shifts under you. Depth keeps counting for
    // difficulty + score; the portal is the chosen gateway deeper.

    // scoring + depth
    tickScore(this.run, dt);
    this.depth += dt * 3;
    depthMilestone(this.run, this.depth);

    // waves (scaled by depth AND build power)
    this.spawnTimer -= dt;
    const tier = depthTier(this.depth, this.run.xp.level);
    const maxAlive = Math.min(6, 2 + Math.floor(tier));
    const interval = Math.max(1.0, 3.2 - tier * 0.28) * this.spawnIntervalMult;
    const aliveCount = this.enemies.reduce((n, e) => n + (e.alive ? 1 : 0), 0);
    // While the guardian lives, the normal wave stops — it summons its own adds.
    if (!this.boss?.alive && this.spawnTimer <= 0 && aliveCount < maxAlive) {
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

    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 1.8);

    if (!p.alive && !this.ended) {
      this.ended = true;
      this.onGameOver(this.buildResult(false));
    }
  }

  private buildResult(surfaced: boolean, won = false): DiveResult {
    return {
      depth: this.depth,
      score: this.run.score.score,
      samples: this.run.samples,
      kills: this.run.kills,
      elites: this.eliteKills,
      relics: this.run.relics,
      level: this.run.xp.level,
      stratum: this.stratumIndex,
      surfaced,
      won,
      maxedUpgrade: maxedAnyUpgrade(this.run),
      seen: [...this.seen],
      resources: { ...this.runResources },
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
    const elite = this.rng.chance(Math.min(0.5, tier * 0.06 * this.eliteMult));
    const kind = this.pickFauna();

    let e: Enemy;
    let v: SpitterView;
    if (kind === "darter") {
      const hp = Math.round(32 * (1 + tier * 0.16) * (elite ? 2.6 : 1));
      const speed = Math.min(96 * 1.6, 96 * (1 + tier * 0.05)) * (elite ? 1.2 : 1);
      e = makeDarter(best, { elite, hp, speed });
      v = buildDarterView(elite, this.assets);
    } else if (kind === "drifter") {
      const hp = Math.round(42 * (1 + tier * 0.16) * (elite ? 2.6 : 1));
      const speed = 58 * (1 + tier * 0.05) * (elite ? 1.15 : 1);
      e = makeDrifter(best, { elite, hp, speed });
      v = buildDrifterView(elite, this.assets);
    } else {
      const baseHp = 60 * (1 + tier * 0.18) * (elite ? 3 : 1);
      const speed = Math.min(78 * 1.5, 78 * (1 + tier * 0.06));
      const bulletCount = Math.min(22, 14 + Math.floor(tier)) + (elite ? 4 : 0);
      e = makeSpitter(best, { elite, hp: Math.round(baseHp), speed, bulletCount });
      v = buildSpitterView(elite, this.assets);
    }
    e.speed *= this.enemySpeedMult; // weather (Cold Snap etc.)
    // Elite mutation — an aura color + a reused behavior seam.
    const mut = rollMutation(this.rng, tier);
    if (mut) {
      e.mutation = mut;
      v.glow.tint = MUTATION_BY_ID[mut].aura;
      e.hp = Math.round(e.hp * 1.3);
      e.maxHp = e.hp;
      if (mut === "voltaic") e.speed *= 1.3;
      if (mut === "irradiated") e.mineTimer = 0.5;
    }
    this.enemies.push(e);
    this.enemyViews.set(e, v);
    this.engine.worldLayer.addChild(v.root);
    this.engine.lightLayer.addChild(v.glow);
  }

  /** Summon the Cradle guardian — the climax fight. Scales with the run's power. */
  private spawnBoss(): void {
    if (this.boss) return;
    const hp = Math.round(2000 + this.run.xp.level * 90 + this.run.stats.maxHpBonus * 4);
    const boss = makeBoss({ x: this.arena.bounds.w / 2, y: this.arena.bounds.h * 0.2 }, hp);
    const view = buildBossView(this.assets);
    this.boss = boss;
    this.bossView = view;
    this.enemies.push(boss);
    this.engine.worldLayer.addChild(view.root);
    this.engine.lightLayer.addChild(view.glow);
    // Telegraph ring (bespoke — the boss isn't in the normal enemyViews path).
    this.bossRing = new Graphics();
    this.engine.lightLayer.addChild(this.bossRing);
    // Boss HP bar (screen-space).
    this.bossHpG = new Graphics();
    this.bossHpText = new Text({ text: "THE CRADLE GUARDIAN", style: new TextStyle({ fontFamily: "Consolas, monospace", fontSize: 13, fill: COLOR.coralBright, fontWeight: "bold", letterSpacing: 3 }) });
    this.bossHpText.anchor.set(0.5, 1);
    this.engine.uiRoot.addChild(this.bossHpG, this.bossHpText);
    this.bossCtx = {
      fire: (spec, pos, base) => this.proj.fireBurst(spec, pos, base, "enemy"),
      hazard: (x, y) => this.hazards.spawn(x, y, 34, 3.0, 14, COLOR.coralBright),
      spawnAdd: (pos) => this.spawnBossAdd(pos),
      hitPlayer: (dmg, at) => {
        if (this.player.alive && this.player.invuln <= 0) this.onPlayerHit(dmg, at);
      },
      bounds: this.arena.bounds,
    };
    audio.relic();
    if (this.shakeEnabled) this.shake = 0.7;
  }

  /** A darter add summoned by the guardian in phase 2 (renders + dies normally). */
  private spawnBossAdd(pos: Vec2): void {
    if (this.enemies.reduce((n, e) => n + (e.alive ? 1 : 0), 0) > 8) return;
    const e = makeDarter(pos, { elite: false, hp: 40, speed: 130 });
    const v = buildDarterView(false, this.assets);
    this.enemies.push(e);
    this.enemyViews.set(e, v);
    this.engine.worldLayer.addChild(v.root);
    this.engine.lightLayer.addChild(v.glow);
  }

  /** Victory: the guardian is slain. Freeze, flash, then bank the run as a WIN. */
  private onCradleCleared(): void {
    if (this.winSeqT >= 0 || this.ended) return;
    this.winSeqT = 0;
    addScore(this.run, 5000, false); // the climax bonus
    if (this.shakeEnabled) this.shake = 1;
    if (!this.reducedMotion) this.hitstop = 0.25;
    audio.levelUp();
    this.proj.clear(); // sweep the guardian's last volley off the board
    // Keep boss + bossView so renderBoss can play the death fade (winSeqT drives it).
    this.clearBossUi();
    this.showWinCard();
  }

  private showWinCard(): void {
    const c = new Container();
    const w = this.engine.width;
    const h = this.engine.height;
    const style = (size: number, color: number, weight: "normal" | "bold" = "normal") =>
      new TextStyle({ fontFamily: "Consolas, monospace", fontSize: size, fill: color, fontWeight: weight, letterSpacing: 4, align: "center" });
    const a = new Text({ text: "THE CRADLE OPENS", style: style(36, COLOR.aquaBright, "bold") });
    const b = new Text({ text: "the guardian is still. the deep has let you pass.", style: style(15, COLOR.teal) });
    const cc = new Text({ text: "you may rise now, and carry this back", style: style(13, 0x7f9fb5) });
    for (const t of [a, b, cc]) t.anchor.set(0.5);
    a.position.set(w / 2, h * 0.4);
    b.position.set(w / 2, h * 0.4 + 44);
    cc.position.set(w / 2, h * 0.4 + 74);
    c.addChild(a, b, cc);
    this.engine.uiRoot.addChild(c);
    this.winCard = c;
  }

  private tickWinSequence(dt: number): void {
    this.winSeqT += dt;
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 1.2);
    if (this.winSeqT >= 4.2 && !this.ended) {
      this.ended = true;
      this.onGameOver(this.buildResult(true, true));
    }
  }

  private clearBossUi(): void {
    this.bossHpG?.destroy();
    this.bossHpText?.destroy();
    this.bossRing?.parent?.removeChild(this.bossRing);
    this.bossRing?.destroy();
    this.bossHpG = null;
    this.bossHpText = null;
    this.bossRing = null;
  }

  /** Remove the boss + all its UI/view (win path already nulls bossView first). */
  private teardownBoss(): void {
    if (this.boss) {
      const i = this.enemies.indexOf(this.boss);
      if (i >= 0) this.enemies.splice(i, 1);
      this.boss = null;
    }
    if (this.bossView) {
      this.bossView.root.parent?.removeChild(this.bossView.root);
      this.bossView.root.destroy({ children: true });
      this.bossView.glow.parent?.removeChild(this.bossView.glow);
      this.bossView.glow.destroy();
      this.bossView = null;
    }
    this.clearBossUi();
    this.bossCtx = null;
    if (this.winCard) {
      this.winCard.parent?.removeChild(this.winCard);
      this.winCard.destroy({ children: true });
      this.winCard = null;
    }
    this.winSeqT = -1;
  }

  private renderBoss(dt: number): void {
    const b = this.boss;
    const v = this.bossView;
    if (!b || !v) return;
    // Death fade — squash + brighten + vanish over the first beat of the win.
    if (!b.alive) {
      const t = Math.min(1, this.winSeqT / 0.7);
      v.root.scale.set(1 + 0.4 * t, Math.max(0.02, 1 - t));
      v.root.alpha = 1 - t;
      v.glow.alpha = (1 - t) * 0.9;
      v.glow.tint = 0xffe6c0;
      if (t >= 1) {
        v.root.parent?.removeChild(v.root);
        v.root.destroy({ children: true });
        v.glow.parent?.removeChild(v.glow);
        v.glow.destroy();
        this.boss = null;
        this.bossView = null;
      }
      return;
    }
    v.root.position.set(b.pos.x, b.pos.y);
    v.glow.position.set(b.pos.x, b.pos.y);
    const pulse = 0.5 + 0.5 * Math.sin(this.elapsed * 2.2);
    const tele = b.telegraphTimer > 0;
    v.glow.alpha = (tele ? 0.72 : 0.46) + 0.14 * pulse;
    v.glow.tint = tele ? 0xff5c7a : 0xb85cff;
    if (v.update) {
      v.update(b, dt, this.elapsed); // sprite gatekeeper picks its pose + breathe
    } else {
      let sc = 1 + 0.03 * Math.sin(this.elapsed * 1.6);
      if (b.flash > 0) sc *= 1.06;
      v.root.scale.set(sc);
      v.root.rotation = Math.sin(this.elapsed * 0.4) * 0.06;
    }

    if (this.bossRing) {
      this.bossRing.clear();
      if (tele) {
        const frac = 1 - b.telegraphTimer / BOSS_TELEGRAPH;
        this.bossRing.circle(b.pos.x, b.pos.y, b.radius + 14).stroke({ width: 3, color: 0xff5c7a, alpha: 0.3 });
        this.bossRing.arc(b.pos.x, b.pos.y, b.radius + 14, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2).stroke({ width: 5, color: COLOR.coralBright, alpha: 0.9 });
      }
    }

    if (this.bossHpG && this.bossHpText) {
      const w = this.engine.width;
      const bw = Math.min(560, w * 0.5);
      const bx = w / 2 - bw / 2;
      const by = 68; // below the score readout so the label doesn't collide
      const ratio = Math.max(0, b.hp / b.maxHp);
      this.bossHpG.clear();
      this.bossHpG.roundRect(bx - 2, by - 2, bw + 4, 12, 4).fill({ color: COLOR.abyss, alpha: 0.8 });
      this.bossHpG.roundRect(bx, by, bw, 8, 3).fill({ color: COLOR.deepNavy, alpha: 0.9 });
      this.bossHpG.roundRect(bx, by, bw * ratio, 8, 3).fill({ color: COLOR.coralBright, alpha: 0.95 });
      this.bossHpText.position.set(w / 2, by - 4);
    }
  }

  private applyWeatherCurrents(): void {
    for (const c of this.arena.currents) {
      c.force.x *= this.currentMult;
      c.force.y *= this.currentMult;
    }
    this.currentBase = this.arena.currents.map((c) => ({ x: c.force.x, y: c.force.y }));
    this.buildFlow();
  }

  /** Ambient, arena-wide flow so the sea drifts everywhere — not just in bands. */
  private buildFlow(): void {
    if (this.flowFx) {
      this.flowFx.destroy();
      this.flowFx = null;
    }
    const b = this.arena.bounds;
    // Prevailing drift leans toward the mean of the authored bands (so ambient
    // agrees with them), else a gentle seeded lean. Small — a felt nudge.
    let bx = 0;
    let by = 0;
    for (const c of this.arena.currents) {
      bx += c.force.x;
      by += c.force.y;
    }
    const bl = Math.hypot(bx, by) || 1;
    const bias = { x: (bx / bl) * 9, y: (by / bl) * 9 };
    this.flow = new FlowField(22 * this.currentMult, bias, (this.seed + this.stratumIndex * 9176 + 1) >>> 0);
    this.flowFx = new FlowParticles(this.flow, this.arena.currents, b);
    this.engine.worldLayer.addChildAt(this.flowFx.layer, 0);
  }

  private spawnMuzzle(x: number, y: number): void {
    if (this.muzzles.length > 8) return;
    const s = new Sprite(getGlowTexture());
    s.anchor.set(0.5);
    s.tint = leanHue(this.run);
    s.position.set(x, y);
    s.scale.set(38 / 128);
    s.alpha = 0.5;
    this.engine.lightLayer.addChild(s);
    this.muzzles.push({ s, age: 0 });
  }

  private spawnWisp(x: number, y: number): void {
    const s = new Sprite(getGlowTexture());
    s.anchor.set(0.5);
    s.tint = leanHue(this.run);
    s.position.set(x, y);
    s.scale.set(26 / 128);
    s.alpha = 0.38;
    this.engine.lightLayer.addChild(s);
    this.wisps.push({ s, age: 0, life: 0.5 });
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

  /** Begin a smooth descent: freeze, fade to black, rebuild hidden, fade in. */
  private transitionStratum(next: number): void {
    this.transitioning = true;
    this.transitionT = 0;
    this.transitionDone = false;
    this.transitionNext = next;
  }

  /** The actual teardown + rebuild of the next authored stratum (keeps player + run). */
  private doStratumRebuild(next: number): void {
    this.clearWorld();
    this.stratumIndex = next;
    this.arena = buildStratum(next, this.seed, this.assets);
    this.applyWeatherCurrents();
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
    // The floor is a boss arena — the guardian rises to meet you.
    if (this.arena.isFloor) this.spawnBoss();
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
    for (const w of this.wisps) {
      w.s.parent?.removeChild(w.s);
      w.s.destroy();
    }
    this.wisps = [];
    for (const m of this.muzzles) {
      m.s.parent?.removeChild(m.s);
      m.s.destroy();
    }
    this.muzzles = [];
    for (const d of this.dyingViews) {
      d.root.parent?.removeChild(d.root);
      d.root.destroy({ children: true });
      d.glow.parent?.removeChild(d.glow);
      d.glow.destroy();
    }
    this.dyingViews = [];
    for (const n of this.staticNodes) {
      n.parent?.removeChild(n);
      n.destroy({ children: true });
    }
    this.staticNodes = [];
    this.streams = [];
    this.sway = [];
    this.floaters.clear();
    this.teardownBoss();
    if (this.flowFx) {
      this.flowFx.destroy();
      this.flowFx = null;
    }
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
    if (this.shakeEnabled) {
      this.shake = Math.min(1, this.shake + (absorbed ? 0.35 : 0.7));
      const dx = this.player.pos.x - at.x;
      const dy = this.player.pos.y - at.y;
      const l = Math.hypot(dx, dy) || 1;
      this.recoil.x += (dx / l) * (absorbed ? 8 : 14);
      this.recoil.y += (dy / l) * (absorbed ? 8 : 14);
    }
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
    // Floating damage number — chip-damage satisfaction. Boss/elite hits punch bigger.
    const big = enemy === this.boss || enemy.elite;
    this.floaters.spawn(at.x, at.y, String(Math.round(damage)), big ? COLOR.coralBright : 0xdff4ff, big ? 16 : 12, big);
  }
  onEnemyKilled(enemy: Enemy): void {
    if (enemy === this.boss) {
      onKill(this.run, true);
      this.eliteKills++;
      this.spawnFx("sample_burst", enemy.pos.x, enemy.pos.y);
      // A shower of loot from the fallen guardian.
      for (let i = 0; i < 14; i++) this.pickups.spawn("sample", enemy.pos.x + this.rng.range(-40, 40), enemy.pos.y + this.rng.range(-40, 40), 1);
      const res = this.arena.resource;
      this.runResources[res] = (this.runResources[res] ?? 0) + 12;
      this.onCradleCleared();
      return;
    }
    const scoreBefore = this.run.score.score;
    onKill(this.run, enemy.elite);
    if (enemy.elite) this.eliteKills++;
    // Floating score pop (combo-scaled, so a hot streak visibly pays off).
    const gained = this.run.score.score - scoreBefore;
    if (gained > 0) this.floaters.spawn(enemy.pos.x, enemy.pos.y - 10, `+${gained}`, COLOR.amberBright, enemy.elite ? 16 : 13, enemy.elite);
    // Bloomed mutation: burst a ring of bullets on death.
    if (enemy.mutation === "bloomed") {
      this.proj.fireBurst({ ...SPITTER_RADIAL, count: 12, speed: 150, ttl: 2.4, telegraph: undefined }, enemy.pos, 0, "enemy");
    }
    audio.kill();
    if (this.shakeEnabled) this.shake = Math.min(1, this.shake + (enemy.elite ? 0.5 : 0.28));
    if (!this.reducedMotion) this.hitstop = enemy.elite ? 0.08 : 0.05;
    this.spawnFx("sample_burst", enemy.pos.x, enemy.pos.y);
    // Loot: elites drop richer; weather/boons scale the haul.
    const drops = Math.max(1, Math.round((enemy.elite ? 2 : 1) * this.lootMult));
    for (let i = 0; i < drops; i++) this.pickups.spawn("sample", enemy.pos.x, enemy.pos.y, 1);
    // Stratum material — the Market currency.
    const res = this.arena.resource;
    this.runResources[res] = (this.runResources[res] ?? 0) + (enemy.elite ? 2 : 1);
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
    if (this.shakeEnabled) this.shake = Math.min(1, this.shake + 0.5);
    if (!this.reducedMotion) this.hitstop = 0.09;
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
    this.flowFx?.update(dt, this.elapsed); // drifting streaks reveal the living current
    this.floaters.update(dt);
    this.renderBoss(dt);
    // Combo tier-up flourish — the multiplier climbing is the core score loop.
    if (this.run.score.multiplier > this.lastMult) {
      this.floaters.spawn(p.pos.x, p.pos.y - 28, `COMBO ×${this.run.score.multiplier.toFixed(1)}`, COLOR.aquaBright, 15, true);
      audio.uiConfirm();
    }
    this.lastMult = this.run.score.multiplier;
    // Flora sway — organic props lean with the current so the field feels alive.
    for (const s of this.sway) {
      const w = Math.sin(this.elapsed * s.speed + s.phase);
      s.node.rotation = s.baseRot + s.amp * w;
      s.node.position.x = s.baseX + s.amp * 22 * w;
    }
    const flowSpeed = 62;
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

    // Movement wisps fade + shrink.
    if (this.wisps.length) {
      for (const wf of this.wisps) {
        wf.age += dt;
        const t = wf.age / wf.life;
        wf.s.alpha = 0.38 * (1 - t);
        wf.s.scale.set((26 / 128) * (1 - 0.5 * t));
      }
      if (this.wisps.some((w) => w.age >= w.life)) {
        for (const w of this.wisps) {
          if (w.age < w.life) continue;
          w.s.parent?.removeChild(w.s);
          w.s.destroy();
        }
        this.wisps = this.wisps.filter((w) => w.age < w.life);
      }
    }

    // Muzzle flashes fade.
    if (this.muzzles.length) {
      for (const mz of this.muzzles) {
        mz.age += dt;
        const t = mz.age / 0.07;
        mz.s.alpha = 0.5 * (1 - t);
        mz.s.scale.set((38 / 128) * (1 - 0.6 * t));
      }
      if (this.muzzles.some((m) => m.age >= 0.07)) {
        for (const m of this.muzzles) {
          if (m.age < 0.07) continue;
          m.s.parent?.removeChild(m.s);
          m.s.destroy();
        }
        this.muzzles = this.muzzles.filter((m) => m.age < 0.07);
      }
    }
    // Dying enemies squash to zero (juicy death, no instant pop).
    if (this.dyingViews.length) {
      for (const d of this.dyingViews) {
        d.age += dt;
        const t = Math.min(1, d.age / d.life);
        d.root.scale.set(1 + 0.3 * t, Math.max(0.03, 1 - t));
        d.root.alpha = 1 - t;
        d.glow.alpha = (1 - t) * 0.6;
      }
      if (this.dyingViews.some((d) => d.age >= d.life)) {
        for (const d of this.dyingViews) {
          if (d.age < d.life) continue;
          d.root.parent?.removeChild(d.root);
          d.root.destroy({ children: true });
          d.glow.parent?.removeChild(d.glow);
          d.glow.destroy();
        }
        this.dyingViews = this.dyingViews.filter((d) => d.age < d.life);
      }
    }

    const pspeed = Math.hypot(p.vel.x, p.vel.y);
    this.playerView.root.visible = p.alive;
    this.playerView.root.position.set(p.pos.x, p.pos.y);
    if (this.playerView.update) {
      // Sprite diver: stay upright, flip to face aim, swap idle/swim/hurt.
      this.playerView.root.rotation = 0;
      this.playerView.update(dt, pspeed > 34, this.lastAim.x, p.invuln > 0.62);
    } else {
      this.playerView.root.rotation = Math.atan2(this.lastAim.y, this.lastAim.x);
      squashStretch(this.playerView.root, pspeed, 0.28, 0.02, this.elapsed, 0);
    }
    this.playerView.root.alpha = p.invuln > 0 ? (Math.floor(p.invuln * 20) % 2 ? 0.4 : 1) : 1;
    this.playerView.lamp.position.set(p.pos.x, p.pos.y);
    this.playerView.lamp.visible = p.alive;
    // glow-as-weapon: the core brightens gently with graze charge
    // glow-as-identity: the core HUE reflects your build lean
    const ch = this.charge;
    this.playerView.lamp.tint = leanHue(this.run);
    this.playerView.lamp.alpha = (0.22 + ch * 0.32) * (p.alive ? 1 : 0);
    this.playerView.lamp.scale.set((126 / 128) * (1 + ch * 0.22));
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
        // Hand the view to the dying list for a squash-to-zero instead of a pop.
        this.dyingViews.push({ root: v.root, glow: v.glow, age: 0, life: 0.14 });
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
      if (v.update) {
        // Sprite path owns pose/facing/breathe (stays upright — side-view art).
        v.update(e, dt, this.elapsed);
      } else {
        // Procedural fallback: idle breathe + hit-flash pop + darter facing.
        const ph = phaseOf(e.pos.x, e.pos.y);
        const amp = e.kind === "drifter" ? 0.06 : e.kind === "spitter" ? 0.04 : 0.025;
        const spd = e.kind === "drifter" ? 2.2 : 3;
        let sc = 1 + amp * Math.sin(this.elapsed * spd + ph);
        if (e.flash > 0) sc *= 1.12;
        v.root.scale.set(sc);
        if (e.kind === "darter") {
          if (Math.hypot(e.vel.x, e.vel.y) > 6) v.root.rotation = Math.atan2(e.vel.y, e.vel.x);
          else v.root.rotation = Math.atan2(this.player.pos.y - e.pos.y, this.player.pos.x - e.pos.x);
        }
      }
      this.syncTelegraph(e);
    }
    this.enemies = this.enemies.filter((e) => e.alive || this.enemyViews.has(e));

    // Camera lead — bias toward where you're aiming/moving, framing the danger.
    const leadX = clamp(this.lastAim.x * 70 + p.vel.x * 0.18, -90, 90);
    const leadY = clamp(this.lastAim.y * 70 + p.vel.y * 0.18, -90, 90);
    this.engine.centerOn(p.pos.x + leadX, p.pos.y + leadY);
    this.engine.updateCamera(dt);
    // Trauma shake (integer offset, no rotation) + decaying directional recoil.
    this.recoil.x *= 0.82;
    this.recoil.y *= 0.82;
    if (this.shake > 0 || Math.abs(this.recoil.x) > 0.5 || Math.abs(this.recoil.y) > 0.5) {
      const mag = this.shake * this.shake * 16;
      const ox = ((Math.random() * 2 - 1) * mag + this.recoil.x) | 0;
      const oy = ((Math.random() * 2 - 1) * mag + this.recoil.y) | 0;
      this.engine.sceneRoot.position.x += ox;
      this.engine.sceneRoot.position.y += oy;
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
    if (this.fadeG) {
      this.fadeG.parent?.removeChild(this.fadeG);
      this.fadeG.destroy();
      this.fadeG = undefined;
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
    for (const w of this.wisps) {
      w.s.parent?.removeChild(w.s);
      w.s.destroy();
    }
    this.wisps = [];
    for (const m of this.muzzles) {
      m.s.parent?.removeChild(m.s);
      m.s.destroy();
    }
    this.muzzles = [];
    for (const d of this.dyingViews) {
      d.root.parent?.removeChild(d.root);
      d.root.destroy({ children: true });
      d.glow.parent?.removeChild(d.glow);
      d.glow.destroy();
    }
    this.dyingViews = [];
    this.teardownBoss();
    this.floaters.destroy();
    if (this.flowFx) {
      this.flowFx.destroy();
      this.flowFx = null;
    }
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
  /** Debug: trigger a portal descent to the next stratum (QA only). */
  debugDescend(): void {
    if (!this.transitioning && !this.ended && this.stratumIndex < STRATA.length - 1) {
      this.transitionStratum(this.stratumIndex + 1);
    }
  }
  /** Debug: spawn one of each fauna near the player to inspect the sprites (QA only). */
  debugSpawnFauna(): void {
    const kinds: EnemyKind[] = ["spitter", "darter", "drifter"];
    const p = this.player.pos;
    const savedSpawns = this.arena.spawns;
    const savedFauna = this.arena.fauna;
    kinds.forEach((k, i) => {
      this.arena.spawns = [{ x: p.x - 150 + i * 150, y: p.y - 150 }];
      this.arena.fauna = [{ kind: k, weight: 1 }];
      this.spawnEnemy(4);
    });
    this.arena.spawns = savedSpawns;
    this.arena.fauna = savedFauna;
  }
  /** Debug: warp straight to the Cradle floor + summon the guardian (QA only). */
  debugToCradle(): void {
    this.depth = STRATA_DEPTH * (STRATA.length - 1) + 10;
    this.doStratumRebuild(STRATA.length - 1);
  }
  /** Debug: instantly fell the guardian to test the victory flow (QA only). */
  debugKillBoss(): void {
    if (this.boss && this.boss.alive) {
      this.boss.hp = 0;
      this.boss.alive = false;
      this.onEnemyKilled(this.boss);
    }
  }
  get bossAlive(): boolean {
    return !!this.boss?.alive;
  }
  get bulletCount(): number {
    return this.proj.activeCount;
  }
}
