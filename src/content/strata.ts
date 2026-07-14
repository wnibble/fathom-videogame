// The Descent Column — 6 authored strata you drop between. Each is a distinct
// PLACE: its own palette, prop set, fauna, resource, and a threshold beat. Depth
// stops being a counter and becomes geography ("I died in the Wreck"). Reaching
// the Cradle (stratum 5) is the floor. buildStratum(index) parametrizes one arena.

import type { AssetStore } from "../engine/assets";
import type { Current, EnemyKind, Obstacle, Prop, Vec2 } from "../core/types";
import type { InteractableData, InteractableKind } from "../systems/interactables";
import { Rng } from "../core/rng";
import { generateCavern } from "./cavegen";

export interface ArenaData {
  bounds: { w: number; h: number };
  playerStart: Vec2;
  props: Prop[];
  obstacles: Obstacle[];
  currents: Current[];
  spawns: Vec2[];
  interactables: InteractableData[];
  name: string;
  tagline: string;
  bg: number; // background fog tint for this stratum
  fauna: { kind: EnemyKind; weight: number }[];
  resource: string;
  isFloor: boolean;
  landmark: { sprite: string; pos: Vec2; scale: number } | null;
}

interface Stratum {
  name: string;
  tagline: string;
  bg: number;
  structSheet: string; // prop sheet for structural set-dressing
  glow: string[]; // curated glow sprite/anim names for bioluminescence
  fauna: { kind: EnemyKind; weight: number }[];
  resource: string;
  landmark: string; // an oversized far parallax landmark that gives the place character
  caves: string[]; // rock/cave sprites used as solid obstacles (from the new pack)
  decor: string[]; // curated new-pack set-dressing sprites/anims (fresh per place)
  ambient?: string[]; // animated hazard-like props scattered sparsely for life
}

// Depth (m) spent per stratum before descending to the next (with a fade + card).
export const STRATA_DEPTH = 220;

export const STRATA: Stratum[] = [
  { name: "Twilight Drift", tagline: "eerie open midwater", bg: 0x0a1a2e, structSheet: "twilight_drift_props", glow: ["plankton_dense", "plankton_sparse", "jelly_colony"], fauna: [{ kind: "spitter", weight: 3 }, { kind: "darter", weight: 1 }], resource: "lumen", landmark: "suspended_coral_chunk", caves: ["floating_reef_chunk", "fan_coral", "tube_coral", "amber_sponge"], decor: ["fan_coral", "tube_coral", "amber_sponge", "lure_grass"], ambient: ["jelly_mushroom_cluster", "danger_anemone"] },
  // FULL LEVEL — a dense, living kelp forest.
  { name: "Kelp Forest", tagline: "occlusion and ambush", bg: 0x0a241e, structSheet: "kelp_forest_props", glow: ["sprout_aqua_1", "sprout_aqua_2", "sprout_amber_1", "tangle_glowing"], fauna: [{ kind: "darter", weight: 3 }, { kind: "spitter", weight: 2 }], resource: "spore", landmark: "tangle_large_a", caves: ["abyssal_root_mass", "floating_reef_chunk", "tube_coral"], decor: ["kelp_tall_a", "kelp_tall_b", "kelp_branching", "kelp_bush", "lure_grass", "fan_coral"], ambient: ["angler_plant", "danger_anemone", "jelly_mushroom_cluster"] },
  // FULL LEVEL — a broken industrial wreck.
  { name: "The Wreck", tagline: "tight salvage, mechanical hazards", bg: 0x17130e, structSheet: "wreck_thermal_props", glow: ["emergency_lamp", "gas_pocket"], fauna: [{ kind: "darter", weight: 2 }, { kind: "spitter", weight: 2 }, { kind: "drifter", weight: 1 }], resource: "alloy", landmark: "vent_chimney", caves: ["cargo_crate_closed", "rusted_barrel", "pipe_cluster", "floating_reef_chunk"], decor: ["cargo_crate_broken", "rusted_locker", "pipe_cluster", "large_valve", "chain_pile", "broken_console", "bollard", "floor_grate"], ambient: ["floodlight_on", "terminal_a", "damaged_generator"] },
  { name: "Thermal Vents", tagline: "eruptions and aggression", bg: 0x1e0f0a, structSheet: "wreck_thermal_props", glow: ["sparking_cable", "gas_pocket"], fauna: [{ kind: "darter", weight: 2 }, { kind: "drifter", weight: 2 }, { kind: "spitter", weight: 1 }], resource: "ember", landmark: "pipe_cluster", caves: ["floating_reef_chunk", "crystal_coral", "rusted_barrel"], decor: ["pipe_cluster", "large_valve", "rusted_barrel", "amber_sponge"], ambient: ["thermal_vent_dormant", "damaged_generator", "wreck_generator_off"] },
  { name: "Abyssal Plain", tagline: "dark, sparse, deadly", bg: 0x05080f, structSheet: "twilight_drift_props", glow: ["plankton_sparse"], fauna: [{ kind: "spitter", weight: 2 }, { kind: "drifter", weight: 3 }, { kind: "darter", weight: 1 }], resource: "shard", landmark: "dead_drifting_creature", caves: ["floating_reef_chunk", "crystal_coral", "abyssal_root_mass"], decor: ["crystal_coral", "abyssal_root_mass", "amber_sponge"], ambient: ["egg_cluster", "ancient_eye_closed", "jelly_mushroom_cluster"] },
  { name: "The Cradle", tagline: "the bottom — something waits", bg: 0x0b0616, structSheet: "twilight_drift_props", glow: ["plankton_dense", "jelly_colony"], fauna: [{ kind: "drifter", weight: 2 }, { kind: "spitter", weight: 1 }], resource: "relic", landmark: "tube_worm_colony", caves: ["crystal_coral", "abyssal_root_mass"], decor: ["crystal_coral", "tube_coral", "amber_sponge"], ambient: ["egg_cluster", "tube_worm_colony", "jelly_mushroom_cluster"] },
];

