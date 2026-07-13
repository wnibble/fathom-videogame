# FATHOM — Graphics TODO (make it beautiful)

The prioritized list of graphical work to raise FATHOM from "clean and readable" to
"beautiful." Current actors + some objects are procedural Graphics placeholders; the
biggest wins are real animated pixel-art for the things you look at most.

## P0 — the biggest visual ceiling
- [ ] **Animated diver sprite** (24×24, 2–4 frame swim cycle + idle) with a real
      headlamp cone. Replaces the vector wedge in `src/render/actors.ts`.
- [ ] **Spitter sprite** (32×32) — a bioluminescent polyp with a telegraph "charge"
      frame. Replaces the procedural starburst.
- [ ] **Darter sprite** (32×32) — a sleek eel/arrow predator with a lunge stretch
      frame. Replaces the procedural dart.
- [ ] **Elite variants** — recolored/enlarged elite frames for both enemies.

## P1 — polish existing effects
- [x] **Impact VFX edges** — the extracted `impact_*` frames clipped flat at the bbox
      edge. Replaced the frequent hit impacts with a **procedural expanding ring + sparks**
      (edge-free, additive) in `dive.ts` `spawnHitFx`. (Owner-reported; fixed.)
- [ ] **Bullet trails** — short additive trail/streak behind fast bullets for motion.
- [ ] **Muzzle flash** on the player weapon; **hit spark** distinct from impact.
- [ ] **Death dissolve** — the player/enemy fade into particles instead of vanishing.

## P2 — world & atmosphere
- [ ] **Per-stratum palettes** — shift the fog/bg tint + accent per depth layer (Shelf →
      Kelp → Twilight → Wreck → Vents → Abyss → Trench) so descent is visibly a journey.
      Pairs with the strata-transition feature (see FEATURES-TODO).
- [ ] **Parallax caustics / god-rays** near the surface; darker, sparser deep.
- [ ] **Animated kelp / current sway** — gentle vertex or sprite-swap motion on props.
- [ ] **Screen-edge pressure vignette** that tightens with depth.

## P3 — UI / juice
- [ ] **Upgrade card icons** — a real glyph/sprite per in-run + meta upgrade (offense/
      defense/utility iconography) instead of text-only.
- [ ] **Badge art** — distinct icon per badge (currently mono glyphs).
- [ ] **Station backdrop** — a painted surface-station scene behind the store panel
      (the one place a static illustration pays off).
- [ ] **Damage numbers / combo popups** (optional, toggle) for feedback.
- [ ] **Loading screen species art** — rotate real fauna portraits on the depth-gauge loader.

## Done (pass 5)
- [x] Fixed `suspended_coral_chunk` + dark props eaten on white sheets (extraction).
- [x] Replaced the artifacted `bubble_vent` sprite with a clean procedural vent.
- [x] Culled orb-like plankton/`glow_orb` decoration that read as pickups.
- [x] Reduced player headlamp over-glow + slightly calmer bloom.
- [x] Interactable affordance rings (amber=shoot / aqua=touch / mint=relic).
