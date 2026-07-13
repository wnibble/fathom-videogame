# FATHOM — Next Sprite Pack: ChatGPT generation prompt + locationing protocol

This is a **paste-ready brief** for generating the next art pack with an image model
(ChatGPT / DALL·E / Midjourney), plus the **manifest/locationing protocol** so the
output drops straight into `tools/extract-assets.mjs` like the first pack did.

Workflow: (1) generate each **sheet** PNG with the prompt below; (2) author a
`fathom_asset_slice_manifest.json` entry per sheet using the schema in §4 (bounding
boxes for each sprite); (3) drop the PNGs + manifest into `Game asset (pictures with
guide)/` and run `npm run extract-assets`. The pipeline handles background removal,
trimming, animation-frame alignment, and nearest-neighbor downscale.

---

## 1. ART DIRECTION (must match the existing pack — keep it one world)

- **Style:** top-down **pixel art**, silhouette-first (every entity readable in pure
  black silhouette), clean chunky pixels, **nearest-neighbor** (no anti-aliasing, no
  sub-pixel blur, no gradients baked into tiny sprites).
- **Setting:** a dark, **bioluminescent deep sea**. Light glows *through* darkness.
- **Palette (deep-sea ramp):** abyssal navy/teal darks (`#04070f`, `#0a1426`, `#102540`,
  `#16304f`), aqua bio-accents (`#39d7e6`, `#8ff6ff`), warm danger accents (amber
  `#ffb64a`/`#ffe08a`, coral `#ff5a4a`/`#ff8f7a`), poison green `#8fe04a`, mint
  `#7fe6d0`, warm surface light `#fff4d6`. **Cool = the player/friendly; warm =
  danger.** Enemies read warm; the diver + pickups read cool.
- **Grids (logical size, will be downscaled to this):** player/companion **24×24**,
  standard fauna **32×32**, elites **48×48**, bosses **96×96+**, props vary.
- **Background:** generate every sheet on a **flat pure-magenta `#ff00ff` or flat white
  background** (NOT a checkerboard) so background removal is clean. One flat bg color the
  subject never uses. Leave **≥12 px gutter** between every cell.
- **Animation:** 2–4 frame cycles. Frames of one animation must be the **same size,
  same pose center**, laid left-to-right in reading order. Name them `_f1`, `_f2`, …
- **Telegraphs are mandatory** for any attack: include a distinct **wind-up / charge
  frame** (brighter, gathered pose) before the attack pose.

---

## 2. THE PACK — sheets to generate (prioritized)

Generate as separate sheets (one PNG each). Priority order = biggest impact first.

### P0 — Animated actors (replace the procedural placeholders — biggest visual win)

**Sheet A — The Diver (player), 24×24 cells, 6 cells in a row:**
> A top-down pixel-art scuba/deep-diver character sprite sheet, 24×24 per cell, 6 cells
> left-to-right on a flat magenta background. Teal/navy diver suit with a glowing amber
> headlamp at the front, small fins. Frames: `idle_f1`, `idle_f2` (gentle 2-frame float),
> `swim_f1`, `swim_f2`, `swim_f3` (3-frame propel cycle, fins kicking), `hurt` (recoil
> flash pose). Silhouette-first, cohesive with a dark bioluminescent deep-sea palette,
> nearest-neighbor, no anti-aliasing. 12px gutter between cells.

**Sheet B — Fauna enemies (32×32 cells, 4 columns × 3 rows = 12 cells):**
> A top-down pixel-art sea-fauna enemy sprite sheet, 32×32 per cell, on flat magenta,
> 12px gutters. Three creatures, each with an idle frame and a telegraph/attack frame,
> warm-accented (coral/amber) so they read as danger against a dark sea:
> Row 1 SPITTER (a bioluminescent polyp): `spitter_idle_f1`, `spitter_idle_f2`,
> `spitter_windup` (gathered, glowing brighter), `spitter_fire`.
> Row 2 DARTER (a sleek arrow-like eel predator): `darter_idle`, `darter_windup`
> (coiled recoil), `darter_lunge` (stretched forward), `darter_recover`.
> Row 3 DRIFTER (a slow jelly bell with drooping tendrils): `drifter_idle_f1`,
> `drifter_idle_f2`, `drifter_pulse` (bell contracts, spores glow), `drifter_spawn`.
> Silhouette-first, chunky pixels, nearest-neighbor.

### P1 — Boss + companion

**Sheet C — The Gatekeeper (boss), 96×96 cells, 4 cells:**
> A top-down pixel-art deep-sea BOSS creature, 96×96 per cell, flat magenta, big gutters.
> A colossal bioluminescent guardian with a single glowing **weak-point core** that
> irises open. Frames: `idle` (core closed, dark), `open` (core irised open + bright —
> the vulnerable telegraph), `attack` (limbs/spines flared, warm danger glow), `hurt`.
> Menacing silhouette, deep-sea palette, cool body + one warm core.

