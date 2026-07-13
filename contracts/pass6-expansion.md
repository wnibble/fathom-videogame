# FATHOM — Pass 6 Expansion Design (ARCHITECT synthesis)

Grounded in the real code: `src/game/dive.ts`, `src/content/biome_twilight.ts`,
`src/systems/{spitter,darter,interactables,projectiles}.ts`,
`src/game/{progression,meta,persistence}.ts`, `src/main.ts`, `src/core/{state,types}.ts`,
`src/content/{upgrades,emitters,meta_upgrades}.ts`, and the two TODO roadmaps.

---

## 0. THESIS — the new feel

> **Downwell's descent-as-verb × Subnautica/Dredge's dread of the unkillable deep ×
> Hades' narrative-that-rewards-failure × Nova Drift's directable build synergy —
> a bioluminescent push-your-luck dive where going *deeper* is the only way *forward*,
> your glow is both your weapon and the thing that gets you hunted, and everything you've
> caught is only real once you claw your way back up.**

Fused DNA (4 sources, one identity):

- **Downwell** — descent is the primary verb and the camera direction, not a HUD number.
- **Subnautica / Dredge** — one thing you cannot shoot (the Apex) turns the dark into dread and adds the verb *hide*; a depletion clock makes every meter a choice.
- **Hades** — story rides the run loop; death delivers narrative instead of only punishing, so no dive is wasted.
- **Nova Drift / Brotato** — the draft is *directable*: early picks bias the pool toward an archetype so a build "comes online" and reads as your diver's changing color.

The single move that unlocks all of it: **stop treating a dive as a fixed arena you
survive; make the water column a stack of authored *places* you punch downward through,
wrapped in a per-stratum greed-vs-extract decision.** Everything below hangs off that.

**What we deliberately are NOT building:** a Slay-the-Spire menu-map (kills the diegesis —
we fold "chosen forks" into the column instead), constrained loadout slots (fights the
existing upgrade-stacking spine and is a big rework), full Narcosis screen-corruption
(readability risk — deferred), and vessels/daily-seed (great, but strictly post-core).

---

## 1. PRIORITIZED FEATURE TABLE

Ranked by impact ÷ effort. S ≈ ½–1 day, M ≈ 2–4 days, L ≈ 1 week+. "how in THIS codebase"
names the exact file/function to add or change.

