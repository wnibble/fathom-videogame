# FATHOM — Pass 7: The Living World (ARCHITECT plan)

Grounded in the real code read this pass: `src/game/dive.ts`, `src/engine/app.ts`,
`src/engine/ambient.ts` (MarineSnow), `src/render/actors.ts`, `src/content/strata.ts`,
`src/systems/{movement,interactables,hazards}.ts`, `src/ui/station.ts`, `src/ui/overlays.ts`,
`src/main.ts`, `src/core/state.ts`, `src/game/persistence.ts`, `src/content/story.ts`,
and `docs/GRAPHICS-TODO.md` + `docs/FEATURES-TODO.md` + `CHANGELOG.md`.

> **Scope note.** This plan is deliberately larger than what pass 7 will ship. Phase 1 is
> the world-class-polish slice that is already half-wired in code (glow, currents, transition,
> station UI, marine snow, wisps). Phases 2–5 author the walkable overworld, the companion,
> animated actors, the boss, and the Cradle ending. Everything is buildable on the existing
> array-sim + Graphics/glow render path — **zero new art is required for any Phase-1/2 item.**

---

## 0. VISION — one whole game, two breaths

FATHOM is one held breath and its release. **The descent is the inhale** — you fall through six
authored strata where your bioluminescence is the entire game at once (weapon, build-identity,
treasure, and the beacon the deep hunts you by), and the water itself is a living body: one flow
field swirls the currents, drags the marine snow, bends the kelp, and shoves your haul-trail, so
danger is always legible in the motion around you. **The surface is the exhale** — a warm,
walkable Stardew-cozy deck where you are *allowed* to be bright because nothing here punishes
light: you steer a diver between glowing kiosk-shops, a loyal Bichon bounds to greet you, an
Archivist and a Mechanic keep their small routines, specimen tanks fill as you catalogue the deep,
and the station visibly brightens and grows with every record you set. The two halves define each
other — the deep is beautiful *because* light is precious there, and the surface is a relief
*because* the deep is not. A run is a story told in one arc: read the forecast, kit up on the warm
deck, drop into the dark, claw back to a vent with your glow trailing behind you, and surface to a
world that changed because you came back. That is FATHOM whole: **collect-and-upgrade is the
spine, the glow double-bind is the soul, and a world that reacts is the reason to keep diving.**

---

## 1. THE OWNER'S COMPLAINTS — each mapped to exact code

### (a) The player GLOW is annoying / too strong
**Where it lives.** `render/actors.ts:36` `lamp = glow(126, COLOR.aqua, 0.22)`; driven every frame
in `dive.ts:826-829` — `lamp.alpha = 0.22 + charge*0.32`, `lamp.scale = (126/128)*(1 + charge*0.22)`.
Bloom threshold is `0.62` (`app.ts:80`). The passive headlamp is a large, always-on 126px disc that
floods the frame and competes with bullets.

**Fix — spend the passive floor, buy back punch on action (net calmer, feels *stronger*).**
1. Shrink the resting lamp: `glow(96, COLOR.aqua, 0.14)` in `actors.ts:36`, and in `dive.ts:828`
   drop the resting term to `0.14 + charge*0.30` so a *charged* glow still reads but idle glow recedes.
2. Add a **volume-preserving** breathe so it reads alive without getting brighter: `lamp.scale`
   multiplies by `1 + 0.02*sin(elapsed*1.6)` (area held, not raised).
3. Move the "strength" feeling from the passive disc onto **events** (see §2): muzzle flash on fire,
   a bright bio-pulse anticipation-dip-then-flash, kickback. You *lower* the steady light floor and
   *raise* the transient light — the glow lands instead of glares.
4. Keep the treasure/beacon channels intact: `haulGlow` (`dive.ts:831-837`) and `setDread`
   (`app.ts:142`) are unchanged — only the *headlamp* floor drops.

Success test: at rest, bullets are the brightest warm thing on screen; the player is a dim cool
core that flares only when it acts.

