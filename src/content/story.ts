// The narrative spine — the throughline voice at the Surface Station (the last
// diver who came back). Barks are keyed to your DEEPEST STRATUM reached and codex
// progress, so failure still advances the mystery (Hades' lever). All lines
// converge on one question: what is the Station farming, and what waits at the floor.

export interface Bark {
  minStratum: number; // deepest stratum reached
  minCodex: number; // species catalogued
  text: string;
}

export const BARKS: Bark[] = [
  { minStratum: 0, minCodex: 0, text: "“Another one going down. They always send another one.”" },
  { minStratum: 0, minCodex: 1, text: "“You catalogued the drift fauna. Good. The Station pays for what you bring back — not for you.”" },
  { minStratum: 1, minCodex: 0, text: "“The Kelp Forest? That grew over a camp. People, once. Keep descending.”" },
  { minStratum: 2, minCodex: 2, text: "“You reached the Wreck. That was the last whole ship they sent. It never surfaced. Neither did I, really.”" },
  { minStratum: 3, minCodex: 3, text: "“The drifters glow like your haul now. The deep is learning to look like us. Or we're learning to look like it.”" },
  { minStratum: 4, minCodex: 4, text: "“The Abyssal Plain answered my light. I dimmed it and it still found me. Don't linger bright down there.”" },
  { minStratum: 5, minCodex: 5, text: "“The Cradle. You saw the Warden's shape. Now you know what the first divers became — and what the Station is really farming.”" },
];

/** The single most-advanced bark whose thresholds are satisfied. */
export function pickBark(deepestStratum: number, codexCount: number): string {
  let best = BARKS[0];
  for (const b of BARKS) {
    if (deepestStratum >= b.minStratum && codexCount >= b.minCodex) {
      if (b.minStratum > best.minStratum || (b.minStratum === best.minStratum && b.minCodex >= best.minCodex)) best = b;
    }
  }
  return best.text;
}
