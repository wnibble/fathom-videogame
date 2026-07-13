// Run-owned progression state — the spine of the roguelite. Holds score/combo,
// XP/level, the player's stat modifiers, and the derived weapon. Scoring,
// level-ups, upgrades, and difficulty scaling all read or mutate this.

import type { EmitterSpec } from "../core/types";
import { UPGRADES, UPGRADE_BY_ID, type Upgrade } from "../content/upgrades";
import { applyMetaToStats, type MetaState } from "./meta";

export const MULT_CAP = 4;
export const COMBO_WINDOW = 5; // sec
export const BASE_FIRE_INTERVAL = 0.13;
export const BASE_HP = 100;

export interface ScoreState {
  score: number;
  combo: number;
  comboTimer: number;
  multiplier: number;
  noHitTimer: number;
  depthScored: number;
}
export interface XpState {
  level: number;
  xp: number;
  xpToNext: number;
  pendingLevelUps: number;
}
export interface PlayerStats {
  damageMult: number;
  fireRateMult: number;
  extraProjectiles: number;
  spreadPerShot: number;
  bulletRadiusMult: number;
  projSpeedMult: number;
  ttlMult: number;
  pierce: number;
  lifestealFrac: number;
  moveSpeedMult: number;
  dashCooldownMult: number;
  magnetRadius: number;
  enemyBulletSlow: number;
  maxHpBonus: number;
  postDashHaste: number;
  regenPerSec: number;
  shieldCapBonus: number; // in-run shield capacity added (Aegis Cell)
  shieldRegenBonus: number; // in-run shield regen/s added
}

export interface RunState {
  score: ScoreState;
  xp: XpState;
  stats: PlayerStats;
  stacks: Record<string, number>;
  weapon: EmitterSpec;
  fireInterval: number;
  kills: number;
  relics: number;
  samples: number;
  scoreMult: number; // weather / boon score multiplier
}

export function freshStats(): PlayerStats {
  return {
    damageMult: 1,
    fireRateMult: 1,
    extraProjectiles: 0,
    spreadPerShot: 0.14,
    bulletRadiusMult: 1,
    projSpeedMult: 1,
    ttlMult: 1,
    pierce: 0,
    lifestealFrac: 0,
    moveSpeedMult: 1,
    dashCooldownMult: 1,
    magnetRadius: 72,
    enemyBulletSlow: 0,
    maxHpBonus: 0,
    postDashHaste: 0,
    regenPerSec: 0,
    shieldCapBonus: 0,
    shieldRegenBonus: 0,
  };
}

export function xpForLevel(level: number): number {
  // Quadratic early (gentle ramp), then flattens so the upgrade decision beat
  // keeps arriving deep into a run instead of stalling out.
  if (level <= 6) return Math.round(40 + 25 * level + 4 * level * level);
  return Math.round(40 + 25 * 6 + 4 * 36 + (level - 6) * 170);
}

export function deriveWeapon(base: EmitterSpec, s: PlayerStats): EmitterSpec {
  return {
    ...base,
    count: 1 + s.extraProjectiles,
    spread: s.extraProjectiles > 0 ? s.spreadPerShot * s.extraProjectiles : 0,
    speed: base.speed * s.projSpeedMult,
    bulletRadius: base.bulletRadius * s.bulletRadiusMult,
    ttl: base.ttl * s.ttlMult,
    damage: (base.damage ?? 10) * s.damageMult,
    pierce: s.pierce,
  };
}
export function fireInterval(s: PlayerStats, hasteFactor = 1): number {
  return BASE_FIRE_INTERVAL / (s.fireRateMult * hasteFactor);
}

export function freshRun(baseWeapon: EmitterSpec, meta?: MetaState): RunState {
  const stats = freshStats();
  if (meta) applyMetaToStats(stats, meta);
  return {
    score: { score: 0, combo: 0, comboTimer: 0, multiplier: 1, noHitTimer: 0, depthScored: 0 },
    xp: { level: 1, xp: 0, xpToNext: xpForLevel(1), pendingLevelUps: 0 },
    stats,
    stacks: {},
    weapon: deriveWeapon(baseWeapon, stats),
    fireInterval: fireInterval(stats),
    kills: 0,
    relics: 0,
    samples: 0,
    scoreMult: 1,
  };
}

function recomputeMultiplier(run: RunState): void {
  run.score.multiplier = Math.min(MULT_CAP, 1 + Math.floor(run.score.combo / 5) * 0.5);
}

/** Raw score add; `mult` applies the current combo multiplier. Weather scales all score. */
export function addScore(run: RunState, base: number, mult = true): void {
  run.score.score += Math.round(base * (mult ? run.score.multiplier : 1) * run.scoreMult);
}

