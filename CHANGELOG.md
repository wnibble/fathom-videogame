# FATHOM — Changelog

Every PROMOTE appends what/why + rubric scores (Design Bible Part 6.5).
Rubric dims: 1 Correctness · 2 Readability/feel · 3 Aesthetic cohesion ·
4 Performance · 5 Robustness · 6 Integration. BAR = 4; any dim < 3 = blocker.

## Pass 1 — Twilight Drift vertical slice (2026-07-12)

The recursive build's first full descent: a runnable, readable, permadeath dive
through one stratum, using the player's real extracted art for bullets/telegraphs/
props. Stack: PixiJS v8 + Vite + TypeScript; local-save-first; assets extracted on
pass 1. Vertical-slice order per Bible Part 7.

### Promoted

- **Asset-extraction pipeline** (`tools/extract-assets.mjs`) — dual-mode background
  removal (alpha-passthrough for transparent sheets, 8-connectivity flood-fill for
  baked light/dark checker), light-fringe decontamination, animation union-bounds
  alignment, nearest-neighbor downscale to logical sizes. 82 sprites + 23 animations
  from 6 source sheets → `public/assets/sprites/atlas.json`. *Rubric: correctness 5,
  aesthetic 5. Verified via contact sheet.*
- **Core/State machine** (`src/core/state.ts`) — boot→loading→cutscene→dive→gameover,
  every state has an explicit exit, unknown transitions rejected. *Correctness 4,
  robustness 4.*
- **Renderer** (`src/engine/app.ts`, `glow.ts`) — integer ×3 nearest scaling,
  roundPixels, a dark world layer + separate additive **bloomed light layer**, deep
  vignette. Calibrated bloom (threshold 0.5 / scale 0.7) after a readability blocker.
  *Readability 4, aesthetic 4.*
- **Input** (`src/engine/input.ts`) — keyboard + mouse twin-stick, blur-safe.
- **Movement** (`src/systems/movement.ts`) — drift + momentum + drag; currents as
  steady force fields (intentional, not random).
- **Projectiles** (`src/systems/projectiles.ts`) — one pooled, data-driven emitter
  (`EmitterSpec`) shared by player + enemies; warm=danger / cool=you color language;
  direct circle-circle collision; 1200-bullet pool, no mid-frame allocation.
- **Enemy — Spitter** (`src/systems/spitter.ts`) — range-keeping + strafe + a strict
  telegraph→fire cycle (always winds up before shooting). Deterministic (no sim RNG).
- **Worldgen — Twilight Drift** (`src/content/biome_twilight.ts`) — seeded arena of
  real props + currents + edge spawns; clear start; always traversable.
- **HUD** (`src/ui/hud.ts`), **Loading** (`src/ui/loading.ts`, themed depth-gauge +
  codex tips), **Cutscene** (`src/systems/cutscene.ts` + cold-open "The Descent",
  skippable), **Persistence** (`src/game/persistence.ts`, local best-depth/samples).
- **Dive controller** (`src/game/dive.ts`) — fixed-60Hz sim, telegraphed combat,
  juice (hit-pop, screen shake, impact + sample-burst VFX), rising depth, permadeath
  → bank → dive again.

### QA (headless, WebGL/SwiftShader)

PASS, 0 console/page errors. Reached dive through the cold open; up to 2 Spitters +
~23 bullets active; player collision damage confirmed; depth rises. One blocker found
and fixed in-loop (see below). *Perf note:* headless FPS (~23) is a software-renderer
artifact — real-GPU frame budget is UNVERIFIED and belongs to the human playtest.

### Refined this pass

- **[blocker → fixed] Readability:** current-ribbon bands were stretched into the
  bloomed light layer → glowing slabs that washed out bullets (violates Pillar 1).
  Fix: scattered low-alpha ribbon streaks in the world layer (unbloomed) + calmer
  bloom + soft radial-glow texture for lamps/glows instead of flat discs.

### Known gaps → next pass (leaves for the loop)

- Real-GPU 300+-projectile perf capture (human/GPU check).
- Companion (Bichon), codex/scan, surface station meta-hub, sample pickups as banked
  entities, additional strata, audio — all deferred per slice scope.
- Atlas packing into a power-of-two sheet (optimizer task).

## Pass 2 — blind panel + playtest loop (2026-07-12)