### (b) The world reads FLAT — needs dimension & texture
**Where it lives.** `bgRoot` is a single flat `rect().fill` (`app.ts:117`). `MarineSnow`
(`engine/ambient.ts`) is screen-space, one tint (`0xbcd6ea`), not camera-parallaxed, not
current-advected. The hero `landmark` is added to `worldLayer` and tracks the camera 1:1
(`dive.ts:210-217`) so it reads as a same-plane sticker. Props are static (`buildStaticViews`).

**Fix — build depth in four cheap layers, all in the existing bg/world/light stack.**
1. **Parallax planes.** In `app.ts` add named sub-containers inside `sceneRoot` with a
   `parallaxFactor`: `farLayer` (~0.5), then `worldLayer`/`lightLayer` (1.0), then `nearLayer`
   (~1.35). In `updateCamera` (`app.ts:155-165`) offset each by `cam*(1-factor)`. Move the
   `landmark` (`dive.ts:216`) into `farLayer`; scatter 2–3 big dim silhouette props there too.
2. **Depth-cue tint (Rain World aerial perspective).** In `buildStaticViews`
   (`dive.ts:206-254`) and `actors.ts`, lerp a prop's tint toward `this.arena.bg` by its plane:
   far ~55%, mid ~20%, near 0%. Zero shader — a Pixi `tint`.
3. **Drifting fog.** Generate one soft cloudy greyscale canvas texture at load; add TWO tiled
   sprites to `bgRoot` (`app.ts:114-118`) at alpha ~0.06, tinted to `bgTint`, scrolling opposite
   directions at ~4 and ~7 px/s. Drive `setDread` edge-darkening (`app.ts:142`) partly from fog
   alpha so dread reads as the fog closing in.
4. **Upgrade MarineSnow to 3 world-space bands advected by the flow field** (see §1c/§2).

### (c) CURRENTS don't work as intended — should be DYNAMIC
**Where it lives.** `movement.ts:24-32` — currents are static AABB force boxes (in-band = constant
push). `strata.ts:96-100` hand-places exactly TWO `current_ribbon` bands per stratum. `dive.ts:302-309`
already oscillates those two bands' force with a sine — a good instinct, but it's still two invisible
belts, not a living field.

**Fix — one time-evolving flow field is the single source of all water motion.**
1. New `src/systems/flow.ts` exposing `flow(x, y, t) -> Vec2`. Cheap shader-free version:
   `vx = A*sin(y*0.010 + t*0.35) + 0.5A*sin((x+y)*0.006 - t*0.22)`,
   `vy = A*cos(x*0.010 - t*0.30) + 0.5A*sin((x-y)*0.007 + t*0.25)`, `A ≈ 70 px/s`. Optional
   curl-of-value-noise grid (32×24, re-baked ~0.5s, bilinear-sampled) for true swirl.
2. In `movement.ts:24-32`, **replace the AABB loop** with `player.vel += flow(pos, t)*dt`
   (keep the speed clamp at `movement.ts:40-45`). Pass `t`/`flow` in through
   `updatePlayerMovement`'s signature.
3. **Delete** the two hand-placed bands in `strata.ts:96-100` and the oscillation block in
   `dive.ts:302-309`; the ribbon *sprites* stay only as an optional readout, or are dropped.
4. **Modulate the field per WEATHER climate** — `applyWeatherCurrents` (`dive.ts:485-491`)
   becomes "set field amplitude + global drift angle" from `weather.mods.currentMult`, so each of
   the 6 forecasts pushes the sea differently. This finally makes `currentMult` and the `ballast`
   boon (`dive.ts:148`) mean something field-wide.
5. **Telegraph it:** the marine-snow bands (§2) drift *along* `flow`, so the player literally sees
   where the current will shove them before it does (Pillar 1 preserved).

### (d) The stratum SCENE CHANGE is janky (a hard pop)
**Where it lives.** `transitionStratum` (`dive.ts:518-536`): `clearWorld()` → rebuild arena →
`engine.centerOn(...true)` **snaps** the camera → `setBgTint` swaps the fog instantly → title card.
It's a single-frame cut.

