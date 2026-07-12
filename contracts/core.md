# Contract — `core` (state machine + loop + event bus)

> Part-5 subsystem #1 (Core/State Machine). Owns app states, the fixed-timestep
> game loop, the typed event bus, and the `FrameContext`/`System`/`Camera`
> contracts every gameplay system runs against.

## PURPOSE
The spine. Drives states (Boot→Loading→Cutscene→Dive→GameOver), runs a
deterministic fixed-timestep update loop with render interpolation, and hands every
system a single `FrameContext`. Defines the `Camera` interface (renderer implements
it) so input/cutscene depend on core, not renderer.

## RESPONSIBILITIES
- App state FSM with guarded transitions; each state has `onEnter/onExit/onTick`.
- Guarantee: **no soft-locks — every state has a defined exit** (acceptance).
- Fixed-timestep loop: accumulate real time, step logic at a constant `dt`
  (1/60 s), render at display rate with an interpolation `alpha`.
- Own the active `World` and the ordered `System[]` for the current state; call
  `world.flushDestroyed()` after the system pass each tick.
- Typed `EventBus` (emit/on) for decoupled cross-module signals.

## KEY DATA
```ts
import { AppState, Seconds, Vec2, Rect, EntityId, Faction, RngFn, Unsubscribe } from '../shared/types';
import { World } from '../ecs';

export const FIXED_DT: Seconds; // = 1/60

export interface Camera {                 // interface only; renderer provides the impl
  pos: Vec2;                              // world-space centre
  readonly viewport: Rect;               // logical (pre-scale) size in world units
  follow(target: EntityId | null, smoothing?: number): void;
  shake(magnitude: number, durationMs: number): void;
  worldToScreen(w: Vec2, out?: Vec2): Vec2;
  screenToWorld(s: Vec2, out?: Vec2): Vec2;
}

// Passed to every system, every tick. The single glue object.
export interface FrameContext {
  world: World;
  dt: Seconds;            // fixed step (FIXED_DT)
  elapsedMs: number;      // total sim time
  input: InputSnapshot;   // filled by input.sample() at step 1 (see input contract)
  camera: Camera;
  rng: RngFn;             // seeded; deterministic per run
  events: EventBus;
  collision: CollisionWorld; // supplied by the active arena (worldgen); read by movement
}

export type System = (ctx: FrameContext) => void;

// --- events ---
export type GameEvent =
  | { type: 'stateChanged'; from: AppState; to: AppState }
  | { type: 'entityDamaged'; id: EntityId; amount: number; source: Faction }
  | { type: 'entityDied'; id: EntityId; faction: Faction }
  | { type: 'projectileHit'; bullet: EntityId; victim: EntityId }
  | { type: 'depthReached'; depth: number }
  | { type: 'playerDied' };

export interface EventBus {
  emit(e: GameEvent): void;
  on<K extends GameEvent['type']>(
    type: K, handler: (e: Extract<GameEvent, { type: K }>) => void,
  ): Unsubscribe;
}
```

## INTERFACE
```ts
export interface StateDef {
  name: AppState;
  onEnter?(prev: AppState | null): void | Promise<void>;
  onExit?(next: AppState): void;
  onTick?(ctx: FrameContext): void;   // optional per-state hook, runs before systems
  systems?: System[];                 // ordered systems for this state (see _LAYOUT §3)
}

export interface StateMachine {
  register(def: StateDef): void;
  changeState(to: AppState): Promise<void>;   // runs onExit(prev)→onEnter(next); guarded
  readonly current: AppState;
}

export interface GameLoop {
  start(): void;
  stop(): void;
  onRender(cb: (alpha: number) => void): Unsubscribe; // alpha = interpolation factor 0..1
}

export function createEventBus(): EventBus;
export function createStateMachine(bus: EventBus): StateMachine;
export function createLoop(step: (dt: Seconds) => void): GameLoop; // fixed-step accumulator
```

`CollisionWorld` is imported from `shared/types`; before an arena is built, core
supplies a no-op `CollisionWorld` (empty bounds) so systems never null-check.

## DEPENDENCIES
`shared/types`, `ecs`. (Camera is an interface here; renderer supplies the concrete
object into `FrameContext` at Dive-scene wiring time.)

## ACCEPTANCE (Part 5 #1)
- No soft-locks: every registered state has a reachable exit transition; illegal
  transitions are rejected (guarded), never silently wedge.
- Loop steps logic at a constant `dt` regardless of frame rate; rendering
  interpolates so motion is smooth at 60fps display even if a frame is dropped.
- `changeState` emits `stateChanged`; re-entrant `changeState` during a transition
  is queued, not lost.
