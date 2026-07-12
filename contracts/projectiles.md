# Contract — `projectiles` (data-driven emitter, shared by player + enemy)

> Part-5 subsystem #6 (Combat/Projectiles). **One** `EmitterSpec` data shape drives
> every pattern for both player weapons and enemy attacks. Every pattern is
> **telegraphed**. Pooled bullets, faction-aware collision. Runs at steps 4–6.

## PURPOSE
A RotMG-style pattern system authored entirely in data. New patterns = new
`EmitterSpec` data, no engine change (acceptance). A mandatory `TelegraphSpec`
means no bullet ever spawns without a readable wind-up (pillar 1).

## RESPONSIBILITIES
- Own `EmitterSpec`/`BulletSpec`/`PatternSpec`/`TelegraphSpec` (the shared shapes).
- `emitterSystem(ctx)` — advance each `Emitter` through
  `idle → telegraph(leadMs) → firing(burst) → cooldown`. On entering `telegraph`,
  spawn a short-lived telegraph vfx entity (Sprite from `telegraphs` atlas +
  `Lifetime`). On `firing`, spawn bullets per `PatternSpec` from a **pool**.
- `projectileSystem(ctx)` — integrate bullet motion (speed/accel), homing turn,
  decay `ttl`, return to pool on expiry.
- `projectileCollisionSystem(ctx)` — circle(`Collider`)-vs-`Collider`, faction-aware
  (player bullets hit `enemy`, enemy bullets hit `player`); emit `projectileHit`
  + `entityDamaged`; apply damage to `Health`; recycle bullet.
- Player helper: an `Emitter` owned by the player entity, aimed at `input.aimWorld`,
  firing while `input.firing`.

## KEY DATA
```ts
import { Vec2, Radians, Milliseconds, Faction, Hex, EntityId } from '../shared/types';
import { defineComponent, ComponentType } from '../ecs';

// ---- THE shared bullet data shape (src/projectiles/emitter-spec.ts) ----
export interface EmitterSpec {
  id: string;
  bullet: BulletSpec;
  pattern: PatternSpec;
  telegraph: TelegraphSpec;      // MANDATORY — no untelegraphed fire
  cooldownMs: Milliseconds;      // between volley cycles
  burst?: { count: number; intervalMs: Milliseconds }; // shots per trigger (default 1)
  inheritAim: boolean;           // true = aim at target/cursor; false = fixed baseAngle
  baseAngle?: Radians;
}
export interface BulletSpec {
  atlasId: string; frame: string;    // sprite (projectiles atlas)
  glow: number; glowColor: Hex;      // additive light contribution
  speed: number;                     // world units/s
  accel?: number;                    // +/- speed change per s (0 default)
  radius: number;                    // collider
  damage: number;
  ttlMs: Milliseconds;
  homing?: { turnRate: Radians };    // rad/s toward target (optional)
  faction: Faction;                  // who it can hit (opposite side)
}
export interface PatternSpec {
  kind: 'radial' | 'aimed' | 'spiral' | 'arc' | 'ring';
  count: number;                     // bullets per volley
  spreadDeg: number;                 // arc width; radial/ring = 360
  aimOffsetDeg?: number;
  spinDeg?: number;                  // per-volley rotation (spiral)
  jitterDeg?: number;                // random spread per bullet
}
export interface TelegraphSpec {
  shape: 'circle' | 'aim_line' | 'cone' | 'radial_spokes' | 'delayed_ring';
  leadMs: Milliseconds;              // wind-up before fire; enforce a floor (~250ms)
  frame: string;                     // telegraphs atlas frame
  color: Hex;
}

// ---- components ----
export interface Emitter {
  spec: EmitterSpec;
  enabled: boolean;
  phase: 'idle' | 'telegraph' | 'firing' | 'cooldown';
  phaseTimer: Milliseconds;
  volleyIndex: number;               // for burst + spiral spin
  target?: EntityId;                 // for aimed/homing
  aimOverride?: Vec2;                // e.g. player's cursor world pos
}
export interface Projectile {
  spec: BulletSpec;
  ttlRemaining: Milliseconds;
  homingTarget?: EntityId;
}
export const CEmitter: ComponentType<Emitter>;
export const CProjectile: ComponentType<Projectile>;
```

## INTERFACE
```ts
export function attachEmitter(world: World, owner: EntityId, spec: EmitterSpec): Emitter;
export function fireVolley(ctx: FrameContext, origin: Vec2, aim: Radians, spec: EmitterSpec): void;

export function emitterSystem(ctx: FrameContext): void;             // step 4
export function projectileSystem(ctx: FrameContext): void;          // step 5
export function projectileCollisionSystem(ctx: FrameContext): void; // step 6

export const PROJECTILE_POOL_CAPACITY: number; // >= 512 to hold 300+ live + churn
```

## DEPENDENCIES
`shared/types`, `ecs` (Transform/Collider/Health/Faction/Sprite/Lifetime), `core`
(FrameContext, events), `assets` (bullet + telegraph frames).

## ACCEPTANCE (Part 5 #6)
- A brand-new pattern is authored **in data only** (a new `EmitterSpec`), no code.
- Every pattern telegraphs: a visible wind-up (telegraph vfx) precedes every volley
  by `leadMs` (floored), for both player and enemy emitters.
- Player and enemy share this one system (same `EmitterSpec`, differ only by
  `faction` + `inheritAim`).
- 300+ live bullets at 60fps — bullets are pooled; no per-bullet allocation on
  spawn/despawn.
