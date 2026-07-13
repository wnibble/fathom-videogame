# FATHOM — Pass 6 Expansion Design (ARCHITECT synthesis, rev. 2)

Grounded in the real code: `src/game/dive.ts`, `src/content/biome_twilight.ts`,
`src/systems/{spitter,darter,interactables,projectiles,movement}.ts`,
`src/game/{progression,meta,persistence}.ts`, `src/main.ts`, `src/core/{state,types}.ts`,
`src/content/{upgrades,emitters,meta_upgrades}.ts`, `src/engine/app.ts`, and the two TODO roadmaps.

> **rev. 2 changelog** — folds in both blind reviews. Thesis re-centered on the GLOW DOUBLE-BIND
> (not the Descent Column). #1 honestly rebranded as *authored-place transitions*, not Downwell
> continuous descent. #6 (glow agency) pulled into Phase 1. #6+#8 "Pressure" **merged** into one
> meter (glow charge IS your visibility). New **Hazards** subsystem made an explicit, budgeted line
> item that 4 features depend on. #8 Apex de-scoped + given a real visual tell + made cuttable.
> #9 bosses re-costed (framework + per-boss). Spawn-queue, relic-identity, and determinism
> honesty added. A **narrative spine + a real floor/win** now defined.

---

## 0. THESIS — the new feel

> **Your bioluminescence is the whole game at once: it is your weapon, it is your build's
> identity, it is the treasure you carry, and it is the beacon the deep hunts you by. Every
> choice to grow brighter, richer, or stronger is the same choice to be more visible and more
> prey — a push-your-luck dive where getting *better* is what gets you *hunted*, and everything
> you caught is only real once you claw back to an ascent vent.**

This is **the GLOW DOUBLE-BIND**, and it is FATHOM's actual new identity — the thing no other
game has. It is currently latent, invented but unnamed, and it must be the center. It lives on
ONE light source, split into orthogonal, non-colliding channels (see §4 light budget):

