# Contract — `pass3-revamp` (roguelite depth, progression & UX overhaul)

> **Design doc for the pass-3 revamp.** Turns the Twilight Drift survival slice into
> a real roguelite bullet-diver: score + combo, in-run XP → level-up upgrade picks,
> **functional** environment objects (declutter with purpose), hidden relics, a full
> menu/pause/game-over navigation shell, a responsive HUD, and a dash. Built on the
> EXISTING architecture (`DiveScene`, `Projectiles`, `StateMachine`, `Hud`) — the
> engine is NOT rewritten.

**Owner problem being solved:** *"looks like a lot going on without really a lot to
do."* Props are decoration, there's no scoring, no progression, no reason to engage
objects, no menus. Every element added here does a real thing; several decorative
scatters are CUT.

**Pillar fidelity:** readable danger (new elements telegraph / use the cool-you /
warm-danger color language), the deep stays beautiful (no new bloom clutter),
every dive is a story (score + relics + level-ups), collect-and-upgrade is the
spine (in-run XP catalog is the first real expression of it).

---

## 0. OVERVIEW & THE ONE NEW MODULE

The revamp centers on **one new run-owned module, `src/game/progression.ts`**, that
holds the mutable per-run state (score, combo, XP, level, player stat modifiers, the
derived weapon spec) plus the upgrade catalog. `DiveScene` owns one `RunState`; the
HUD reads it; `main.ts` drives the level-up overlay from it. Everything else hangs off
this: score events feed it, interactables and relics feed it, upgrades mutate it,
scaling reads its `level`.

New files (all additive):
- `src/game/progression.ts` — `RunState`, `PlayerStats`, XP/score/combo logic, `UPGRADES`, `applyUpgrade`, `rollChoices`, `deriveWeapon`.
- `src/systems/interactables.ts` — functional world objects (loot pods, crates, crystals, vents, probes, relics).
- `src/systems/pickups.ts` — generalized magnetized drop orbs (samples / xp / hp / upgrade), refactored out of `dive.ts`'s inline HP-orb code.
- `src/systems/dash.ts` — dash impulse + i-frames + cooldown (pure function on `Player`).
- `src/ui/menu.ts`, `src/ui/pause.ts`, `src/ui/gameover.ts`, `src/ui/levelup.ts`, `src/ui/overlay.ts` (shared `Overlay` base with responsive `layout(w,h)`).
- `src/content/upgrades.ts` — the catalog data (imported by `progression.ts`; kept as data like `emitters.ts`).
- `src/content/interactable_defs.ts` — interactable kind definitions (reward tables, hp, sprites).

Files CHANGED: `src/core/state.ts` (new states), `src/core/types.ts` (Player/Bullet/EmitterSpec fields), `src/main.ts` (state wiring + overlays + resize), `src/game/dive.ts` (own RunState, interactables, pickups, dash, scoring hooks), `src/systems/projectiles.ts` (pierce + magnet-agnostic), `src/content/biome_twilight.ts` (place interactables/relics, cut scatter), `src/ui/hud.ts` (xp bar, score, combo, responsive), `src/game/persistence.ts` (bestScore), `src/engine/input.ts` (dash key, discrete-press latch, number keys), `src/content/emitters.ts` (base weapon stays; add `ELITE_*` specs).

---

## 1. STATE-MACHINE EXPANSION

### Data shape (`src/core/state.ts`)
```ts
export type StateName =
  | "boot" | "loading" | "error"
  | "menu"      // NEW: main menu (first stop after loading)
  | "howto"     // NEW: how-to-play card, returns to menu
  | "cutscene"  // cold open — now only on first-ever dive of a session
  | "dive"      // sim runs
  | "levelup"   // NEW: sim FROZEN, 1-of-3 upgrade overlay
  | "pause"     // NEW: sim FROZEN, pause menu (Esc)
  | "gameover"; // run summary, stays until discrete keypress
```
No change to the `StateMachine` class itself — it already rejects unknown states and
gives every state an explicit exit. Only the union and the `main.ts` definitions grow.

### Flow
```
loading → menu ──Dive──▶ cutscene(first only) → dive
menu ──How to play──▶ howto ──back──▶ menu
dive ──Esc──▶ pause ──Resume──▶ dive · ──Quit──▶ menu
dive ──XP threshold──▶ levelup ──pick──▶ dive   (queue drains before resuming)
dive ──hp≤0──▶ gameover ──keypress──▶ menu   (banks run, returns to menu)
```

