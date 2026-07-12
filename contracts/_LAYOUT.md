# FATHOM — Twilight Drift Vertical Slice · Module Layout & Build Order

Source of truth: `fathom-build-bible.md` (Parts 1–5, 7). Stack (locked): PixiJS v8 +
Vite + TypeScript; local-save-first (browser `localStorage`); real art extracted on
pass 1 from `Game asset (pictures with guide)/`. This file is the map; each
`contracts/<module>.md` is the buildable spec for one module.

> **Scope of this pass (only these):** asset-pipeline, core (state machine + loop +
> bus), ecs (foundational), renderer, input, movement, projectiles, enemy-spitter,
> worldgen (one hand-built arena), hud, loading, cutscene (cold-open), persistence.
> Player / Spitter / dog use **placeholder art** (not in the asset pack).

---

## 1. `src/` folder + file tree

```
fathom-videogame/
├─ index.html                      # Vite entry; mounts #app
├─ vite.config.ts
├─ tsconfig.json
├─ package.json
├─ public/
│  └─ atlas/                       # OUTPUT of the extraction pipeline (committed)
│     ├─ projectiles.png / .json
│     ├─ telegraphs.png / .json
│     ├─ vfx.png / .json
│     ├─ twilight_props.png / .json
│     └─ atlas-index.json          # { atlasId: {png,json,bytes} } — loader progress source
├─ scripts/
│  └─ extract-assets.ts            # BUILD-TIME CLI (Node). Not imported by the game.
└─ src/
   ├─ main.ts                      # bootstrap: create App, register states, run loop
   ├─ shared/
   │  ├─ types.ts                  # ← THE SHARED TYPES FILE (canonical, see §2)
   │  └─ vec2.ts                   # pure Vec2 math helpers
   ├─ ecs/
   │  ├─ world.ts                  # World, defineComponent, queries
   │  └─ components.ts             # CORE components: Transform, Sprite, Collider,
   │  │                            #   Health, Faction, Lifetime
   │  └─ index.ts
   ├─ core/
   │  ├─ state-machine.ts          # AppState FSM, guards, onEnter/onExit
   │  ├─ loop.ts                   # fixed-timestep loop + render interpolation
   │  ├─ event-bus.ts              # typed GameEvent bus
   │  ├─ context.ts                # FrameContext, System, Camera interface
   │  └─ index.ts
   ├─ assets/
   │  ├─ registry.ts               # runtime AssetRegistry (loads public/atlas/*)
   │  ├─ placeholders.ts           # generated placeholder frames (player/spitter/dog)
   │  └─ index.ts
   ├─ renderer/
   │  ├─ renderer.ts               # Pixi app, layers, world render system
   │  ├─ camera.ts                 # Camera impl (integer-snapped)
   │  ├─ fog.ts                    # capped-opacity tinted overlay
   │  ├─ light.ts                  # additive light layer
   │  └─ index.ts
   ├─ input/
   │  └─ input-manager.ts          # keyboard+mouse twin-stick → InputSnapshot
   ├─ movement/
   │  ├─ movement-system.ts        # drift + drag + currents + occluder collide
   │  ├─ body.ts                   # Body component
   │  └─ collision-world.ts        # CollisionWorld impl (built by worldgen)
   ├─ projectiles/
   │  ├─ emitter-spec.ts           # ← THE SHARED EmitterSpec data shape
   │  ├─ emitter-system.ts         # telegraph → fire volleys
   │  ├─ projectile-system.ts      # integrate/homing/ttl, pooled
   │  ├─ collision-system.ts       # bullet↔entity (faction-aware)
   │  └─ index.ts
   ├─ enemies/
   │  └─ spitter/
   │     ├─ spitter.ts             # spawnSpitter, SpitterBrain, spitterSystem
   │     └─ specs.ts               # radial + aimed EmitterSpec data
   ├─ worldgen/
   │  ├─ arena.ts                  # buildArena(world, def)
   │  ├─ twilight-drift.ts         # TWILIGHT_DRIFT: ArenaDef (hand-authored)
   │  └─ index.ts
   ├─ scenes/
   │  └─ dive-scene.ts             # wires systems in order for AppState.Dive
   ├─ hud/
   │  └─ hud.ts                    # health + depth gauge overlay
   ├─ loading/
   │  ├─ loader.ts                 # weighted LoadTask runner, accurate progress
   │  └─ loading-screen.ts         # depth-gauge visual
   ├─ cutscene/
   │  ├─ cutscene-player.ts        # data-driven step sequencer, hold-to-skip
   │  └─ cold-open.ts              # COLD_OPEN: CutsceneDef
   └─ persistence/
      └─ persistence.ts            # localStorage save: guestId + bestDepth
```

**Shared types file:** `src/shared/types.ts` (see §2). **Shared bullet data shape:**
`EmitterSpec` in `src/projectiles/emitter-spec.ts`. **Core component shapes:**
`src/ecs/components.ts`.

---

## 2. Shared types file — `src/shared/types.ts` (canonical)

Every module imports from here. No module redefines these.

```ts
export interface Vec2 { x: number; y: number; }
export interface Rect { x: number; y: number; w: number; h: number; }
export interface AABB  { min: Vec2; max: Vec2; }
export interface Circle { center: Vec2; radius: number; }
export type Shape = AABB | Circle;

export type EntityId     = number;   // dense integer handle from the World
export type Milliseconds = number;
export type Seconds      = number;
export type Radians      = number;
export type Hex          = number;   // 0xRRGGBB colour
export type RngFn        = () => number; // uniform [0,1)

export type Faction = 'player' | 'enemy' | 'neutral';

export type RenderLayer =
  | 'terrain' | 'props' | 'entities' | 'projectiles' | 'vfx';

export type AppState =
  | 'Boot' | 'Loading' | 'Cutscene' | 'Dive' | 'GameOver';

// Data-only physics types shared by movement (consumer) and worldgen (producer),
// so neither imports the other's implementation.
export interface CurrentField {
  area: Shape;
  force: Vec2;                       // constant push, world units/s^2
  falloff: 'none' | 'linear';       // linear = fades to 0 at area edge
}
export interface Occluder { shape: Shape; }       // solid, blocks movement

export interface CollisionWorld {                 // built by worldgen, read by movement
  queryOccluders(area: AABB): readonly Occluder[];
  readonly bounds: Rect;
}

export type Unsubscribe = () => void;
```

