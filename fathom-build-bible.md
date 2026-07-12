# FATHOM — Build Bible & Recursive Agent-Tree Prompt

> A top-down **pixel-art roguelite bullet-diver**. Realm-of-the-Mad-God readability with a touch more sprite detail, wrapped around a bioluminescent *descent*: dive through distinct sea strata, dodge glowing bullet-hell fauna, catalog species, upgrade at the surface, chase the deepest dive. Permadeath runs, meta-progression, one weird loyal Bichon.
>
> This document is two things at once: **(A)** the design + subsystem spec, and **(B)** an executable **agent-tree prompt** that recursively builds and improves the game. Point an agentic coding tool (e.g. Claude Code with subagents) at Part 6–7 to run it.

---

## PART 0 — Vision & pillars

**Fantasy:** you are a small light in a vast dark ocean, going deeper than is wise, and coming back with wonders.

**Pillars (every decision serves these):**
1. **Readable danger.** Bullet patterns and hazards are always legible at a glance — telegraphed, high-contrast against the dark. Difficulty comes from *reading and dodging*, never from confusion.
2. **The deep is beautiful.** Bioluminescence glows *through* darkness (additive light), not a flat black mask. Descent = escalating awe + dread.
3. **Every dive is a story.** Run-based, permadeath, but you always surface with something — loot, a new species, a deeper record.
4. **Collect & upgrade is the spine.** The codex and the surface station are the reason to dive again.

**Non-goals for v1:** real-time multiplayer, open sandbox world, crafting trees. (All deferrable.)

---

## PART 1 — Art direction (pixel)

- **Base grid:** characters/companions **24×24**, standard fauna **32×32**, elites **48×48**, bosses **96×96+**. (RotMG uses ~8×8; we go denser for "a tad more detail" while keeping silhouettes clean.)
- **Scaling:** integer-only (×3 default), nearest-neighbor, snapped to the pixel grid. No sub-pixel blur.
- **Palette:** one cohesive **~40-color deep-sea ramp** — abyssal navy/teal darks, aqua→amber→coral biolum accents, warm surface light. Each biome pulls a *sub-palette* from the master so the whole game feels one world.
- **Silhouette-first:** every entity must be identifiable in pure black silhouette. Glow is layered *on top* of solid pixel bodies (a soft additive bloom pass), never replacing them.
- **Animation:** 2–4 frame idle/swim cycles; telegraph frames for attacks are mandatory (wind-up pose + flash before any projectile spawns).
- **Lighting:** the world renders in the dark; light is a separate additive layer (player beam, companion, and every glowing creature). Palette stays intact — fog is tinted deep-water color, capped opacity, never dead black.

Deliverable per asset: a spritesheet PNG (power-of-two atlas), a JSON frame map, and a one-line palette note. See Subsystem: Art Pipeline.

---

## PART 2 — Structure: strata (levels), run & meta loop

Not "levels" in a linear sense — **strata**: discrete descending biomes, procedurally assembled from handcrafted room/arena chunks, gated by depth. A **dive** is a run through a sequence of strata; death returns you to the surface with banked loot.

**Strata (each = distinct identity, palette, fauna, hazard, music):**
1. **The Shelf** *(sunlit / cozy / tutorial)* — gentle drifting fauna, no bullets yet; teaches move + catalog + bank.
2. **Kelp Forest** *(occlusion / ambush)* — vision-blocking kelp, lurkers that dart out, mild currents.
3. **Twilight Drift** *(open midwater / first bullets)* — Spitters with radial + aimed patterns; eerie, dimming light.
4. **The Wreck** *(tight corridors / salvage)* — a sunken vessel; mechanical hazards, dense loot, mini-boss "the Anglerlure."
5. **Thermal Vents** *(hazard fields / aggression)* — eruption timers, fast fauna, bright-in-dark.
6. **Abyssal Plain** *(dark / sparse / predators)* — heavy fog, roaming heavy-hitters, poison slugs; resource-rich but deadly.
7. **The Trench** *(boss depth / reveal)* — the Leviathan boss; the "bottom" cutscene. Deepest record lives here.

