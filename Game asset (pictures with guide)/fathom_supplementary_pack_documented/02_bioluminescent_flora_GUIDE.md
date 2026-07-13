# 02 — Bioluminescent Flora and Seafloor Set Dressing

## Source image
- File: `02_bioluminescent_flora.png`
- Dimensions: `1254×1254`
- Background: flat baked `#ff00ff`
- Layout: five broad columns, four rows, last row contains six assets

## Purpose
Ambient biome dressing, navigation landmarks, sample nodes, and living environmental storytelling for Shelf, Kelp Forest, Twilight Drift, and Abyssal Plain.

## Gameplay usage
- **`kelp_tall_a`** — foreground occluder or collision kelp
- **`kelp_tall_b`** — foreground variant
- **`kelp_branching`** — midground kelp
- **`kelp_bush`** — small cover and decoration
- **`lure_grass`** — rare glowing navigation landmark
- **`fan_coral`** — Shelf decoration
- **`tube_coral`** — Shelf or Twilight decoration
- **`danger_anemone`** — warm hazard plant; two-frame pulse
- **`amber_sponge`** — sampleable warm sponge colony
- **`tube_worm_colony`** — thermal vent decoration/animation
- **`egg_cluster`** — scan target or destructible spawn nest
- **`abyssal_root_mass`** — Abyssal Plain obstruction or predator nest
- **`jelly_mushroom_cluster`** — cool ambient light source
- **`crystal_coral`** — rare mineral/sample landmark
- **`floating_reef_chunk`** — midwater platform or large set piece
- **`angler_plant`** — warm lure landmark; two-frame glow pulse

## Asset order and crop locations
Coordinates use a top-left origin. Bounding boxes are `[x0, y0, x1, y1]` with `x1/y1` exclusive.

1. `kelp_tall_a` — bbox `[35, 20, 225, 380]`, pivot `bottom-center`
2. `kelp_tall_b` — bbox `[235, 20, 435, 380]`, pivot `bottom-center`
3. `kelp_branching` — bbox `[450, 25, 690, 385]`, pivot `bottom-center`
4. `kelp_bush` — bbox `[690, 45, 935, 390]`, pivot `bottom-center`
5. `lure_grass` — bbox `[945, 70, 1215, 395]`, pivot `bottom-center`
6. `fan_coral` — bbox `[30, 395, 250, 650]`, pivot `bottom-center`
7. `tube_coral` — bbox `[245, 390, 485, 650]`, pivot `bottom-center`
8. `danger_anemone_f1` — bbox `[480, 395, 730, 655]`, pivot `bottom-center`
9. `danger_anemone_f2` — bbox `[715, 395, 970, 655]`, pivot `bottom-center`
10. `amber_sponge` — bbox `[950, 395, 1220, 655]`, pivot `bottom-center`
11. `tube_worm_colony_f1` — bbox `[25, 660, 250, 925]`, pivot `bottom-center`
12. `tube_worm_colony_f2` — bbox `[235, 660, 475, 930]`, pivot `bottom-center`
13. `egg_cluster_f1` — bbox `[465, 660, 705, 925]`, pivot `bottom-center`
14. `egg_cluster_f2` — bbox `[690, 660, 930, 925]`, pivot `bottom-center`
15. `abyssal_root_mass` — bbox `[915, 650, 1225, 935]`, pivot `bottom-center`
16. `jelly_mushroom_cluster_f1` — bbox `[25, 930, 245, 1245]`, pivot `bottom-center`
17. `jelly_mushroom_cluster_f2` — bbox `[230, 925, 460, 1245]`, pivot `bottom-center`
18. `crystal_coral` — bbox `[440, 925, 680, 1245]`, pivot `bottom-center`
19. `floating_reef_chunk` — bbox `[655, 920, 900, 1245]`, pivot `bottom-center`
20. `angler_plant_f1` — bbox `[890, 920, 1060, 1245]`, pivot `bottom-center`
21. `angler_plant_f2` — bbox `[1040, 915, 1225, 1245]`, pivot `bottom-center`

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