**Fix — an eased ~0.7s "drop through the thermocline."**
1. Split into a coroutine-ish state on `DiveScene`: `transitionPhase: "none" | "in" | "out"` +
   `transitionT`. On trigger (`dive.ts:373-376`): freeze the sim (reuse the `hitstop` gate at
   `dive.ts:260`), run a **0.15s iris/vignette darken** (drive `engine.setDread` toward 0.92, reuse
   the dread vignette at `app.ts:127-133`).
2. At the darkest frame, do the existing `clearWorld()`+rebuild, but **lerp** `bgTint` from old→new
   over the brighten (add a `lerpBgTint(from,to,t)` to `app.ts` `setBgTint`).
3. **0.25s ease-out brighten** with a downward camera drift (offset `cam.ty` +40px then settle) and
   a puff of marine-snow rising past — descent reads as one continuous fall.
4. Do NOT snap the camera; carry it (`centerOn` without `snap`, let `updateCamera` ease).
5. Same easing grammar reused for the **surface→station transition** (see §1g) — the "rise through
   the thermocline" is the inverse fade.

### (e) The OVERWORLD STATION UI is messy
**Where it lives.** `ui/station.ts`. `buildRows` (`:80-90`) appends `LAUNCH DIVE` + `BACK` into the
**same flat row list** as shop items, so the primary CTA has no privilege and sits one arrow-key from
a purchase. `layoutRows` (`:231-245`) center-stacks everything. `select` (`:198-201`) does an instant
fill/stroke swap — no motion. `currency` (`:41`) is static text. The `Overlay` interface has **no
`update(dt)`** hook (`main.ts` station state only reads input, `:269-277`).

**Fix — this is a two-track fix: (I) restructure now, (II) walkable later (§1g).**

**Track I — zoned, tweened panel (Phase 1, keeps the overlay):**
1. **Add `update(dt)` to the `Overlay` interface** (`ui/overlays.ts`) and call
   `activeOverlay.update?.(dt)` from the station update in `main.ts:269-277`. This is the enabler for
   every tween below.
2. **Zoned bands** in `layout()` (`station.ts:251-274`): HEADER (title + `◈` currency strip),
   framed WEATHER widget (promote `weatherLine`/`weatherEffect` into a `chip()`-bordered sub-panel
   with a green `+bonus` chip and coral `−penalty` chip), sliding-underline TAB STRIP (an underline
   Graphics whose x/width **lerp** between tabs on `setTab`), scrollable CONTENT list, and a pinned
   **ACTION DOCK** holding only an oversized aqua LAUNCH DIVE button — pull it out of `buildRows`
   into its own dock so it can't be mis-activated.
3. **Interpolated selection** (`select` `:198-201`): give each `Row` `curScale/tgtScale` +
   `curX/tgtX`, lerp in `update(dt)` (`cur += (tgt-cur)*min(1,dt*18)`); selected row → scale 1.035,
   x+8, plus one additive `getGlowTexture()` sprite behind it tinted by `CAT_COLOR`. The dive's own
   bioluminescence now selects menu rows.
4. **Currency count-up** (`refresh` `:221-227`): `currency` eases a `displayValue` toward
   `save.pearls`; on entry seed it at `pearls - lastBank.pearlsEarned` so `◈` ticks UP with a
   scale-punch — the loop's climax number finally moves.
5. **Entrance cascade**: panel scaleY 0.92→1 + rows stagger in (index*25ms) on open; respect
   `settings.reducedMotion` (snap to final).

### (f) It feels STALE — actors are non-animated procedural placeholders
**Where it lives.** `render/actors.ts` draws static Graphics; `dive.ts:870` sets
`v.root.scale.set(e.flash>0 ? 1.15 : 1)` — a binary flash and nothing else. Player scale is constant.
Enemy death is an **instant** `worldLayer.removeChild` (`dive.ts:854-860`). No idle motion anywhere.

**Fix — one shared `applyVitality` transform; no frames, no art.**
1. New `src/render/vitality.ts`: `applyVitality(view, {vel, t, phase, accel})` that writes bob,
   breathe, and velocity squash/stretch. `phase = hash(entityId)` so a crowd desyncs.