**Sheet D — The Bichon companion, 24×24 cells, 4 cells:**
> A top-down pixel-art fluffy white **Bichon dog** wearing a tiny diving helmet,
> underwater, adorable and slightly uncanny. 24×24 per cell, flat magenta. Frames:
> `dog_idle_f1`, `dog_idle_f2`, `dog_swim_f1`, `dog_swim_f2`. A soft cool glow. It is a
> light source + companion; keep it charming and readable.

### P2 — The overworld (Surface Station — for the walkable hub)

**Sheet E — Surface Station tiles + NPC, mixed cells on one sheet:**
> A top-down pixel-art SURFACE STATION scene kit on flat magenta: a metal dive-platform
> floor tile (32×32, seamless), a railing edge piece (32×32), a dive-vent/moon-pool
> opening (48×48), a shop console (32×48) glowing aqua, a weather-buoy (24×32), and a
> STATION KEEPER npc — a weathered old diver, 24×24, frames `keeper_idle_f1`,
> `keeper_idle_f2`. Cool industrial palette with warm lamp accents, twilight surface
> light. Silhouette-first, nearest-neighbor, 12px gutters, label each region.

*(VFX like muzzle-flash, bullet trails, impact rings, current wisps, and marine snow are
done procedurally in-engine — no sprites needed.)*

---

## 3. GENERATION TIPS
- Ask for **one sheet at a time**; specify the exact **cell size, columns, gutter, and a
  flat single-color background** every time (the model drifts otherwise).
- If it bakes a checkerboard or gradient background, regenerate asking for "**flat solid
  #ff00ff background, no checkerboard, no gradient**."
- Ask it to keep **every animation frame the same size and centered**.
- Request **high contrast, chunky pixels, no anti-aliasing** each time.

---

## 4. LOCATIONING PROTOCOL — the manifest (drop-in for `extract-assets.mjs`)

For each generated sheet, add an entry to
`Game asset (pictures with guide)/fathom_asset_slice_manifest.json`. The pipeline reads
this to slice sprites. **Schema (matches the existing pack):**

```jsonc
{
  "manifest_version": "1.0",
  "source_dimensions": [W, H],            // the sheet PNG's pixel size
  "coordinate_system": "pixels, origin top-left, bbox=[x0,y0,x1,y1], x1/y1 exclusive",
  "important_warning": "Sheets may be RGB with a baked flat background, not true alpha. Remove background before trimming.",
  "recommended_output": {
    "projectiles": "16x16", "small_vfx": "24x24", "props": "trimmed, power-of-two atlas",
    "filtering": "nearest-neighbor only", "padding": "8 transparent px around subject; 2px atlas extrusion"
  },
  "sheets": {
    "diver": {                            // sheet key (becomes the 'sheet' field per sprite)
      "file": "diver_sheet.png",          // the PNG filename you dropped in
      "size": [W, H],
      "entries": [
        { "name": "diver_idle_f1", "bbox": [x0, y0, x1, y1], "pivot": "center" },
        { "name": "diver_idle_f2", "bbox": [x0, y0, x1, y1], "pivot": "center" },
        { "name": "diver_swim_f1", "bbox": [x0, y0, x1, y1], "pivot": "center" }
        // ...one entry per cell...
      ]
    }
  }
}
```

**Rules the pipeline relies on:**
- `bbox` = `[x0, y0, x1, y1]`, top-left origin, **x1/y1 exclusive**. Boxes can be
  generous first-pass crops (the extractor removes bg + trims to a tight alpha bound).
- **Animation frames** share a `name` prefix ending in `_f1`, `_f2`, … in order. The
  extractor aligns them to a shared canvas (no jitter) — keep frames the same size.
- **`pivot`** — `center` (symmetric bullets/creatures), `bottom-center` (props resting on
  terrain / the diver standing), `left-center` (aim lines), `apex-left` (cones).
- Downscale target sizes: bullets 16, small effects 24–32, standard props 48, large 64+.
  The extractor scales nearest-neighbor to the logical size.

**Then wire it in code:** the extractor writes `public/assets/sprites/atlas.json`
(sprites + `_fN` animations). Load via `AssetStore.sprite("name")` /
`AssetStore.anim("group")` (already used for props/VFX). Swap the procedural
`buildPlayerView` / `buildSpitterView` / `buildDarterView` / `buildDrifterView` in
`src/render/actors.ts` to use `AnimatedSprite`s from the atlas — nothing else depends on
how those views are drawn, so it's a clean swap once the art exists.
