# Contract — `pass5-meta` (Surface Station meta-progression layer)

> **Design doc for pass 5.** Adds the missing half of the FATHOM loop (Bible Part 2):
> the **Surface Station** — the between-dive hub that turns a run's samples into a
> permanent economy. Samples banked as **pearls** → a permanent-upgrade store that
> seeds every fresh run stronger → a regenerating **shield** mechanic → **badges**
> for milestones → **stat bars that visibly grow** with your permanent power. Built
> ON the EXISTING architecture (`StateMachine`, `DiveScene`, `RunState`, `SaveData`,
> `Overlay`, `Hud`). The engine and the dive sim are NOT rewritten — every change is
> additive or a widened signature.

**Owner goal being solved:** there is currently no *reason to dive again* beyond a
high-score number. Death loses everything unbanked (correct per Pillar 3) but grants
nothing permanent, so runs don't compound. Pass 5 gives the "collect & upgrade is the
spine" pillar its first real expression: you surface, you bank, you buy, you go deeper.

**Pillar fidelity.**
1. *Readable danger* — shield is a clearly-coloured HUD bar consumed BEFORE HP; no
   hidden mitigation. Death still hurts (you keep only a fraction).
2. *The deep is beautiful* — station art is Graphics-only panels in the master
   palette; no new bloom clutter in the dive.
3. *Every dive is a story* — you ALWAYS surface with something now (pearls + maybe a
   badge), even on a bad run. Death banks 40%, not 0%.
4. *Collect & upgrade is the spine* — the meta store is the compounding hook the whole
   game points at.

---

## 0. OVERVIEW — new modules & touched files

**One new persistent economy** flows through three new content-data files and one new
state. `SaveData` gains the durable fields; a pure `MetaState` (derived from purchased
tiers) seeds each `freshRun`/player init; the `station` state hosts the store + badge
grid; the HUD grows a shield bar and a scaling HP bar.

