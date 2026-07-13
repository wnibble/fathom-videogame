# 01 — Loot, Samples, Upgrade Cores, and Salvage

## Source image
- File: `01_loot_samples_upgrades.png`
- Dimensions: `1254×1254`
- Background: flat baked `#ff00ff`
- Layout: custom 9/7/9/9 item rows

## Purpose
Collectibles and progression props used to make dives feel materially rewarding and to support bank, codex, upgrade, and salvage feedback.

## Gameplay usage
- **`sample_vial_small`** — common biological sample pickup
- **`specimen_canister_medium`** — uncommon sample or codex specimen
- **`living_specimen_tank`** — rare living specimen; use warm illumination for risky/valuable finds
- **`meta_pearl`** — banked permanent currency
- **`upgrade_core`** — high-value upgrade currency or boss reward
- **`energy_shard`** — ability unlock or temporary power material
- **`healing_orb`** — repair or healing pickup
- **`power_cell`** — beam/thrust/light energy refill
- **`rune_fragment`** — ancient progression key or trench mystery collectible
- **`mineral_cluster`** — thermal vent mineral sample node
- **`salvage_crate`** — wreck salvage container
- **`leviathan_scale`** — boss material or deepest-dive trophy

## Asset order and crop locations
Coordinates use a top-left origin. Bounding boxes are `[x0, y0, x1, y1]` with `x1/y1` exclusive.

1. `sample_vial_small_f1` — bbox `[35, 90, 125, 315]`, pivot `bottom-center`
2. `sample_vial_small_f2` — bbox `[125, 90, 215, 315]`, pivot `bottom-center`
3. `sample_vial_small_f3` — bbox `[215, 90, 310, 315]`, pivot `bottom-center`
4. `specimen_canister_medium_f1` — bbox `[350, 80, 475, 325]`, pivot `bottom-center`
5. `specimen_canister_medium_f2` — bbox `[465, 80, 590, 325]`, pivot `bottom-center`
6. `specimen_canister_medium_f3` — bbox `[580, 80, 710, 325]`, pivot `bottom-center`
7. `living_specimen_tank_f1` — bbox `[735, 55, 890, 330]`, pivot `bottom-center`
8. `living_specimen_tank_f2` — bbox `[875, 55, 1035, 330]`, pivot `bottom-center`
9. `living_specimen_tank_f3` — bbox `[1015, 55, 1200, 330]`, pivot `bottom-center`
10. `meta_pearl` — bbox `[45, 350, 180, 520]`, pivot `center`
11. `upgrade_core_f1` — bbox `[240, 335, 390, 535]`, pivot `center`
12. `upgrade_core_f2` — bbox `[385, 335, 545, 535]`, pivot `center`
13. `upgrade_core_f3` — bbox `[535, 335, 710, 535]`, pivot `center`
14. `energy_shard_f1` — bbox `[740, 325, 885, 555]`, pivot `center`
15. `energy_shard_f2` — bbox `[865, 325, 1025, 555]`, pivot `center`
16. `energy_shard_f3` — bbox `[1000, 325, 1195, 555]`, pivot `center`
17. `healing_orb_f1` — bbox `[35, 590, 180, 820]`, pivot `center`
18. `healing_orb_f2` — bbox `[155, 580, 315, 820]`, pivot `center`
19. `healing_orb_f3` — bbox `[290, 580, 455, 820]`, pivot `center`
20. `power_cell_f1` — bbox `[450, 565, 570, 825]`, pivot `bottom-center`
21. `power_cell_f2` — bbox `[555, 560, 685, 825]`, pivot `bottom-center`
22. `power_cell_f3` — bbox `[670, 555, 815, 825]`, pivot `bottom-center`
23. `rune_fragment_f1` — bbox `[800, 555, 925, 835]`, pivot `bottom-center`
24. `rune_fragment_f2` — bbox `[910, 550, 1055, 835]`, pivot `bottom-center`
25. `rune_fragment_f3` — bbox `[1035, 545, 1205, 835]`, pivot `bottom-center`
26. `mineral_cluster_f1` — bbox `[35, 890, 190, 1170]`, pivot `center`
27. `mineral_cluster_f2` — bbox `[165, 875, 330, 1175]`, pivot `center`
28. `mineral_cluster_f3` — bbox `[300, 870, 475, 1175]`, pivot `center`
29. `salvage_crate_f1` — bbox `[430, 880, 570, 1170]`, pivot `bottom-center`
30. `salvage_crate_f2` — bbox `[555, 875, 705, 1170]`, pivot `bottom-center`
31. `salvage_crate_f3` — bbox `[690, 870, 845, 1170]`, pivot `bottom-center`
32. `leviathan_scale_f1` — bbox `[820, 850, 955, 1190]`, pivot `bottom-center`
33. `leviathan_scale_f2` — bbox `[940, 845, 1080, 1190]`, pivot `bottom-center`
34. `leviathan_scale_f3` — bbox `[1065, 840, 1210, 1190]`, pivot `bottom-center`

## Extraction rules
1. Crop using the generous bounding box.
2. Remove pixels near `#ff00ff`, preferably with a border-connected flood fill.
3. Convert the result to binary alpha; do not feather pixel edges.
4. Trim to the visible alpha bounds.
5. Add 8 transparent pixels around the trimmed sprite.
6. Group `_f1`, `_f2`, and later frames by their shared prefix.
7. Compute one union canvas for each animation group so frames do not jitter.
8. Downscale with nearest-neighbor only.
9. Add 2 pixels of atlas extrusion.

## Suggested logical sizes
- Tiny pickups and indicators: `16×16`
- Normal pickups and small props: `24×24` or `32×32`
- Standard environmental props: `48×48`
- Large machinery/set pieces: `64×64+`
- Keep major doors, portals, and large landmarks larger when silhouette readability requires it.

## Pivot guidance
- Floating collectibles, circular machinery, eyes, mines, and portals: `center`
- Grounded flora, containers, consoles, machinery, hazards, and doors: `bottom-center`

## Animation notes
Names sharing a base and ending in `_f1`, `_f2`, etc. form an ordered animation. Names such as `off`, `on`, `closed`, `open`, `idle`, `warning`, or `attack` are explicit gameplay states and should not automatically loop unless the implementation calls for it.