### How freezing works (no engine change)
`dive` state calls `dive.update(dt, input)`. `levelup` and `pause` states simply **do
not call `dive.update`** — Pixi keeps the last rendered frame on screen, so the world
freezes with zero extra machinery. The overlay is drawn on `engine.uiRoot` above it.
On resume, `main.ts` resumes calling `dive.update`; `DiveScene` zeroes its `acc`
accumulator on unpause (add `dive.resume()` that sets `this.acc = 0`) so no
catch-up burst of sim steps fires after a long pause.

**Integration points (`main.ts`):** add `.define("menu"|"howto"|"levelup"|"pause"|"gameover", …)`.
The `dive` state's `update` gains: `if (dive!.consumeLevelUp()) fsm.change("levelup")`
and `if (input.consumePausePress()) fsm.change("pause")`.

### Acceptance
- Every new state has an `enter`/`exit` that adds/removes exactly its overlay; no
  overlay leaks across transitions (verify by state-cycling menu→dive→pause→menu).
- Freezing a dive stops all motion (bullets, enemies, depth) yet the frame stays
  visible; resuming produces no time-skip / no multi-step catch-up.
- `gameover` returns to `menu` (not straight into a new dive), matching a real shell.

---

## 2. SCORE / POINTS SYSTEM

### Data shape (`src/game/progression.ts`)
```ts
export interface ScoreState {
  score: number;         // run score (integer)
  combo: number;         // consecutive kills without taking a hit
  comboTimer: number;    // sec remaining before combo decays a step
  multiplier: number;    // derived: 1 + floor(combo/5)*0.5, capped MULT_CAP
  noHitTimer: number;    // sec since last hit (drives survival bonus)
  depthScored: number;   // last depth milestone already awarded
}
export const MULT_CAP = 4;          // 1× … 4×
export const COMBO_WINDOW = 5;      // sec; a kill refreshes it
```

### What grants points (all routed through `addScore(run, kind, ...)`)
| Source | Base points | Notes |
|---|---|---|
| Enemy kill | `100` (elite `400`) | ×`multiplier` |
| Sample orb pickup | `15` each | not multiplied |
| Destructible broken (crate/crystal) | `crystal 250 / crate 80` | ×`multiplier` |
| Depth milestone | `+50` every `25 m` crossed | via `depthScored` |
| Hidden relic found | `+500` | flat, always |
| No-hit survival tick | `+250` every `20 s` with no hit | resets on hit |

### Combo / multiplier formula
```ts
// on kill:
run.score.combo += 1;
run.score.comboTimer = COMBO_WINDOW;
run.score.multiplier = Math.min(MULT_CAP, 1 + Math.floor(run.score.combo / 5) * 0.5);
// each sim step:
run.score.comboTimer -= dt;
if (run.score.comboTimer <= 0 && run.score.combo > 0) {           // decay one step
  run.score.combo = Math.max(0, run.score.combo - 1);
  run.score.comboTimer = COMBO_WINDOW;
  recomputeMultiplier(run);
}
// on player hit: combo = 0; multiplier = 1;  (a hit BREAKS the chain — real stake)
```

### Persistence (`src/game/persistence.ts`)
Add `bestScore: number` to `SaveData` (coerced like the others). `recordDive`
signature grows a `score` param: `recordDive(data, depthReached, score, bankedSamples, seen)`
and sets `bestScore: Math.max(data.bestScore, score)`. Capture `prevBestScore`
BEFORE `recordDive` (same pattern as the existing `prevBest` depth fix) so the
game-over "NEW HIGH SCORE" banner compares correctly.

### HUD display (§5)
Score top-center (large), combo pill under it showing `combo ×multiplier` and a
draining bar for `comboTimer`; only visible while `combo > 0`.

### Integration points
- `dive.ts` `onEnemyKilled` → `addScore("kill", elite)`, refresh combo.
- `dive.ts` `onPlayerHit` → break combo.
- `dive.ts` `step` → depth-milestone + no-hit-survival ticks.
- `interactables`/`pickups` callbacks → `addScore(...)`.
- `main.ts` `onGameOver` passes `run.score.score` into `recordDive`.

### Acceptance
- Killing 5 enemies without a hit shows `×1.5`, 10 shows `×2`; taking one hit drops to `×1`.
- Score is monotonic within a run and persists as `bestScore` across reloads.
- Depth milestone fires exactly once per 25 m (no double-award on frame boundaries).

