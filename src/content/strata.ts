// The Descent Column — 6 authored strata you drop between. Each is a distinct
// PLACE: its own palette, prop set, fauna, resource, and a threshold beat. Depth
// stops being a counter and becomes geography ("I died in the Wreck"). Reaching
// the Cradle (stratum 5) is the floor. buildStratum(index) parametrizes one arena.

import type { AssetStore } from "../engine/assets";
import type { Current, EnemyKind, Obstacle, Prop, Vec2 } from "../core/types";
import type { InteractableData, InteractableKind } from "../systems/interactables";
import { Rng } from "../core/rng";
import { generateCavern, type Cavern } from "./cavegen";

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
  cavern: Cavern; // carved-space source of truth (collision, bullets, darkness)
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

// MAP-RULES B3/C-section: caves pools are SOLID-MASS rock only (wispy corals
// live in decor/growth); each stratum owns a distinct palette + motif —
// Vents is EMBER (crystal + chimneys, no recycled Wreck barrels).
export const STRATA: Stratum[] = [
  { name: "Twilight Drift", tagline: "eerie open midwater", bg: 0x0a1a2e, structSheet: "twilight_drift_props", glow: ["plankton_dense", "plankton_sparse", "jelly_colony"], fauna: [{ kind: "spitter", weight: 3 }, { kind: "darter", weight: 1 }], resource: "lumen", landmark: "suspended_coral_chunk", caves: ["floating_reef_chunk", "abyssal_root_mass", "amber_sponge"], decor: ["fan_coral", "tube_coral", "amber_sponge", "lure_grass"], ambient: ["jelly_mushroom_cluster", "danger_anemone"] },
  // FULL LEVEL — a dense, living kelp forest.
  { name: "Kelp Forest", tagline: "occlusion and ambush", bg: 0x0c3322, structSheet: "kelp_forest_props", glow: ["sprout_aqua_1", "sprout_aqua_2", "sprout_amber_1", "tangle_glowing"], fauna: [{ kind: "darter", weight: 3 }, { kind: "spitter", weight: 2 }], resource: "spore", landmark: "tangle_large_a", caves: ["abyssal_root_mass", "floating_reef_chunk"], decor: ["kelp_tall_a", "kelp_tall_b", "kelp_branching", "kelp_bush", "lure_grass"], ambient: ["angler_plant", "danger_anemone", "jelly_mushroom_cluster"] },
  // FULL LEVEL — a broken industrial wreck.
  { name: "The Wreck", tagline: "tight salvage, mechanical hazards", bg: 0x17130e, structSheet: "wreck_thermal_props", glow: ["emergency_lamp", "gas_pocket"], fauna: [{ kind: "darter", weight: 2 }, { kind: "spitter", weight: 2 }, { kind: "drifter", weight: 1 }], resource: "alloy", landmark: "vent_chimney", caves: ["cargo_crate_closed", "rusted_barrel", "pipe_cluster", "floating_reef_chunk"], decor: ["cargo_crate_broken", "rusted_locker", "pipe_cluster", "large_valve", "chain_pile", "broken_console", "bollard", "floor_grate", "specimen_canister_medium", "living_specimen_tank", "anchor"], ambient: ["floodlight_on", "terminal_a", "terminal_b", "damaged_generator"] },
  { name: "Thermal Vents", tagline: "eruptions and aggression", bg: 0x2e0c06, structSheet: "wreck_thermal_props", glow: ["sparking_cable", "gas_pocket"], fauna: [{ kind: "darter", weight: 2 }, { kind: "drifter", weight: 2 }, { kind: "spitter", weight: 1 }], resource: "ember", landmark: "vent_chimney", caves: ["crystal_coral", "vent_chimney", "floating_reef_chunk"], decor: ["crystal_coral", "amber_sponge", "thermal_vent_dormant", "power_cell"], ambient: ["electric_anemone", "damaged_generator", "wreck_generator_charge"] },
  { name: "Abyssal Plain", tagline: "dark, sparse, deadly", bg: 0x05080f, structSheet: "twilight_drift_props", glow: ["plankton_sparse"], fauna: [{ kind: "spitter", weight: 2 }, { kind: "drifter", weight: 3 }, { kind: "darter", weight: 1 }], resource: "shard", landmark: "dead_drifting_creature", caves: ["floating_reef_chunk", "crystal_coral", "abyssal_root_mass"], decor: ["crystal_coral", "abyssal_root_mass", "amber_sponge", "poison_seep"], ambient: ["egg_cluster", "electric_anemone", "jelly_mushroom_cluster"] },
  { name: "The Cradle", tagline: "the bottom — something waits", bg: 0x0b0616, structSheet: "twilight_drift_props", glow: ["plankton_dense", "jelly_colony"], fauna: [{ kind: "drifter", weight: 2 }, { kind: "spitter", weight: 1 }], resource: "relic", landmark: "tube_worm_colony", caves: ["crystal_coral", "abyssal_root_mass"], decor: ["crystal_coral", "amber_sponge", "rune_fragment", "leviathan_scale"], ambient: ["egg_cluster", "spawn_egg", "tube_worm_colony"] },
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
  // Expedition-scale maps: big, and DIFFERENT every run — size and aspect both
  // roll per seed, so one dive is a sprawling wide cavern, the next tall+deep.
  const bounds = {
    w: Math.round((3000 + si * 260) * rng.range(0.85, 1.18)),
    h: Math.round((2400 + si * 200) * rng.range(0.85, 1.18)),
  };

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

  // ---- carved cavern FIRST: rooms + tunnels own the space; the generator owns
  // the player start and every anchor. Everything else decorates INSIDE it. ----
  const caves = S.caves.filter((n) => assets.sprites[n]);
  const growthPool = S.decor.filter((n) => assets.sprites[n] && /kelp|coral|grass|sponge|sprout|root|frond|anemone/i.test(n));
  const cavern = generateCavern(seed + si * 7919, {
    bounds,
    rockiness: 0.22 + si * 0.12, // Twilight airy -> Cradle rocky
    isFloor: si === STRATA.length - 1,
    wallSprites: caves.length ? caves : ["floating_reef_chunk"],
    growthSprites: growthPool.length ? growthPool : decorSprites,
  });
  const playerStart = cavern.anchors.start;
  const obstacles = cavern.obstacles;
  const inRock = (p: Vec2, pad: number): boolean => obstacles.some((o) => Math.hypot(p.x - o.pos.x, p.y - o.pos.y) < o.radius + pad);

  const props: Prop[] = [];
  // Boundary rock dressing renders FIRST (under the free decor + growth).
  props.push(...cavern.wallRocks);
  const placed: Vec2[] = [playerStart];
  const scatter = (pool: string[], count: number, glow: boolean, isAnim: boolean, sr: [number, number], gap: number) => {
    if (!pool.length) return;
    let tries = 0;
    let made = 0;
    while (made < count && tries < count * 16) {
      tries++;
      const pos = { x: rng.range(70, bounds.w - 70), y: rng.range(70, bounds.h - 70) };
      if (!cavern.inside(pos.x, pos.y, 40)) continue; // only decorate carved water
      if (!farFrom(pos, placed, gap)) continue;
      if (Math.hypot(pos.x - playerStart.x, pos.y - playerStart.y) < 190) continue;
      if (inRock(pos, 26)) continue;
      const name = rng.pick(pool);
      props.push({ sprite: name, pos, scale: rng.range(sr[0], sr[1]), glow, animation: isAnim ? name : undefined });
      placed.push(pos);
      made++;
    }
  };
  // Fresh curated decor leads; the old struct sheet fills in behind it. Counts
  // scale with arena area so expedition-size maps don't feel bare.
  const areaK = Math.min(3, (bounds.w * bounds.h) / (1900 * 1500));
  const n = (base: number) => Math.round(base * areaK);
  scatter(decorSprites, n(richness >= 6 ? 12 : 8), false, false, [0.85, 1.5], 120);
  scatter(decorAnims, n(4), false, true, [0.9, 1.35], 150);
  scatter(structPool, n(richness >= 6 ? 4 : 7), false, false, [1, 1.5], 130);
  if (kelp.length) scatter(kelp, n(6), false, false, [1, 1.4], 110); // kelp forest verticals
  scatter(glowSprites, n(8), true, false, [1, 1.4], 100);
  scatter(glowAnims, n(5), true, true, [1, 1.3], 140);
  // Sparse animated "life" props (anemones, vents, generators, eggs).
  scatter(ambSprites, n(4), false, false, [0.9, 1.3], 220);
  scatter(ambAnims, n(4), false, true, [0.9, 1.25], 240);
  // Growth planted ON the rock surfaces by the generator (upright, terrain-bound).
  props.push(...cavern.growth);

  // Currents (teach flow) — unchanged shape.
  const currents: Current[] = [];
  if (assets.has("current_ribbon")) {
    currents.push({ pos: { x: bounds.w * 0.5, y: bounds.h * 0.33 }, half: { x: bounds.w * 0.5, y: 100 }, force: { x: 240, y: 0 }, sprite: "current_ribbon" });
    currents.push({ pos: { x: bounds.w * 0.72, y: bounds.h * 0.66 }, half: { x: 120, y: bounds.h * 0.4 }, force: { x: 0, y: -220 }, sprite: "current_ribbon" });
  }

  // Spawn points come from the generator — distributed across rooms + tunnels.
  const spawns: Vec2[] = cavern.anchors.spawnPoints;

  // Interactables — the generator tags rooms: portal at the BFS-far room, vents
  // spread apart, relic in a dead-end alcove; loot uses pre-validated spots.
  const interactables: InteractableData[] = [];
  const lootQueue = cavern.anchors.lootSpots.slice();
  const takeLoot = (kind: InteractableKind) => {
    const pos = lootQueue.shift();
    if (pos) {
      interactables.push({ kind, pos });
      placed.push(pos);
      return;
    }
    for (let t = 0; t < 30; t++) {
      const p = { x: rng.range(120, bounds.w - 120), y: rng.range(120, bounds.h - 120) };
      if (!cavern.inside(p.x, p.y, 70)) continue;
      if (!farFrom(p, placed, 130)) continue;
      interactables.push({ kind, pos: p });
      placed.push(p);
      return;
    }
  };
  takeLoot("loot_pod");
  takeLoot("loot_pod");
  takeLoot("salvage_crate");
  takeLoot("salvage_crate");
  takeLoot("mineral_crystal");
  takeLoot("research_probe");
  takeLoot("bubble_vent");
  takeLoot("bubble_vent");
  // Ascend vents — the extract decision. Two rooms apart, always reachable.
  for (const v of cavern.anchors.vents) interactables.push({ kind: "ascend_vent", pos: v });
  // Descent portal — the ONLY way deeper, in the room farthest from the start
  // (the run's journey is literally across the cavern). Floor has none.
  if (cavern.anchors.portal) interactables.push({ kind: "descend_portal", pos: cavern.anchors.portal });
  // Hidden relic in a dead-end alcove (rewards exploring the side branches).
  interactables.push({ kind: "relic", pos: cavern.anchors.relic });

  // Hero landmark — an oversized far beacon. It sits beyond the walls now, so
  // the darkness overlay turns it into a half-seen silhouette (mystery > clutter).
  // On the FLOOR it becomes the cradle centerpiece at the boss arena's heart.
  let landmark: ArenaData["landmark"] = null;
  if (assets.sprites[S.landmark]) {
    if (si === STRATA.length - 1) {
      landmark = { sprite: S.landmark, pos: { x: cavern.anchors.start.x, y: cavern.anchors.start.y - 620 }, scale: rng.range(3.4, 4.0) };
    } else {
      const corner = rng.int(0, 3);
      const lx = corner % 2 === 0 ? bounds.w * 0.16 : bounds.w * 0.84;
      const ly = corner < 2 ? bounds.h * 0.18 : bounds.h * 0.82;
      landmark = { sprite: S.landmark, pos: { x: lx, y: ly }, scale: rng.range(3.2, 4.2) };
    }
  }

  return { bounds, playerStart, props, obstacles, currents, spawns, interactables, name: S.name, tagline: S.tagline, bg: S.bg, fauna: S.fauna, resource: S.resource, isFloor: si === STRATA.length - 1, landmark, cavern };
}
