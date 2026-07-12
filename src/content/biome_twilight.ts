// Worldgen: assembles ONE Twilight Drift arena from handcrafted rules + seeded
// randomness (Part 5 §8). Always traversable, no props/enemies on top of the
// player start. Pulls set-dressing from the real extracted prop art.

import type { AssetStore } from "../engine/assets";
import type { Current, Prop, Vec2 } from "../core/types";
import type { InteractableData, InteractableKind } from "../systems/interactables";
import { Rng } from "../core/rng";

export interface ArenaData {
  bounds: { w: number; h: number };
  playerStart: Vec2;
  props: Prop[];
  currents: Current[];
  spawns: Vec2[];
  interactables: InteractableData[];
}

// Prefer these if present in the atlas; filtered against what actually extracted.
// research_probe is now FUNCTIONAL (an interactable), not decoration.
const GLOW_ANIMS = ["jelly_colony", "glow_orb"];
const GLOW_SPRITES = ["plankton_dense", "plankton_ring", "plankton_cluster_large", "plankton_cluster_medium", "plankton_sparse"];
const STRUCT_SPRITES = [
  "suspended_coral_chunk", "floating_rock_large_a", "floating_rock_large_b",
  "floating_rock_med_a", "floating_rock_med_b", "floating_rock_small_a",
  "debris_coral_branch", "debris_vines", "debris_leaves", "dead_drifting_creature",
];

function farFrom(p: Vec2, pts: Vec2[], min: number): boolean {
  return pts.every((q) => Math.hypot(p.x - q.x, p.y - q.y) >= min);
}

export function buildTwilightArena(seed: number, assets: AssetStore): ArenaData {
  const rng = new Rng(seed);
  const bounds = { w: 1500, h: 1100 };
  const playerStart = { x: bounds.w / 2, y: bounds.h / 2 };

  const glowAnims = GLOW_ANIMS.filter((n) => assets.has(n));
  const glowSprites = GLOW_SPRITES.filter((n) => assets.has(n));
  const structSprites = STRUCT_SPRITES.filter((n) => assets.has(n));

  const props: Prop[] = [];
  const placed: Vec2[] = [playerStart];

  const scatter = (
    pool: string[],
    count: number,
    glow: boolean,
    isAnim: boolean,
    scaleRange: [number, number],
    minGap: number
  ) => {
    if (!pool.length) return;
    let tries = 0;
    let made = 0;
    while (made < count && tries < count * 12) {
      tries++;
      const pos = { x: rng.range(60, bounds.w - 60), y: rng.range(60, bounds.h - 60) };
      // keep the start clearing readable
      if (!farFrom(pos, placed, minGap)) continue;
      if (Math.hypot(pos.x - playerStart.x, pos.y - playerStart.y) < 170) continue;
      const name = rng.pick(pool);
      props.push({
        sprite: name,
        pos,
        scale: rng.range(scaleRange[0], scaleRange[1]),
        glow,
        animation: isAnim ? name : undefined,
      });
      placed.push(pos);
      made++;
    }
  };

  // Declutter ("purposeful density"): far fewer inert props — the survivors are
  // thin atmosphere, and functional interactables replace what was cut.
  scatter(structSprites, 10, false, false, [1, 1.5], 120);
  scatter(glowSprites, 8, true, false, [1, 1.4], 100);
  scatter(glowAnims, 5, true, true, [1, 1.3], 140);

  // Currents — steady, legible bands (pillar: intentional, not random).
  const currents: Current[] = [];
  if (assets.has("current_ribbon")) {
    currents.push({
      pos: { x: bounds.w * 0.5, y: bounds.h * 0.33 },
      half: { x: bounds.w * 0.5, y: 90 },
      force: { x: 240, y: 0 },
      sprite: "current_ribbon",
    });
    currents.push({
      pos: { x: bounds.w * 0.7, y: bounds.h * 0.66 },
      half: { x: 110, y: bounds.h * 0.4 },
      force: { x: 0, y: -230 },
      sprite: "current_ribbon",
    });
  }

  // Enemy spawn points — around the edges, away from the start.
  const spawns: Vec2[] = [
    { x: bounds.w * 0.2, y: bounds.h * 0.22 },
    { x: bounds.w * 0.8, y: bounds.h * 0.24 },
    { x: bounds.w * 0.25, y: bounds.h * 0.8 },
    { x: bounds.w * 0.78, y: bounds.h * 0.78 },
  ];

  // Functional interactables (loot pods, crates, crystals, a probe, vents) +
  // one guaranteed hidden relic near an arena edge (rewards exploration).
  const interactables: InteractableData[] = [];
  const placeInteractable = (kind: InteractableKind, minStartGap = 220) => {
    for (let t = 0; t < 40; t++) {
      const pos = { x: rng.range(90, bounds.w - 90), y: rng.range(90, bounds.h - 90) };
      if (Math.hypot(pos.x - playerStart.x, pos.y - playerStart.y) < minStartGap) continue;
      if (!farFrom(pos, placed, 120)) continue;
      interactables.push({ kind, pos });
      placed.push(pos);
      return;
    }
  };
  placeInteractable("loot_pod", 170); // one within sight of the start — early content
  placeInteractable("loot_pod");
  placeInteractable("salvage_crate");
  placeInteractable("salvage_crate");
  placeInteractable("mineral_crystal");
  placeInteractable("research_probe");
  placeInteractable("bubble_vent");
  placeInteractable("bubble_vent");
  // Relic: pinned near an edge so leaving the center pays off.
  const edge = rng.pick([
    { x: rng.range(80, 160), y: rng.range(120, bounds.h - 120) },
    { x: rng.range(bounds.w - 160, bounds.w - 80), y: rng.range(120, bounds.h - 120) },
    { x: rng.range(120, bounds.w - 120), y: rng.range(80, 160) },
    { x: rng.range(120, bounds.w - 120), y: rng.range(bounds.h - 160, bounds.h - 80) },
  ]);
  interactables.push({ kind: "relic", pos: edge });

  return { bounds, playerStart, props, currents, spawns, interactables };
}