---

## 3. IN-RUN XP + LEVEL-UPS (the roguelite spine, Part 5 §10)

### Data shape (`src/game/progression.ts`)
```ts
export interface XpState {
  level: number;         // starts 1
  xp: number;            // toward next level
  xpToNext: number;      // xpForLevel(level)
  pendingLevelUps: number; // queued picks not yet chosen
}
// Curve: gentle early, steepens. Level 1→2 = 60, 2→3 = 95, 3→4 = 135 …
export function xpForLevel(level: number): number {
  return Math.round(40 + 25 * level + 4 * level * level);
}
```

### XP sources (routed through `addXp(run, amount)`)
| Source | XP |
|---|---|
| Enemy kill | `12` (elite `45`) |
| Sample orb | `4` |
| Destructible broken | `crate 10 / crystal 30` |
| Scan (research probe) | `8` per fauna catalogued |
| Hidden relic | **guaranteed level-up** (see §4) |

`addXp` loops: while `xp >= xpToNext`, subtract, `level++`, recompute `xpToNext`,
`pendingLevelUps++`. Multiple level-ups from one big grant queue up and are drained
one overlay at a time.

### Level-up → 1-of-3 pick (pause overlay)
- `DiveScene.consumeLevelUp(): boolean` returns `pendingLevelUps > 0` (does NOT
  decrement — decrement happens when a pick is applied, so the queue drains fully).
- On entering `levelup`, `main.ts` calls `dive.rollUpgradeChoices()` →
  `UpgradeChoice[3]` and builds `LevelUpOverlay`.
- Player picks via mouse click on a card or keys `1/2/3`. `main.ts` calls
  `dive.applyUpgrade(id)` which mutates `PlayerStats`, decrements `pendingLevelUps`,
  and re-derives the weapon. If `pendingLevelUps > 0` still, re-roll and stay in
  `levelup`; else `fsm.change("dive")`.

### PlayerStats + weapon derivation
```ts
export interface PlayerStats {
  damageMult: number;      // 1.0
  fireRateMult: number;    // 1.0  (lowers cooldown)
  extraProjectiles: number;// 0    (multishot)
  spreadPerShot: number;   // radians added per extra projectile (default 0.14)
  bulletRadiusMult: number;// 1.0
  projSpeedMult: number;   // 1.0
  ttlMult: number;         // 1.0  (range)
  pierce: number;          // 0    (extra enemies a bullet passes through)
  lifestealFrac: number;   // 0.0  (fraction of damage dealt returned as HP)
  moveSpeedMult: number;   // 1.0
  dashCooldownMult: number;// 1.0
  magnetRadius: number;    // 40   (base pickup pull radius)
  enemyBulletSlow: number; // 0.0  (fraction; enemy bullet speed ×(1-this))
  maxHpBonus: number;      // 0
  chargeShot: boolean;     // false
  postDashHaste: number;   // 0.0  (fire-rate bonus for 2s after dash)
}
export function freshStats(): PlayerStats { /* the defaults above */ }

// The player's live weapon = base PLAYER_SHOT cloned then mutated by stats.
export function deriveWeapon(base: EmitterSpec, s: PlayerStats): EmitterSpec {
  const count = 1 + s.extraProjectiles;
  return {
    ...base,
    count,
    spread: s.extraProjectiles > 0 ? s.spreadPerShot * s.extraProjectiles : 0,
    speed: base.speed * s.projSpeedMult,
    bulletRadius: base.bulletRadius * s.bulletRadiusMult,
    ttl: base.ttl * s.ttlMult,
    damage: (base.damage ?? 10) * s.damageMult,
    pierce: s.pierce,          // NEW EmitterSpec/Bullet field, see §7
  };
}
```
`deriveWeapon` is called once on `applyUpgrade` (not per-frame) and the result cached
on the run as `run.weapon`. The fire cooldown moves onto the run:
`run.fireCooldown = BASE_FIRE_COOLDOWN / (stats.fireRateMult * postDashHasteFactor)`.
`dive.ts` fires `run.weapon` instead of the module const `PLAYER_SHOT`, and uses
`run.fireCooldown` instead of the `FIRE_COOLDOWN` const.

### How picks stack & apply (`applyUpgrade`)
Each upgrade is `{ id, apply(stats): void }`. Additive/multiplicative stacking is
per-field (e.g. `+damage` does `stats.damageMult += 0.25`; `+1 projectile` does
`stats.extraProjectiles += 1`). Stacking is unbounded but the roll can cap how often
a rare appears (weights). After `apply`, re-derive weapon and, for HP upgrades,
also `player.maxHp += 25; player.hp += 25`.

