// Vitality — procedural life for the (art-less) actor views: idle breathe + a
// volume-preserving velocity squash/stretch. No frames, no art. A per-entity phase
// desyncs a crowd so nothing pulses in unison.

import type { Container } from "pixi.js";

export function phaseOf(x: number, y: number): number {
  return ((x * 0.137 + y * 0.371) % (Math.PI * 2)) + Math.PI;
}

/** Idle breathe: a subtle volume-held scale wobble (bell/spike "aliveness"). */
export function breathe(view: Container, t: number, phase: number, amp: number, speed: number, base = 1): void {
  const s = base * (1 + amp * Math.sin(t * speed + phase));
  view.scale.set(s);
}

/** Velocity squash/stretch along local +x (view should face travel/aim). Volume-preserving. */
export function squashStretch(view: Container, speed: number, maxStretch = 0.3, breatheAmp = 0.03, t = 0, phase = 0): void {
  const st = Math.min(maxStretch, speed / 900);
  const b = 1 + breatheAmp * Math.sin(t * 1.6 + phase);
  view.scale.set((1 + st) * b, (1 / (1 + st)) * b);
}