Three agents attacked the pass-1 slice: two blind reviewers (game-feel & readability
lens; correctness & robustness lens) and a playtester. All three independently
triangulated on the same core blocker. Fixes applied and re-verified (QA PASS, build
clean, blocker confirmed fixed in captured frames).

### Blockers fixed (non-waivable)

- **[Pillar 1] Spitter fought + telegraphed OFF-SCREEN.** At ZOOM 3 the viewport
  showed only ~427×240 world px, but the Spitter's engagement range was 150–230 —
  so danger arrived with no readable wind-up. Fixes: **ZOOM 3 → 2** (wider bullet-hell
  space, ~640×360), Spitter range → 95–155, attack cycle **gated to ENGAGE=300** (no
  wind-up/fire while off-screen; aborts if the player flees), and **off-screen threat
  arrows** on the HUD edge. Verified: coral telegraph ring + coral bullets now render
  on-screen (see `qa-shots2/04-combat-late`).
- **[Robustness] Asset-load failure soft-locked `loading`.** No `.catch` → `loaded`
  never set → stuck forever. Fix: `.catch` → new **`error` state** with a retry
  (press any key), plus a global `unhandledrejection` guard. Every state now exits.

### Majors fixed

- **Always "NEW DEEPEST DIVE":** record compare ran after `recordDive` bumped best.
  Fix: capture `prevBest` before banking; compare against that.
- **Permadeath had no stakes (Pillar 3):** death banked samples like a surface. Fix:
  **death loses unbanked samples**; game-over shows "◈ N samples lost to the deep."
- **No in-run recovery:** every dive a monotonic countdown. Fix: **HP orbs** drop
  every 3rd kill (+22 HP), pulsing mint pickups.
- **Directionless currents:** static faint ribbon. Fix: **animated streaks scrolling
  along the flow** so push direction is visible.
- **Amber threat/loot color collision:** samples shared enemy amber. Fix: samples →
  cool **mint** (`COLOR.sample`), reserving warm for danger. Spitter glow boosted so
  the threat out-glows ambient fauna.

### Minors fixed

- Re-entrant boot→loading emit (now starts at `loading` directly).
- Orphaned in-flight FX across restart (FX now tracked + destroyed in `destroy()`).
- Persistence trusted parsed shape (now per-field type coercion; no `NaN`/throw).
- Hit-stop (2–3 frame freeze) on hit/kill; **reduced-motion** disables shake + hitstop.
- Fallback coral-ring telegraph if a telegraph asset is ever missing.

## Pass 3 — roguelite depth, progression & UX overhaul (2026-07-12)

Owner feedback: *"a lot going on without really a lot to do"* — props were inert, no
scoring, no progression, no menus; sprites had extraction damage; two UX bugs. The
architect wrote `contracts/pass3-revamp.md`; this pass builds it. QA PASS (headless
WebGL): menu→dive→level-up→pause→game-over all reached, 0 errors, score climbs, resize
responsive.

### Sprites
- **Fixed dark-sprite extraction** — the dark-bg flood-fill ate dark pixels touching
  the crop border on the white prop sheets (`suspended_coral_chunk` etc.). Now the bg
  TYPE is chosen per-crop; fringe cleanup only on light bg. 92 sprites re-extracted.

### New systems (the "reason to engage")
- **`progression.ts`** — run-owned `RunState`: score + combo/multiplier, XP + levels,
  `PlayerStats`, a 14-entry **upgrade catalog**, `deriveWeapon` (upgrades actually
  change your gun), `depthTier` scaling.
- **Score / combo** — kills, samples, destructibles, depth milestones, no-hit survival,
  relics; a hit **breaks your combo**. Persisted `bestScore`.
- **XP → level-up** — earning XP freezes the dive into a **1-of-3 upgrade pick**
  (mouse or 1/2/3); queued picks drain one at a time.
- **Functional interactables** (`interactables.ts`) — loot pods (shoot/touch→loot),
  salvage crates & mineral crystals (destructible→loot), research probes (dwell→scan:
  XP + reveal relics), bubble vents (push), and **hidden relics** near arena edges
  that grant a guaranteed level-up. Decoration cut ~50% ("purposeful density").
