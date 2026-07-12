# Contract — `input` (keyboard + mouse twin-stick)

> Part-5 subsystem #3, slice scope = **keyboard + mouse twin-stick** only
> (gamepad/touch deferred). Produces the `InputSnapshot` on `FrameContext`.

## PURPOSE
Sample raw keyboard/mouse into a normalized, per-tick `InputSnapshot`: WASD move
vector, mouse-derived aim (resolved to world space via the `Camera`), and edge-
detected action buttons. One snapshot object, reused each tick (no per-frame alloc).

## RESPONSIBILITIES
- Track held keys + mouse position + mouse buttons via DOM listeners on a target.
- Produce `move` (WASD → clamped unit-ish vector) and `aimWorld` (cursor projected
  to world through `camera.screenToWorld`), plus `aim` (unit dir player→cursor,
  filled by the consumer or left as screen-relative — see note).
- Edge detection: expose both held state and `justPressed` for one-shot actions
  (fire is held; pause/skip are edge).
- `sample(camera)` is called at **step 1** of the tick and writes into the shared
  snapshot that the loop puts on `ctx.input`.

## KEY DATA
```ts
import { Vec2 } from '../shared/types';
import { Camera } from '../core';

export interface InputSnapshot {
  move: Vec2;        // WASD, each axis -1..1 (normalized if diagonal)
  aimWorld: Vec2;    // cursor in world coordinates (via camera)
  aimScreen: Vec2;   // raw cursor in canvas px
  firing: boolean;   // mouse button held
  boost: boolean;    // held (e.g. Shift / Space)
  scan: boolean;     // held (e.g. E)
  pausePressed: boolean;  // edge
  skipHeld: boolean;      // hold-to-skip cutscene
  anyKeyPressed: boolean; // edge, for "press to continue"
}

export const DEFAULT_BINDINGS: {
  moveUp: string[]; moveDown: string[]; moveLeft: string[]; moveRight: string[];
  boost: string[]; scan: string[]; pause: string[]; skip: string[];
  fire: 'mouse0';
};
```

## INTERFACE
```ts
export interface InputManager {
  attach(target: HTMLElement): void;      // add DOM listeners (canvas)
  detach(): void;
  sample(camera: Camera): InputSnapshot;  // recompute + return the shared snapshot
  readonly snapshot: Readonly<InputSnapshot>;
}
export function createInputManager(bindings?: typeof DEFAULT_BINDINGS): InputManager;
```
Note: `move` is consumed by the movement system as thrust direction for the
player-controlled entity; `aimWorld` is consumed by the player emitter to orient
fire and by movement/renderer for facing. Aim direction relative to the player is
computed by consumers (they know the player position), keeping input position-free.

## DEPENDENCIES
`shared/types`, `core` (Camera). No renderer dependency.

## ACCEPTANCE (Part 5 #3)
- Twin-stick feel: move on WASD, aim on cursor, fire on mouse — independent.
- `sample` allocates nothing steady-state (reuses the snapshot).
- Held vs edge is correct across ticks (fire holds; pause/skip don't repeat).
- Deterministic within a tick: one `sample` per tick, consumed by all systems.
