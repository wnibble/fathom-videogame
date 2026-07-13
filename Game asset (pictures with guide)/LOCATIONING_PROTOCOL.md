# FATHOM Sprite Locationing and Extraction Rules

## Manifest coordinates
- Origin: top-left.
- Bounding box: `[x0, y0, x1, y1]`.
- `x1` and `y1` are exclusive.
- Bounding boxes may be generous; the extractor removes the background and trims.

## Pivot types
- `center`: actors, floating creatures, symmetric effects.
- `bottom-center`: grounded props and station NPCs.
- `left-center`: lines, beams, and tethers.
- `apex-left`: cones and directional telegraphs.

## Background removal
These sheets use a flat RGB magenta background: `#ff00ff`.

Recommended removal:
1. Crop using the manifest bounding box.
2. Remove pixels sufficiently close to `#ff00ff`.
3. Convert the result to binary alpha.
4. Trim to visible bounds.
5. Add 8 transparent pixels of padding.
6. Add 2 pixels of extrusion when packing the atlas.

## Frame alignment
For each animation:
1. Gather all related `_fN` frames.
2. Compute the union bounds across the sequence.
3. Place every frame on that same canvas.
4. Preserve one pivot for the whole animation.
5. Never independently recenter frames after trimming.

## Scaling
- Downscale with nearest-neighbor only.
- Use integer scaling in the renderer.
- Do not smooth atlas textures.