| # | Feature | Source game(s) | Why it works | How in THIS codebase | Eff | Impact | Deps |
|---|---------|----------------|--------------|----------------------|-----|--------|------|
| **1** | **The Descent Column** — replace the fixed `1500×1100` box with 5–6 stitched, hand-flavored strata; descending regenerates the world as the next *place* (palette, fauna set, one signature hazard + resource), with a threshold title beat. **(DEFINING · P0 REAL DEPTH)** | Downwell, DRG, Spelunky, Subnautica | Depth becomes geography you fear and remember ("I died in the Midnight Shelf"), not a counter. Reuses curated pockets so readability holds. | Parametrize `biome_twilight.ts` → `buildStratum(index, seed, assets): ArenaData` (palette/fauna/hazard/resource per `STRATA[]` data table). In `dive.ts`: add `stratumIndex`, `nextStratum` (mirror the existing `nextResupply` gate at ~180–260 m); add `transitionStratum()` that clears `enemies`/`proj`/`pickups`/`interactables`/`staticNodes`, calls `buildStratum`, recenters player via `engine.centerOn`, keeps `run`+`player`. Threshold card = reuse `Cutscene`/overlay text. Palette shift = tint on `worldLayer`/vignette (GRAPHICS-TODO P2). | L | ⭐ high | — |
| **2** | **Volatile haul + voluntary Ascend vent** — split *unbanked samples carried* from *banked pearls*; surfacing at an Ascend vent banks 100%, dying deep loses most. Carried haul glows as a growing trail on the diver. | Dead Cells, SteamWorld Dig, Spelunky | Converts the "collect" pillar into push-your-luck tension: a fat haul makes you cautious, an empty pack bold. Gives the descend/extract fork real teeth. Loss-aversion = the strongest retention lever. | `bankDive` ALREADY supports `surfaced:true` (100%) vs death (`DEATH_BANK_RATIO 0.4` + `salvage-training`). Add `interactableKind:"ascend_vent"` in `interactables.ts` (touch → `sink.surface()`); wire a new `onSurface` callback in `dive.ts` → `buildResult(true)` → `onGameOver`. Spawn one Ascend vent per stratum threshold. Trail = additive sprites scaled by `run.samples` in `renderSync`. | S | high | 1 |
| **3** | **Reactive Surface Station barks + Scan→Databank codex** — 2–4 hub NPCs fire one state-keyed line on surfacing; scanning fauna/relics fills a codex that drips lore + reveals attack patterns. **(STORY DELIVERY)** | Hades, Subnautica, Dave the Diver | Story becomes a collectible gated behind play, delivered only on menu screens (zero combat clutter). Advances on death too, so no dive is wasted. `codexSeen` already exists in the save. | `codexSeen:string[]` and `DiveResult.seen:[]` ALREADY in `persistence.ts` — currently unused. Add `content/species.ts` (key → name, lore, tell) + `content/barks.ts` (line + predicate over `DiveResult`+`SaveData`). `research_probe`/relic scan in `interactables.ts` already calls `sink.scan`; extend sink to log a species key → push into `result.seen`. `bankDive` already unions `codexSeen`. New `CodexOverlay` + a bark line in `StationOverlay` (`main.ts` `buildStation`). | M | high | — |
| **4** | **Three enemy roles** — Drifter (area-denier: lays fading glow-spore mines), Shoal (swarmer: trivial alone, herds you into crossfire), Anchor (rooted spawner: births Shoals, forces target-priority). **(MORE ENEMIES)** | Nuclear Throne, EtG | The "2 enemy types" gap is really a "2 verbs" gap (zoner + rusher). Adding *space-denial*, *herding*, and *triage* multiplies encounter states from the same roster. Each = one silhouette + one glow-tell. | Extend `EnemyKind` in `core/types.ts`. Add `systems/{drifter,shoal,anchor}.ts` (same `make*/update*` shape as `darter.ts` — the `Enemy` struct already carries `vel/telegraphTimer/attackTimer/spinSeed`). Dispatch in `dive.ts` `step()` enemy loop (already switches on `e.kind`). Drifter spore-mines = short-lived `Damageable`-less hazard circles (reuse hazard list from #1's signature hazard). Views in `render/actors.ts`. Assign per-stratum fauna sets via `STRATA[].fauna`. | M | high | 1 |
| **5** | **Elite MODIFIER mutations** — generalize the current binary elite into a small mutation table (Irradiated=damage-trail, Abyssal=only core-flash hittable, Bloomed=death-ring, Voltaic=faster charge), one aura color each, rolled by depth. | Nuclear Throne, EtG | Highest-ROI variety in the genre: N enemies × M mutations, and the player instantly reads the delta because the base is already learned. Makes deeper strata *feel* different, not just bigger. | `dive.ts` `spawnEnemy()` already rolls `elite = rng.chance(...)`. Replace bool with `mutation: Mutation|null` from a weighted `content/mutations.ts` table (depth-scaled). Store on `Enemy` (add `mutation?` field). Behaviors hook existing seams: death-ring → `onEnemyKilled` fires an emitter; damage-trail → spawn hazard each step; aura → tint `v.glow`. | S | med-high | 4 |
| **6** | **Graze / Pressure economy on the dash** — hostile bullets passing within ~1 body-radius (without hitting) charge a Pressure meter shown as the diver's own glow intensity; full meter = a free bio-pulse (bullet-popping shockwave) and feeds the combo multiplier. | EtG, Nova Drift, Nuclear Throne | Flips dodging from neutral survival to agency: the bullet-thick dark becomes the place you *want* to be. Self-scales difficulty; light IS the UI (pillar 2), no HUD clutter. | Dash i-frames already exist (`player.invuln`, `DashState`). In `projectiles.ts` enemy-bullet branch, when `rr < d ≤ rr + GRAZE_BAND` and not consumed, call `sink.onGraze(b)`. Add `onGraze` to `HitSink`; `dive.ts` accrues `pressure`, rim-lights `playerView.lamp`, and at full triggers a shockwave (reuse `spawnHitFx` big + clear nearby enemy bullets via a `proj.popRadius(x,y,r)` helper). | M | high | — |
| **7** | **Tag-weighted directable draft** — retag the 14-item catalog into biological archetypes (LIGHT / PRESSURE / VENOM / KINETIC / SYMBIOTE); each pick nudges offer weights toward its tags; the current lean tints the diver's glow. Add one BANISH or REROLL agency verb (meta-unlocked). | Nova Drift, Brotato, VS | The core freshness engine: lucky early picks snowball into a legible identity instead of arbitrary stat sticks. Cheap lever on "why runs stay fresh." | Add `archetype` to `Upgrade` in `upgrades.ts`. In `progression.ts` `rollChoices`, multiply each candidate's `weight` by a lean factor derived from `run.stacks` grouped by archetype. Lean color = new getter read by `renderSync` glow tint. BANISH/REROLL = one field on `RunState` + a button in `LevelUpOverlay`; bank charges as a `meta_upgrades.ts` entry. | M | high | — |
| **8** | **The Silent Apex + Pressure clock** — one per-run unkillable hunter patrolling below, telegraphed ONLY by escalating sub-bass + darkening vignette; it tracks your glow, so a "dim" input cuts your light (and offense) to hide. Lingering in a stratum fills Pressure; **descending resets it** — the game whispers *go deeper to escape*. | Subnautica, Dredge, SOMA, Dome Keeper | Adds awe + the verb *hide* with zero bullet clutter, and makes descent the path of least resistance (fixes "why go down"). Pillar 2 inverted into a mechanic: glow = seen. | `dive.ts`: add `pressure` (rises with time-in-stratum, reset in `transitionStratum`), an `apex` actor (position + approach param) driving `audio.setDepth`-style sub-bass and vignette alpha. "Dim" = a held key that scales `playerView.lamp.alpha` + zeroes firing + shrinks graze/aggro radius. Contact = heavy damage or forced ascend, never instant death. No healthbar, ever. | M | high | 1 |
| **9** | **Strata gatekeeper / Aperture boss** — each stratum transition is gated by a mini-boss with ONE signature mechanic and a single glowing weakpoint (core irises open only on attack-recovery); a calm, enemy-free bioluminescent corridor precedes it (story-drop spot). Beating it IS the descent. | Titan Souls, Furi, EtG | Turns depth into "a sequence of named places each with a boss-shaped memory," gives each dive a beginning-middle-end, and reuses the telegraph + relic/scan systems. The weakpoint is the brightest thing on screen = telegraph and target in one. | New `systems/apex_boss.ts` (an `Enemy` with `mutation:"aperture"` semantics: `projectiles.ts` only applies damage when a `coreOpen` window is set by the boss brain). Phase-flip (ranged danmaku ↔ dash-pressure) reuses existing emitter data + darter lunge logic. Trigger `transitionStratum()` on death. Calm corridor = a pocket in `buildStratum` with no `spawns`. | M/L | high | 1, 4 |
| **10** | **Evolution capstones** — a maxed base upgrade + a specific FOUND relic mutates a weapon into a new emitter with new behavior (e.g. maxed multishot + Anglerfish relic → "Lure-Bloom" that draws fauna into poisoned light). Reads as the diver growing a new organ (silhouette/color change). | Vampire Survivors, 20MTD | Progression becomes a pairing puzzle ("do I hold for the pair?") — a run-defining moment (pillar 3) and the thing that converts relics from flavor into build goals (fixes "little to find"). | `relics` already tracked on `RunState`; relics currently just grant a level-up. Add `content/relics.ts` (relic id → effect / evolution key) and `content/evolutions.ts` (base-upgrade-maxed + relic → new `EmitterSpec` + stat hook). `applyUpgrade`/relic-claim in `dive.ts` checks pairs, swaps `run.weapon` via `deriveWeapon`, tints diver. | M | high | 3, 7 |
| **11** | **Environmental-storytelling props + one hero landmark per stratum** — each stratum gets authored dim-glow set-dressing (drowned buoys → broken station → colossal skeletons) plus one oversized far-off parallax landmark pulling the eye downward; both hint at the same mystery the codex tracks. | Hollow Knight, Outer Wilds, Elden Ring | "Depth is a number" dies the moment the space changes character. Curiosity does the narrative work for free; the landmark gives direction without a quest marker. | Reuse the `scatter()` prop system in `biome_twilight.ts` — add per-stratum `STRATA[].props` + `STRATA[].landmark` (a big low-alpha sprite on a parallax layer, gentle pulse tween in `renderSync`). Contrast discipline: props glow dim/cool, hazards stay high-contrast. | S/M | med-high | 1 |
| **12** | **Pressure Bargains + Current Shrine** — rare risky rooms: an altar offering a strong upgrade priced in max-HP/shield (appearance chance rises when you took no damage last stratum), and a sample-fed gamble shrine (weighted loot, capped wins) that "stirs the deep" (raises elites). | Isaac Devil Deal, RoR2 shrines | Earned deal-with-the-devil tension + variable-ratio gambling = the most compulsive loops in the genre, and each is a story ("I pushed too far"). | Both are `interactables.ts` kinds reusing the existing altar/affordance-ring pattern; the bargain reuses `LevelUpOverlay` with an HP/shield cost; the shrine is a weighted roll behind a touch trigger. Spawn gated on a `noHitThisStratum` flag tracked in `dive.ts`. | S | med-high | 1, 2 |
| **13** | **Signature per-stratum resource + content-injecting meta unlocks** — each stratum drops a distinct resource; specific Station upgrades/badges REQUIRE it, and ~half of meta unlocks INJECT content (new relic type into the drop pool, new elite mutation into the scaling table) rather than +1% stats. | Dave the Diver, DRG, Dead Cells, RL2 | Gives exploration intent ("I need cores → push the vent stratum") and makes every Station visit visibly reshape the next dive — the "one more run to see the new thing" hook. | `STRATA[].resource` drops a new `PickupKind`; `SaveData` gains a `resources:Record<string,number>` (mirror `pearls` coercion in `persistence.ts`). `meta_upgrades.ts` gains `requiresResource` + unlock entries that push ids into the relic/mutation tables read by #5/#10. | M | med | 1, 5, 10 |
| **14** | **Sonar secret-sense (warmer/colder)** — a passive ping whose interval shortens near a hidden relic/false-wall; the secret is a wall patch pulsing subtly out of phase, opened by a dash or vent. | Spelunky Udjat, Hollow Knight | Turns secret-hunting into an attention minigame (no wiki, no HUD marker) — the same "read the environment" skill that keeps you alive. Pillar 2: glow through dark reveals the hidden. | `interactables.ts` already has hidden relics + `revealNearestRelic`. Add a proximity `audio` tick (interval ∝ distance) in `Interactables.update`, and a `false_wall` kind opened by dash overlap. | M | med | — |
| — | *Cut / deferred:* Rule-bending Vessels (L, post-core multiplier), Rumor/Clue-web log (L, after codex ships), Sonar fog-of-war chart (after column ships), full Narcosis corruption (readability risk), Slay-the-Spire node map (fold into #1 forks), constrained loadout slots (fights the spine). | | | | | | |

---

## 2. OWNER MUST-HAVES — explicit coverage

**REAL DEPTH (P0).** Features **#1 (Descent Column)** + **#8 (Pressure clock/Apex)** +
**#2 (volatile haul/ascend)** together are the fix. `biome_twilight.ts` becomes
`buildStratum(index, seed, assets)`; `dive.ts` gains `stratumIndex`/`nextStratum` (mirroring
the existing `nextResupply` gate) and `transitionStratum()` that tears down and rebuilds the
world while preserving `run`+`player`. Camera already follows via `engine.centerOn` — the
column just keeps generating below. Descent is now *chosen* (ascend now vs push deeper) and
*forced downward* (Pressure rises until you drop through). Depth stops being `depth += dt*3`
and becomes a place with a name, a palette, a hazard, a resource, and a gatekeeper.

**MORE ENEMIES.** **#4** adds three new *verbs* (area-denial Drifter, swarm Shoal, spawner
Anchor) — each a `make*/update*` module in the exact `darter.ts` shape, dispatched by the
`e.kind` switch already in `dive.ts` `step()`. **#5** multiplies all of them with cheap
depth-scaled elite mutations. Two archetypes → dozens of encounter compositions without 20
new sprites. **#9** adds the apex/gatekeeper as a set-piece.

**THINGS TO FIND.** **#10 (evolution relics)** makes relics build-defining goals; **#11
(vignette props + landmark)** gives every stratum authored discovery and a beacon to swim
toward; **#12 (Pressure Bargains + Current Shrine)** adds optional risky rooms; **#14 (sonar
secret-sense)** rewards careful reading of the dark; **#13** makes each stratum's resource
worth seeking. All reuse the existing `interactables.ts` + affordance-ring + hidden-relic
patterns — mostly data + weighted rolls, not engine work.

