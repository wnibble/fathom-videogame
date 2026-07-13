// Codex species — one signature creature per stratum, catalogued by scanning a
// research probe. Lore drips the one mystery (what the Apex is, why the Station
// keeps sending divers) piece by piece as you go deeper.

export interface Species {
  key: string;
  name: string;
  stratum: number;
  lore: string;
  tell: string; // its attack read — the codex teaches you to survive it
}

export const SPECIES: Species[] = [
  { key: "drift-spitter", name: "Drift Spitter", stratum: 0, lore: "First light of the descent. It drifts where the sun still reaches — and where the Station's old buoys still blink.", tell: "Winds up, then fires a radial or aimed volley. Always telegraphed." },
  { key: "kelp-darter", name: "Kelp Darter", stratum: 1, lore: "It learned to hide in the drowned forest. The kelp grew over a research camp — its lamps still lit.", tell: "Stalks, freezes to wind up, then lunges. Dodge the commit, not the approach." },
  { key: "wreck-crawler", name: "Wreck Crawler", stratum: 2, lore: "Nests in the hull of the Cradle-runner, the last vessel the Station sent whole. It never came back up.", tell: "Mixed lunger and spitter. Reads the wreck's tight corridors — keep moving." },
  { key: "vent-drifter", name: "Vent Drifter", stratum: 3, lore: "Blooms in the heat. Its spores glow like the samples you carry — the deep is starting to imitate you.", tell: "Lays fading spore-mines in its wake. Deny space, not aim." },
  { key: "abyssal-shade", name: "Abyssal Shade", stratum: 4, lore: "In the dark it barely lights at all. The divers who reached here reported it answered their glow.", tell: "Sparse but deadly. Everything here hunts the bright." },
  { key: "cradle-warden", name: "Cradle Warden", stratum: 5, lore: "It guards the floor. It has a diver's silhouette. The first ones did not die down here — they became this.", tell: "The answer. The Station never told you what it was farming." },
];

export const SPECIES_FOR_STRATUM: Record<number, Species> = Object.fromEntries(SPECIES.map((s) => [s.stratum, s]));
