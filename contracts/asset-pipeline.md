# Contract — `asset-pipeline` (extraction + runtime registry)

> Part-5 subsystem #19 (Art pipeline). Two halves: a **build-time CLI** that turns
> the generated sheets into game-ready atlases, and a **runtime `AssetRegistry`**
> the game loads them through. Slice extracts 4 sheet groups only.

## PURPOSE
Convert the RGB concept sheets in `Game asset (pictures with guide)/` into
power-of-two atlases (PNG + Pixi-style JSON frame map) with clean binary alpha, then
serve their frames/textures/animations to the renderer and Loader at runtime.
Provide **placeholder** frames for entities not in the pack (player, spitter, dog).

## RESPONSIBILITIES (build-time — `scripts/extract-assets.ts`, Node CLI)
Per `Game asset (pictures with guide)/README_extraction_guide.md` +
`fathom_asset_slice_manifest.json`:
1. Read the manifest; for each entry crop its `bbox` from the 1254×1254 source.
2. **Remove the baked checker background**: sample corner/gutter checker colours,
   flood-fill from crop edges by colour distance (low-saturation + border-connected),
   binary alpha edge (no feather), preserve enclosed pale highlights.
3. Trim to alpha bounds; add **8px** transparent padding. For animation groups
   (`_f1.._fN`) build **union bounds across all frames** and centre each frame in the
   shared rect (no per-frame recenter — avoids jitter).
4. Downscale nearest-neighbour to logical sizes: bullets 8/12/16, small fx 16/24,
   props 32/48, large fx 64+.
5. Pack per group into a power-of-two atlas with **2px extrusion**; write
   `<group>.png` + `<group>.json`, plus `atlas-index.json` (ids, file sizes for
   loader weighting), into `public/atlas/`.
6. Apply the manifest `pivot` per entry (center / bottom-center / left-center /
   apex-left) into the frame's `pivot`.

**Slice groups to extract:** `projectiles`, `impacts_telegraphs`→`telegraphs`,
`movement_utility_vfx`→`vfx`, `twilight_drift_props`→`twilight_props`.
(kelp/wreck/thermal groups exist in the manifest but are out of slice scope.)

## RESPONSIBILITIES (runtime — `src/assets/`)
- `AssetRegistry.loadAll` loads every atlas via Pixi Assets, reporting **accurate**
  byte/count progress (drives the Loader — no fake bar).
- Resolve a frame/texture by `(atlasId, name)`; resolve an animation by base name.
- `placeholders.ts` synthesises simple tinted-shape frames for `player`, `spitter`,
  `dog` under atlasId `"placeholder"` so gameplay modules have sprites on pass 1.

## KEY DATA
```ts
import { Rect, Vec2, Milliseconds } from '../shared/types';
import type { Texture } from 'pixi.js';

export interface AtlasFrame {
  frame: Rect;                 // pixels within the atlas page
  pivot: Vec2;                 // 0..1 normalized (from manifest pivot)
  sourceSize: { w: number; h: number };
  durationMs?: Milliseconds;   // for animation frames
}
export type FrameMap = { [name: string]: AtlasFrame };

// build-time config (CLI only, not imported by the game)
export interface ExtractConfig {
  manifestPath: string;
  sheetsDir: string;           // Game asset (pictures with guide)/
  outDir: string;              // public/atlas/
  groups: string[];            // manifest sheet keys to extract
  padding: 8; extrude: 2;
  logicalSizes: { bullets: number[]; smallFx: number[]; props: number[]; largeFx: number };
}
```

## INTERFACE (runtime)
```ts
export interface AssetRegistry {
  loadAll(onProgress?: (fraction: number, label: string) => void): Promise<void>;
  atlas(id: string): FrameMap;
  frame(atlasId: string, name: string): AtlasFrame;
  texture(atlasId: string, name: string): Texture;      // used by renderer
  animation(atlasId: string, baseName: string): AtlasFrame[]; // ordered _f1.._fN
  has(atlasId: string, name: string): boolean;
}
export function createAssetRegistry(atlasIndexUrl?: string): AssetRegistry;
```

Known atlas ids at runtime: `"projectiles"`, `"telegraphs"`, `"vfx"`,
`"twilight_props"`, `"placeholder"`.

## DEPENDENCIES
`shared/types`; PixiJS (runtime). Build CLI: Node + an image lib (e.g. sharp/jimp) —
CLI is not imported by the game bundle.

## ACCEPTANCE (Part 5 #19)
- Dropping a new sheet+manifest entry and re-running the CLI produces a usable
  atlas with no engine code change ("artist/agent adds a sprite by dropping a
  sheet + JSON").
- Extracted frames have clean binary alpha (no checker residue, no white halos on
  glows), nearest-neighbour, correct pivots, 2px extrusion (no atlas bleed).
- `AssetRegistry` reports true progress; renderer can draw any listed frame.
