// Procedural cavern generation — every dive is a new PLACE, not a reshuffle.
//
// The algorithm (all seeded, deterministic per run):
//  1. PERIMETER WALL: march around the arena border placing overlapping rock
//     circles whose inset from the edge is driven by layered sine noise — an
//     organic cave wall that bulges and recedes. A few stretches are skipped
//     entirely (gaps read as passages to open water and keep it airy).
//  2. INTERIOR FORMATIONS: a handful of random-walk chains of 2-5 rocks —
//     islands to weave around. Never near the player start, never near each
//     other: the field stays MOSTLY OPEN by construction.
//  3. SURFACE GROWTH: flora is planted ON the rocks — upright on top edges
//     (like growth catching the light) — so life follows the terrain instead
//     of floating in space. No prop rotation: everything stands up.
//
// Rocks are returned as circle Obstacles (the existing collision system) and
// growth as Props anchored at the planting point.

import type { Obstacle, Prop, Vec2 } from "../core/types";
import { Rng } from "../core/rng";

export interface CavernOpts {
  bounds: { w: number; h: number };
  playerStart: Vec2;
  rockiness: number; // 0..1 — how much wall/formation coverage (deeper = rockier)
  wallSprites: string[]; // rock sprite pool (must be non-empty)
  growthSprites: string[]; // flora planted on surfaces
  keepClear?: Vec2[]; // extra points that must stay unblocked (portals etc. placed later)
}

export interface Cavern {
  obstacles: Obstacle[];
  growth: Prop[];
}

/** Layered sine noise in [0,1] — cheap, seeded, smooth along t. */
function noise1d(rng: Rng): (t: number) => number {
  const f1 = rng.range(1.5, 2.6);
  const f2 = rng.range(3.4, 5.2);
  const f3 = rng.range(7.1, 9.7);
  const p1 = rng.range(0, Math.PI * 2);
  const p2 = rng.range(0, Math.PI * 2);
  const p3 = rng.range(0, Math.PI * 2);
  return (t: number) => {
    const v =
      Math.sin(t * f1 * Math.PI * 2 + p1) * 0.55 +
      Math.sin(t * f2 * Math.PI * 2 + p2) * 0.3 +
      Math.sin(t * f3 * Math.PI * 2 + p3) * 0.15;
    return v * 0.5 + 0.5;
  };
}

export function generateCavern(seed: number, opts: CavernOpts): Cavern {
  const rng = new Rng((seed ^ 0x5f3759df) >>> 0);
  const { bounds, playerStart, rockiness } = opts;
  const obstacles: Obstacle[] = [];
  const growth: Prop[] = [];
  if (!opts.wallSprites.length) return { obstacles, growth };

  const clear = (x: number, y: number, r: number): boolean => {
    if (Math.hypot(x - playerStart.x, y - playerStart.y) < 340 + r) return false;
    for (const k of opts.keepClear ?? []) {
      if (Math.hypot(x - k.x, y - k.y) < 200 + r) return false;
    }
    return true;
  };

  // ---- 1. perimeter wall ----
  // Parametrize the border 0..1 (clockwise), march in steps sized to rock radii
  // so neighbors overlap into a continuous wall. Noise drives the inset; gap
  // noise drops whole stretches so the wall breathes.
  const perim = 2 * (bounds.w + bounds.h);
  const inset = noise1d(rng);
  const gapNoise = noise1d(rng);
  const gapThreshold = 0.32 - rockiness * 0.14; // rockier = fewer gaps
  let dist = rng.range(0, 120);
  while (dist < perim) {
    const t = dist / perim;
    const r = rng.range(42, 66) * (1 + rockiness * 0.35);
    dist += r * rng.range(1.15, 1.5); // advance before any skip so gaps end
    if (gapNoise(t) < gapThreshold) continue; // a passage — no wall here
    // Border point at arc-distance
    let x: number;
    let y: number;
    let nx: number; // inward normal
    let ny: number;
    let d = dist % perim;
    if (d < bounds.w) {
      x = d; y = 0; nx = 0; ny = 1;
    } else if (d < bounds.w + bounds.h) {
      x = bounds.w; y = d - bounds.w; nx = -1; ny = 0;
    } else if (d < 2 * bounds.w + bounds.h) {
      x = bounds.w - (d - bounds.w - bounds.h); y = bounds.h; nx = 0; ny = -1;
    } else {
      x = 0; y = bounds.h - (d - 2 * bounds.w - bounds.h); nx = 1; ny = 0;
    }
    const push = 30 + inset(t) * (90 + rockiness * 90); // bulge into the field
    const cx = x + nx * push + rng.range(-14, 14);
    const cy = y + ny * push + rng.range(-14, 14);
    if (!clear(cx, cy, r)) continue;
    obstacles.push({ pos: { x: cx, y: cy }, radius: r, sprite: rng.pick(opts.wallSprites), scale: (r * 2.15) / 60 });
  }

  // ---- 2. interior formations ----
  const clusters = Math.round(1 + rockiness * 3.5);
  for (let c = 0; c < clusters; c++) {
    // Find a cluster anchor far from start, existing rocks, and keep-clears.
    let ax = 0;
    let ay = 0;
    let ok = false;
    for (let tries = 0; tries < 30 && !ok; tries++) {
      ax = rng.range(bounds.w * 0.18, bounds.w * 0.82);
      ay = rng.range(bounds.h * 0.18, bounds.h * 0.82);
      ok = clear(ax, ay, 90) && obstacles.every((o) => Math.hypot(ax - o.pos.x, ay - o.pos.y) > o.radius + 300);
    }
    if (!ok) continue;
    // Random-walk a chain of rocks out from the anchor.
    const links = rng.int(2, 5);
    let px = ax;
    let py = ay;
    let dir = rng.range(0, Math.PI * 2);
    for (let i = 0; i < links; i++) {
      const r = rng.range(38, 64);
      if (clear(px, py, r)) {
        obstacles.push({ pos: { x: px, y: py }, radius: r, sprite: rng.pick(opts.wallSprites), scale: (r * 2.15) / 60 });
      }
      dir += rng.range(-0.9, 0.9);
      const step = r * rng.range(1.2, 1.7);
      px += Math.cos(dir) * step;
      py += Math.sin(dir) * step;
      px = Math.max(120, Math.min(bounds.w - 120, px));
      py = Math.max(120, Math.min(bounds.h - 120, py));
    }
  }

  // ---- 3. surface growth ----
  // Plant upright flora on rocks whose TOP edge faces playable space (skip the
  // top-perimeter wall — its top faces out of the map). Sparse: not every rock.
  if (opts.growthSprites.length) {
    for (const o of obstacles) {
      if (o.pos.y < bounds.h * 0.14) continue; // top wall — top faces outward
      if (!rng.chance(0.42)) continue;
      const n = rng.chance(0.3) ? 2 : 1;
      for (let i = 0; i < n; i++) {
        const gx = o.pos.x + rng.range(-o.radius * 0.5, o.radius * 0.5);
        const gy = o.pos.y - o.radius + rng.range(-4, 2);
        growth.push({ sprite: rng.pick(opts.growthSprites), pos: { x: gx, y: gy }, scale: rng.range(0.8, 1.2), glow: false });
      }
    }
  }

  return { obstacles, growth };
}
