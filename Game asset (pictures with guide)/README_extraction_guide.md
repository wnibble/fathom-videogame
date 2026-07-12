# FATHOM generated-asset extraction handoff

## Coordinate convention
- Every source sheet is 1254×1254.
- Coordinates use a top-left origin.
- Boxes are `[x0, y0, x1, y1]`, with `x1/y1` exclusive.
- Boxes are intentionally generous first-pass crop regions, not final tight bounds.
- After cropping, remove the baked checker/white background, then calculate a tight alpha bound.

## Critical source limitation
The generator returned RGB files. The visible checkerboard is baked into the pixels; it is not real transparency.
Do not treat white alone as the background because highlights contain near-white pixels.

## Background removal
1. Sample several known background patches near sheet corners and empty gutters.
2. Build a checker-background model from the two dominant low-saturation light colors.
3. Mark a pixel as background when:
   - saturation is low,
   - it is close to either sampled checker color,
   - and it is connected to the crop border.
4. Feather nothing. Pixel art requires a binary alpha edge.
5. Preserve enclosed pale highlights that are not border-connected.
6. Manually inspect glowing effects; some contain pale bloom close to the background colors.

A practical method is flood fill from the crop edges using a color-distance tolerance, rather than globally deleting white.

## Final trimming and centering
- Trim to the nontransparent alpha bounds.
- Add 8 px transparent padding on every side.
- For symmetric bullets and effects: pivot = geometric center.
- For props resting on terrain: pivot = bottom-center.
- For aim lines: pivot = left-center.
- For cones: pivot = apex-left.
- For current ribbons and ambient clusters: pivot = center.
- Keep all animation frames on identical canvases and identical pivots.
- Build the union alpha bounds across every frame in a sequence, then center each frame inside that shared rectangle.
- Never independently recenter frames in the same animation; that causes visible jitter.

## Animation grouping
Names ending `_f1`, `_f2`, etc. are ordered frames.
Recommended playback:
- impacts: 12–16 fps, one-shot
- wake/boost: 10–14 fps
- scan rings: 8–12 fps
- ambient props: 4–8 fps
- warning/telegraph cycles: authored by gameplay timing rather than fixed looping

## Pixel normalization
These images are concept-grade pixel art rather than guaranteed native-grid sprites.
For production:
1. Downscale each extracted asset with nearest-neighbor to the intended logical size.
2. Hand-clean isolated half-pixel-looking clusters.
3. Use the logical sizes:
   - bullets: 8×8, 12×12, or 16×16
   - small effects: 16×16 or 24×24
   - standard props: 32×32 or 48×48
   - large props: 64×64+
4. Scale in the game only by integer factors.

## Atlas export
Each exported entry should contain:
```json
{
  "frame": {"x": 0, "y": 0, "w": 32, "h": 32},
  "pivot": {"x": 0.5, "y": 0.5},
  "sourceSize": {"w": 32, "h": 32},
  "durationMs": 83
}
```

Use 2 px texture extrusion around every packed frame to prevent sampling seams.