2. **Player** (`dive.ts:818-821`): stretch along `lastAim` — `sx = 1+clamp(speed/900,0,0.35)`,
   `sy = 1/sx` (volume-preserving, protects glow readability). On dash (`dash.active`, `dive.ts:293`)
   push ~1.5x then ease back `outQuad`.
3. **Fauna idle** (`dive.ts:851-876`): Drifter bell pulses `1+0.06*sin(t*2+phase)` like a jelly;
   Spitter spikes breathe `±0.04`; Darter tightens to a stretched 1.15x the frame its lunge
   telegraph fires (`syncTelegraph`, anticipation) then snaps flat.
4. **Death** (`dive.ts:854-860`): replace instant removal with a 0.12s squash-to-zero
   (`x→1.3, y→0.2 → 0`) over the existing `sample_burst`/`hitFx`. Track dying views in a small list.
5. **Props sway** (`buildStaticViews`): per prop store `phase = hash(pos)`; each frame
   `skew.x = swayAmp*sin(t*swaySpeed+phase) + k*flowAngle(prop)` so the whole kelp bed leans with
   the current (Pillar 2 + §1c coherence). Anchor kelp at its base so it bends from the seabed.

### (g) WALK AROUND the overworld — cozy hub life (Stardew) + shops as places
**Where it lives.** `station.ts` is a fullscreen overlay MENU; `main.ts` `station` state (`:263-279`)
runs no scene. `systems/movement.ts` (drift+drag) and `render/actors.ts` (silhouette+glow recipe)
are fully reusable for a walkable deck.

