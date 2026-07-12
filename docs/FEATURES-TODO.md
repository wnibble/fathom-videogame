# FATHOM — Features TODO (gameplay roadmap)

Prioritized gameplay work. The meta loop (surface station, pearls, upgrades, shield,
badges) landed in pass 5; the biggest remaining gap is that "depth" is still a number,
not a place.

## P0 — make depth REAL (owner's top note: "bounding box, no real depth")
- [ ] **Strata transitions.** At depth thresholds (~150–250 m) fade out, regenerate the
      arena as the NEXT stratum (new palette tint, prop/fauna set, fresh interactables),
      recenter the player, show a threshold title card ("KELP FOREST"). Turns the fixed
      box into a descent through distinct layers. *Plan:* `dive.ts` tracks `nextStrata`;
      a `transitionStratum()` tears down arena/enemies/bullets, rebuilds via a
      `buildStratum(index, seed)` (start from `biome_twilight` + palette shift), keeps
      `run`/player. Pairs with GRAPHICS-TODO P2 per-stratum palettes.
- [ ] **Bigger / scrolling field.** Enlarge arena bounds and bias the camera so descent
      feels vertical; consider an endless-down variant per stratum instead of hard walls.
- [ ] **Voluntary surface-to-bank-100%.** A depth-gated "ascend" option (reach a
      checkpoint → choose to surface) that banks 100% of samples vs 40% on death — the
      push-your-luck decision (`bankDive` already supports `surfaced:true`). Owner ask:
      "if you survive and get back up you keep more coins."

## P1 — variety & identity
- [ ] **More enemy archetypes** — Lurker (kelp ambush), Slug (poison trail), Roamer
      (chaser). Each a distinct verb like the Darter added.
- [ ] **Mini-boss (the Wreck) + Leviathan (the Trench)** — telegraphed phased fights
      (bible Part 2/3), each with a reveal cutscene.
- [ ] **The Bichon companion** — a following light source + one utility (auto-scan / loot
      reveal), fully customizable (coat/collar) — bible Part 5 §12.
- [ ] **Codex / collection** — scan fauna → species entries → completion % (the headline
      social stat). Research probes already emit a scan; wire it to a species DB.

## P2 — economy & depth of build
- [ ] **More meta upgrades** — starting weapon variants, a second dash charge, revive.
- [ ] **In-run relics/artifacts** — powerful run-defining items from relics (not just a
      level-up), e.g. "bullets bounce", "orbit shield".
- [ ] **Daily seed / challenge run** with a leaderboard (bible Part 5 §18, Supabase).

## P3 — platform / systems
- [ ] **Supabase cloud save + server-validated leaderboard** (deepest dive + score).
- [ ] **Gamepad + touch twin-stick** (input is already remap-shaped).
- [ ] **Render interpolation** for high-refresh displays (currently raw fixed-step).
- [ ] **Real depth-gauge loading between strata** (async biome atlas streaming).

## Done (pass 5)
- [x] Surface Station hub: pearls banking (40% death / 100% surface), 10-upgrade store,
      13 badges, shield mechanic + scaling HP/shield HUD bars, build readout.
- [x] Fixed HOW TO PLAY closing instantly (input edge bleed).
- [x] Game-over now requires pressing **C** (no accidental dismiss) and returns to the
      station with your banked pearls shown.
