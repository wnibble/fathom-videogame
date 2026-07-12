// Shared types for the FATHOM vertical slice. Kept in one place so every module
// builds against the same contracts (see contracts/ for the per-module specs).

export interface Vec2 {
  x: number;
  y: number;
}

export type Faction = "player" | "enemy";

/**
 * Data-driven bullet pattern spec — the single shape every emitter (player weapon
 * or enemy attack) is authored in. New patterns are data, never code.
 */
export interface EmitterSpec {
  count: number; // bullets per burst
  spread: number; // total arc in radians the burst fans across (2π = full radial)
  speed: number; // px/sec
  bulletRadius: number; // collision radius (logical px)
  ttl: number; // bullet lifetime (sec)
  sprite: string; // atlas sprite key for the bullet
  aim: "radial" | "aimed" | "fixed"; // radial = ignore target; aimed = toward target; fixed = arcOffset
  arcOffset?: number; // base angle (rad) for radial/fixed
  bursts?: number; // number of bursts in one attack (default 1)
  burstInterval?: number; // sec between bursts (default 0)
  spin?: number; // rad added to arcOffset each burst (spiral)
  tint?: number; // glow tint
  damage?: number; // per-bullet damage (default 10)
  pierce?: number; // extra enemies a player bullet passes through (default 0)
  telegraph?: { sprite: string; time: number; scale?: number }; // wind-up shown before firing
}

export interface Bullet {
  active: boolean;
  pos: Vec2;
  vel: Vec2;
  radius: number;
  ttl: number;
  faction: Faction;
  sprite: string;
  tint: number;
  damage: number;
  pierce: number; // remaining enemies this bullet can pass through
  lastHit: Enemy | null; // guard against double-hitting the same enemy while overlapping
}

export type EnemyKind = "spitter";

export interface Enemy {
  alive: boolean;
  kind: EnemyKind;
  pos: Vec2;
  vel: Vec2;
  radius: number;
  hp: number;
  maxHp: number;
  // brain
  attackTimer: number; // counts down to next attack
  telegraphTimer: number; // >0 means currently telegraphing (about to fire)
  pendingSpec: EmitterSpec | null; // the attack that fires when telegraph ends
  strafeDir: number; // +1 / -1
  strafeTimer: number;
  attackCount: number; // # attacks fired (drives deterministic attack choice)
  spinSeed: number; // rotates radial-burst offset deterministically
  flash: number; // hit-flash timer
  elite: boolean; // tankier, richer loot, bigger threat glow
  bulletCount: number; // radial burst size (scales with depth tier)
  speed: number; // move speed (scales with depth tier)
}

export interface Player {
  pos: Vec2;
  vel: Vec2;
  radius: number;
  hp: number;
  maxHp: number;
  fireCooldown: number;
  invuln: number; // i-frames after a hit
  alive: boolean;
}

/** A directional current band that pushes entities inside it. */
export interface Current {
  pos: Vec2; // center
  half: Vec2; // half-extents of the band (AABB)
  force: Vec2; // px/sec^2 push applied to bodies inside
  sprite: string; // ribbon sprite key
}

/** A static, non-colliding set-dressing prop placed in the world. */
export interface Prop {
  sprite: string;
  pos: Vec2;
  scale: number;
  glow: boolean; // drawn in the additive light layer if true
  animation?: string; // animation group key (optional)
}
