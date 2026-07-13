# 05 — Surface Station Devices, Portals, Consoles, and Meta-Hub Machinery

## Source image
- File: `05_surface_station_devices.png`
- Dimensions: `1254×1254`
- Background: flat baked `#ff00ff`
- Layout: 8/9/7/6/2 item rows

## Purpose
Interactive hub props, upgrade stations, codex terminals, launch devices, banking machinery, and story doors.

## Gameplay usage
- **`sample_scanner`** — three-frame scan/analysis station
- **`codex_terminal`** — two-frame interface pulse
- **`upgrade_shrine`** — off and two powered states for permanent upgrades
- **`portal_ring`** — three-frame activation sequence
- **`core_socket`** — insert upgrade core or launch key
- **`surface_buoy`** — three-frame status beacon
- **`specimen_lab`** — two aquarium/analysis variants
- **`depth_monument`** — three-frame best-depth or leaderboard monument
- **`moon_pool`** — closed/open launch opening
- **`communications_dish`** — leaderboard/cloud-save communications station
- **`bank_lantern`** — sample banking station
- **`companion_portal`** — Bichon arrival/customization portal
- **`vault_door`** — late-game or secret meta-progression door

## Asset order and crop locations
Coordinates use a top-left origin. Bounding boxes are `[x0, y0, x1, y1]` with `x1/y1` exclusive.

1. `sample_scanner_f1` — bbox `[35, 40, 200, 255]`, pivot `bottom-center`
2. `sample_scanner_f2` — bbox `[185, 35, 350, 255]`, pivot `bottom-center`
3. `sample_scanner_f3` — bbox `[335, 25, 510, 255]`, pivot `bottom-center`
4. `codex_terminal_f1` — bbox `[495, 45, 665, 255]`, pivot `bottom-center`
5. `codex_terminal_f2` — bbox `[650, 45, 825, 255]`, pivot `bottom-center`
6. `upgrade_shrine_off` — bbox `[810, 35, 955, 260]`, pivot `bottom-center`
7. `upgrade_shrine_f1` — bbox `[940, 30, 1085, 260]`, pivot `bottom-center`
8. `upgrade_shrine_f2` — bbox `[1070, 25, 1220, 260]`, pivot `bottom-center`
9. `portal_ring_f1` — bbox `[25, 270, 190, 480]`, pivot `center`
10. `portal_ring_f2` — bbox `[175, 265, 340, 485]`, pivot `center`
11. `portal_ring_f3` — bbox `[325, 255, 500, 490]`, pivot `center`
12. `core_socket_off` — bbox `[485, 270, 650, 485]`, pivot `center`
13. `core_socket_f1` — bbox `[635, 265, 805, 490]`, pivot `center`
14. `core_socket_f2` — bbox `[790, 255, 965, 495]`, pivot `center`
15. `surface_buoy_f1` — bbox `[950, 260, 1065, 495]`, pivot `bottom-center`
16. `surface_buoy_f2` — bbox `[1050, 255, 1165, 495]`, pivot `bottom-center`
17. `surface_buoy_f3` — bbox `[1150, 250, 1245, 500]`, pivot `bottom-center`
18. `specimen_lab_a` — bbox `[25, 505, 300, 735]`, pivot `bottom-center`
19. `specimen_lab_b` — bbox `[285, 500, 555, 740]`, pivot `bottom-center`
20. `depth_monument_f1` — bbox `[540, 500, 715, 745]`, pivot `bottom-center`
21. `depth_monument_f2` — bbox `[700, 495, 875, 750]`, pivot `bottom-center`
22. `depth_monument_f3` — bbox `[860, 490, 1045, 750]`, pivot `bottom-center`
23. `moon_pool_closed` — bbox `[1025, 505, 1145, 745]`, pivot `bottom-center`
24. `moon_pool_open` — bbox `[1130, 500, 1245, 745]`, pivot `bottom-center`
25. `communications_dish_idle` — bbox `[35, 760, 280, 1000]`, pivot `bottom-center`
26. `communications_dish_active` — bbox `[265, 750, 515, 1010]`, pivot `bottom-center`
27. `bank_lantern_off` — bbox `[500, 760, 700, 1010]`, pivot `bottom-center`
28. `bank_lantern_on` — bbox `[685, 750, 885, 1015]`, pivot `bottom-center`
29. `companion_portal_off` — bbox `[865, 750, 1060, 1015]`, pivot `bottom-center`
30. `companion_portal_on` — bbox `[1040, 745, 1235, 1020]`, pivot `bottom-center`
31. `vault_door_closed` — bbox `[365, 1000, 650, 1245]`, pivot `bottom-center`
32. `vault_door_powered` — bbox `[635, 990, 935, 1245]`, pivot `bottom-center`

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