// Sprite names owned by interactables — never scatter them as decoration.
const RESERVED = new Set([
  "loot_pod_closed", "loot_pod_wake", "loot_pod_open", "loot_pod_empty",
  "salvage_crate", "mineral_crystal", "research_probe", "bubble_vent", "fish_skeleton", "current_ribbon",
]);

function farFrom(p: Vec2, pts: Vec2[], min: number): boolean {
  return pts.every((q) => Math.hypot(p.x - q.x, p.y - q.y) >= min);
}

export function buildStratum(index: number, seed: number, assets: AssetStore): ArenaData {
  const si = Math.max(0, Math.min(STRATA.length - 1, index));
  const S = STRATA[si];
  const rng = new Rng((seed + si * 2654435761) >>> 0);
  // Map expands with depth — the deep opens up (1900x1500 -> ~2700x2100).
  const bounds = { w: 1900 + si * 160, h: 1500 + si * 120 };
  const playerStart = { x: bounds.w / 2, y: bounds.h / 2 };

  // Decoration pools from this stratum's sheet (structural sprites), plus curated glow.
  const structPool = assets.spritesInSheet(S.structSheet).filter((n) => !RESERVED.has(n) && !/^kelp_tall/.test(n));
  const glowSprites = S.glow.filter((n) => assets.sprites[n]);
  const glowAnims = S.glow.filter((n) => assets.anims[n]);
  const kelp = assets.spritesInSheet(S.structSheet).filter((n) => /^kelp_(tall|mid)/.test(n));
  // Curated fresh set-dressing from the new pack — the star of each authored place.
  const decorSprites = S.decor.filter((n) => assets.sprites[n]);
  const decorAnims = S.decor.filter((n) => assets.anims[n]);
  const ambSprites = (S.ambient ?? []).filter((n) => assets.sprites[n]);
  const ambAnims = (S.ambient ?? []).filter((n) => assets.anims[n]);
  const richness = decorSprites.length + decorAnims.length; // "full" levels have more

  // ---- procedural cavern FIRST: everything else placed around the terrain ----
  const caves = S.caves.filter((n) => assets.sprites[n]);
  const growthPool = S.decor.filter((n) => assets.sprites[n] && /kelp|coral|grass|sponge|sprout|root|frond|anemone/i.test(n));
  const cavern = generateCavern(seed + si * 7919, {
    bounds,
    playerStart,
    rockiness: 0.22 + si * 0.12, // Twilight airy -> Cradle rocky
    wallSprites: caves,
    growthSprites: growthPool.length ? growthPool : decorSprites,
  });
  const obstacles = cavern.obstacles;
  const inRock = (p: Vec2, pad: number): boolean => obstacles.some((o) => Math.hypot(p.x - o.pos.x, p.y - o.pos.y) < o.radius + pad);

  const props: Prop[] = [];
  const placed: Vec2[] = [playerStart];
  const scatter = (pool: string[], count: number, glow: boolean, isAnim: boolean, sr: [number, number], gap: number) => {
    if (!pool.length) return;
    let tries = 0;
    let made = 0;
    while (made < count && tries < count * 14) {
      tries++;
      const pos = { x: rng.range(70, bounds.w - 70), y: rng.range(70, bounds.h - 70) };
      if (!farFrom(pos, placed, gap)) continue;
      if (Math.hypot(pos.x - playerStart.x, pos.y - playerStart.y) < 190) continue;
      if (inRock(pos, 26)) continue; // free-floating decor stays off the rocks
      const name = rng.pick(pool);
      props.push({ sprite: name, pos, scale: rng.range(sr[0], sr[1]), glow, animation: isAnim ? name : undefined });
      placed.push(pos);
      made++;
    }
  };
  // Fresh curated decor leads; the old struct sheet fills in behind it (less of it
  // when the new pack is rich, so each place reads as its own authored world).
  scatter(decorSprites, richness >= 6 ? 14 : 9, false, false, [0.85, 1.5], 120);
  scatter(decorAnims, 4, false, true, [0.9, 1.35], 150);
  scatter(structPool, richness >= 6 ? 4 : 8, false, false, [1, 1.5], 130);
  if (kelp.length) scatter(kelp, 6, false, false, [1, 1.4], 110); // kelp forest verticals
  scatter(glowSprites, 8, true, false, [1, 1.4], 100);
  scatter(glowAnims, 5, true, true, [1, 1.3], 140);
  // Sparse animated "life" props (anemones, vents, generators, eggs).
  scatter(ambSprites, 4, false, false, [0.9, 1.3], 220);
  scatter(ambAnims, 4, false, true, [0.9, 1.25], 240);
  // Growth planted ON the rock surfaces by the generator (upright, terrain-bound).
  props.push(...cavern.growth);

  // Currents (teach flow) — unchanged shape.
  const currents: Current[] = [];
  if (assets.has("current_ribbon")) {
    currents.push({ pos: { x: bounds.w * 0.5, y: bounds.h * 0.33 }, half: { x: bounds.w * 0.5, y: 100 }, force: { x: 240, y: 0 }, sprite: "current_ribbon" });
    currents.push({ pos: { x: bounds.w * 0.72, y: bounds.h * 0.66 }, half: { x: 120, y: bounds.h * 0.4 }, force: { x: 0, y: -220 }, sprite: "current_ribbon" });
  }

  // Spawn points sit INSIDE the cavern walls (the border band is wall territory).
  const spawns: Vec2[] = [
    { x: bounds.w * 0.26, y: bounds.h * 0.28 }, { x: bounds.w * 0.74, y: bounds.h * 0.28 },
    { x: bounds.w * 0.26, y: bounds.h * 0.74 }, { x: bounds.w * 0.74, y: bounds.h * 0.72 },
    { x: bounds.w * 0.5, y: bounds.h * 0.24 }, { x: bounds.w * 0.5, y: bounds.h * 0.78 },
  ];
  // Nudge any spawn that landed inside cavern wall toward open water.
  for (const s of spawns) {
    for (let t = 0; t < 20 && inRock(s, 40); t++) {
      const dx = playerStart.x - s.x;
      const dy = playerStart.y - s.y;
      const l = Math.hypot(dx, dy) || 1;
      s.x += (dx / l) * 60;
      s.y += (dy / l) * 60;
    }
  }

  // Interactables — functional objects + a guaranteed hidden relic + Ascend vents.
  const interactables: InteractableData[] = [];
  const place = (kind: InteractableKind, minStartGap = 240) => {
    for (let t = 0; t < 44; t++) {
      const pos = { x: rng.range(100, bounds.w - 100), y: rng.range(100, bounds.h - 100) };
      if (Math.hypot(pos.x - playerStart.x, pos.y - playerStart.y) < minStartGap) continue;
      if (!farFrom(pos, placed, 130)) continue;
      if (inRock(pos, 46)) continue; // never bury a functional object in a wall
      interactables.push({ kind, pos });
      placed.push(pos);
      return;
    }
  };
  place("loot_pod", 180);
  place("loot_pod");
  place("salvage_crate");
  place("salvage_crate");
  place("mineral_crystal");
  place("research_probe");
  place("bubble_vent");
  place("bubble_vent");
  // Ascend vents — the extract decision. Two, so surfacing is always reachable.
  place("ascend_vent", 320);
  place("ascend_vent", 320);
  // Descent portal — the ONLY way deeper. A physical gateway you swim into, so
  // the terrain never changes under you: it changes because you chose to travel.
  // (The floor has no portal — the guardian + the Cradle are the end.)
  if (si < STRATA.length - 1) place("descend_portal", 360);
  // Hidden relic near an edge (rewards exploration) — tucked against the cave
  // wall but never inside it.
  let relicPos: Vec2 | null = null;
  for (let t = 0; t < 30 && !relicPos; t++) {
    const cand = rng.pick([
      { x: rng.range(120, 260), y: rng.range(160, bounds.h - 160) },
      { x: rng.range(bounds.w - 260, bounds.w - 120), y: rng.range(160, bounds.h - 160) },
      { x: rng.range(180, bounds.w - 180), y: rng.range(120, 260) },
      { x: rng.range(180, bounds.w - 180), y: rng.range(bounds.h - 260, bounds.h - 120) },
    ]);
    if (!inRock(cand, 30)) relicPos = cand;
  }
  interactables.push({ kind: "relic", pos: relicPos ?? { x: bounds.w * 0.5, y: bounds.h * 0.82 } });

  // Hero landmark — an oversized far beacon that gives the stratum character.
  let landmark: ArenaData["landmark"] = null;
  if (assets.sprites[S.landmark]) {
    const corner = rng.int(0, 3);
    const lx = corner % 2 === 0 ? bounds.w * 0.16 : bounds.w * 0.84;
    const ly = corner < 2 ? bounds.h * 0.18 : bounds.h * 0.82;
    landmark = { sprite: S.landmark, pos: { x: lx, y: ly }, scale: rng.range(3.2, 4.2) };
  }

  return { bounds, playerStart, props, obstacles, currents, spawns, interactables, name: S.name, tagline: S.tagline, bg: S.bg, fauna: S.fauna, resource: S.resource, isFloor: si === STRATA.length - 1, landmark };
}
