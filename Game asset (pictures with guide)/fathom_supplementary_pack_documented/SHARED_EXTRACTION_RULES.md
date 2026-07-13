# Shared Extraction and Integration Rules

## Background
Every sheet has a baked flat magenta `#ff00ff` background rather than true alpha.

Use a color-tolerance removal process:
- Prefer border-connected flood fill.
- Avoid globally deleting all bright magenta-adjacent pixels if the subject contains warm glow.
- Export binary alpha without feathering.

## Coordinates
- Origin: top-left.
- `bbox`: `[x0, y0, x1, y1]`.
- `x1` and `y1` are exclusive.
- Boxes are deliberately generous.

## Alignment
For each `_fN` animation group:
1. Extract and trim all frames.
2. Calculate the union bounds.
3. Place all frames on one shared canvas.
4. Apply the same pivot to every frame.
5. Preserve the subject's world anchor rather than independently centering each trimmed frame.

## Atlas output
- 8 px transparent padding around each logical sprite.
- 2 px extrusion during packing.
- Nearest-neighbor scaling and sampling only.
- No mipmap smoothing for the pixel atlas.

## Naming
- Keep supplied names exactly.
- `_f1`, `_f2`, `_f3` indicate ordered frames.
- Explicit states (`off`, `on`, `warning`, `open`, `attack`) should remain individually addressable.

## Runtime intent
Supplementary assets should enrich:
- loot recognition,
- codex/sample collection,
- environmental storytelling,
- hazard readability,
- hub interactivity,
- biome differentiation,
without competing with bullets or enemy telegraphs.