**STORY DELIVERY (lightweight, no cutscenes).** **#3** is the spine: `codexSeen` and
`DiveResult.seen` already exist in `persistence.ts` and are currently dead — wire scan probes
to a `species.ts` DB (lore + revealed attack tell) and add state-keyed `barks.ts` lines that
2–4 Station NPCs fire on surfacing (keyed to `DiveResult`: deepest stratum, killed-by, relics,
pearls). Delivered entirely on menu/station screens as glowing text bubbles — zero combat
overlay, no VO. **#11**'s environmental props and **#9**'s calm pre-boss corridors are the
in-dive story beats. Because barks + codex advance on *death too*, every dive tells a story.

---

## 3. PHASED BUILD PLAN

Build the spine first, then variety, then depth-of-systems. Ship each phase verified before
the next (the codebase's PROMOTE discipline).

**Phase A — the new feel exists (the spine).** *Defining feature first.*
1. **#1 The Descent Column** ⭐ — the one feature that changes everything; nothing else lands without it.
2. **#2 Volatile haul + Ascend vent** — makes the column a decision, wires the push-your-luck loop.
3. **#8 Pressure clock + Silent Apex** — makes descent *forced downward* and adds dread + the hide verb.

*After Phase A: "depth is a place" is true, and the core greed-vs-extract loop is playable.*

**Phase B — the dark is populated & the loop tells a story.**
4. **#4 Three enemy roles** — real encounter variety per stratum.
5. **#5 Elite mutations** — cheap depth-scaled flavor on top of #4.
6. **#3 Barks + Databank codex** — turns the existing die/surface loop into the story engine.

**Phase C — builds get deep & exploration gets intent.**
7. **#6 Graze/Pressure economy** — the skill-expression layer that makes bullet-thick dark desirable.
8. **#7 Tag-weighted draft** — runs start feeling like directed builds.
9. **#9 Gatekeeper/Aperture boss** — the named set-piece per stratum.
10. **#10 Evolution capstones** + **#11 vignettes/landmarks** + **#12 risky rooms** — the "things to find" payoff, layered on the now-solid column.

*(#13 resource economy and #14 sonar-sense fill in as data work once C is stable; Vessels /
clue-web / fog-chart are the pass-7 long-tail multipliers.)*

**THE SINGLE DEFINING FEATURE: #1 — The Descent Column.** It converts the fixed bounding box
into a stack of authored places, and it is the load-bearing dependency for #2, #4, #8, #9,
#11, #12, and #13. Build it first, build it well.

---

## 4. GUARDRAILS

- **Four pillars stay law.** (1) *Readable danger:* every new enemy/boss keeps the strict
  telegraph→act cycle already in `spitter.ts`/`darter.ts`; the Apex is telegraphed by
  audio+vignette only; mutations read as one aura color. (2) *The deep is beautiful:* new
  UI lives as light (graze = glow intensity, Pressure = vignette, carried haul = trail, build
  lean = glow tint) — **no new HUD bars**. (3) *Every dive is a story:* barks/codex/vignettes,
  advancing on death. (4) *Collect & upgrade is the spine:* volatile haul + evolutions deepen
  the existing pearl/upgrade loop, they don't replace it.
- **No clutter.** Corruption/Narcosis and the node-map are cut for readability. Secrets and
  risky rooms are SPARSE landmark objects, not scatter. One hero landmark per stratum, max.
- **Buildable on the array-based sim — no engine rewrite.** Every feature reuses existing
  seams: the `Enemy` struct + `e.kind` dispatch, the pooled data-driven `Projectiles` +
  `EmitterSpec`, the `HitSink`/`InteractableSink` callbacks, the `interactables.ts` affordance
  pattern, `bankDive`'s already-present `surfaced` path, and the dead-but-present `codexSeen`/
  `seen` fields. The biggest single new mechanism is `transitionStratum()` in `dive.ts` — a
  teardown+rebuild of things the scene already knows how to build and destroy (`destroy()`
  already tears down every subsystem cleanly). Fixed-60Hz determinism preserved: keep sim RNG
  out of `Math.random` (follow the `spitter.ts`/`darter.ts` deterministic convention); menu-
  side rolls (draft, shrines) may use `Math.random` like `rollChoices` already does.
- **Data over code.** New fauna, mutations, relics, evolutions, species lore, barks, and the
  `STRATA[]` table are all pure-data modules in `src/content/` — same pattern as
  `emitters.ts`/`upgrades.ts`/`meta_upgrades.ts`. New patterns need no engine code.