export function addXp(run: RunState, amount: number): void {
  run.xp.xp += amount;
  while (run.xp.xp >= run.xp.xpToNext) {
    run.xp.xp -= run.xp.xpToNext;
    run.xp.level += 1;
    run.xp.xpToNext = xpForLevel(run.xp.level);
    run.xp.pendingLevelUps += 1;
  }
}

export function onKill(run: RunState, elite: boolean): void {
  run.kills += 1;
  run.score.combo += 1;
  run.score.comboTimer = COMBO_WINDOW;
  recomputeMultiplier(run);
  addScore(run, elite ? 400 : 100, true);
  addXp(run, elite ? 45 : 12);
}
export function onPlayerHitScore(run: RunState): void {
  run.score.combo = 0;
  run.score.multiplier = 1;
  run.score.noHitTimer = 0;
}
export function tickScore(run: RunState, dt: number): void {
  const s = run.score;
  if (s.comboTimer > 0) {
    s.comboTimer -= dt;
    if (s.comboTimer <= 0 && s.combo > 0) {
      s.combo = Math.max(0, s.combo - 1);
      s.comboTimer = COMBO_WINDOW;
      recomputeMultiplier(run);
    }
  }
  s.noHitTimer += dt;
  if (s.noHitTimer >= 20) {
    s.noHitTimer -= 20;
    addScore(run, 250, false);
  }
}
export function depthMilestone(run: RunState, depth: number): void {
  while (depth >= run.score.depthScored + 25) {
    run.score.depthScored += 25;
    addScore(run, 50, false);
  }
}

/** Difficulty scalar: depth AND build power push it. */
export function depthTier(depth: number, level: number): number {
  return depth / 100 + level * 0.35;
}

// ---- upgrades ----
export interface UpgradeChoice {
  id: string;
  name: string;
  desc: string;
  category: string;
  stacks: number;
}

function available(run: RunState): Upgrade[] {
  return UPGRADES.filter((u) => (run.stacks[u.id] ?? 0) < u.maxStacks);
}
export function hasUpgradesAvailable(run: RunState): boolean {
  return available(run).length > 0;
}
export function maxedAnyUpgrade(run: RunState): boolean {
  return UPGRADES.some((u) => (run.stacks[u.id] ?? 0) >= u.maxStacks);
}

/** How much the run leans into each upgrade category (drives the draft + glow hue). */
export function leanCounts(run: RunState): { offense: number; defense: number; utility: number } {
  const c = { offense: 0, defense: 0, utility: 0 };
  for (const [id, n] of Object.entries(run.stacks)) {
    const u = UPGRADE_BY_ID[id];
    if (u) c[u.category] += n;
  }
  return c;
}

/** The diver's core HUE reflects its build identity (glow-as-identity). Stays cool. */
export function leanHue(run: RunState): number {
  const c = leanCounts(run);
  const max = Math.max(c.offense, c.defense, c.utility);
  if (max === 0) return 0x39d7e6; // neutral aqua
  if (c.offense === max) return 0x8ff6ff; // bright cyan — pressure/offense
  if (c.defense === max) return 0x53e0a0; // mint — resilience
  return 0x9db8ff; // periwinkle — utility
}

/** Weighted, distinct 3-card roll, biased toward the run's lean (directable draft). */
export function rollChoices(run: RunState): UpgradeChoice[] {
  const pool = available(run);
  const lean = leanCounts(run);
  const totalLean = lean.offense + lean.defense + lean.utility || 1;
  const picks: Upgrade[] = [];
  const bag = pool.slice();
  const weightOf = (u: Upgrade) => u.weight * (1 + 0.7 * (lean[u.category] / totalLean));
  while (picks.length < 3 && bag.length) {
    let total = 0;
    for (const u of bag) total += weightOf(u);
    let r = Math.random() * total;
    let idx = 0;
    for (let i = 0; i < bag.length; i++) {
      r -= weightOf(bag[i]);
      if (r <= 0) {
        idx = i;
        break;
      }
    }
    picks.push(bag.splice(idx, 1)[0]);
  }
  return picks.map((u) => ({ id: u.id, name: u.name, desc: u.desc, category: u.category, stacks: run.stacks[u.id] ?? 0 }));
}

/** Apply an upgrade to the run; re-derives weapon + fire interval. Returns the
 * max-HP delta so the caller can bump the live player. */
export function applyUpgrade(run: RunState, id: string, baseWeapon: EmitterSpec): number {
  const u = UPGRADE_BY_ID[id];
  if (!u) return 0;
  const beforeHp = run.stats.maxHpBonus;
  u.apply(run.stats);
  run.stacks[id] = (run.stacks[id] ?? 0) + 1;
  run.weapon = deriveWeapon(baseWeapon, run.stats);
  run.fireInterval = fireInterval(run.stats);
  return run.stats.maxHpBonus - beforeHp;
}
