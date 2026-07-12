# Contract — `renderer` (pixel pipeline + light + fog)

> Part-5 subsystem #2. PixiJS v8. Integer-scaled nearest-neighbour world, a
> **separate additive light layer**, and a **capped-opacity fog** overlay. Draws
> the ECS `Sprite`+`Transform` set each rendered frame with interpolation.

## PURPOSE
Render the dark sea so that bioluminescence glows *through* it (pillar 2) while
bullets stay legible (pillar 1). Solid pixel bodies draw first; fog tints the world
at a capped opacity (never dead black); additive light draws above fog so glows
punch through. Provides the concrete `Camera`.

## RESPONSIBILITIES
- Init a Pixi `Application` at logical `baseWidth×baseHeight`, integer `scale`
  (×3 default), nearest filtering, pixel-snapped stage. Handle resize keeping
  integer scale + letterbox.
- Maintain ordered layers: `terrain < props < entities < projectiles < vfx`
  (world, camera-transformed) → **fog** (capped tint) → **light** (additive) →
  HUD mount (screen-space, above all; owned by hud module).
- **World render system**: each rendered frame, for every entity with
  `Transform`+`Sprite`, reuse a pooled Pixi `Sprite`, set texture from
  `AssetRegistry`, position = lerp(prevPos, pos, alpha) snapped to integer px,
  apply tint/alpha/flip/layer, advance animation by `animFps`. Cull offscreen.
- **Light layer**: for every `Sprite` with `glow>0`, draw an additive glow sprite
  (soft radial) at its position tinted `glowColor`, intensity `glow`. Player beam +
  glowing creatures + bullet glows all feed this one layer.
- **Fog**: full-viewport tinted quad at `fog.maxAlpha` (capped), optionally a soft
  radial clear around the player light. Palette stays intact under it.
- Concrete `Camera` (implements core's interface): follow with smoothing, integer
  snap, shake, world↔screen.

## KEY DATA
```ts
import { Hex, Vec2 } from '../shared/types';
import { Camera, FrameContext } from '../core';
import { AssetRegistry } from '../assets';

export interface FogConfig { color: Hex; maxAlpha: number; } // maxAlpha capped, e.g. 0.55
export interface RendererConfig {
  baseWidth: number;    // logical px, e.g. 320
  baseHeight: number;   // logical px, e.g. 180
  scale: number;        // integer, default 3
  background: Hex;      // abyssal navy
  fog: FogConfig;
}
```
(`Sprite` and `Transform` components are defined in `ecs`; renderer only reads
them. `RenderLayer` is in `shared/types`.)

## INTERFACE
```ts
export interface Renderer {
  readonly camera: Camera;                 // concrete impl injected into FrameContext
  readonly canvas: HTMLCanvasElement;
  readonly hudLayer: unknown;              // Pixi Container for hud to mount into (screen-space)
  setFog(fog: Partial<FogConfig>): void;
  renderWorld(ctx: FrameContext, alpha: number): void; // alpha = loop interpolation
  resize(): void;
  destroy(): void;
}

export function createRenderer(
  mount: HTMLElement, config: RendererConfig, assets: AssetRegistry,
): Promise<Renderer>;   // async: awaits Pixi Application.init
```

## DEPENDENCIES
`shared/types`, `ecs` (Transform/Sprite/RenderLayer), `core` (Camera, FrameContext),
`assets` (textures), PixiJS v8.

## ACCEPTANCE (Part 5 #2)
- Palette stays intact under fog (fog is a capped tint, never dead black).
- Bullets remain readable in the abyss (additive light draws above fog; high
  contrast maintained).
- **Stable 60fps with 300+ projectiles** — Pixi sprites are pooled/batched by
  atlas (projectiles share one atlas → one batch), offscreen entities culled, no
  per-frame texture lookups on the hot path.
- Integer-only scale, nearest-neighbour, no sub-pixel blur (positions snapped).
