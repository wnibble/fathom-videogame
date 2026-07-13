# 03 — Hazards, Traps, Spawn Nodes, and Ancient Technology

## Source image
- File: `03_hazards_and_ancient_tech.png`
- Dimensions: `1254×1254`
- Background: flat baked `#ff00ff`
- Layout: variable rows of 4–7 assets

## Purpose
Readable environmental danger, timed hazards, enemy nests, scanning devices, and trench mystery machinery.

## Gameplay usage
- **`thermal_vent`** — six-state environmental eruption cycle, represented here by four key frames
- **`poison_seep`** — persistent poison ground hazard
- **`electric_anemone`** — three-frame electricity pulse hazard
- **`proximity_mine`** — two-frame armed pulse; radial projectile source
- **`spike_mound`** — buried trap with readable open/attack progression
- **`scan_beacon`** — friendly objective, current marker, or checkpoint scanner
- **`wreck_generator`** — repairable wreck device or temporary power objective
- **`spawn_egg`** — enemy nest with pulsating warning
- **`ancient_eye`** — Trench gate, boss lock, or lore machine with visible charge
- **`turret`** — wreck/ancient defense with mandatory idle, wind-up, and fire frames

## Asset order and crop locations
Coordinates use a top-left origin. Bounding boxes are `[x0, y0, x1, y1]` with `x1/y1` exclusive.

1. `thermal_vent_dormant` — bbox `[35, 70, 250, 285]`, pivot `bottom-center`
2. `thermal_vent_warning` — bbox `[250, 55, 475, 290]`, pivot `bottom-center`
3. `thermal_vent_erupt_f1` — bbox `[470, 25, 710, 300]`, pivot `bottom-center`
4. `thermal_vent_erupt_f2` — bbox `[700, 10, 965, 310]`, pivot `bottom-center`
5. `poison_seep` — bbox `[25, 310, 240, 525]`, pivot `bottom-center`
6. `electric_anemone_f1` — bbox `[235, 305, 445, 530]`, pivot `bottom-center`
7. `electric_anemone_f2` — bbox `[430, 300, 650, 535]`, pivot `bottom-center`
8. `electric_anemone_f3` — bbox `[635, 300, 850, 535]`, pivot `bottom-center`
9. `proximity_mine_f1` — bbox `[835, 300, 1040, 535]`, pivot `center`
10. `proximity_mine_f2` — bbox `[1025, 300, 1220, 535]`, pivot `center`
11. `spike_mound_idle_f1` — bbox `[25, 535, 225, 745]`, pivot `bottom-center`
12. `spike_mound_idle_f2` — bbox `[215, 530, 410, 745]`, pivot `bottom-center`
13. `spike_mound_open` — bbox `[395, 525, 595, 750]`, pivot `bottom-center`
14. `spike_mound_attack` — bbox `[580, 515, 780, 750]`, pivot `bottom-center`
15. `scan_beacon_f1` — bbox `[755, 505, 920, 760]`, pivot `bottom-center`
16. `scan_beacon_f2` — bbox `[900, 500, 1060, 760]`, pivot `bottom-center`
17. `scan_beacon_f3` — bbox `[1045, 495, 1225, 765]`, pivot `bottom-center`
18. `wreck_generator_off` — bbox `[20, 765, 235, 970]`, pivot `bottom-center`
19. `wreck_generator_charge_f1` — bbox `[220, 755, 435, 975]`, pivot `bottom-center`
20. `wreck_generator_charge_f2` — bbox `[420, 750, 635, 980]`, pivot `bottom-center`
21. `wreck_generator_active` — bbox `[620, 745, 835, 985]`, pivot `bottom-center`
22. `spawn_egg_f1` — bbox `[820, 745, 960, 985]`, pivot `bottom-center`
23. `spawn_egg_f2` — bbox `[945, 740, 1085, 985]`, pivot `bottom-center`
24. `spawn_egg_f3` — bbox `[1070, 735, 1225, 990]`, pivot `bottom-center`
25. `ancient_eye_closed` — bbox `[20, 985, 220, 1245]`, pivot `center`
26. `ancient_eye_open_f1` — bbox `[205, 980, 405, 1245]`, pivot `center`
27. `ancient_eye_open_f2` — bbox `[390, 975, 590, 1245]`, pivot `center`
28. `ancient_eye_charge` — bbox `[575, 970, 780, 1245]`, pivot `center`
29. `turret_idle` — bbox `[770, 970, 925, 1245]`, pivot `bottom-center`
30. `turret_windup` — bbox `[910, 965, 1070, 1245]`, pivot `bottom-center`
31. `turret_fire` — bbox `[1055, 960, 1225, 1245]`, pivot `bottom-center`

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