### Integration points
- `dive.ts` constructor: `this.run = freshRun()`; `this.run.weapon = deriveWeapon(PLAYER_SHOT, this.run.stats)`.
- `dive.ts` `step`: firing uses `this.run.weapon` + `this.run.fireCooldown`; movement passes `stats.moveSpeedMult` into `updatePlayerMovement` (add a `speedMult` param, default 1).
- `main.ts` `levelup` state (build/resolve overlay).

### Acceptance
- A level-up freezes the dive, shows 3 distinct cards; picking one visibly changes
  behavior next shot (e.g. "+1 projectile" fires two bullets).
- Two level-ups earned at once show two consecutive picks before the dive resumes.
- Picks persist for the rest of the run and reset on a new dive.

---

## UPGRADE CATALOG (`src/content/upgrades.ts`)

`weight` biases the 3-card roll (lower = rarer). `rollChoices` samples 3 distinct
ids weighted by `weight`, excluding any at a per-run stack cap (`maxStacks`).

| # | id | Name | Effect (`apply`) | weight | maxStacks |
|---|----|------|------------------|:---:|:---:|
| 1 | `dmg` | Pressure Rounds | `damageMult += 0.25` | 10 | 6 |
| 2 | `firerate` | Rapid Cycler | `fireRateMult += 0.18` | 10 | 6 |
| 3 | `multishot` | Split Beam | `extraProjectiles += 1` | 5 | 4 |
| 4 | `maxhp` | Reinforced Hull | `maxHpBonus += 25` (+heal 25) | 8 | 6 |
| 5 | `movespeed` | Thruster Tune | `moveSpeedMult += 0.12` | 8 | 5 |
| 6 | `dashcd` | Kinetic Vents | `dashCooldownMult *= 0.82` | 7 | 4 |
| 7 | `bulletsize` | Focusing Lens | `bulletRadiusMult += 0.28` | 7 | 4 |
| 8 | `magnet` | Sample Magnet | `magnetRadius += 55` | 8 | 4 |
| 9 | `pierce` | Piercing Slug | `pierce += 1` | 4 | 3 |
| 10 | `lifesteal` | Biolum Leech | `lifestealFrac += 0.04` | 3 | 3 |
| 11 | `slow` | Predator's Calm | `enemyBulletSlow = min(0.30, +0.08)` | 4 | 3 |
| 12 | `range` | Long Barrel | `projSpeedMult += 0.20; ttlMult += 0.15` | 7 | 4 |
| 13 | `charge` | Overcharge Core | `chargeShot = true` (unlocks §6 charge) | 3 | 1 |
| 14 | `haste` | Adrenal Surge | `postDashHaste += 0.40` | 5 | 3 |

Each card shows Name, a one-line effect, current stack count, and a cool-palette
icon (reuse `boost`/`charge_flash`/`scan_ring`/`pickup_sparkle` sprites tinted per
category: offense=amber, defense=mint, utility=aqua). Colorblind-safe: icon shape +
text, never color alone.

---

## 4. HIDDEN OBJECTS → LEVEL-UPS + DIFFICULTY SCALING

### Hidden relics
A relic is an `Interactable` of kind `"relic"` placed by worldgen, **not drawn** until
discovered (or drawn as a subtle `fish_skeleton`/`debris_rocks` "suspicious spot").
```ts
export interface RelicState { revealed: boolean; claimed: boolean; }
```
**Discovery paths (any one works):**
1. **Shoot a suspicious spot** — worldgen places ~3 faint props (`fish_skeleton`,
   small `debris_rocks`) that have a hidden collider; a player bullet hitting one
   plays `scan_ring` + reveals the relic beneath.
2. **Scan** — activating a `research_probe` (§3 scan) or the future companion pings
   the nearest hidden relic, adding a HUD marker (reuse the off-screen threat-arrow
   renderer, tinted mint).
3. **Edge exploration** — 1 relic is always placed near an arena edge (`> bounds*0.85`),
   rewarding players who leave the center.

**Claiming** (touch the revealed relic): emits a `codex_flash`, grants **a guaranteed
level-up** (`addXp` enough to cross `xpToNext`, i.e. `run.xp = run.xpToNext`) OR, at
20% weight, a directly-granted **rare upgrade** (`applyUpgrade` of a random
`weight<=4` id, skipping the pick). Plus `+500` score. One relic per arena guaranteed,
a second at 40% chance scaled by depth.