`src/shared/vec2.ts` exposes pure helpers (`add,sub,scale,len,norm,rot,dot,dist,
fromAngle,angle,lerp`) — all take/return `Vec2`, allocate sparingly (offer
`*Into(out,...)` variants for hot loops). Not repeated in module contracts.

---

## 3. Build order (topologically sorted)

Each wave may be built in parallel internally; a wave starts only when prior waves'
contracts are frozen (the interface, not the implementation, must exist).

| Wave | Modules | Why here |
|------|---------|----------|
| **0** | `shared/types`, `shared/vec2` | Everything imports these. Pure data + math. |
| **1** | `ecs`, `persistence`, `asset-pipeline` | Each depends only on shared. Fully independent of each other. |
| **2** | `core` | Needs ecs (World in FrameContext) + shared. Freezes `FrameContext`, `System`, `Camera`, `EventBus`. |
| **3** | `renderer`, `input`, `movement`, `projectiles` | All depend on ecs + core + shared (+ assets for renderer/projectiles). They touch **no** cross-module types beyond ecs components + `EmitterSpec` → build concurrently. |
| **4** | `enemy-spitter`, `hud`, `loading`, `cutscene` | spitter needs movement + projectiles; hud/loading/cutscene need renderer (+input for cutscene, +assets for loading). Independent of each other. |
| **5** | `worldgen` | Needs spitter (spawns them), assets (props), ecs, core. Produces `CollisionWorld`. |
| **6** | `scenes/dive-scene`, `main.ts` | Integration: wires the system order below. Owned by the parent, not a leaf. |

**System order inside one fixed tick** (Dive scene registers exactly this order):

```
1. input.sample(camera)              → ctx.input
2. spitterSystem(ctx)                → AI sets emitter targets / triggers
3. movementSystem(ctx)               → thrust + currents + integrate + occluder collide
4. emitterSystem(ctx)                → advance telegraph→fire, spawn bullets (pooled)
5. projectileSystem(ctx)             → integrate/homing/ttl bullets
6. projectileCollisionSystem(ctx)    → bullet↔entity, emit damage/death events
7. lifetimeSystem(ctx)               → decay Lifetime, destroy expired (telegraph vfx, bullets)
8. events flush                      → hud/persistence react (depthReached, entityDied)
--- once per RENDERED frame (may run >1 tick behind) ---
   renderer.renderWorld(ctx, alpha)  → interpolate Transform.pos↔prevPos by alpha
   hud.update(model)
```

---

## 4. Parallelizable vs must-be-serial

| Module | Can build in parallel with | Must wait for (serial dep) |
|--------|----------------------------|----------------------------|
| shared/types, vec2 | — (do first) | nothing |
| **ecs** | persistence, asset-pipeline | shared |
| **persistence** | ecs, asset-pipeline, everything | shared only — buildable at any time |
| **asset-pipeline** | ecs, persistence | shared (+ art files on disk) |
| **core** | — | ecs, shared |
| **renderer** | input, movement, projectiles | core, ecs, assets |
| **input** | renderer, movement, projectiles | core (Camera), shared |
| **movement** | renderer, input, projectiles | ecs, core, shared |
| **projectiles** | renderer, input, movement | ecs, core, assets, shared |
| **enemy-spitter** | hud, loading, cutscene | movement, projectiles, ecs, core |
| **hud** | spitter, loading, cutscene | renderer, core, shared |
| **loading** | spitter, hud, cutscene | assets, renderer, shared |
| **cutscene** | spitter, hud, loading | renderer, input, assets, core |
| **worldgen** | — | spitter, assets, ecs, core, movement types |
| **dive-scene / main** | — (last) | all of the above |

**Widest parallel fronts:** Wave 1 (ecs ∥ persistence ∥ asset-pipeline) and Wave 3
(renderer ∥ input ∥ movement ∥ projectiles). Those are the throughput wins — four
concurrent leaves in Wave 3, each building against frozen ecs/core contracts.

**Hard serial spine:** shared → ecs → core → (Wave 3) → projectiles/movement →
spitter → worldgen → dive-scene. Everything else hangs off it in parallel.

---

## 5. Cross-module interface freeze list (must hold before Wave 3 starts)

These are the contracts that, if they drift, cause merge pain. Freeze them first:

1. `EntityId`, `Vec2`, `Faction`, `RenderLayer`, `CollisionWorld`, `CurrentField`,
   `Occluder` — in `shared/types.ts`.
2. Core components (`Transform{pos,prevPos,rot,scale}`, `Sprite`, `Collider`,
   `Health`, `Faction`, `Lifetime`) — in `ecs/components.ts`.
3. `FrameContext`, `System`, `Camera`, `EventBus`, `GameEvent` — in `core`.
4. `EmitterSpec` + `BulletSpec` + `PatternSpec` + `TelegraphSpec` — in
   `projectiles/emitter-spec.ts`.
5. `AtlasFrame` / `FrameMap` + `AssetRegistry` — in `assets`.

Renderer, movement, projectiles, spitter, worldgen all build against 1–5 only.
```
