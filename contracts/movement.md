# Contract — `movement` (drift + drag + currents + collision)

> Part-5 subsystem #5 (Movement/Physics). Momentum-based drift with linear drag,
> current force-fields, and circle-vs-occluder collision. One system, run at
> step 3 of the tick.

## PURPOSE
Make the diver and fauna *drift* — thrust adds momentum, water drags it down,
currents shove intentionally (pillar: currents feel deliberate, not random). Owns
the `Body` component and the `CollisionWorld` implementation the arena fills.

## RESPONSIBILITIES
- `movementSystem(ctx)`: for each entity with `Transform`+`Body`:
  1. Save `prevPos` ← `pos` (for render interpolation).
  2. If `PlayerControlled`, apply thrust along `ctx.input.move × thrust`.
  3. Sum current forces at `pos` from `ctx`-provided fields (via `CollisionWorld`
     or an arena-supplied `CurrentField[]`), respecting `falloff`.
  4. Semi-implicit Euler: `vel += accel·dt`; apply linear drag `vel ·= (1−drag·dt)`;
     clamp to `maxSpeed`; `pos += vel·dt`.
  5. Resolve circle(`radius`)-vs-`Occluder` collision against
     `ctx.collision.queryOccluders(aabb)`: push out + kill normal velocity (slide).
  6. Clamp to arena `bounds`.
- Provide `PlayerControlled` tag component and `sampleCurrents` helper.
- Provide `createCollisionWorld(bounds, occluders, currents)` used by worldgen.

## KEY DATA
```ts
import { Vec2, Rect, CurrentField, Occluder, CollisionWorld, AABB } from '../shared/types';
import { defineComponent, ComponentType } from '../ecs';

export interface Body {
  vel: Vec2;
  accel: Vec2;        // scratch: forces accumulated this tick, cleared after integrate
  drag: number;       // linear damping coeff per second (e.g. 3.0)
  thrust: number;     // engine accel magnitude (player), world units/s^2
  maxSpeed: number;   // world units/s
  radius: number;     // collision radius vs occluders (distinct from Collider hit radius)
}
export interface PlayerControlled { enabled: boolean; }

export const CBody: ComponentType<Body>;
export const CPlayerControlled: ComponentType<PlayerControlled>;
```

## INTERFACE
```ts
export function movementSystem(ctx: FrameContext): void;   // register at step 3

export function sampleCurrents(pos: Vec2, fields: readonly CurrentField[], out?: Vec2): Vec2;

export function createCollisionWorld(
  bounds: Rect, occluders: readonly Occluder[], currents: readonly CurrentField[],
): CollisionWorld & { readonly currents: readonly CurrentField[] };
```
`FrameContext` (from core) supplies `world`, `dt`, `input`, `collision`. The active
arena's currents are reachable via the concrete `CollisionWorld` returned above
(exposed as `.currents`); `movementSystem` reads them for step 3.3.

## DEPENDENCIES
`shared/types` (CurrentField/Occluder/CollisionWorld/AABB), `ecs`, `core`
(FrameContext). No dependency on worldgen (worldgen calls `createCollisionWorld`).

## ACCEPTANCE (Part 5 #5)
- Currents feel intentional, not random — a diver in a current is pushed
  consistently along `force`, with `linear` falloff at field edges.
- Drift has momentum: releasing thrust coasts and decays via drag, no instant stop.
- No tunnelling through occluders at gameplay speeds; collision slides, never
  sticks or hard-stops the player against a wall.
- `prevPos` is written every tick so the renderer interpolates smoothly.