### Difficulty + reward scaling
One scalar drives everything, extending the existing `tier = depth/100`:
```ts
export function depthTier(depth: number, level: number): number {
  return depth / 100 + level * 0.35;   // depth AND build power push difficulty
}
```
Applied in `dive.ts` spawn logic and in `makeSpitter` (parameterize its stats):
| Knob | Formula |
|---|---|
| max alive enemies | `min(6, 2 + floor(tier))` |
| spawn interval | `max(1.2, 3.2 - tier*0.28)` s |
| enemy HP | `round(60 * (1 + tier*0.18))` |
| enemy move speed | `78 * (1 + tier*0.06)` (cap ×1.5) |
| radial bullet count | `14 + floor(tier)` (cap 22) |
| elite chance per spawn | `min(0.35, tier*0.06)` |

**Elite Spitter** (`makeSpitter(pos, {elite:true})`): radius ×1.4, HP ×3, +1 attack
in the cycle (radial→aimed→radial-fast), bigger warm glow, drops **2 sample orbs +
an xp orb + 25% upgrade orb**, worth `400` score / `45` xp. New `ELITE_RADIAL`
spec in `emitters.ts` (denser, telegraphed). Reward scales so deeper = richer,
matching Pillar 3 (always surface with something).

### Integration points
- `biome_twilight.ts`: emit `arena.interactables` (incl. relics + suspicious spots).
- `dive.ts`: hold `interactables`, tie discovery to bullet/touch collisions, scale
  spawns via `depthTier(this.depth, this.run.level)`.
- `spitter.ts`: `makeSpitter(pos, opts?)` + stat params; `updateSpitter` reads
  per-enemy `bulletCount`.

### Acceptance
- Every arena contains ≥1 discoverable relic; claiming it grants a level-up pick.
- At level 6 / 300 m the same arena spawns visibly more + tankier enemies and can
  spawn an elite, and elites drop richer loot than basics.

---

## 5. UI/UX + NAVIGATION OVERHAUL (fully responsive)

### Shared responsive base (`src/ui/overlay.ts`) — fixes the resize bug
```ts
export interface Overlay {
  root: Container;
  layout(w: number, h: number): void;  // reposition/redraw to CURRENT size
  update?(dt: number, input: Input): void;
  destroy(): void;
}
```
**Root cause of the known bug:** overlays (`buildGameOver`, panel `Graphics`) are
built ONCE with the width/height at creation and never re-laid-out, so enlarging the
window leaves the panel mis-centered/mis-sized. **Fix:** every overlay is a class that
draws relative to `layout(w,h)` — panels are redrawn (`graphics.clear()` then re-rect)
and text re-centered on each `layout`. `main.ts` keeps `let activeOverlay: Overlay | null`
and the single `resize` handler calls `engine.refreshOverlays(); hud.layout(w,h);
activeOverlay?.layout(w,h);`. No overlay stores absolute pixel geometry at
construction time.

### Main menu (`src/ui/menu.ts`)
Title "FATHOM" + tagline, a vertical button list: **Dive** / **How to play** /
**Settings** / (shows `BEST  ####m  ·  HIGH SCORE  #####`). Buttons are
`Container`s with hover tint + click; also keyboard (Up/Down + Enter). Settings is an
inline sub-panel with two toggles: **Reduced motion** and **Screen shake** (persist
both in `SaveData.settings`). Selecting Dive → `menu` exit → (cutscene first session,
else straight to `dive`).

### Pause menu (`src/ui/pause.ts`) — Esc
Dim scrim + panel: **Resume** / **Restart dive** / **Settings** / **Quit to menu**.
Esc also resumes. Because sim is frozen by not calling `dive.update`, no timing hazard.

### Game-over (`src/ui/gameover.ts`) — stays until a DISCRETE keypress
Run summary panel: DEPTH, SCORE (+ "NEW HIGH SCORE" / "NEW DEEPEST DIVE" banners),
samples lost, kills, level reached, relics found. "press any key to return".
**Fix for instant auto-dismiss:** the current code accepts `input.consumeAnyKey() ||
input.state.firing` — a held fire button from the dive dismisses it in frame 1. New
input latch:
```ts
// input.ts
startPressGate(): void { this.gateArmed = false; this.down.clear(); this.mouseDown = false; }
// gateArmed flips true only on a fresh keydown/mousedown AFTER startPressGate
consumeGatedPress(): boolean { const v = this.gateArmed; this.gateArmed = false; return v; }
```
On `gameover.enter`: `input.startPressGate()` (clears held state) — so a button still
physically held does not count; only a NEW press after entry dismisses. Same latch is
reused by the level-up overlay's key handling.

