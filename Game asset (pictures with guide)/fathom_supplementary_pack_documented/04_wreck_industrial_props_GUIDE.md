# 04 — Wreck and Industrial Prop Kit

## Source image
- File: `04_wreck_industrial_props.png`
- Dimensions: `1254×1254`
- Background: flat baked `#ff00ff`
- Layout: 5/5/5/4 item rows

## Purpose
Dense environmental storytelling and collision props for The Wreck, station maintenance spaces, and salvage rooms.

## Gameplay usage
- **`cargo_crate_closed`** — solid obstacle or salvage container
- **`cargo_crate_broken`** — opened/broken-state variant
- **`rusted_locker`** — corridor dressing or loot container
- **`pipe_cluster`** — wall or machinery obstruction
- **`large_valve`** — interaction prop
- **`chain_pile`** — small collision clutter
- **`anchor`** — large set-dressing landmark
- **`floodlight_off`** — unpowered state
- **`floodlight_on`** — powered warm-light state
- **`broken_console`** — noninteractive damaged console
- **`terminal_a`** — working console variant
- **`terminal_b`** — working console alternate display
- **`damaged_generator`** — two-frame electrical pulse
- **`hanging_hook`** — foreground hazard or decorative crane hook
- **`bollard`** — grounded industrial prop
- **`rusted_barrel`** — small collision prop
- **`floor_grate`** — walkable tile overlay
- **`bulkhead_hatch`** — door, arena gate, or secret-room entrance

## Asset order and crop locations
Coordinates use a top-left origin. Bounding boxes are `[x0, y0, x1, y1]` with `x1/y1` exclusive.

1. `cargo_crate_closed` — bbox `[25, 30, 265, 330]`, pivot `bottom-center`
2. `cargo_crate_broken` — bbox `[255, 25, 500, 335]`, pivot `bottom-center`
3. `rusted_locker` — bbox `[500, 20, 735, 335]`, pivot `bottom-center`
4. `pipe_cluster` — bbox `[725, 20, 990, 335]`, pivot `bottom-center`
5. `large_valve` — bbox `[980, 45, 1225, 330]`, pivot `bottom-center`
6. `chain_pile` — bbox `[25, 340, 255, 585]`, pivot `bottom-center`
7. `anchor` — bbox `[245, 330, 485, 590]`, pivot `bottom-center`
8. `floodlight_off` — bbox `[480, 330, 715, 590]`, pivot `bottom-center`
9. `floodlight_on` — bbox `[705, 325, 955, 590]`, pivot `bottom-center`
10. `broken_console` — bbox `[945, 325, 1225, 595]`, pivot `bottom-center`
11. `terminal_a` — bbox `[25, 600, 255, 865]`, pivot `bottom-center`
12. `terminal_b` — bbox `[245, 600, 480, 865]`, pivot `bottom-center`
13. `damaged_generator_f1` — bbox `[470, 585, 760, 875]`, pivot `bottom-center`
14. `damaged_generator_f2` — bbox `[745, 580, 1020, 880]`, pivot `bottom-center`
15. `hanging_hook` — bbox `[1010, 585, 1225, 875]`, pivot `bottom-center`
16. `bollard` — bbox `[40, 885, 300, 1215]`, pivot `bottom-center`
17. `rusted_barrel` — bbox `[310, 875, 535, 1215]`, pivot `bottom-center`
18. `floor_grate` — bbox `[555, 875, 800, 1215]`, pivot `center`
19. `bulkhead_hatch` — bbox `[810, 850, 1225, 1225]`, pivot `bottom-center`

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