- **Magnetized pickups** (`pickups.ts`) — sample/xp/hp/upgrade orbs that pull to you.
- **Dash** (`dash.ts`) — Shift; impulse + i-frames + cooldown, HUD pip, upgrade-tuned.
- **Difficulty + reward scaling** — enemy count/HP/speed/bullet-count scale with depth
  AND build power; **Elite Spitters** (tankier, richer loot) appear deeper.
- **Projectile pierce / lifesteal / enemy-slow** wired to upgrades.

### UI/UX + navigation
- **Main menu** (Dive / How to play / Reduced-motion & Screen-shake toggles + best
  stats), **pause menu** (Esc), **How-to** card, **level-up** picker, and a **game-over
  run-summary** — all new overlays with a responsive `layout(w,h)` base.
- **Fixed: mis-sized overlay on resize** — overlays + HUD now relayout via the
  renderer's own resize event (correct dims), no absolute geometry baked at build time.
- **Fixed: game-over auto-dismissed instantly** — it accepted *held* fire; now a
  discrete press-edge (pressCount baseline) after entry is required.
- HUD overhaul: score/combo top-center, XP bar + level, dash pip, all responsive.

## Pass 4 — depth, variety, audio & the review loop (2026-07-12)

Full re-review of pass 3 by two blind reviewers + the playtester; all findings folded
in + re-verified (QA PASS: menu→dive→level-up→pause, Darters spawn at depth, 0 errors,
score 1050, level-up card legible, affordance rings visible).

### Correctness blockers fixed (correctness reviewer)
- **Exhausted upgrade pool soft-locked the level-up** (`rollChoices`→`[]`→empty card→
  crash). `consumeLevelUp` now drains un-fillable picks into a fallback (+15 max HP,
  +500 score) so the overlay is never opened empty.
- **Dying in the same step as a level-up stranded the player** in a frozen dead dive.
  Guarded: if the dive `ended`/state already changed, the level-up/pause transition is
  skipped; the fixed-step loop also stops once `ended`.

### Content depth (playtester)
- **Enemy #2 — the Darter** (`darter.ts`): doesn't shoot, it LUNGES — stalks, telegraphs
  a wind-up, dashes at you; contact hurts. A "dodge, don't kite" verb; mixes in with
  depth, elite variant, distinct silhouette + tell.
- **Interactable resupply** every 200 m so the loot/explore loop never goes dark.
- **Procedural audio** (`audio.ts`, WebAudio, no asset files) — SFX for shoot/hit/kill/
  dash/pickup/level-up/relic/low-HP + a descent drone; a **SOUND** menu toggle.
- Flatter XP curve past L6 so the upgrade beat keeps arriving deep in a run.

### UX/readability (game-feel reviewer)
- **Interactable affordance rings** (amber=shoot / aqua=touch / mint=relic) so functional
  objects are never confused with decoration — the owner's core complaint.
- **Fixed the invisible upgrade label** (navy-on-navy → teal).
- Threat arrows kept clear of the score; "warm = danger, cool = you" added to the in-game
  hint; an early loot pod in the start clearing.

## Pass 5 — Surface Station meta-progression + refinement (2026-07-12)

Architect designed the meta layer (`contracts/pass5-meta.md`); this pass builds it +
folds owner graphical/UX feedback. QA PASS: menu→**station**→dive→pause, 0 errors, store
renders with tier pips/costs/gating, dive visibly cleaner.

### Meta-progression (the "reason to dive again")
- **Surface Station** hub (`src/ui/station.ts`, new `station` state): banked pearls, a
  10-upgrade permanent store, badge grid, LAUNCH DIVE. Loop is now menu→station→dive→
  gameover→station→dive.
- **Pearl banking** — surfacing banks samples as permanent **pearls**: **40% on death,
  100% if you survive-and-surface** (owner's ask; the surface path is wired, the in-dive
  ascend trigger is a P0 feature TODO). `bankDive` is the single meta write + badge point.
- **Permanent upgrade store** (`meta_upgrades.ts`) — 10 upgrades that seed each fresh run
  (+base HP/damage/fire-rate/speed, shield unlock+capacity, regen, magnet, dash CD, extra
  starting pick, better bank ratio); rising cost curve, tier pips, `requires` gating.
- **Shield** (`shield.ts`) — a regenerating buffer absorbed before HP; a fully-absorbed
  hit keeps your combo. Unlocked by meta + in-run Aegis Cell/Flow upgrades.
