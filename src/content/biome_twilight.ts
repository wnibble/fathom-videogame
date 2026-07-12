// Worldgen: assembles ONE Twilight Drift arena from handcrafted rules + seeded
// randomness (Part 5 §8). Always traversable, no props/enemies on top of the
// player start. Pulls set-dressing from the real extracted prop art.

import type { AssetStore } from "../engine/assets";
import type { Current, Prop, Vec2 } from "../core/types";
import { Rng } from "../core/rng";

export interface ArenaData {
  bounds: { w: number; h: number };
  playerStart: Vec2;
  props: Prop[];
  currents: Current[];
  spawns: Vec2[];
}

// Prefer these if present in the atlas; filtered against what actually extracted.
const GLOW_ANIMS = ["jelly_colony", "glow_orb", "research_probe"];
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

  // Structural set-dressing (world layer), then glowing bioluminescence (light layer).
  scatter(structSprites, 22, false, false, [1, 1.6], 90);
  scatter(glowSprites, 16, true, false, [1, 1.5], 70);
  scatter(glowAnims, 10, true, true, [1, 1.4], 120);

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

  return { bounds, playerStart, props, currents, spawns };
}
