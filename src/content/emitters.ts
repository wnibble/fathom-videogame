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

// ---- pattern vocabulary (pass: "new shot patterns") ----

// Ring with a dodge LANE — denser + faster than the plain ring, but the gap is
// the taught escape. The lane points a fixed offset from the aim, so reading it
// is a skill.
export const SPITTER_GAP_RING: EmitterSpec = {
  count: 22,
  spread: Math.PI * 2,
  speed: 175,
  bulletRadius: 5,
  ttl: 3.4,
  sprite: "coral_dart",
  aim: "radial",
  tint: COLOR.coralBright,
  damage: 12,
  gapArc: 0.9,
  telegraph: { sprite: "telegraph_radial_spokes", time: 0.66, scale: 1.35 },
};

// Cross-burst — four tight prongs at 90°, rotated by spinSeed. Lanes between
// prongs are wide; pressure comes from the follow-up.
export const SPITTER_CROSS: EmitterSpec = {
  count: 12,
  spread: Math.PI * 2,
  speed: 210,
  bulletRadius: 5,
  ttl: 3.0,
  sprite: "amber_seed",
  aim: "radial",
  tint: COLOR.amberBright,
  damage: 12,
  gapArc: 1.1, // with count 12 + wide gaps every quarter via gapAt cycling in-brain
  telegraph: { sprite: "telegraph_radial_spokes", time: 0.56, scale: 1.2 },
};

// Wave wall — an aimed fan whose bullet speeds undulate, arriving as a rolling
// crest you weave through rather than a flat sheet.
export const SPITTER_WAVE: EmitterSpec = {
  count: 9,
  spread: 1.5,
  speed: 205,
  bulletRadius: 5,
  ttl: 3.0,
  sprite: "coral_dart",
  aim: "aimed",
  tint: COLOR.coral,
  damage: 12,
  speedSpread: 0.35,
  telegraph: { sprite: "telegraph_aim_line", time: 0.55, scale: 1.3 },
};

// Spiral volley — fired as a SEQUENCE by the enemy brain (volley state): short
// aimed pairs that rotate a step per shot, sweeping an arc like a fire hose.
export const SPITTER_SPIRAL_SHOT: EmitterSpec = {
  count: 2,
  spread: 0.16,
  speed: 195,
  bulletRadius: 5,
  ttl: 3.0,
  sprite: "amber_seed",
  aim: "fixed",
  tint: COLOR.amberBright,
  damage: 11,
  telegraph: { sprite: "telegraph_radial_spokes", time: 0.7, scale: 1.3 },
};

export const SPITTER_ATTACKS: EmitterSpec[] = [SPITTER_RADIAL, SPITTER_AIMED];
