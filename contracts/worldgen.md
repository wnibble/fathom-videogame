# Contract — `worldgen` (one hand-assembled Twilight Drift arena)

> Part-5 subsystem #8 (Worldgen), slice scope = **ONE hand-authored Twilight Drift
> arena** with props (no procedural assembly this pass). Produces the `CollisionWorld`
> movement reads and spawns the Spitters.

## PURPOSE
Instantiate the Twilight Drift stratum: a bounded open-midwater arena with drifting
props (from `twilight_props`), current fields, occluders, a player spawn, and Spitter
spawns. Data-first (`ArenaDef`) so later strata/procedural gen reuse the same
`buildArena` contract. Always traversable, no unfair entry spawns (acceptance).

## RESPONSIBILITIES
- Define `TWILIGHT_DRIFT: ArenaDef` — hand-placed props, currents, occluders, player
  spawn, spitter spawns, fog + palette refs, base depth. Uses real prop assets
  (rocks, coral chunks, jelly colonies, plankton, current ribbons, debris) from the
  `twilight_props` atlas.
- `buildArena(world, def, deps)`:
  - create prop entities (`Transform`+`Sprite`, `layer:'props'|'terrain'`, animated
    where `animFps>0`); mark `solid` props as `Occluder`s;
  - build the `CollisionWorld` via `movement.createCollisionWorld(bounds, occluders,
    currents)`;
  - place the player at `playerSpawn`; spawn each `EnemySpawn` via
    `spitter.spawnSpitter`;
  - return an `ArenaHandle` (collision world + def) for the dive-scene to put on
    `FrameContext.collision` and to read depth/fog from.
- Guarantee the player spawn has clear space (no occluder/no spitter on top of it).

## KEY DATA
```ts
import { Vec2, Rect, Hex, CurrentField, Occluder, CollisionWorld, RenderLayer } from '../shared/types';
import { FogConfig } from '../renderer';
import { World } from '../ecs';

export interface PropPlacement {
  atlasId: string; frame: string;   // twilight_props
  pos: Vec2;
  layer: RenderLayer;               // 'terrain' | 'props'
  solid: boolean;                   // → becomes an Occluder
  radius?: number;                  // occluder radius if solid
  animFps?: number;                 // >0 = animated (e.g. jelly_colony)
}
export interface EnemySpawn { type: 'spitter'; pos: Vec2; }

export interface ArenaDef {
  id: 'twilight_drift';
  bounds: Rect;                     // world extents
  baseDepth: number;                // depth value on entry (for HUD/persistence)
  fog: FogConfig;                   // dimming Twilight Drift tint, capped alpha
  paletteNote: string;             // sub-palette reference (bible Part 1)
  playerSpawn: Vec2;
  props: PropPlacement[];
  currents: CurrentField[];
  spawns: EnemySpawn[];
}

export interface ArenaHandle {
  def: ArenaDef;
  collision: CollisionWorld;        // put onto FrameContext.collision
  playerId: number;                 // spawned player entity
}
```

## INTERFACE
```ts
export const TWILIGHT_DRIFT: ArenaDef;

export interface ArenaDeps {
  createPlayer(world: World, pos: Vec2): number;   // dive-scene supplies player factory
}
export function buildArena(world: World, def: ArenaDef, deps: ArenaDeps): ArenaHandle;
```
(The player entity factory is injected so worldgen doesn't own the player archetype;
it composes `Transform`+`Body`+`PlayerControlled`+`Health`+`Collider`+`Sprite`+player
`Emitter`, defined in the dive-scene.)

## DEPENDENCIES
`shared/types`, `ecs`, `renderer` (FogConfig type), `movement`
(`createCollisionWorld`), `enemy-spitter` (`spawnSpitter`), `assets` (prop frames).

## ACCEPTANCE (Part 5 #8)
- Always traversable: player can reach all open space; occluders never seal the
  spawn or partition the arena.
- No unfair spawns at entry: no spitter within its own `aggroRange`/firing range of
  the player spawn at t=0; spawn area is clear.
- Deterministic layout (hand-authored data) — same arena every run this pass.
- Props/currents read as one cohesive Twilight Drift (dimming light, drifting fauna).
