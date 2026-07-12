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

### Accepted deviations / deferred (documented, not silently skipped)

- **Render interpolation** (contract `core.md`): the slice renders raw fixed-step sim
  positions (no `alpha` interpolation). Fine at 60 Hz; a documented slice deviation,
  revisit for high-refresh displays.
- **Animated pixel-art actors** (diver/Spitter are still Graphics placeholders — not
  in the art pack), **audio**, multi-enemy telegraph legibility, and real-GPU frame
  pacing → next loop / human playtest (see the playtest script handed to the user).
