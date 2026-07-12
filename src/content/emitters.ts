// Authored bullet patterns. Every attack (player + enemy) is DATA in this shape —
// new patterns need no engine code (Part 5 §6 acceptance). Every pattern that can
// hurt you carries a `telegraph` (pillar 1: readable danger, always telegraphed).

import type { EmitterSpec } from "../core/types";
import { COLOR } from "../palette";

// Player — a crisp aqua dart. Cool color = "yours" (readability color-language).
export const PLAYER_SHOT: EmitterSpec = {
  count: 1,
  spread: 0,
  speed: 560,
  bulletRadius: 4,
  ttl: 0.95,
  sprite: "aqua_pearl",
  aim: "aimed",
  tint: COLOR.aquaBright,
  damage: 10,
};

// Spitter — a telegraphed radial ring. Warm coral = danger.
export const SPITTER_RADIAL: EmitterSpec = {
  count: 14,
  spread: Math.PI * 2,
  speed: 165,
  bulletRadius: 5,
  ttl: 3.2,
  sprite: "coral_dart",
  aim: "radial",
  tint: COLOR.coralBright,
  damage: 12,
  telegraph: { sprite: "telegraph_radial_spokes", time: 0.62, scale: 1.3 },
};

// Spitter — a telegraphed aimed 3-shot spread. Amber warm.
export const SPITTER_AIMED: EmitterSpec = {
  count: 3,
  spread: 0.42,
  speed: 235,
  bulletRadius: 5,
  ttl: 2.6,
  sprite: "amber_seed",
  aim: "aimed",
  tint: COLOR.amberBright,
  damage: 12,
  telegraph: { sprite: "telegraph_aim_line", time: 0.5, scale: 1.2 },
};

export const SPITTER_ATTACKS: EmitterSpec[] = [SPITTER_RADIAL, SPITTER_AIMED];