**New files (all additive):**
- `src/content/meta_upgrades.ts` — the permanent-upgrade catalog (data, like `upgrades.ts`). Exports `META_UPGRADES`, `META_BY_ID`, `freshMeta()`, `deriveMeta(tiers)`, `metaCost(u, tier)`.
- `src/content/badges.ts` — badge catalog (data). Exports `BADGES`, `BADGE_BY_ID`, `evaluateBadges(ctx)`.
- `src/game/meta.ts` — `MetaState` type + the seam that applies meta to a run (`applyMetaToStats`, `startingLevelUps`, shield seed). Thin; keeps `progression.ts` unaware of persistence.
- `src/game/shield.ts` — `ShieldState` + pure `tickShield` / `absorb` functions (mirrors `dash.ts`'s shape).
- `src/ui/station.ts` — `StationOverlay` (store + badge grid + launch). Reuses `Overlay`, `Button`, and the new panel helpers from `overlays.ts`.

**Files CHANGED:**
- `src/core/state.ts` — add `"station"` to `StateName`.
- `src/core/types.ts` — `Player` gains shield fields.
- `src/game/persistence.ts` — `SaveData` gains `pearls`, `metaTiers`, `badges`, lifetime counters; add `bankDive`, `purchaseMeta`; widen `recordDive` (kept for callers) → superseded by `bankDive`.
- `src/game/progression.ts` — `freshRun(baseWeapon, meta?)` seeds stats from `MetaState`; export a `maxedAnyUpgrade(run)` helper.
- `src/game/dive.ts` — constructor takes `MetaState`; seeds player HP/shield/stats; `onPlayerHit` consumes shield first; `step` ticks shield regen; expose shield getters + `DiveResult`.
- `src/ui/hud.ts` — scaling HP bar, new shield bar, compact build readout; widened `update()` signature.
- `src/ui/overlays.ts` — extract shared `panel()` / `header()` / chip helpers (UI-appeal pass); `GameOverOverlay` shows pearls earned & new badges; menu adds an ENTER STATION path.
- `src/main.ts` — wire the `station` state; route `menu → station → dive → gameover → station`; bank on game-over; feed `MetaState` into `startDive`; pass shield to HUD.

---

## 1. STATE FLOW — `station` hub

### Data (`src/core/state.ts`)
```ts
export type StateName =
  | "boot" | "loading" | "error"
  | "menu" | "howto"
  | "station"                 // NEW: the surface hub (store + badges + launch)
  | "cutscene" | "dive"
  | "levelup" | "pause" | "gameover";
```

### Transition map (enforced by the existing `StateMachine`; every state keeps an exit)
```
loading → menu
menu    → station        (button "SURFACE STATION")   ┐ menu stays the title card
menu    → howto                                        ┘ (settings toggles live here)
station → cutscene | dive (LAUNCH DIVE; cutscene only if !playedIntro)
station → menu           (BACK)
dive    → gameover       (death, unchanged)
gameover→ station        (press-any-key; bank happens on gameover.enter)  ← CHANGED (was → menu)
pause   → dive | station (QUIT TO SURFACE now returns to station, not menu)
```

The station is re-entered after every dive, so banked pearls + newly-earned badges are
shown the moment you surface — that is the compounding beat.

### `main.ts` wiring (additions to the existing `fsm.define` chain)
```ts
// carried between dive-end and station.enter so the station can toast results:
let lastBank: { pearlsEarned: number; newBadges: string[] } | null = null;

const buildStation = () =>
  new StationOverlay(save, lastBank, {
    onLaunch: () => fsm.change(playedIntro ? "dive" : "cutscene"),
    onBack:   () => fsm.change("menu"),
    onBuy: (id) => {                       // returns the fresh SaveData on success
      const r = persistence.purchaseMeta(save, id);
      if (r.ok) { save = r.save; audio.uiConfirm(); }
      else audio.uiMove();                 // "can't afford" nudge
      return save;                         // overlay re-reads tiers/pearls & redraws
    },
  });

fsm.define("station", {
  enter: () => { setOverlay(buildStation()); lastBank = null; },
  update: () => {
    const s = activeOverlay as StationOverlay;
    if (input.pressed(KEYS.up))    s.move(-1);
    if (input.pressed(KEYS.down))  s.move(1);
    if (input.pressed(KEYS.left))  s.column(-1);   // store ↔ launch/back column
    if (input.pressed(KEYS.right)) s.column(1);
    if (input.pressed(KEYS.confirm)) s.activate();
    if (input.pressed(KEYS.pause))   fsm.change("menu");
  },
  exit: () => setOverlay(null),
});
```

`startDive` must now seed the run from meta (see §3):
```ts
const startDive = () => {
  const meta = deriveMeta(save.metaTiers);       // MetaState from purchased tiers
  dive = new DiveScene(engine, assets, seed, save.settings.reducedMotion,
                       save.settings.screenShake, meta);           // <-- new arg
  dive.onGameOver = (result) => {                 // result: DiveResult (see §2)
    goPrevBestDepth = save.bestDepth; goPrevBestScore = save.bestScore;
    const bank = persistence.bankDive(save, result);   // grants pearls + badges
    save = bank.save;
    lastBank = { pearlsEarned: bank.pearlsEarned, newBadges: bank.newBadges };
    goResult = result;                            // for the game-over overlay
    fsm.change("gameover");
  };
  ...
};
```

**Acceptance:** `menu→station→dive→gameover→station→dive` completes with no soft-lock;
banked pearls appear on the station header the instant you surface; `QUIT TO SURFACE`
from pause lands on the station; the `menu` title card still reachable via BACK.

---

## 2. BANKING — samples → pearls

**Rule (fair, Pillar-3-faithful):** dying banks a **fraction** of unbanked samples as
permanent **pearls**; a future voluntary "surface" action banks **100%**. The default
death fraction is **0.40**, raised by the `salvage-training` meta upgrade (see table).
Depth and score records still bank in full (unchanged behaviour).

### `DiveScene` emits a result object (replaces the 3-arg `onGameOver`)
```ts
// src/game/dive.ts
export interface DiveResult {
  depth: number;
  score: number;
  samples: number;         // unbanked samples at death
  kills: number;
  elites: number;          // elite kills this run (new counter)
  relics: number;
  level: number;
  surfaced: boolean;       // false = death (40%), true = voluntary surface (100%)
  maxedUpgrade: boolean;   // did any in-run upgrade reach maxStacks? (badge input)
  seen: string[];          // codex keys (currently [])
}
onGameOver: (r: DiveResult) => void = () => {};
```
`DiveScene` already tracks `kills`, `relics`, `level`, `samples`; add an `eliteKills`
counter (increment in `onEnemyKilled` when `enemy.elite`) and compute `maxedUpgrade`
from `run.stacks` vs `UPGRADES[].maxStacks` via the new `maxedAnyUpgrade(run)`.

### Persistence (`src/game/persistence.ts`)
```ts
export interface SaveData {
  guestId: string;
  bestDepth: number;
  bestScore: number;
  totalSamples: number;
  runs: number;
  codexSeen: string[];
  settings: Settings;
  // ---- NEW (pass 5) ----
  pearls: number;                       // spendable currency
  metaTiers: Record<string, number>;    // meta upgrade id → purchased tier
  badges: string[];                     // unlocked badge ids
  totalKills: number;                   // lifetime (badge inputs)
  totalElites: number;
  totalRelics: number;
  totalPearlsEarned: number;            // lifetime earned (badge input)
}

export const DEATH_BANK_RATIO = 0.40;   // base; +0.05/tier via salvage-training

export function bankDive(
  data: SaveData, r: DiveResult
): { save: SaveData; pearlsEarned: number; newBadges: string[] } {
  const ratio = r.surfaced ? 1 : DEATH_BANK_RATIO + 0.05 * (data.metaTiers["salvage-training"] ?? 0);
  const pearlsEarned = Math.floor(r.samples * Math.min(1, ratio));
  let next: SaveData = {
    ...data,
    bestDepth: Math.max(data.bestDepth, r.depth),
    bestScore: Math.max(data.bestScore, r.score),
    totalSamples: data.totalSamples + r.samples,       // lifetime, informational
    runs: data.runs + 1,
    pearls: data.pearls + pearlsEarned,
    totalPearlsEarned: data.totalPearlsEarned + pearlsEarned,
    totalKills: data.totalKills + r.kills,
    totalElites: data.totalElites + r.elites,
    totalRelics: data.totalRelics + r.relics,
    codexSeen: Array.from(new Set([...data.codexSeen, ...r.seen])),
  };
  const newBadges = evaluateBadges(badgeCtx(next, r));  // §6
  if (newBadges.length) next = { ...next, badges: Array.from(new Set([...next.badges, ...newBadges])) };
  save(next);
  return { save: next, pearlsEarned, newBadges };
}
```
`load()` gains coercion for every new field (mirroring the existing `num`/`bool`
guards): `pearls`/counters via `num(_,0)`; `metaTiers` via an object-of-finite-numbers
filter; `badges` via the existing string-array filter. `fresh()` seeds all to `0`/`{}`/`[]`.
Keep the old `recordDive` exported (unused by `main` after this pass) or delete once
`main.ts` is migrated — no other callers exist.

**Acceptance:** dying with 50 unbanked samples and 0 `salvage-training` grants exactly
`20` pearls; `save.pearls` persists across reload; a voluntary-surface path (when built)
grants 100%. Records still update from `r.depth`/`r.score`.

---

## 3. PERMANENT UPGRADE STORE — `MetaState` seeding

### `MetaState` (the seed a fresh run reads) — `src/game/meta.ts`
```ts
import type { PlayerStats } from "./progression";

export interface MetaState {
  bonusMaxHp: number;          // added to BASE_HP at player init
  damageMultAdd: number;       // added onto stats.damageMult (1 + add)
  fireRateMultAdd: number;     // added onto stats.fireRateMult
  moveSpeedMultAdd: number;    // added onto stats.moveSpeedMult
  magnetBonus: number;         // added to stats.magnetRadius
  dashCdMult: number;          // multiplies stats.dashCooldownMult (<=1 = faster)
  startingLevelUps: number;    // extra in-run upgrade picks queued at run start
  shieldCapacity: number;      // 0 = shield locked; >0 = starting shield capacity
  shieldRegenRate: number;     // shield points / sec
  shieldRegenDelay: number;    // sec after last hit before regen resumes
}

export function freshMeta(): MetaState {
  return { bonusMaxHp: 0, damageMultAdd: 0, fireRateMultAdd: 0, moveSpeedMultAdd: 0,
           magnetBonus: 0, dashCdMult: 1, startingLevelUps: 0,
           shieldCapacity: 0, shieldRegenRate: 8, shieldRegenDelay: 3.5 };
}

/** Fold a fresh MetaState with every purchased tier. */
export function deriveMeta(tiers: Record<string, number>): MetaState {
  const m = freshMeta();
  for (const u of META_UPGRADES) { const t = tiers[u.id] ?? 0; if (t > 0) u.apply(m, t); }
  return m;
}

/** Seam into progression: bias a fresh PlayerStats by the meta layer. */
export function applyMetaToStats(s: PlayerStats, m: MetaState): void {
  s.damageMult    += m.damageMultAdd;
  s.fireRateMult  += m.fireRateMultAdd;
  s.moveSpeedMult += m.moveSpeedMultAdd;
  s.magnetRadius  += m.magnetBonus;
  s.dashCooldownMult *= m.dashCdMult;
  // maxHpBonus is NOT touched here — meta HP is applied to Player.maxHp directly in dive.ts
}
```

### `progression.ts` change (minimal, backward-compatible)
```ts
export function freshRun(baseWeapon: EmitterSpec, meta?: MetaState): RunState {
  const stats = freshStats();
  if (meta) applyMetaToStats(stats, meta);      // NEW
  const run = { /* ...existing, using seeded stats... */ };
  return run;
}
export function maxedAnyUpgrade(run: RunState): boolean {   // NEW (badge input)
  return UPGRADES.some((u) => (run.stacks[u.id] ?? 0) >= u.maxStacks);
}
```

### `DiveScene` constructor seeding (`dive.ts`)
```ts
constructor(engine, assets, seed, reducedMotion = false, screenShake = true,
            private meta: MetaState = freshMeta()) {
  ...
  this.run = freshRun(PLAYER_SHOT, meta);
  const maxHp = BASE_HP + meta.bonusMaxHp;
  this.player = { ...pos/vel..., radius: 10, hp: maxHp, maxHp,
                  fireCooldown: 0, invuln: 0, alive: true,
                  shieldMax: meta.shieldCapacity, shield: meta.shieldCapacity, shieldRegenT: 0 };
  this.run.xp.pendingLevelUps += meta.startingLevelUps;    // extra starting picks
  ...
}
```
The extra starting picks ride the EXISTING `consumeLevelUp` flow — the dive opens the
level-up card immediately on `enter`, so no new UI is needed.

### The catalog — `src/content/meta_upgrades.ts` (data, mirrors `upgrades.ts`)
```ts
import type { MetaState } from "../game/meta";

export type MetaCategory = "offense" | "defense" | "utility";
export interface MetaUpgrade {
  id: string; name: string; desc: string;
  icon: string;                 // single glyph for the store row (mono-safe)
  category: MetaCategory;
  maxTier: number;
  baseCost: number;             // tier-1 cost
  growth: number;               // cost(tier) = round(baseCost * growth^(tier-1))
  requires?: string;            // gate (e.g. shield-dynamo needs shield-emitter)
  apply(m: MetaState, tier: number): void;   // tier = purchased count (1..maxTier)
}
export function metaCost(u: MetaUpgrade, currentTier: number): number {
  return Math.round(u.baseCost * Math.pow(u.growth, currentTier)); // cost of NEXT tier
}
export const META_UPGRADES: MetaUpgrade[] = [ /* see table below */ ];
export const META_BY_ID = Object.fromEntries(META_UPGRADES.map((u) => [u.id, u]));
```

### `purchaseMeta` (`persistence.ts`)
```ts
export function purchaseMeta(data: SaveData, id: string): { save: SaveData; ok: boolean } {
  const u = META_BY_ID[id]; if (!u) return { save: data, ok: false };
  const tier = data.metaTiers[id] ?? 0;
  if (tier >= u.maxTier) return { save: data, ok: false };
  if (u.requires && (data.metaTiers[u.requires] ?? 0) < 1) return { save: data, ok: false };
  const cost = metaCost(u, tier);
  if (data.pearls < cost) return { save: data, ok: false };
  const next: SaveData = { ...data, pearls: data.pearls - cost,
                           metaTiers: { ...data.metaTiers, [id]: tier + 1 } };
  save(next);
  return { save: next, ok: true };
}
```

**Acceptance:** buying `reinforced-hull` t1 for 40 pearls leaves `pearls-40`, sets
`metaTiers["reinforced-hull"]=1`, and the very next dive starts at `BASE_HP+20` HP
(HUD bar visibly wider, §5). Gated `shield-dynamo` is unbuyable until `shield-emitter`
t1 is owned. Can't overspend; can't exceed `maxTier`.

### META-UPGRADE TABLE (10 upgrades)
Cost column shows the per-tier price (`baseCost·growth^(t-1)`, rounded).

| id | name | icon | cat | maxTier | effect / tier | cost per tier |
|----|------|------|-----|---------|---------------|---------------|
| `reinforced-hull` | Reinforced Hull | ♥ | defense | 5 | +20 base max HP | 40 · 60 · 90 · 135 · 200 |
| `honed-barrel` | Honed Barrel | ✦ | offense | 5 | +8% base damage | 50 · 75 · 110 · 165 · 245 |
| `rapid-coils` | Rapid Coils | ⚡ | offense | 5 | +6% base fire rate | 50 · 75 · 110 · 165 · 245 |
| `hydrojets` | Hydrojets | » | utility | 4 | +5% base move speed | 35 · 55 · 85 · 130 |
| `shield-emitter` | Shield Emitter | ⬡ | defense | 4 | **unlock shield**; +30 cap t1, +25/tier after | 80 · 130 · 205 · 320 |
| `shield-dynamo` | Shield Dynamo | ⟳ | defense | 3 | +4 regen/s & −0.6 s delay (needs Emitter) | 60 · 100 · 165 |
| `lure-field` | Lure Field | ◎ | utility | 3 | +18 pickup magnet radius | 30 · 50 · 80 |
| `vent-tuning` | Vent Tuning | ✸ | utility | 3 | −8% base dash cooldown | 45 · 70 · 110 |
| `dive-cache` | Dive Cache | ▣ | utility | 3 | +1 starting in-run upgrade pick | 100 · 180 · 320 |
| `salvage-training` | Salvage Training | ◈ | defense | 3 | +5% death-bank ratio (40→55%) | 80 · 140 · 230 |

`apply` examples (data, not prose):
```ts
{ id:"reinforced-hull", ..., maxTier:5, baseCost:40, growth:1.5,
  apply:(m,t)=>{ m.bonusMaxHp += 20*t; } },
{ id:"shield-emitter", ..., maxTier:4, baseCost:80, growth:1.55, category:"defense",
  apply:(m,t)=>{ m.shieldCapacity += 30 + 25*(t-1); } },     // t1=30, t2=55, t3=80, t4=105
{ id:"shield-dynamo", ..., requires:"shield-emitter", maxTier:3, baseCost:60, growth:1.7,
  apply:(m,t)=>{ m.shieldRegenRate += 4*t; m.shieldRegenDelay = Math.max(1.2, m.shieldRegenDelay - 0.6*t); } },
{ id:"dive-cache", ..., apply:(m,t)=>{ m.startingLevelUps += t; } },
```
Note `apply(m,t)` receives the FINAL tier (fold uses the cumulative tier), so effects
are written as totals, not deltas — matches the single-pass `deriveMeta` loop.

---

## 4. SHIELD MECHANIC

A regenerating buffer that absorbs damage before HP. **Unlocked & scaled by the
`shield-emitter` meta upgrade** AND stackable by a **new in-run upgrade** so a build can
lean into it mid-run even without meta.

### `Player` fields (`src/core/types.ts`)
```ts
export interface Player {
  ...existing...
  shieldMax: number;    // 0 = no shield (locked / not built)
  shield: number;       // current points
  shieldRegenT: number; // sec counted since last hit (regen gated by delay)
}
```

### Pure module (`src/game/shield.ts`, mirrors `dash.ts`)
```ts
export interface ShieldParams { regenRate: number; regenDelay: number; }
/** Advance shield regen. Call once per fixed step. */
export function tickShield(p: Player, sp: ShieldParams, dt: number): void {
  if (p.shieldMax <= 0) return;
  p.shieldRegenT += dt;
  if (p.shieldRegenT >= sp.regenDelay && p.shield < p.shieldMax)
    p.shield = Math.min(p.shieldMax, p.shield + sp.regenRate * dt);
}
/** Absorb incoming damage. Returns { hpDamage, fullyAbsorbed }. */
export function absorb(p: Player, damage: number): { hpDamage: number; absorbed: boolean } {
  p.shieldRegenT = 0;                       // any hit resets regen delay
  if (p.shieldMax <= 0 || p.shield <= 0) return { hpDamage: damage, absorbed: false };
  const taken = Math.min(p.shield, damage);
  p.shield -= taken;
  const overflow = damage - taken;
  return { hpDamage: overflow, absorbed: overflow <= 0 };
}
```

### `DiveScene` integration
`step()` — add after the regen line: `tickShield(this.player, { regenRate: this.meta.shieldRegenRate + this.run.stats.shieldRegenBonus, regenDelay: this.meta.shieldRegenDelay }, dt);`

`onPlayerHit(damage, at)` — shield consumes first:
```ts
onPlayerHit(damage: number, at: Vec2): void {
  const { hpDamage, absorbed } = absorb(this.player, damage);
  this.player.hp -= hpDamage;
  this.player.invuln = 0.85;                       // i-frames unchanged
  if (this.shakeEnabled) this.shake = absorbed ? 5 : 10;   // softer knock on a clean absorb
  if (!this.reducedMotion) this.hitstop = absorbed ? 0.03 : 0.05;
  if (!absorbed) onPlayerHitScore(this.run);       // DESIGN: a fully-absorbed hit keeps combo
  audio.playerHit();
  this.spawnFx(absorbed ? "impact_aqua" : "impact_coral", at.x, at.y);   // cool = shielded
  bus.emit("player:hit", { damage, absorbed });
  if (this.player.hp <= 0) { this.player.hp = 0; this.player.alive = false; bus.emit("player:died", undefined); }
}
```
**Design choice (documented, not silent):** a hit *fully absorbed by shield* does NOT
break your combo — this is the payoff that makes the shield build worth buying, and it
reads cleanly (cool impact = "you were protected"). A hit that spills into HP breaks
combo as today. Tunable; if playtest finds it too strong, flip `if (!absorbed)` to
always break.

### In-run shield upgrade (add to `src/content/upgrades.ts`) + `PlayerStats`
```ts
// progression.ts PlayerStats gains:  shieldCapBonus: number; shieldRegenBonus: number;  (fresh = 0)
{ id:"shieldcap", name:"Aegis Cell", desc:"+30 shield capacity", category:"defense",
  weight:5, maxStacks:3, apply:(s)=>{ s.shieldCapBonus += 30; } },
```
On `applyUpgrade`, when `shieldCapBonus` rises, bump the live player:
`this.player.shieldMax += dCap; this.player.shield += dCap;` (return the delta like the
HP path already does, or read `run.stats.shieldCapBonus` after apply). Player init sets
`shieldMax = meta.shieldCapacity + run.stats.shieldCapBonus` (0 at t0).

**Acceptance:** with `shield-emitter` t1 (cap 30), a 20-damage hit removes 20 shield and
0 HP, keeps combo, plays a cool impact; a 40-damage hit removes 30 shield + 10 HP and
breaks combo; after `regenDelay` with no hits, shield refills at `regenRate`/s; the
in-run `Aegis Cell` raises `shieldMax` live and the HUD bar widens (§5).

---

## 5. SCALING STAT BARS + BUILD READOUT (HUD)

The owner wants power to be *visible*: the HP bar grows with max HP, a shield bar
appears above it when shield exists, and owned in-run upgrades show as a compact strip.

### Widened `Hud.update` signature (`src/ui/hud.ts`)
```ts
update(run: RunState, hp: number, maxHp: number, shield: number, shieldMax: number,
       depth: number, best: number, dashFrac: number, dt: number): void
```
(`main.ts` dive-loop call updates to pass `dive.hp, dive.maxHp, dive.shield, dive.shieldMax`
via new getters; keep `hpRatio` getter for the debug panel.)

### Bar geometry (all from `layout`/`update`, so resize stays correct)
```ts
// HP bar width scales with max HP, clamped so it never dominates the screen.
const BAR_X = 20, HP_BASE_W = 200, HP_PER_HP = 0.9;   // px added per HP over BASE_HP
const hpW = Math.round(Math.max(160, Math.min(360, HP_BASE_W + (maxHp - BASE_HP) * HP_PER_HP)));
const hpY = h - 52;
// track + fill (existing style), width = hpW; fill ratio = hp/maxHp

// Shield bar: only when shieldMax>0, sits ABOVE the HP bar, same x, width ∝ capacity.
if (shieldMax > 0) {
  const shW = Math.round(Math.max(120, Math.min(360, 120 + shieldMax * 1.2)));
  const shY = hpY - 12;                     // stacked directly above HP
  // track: deepNavy; fill: COLOR.aqua (cool = protection), ratio = shield/shieldMax
  // segment ticks every 30 pts (thin navy gaps) so capacity is countable at a glance
}
// XP bar unchanged, but re-anchored to sit below the (now variable-width) HP bar.
```
Colour language: **shield = `COLOR.aqua`** (cool, "yours/protection"), HP stays
`hpFull`/`hpLow`, XP stays `sample`. Never reuse warm hues for defensive bars.

### Build readout (compact, bottom-left, above `LV`)
A one-line strip of chips: each owned in-run upgrade shows `{icon}{stacks}` using the
upgrade's `category` colour (offense=amber, defense=hpFull, utility=aqua). Source:
`run.stacks`. Max ~8 chips; overflow collapses to `+N`. Drawn in the existing `bars`
Graphics + a small pooled `Text[]`. This gives the owner an at-a-glance "what am I
running" without a menu.

**Acceptance:** at `BASE_HP` the HP bar is ~200px; after +100 meta/in-run HP it is
visibly wider (clamped ≤360); the shield bar is absent at `shieldMax=0` and appears
above HP the moment shield is unlocked, with capacity-tick segments; the build strip
lists owned upgrades with correct category colours; everything relayouts on resize.

---

## 6. ACHIEVEMENTS / BADGES

### Catalog (`src/content/badges.ts`, data)
```ts
export interface BadgeCtx {
  bestDepth: number; runDepth: number;
  bestScore: number; runScore: number;
  totalKills: number; totalElites: number; totalRelics: number;
  runRelics: number; runMaxedUpgrade: boolean;
  runs: number; totalPearlsEarned: number;
}
export interface Badge {
  id: string; name: string; icon: string; desc: string;
  test(c: BadgeCtx): boolean;
}
export const BADGES: Badge[] = [ /* see table */ ];
export const BADGE_BY_ID = Object.fromEntries(BADGES.map((b) => [b.id, b]));

/** Returns ids that are newly satisfied. Caller unions into save.badges. */
export function evaluateBadges(c: BadgeCtx): string[] {
  return BADGES.filter((b) => b.test(c)).map((b) => b.id);
}
```
`bankDive` builds the `BadgeCtx` from the post-bank `SaveData` + the `DiveResult`, calls
`evaluateBadges`, and returns any ids not already in `save.badges` as `newBadges`.

### Check hooks
- **Primary: on dive end** — inside `bankDive` (covers depth/score/kills/relics/dives/maxed-build). This is the deterministic, always-runs path.
- **Optional mid-run toast** — a `BadgeWatcher` subscribed to `bus` (`enemy:killed`,
  `relic` via `interactSink.relicClaimed`) can fire a HUD toast the moment `first-relic`
  / `first-elite` cross, for immediacy. It only *displays*; persistence still happens at
  `bankDive` so there's a single source of truth. Mark this hook OPTIONAL for pass 5 —
  the station toast (below) is sufficient for MVP.

### Station display + toast
`StationOverlay` renders a badge grid: unlocked badges show `icon` + `name` in
`aquaBright`; locked show a dim `?` chip with the `desc` as a hint. `newBadges` passed
into the overlay pulse/toast on entry ("★ NEW: Relic Hunter") using a short tween.

### BADGE TABLE (13)
| id | name | icon | condition (`test`) |
|----|------|------|--------------------|
| `first-blood` | First Blood | ☠ | `totalKills >= 1` |
| `depth-100` | The Twilight | ▽ | `bestDepth >= 100` |
| `depth-250` | Into the Dark | ▼ | `bestDepth >= 250` |
| `depth-500` | Abyssward | ⧨ | `bestDepth >= 500` |
| `centurion` | Centurion | ✦ | `totalKills >= 100` |
| `slayer` | Leviathan's Bane | ✦✦ | `totalKills >= 1000` |
| `first-relic` | Relic Hunter | ◈ | `totalRelics >= 1` |
| `first-elite` | Elite Hunter | ★ | `totalElites >= 1` |
| `score-10k` | Bright Spark | ✸ | `bestScore >= 10000` |
| `score-50k` | Supernova | ✸✸ | `bestScore >= 50000` |
| `veteran` | Veteran Diver | ⚓ | `runs >= 25` |
| `maxed-build` | Perfected | ⬢ | `runMaxedUpgrade` (any in-run upgrade at maxStacks) |
| `pearl-hoard` | Pearl Diver | ⬤ | `totalPearlsEarned >= 500` |

**Acceptance:** killing your first enemy and surfacing unlocks `first-blood`; reaching
250 m unlocks `depth-100`+`depth-250` together; unlocked ids persist in `save.badges`
across reload; the station grid shows unlocked vs locked; `newBadges` toast once on the
surfacing that earned them and not again.

---

## 7. UI-APPEAL PASS (concrete, buildable, no new art)

All via `Graphics` in the master palette — cohesive with the existing overlays.

1. **Shared panel helper** (extract from `overlays.ts`, reuse everywhere incl. station):
   ```ts
   function panel(g: Graphics, x,y,w,h: number, opts?: { accent?: number }): void {
     g.roundRect(x, y+3, w, h, 12).fill({ color: COLOR.abyss, alpha: 0.35 });      // drop shadow
     g.roundRect(x, y, w, h, 12).fill({ color: COLOR.deepNavy, alpha: 0.96 })
      .stroke({ width: 1.5, color: COLOR.navy });
     g.roundRect(x, y, w, 4, 12).fill({ color: opts?.accent ?? COLOR.teal, alpha: 0.9 }); // top accent bar
   }
   ```
   A **faux vertical gradient** is a second, taller rounded-rect at `abyss` alpha 0.18
   drawn from the panel's mid-line down — one extra draw, reads as depth without a real
   gradient texture.
2. **Consistent header band** — a top strip (`panel` with `accent = COLOR.aqua`) holding
   a right-aligned currency readout `◈ {pearls}` (mint `sample` colour, bold) and a
   left title. Reuse on station + game-over.
3. **Badge / stat chips** — one `chip(label, color, filled)` helper: a small
   `roundRect(…, 6)` pill, `deepNavy` fill, category-coloured stroke + glyph. Used by
   the HUD build strip (§5), the badge grid, and store tier pips.
4. **Tier pips** — meta store rows show `maxTier` pips (filled aqua = owned, hollow navy
   = unowned) so progress is glanceable without reading numbers.
5. **Selection language** — unify the existing `Button` selected-state (aqua stroke +
   `navy` fill) across store rows and station buttons so keyboard focus reads the same
   everywhere; add a 1px inner highlight line on the selected row.
6. **Spacing/rhythm** — 12px panel padding, 8px inter-chip gap, section headers in
   `teal` 12px letter-spaced caps — apply to station + game-over so the meta screens
   feel like one product. Cool panels, warm accents ONLY for danger/records (keeps the
   pillar-1 warm=danger language intact).

**Acceptance:** station + game-over + HUD share the `panel`/`header`/`chip` visual
language; no raw flat `deepNavy` rectangles remain in the new screens; palette stays
cool with warm reserved for danger/records; nothing regresses the dive's bloom budget.

---

## RECOMMENDED BUILD ORDER

Sequenced so each step is independently testable and later steps compile on earlier
contracts. **[P]** = parallelizable with its siblings once the persistence spine (B1) lands.

- **B1 — Persistence spine.** `SaveData` new fields + `load`/`fresh` coercion +
  `bankDive` + `purchaseMeta` (`persistence.ts`). Foundation everything reads. *DONE: fields persist across reload; `bankDive`/`purchaseMeta` unit-correct.*
- **B2 — Meta data + seam.** `meta.ts` (`MetaState`, `deriveMeta`, `applyMetaToStats`) +
  `meta_upgrades.ts` catalog + `freshRun(meta)` change + `PlayerStats` shield fields.
  *DONE: `deriveMeta` folds tiers; a fresh run seeds boosted stats.* **[P after B1]**
- **B3 — Shield.** `types.ts` Player fields + `shield.ts` + `dive.ts` seeding/tick/
  `onPlayerHit` + in-run `shieldcap` upgrade. *DONE: shield absorbs then HP; regen works.* **[P after B2]**
- **B4 — DiveResult + banking wire.** `dive.ts` emits `DiveResult` (elite counter,
  `maxedUpgrade`); `main.ts` game-over calls `bankDive`. *DONE: death banks 40% pearls.* **[after B1,B3]**
- **B5 — Badges.** `badges.ts` + `bankDive` evaluation + `BadgeCtx`. *DONE: milestones unlock + persist.* **[P after B1]**
- **B6 — Station UI.** `station.ts` `StationOverlay` (store + badge grid + launch) +
  panel/header/chip helpers extracted in `overlays.ts`. *DONE: buy loop works via mouse+keys.* **[after B1,B2,B5]**
- **B7 — State wiring.** `state.ts` `"station"` + `main.ts` `menu→station→dive→gameover→station`,
  pause `QUIT TO SURFACE`. *DONE: full loop, no soft-lock.* **[after B4,B6]**
- **B8 — HUD scaling bars + build readout.** widened `update`, scaling HP, shield bar,
  chip strip. *DONE: bars grow visibly; shield bar appears when unlocked.* **[after B3; P with B6]**
- **B9 — UI-appeal polish + game-over pearls/badges.** apply §7 across station +
  game-over; toast new badges. *DONE: cohesive visual language.* **[after B6,B7]**

---

## INTERFACES THAT MUST HOLD (cross-unit contracts)
- `deriveMeta(save.metaTiers): MetaState` — the ONLY way runs learn permanent power. `DiveScene` never reads `SaveData`.
- `DiveScene.onGameOver(r: DiveResult)` — the ONLY dive→meta payload. `main.ts` owns all persistence writes (`bankDive`, `purchaseMeta`); no system writes `SaveData` from inside the sim.
- `bankDive` is the single badge-evaluation + pearl-grant point (one source of truth); mid-run toasts are display-only.
- Shield lives on `Player`; `absorb`/`tickShield` are pure; only `dive.ts` calls them. HUD reads shield via getters, never mutates.
