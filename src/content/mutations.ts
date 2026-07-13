// Elite MODIFIER mutations — one aura color each, rolled by depth. They multiply
// the small enemy roster into many encounter states because you read the delta
// against a learned base (Nuclear Throne / EtG). Behaviors reuse existing seams
// (hazard trail, death-ring emitter, speed) — see dive.ts.

import type { Rng } from "../core/rng";

export interface Mutation {
  id: string;
  name: string;
  aura: number; // enemy glow tint (on the enemy, never the diver — light budget)
}

export const MUTATIONS: Mutation[] = [
  { id: "irradiated", name: "Irradiated", aura: 0x8fe04a }, // leaves a poison damage-trail
  { id: "bloomed", name: "Bloomed", aura: 0xff8f7a }, // bursts a ring of bullets on death
  { id: "voltaic", name: "Voltaic", aura: 0xffe08a }, // faster + more aggressive
];
export const MUTATION_BY_ID: Record<string, Mutation> = Object.fromEntries(MUTATIONS.map((m) => [m.id, m]));

/** Roll a mutation for a spawn (chance scales with depth). null = plain. */
export function rollMutation(rng: Rng, tier: number): string | null {
  if (!rng.chance(Math.min(0.42, tier * 0.09))) return null;
  return rng.pick(MUTATIONS).id;
}