**Fix — promote the station to a small walkable SURFACE-DECK scene (Phase 2+).**
1. New `src/game/station_scene.ts` (mirrors `DiveScene`'s shape): a bounded warm deck, a steerable
   avatar reusing `updatePlayerMovement` (currents off / gentle accel), the same
   `buildPlayerView()` recolored warm, plus `MarineSnow` + wisps for continuity. No dread clock,
   warm palette (a deliberate tonal inversion — the safe place you're allowed to be bright).
2. **Shops-as-kiosks.** Reuse the `Interactables` proximity pattern (`interactables.ts`, ~40px
   touch radius): 3 glowing kiosks (OUTFITTER / MARKET / ARCHIVE) ~200px apart. Walking into one
   raises that vendor's *existing* `buildOutfitter/buildMarket/buildArchive` panel as a diegetic
   popup anchored above the kiosk (the panel builders survive verbatim). Keyboard fallback:
   auto-select nearest kiosk.
3. **Station-dwellers** — 3–4 NPC actors (Harbor-master, Archivist, Mechanic, rival Diver) drawn
   with `render/actors.ts` recolored warm, each a tiny FSM over a `{x,y,dwell}` waypoint array keyed
   to `save.runs`. On surface entry each emits a context bark via `pickBark` **seeded from
   `lastBank`** (pearlsEarned, newBadges) + save (`deepestStratum`, `codexSeen.length`) so they
   narrate your last dive (Pillar 3). Widen `BARKS` (`story.ts:12-20`) into a keyed reactive pool.
4. **The Bichon companion** (bible-only today). Procedural actor in the `actors.ts` style (stacked
   off-white ellipses + tiny amber nose-glow), 5-state FSM: WANDER / FOLLOW / GREET (bounds on the
   SURFACE event) / MOPE (slinks on death-bank) / SNIFF (walks to the newest unlocked prop and wags
   — a free "go look at your new thing" pointer). Add `bond: number` to `SaveData` (+1/dive), gating
   procedural collar recolors + one tiny utility at a threshold.
5. **The station grows** (diegetic upgrade props). A data-driven `HUB_MILESTONES` ledger evaluated
   once on station entry, gated by a new `seenMilestones: string[]` in `SaveData` (mirror
   `pickBark`'s gating): `deepestStratum>=2` lights a second lantern; each `codexSeen` species adds a
   glowing specimen tank on the Archive shelf; each `badges[]` entry pins a token; a new record depth
   unlocks a module whose accent lerps from that stratum's `strata.ts` palette. Over a playthrough the
   deck literally fills and brightens — the collect-and-upgrade spine made physical.
6. **Codex as a walkable gallery**: the ARCHIVE wing renders one tank per `SPECIES`, catalogued ones
   drawn with their existing `buildSpitterView/Drifter/Darter` recipe suspended and bobbing, lit by
   their glow (the one place fauna glow is *beautiful*, not threatening); un-catalogued show a dim
   `???` silhouette so the GAP is visible as you walk the row.

---

## 2. PRO JUICE — kill staleness with procedural motion (no new art)

All of these are parametric math on the existing Graphics/glow/pool paths. They are the "pro" layer
the owner asked for. Several are already half-present in `dive.ts` and just need finishing/tuning.

| Technique | Status in code | Where / how |
|---|---|---|
| **Flow-field currents** | new | `systems/flow.ts`; consumed by `movement.ts:24`, marine snow, prop sway, weather. The one field that makes water read as water. |
| **Marine snow → 3 world bands** | partial (`ambient.ts` screen-space) | Reparent to far/mid/near parallax planes, tint per `arena.bg`, advect drift by `flow()*band`, toroidal wrap around the camera rect. |
| **Movement wisps** | present (`dive.ts:314-319,493-502,800-816`) | Keep; tune to trail behind `-lastAim`, denser during dash, tint `leanHue`. Reuse for the station avatar (bioluminescent wake). |
| **Squash/stretch + breathing** | missing | `render/vitality.ts` (§1f) on player, fauna, NPCs, Bichon. The single highest-leverage anti-stale change. |
| **Trauma screen-shake + rotation** | anti-pattern (`dive.ts:881-886` sin/cos of elapsed, no rotation) | Replace with a `trauma 0..1` accumulator; offset AND rotate `sceneRoot` by `trauma²*rand()`; directional recoil on player hit (bias along vector from `at`). Honor `shakeEnabled` (`dive.ts:124`). ~6-line rewrite, fires on nearly every hit. |
| **Hit-stop tiering** | flat (`dive.ts:616,644` constant) | Tier it: graze=0, bullet-on-enemy≈`min(0.09,0.015+dmg*0.002)`, kill=0.06, elite=0.09, bio-pulse=0.10, player-hit=0.05. Uneven timing = weight. |
| **Muzzle flash + kickback** | missing | On fire (`dive.ts:322-328`): pool a `getGlowTexture()` flash at the muzzle (scale 0.4→0 over 0.06s) + add a `recoil` value offsetting `playerView.root` by `-aim*recoil` (3px, `outQuad`). Buys back "glow strength" spent in §1a. |
| **Camera lead** | dead-center (`dive.ts:879`) | Offset the `centerOn` target: `p.pos + lastAim*70 + vel*0.18`, clamped ~90px, own slower smoothing, ~8px deadzone. Frames the danger you're aiming at (Pillar 1). |
| **Spawn/pickup overshoot + eased transition** | instant spawns; hard transition (§1d) | Enemies intro scale 0→1 `outBack` + glow fade + arrival ring; pickups pop `outBack`, squash on collect; bio-pulse gets a 0.08s anticipation dip before the flash. |
| **God-ray shafts (depth-gated)** | missing | 2–4 canvas trapezoid gradients in `lightLayer`, slow-sine x/skew, alpha 0.05–0.11, full in Twilight → zero by Thermal Vents (interpolate on `STRATA` index). |
| **Centralized tween util** | inlined (`dive.ts:742,793`) | `src/engine/tween.ts`: `approach(cur,tgt,k,dt)` + `outQuad/outBack/inOutQuad`. Force-multiplier for every item above and the station UI (§1e). |

---

## 3. PRIORITIZED TABLE

Effort: S<½day · M~1–2 days · L~3–5 days. Impact on the owner's stated goals.

| # | Feature | Source lens | Why it matters | How in the codebase | Eff | Imp | Deps |
|---|---|---|---|---|---|---|---|
| 1 | `engine/tween.ts` util | juice | enables every tween cheaply | `approach` + easings; replace inlined eases | S | high | — |
| 2 | Glow floor down + juice buy-back | juice / owner-a | fixes "glow too strong" without losing power | `actors.ts:36`, `dive.ts:826-829` + muzzle/kickback/hit-stop | S | high | 1 |
| 3 | Trauma shake + rotation | juice | biggest feel ROI; fires on every hit | rewrite `dive.ts:881-886`; add accumulator | S | high | — |
| 4 | Flow-field currents | water | fixes "currents don't work"; base of all water motion | `systems/flow.ts`; `movement.ts:24`; delete `strata.ts:96-100`, `dive.ts:302-309` | M | high | — |
| 5 | Marine snow → 3 parallax world bands | water | fixes "flat"; telegraphs the current | reparent `ambient.ts` motes; advect by `flow` | M | high | 4, 8 |
| 6 | `render/vitality.ts` squash/breathe | juice / owner-f | kills "stale / non-animated" | `dive.ts:818-876`; death squash `:854-860` | M | high | 1 |
| 7 | Eased stratum transition | juice / owner-d | fixes "janky pop" | `dive.ts:518-536`; `app.ts` lerpBgTint + dread iris | M | high | 1 |
| 8 | Parallax planes + depth-cue tint + fog | water / owner-b | fixes "flat"; adds dimension | `app.ts` sub-containers + `updateCamera`; `bgRoot` fog | M | high | — |
| 9 | Station UI: `update(dt)` + zones + tweens | ui / owner-e | fixes "messy UI"; separates LAUNCH | `overlays.ts` interface; `station.ts` layout/select/currency; `main.ts:269-277` | L | high | 1 |
| 10 | Prop sway keyed to flow | water / owner-f | world-wide "alive"; current coherence | `dive.ts:206-254` per-prop phase + `flowAngle` | M | high | 4, 6 |
| 11 | God-ray shafts (depth-gated) | water | "the deep is beautiful"; authors descent | canvas wedges in `lightLayer`, gate on stratum | S | med | 8 |
| 12 | Camera lead / aim-bias | juice | frames danger (Pillar 1) | `dive.ts:879` offset target | S | med | — |
| 13 | Walkable surface-deck scene | living-world / owner-g | the cozy hub the owner wants | `game/station_scene.ts` reusing `movement`+`actors` | L | high | 6, 9 |
| 14 | Shops-as-kiosks | cozy-hub / owner-g | spatial shops replace tabs | reuse `Interactables` proximity; existing panel builders | M | high | 13 |
| 15 | Station-dwellers + reactive barks | cozy-hub | hub feels inhabited; narrates the run | NPC FSM + widen `story.ts`; seed from `lastBank` | L | high | 13 |
| 16 | The Bichon companion | living-world / owner-g | "the world cares I came back" | procedural actor + 5-state FSM; `bond` in `SaveData` | L | high | 13 |
| 17 | `HUB_MILESTONES` ledger (station grows) | living-world | progress made physical (Pillar 4) | data table + `seenMilestones` in `SaveData` | M | high | 13 |
| 18 | Codex as walkable tank gallery | living-world | collection becomes a place | reuse fauna views; `codexSeen` → tanks | M | med | 13, 14 |
| 19 | Forecast ritual + request board | cozy-hub | one fresh hook per dive | buoy NPC reads `weather`; templated asks from existing content | M | med | 15 |
| 20 | Harbormaster decor economy | living-world | long-term currency sink; self-expression | `decor` in `SaveData`; slot renderer over `purchaseMeta` plumbing | M | med | 17 |
| 21 | The Wreck mini-boss / Cradle Warden | features-todo | a real climax + the floor pays off | telegraphed phased fight on the array sim; reveal cutscene | L | high | 3,6,7 |
| 22 | The Cradle ending beat | narrative | "every dive is a story" resolves | authored `cutscene` at stratum 5 floor; ties `story.ts` spine | M | med | 21 |

---

## 4. PHASED BUILD PLAN

### Phase 1 — World-class polish (the slice already half-in-flight)
The owner's live complaints, closed with the smallest grounded diffs. Everything here is math on
existing systems; no walkable scene yet, no new art.
- **1.1** `engine/tween.ts` (#1).
- **1.2** Glow floor down + muzzle flash + kickback + tiered hit-stop (#2) — closes complaint (a).
- **1.3** Trauma shake + rotation (#3) + camera lead (#12).
- **1.4** Flow-field currents `systems/flow.ts` + `movement.ts` swap + weather modulation (#4) —
  closes complaint (c).
- **1.5** Marine-snow parallax bands advected by flow (#5) + parallax planes + depth-cue tint +
  drifting fog (#8) + god-rays (#11) — closes complaint (b).
- **1.6** `render/vitality.ts` squash/breathe/death + prop sway (#6, #10) — closes complaint (f).
- **1.7** Eased stratum transition (#7) — closes complaint (d).
- **1.8** Station UI: `update(dt)` hook + zoned layout + tweened selection + currency count-up +
  entrance cascade (#9) — closes complaint (e).
- **Exit criteria:** all seven complaints visibly addressed in a real playtest; reducedMotion still
  snaps; bullets remain the most salient warm thing on screen (Pillar 1 regression check).

### Phase 2 — The walkable overworld (the cozy hub)
- **2.1** `game/station_scene.ts` warm walkable deck reusing `movement` + `actors` + snow + wisps (#13).
- **2.2** Shops-as-kiosks with proximity popups over the existing panel builders (#14).
- **2.3** New `station` FSM wiring in `main.ts` (scene update instead of overlay-only input).
- **Exit:** you walk the deck, bump a kiosk, buy gear, launch — the tabbed overlay is gone.

### Phase 3 — The world reacts
- **3.1** `HUB_MILESTONES` ledger + `seenMilestones`; the deck lights up as you progress (#17).
- **3.2** Station-dwellers + reactive barks seeded from `lastBank` (#15).
- **3.3** Codex walkable tank gallery (#18).
- **3.4** Forecast ritual + request board (#19).
- **Exit:** surfacing after any dive shows at least one thing that changed because of you.

### Phase 4 — Companion & self-expression
- **4.1** The Bichon (#16) with `bond`.
- **4.2** Harbormaster decor economy (#20) — the long-term currency sink.

### Phase 5 — Climax & resolution
- **5.1** Animated pixel-art actors (GRAPHICS-TODO P0) drop into the `vitality` transform seams —
  the procedural motion becomes the "rig" real frames ride on.
- **5.2** The Wreck mini-boss + Cradle Warden phased fights (#21).
- **5.3** The Cradle ending beat resolving the `story.ts` spine (#22).

---

## 5. GUARDRAILS

1. **The four pillars are non-negotiable.** Every feature must serve: (1) readable danger,
   (2) the deep is beautiful, (3) every dive is a story, (4) collect-and-upgrade is the spine.
   If a change doesn't serve a pillar, cut it.
2. **Readable danger wins every color/light conflict.** Ambient elements (snow, fog, god-rays,
   sway, wisps, UI glow) stay **below the bloom threshold (0.62, `app.ts:80`)** and dim/low-contrast
   so bullets never lose salience. Warm = danger / cool = you is inviolate. The glow floor going
   *down* (§1a) is a Pillar-1 win, not just a comfort fix.
3. **No clutter.** New motion is desynced by per-entity phase hashes so a crowd never pulses in
   unison; particle counts stay small (snow ~70, wisps pooled, god-rays ≤4). Everything gates on
   `settings.reducedMotion` (snap to final / density 0). The station gets *fewer* simultaneous
   focal points, not more — one obvious CTA.
4. **Buildable on the array sim.** No ECS rewrite, no physics engine, no new art for Phase 1–2.
   Everything reuses: `Graphics` + `getGlowTexture()` actors, the pooled `Hazards`/`Projectiles`
   pattern, `Interactables` proximity, `movement.ts` drift, the `Overlay` panel builders, and
   `SaveData` counters that already exist. New files are small and additive
   (`flow.ts`, `tween.ts`, `vitality.ts`, `station_scene.ts`); existing signatures extend, not break.
5. **Determinism & permadeath untouched.** Sim RNG stays in `Rng`/`rng.ts`; `flow(x,y,t)` is a pure
   function of position+time (no per-frame RNG in the sim path). Banking rules (`bankDive`,
   40%/100%) and the fixed-60Hz step (`dive.ts:263`) are not altered by any juice layer — juice
   lives in `renderSync`, not `step`.