### HUD additions (`src/ui/hud.ts`, responsive)
Reorganized, all positioned from `layout(w,h)`:
- **Top-center:** SCORE (big) + combo pill (`combo ×mult` + comboTimer bar), hidden when combo 0.
- **Top-right:** DEPTH / BEST (existing).
- **Bottom-left:** HP bar (moved down), **XP bar** beneath it with **LV n** label; XP
  bar fills `xp/xpToNext`, mint fill on navy track.
- **Bottom-center:** dash cooldown pip (dims while on cooldown, brightens ready).
- **Top-left:** samples `◈ n` (existing), first-run control hint (fades after 8 s).
`hud.update(run, best, w, h)` takes the whole `RunState` now instead of scalars.

### Level-up overlay (`src/ui/levelup.ts`)
Dim scrim + "LEVEL n" + 3 upgrade cards laid out with `layout(w,h)` (cards centered,
gap = `min(24, w*0.02)`, card width clamps to `[180, w*0.26]`). Click or 1/2/3.

### Acceptance
- Resizing the window at any overlay (menu/pause/levelup/gameover) keeps the panel
  centered and correctly sized — no mis-sized stats box (the reported bug).
- Game-over never auto-dismisses while fire is held; only a fresh press advances it.
- Every menu is navigable by mouse AND keyboard; settings toggles persist across reload.

---

## 6. PLAYER-FEEL: DASH/BOOST (+ optional charge shot)

### Dash (`src/systems/dash.ts`)
```ts
export interface DashState { cooldown: number; iframes: number; active: number; }
export const DASH_SPEED = 620;    // px/s impulse
export const DASH_TIME = 0.16;    // sec of boosted travel
export const DASH_IFRAMES = 0.28; // sec invulnerable
export const DASH_COOLDOWN = 1.15;// sec base (× stats.dashCooldownMult)

export function tryDash(player: Player, dash: DashState, dir: Vec2,
                        stats: PlayerStats): boolean {
  if (dash.cooldown > 0) return false;
  const len = Math.hypot(dir.x, dir.y) || 1;             // dir = current move intent
  player.vel.x += (dir.x/len) * DASH_SPEED;
  player.vel.y += (dir.y/len) * DASH_SPEED;
  dash.active = DASH_TIME;
  dash.iframes = DASH_IFRAMES;
  player.invuln = Math.max(player.invuln, DASH_IFRAMES);  // reuse existing i-frames
  dash.cooldown = DASH_COOLDOWN * stats.dashCooldownMult;
  return true;
}
```
- **Bind:** `Shift` or `RMB` (add to `input.ts` as `dash`, edge-triggered via a
  `consumeDash()` so a held key = one dash). Dashes in the **move-intent** direction
  (or aim direction if standing still).
