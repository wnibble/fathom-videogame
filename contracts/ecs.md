# Contract — `ecs` (ECS-lite entity model) · FOUNDATIONAL

> Part-5 subsystem #4 ("Entity system, ECS-lite"), minimally scoped to the slice.
> Foundational: renderer, movement, projectiles, spitter, worldgen all build
> against the component shapes defined here. Freeze this before Wave 3.

## PURPOSE
A tiny, allocation-frugal entity/component store. Entities are integer handles;
components are plain data structs kept in per-type pools. Provides create/destroy,
add/get/remove, and iteration/queries. No systems live here — systems are functions
in feature modules that receive a `FrameContext` (see `core`).

## RESPONSIBILITIES
- Mint and recycle `EntityId`s (dense handles with a free-list; reuse memory).
- Store components in typed pools keyed by a `ComponentType` token.
- Fast iteration over entities that have a given set of components.
- Define the **core component set** every module shares (below). Feature modules
  define their own extra components via `defineComponent` (Emitter, Body, etc.).
- Zero per-frame heap churn on the hot path: reuse component objects, iterate
  without building arrays, support 500+ entities and 300+ projectiles at 60fps.

## KEY DATA
```ts
import { EntityId, Vec2, Faction, RenderLayer, Hex, Radians, Milliseconds } from '../shared/types';

// A component "type token": identity + factory used to allocate a fresh struct.
export interface ComponentType<T> {
  readonly id: number;          // dense index, assigned at definition time
  readonly name: string;
  create(): T;                  // returns a zeroed/default struct (pooled by World)
}

export function defineComponent<T>(name: string, factory: () => T): ComponentType<T>;

// ---- CORE COMPONENTS (src/ecs/components.ts) — shared by many modules ----

export interface Transform {    // owned by ecs; read by renderer, written by movement
  pos: Vec2;
  prevPos: Vec2;                // last tick's pos, for render interpolation
  rot: Radians;
  scale: number;               // integer visual scale multiplier (default 1)
}

export interface Sprite {        // owned by ecs; read by renderer; added by anyone drawable
  atlasId: string;             // key into AssetRegistry
  frame: string;               // frame name within the atlas (or animation base)
  layer: RenderLayer;
  tint: Hex;                   // 0xffffff = untinted
  alpha: number;               // 0..1
  glow: number;                // 0..1 additive-light contribution (0 = no glow)
  glowColor: Hex;
  flipX: boolean;
  visible: boolean;
  animFps: number;             // 0 = static frame; >0 plays <frame>_f1.._fN
  animLoop: boolean;
}

export interface Collider { radius: number; }          // circle collider (bullet-hell)
export interface Faction   { value: Faction; }         // 'player' | 'enemy' | 'neutral'
export interface Health    { hp: number; max: number; invulnUntil: Milliseconds; }
export interface Lifetime  { remainingMs: Milliseconds; } // auto-destroyed at <=0

export const CTransform: ComponentType<Transform>;
export const CSprite:    ComponentType<Sprite>;
export const CCollider:  ComponentType<Collider>;
export const CFaction:   ComponentType<Faction>;
export const CHealth:    ComponentType<Health>;
export const CLifetime:  ComponentType<Lifetime>;
```

## INTERFACE
```ts
export interface World {
  create(): EntityId;
  destroy(id: EntityId): void;                 // deferred until end of tick; safe mid-iteration
  alive(id: EntityId): boolean;

  add<T>(id: EntityId, type: ComponentType<T>, init?: Partial<T>): T;
  get<T>(id: EntityId, type: ComponentType<T>): T | undefined;
  has(id: EntityId, type: ComponentType<unknown>): boolean;
  remove(id: EntityId, type: ComponentType<unknown>): void;

  // Iterate every alive entity that has ALL given component types.
  each(types: ComponentType<unknown>[], fn: (id: EntityId) => void): void;
  query(types: ComponentType<unknown>[]): Iterable<EntityId>;

  flushDestroyed(): void;                      // called once per tick by the loop
  readonly count: number;
}

export function createWorld(capacityHint?: number): World;
```

## DEPENDENCIES
`shared/types`. Nothing else.

## ACCEPTANCE (Part 5 #4)
- 500+ live entities and 300+ projectiles with **no GC spikes** — component objects
  are reused, `each`/`query` allocate nothing per call on the steady-state path.
- `destroy` mid-iteration is safe (deferred, applied on `flushDestroyed`).
- `EntityId`s are recycled; a destroyed id never resolves as `alive` afterward.
- Adding a component a second time returns the existing struct (no dup pools).
