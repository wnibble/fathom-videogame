# Contract — `enemy-spitter` (telegraphed radial + aimed)

> Part-5 subsystem #7 (Enemy AI), slice archetype = **Spitter** only. Drifts, aggros
> the player, alternates a telegraphed **radial** burst and a telegraphed **aimed**
> shot. Placeholder art. Runs at step 2 (AI) before movement/emitter.

## PURPOSE
The first bullet-fauna: legible by behavior alone (acceptance) — you can read its
wind-up and know which pattern is coming. Composes existing modules (movement `Body`
for drift, projectiles `Emitter` for attacks); adds only a small FSM brain.

## RESPONSIBILITIES
- `spawnSpitter(world, pos)` — create an entity with `Transform`, `Body` (slow
  drift), `Collider`, `Health`, `Faction:'enemy'`, `Sprite` (placeholder), a
  `SpitterBrain`, and an `Emitter` (its current attack spec).
- `spitterSystem(ctx)` — FSM per brain:
  `idle → (player in aggroRange) → wander → wind_up → attack → recover → wander…`.
  On `wind_up`, set the emitter's spec to the next attack (radial/aimed) and enable
  it (the projectiles emitterSystem then telegraphs + fires); alternate
  radial↔aimed. Steer `Body` toward/away to keep mid-range spacing.
- Author the two attack specs as data (`specs.ts`), both with `TelegraphSpec`.

## KEY DATA
```ts
import { EntityId, Vec2, Milliseconds } from '../shared/types';
import { defineComponent, ComponentType } from '../ecs';
import { EmitterSpec } from '../projectiles';

export interface SpitterBrain {
  state: 'idle' | 'wander' | 'wind_up' | 'attack' | 'recover';
  timer: Milliseconds;
  target?: EntityId;              // the player
  aggroRange: number;
  spacing: number;                // preferred distance to target
  next: 'radial' | 'aimed';
}
export const CSpitterBrain: ComponentType<SpitterBrain>;

export interface SpitterConfig {
  hp?: number; aggroRange?: number; spacing?: number;
  radialSpec?: EmitterSpec; aimedSpec?: EmitterSpec;
}

// data (src/enemies/spitter/specs.ts)
export const SPITTER_RADIAL: EmitterSpec; // telegraph:'radial_spokes', pattern:'radial', count~12
export const SPITTER_AIMED:  EmitterSpec; // telegraph:'aim_line',      pattern:'aimed',  count~3 arc
```

## INTERFACE
```ts
export function spawnSpitter(world: World, pos: Vec2, cfg?: SpitterConfig): EntityId;
export function spitterSystem(ctx: FrameContext): void;   // register at step 2
```

## DEPENDENCIES
`shared/types`, `ecs`, `core` (FrameContext), `movement` (Body/PlayerControlled to
find the player), `projectiles` (EmitterSpec + attachEmitter), `assets`
(placeholder sprite). Does NOT depend on worldgen (worldgen calls `spawnSpitter`).

## ACCEPTANCE (Part 5 #7)
- Legible by behavior alone: a watcher can tell radial-vs-aimed from the wind-up
  (distinct telegraph shape) before bullets appear.
- Both attacks telegraph (delegated to projectiles' mandatory telegraph).
- Fair: never spawns already-firing; `leadMs` gives the player time to read + dodge.
- Uses shared movement + projectiles — no bespoke bullet or physics code.