- **Glow-as-weapon** — grazing hostile bullets charges your core; a full core fires a bio-pulse. (#6)
- **Glow-as-identity** — your build lean tints the core's HUE; a build "comes online" as a color. (#7)
- **Glow-as-treasure** — unbanked haul rides as a trailing element behind you. (#2)
- **Glow-as-beacon** — that same brightness + time-in-stratum fills a dread clock; the deep
  closes in on the bright. Descending resets it. (#8)

**Success test (apply to every glow-touching feature):** *at any moment the player can point at
their own glow and say "that is both why I am strong and why I am in danger."* If a feature does
not serve that sentence, it does not touch the glow channel.

Fused DNA (each source earns its place under the bind, not beside it):

- **Nova Drift / Brotato / EtG** — the graze economy and the directable draft are what give the
  glow *agency*: you deliberately brighten to pulse, and that same brightness is what hunts you.
- **Subnautica / Dredge / SOMA** — the dread of the unkillable deep is the *cost* side of the bind
  and adds the verb *hide* (dim your light) — the direct inverse of brightening to fight.
- **Hades** — story rides the run loop and rewards failure, so every dive advances the one mystery.
- **Hades / Dredge** — depth is a stack of **authored places** you drop between, each with a name,
  palette, fauna set, hazard, resource, and a memory. *(This is the STAGE for the bind, not the bind.)*

**The Descent Column (#1) is the STAGE, not the SOUL.** It fixes the real "depth is a number" GAP
and is the load-bearing dependency for 7 other features, so it is built first — but "descend
through biomes" is the most-cloned element in the pitch, and it does not, by itself, make FATHOM
feel new. The glow double-bind does. Build the column so the bind has a place to happen.

**Honest scope note on #1 (review blocker):** we ship **authored-place transitions** (Hades/Dredge
lineage): dropping through an ascent/descent gate tears down and rebuilds the arena as the next
authored place with a threshold beat. We are **NOT** shipping Downwell's continuous
descent-as-verb (a tall streaming column where the world scrolls in below you); that is a genuine
L+ engine rework of the camera + `movement.ts` clamp and is explicitly out of scope for this pass.
No "descent-as-verb / camera-direction / punch downward through" language survives — the feature is
a great, buildable *place-swap*, and we describe it as exactly that.

**What we deliberately are NOT building:** a Slay-the-Spire menu-map (kills diegesis — folded into
the column), constrained loadout slots (fights the upgrade-stacking spine), full Narcosis
screen-corruption (readability risk), continuous vertical streaming (L+ rework), and
vessels/daily-seed (post-core).

---

## 1. THE NARRATIVE SPINE & THE FLOOR (new — review blocker)

The deep must call toward *something* or "go deeper" decays into indifference, and the owner's bar
is "feels like a real game," which needs an ending.

- **One mystery, one answer at the bottom.** The Surface Station keeps sending divers down and does
  not say why. The answer is at the floor: **the Apex is what the first divers became**, and the
  Station is farming the deep for what they bring back. Codex fragments (#3), hero landmarks (#11),
  and surface barks (#3) all **converge on that one question**, each revealing one more piece.
- **The floor is a real place.** The column is **6 strata**; **stratum 6 — "The Cradle"** is the
  destination, not an endless +1. Reaching and surviving the Cradle is a **run-victory**; the
  first clear plays a short ending beat that resolves the mystery and unlocks New-Deep+.
- **A throughline voice.** One recurring Station NPC (the last diver who came back) reacts to your
  progress toward the answer, not just to your stats — barks are keyed to *deepest stratum reached*
  and *codex fragments seen*, giving failure forward-motion (Hades' actual lever).

This is authored *data* (`content/story.ts`), not new engine. It is declared here in Phase 1's
design even though the Cradle/ending is built last, because the floor is what gives descent meaning.

---

## 2. PRIORITIZED FEATURE TABLE

Ranked by impact ÷ effort. **S ≈ ½–1 day, M ≈ 2–4 days, L ≈ 1 week+.** "how in THIS codebase" names
the exact file/function to add or change. Effort estimates corrected per review.

| # | Feature | Source | Why it works | How in THIS codebase | Eff | Impact | Deps |
|---|---------|--------|--------------|----------------------|-----|--------|------|
| **0** | **Hazards subsystem** — pooled persistent damaging zones (pos/radius/ttl/damage/tint), checked against the player each `step()` like the darter contact check, rendered on `lightLayer`. **(FOUNDATION — 4 features depend on it; was unbudgeted)** | (infra) | #1 signature hazards, #4 Drifter spore-mines, #5 Irradiated damage-trail, #8 dread-spike ALL need it. Building it once, first, unblocks all four. | New `systems/hazards.ts`: `Hazards` class mirroring `Projectiles` shape (array + free list). `spawn(x,y,r,ttl,dmg,tint)`, `update(dt, player, sink)` calls `sink.onPlayerHit` on overlap when `player.invuln<=0`, fades alpha by ttl. Owned by `dive.ts`, updated in `step()`, torn down in `destroy()`. | S–M | ⭐ foundation | — |
| **1** | **The Descent Column** — replace the fixed `1500×1100` box with 6 stitched, hand-flavored strata; dropping through the descent gate regenerates the world as the next authored *place* (palette, fauna set, one signature hazard + resource), with a threshold title beat. Stratum 6 = the Cradle (floor). **(STAGE · P0 REAL DEPTH)** | Hades, Dredge, DRG, Subnautica | Depth becomes geography you fear and remember ("I died in the Midnight Shelf"), not a counter. Curated pockets keep readability. | Parametrize `biome_twilight.ts` → `buildStratum(index, seed, assets): ArenaData` driven by a `STRATA[]` data table (palette/fauna/hazard/resource/landmark). In `dive.ts`: add `stratumIndex`; add `transitionStratum(next)` that clears `enemies`/`enemyViews`/`telegraphs`/`proj`/`pickups`/`hazards`/`interactables`/`staticNodes`, calls `buildStratum`, snaps player to new `playerStart` via `engine.centerOn(...,true)`, keeps `run`+`player`. Threshold card reuses the `Cutscene`/overlay text pattern. `destroy()` already tears down every subsystem cleanly — reuse that teardown. | L | ⭐ high | 0 |
| **2** | **Volatile haul + voluntary Ascend vent + haul trail** — split *unbanked samples carried* from *banked pearls*; surfacing at an Ascend vent banks 100%, dying deep loses most. Carried haul glows as a growing **trail element** behind the diver (a DISTINCT channel, not the core). | Dead Cells, Spelunky, SteamWorld Dig | Turns "collect" into push-your-luck: a fat haul makes you cautious, an empty pack bold. Loss-aversion = strongest retention lever. | `bankDive` ALREADY branches `surfaced:true` (100%) vs death (`DEATH_BANK_RATIO 0.4` + `salvage-training`) — verified. Add `interactableKind:"ascend_vent"` in `interactables.ts` (touch → `sink.surface()`); add `surface()` to `InteractableSink` + a new `onSurface` path in `dive.ts` → `buildResult(true)` → `onGameOver`. **Guarantee ≥1 reachable Ascend vent per stratum** (not only at thresholds); ascending is Apex-safe (§#8). Trail = additive sprites scaled by `run.samples` in `renderSync`. | S | high | 1 |
| **6** | **Glow-Charge / graze economy** *(renamed from "Pressure")* — hostile bullets passing within ~1 body-radius (no hit) charge a **Charge** meter shown as the diver **core INTENSITY/pulse**; full = a free bio-pulse (bullet-popping shockwave) + combo feed. **(THE SOUL — glow-as-weapon)** | EtG, Nova Drift, Nuclear Throne | Flips dodging from survival to agency: bullet-thick dark becomes where you *want* to be, and the brightness you earn is the same brightness that hunts you. Light IS the UI — no HUD bar. | Dash i-frames exist (`player.invuln`, `DashState`). In `projectiles.ts` enemy-bullet branch (lines 132–142), when `rr < d ≤ rr + GRAZE_BAND` and not consumed, call `sink.onGraze(b)`. Add `onGraze` to `HitSink`; `dive.ts` accrues `charge`, rim-lights `playerView.lamp` intensity, at full triggers a shockwave (reuse `spawnHitFx` big + a new `proj.popRadius(x,y,r)` that kills nearby enemy bullets). | M | ⭐ high | 0 |
| **8** | **The Deep closes in (dread clock) + the Silent Apex** — **glow-as-beacon**: your Charge/brightness + time-in-stratum fills a **Dread** clock shown as **vignette darkness**; descending **resets** it. At max, a telegraphed pressure-spike (hazard bloom / ambush) — the bright get found. The **Silent Apex** (Phase 2, cuttable) is a slow **area-denial** hunter that herds you downward, telegraphed by sub-bass + vignette AND a faint edge silhouette/threat-marker (never invisible), that cannot corner you against a wall. **(glow-as-beacon — completes the bind)** | Subnautica, Dredge, SOMA, Dome Keeper | Makes descent the path of least resistance (fixes "why go down") and makes "brighter = hunted" *mechanical*, not thematic. Inverts pillar 2 into a threat. | `dive.ts`: add `dread` (rises with `dt * (1 + charge)`, reset in `transitionStratum`) driving vignette alpha + `audio` sub-bass; at max, spawn a telegraphed `hazards` bloom near the player. **Phase-1 ships the dread clock + spike only.** The full Apex actor (position + slow approach, edge threat-marker via existing `threatMarkers()`, "dim" verb = hold key scales `lamp.alpha`, halves fire rate — not zeroes it — and shrinks graze/aggro) is **prototyped in isolation in Phase 2 and cut if it reads unfair.** Contact = heavy damage or forced ascend, never instant death, no healthbar ever. | Dread clock: **S**. Full Apex: **M (Phase 2, cuttable)** | high | 0, 1 |
| **4** | **Three enemy roles** — Drifter (area-denier: lays fading glow-spore **hazards**), Shoal (swarmer: trivial alone, herds you), Anchor (rooted spawner: births Shoals). **(MORE ENEMIES — really "more verbs")** | Nuclear Throne, EtG | The "2 types" gap is a "2 verbs" gap (zoner + rusher). Adds *space-denial*, *herding*, *triage* → many encounter states from a small roster. Each = one silhouette + one glow-tell. | Extend `EnemyKind` in `core/types.ts`. Add `systems/{drifter,shoal,anchor}.ts` (same `make*/update*` shape as `darter.ts`). Dispatch in the `dive.ts` `step()` `e.kind` switch. **Drifter spore-mines call `hazards.spawn` (#0).** Anchor births via a **spawn queue** (see §5) — never push to `this.enemies` mid-iteration. Views in `render/actors.ts`; per-stratum sets via `STRATA[].fauna`. | M | high | 0, 1 |
| **3** | **Scan→Databank codex + reactive Station barks** — scanning fauna/relics fills a codex that drips lore + reveals attack tells; 1–2 Station NPCs (incl. the throughline voice, §1) fire a state-keyed line on surfacing, all converging on the one mystery. **(STORY DELIVERY)** | Hades, Subnautica, Dave the Diver | Story is a collectible gated behind play, delivered only on menu screens (zero combat clutter), advancing on death too. `codexSeen`/`seen` already exist. | `codexSeen:string[]` + `DiveResult.seen:[]` ALREADY in `persistence.ts`, currently dead — verified. Add `content/species.ts` (key → name, lore, tell) + `content/story.ts` (barks + fragments keyed to `DiveResult` deepest-stratum / seen). Extend `InteractableSink.scan`→ log a species key into `result.seen`; `bankDive` already unions `codexSeen`. New `CodexOverlay` + a bark line in `StationOverlay` (`main.ts` `buildStation`). | M | high | — |
| **7** | **Tag-weighted directable draft + glow HUE** — retag the 14-item catalog into archetypes (LIGHT/PRESSURE/VENOM/KINETIC/SYMBIOTE); each pick nudges offer weights; current lean tints the diver's **core HUE** (glow-as-identity). One BANISH/REROLL verb (meta-unlocked). | Nova Drift, Brotato, VS | Lucky early picks snowball into a legible identity instead of stat sticks — the freshness engine. | Add `archetype` to `Upgrade` in `upgrades.ts`. In `progression.ts` `rollChoices`, multiply each candidate `weight` by a lean factor from `run.stacks` grouped by archetype (one-line change). Lean HUE = getter read by `renderSync` core tint. BANISH/REROLL = one `RunState` field + a `LevelUpOverlay` button + a `meta_upgrades.ts` charge entry. | M | high | — |
| **5** | **Elite MODIFIER mutations** — generalize the binary elite into a mutation table (Irradiated=hazard damage-trail, Abyssal=only core-flash hittable, Bloomed=death-ring, Voltaic=faster charge), one aura color each, rolled by depth. | Nuclear Throne, EtG | N enemies × M mutations, and the player reads the delta instantly because the base is learned. Deep strata *feel* different. | `dive.ts` `spawnEnemy()` already rolls `elite = rng.chance(...)`. Replace bool with `mutation: Mutation\|null` from weighted `content/mutations.ts` (depth-scaled). Add `mutation?` to `Enemy`. Behaviors reuse seams: death-ring → emitter on `onEnemyKilled`; damage-trail → `hazards.spawn` each step; Abyssal → gate damage on `flash` window in `projectiles.ts`; aura → tint `v.glow`. | S | med-high | 0, 4 |
| **9** | **Aperture gatekeeper (boss FRAMEWORK + first boss)** — a reusable weakpoint-boss framework, plus ONE gatekeeper guarding the descent to stratum 2, with ONE signature mechanic + a single glowing weakpoint (core irises open only on attack-recovery). A calm, enemy-free corridor precedes it (story-drop). **Re-costed: framework ≠ 6 bosses.** | Titan Souls, Furi, EtG | Gives each dive a beginning-middle-end and a boss-shaped memory; the weakpoint is the brightest thing on screen = telegraph + target in one. | **Framework (M):** `systems/apex_boss.ts` — an `Enemy` with a `coreOpen` phase gate; add a `coreOpen` field to `Enemy` and gate the damage line in `projectiles.ts` (line 152) on it; add a phase-timer field. Phase-flip (danmaku ↔ dash-pressure) reuses emitter data + darter lunge. Beating it triggers `transitionStratum()`. **Then +S per additional boss as CONTENT** — the initial build ships exactly ONE; strata 3–6 gatekeepers are funded later, NOT implied to all exist at first ship. | M framework **+ S each** | high | 0, 1, 4 |
| **10** | **Evolution capstones** — a maxed base upgrade + a specific **FOUND relic (by id)** mutates a weapon into a new emitter (e.g. maxed multishot + Anglerfish relic → "Lure-Bloom"). Reads as the diver growing a new organ. | Vampire Survivors, 20MTD | Turns relics from flavor into build goals ("do I hold for the pair?") — fixes "little to find." | **Prereq — relic identity (see §5):** `relics` is a bare `int` everywhere today (verified). Give relics ids end-to-end first. Then `content/relics.ts` (id → effect/evo key) + `content/evolutions.ts` (maxed-base + relic → `EmitterSpec`); relic-claim in `dive.ts` checks pairs, swaps `run.weapon` via `deriveWeapon`, tints diver. | M | high | 3, 7 |
| **11** | **Environmental-storytelling props + one hero landmark per stratum** — authored dim-glow set-dressing (drowned buoys → broken station → colossal skeletons) + one oversized far parallax landmark pulling the eye toward the descent gate; both hint at the §1 mystery. **(THINGS TO FIND)** | Hollow Knight, Outer Wilds, Elden Ring | "Depth is a number" dies the moment the space changes character; the landmark gives direction without a quest marker. | Reuse the `scatter()` prop system in `biome_twilight.ts` — per-stratum `STRATA[].props` + `STRATA[].landmark` (big low-alpha sprite on a parallax layer, gentle pulse in `renderSync`). Props glow dim/cool; hazards stay high-contrast. | S/M | med-high | 1 |
| **12** | **Deep Bargains + Current Shrine** *(renamed from "Pressure Bargains")* — rare risky rooms: an altar offering a strong upgrade priced in max-HP/shield, and a sample-fed gamble shrine (weighted, capped) that "stirs the deep" (raises elites). | Isaac Devil Deal, RoR2 shrines | Earned deal-with-the-devil tension + variable-ratio gambling; each is a story. | Both are `interactables.ts` kinds reusing the altar/affordance-ring pattern; bargain reuses `LevelUpOverlay` with an HP/shield cost; shrine is a weighted roll behind a touch trigger, routed through `this.rng` (see §4 determinism). Spawn gated on a `noHitThisStratum` flag in `dive.ts`. | S | med-high | 1, 2 |
| **13** | **Signature per-stratum resource + content-injecting meta unlocks** — each stratum drops a distinct resource; some Station upgrades/badges REQUIRE it, and ~half of meta unlocks INJECT content (new relic id into the pool, new mutation into the table) rather than +1% stats. | Dave the Diver, DRG, Dead Cells | Gives exploration intent and makes every Station visit visibly reshape the next dive. | `STRATA[].resource` drops a new `PickupKind`; `SaveData` gains `resources:Record<string,number>` (mirror `pearls` coercion in `persistence.ts`). `meta_upgrades.ts` gains `requiresResource` + unlock entries that push ids into the #5/#10 tables. | M | med | 1, 5, 10 |
| **14** | **Sonar secret-sense** — a passive ping whose interval shortens near a hidden relic/false-wall; the secret is a wall patch pulsing subtly out of phase, opened by a dash. | Spelunky Udjat, Hollow Knight | Secret-hunting as an attention minigame (no wiki, no marker) — the same "read the dark" skill that keeps you alive. | `interactables.ts` already has hidden relics + `revealNearestRelic`. Add a proximity `audio` tick (interval ∝ distance) in `Interactables.update`, and a `false_wall` kind opened by dash overlap. | M | med | — |
| — | *Cut / deferred:* Vessels (post-core), Rumor/Clue-web (after codex), Sonar fog-chart (after column), full Narcosis (readability), Slay-the-Spire node-map (folded into #1), loadout slots (fights the spine), **continuous vertical streaming (L+ rework — out of scope)**. | | | | | | |

---

## 3. OWNER MUST-HAVES — explicit coverage

**REAL DEPTH (P0).** **#0 Hazards** + **#1 Descent Column** + **#2 volatile haul/ascend** +
**#8 dread clock**. `biome_twilight.ts` becomes `buildStratum(index, seed, assets)`; `dive.ts`
gains `stratumIndex` + `transitionStratum()` that tears down and rebuilds (reusing the existing
`destroy()` teardown) while preserving `run`+`player`. Depth stops being `depth += dt*3` and becomes
a named place with a palette, hazard, resource, landmark, and — for stratum 2+ — a gatekeeper.
Honest: these are authored *place-swaps*, not a continuous vertical fall.

**MORE ENEMIES.** **#4** adds three new *verbs* (Drifter/Shoal/Anchor), each a `make*/update*`
module in the `darter.ts` shape, dispatched by the existing `e.kind` switch, with enemy-spawned
enemies routed through a **spawn queue** (§5). **#5** multiplies them with depth-scaled mutations.
**#9** adds the gatekeeper set-piece (framework + one boss first).

**THINGS TO FIND.** **#11** (props + hero landmark) gives every stratum authored discovery and a
beacon; **#10** (evolution relics, with real relic ids) makes relics build goals; **#12** (Deep
Bargains + shrine) adds risky rooms; **#13** makes each resource worth seeking; **#14** rewards
reading the dark. All reuse `interactables.ts` + affordance-ring + hidden-relic patterns.

**STORY DELIVERY.** **#3** is the spine: wire the dead `codexSeen`/`seen` fields to `species.ts` +
`story.ts`, and add barks (incl. the §1 throughline NPC) keyed to `DiveResult`. Delivered on
menu/station screens as glowing text — zero combat overlay, no VO. **#11** props/landmarks and #9's
calm corridors are the in-dive beats. All fragments **converge on the one mystery**, resolved at the
**Cradle floor** (§1). Because barks + codex advance on *death too*, no dive is wasted.

---

## 4. LIGHT-BUDGET & DETERMINISM GATES (new — review majors)

**Light budget (design gate before #2/#5/#6/#7/#8 ship).** The bind lives on one light source, so
every meaning gets a DISTINCT, orthogonal channel — verified indistinguishable-when-simultaneous:

| Meaning | Channel | Feature |
|---|---|---|
| Build lean / identity | core **HUE** | #7 |
| Glow-Charge (graze) | core **INTENSITY / pulse** | #6 |
| Carried haul | a distinct **trailing element** behind the diver | #2 |
| Dread (beacon) | **vignette darkness** (screen edge, not the diver) | #8 |
| Elite mutation | enemy **aura color** (on the enemy, not the diver) | #5 |

Visibility-to-the-deep is a **derived readout of intensity**, never a fifth encoding. No two systems
may claim the same channel; a readability pass (all firing at once, in the darkest stratum) is a
PROMOTE gate.

**Determinism — honest wording.** The sim is **already not replay-deterministic**: `interactables.ts`
`trigger()` calls `Math.random()` for `upgradeChance` (line 169) *inside* `step()` — verified. No
replay/netcode exists, so this is harmless today. Decision for this pass: **route all NEW in-sim
rolls (shrines/bargains/hazard jitter) through the seeded `this.rng`, and migrate the existing
`upgradeChance` roll to `this.rng` too** so the sim trends toward determinism instead of away. Menu-
side rolls (`rollChoices`, draft, station) keep `Math.random`. We do not *claim* a determinism
guarantee the code breaks.

---

## 5. TWO PLUMBING PREREQUISITES (new — review minors, must precede their features)

**Spawn queue (before #4 Anchor / any enemy that spawns enemies).** `step()` iterates
`for (const e of this.enemies)`; pushing into `this.enemies` mid-loop skips/desyncs entities.
Add `pendingSpawns: SpawnRequest[]`; enemy brains push requests; `dive.ts` **drains it AFTER the
enemy loop** each step, where it can also attach the view + light + `enemyViews` entry (which a brain
can't). Trivial, but required or Anchor flickers/desyncs.

**Relic identity (before #10 and #13).** `run.relics` is a bare integer in `progression.ts`,
`dive.ts`, `persistence.ts` — verified. `InteractableSink.relicClaimed(x,y)` already carries coords
but no id. Thread a `relicId`: `InteractableData` for relics gets a `relicId`; `relicClaimed(id,x,y)`
passes it; `RunState` gains `relicsHeld: string[]` alongside the count; `DiveResult`/`bankDive`
carry ids. Small, but it is schema/plumbing across 3 files — not the "data-only" the #10 cell implies.

---

## 6. PHASED BUILD PLAN

Build the foundation + the bind's core first, then variety, then depth-of-systems. Ship each phase
verified before the next (PROMOTE discipline). **Phase A now assembles the whole double-bind loop —
descend / graze-to-fight / brighten-to-be-hunted / extract — not just descend + hide.**

**Phase 1 (A) — the double-bind exists and is playable (the spine + the soul).**
1. **#0 Hazards subsystem** — the shared foundation 4 later features need.
2. **#1 Descent Column** ⭐ — the stage: 6 authored strata + `transitionStratum()` (STAGE / REAL DEPTH).
3. **#2 Volatile haul + Ascend vent + haul trail** — the extract decision (glow-as-treasure).
4. **#6 Glow-Charge / graze economy** — glow-as-weapon, the SOUL, pulled forward (was Phase C).
5. **#8 Dread clock** (light version — clock + spike only, no full Apex) — glow-as-beacon; closes the bind.
6. **#4 Drifter** (+ spawn queue) — one new enemy that *uses* #0 (MORE ENEMIES).
7. **#11 Hero landmark + relic identity** — one thing-to-find + the relic-id prereq (THINGS TO FIND).
8. **#3 Scan→Codex + one Station bark** — the first story beat, keyed to deepest stratum (STORY).

*After Phase 1: the player can point at their glow and name it as both power and danger; depth is a
place; the greed-vs-extract loop is playable; there is a new enemy verb, something to find, and the
first thread of the mystery. The new feel EXISTS — combat, not just navigation, has changed.*

**Phase 2 (B) — the dark deepens & the hunter arrives.**
9. **#5 Elite mutations** (uses #0). 10. **#7 Tag-weighted draft + glow HUE** (glow-as-identity).
11. **#8 full Silent Apex** — prototyped in isolation, given a real edge tell, cut if unfair.
12. **#9 boss framework + first gatekeeper** (guards stratum 2).

**Phase 3 (C) — builds get deep, exploration gets intent, the floor lands.**
13. **#10 Evolution capstones** (needs relic ids from Phase 1). 14. **#12 Deep Bargains/shrine**.
15. **#13 resource economy + content-injecting unlocks**. 16. **#14 sonar-sense**.
17. **The Cradle (stratum 6) + first-clear ending** — the floor that resolves the §1 mystery + gatekeepers 3–6 as content.

*(Vessels / clue-web / fog-chart are the pass-7 long-tail.)*

**THE DEFINING FEATURE is the GLOW DOUBLE-BIND** (glow = weapon + identity + treasure + beacon),
delivered across #6/#7/#2/#8. **#1 The Descent Column is the STAGE** that hosts it and the
load-bearing dependency for #2/#4/#5/#8/#9/#11/#13 — built first, but not mistaken for the soul.

---

## 7. GUARDRAILS

- **The double-bind is the north star.** Every glow-touching feature passes the §0 success-test
  sentence or it does not ship on the glow channel. The §4 light budget is a PROMOTE gate.
- **Four pillars stay law.** (1) *Readable danger:* every new enemy/boss keeps the strict
  telegraph→act cycle; the Apex is telegraphed by audio + vignette **AND a faint edge tell** — unseen
  never means invisible — and cannot corner you against a wall; mutations read as one aura color.
  (2) *The deep is beautiful:* new UI lives as light on distinct channels — **no new HUD bars**.
  (3) *Every dive is a story:* barks/codex/vignettes advance on death, converging on one mystery
  with a real answer at the Cradle. (4) *Collect & upgrade is the spine:* volatile haul + evolutions
  deepen the pearl/upgrade loop, they don't replace it.
- **Extraction must never be a trap.** ≥1 reachable Ascend vent per stratum; ascending is Apex-safe
  (the deep hunts depth-lingerers, not surfacers). Tension = "one more stratum vs. bank now," never
  "I physically cannot get out."
- **Buildable on the array-based sim — no engine rewrite.** Every feature reuses a verified seam: the
  `Enemy` struct + `e.kind` dispatch, the pooled `Projectiles`/`EmitterSpec`, the new `Hazards` pool
  built to that same shape, the `HitSink`/`InteractableSink` callbacks, `bankDive`'s `surfaced` path,
  the dead `codexSeen`/`seen` fields, and the clean `destroy()` teardown that `transitionStratum()`
  reuses. **Explicitly out of scope: continuous vertical streaming** (an L+ camera + `movement.ts`
  rework) — we ship authored place-swaps and say so.
- **Data over code.** `STRATA[]`, fauna, mutations, relics, evolutions, species, barks, story
  fragments are pure-data modules in `src/content/` — same pattern as `emitters.ts`/`upgrades.ts`.
