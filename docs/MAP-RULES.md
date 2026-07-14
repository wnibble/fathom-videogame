# FATHOM — MAP-RULES.md
Canonical map-generation and dressing contract. Every rule is a testable predicate. Hard failures (marked ⛔) regenerate or repair the map; soft failures (⚠) trigger a repair pass. Key files: `src/content/cavegen.ts`, `src/content/strata.ts`, `src/game/dive.ts`, `src/game/hub.ts`, `src/systems/boss.ts`. Viewport = 640×360 world px at zoom 2.

## 1. LAYOUT

**L1 — Room role grammar.** ⛔ After generation, tag every room with exactly one role: START (id 0), PORTAL (BFS-farthest, hops max), SANCTUM (exactly 1 room, degree ≤ 2, hops in [2, hopsMax−1], holds all ascend vents), ALCOVE (every degree==1 room with coreR ≤ 260 that isn't PORTAL), ARENA (everything else with coreR ≥ 330). A map with < 3 ARENA rooms or 0 ALCOVE rooms re-rolls with seed+1. (RoomInfo already carries coreR/degree/hops — tagging pass only.)

**L2 — Portal journey length.** ⛔ Portal room must have hops ≥ 3 AND summed tunnel centerline length from start in [2400, 5600] px. If hops < 3 on a 7+ room map, re-pick BFS excluding hops < 3 rooms; if none qualifies, re-roll. The descend portal is a trek, never one screen away.

**L3 — Guaranteed shortcut loop.** ⚠ At least 1 loop edge must connect two main-path rooms with |hops(a)−hops(b)| ≥ 2. If none, force-carve one between the qualifying pair with smallest Euclidean distance < 1400 px.

**L4 — Dead-end reward occupancy.** ⛔ Every degree==1 room contains exactly one reward interactable (relic / loot_pod / mineral_crystal) within 0.4·coreR of its center; maps must have 2–3 dead-ends (if MST yields < 2, attach a pocket room r 180–250 via a 110-radius capsule to the highest-coreR room). Currently only deadEnds[0] gets the relic (cavegen.ts:453) — an empty dead-end is a broken promise.

**L5 — Start room is a reading room.** ⛔ No enemy spawns, no obstacle pillars, at most 1 interactable ≥ 300 px from playerStart; nothing interactable inside the 640×220 px title-card band centered on spawn. (Fixes s0-a's chest+crystal+title+diver pileup.)

**L6 — Landmark room per stratum.** ⚠ The largest non-start, non-portal room is tagged LANDMARK and receives exactly 1 stratum-signature set-piece at ≥ 2.5× normal prop scale (s0 whale-fall/anchor, s1 kelp-titan canopy, s2 ship bow section, s3 super-smoker crater, floor: cradle centerpiece), with the stratum's lighting signature aimed at it. Zero landmark rooms = generation failure.

## 2. BOUNDARY

**B1 — No bald arcs.** ⚠ March step ≤ 44·(1.30 − rockiness·0.3) (~53 px at rockiness 0.22, down from ~74); relax seam cull from `dOthers < -8` to `dOthers < -24` (cavegen.ts:364); after marching, inject a filler rock wherever consecutive-rock gap exceeds 1.4·rockR. TEST: sampling the carve boundary at 16 px steps, every sample has a wallRock center within 90 px and no uncovered run exceeds 130 px.

**B2 — Kill the compass circle.** ⚠ Perturb every carve shape's emit radius with seeded low-frequency noise r' = r + sin(a·k + phase)·amp (k = 3–7 per room, amp = clamp(0.08·r, 16, 40) px); draw the buildDarkness erase polygons (dive.ts:341+) with the SAME noise. TEST: over 64 angular samples per room, std-dev of visible edge radius ≥ 12 px AND |rock-line radius − darkness-edge radius| ≤ 20 px everywhere.

**B3 — Rock is wall, flora is accent.** ⛔ Every stratum's `caves` pool must be ≥ 75% solid-mass sprites (reef chunk, root mass, crate, chimney). Wispy/transparent sprites (fan_coral, tube_coral) are banned from `caves` (strata.ts:48 currently violates) and spawn only via the growth pass ON a wall rock, scale ≤ 0.9× the host, never brighter than it.

**B4 — Silhouette depth: ≥ 2 layers.** ⚠ Raise second wall-rock layer chance (cavegen.ts:370) from 0.2+0.25·rockiness to 0.55+0.3·rockiness; add a third no-growth silhouette layer at depth 2.2–3.5·rockR, scale 1.3–1.8×, rendered under the darkness sprite. TEST: the band 66–190 px beyond the carve edge contains ≥ 0.8 rock sprites per 100 px of boundary arc.

**B5 — Tunnel mouths are doorways.** ⚠ At every circle-capsule intersection compute the two mouth corner points; each corner must have a wallRock with rockR ≥ 46 px (scale ≥ 1.65) within 120 px, injected if the march left none.

**B6 — Wall repetition cap.** ⚠ No wallRock uses the same sprite as its immediate predecessor along an arc (one rng.pick reroll on repeat); manufactured wall props (Wreck/Vents sheets) get flipX at p=0.5 and ±0.08 rad rotation jitter; widen rockR range from (34,54) to (30,64). TEST: any 640×360 window shows ≤ 2 wall props sharing identical (sprite, flip) within ±5% scale.

## 3. DRESSING

**D1 — Density split 60/30, not 95/5.** ⚠ Boundary bands (within 1.5·rockR of edge) target 60–70% dressed coverage; interiors target 25–35% via a new 8–24 px Poisson litter tier (pebbles, shells, bone bits, rivets, dim sprigs — glow:false) at 1 item per 120 px cell. TEST: no carved-water point with sd ≤ −250 (64 px grid) is farther than 250 px from the nearest prop or interactable.

**D2 — Per-screen minimum.** ⚠ Every 640×360 window whose center lies in carved water (sampled on a 320 px grid) contains ≥ 6 props and ≥ 1 light source. No screen the camera can show is a featureless void.

**D3 — Per-screen ceiling.** ⚠ Same windows: ≤ 40 total props, ≤ 6 glow-emissive props, ≤ 2 instances of the same sprite at identical flip within ±5% scale — a third triggers variation reroll (mirror flip, scale 0.85–1.15, hue jitter ±8°).

**D4 — Breathing room.** ⛔ Inside every room, the inner disc of radius 0.45·roomR may contain only litter-tier props (< 32 px) and interactables — no hero decor, no glow clusters. Bullet-dodging lanes stay open.

**D5 — Interactable spacing & affordance.** ⛔ All interactables pairwise ≥ 150 px apart (retire the 130 px takeLoot fallback in strata.ts:167), each ≥ 260 px from the descend portal, each satisfies inside(pos, 70); rings anchor to the prop's visual center; no decor prop within 90 px of an interactable anchor (decor may not mimic affordance); portal sits within 0.25·r of its room's largest circle center with a 260 px clearance disc.

**D6 — DESCEND label is anchored.** ⛔ The DESCEND label renders only when a portal sprite instance exists within 40 px of the label anchor; build-time assert that `descend_portal` owns a placed sprite in all strata (kills the floating labels in s2-a/s2-b/s3-a/s3-b). Use the readable swirl portal from s1-b in every stratum.

**D7 — Start room is the stratum's poster.** ⚠ Each start room contains ≥ 12 interior props of which ≥ 3 are stratum-signature sprites within 320 px of playerStart (kelp curtains in s1, red-glowing vent chimneys in s3), keeping the 190 px spawn clear zone. Start rooms may never be the emptiest screen in their stratum.

**D8 — South-shelf breakup.** ⚠ Wherever a dense edge band runs > 600 px, stagger wall-prop baselines radially 30–60 px and pull 1–2 mid-scale (32–64 px) props 100–200 px into the interior per 600 px of band.

**D9 — Boss arena gets a full budget, not a discount.** ⛔ The isFloor branch must pass B1–B6 and D1–D3 unchanged, PLUS: one centerpiece prop scale ≥ 3.0 within 400 px of the arena centroid, ≥ 5 wallRocks inside the spawn-framed 640×360 window, interior decor multiplier ≥ 1.5× standard, and silt/pebble floor decals establishing a ground plane. The climax room may never validate emptier than a regular stratum.

**D10 — Hub reads inhabited.** ⚠ Deck (hub.ts): 2–3 plate tile variants with shifted rivets + rust/algae decals at 8–12% coverage; a functional prop cluster (crates, rope coils, lamps, signage) so no hub viewport is more than ~55% bare tile; all three kiosks + depth monument within one 640×360 screen of spawn; THE DESCENT anchored to a physical moon-pool prop with glow ring and bubbles, not a floating label.

## 4. COLOR

**C1 — Three reserved hues, everywhere.** ⛔ Coral/red 0xff5a4a (±15° hue) = threat ONLY, banned from decor/growth tints. Exactly one amber hex = loot/interact ONLY (rings and lanterns share it). Aqua/cyan pulse = portal/UI ONLY. Audit every sprite in each stratum's `glow` list against this contract; retint violators (emergency lamps, warm sponges) into the stratum's identity hue.

**C2 — Ring language lock.** ⛔ Gold dashed = interact/loot; red pulse = enemy aggro (shown only when aggroed); cyan pulse = portal. An enemy may never inherit the gold ring (s3-b turret bug). Enemy rings suppressed until activation.

**C3 — Per-stratum palette lock.** ⚠ Replace the universal 7-tint TINTS list (dive.ts:293) with per-stratum families: s0 cool cyans + max 1 warm accent per viewport, s1 emerald greens (bg 0x0a241e → ~0x0c3322, fan_coral removed from its decor list), s2 rust/bronze, s3 ember red-orange (bg 0x1e0f0a → ~0x2e0c06; barrels/valves/pipes removed; vent glows recolored red), floor violets. TEST: each stratum's decor list is ≥ 60% sprites unique to it.

**C4 — Darkness carries the hue.** ⛔ Replace the flat ×0.3 multiply in buildDarkness with hue-preserving darkening (HSL: hold hue, saturation ×1.5, lightness ~0.06; beyond-wall luminance = max(0.02, 0.35 × bg luminance)). TEST: darkness tints of any two strata differ by ≥ 16/255 in at least one RGB channel (current Wreck ~0x070604 vs Vents ~0x090503 delta is 2/255 — indistinguishable).

**C5 — Glow budget: nothing static outshines the actor.** ⛔ Static glow props: ≤ 6 per viewport, ≥ 180 px spacing, decor emissive brightness/saturation cut ~35%, every static emissive capped at ≤ 65% of the player lantern's peak luminance. Enforce at scatter by rejecting over-budget glow placements.

**C6 — No pure-black quadrant.** ⚠ Bias glow-prop and litter scatter so every 320×180 quadrant of any in-carve viewport contains ≥ 1 light source or lit prop; add a low-alpha (~0.06) radial floor gradient in the stratum hue per room. TEST: no quadrant is > 90% below luminance 0.05.

## 5. COMBAT-SPACE

**K1 — Spawn band, not nearest-point.** ⛔ spawnEnemy selects from the annulus 420–650 px from the player (just past the 367 px half-viewport diagonal), falling back to nearest > 650 px only when the annulus is empty. Replaces the unbounded nearest > 420 rule (dive.ts:635).

**K2 — Spawn standoff and dodge disc.** ⛔ Every spawnPoint satisfies inside(x, y, 140) and is ≥ obstacle.radius + 90 px from every cover pillar; min distance from playerStart ≥ 600 px; points failing 20 resamples are dropped; < 6 surviving points fails the map.

**K3 — Sanctum rest bubbles.** ⛔ No spawn point within 450 px of playerStart, any ascend vent, the descend portal, or the relic (pass placedAnchors with minGap 450 into the sampling loop at cavegen.ts:474 — currently avoid=[]). dive.ts suppresses the wave timer while the player is within 400 px of a vent or portal.

**K4 — Shooter line-of-sight.** ⛔ A spitter may spawn only where the straight segment to the player, sampled every 64 px through cavern.bulletBlocked, is ≥ 80% clear; on failure re-roll the fauna pick as darter. Ranged threats never open fire from behind unseen rock.

**K5 — Space-gated pacing.** ⚠ Enemy caps keyed to the player's SDF-resolved location: full maxAlive (2 + tier·1.25, cap 10) in ARENA rooms; cap 2 in tunnels and ALCOVEs; cap 0 in START and SANCTUM. Along the start→portal path, no more than 2 consecutive ARENA rooms without an ALCOVE/SANCTUM adjacent — violations demote the smallest ARENA in the run.

**K6 — Cover-vs-dodge contract.** ⚠ Every ARENA room with coreR ≥ 380 gets 2–3 collision pillars (raise cavegen.ts:408 from 0–1) at 0.35–0.55·coreR from center, ≥ 400 px apart; the central 220 px disc stays permanently clear of pillars, glow props, and interactables.

**K7 — Tunnels are transit.** ⛔ Tunnel radius ≥ 110 (existing); no spawn point in capsule-only space unless fauna is darter; no spawn point or interactable within 200 px of a tunnel mouth.

**K8 — Occluder budget.** ⚠ Foreground occluders (kelp curtains rendering over the player) only in ARENA rooms, ≤ 20% of room area, never within 250 px of a spawn point, interactable, or tunnel mouth; forbidden in tunnels. Delivers Kelp Forest's "occlusion and ambush" without hiding a bullet source.

**K9 — Boss flow staging.** ⛔ On the isFloor map: player spawns at the south rim of the largest room at 0.8·r facing the centerpiece at room center; the 900–1400 px approach segment is obstacle-free; boss HP bar hidden until the player is within 700 px of the centerpiece (wake beat plays from it); add-spawn points ring the fight room at 0.75·r every 45°; loot interactables live only in antechamber rooms. The final boss is never introduced as an off-screen arrow.

## 6. VALIDATION

**V1 — Connectivity.** ⛔ BFS over tunnel adjacency from room 0 gives every room hops ≥ 0, AND a 32 px-grid flood fill from playerStart (cells where inside(x,y,20)) reaches every anchor — portal, all vents, relic, all lootSpots, all spawnPoints.

**V2 — Critical path width.** ⛔ Every tunnel capsule r ≥ 110; every flood-fill cell on the start→portal path satisfies sd(x,y) ≤ −60 (60 px clear half-width — no pinch below ~4× player radius).

**V3 — Resupply pulls, never pops.** ⚠ The every-200 m resupply (dive.ts:584–587) places items only at lootSpots > 800 px from the player and in rooms the player is not inside, preferring rooms across a loop edge — rewards recruit the shortcut loops as return journeys.

**V4 — Determinism and retry budget.** ⛔ generateCavern(seed) is byte-deterministic (hash of shapes+wallRocks+anchors identical across two runs); the full V/⛔ suite completes in < 8 ms per map; on hard failure retry with a derived seed at most 4 times, then apply repair passes (B1 gap filler, B5 gatepost inject, D1 litter fill). A failing map is repaired or regenerated, never shipped.