**Difficulty:** scales with depth reached this run *and* meta-level — spawn tables, bullet density, and enemy speed interpolate by a single `depthTier` value.

**Loop:**
- **Surface Station (meta hub):** upgrades, codex, dog customization, leaderboard, launch next dive.
- **Dive (run):** descend stratum → stratum; collect samples (unbanked); loot gear/abilities (in-run only); depth gate/boss to go deeper.
- **Bank/Death:** surfacing banks samples → permanent currency; dying loses *unbanked* samples but keeps meta unlocks and codex entries.

---

## PART 3 — Cutscene system + scripted beats

**System:** a lightweight **scripted sequencer**. A cutscene = an ordered list of *steps* (show framed pixel art / portrait, pan camera via tween, type text, wait, play SFX, spawn actor). Fully **skippable** (hold to skip), never blocks input longer than ~1s without an escape. Data-driven (JSON), so writers/agents add beats without touching engine code.

**Beats to script (v1):**
- **Cold open — "The Descent."** Title card; the diver drops from the surface light into blue. Sets tone.
- **First Portal.** The companion portal wakes; the Bichon emerges (comedic-uncanny beat — a fluffy dog, underwater, unbothered).
- **Stratum thresholds.** Short title cards on first entry to each biome (name + one evocative line).
- **Mini-boss (Wreck) & Leviathan (Trench) intros.** Camera pan to reveal, telegraph the fight's gimmick.
- **The Bottom.** Reaching the Trench floor — the reveal (leave the *what* as a design hook: a light? a leviathan's eye? a door?).
- **Return.** On death/surface — a brief, dignified "you carried this back" beat over the loot summary.

---

## PART 4 — Loading system

- **Async everything:** asset atlases stream by biome; procedural stratum pre-generates on a worker so gameplay never hitches.
- **Themed loader:** a descending depth-gauge fills as load progresses; rotating **codex tips** and species art fill the wait; ambient audio bed. The loader *is* worldbuilding, not a spinner.
- **States:** BOOT (core + shell) → HUB (station assets) → DIVE_PREGEN (worldgen + biome atlas) → hand off. Each shows the loader with an accurate progress source (no fake bars).
- **Budget:** first meaningful paint < 2s on mid hardware; biome transitions masked by the loader + a cutscene threshold card.

---

## PART 5 — Subsystems catalog (drafts)

Each entry: **purpose · responsibilities · key data · interface · acceptance.** These are the leaf contracts the agent tree implements against.

1. **Core / State Machine** — owns app states (Boot→Menu→Hub→Dive→Cutscene→GameOver). *Data:* current state, transition guards. *Interface:* `changeState()`, event bus. *Accept:* no soft-locks; every state has an exit.
2. **Renderer** — pixel pipeline: atlas draw, integer scale, camera, layered additive light/bloom, fog. *Accept:* palette intact under fog; bullets readable in the abyss; stable 60fps with 300+ projectiles.
3. **Input** — keyboard+mouse, gamepad, touch; remappable. *Accept:* identical feel across devices; twin-stick on gamepad/touch.
4. **Entity system (ECS-lite)** — components (transform, sprite, collider, health, brain, emitter). *Accept:* 500+ entities without GC spikes.
5. **Movement/Physics** — drift with momentum + drag; currents as force fields; wall/occluder collision. *Accept:* currents feel intentional, not random.
6. **Combat / Projectiles** — RotMG-style pattern system: emitters spec'd by data (count, spread, speed, arc, aim, burst, spiral). Player weapons + enemy patterns share one system. *Accept:* new pattern authored in data only; every pattern telegraphed.
7. **Enemy AI** — archetypes: Spitter(pattern), Lurker(ambush), Roamer(chase), Slug(poison trail), Boss(phased). Behavior trees or simple FSM. *Accept:* each archetype legible by behavior alone.
8. **Worldgen** — assembles strata from chunk templates + spawn tables per biome; seeded; difficulty by depthTier. *Accept:* always traversable; no unfair spawns at entry.
9. **Loot & Inventory** — gear (in-run stat mods), consumables, samples (catalog currency). Rarity tiers, drop tables. *Accept:* clear pickups; no inventory soft-locks.
10. **Progression** — in-run ability picks (roguelite) + meta upgrades (beam, hull, thrust, light, unlocks). *Accept:* meaningful build divergence across runs.
11. **Codex / Collection** — species DB, catalog-on-scan, completion %. *Accept:* completion % is the headline social stat; entries persist through death.
12. **Companion** — follow with smoothing, a light source, one utility (auto-scan nearby or reveal loot), full customization (coat/collar/accessory). *Accept:* charming, never in the way, never blocks bullets unfairly.
13. **Cutscene sequencer** — Part 3. *Accept:* data-driven, skippable, no lock >1s.
14. **Loading** — Part 4. *Accept:* accurate progress; transitions hidden.
15. **UI/HUD** — health, depth gauge, minimap, ability bar, prompts, contextual tooltips (first-encounter teaching). *Accept:* every new mechanic is taught once, cleanly.
16. **Audio** — depth-layered music stems (add layers as you descend), positional SFX, ambience. *Accept:* music escalates with danger; mixable; mute-safe.
17. **Persistence / Auth** — Supabase guest-first sessions + cloud save (codex, meta, dog, best depth). *Accept:* progress survives refresh; links to a real account later without loss.
18. **Leaderboards** — deepest-dive + score via a server-validated edge function; RLS anti-cheat. *Accept:* client scores never trusted; "your rank" visible.
19. **Art pipeline** — atlas + frame-map + palette conventions; import tooling. *Accept:* an artist/agent adds a sprite by dropping a sheet + JSON.
20. **Accessibility** — reduced-motion, colorblind-safe telegraph shapes (not just color), remap, screen-shake toggle. *Accept:* playable with motion off and with common CVD palettes.
21. **Telemetry (optional)** — anonymized depth/death heatmaps to tune difficulty. *Accept:* opt-in, privacy-safe.

---

## PART 6 — The Agent Tree (recursive build engine)

The build is produced by a **tree of agents** that recursively critiques and refines every node until it clears a quality bar. The tree both **decomposes** (top-down) and **improves** (bottom-up loops + global playtest feedback re-descending).

### 6.1 Roles

- **Orchestrator (root).** Owns the master plan, the **rubric**, the shared **Design Bible** (this doc) and repo. Decomposes work into branches, schedules passes, resolves cross-branch conflicts, gates releases. Never writes feature code directly.
- **Branch agents (domains):** `render`, `gameplay` (movement+combat+AI), `worldgen`, `content` (art-spec+levels+cutscenes), `systems` (persistence+leaderboards), `ux` (HUD+loading+tooltips), `audio`, `qa`. Each owns a subtree and its slice of the rubric.
- **Worker (leaf) agents.** Implement one subsystem/module against its contract (Part 5).
- **Critic agents.** Score a node's output 0–5 on each rubric dimension, cite specific evidence, and emit a concrete defect list. Critics never rewrite — they judge.
- **Refiner agents.** Take (output + critic defects) and produce a targeted improvement. No scope creep — fix the cited defects only.
- **Integrator.** Merges children upward; runs cross-cutting critiques (e.g., "does the render light layer hurt bullet readability?"); owns interface contracts between modules.
- **Playtester/Eval.** Runs the build (headless smoke + scripted synthetic playthroughs + perf capture), produces a prioritized findings list that the Orchestrator injects as **new leaf tasks** — this is the loop that re-descends the tree.

### 6.2 The recursive improvement loop (per node)

```
NODE(goal, inputs, contract, rubric):
  output   = BUILD(goal, inputs, contract)
  loop up to MAX_ITERS:
      scores, defects = CRITIQUE(output, rubric)      # 0–5 per dimension
      if min(scores) >= BAR and no BLOCKER defects:
          break
      output = REFINE(output, defects)                # targeted only
  PROMOTE(output)        # write artifact, update shared state, bump changelog
  return report(scores, artifact)                     # to parent
```

Parents aggregate child reports, run an **INTEGRATION critique**, and may **spawn new children** (the tree deepens/widens) when integration reveals gaps. Recursion terminates on: all nodes ≥ BAR, or budget/iteration cap, or Orchestrator stop.

### 6.3 Global loop (tree-wide recursion)

```
until quality_bar_global or budget_exhausted:
    full_pass()                     # descend, build+refine every node
    findings = PLAYTEST(build)      # perf, readability, feel, bugs, fun
    tasks = PRIORITIZE(findings)    # blockers > feel > polish
    inject(tasks) into tree         # becomes new leaves -> re-descend
```

Each global pass should make the build measurably better on the rubric; log the delta so improvement is visible and stops when it plateaus.

### 6.4 Rubric (0–5 each; BAR = 4; any dimension <3 = BLOCKER)

1. **Correctness** — does it meet the subsystem contract & acceptance criteria?
2. **Readability/feel** — bullets legible, controls responsive, danger telegraphed?
3. **Aesthetic cohesion** — palette, pixel grid, lighting consistent with the bible?
4. **Performance** — hits frame budget under stress (300+ projectiles, 500+ entities)?
5. **Robustness** — no soft-locks, handles empty/error states, save-safe?
6. **Integration** — respects interface contracts; doesn't regress siblings?

Critics must cite concrete evidence per score (a file/line, a measured fps, a repro). No vibes-only scores.

### 6.5 Shared state & conventions

- **Design Bible** (this doc) = source of truth; agents propose edits via the Orchestrator, never fork it silently.
- **Module contracts** live beside code (`/contracts/<subsystem>.md`) — the interface a Worker builds to and a Critic checks against.
- **Changelog** — every PROMOTE appends what/why + rubric scores, so the tree's progress is auditable.
- **Artifacts** — code, spritesheets+JSON, cutscene/level data, and eval reports, all versioned in the repo.

---

## PART 7 — Master kickoff prompt (paste to start)

> You are the **Orchestrator** for building *FATHOM* (see `fathom-build-bible.md`). Your job is to produce a shippable, beautiful pixel roguelite bullet-diver by running a recursive agent tree.
>
> **Do:**
> 1. Load the bible. Restate the pillars and the rubric in your own words; confirm the target stack (Vite + TypeScript + a pixel-friendly renderer such as PixiJS or raw canvas; Supabase backend; Vercel host).
> 2. Produce the **plan tree**: branches (`render, gameplay, worldgen, content, systems, ux, audio, qa`) → leaves (the Part-5 subsystems), each with a one-line contract and its rubric weight.
> 3. Establish shared state: repo scaffold, `/contracts/*`, `CHANGELOG.md`, the Design Bible as source of truth.
> 4. Execute the **per-node loop** (BUILD→CRITIQUE→REFINE→PROMOTE) for each leaf, using dedicated Critic and Refiner passes. Spawn subagents per role; do not let a Worker grade its own work.
> 5. After each full pass, run the **Playtester/Eval** (headless smoke tests + scripted synthetic playthrough + perf capture), prioritize findings, and inject them as new leaves. Repeat until the global rubric bar holds or budget is hit.
> 6. Gate releases: nothing PROMOTES below BAR=4; any dimension <3 is a blocker.
>
> **Order of construction (vertical slice first):** Core/State → Renderer(pixel+light) → Input → Movement → Projectiles/Combat → one Enemy(Spitter) → one Stratum(Twilight Drift) → HUD → Loading → Cutscene(cold open) → Persistence(guest save) → Leaderboard. *Make one stratum feel incredible before widening to seven.*
>
> **Report** after each pass: rubric deltas, what promoted, what's blocked, next tasks. Keep the vertical slice runnable at all times.

---

## PART 8 — Plugging in your example folder

This bible is written so **your example agent-tree drops in cleanly**. If your folder defines role prompts, a rubric, a critique/refine format, or an orchestration runner, share it and I'll:
- **Map roles** (yours ↔ Orchestrator/Branch/Worker/Critic/Refiner/Integrator/Playtester) and keep your naming.
- **Adopt your rubric + scoring format** if it's stronger, or merge it with Part 6.4.
- **Match your runner** (file layout, task schema, how subagents are invoked) so Part 7's kickoff speaks your conventions.
- **Reconcile stopping criteria & budgets** to whatever your example uses.

Send the folder and I'll rewrite Parts 6–7 to be a drop-in for your existing pattern rather than a parallel one.
