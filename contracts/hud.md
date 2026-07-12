# Contract — `hud` (health + depth gauge)

> Part-5 subsystem #15 (UI/HUD), slice scope = **health + depth gauge** only
> (minimap/ability-bar/tooltips deferred). Screen-space overlay above the world.

## PURPOSE
Show the two things that matter in Twilight Drift: how much life is left, and how
deep you are. Renders in screen space (unscaled by camera), above fog and light.

## RESPONSIBILITIES
- Mount into the renderer's `hudLayer` (screen-space Pixi container) — or a DOM
  overlay pinned over the canvas.
- `update(model)` each rendered frame: draw a health bar/pips from `hp/hpMax` and a
  vertical **depth gauge** showing `depth` (and a marker for `bestDepth`).
- Flash/tween on damage (react to `hp` drop); no gameplay logic, pure view.

## KEY DATA
```ts
export interface HudModel {
  hp: number;
  hpMax: number;
  depth: number;      // current depth, meters
  bestDepth: number;  // from persistence, for the marker
}
```

## INTERFACE
```ts
export interface Hud {
  update(model: HudModel): void;   // called once per rendered frame by dive-scene
  show(): void;
  hide(): void;
  destroy(): void;
}
export function createHud(hudLayer: unknown): Hud;   // hudLayer = renderer.hudLayer
```
The dive-scene builds `HudModel` each frame from the player's `Health` component +
current depth + `persistence.data.bestDepth`. HUD stays decoupled (polled, no
direct ECS or event coupling required).

## DEPENDENCIES
`shared/types`, `renderer` (hudLayer mount). Reads no ECS directly.

## ACCEPTANCE (Part 5 #15)
- Health and depth are always visible and readable at a glance during a dive.
- Depth gauge reflects live depth and marks the best-depth record.
- Purely presentational — never blocks input, never mutates game state.