- **Scaling HUD bars** — the HP bar visibly widens with max HP; a **shield bar** appears
  above it when unlocked (capacity ticks); a compact **build readout** lists owned
  upgrades. All responsive.
- **13 badges** (`badges.ts`) — depth/kills/relics/score/dives/maxed-build milestones,
  evaluated at bank time, shown in the station, toasted on the game-over that earns them.
- **UI-appeal pass** — shared `panel()/label()/chip()` helpers (drop shadow, top accent,
  faux gradient); game-over shows pearls banked + new badges.

### Graphical / UX fixes (owner feedback)
- **Fixed `bubble_vent`** (stray extraction artifact) → clean procedural animated vent.
- **Culled orb-like decoration** (`glow_orb`, ring/cluster plankton) that read as pickups.
- **Reduced over-glow** — smaller/dimmer player headlamp + calmer bloom.
- **Fixed HOW TO PLAY** closing instantly (the opening click's edge self-dismissed it) —
  added `input.clearEdges()` on screen entry (also fixes pause insta-resume).
- **Game-over now requires pressing C** (no accidental dismiss) and returns to the station.
- Fixed the dark-sprite extraction (per-crop bg-type) — committed separately (`cf6785d`).

### Roadmaps added
- `docs/GRAPHICS-TODO.md` (animated actors, impact-edge softening, per-stratum palettes…)
- `docs/FEATURES-TODO.md` (P0: **strata transitions / real depth**, voluntary surface,
  more enemies, companion, codex…).

## Pass 6 Phase 1 — the "glow double-bind" + real depth (2026-07-12)

An 11-agent research→synthesis→review workflow mined adjacent genres (bullet-hell
roguelites, dive/exploration, descent games, narrative roguelites) into a new-feel
design (`contracts/pass6-expansion.md`). Phase 1 builds the core. QA PASS: reached a
NEW stratum (Kelp Forest), 0 errors.

**New identity — the glow double-bind:** your light is your weapon, your treasure, and
the beacon the deep hunts you by.

- **Hazards** (`systems/hazards.ts`) — pooled persistent damage zones (foundation).
- **Descent Column** (`content/strata.ts`) — **6 authored strata** (Twilight Drift → Kelp
  Forest → The Wreck → Thermal Vents → Abyssal Plain → The Cradle), each a distinct place
  (palette + props + fauna + resource). `dive.transitionStratum()` tears down + rebuilds
  the world (reusing the destroy() teardown), keeps run+player, shows a threshold card.
  Bigger arena (1900×1500). **Depth is now a place, not a number.**
- **Glow-charge / graze** — grazing enemy bullets (near-miss) charges your core; a full
  core fires a bullet-clearing **bio-pulse** that also damages nearby enemies. Dodging
  becomes agency (glow-as-weapon). `projectiles.onGraze` + `popRadius`.
- **Dread clock** — brightness (charge) + time-in-stratum raise dread → the screen edges
  darken; at max the deep spawns a telegraphed hazard bloom; **descending resets it**
  (glow-as-beacon).
- **Ascend vent + haul trail** — a touch-to-surface vent banks **100%** of your haul (vs
  40% on death); unbanked samples glow as a **trail** behind the diver (glow-as-treasure).
- **Drifter enemy** — a slow area-denier that lays fading spore-mine hazards; a third
  verb (zone control). Fauna is now per-stratum weighted.
- **Story delivery** (`content/species.ts` + `content/story.ts`) — scanning a research
  probe catalogs the stratum's species into the codex; the Surface Station shows a
  throughline-voice bark keyed to your deepest stratum + codex progress, all converging
  on one mystery (what the Apex is, what the Station farms). Advances on death too.
- **Hero landmarks** — each stratum has one oversized, cool, low-alpha beacon that gives
  the place a memorable silhouette. Persistence tracks `deepestStratum` + `codexSeen`.

### Accepted deviations / deferred (documented, not silently skipped)

- **Render interpolation** (contract `core.md`): the slice renders raw fixed-step sim
  positions (no `alpha` interpolation). Fine at 60 Hz; a documented slice deviation,
  revisit for high-refresh displays.
- **Animated pixel-art actors** (diver/Spitter are still Graphics placeholders — not
  in the art pack), **audio**, multi-enemy telegraph legibility, and real-GPU frame
  pacing → next loop / human playtest (see the playtest script handed to the user).