- **VFX:** on dash spawn `boost` anim at player + `wake_bubbles` trailing (both exist
  in the atlas). Reduced-motion still allows dash (it's mechanical), just no shake.
- **Post-dash haste** (`stats.postDashHaste`): sets a 2 s window where
  `fireRateMult` is boosted (Adrenal Surge upgrade).
- Cooldown pip on HUD (§5).

### Charge shot (optional, gated behind `Overcharge Core` upgrade)
Keeps default controls legible by being **opt-in**: with `stats.chargeShot`, holding
fire ≥ `0.5 s` then releasing fires one big bullet (`bulletRadius ×2.2`, `damage ×3`,
`speed ×0.8`) with a `charge_flash` tell. Without the upgrade, fire behaves exactly as
today. Implement as a `chargeTimer` on the run; on release if charged, fire a derived
`CHARGE_SHOT` spec instead of the normal burst.

### Integration points
- `types.ts`: no Player change needed (reuse `invuln`); add `DashState` held in `dive.ts`.
- `dive.ts` `step`: `if (input.consumeDash()) tryDash(...)`; tick `dash.cooldown`,
  `dash.active`; spawn boost/wake VFX; feed post-dash haste into `run.fireCooldown`.

### Acceptance
- Dash gives a snappy burst + i-frames (can pass through a bullet wall unharmed
  during the window) and respects its cooldown; the HUD pip reflects readiness.
- With Overcharge Core, held-fire charges and releases a visibly bigger shot;
  without it, firing is unchanged (controls stay legible).

---

## 7. PROJECTILE CHANGES (pierce + enemy-slow)

Minimal, additive edits to `projectiles.ts` / `types.ts`:
```ts
// EmitterSpec: add  pierce?: number;
// Bullet: add  pierce: number;  lastHit: Enemy | null;
```
- On spawn: `b.pierce = spec.pierce ?? 0; b.lastHit = null;`
- On player-bullet vs enemy hit: apply damage; if `b.lastHit === e` skip (prevents
  same-enemy multi-hit while overlapping); set `b.lastHit = e`; if `b.pierce > 0`
  `b.pierce--` and DON'T kill; else kill. Report lifesteal via the `HitSink`
  (`onEnemyHit` already carries damage → `dive.ts` heals `player.hp += dmg *
  stats.lifestealFrac`, clamped to maxHp).
- **Enemy-bullet slow:** apply `stats.enemyBulletSlow` at spawn time for enemy
  bullets by scaling `spec.speed` in `fireBurst` when `faction === "enemy"` — pass the
  factor down from `dive.ts` (simplest: `proj.enemySlow = stats.enemyBulletSlow` field
  read in `spawn`). Keeps collision math untouched.

### Acceptance
- A piercing bullet damages 2+ lined-up enemies in one shot without double-hitting one.
- Predator's Calm visibly slows incoming coral bullets; player bullets unaffected.

---

## WHAT TO CUT FOR DECLUTTER ("purposeful density")

The owner's complaint is visual noise with no interaction. Rule: **every on-screen
object is either (a) telegraphed danger, (b) functional/interactive, or (c) a thin
ambient layer capped low.** Concretely, in `biome_twilight.ts`:

| Current scatter | Action |
|---|---|
| `structSprites` **×22** (rocks, debris, dead creature) | **CUT to ~10.** Pure decoration; halve it. Convert ~4 into destructible `salvage_crate`/`mineral_crystal` interactables. |
| `glowSprites` (plankton) **×16** | **CUT to ~8.** Ambient only; keep as thin atmosphere, no more. |
| `glowAnims` (jelly/glow_orb/research_probe) **×10** | **Keep ~6, but make `research_probe` FUNCTIONAL** (scan interactable, §3/§4) instead of decoration. `jelly_colony` → optional `egg_cluster` hazard-hatcher. |
| current ribbons | keep (they teach flow) — unchanged. |

**Net:** fewer inert props, and the survivors either fight you, reward you, or teach a
mechanic. Add ~6–9 interactables (loot pods, crates, crystal, probe, vents, relics)
that REPLACE cut decoration — density stays similar but *meaning* per object goes way up.

### Functional object spec (`src/systems/interactables.ts` + `interactable_defs.ts`)
```ts
export type InteractableKind =
  | "loot_pod" | "salvage_crate" | "egg_cluster" | "mineral_crystal"
  | "research_probe" | "bubble_vent" | "gas_pocket" | "relic";

export interface Interactable {
  kind: InteractableKind;
  pos: Vec2; radius: number;
  hp: number;                 // >0 = destructible; 0 = touch/hazard only
  state: "idle" | "active" | "opening" | "spent";
  timer: number;              // periodic vents / opening anim
  reward?: RewardTable;       // rolled on break/open
  hidden?: boolean;           // relics / suspicious spots
  view: Container; glow?: Sprite;
}
export interface RewardTable {
  samples: number; xp: number;
  upgradeChance: number;      // 0..1 → spawn an upgrade orb
  hatch?: { kind: "spitter"; count: number; chance: number };
}
```
| Kind | Trigger | Behavior | Sprites (exist) |
|---|---|---|---|
| `loot_pod` | shoot OR touch | `closed`→`wake`→`open`, drops samples+xp, 15% upgrade orb | `loot_pod_closed/wake/open/empty` |
| `salvage_crate` | shoot (hp 30) | break → loot; 20% hatch 1 spitter | `salvage_crate` |
| `egg_cluster` | shoot/touch | hatch 2–3 weak fauna OR loot (50/50) | `egg_cluster` (anim) |
| `mineral_crystal` | shoot (hp 90) | break → **big** sample payout + xp | `mineral_crystal` |
| `research_probe` | touch/dwell 0.8s | emit `scan_ring`, catalog on-screen fauna → codex + score + xp; pings nearest relic | `research_probe`, `scan_ring` |
| `bubble_vent` | passive | periodic upward push (transient current) + light contact tick | `bubble_vent` (anim), `gas_pocket` |
| `gas_pocket` | shoot | explodes → AoE damage to nearby enemies | `gas_pocket` |
| `relic` | reveal→touch | guaranteed level-up / rare upgrade + 500 score (§4) | `codex_flash`, `pickup_sparkle` |

Collision: player bullets test against destructible interactables in
`proj.update` (extend the enemy loop OR run a second pass in `dive.ts`); touch tests
against player in `dive.ts step`. Rewards spawn via the generalized `pickups` system.

### Generalized pickups (`src/systems/pickups.ts`)
Refactor the inline HP-orb code. `PickupKind = "hp" | "sample" | "xp" | "upgrade"`.
Magnet: within `stats.magnetRadius`, orbs steer toward the player (lerp velocity);
within grab radius they're collected → route to `addScore`/`addXp`/heal/queue-upgrade.
Sample orbs use mint `COLOR.sample`, hp `COLOR.hpFull`, xp `COLOR.aqua`, upgrade
`COLOR.amberBright` — consistent with the danger/you color language.

### Acceptance
- Shooting a loot pod opens it and drops collectible orbs that magnetize to the player.
- A crystal takes several hits then bursts into a big mint payout (+score +xp).
- No arena renders more inert decoration than the capped counts above.

---

## RECOMMENDED BUILD ORDER (for the parent)

Dependency-ordered; **[P]** = parallelizable with its group.

1. **Foundation — `progression.ts` + types + persistence.** `RunState`, `PlayerStats`,
   score/combo/xp math, `deriveWeapon`, `UPGRADES`, `applyUpgrade`, `rollChoices`;
   add `bestScore`/`settings` to `SaveData`; add `pierce`/`lastHit` to `Bullet`,
   `pierce` to `EmitterSpec`. *No behavior change yet — pure data + functions + unit-testable.*
2. **Wire scoring + XP into `DiveScene`.** Own `RunState`; route `onEnemyKilled`/
   `onPlayerHit`/depth/pickup through score+xp; fire `run.weapon`/`run.fireCooldown`;
   expose `consumeLevelUp`/`rollUpgradeChoices`/`applyUpgrade`. HUD still old.
3. **State-machine + overlay shell** **[P with 4]** — `state.ts` new states, `overlay.ts`
   base, `menu.ts`/`pause.ts`/`gameover.ts`/`levelup.ts`, `main.ts` rewiring, input
   press-gate + resize relayout. *Fixes the game-over auto-dismiss + responsive bug.*
4. **HUD overhaul** **[P with 3]** — score/combo/xp bar/level/dash pip, all responsive
   from `layout(w,h)`; `hud.update(run, best, w, h)`.
5. **Dash + projectile pierce/slew** — `dash.ts`, input dash key, VFX, pierce/lifesteal/
   enemy-slow in `projectiles.ts`. (Charge shot last, behind the upgrade.)
6. **Pickups refactor** — `pickups.ts` with magnet + typed orbs (unblocks interactable rewards).
7. **Interactables + worldgen declutter** — `interactables.ts`, `interactable_defs.ts`,
   `biome_twilight.ts` cut scatter + place functional objects; collisions in dive.
8. **Hidden relics + scaling** — relic discovery paths, `depthTier`, elite spitter,
   `makeSpitter(pos, opts)` stat params.
9. **Content pass + tuning** — upgrade balance, spawn/reward curves, first-run teaching
   hints; QA the full loop menu→dive→levelup→pause→gameover→menu.

**Critical path:** 1 → 2 → (5,6) → 7 → 8. UI (3,4) parallels the gameplay spine.

---

## GLOBAL ACCEPTANCE (the owner's complaint, closed)
- There is a **reason to engage every object**: pods/crates/crystals drop loot, probes
  scan for codex+points, relics grant level-ups, vents push/hurt — nothing is pure decoration.
- There is **scoring + progression**: live score/combo, an XP bar that leads to
  meaningful 1-of-3 upgrade picks that change how the run plays.
- There is **navigation**: main menu, pause, and a run-summary that waits for the player.
- The screen is **less cluttered, not more** — decoration capped, meaning per object up.
- All overlays are **responsive** to `engine.width/height` on resize; the game-over
  screen no longer auto-dismisses on held fire.
```
