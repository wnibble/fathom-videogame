// Market boons — one-run consumables bought with stratum resources at the surface
// Market, applied at the start of your NEXT dive then consumed. A second economy
// (resources) distinct from the permanent pearl store (the Outfitter).

export interface Boon {
  id: string;
  name: string;
  desc: string;
  icon: string;
  resource: string; // which stratum material it costs
  cost: number;
}

export const BOONS: Boon[] = [
  { id: "charged-cell", name: "Charged Cell", desc: "Start the dive with +40 shield", icon: "◇", resource: "alloy", cost: 4 },
  { id: "chum-bag", name: "Chum Bag", desc: "+60% loot this dive", icon: "◈", resource: "spore", cost: 4 },
  { id: "ballast", name: "Ballast", desc: "Currents push you 60% less", icon: "▽", resource: "shard", cost: 3 },
  { id: "stim", name: "Adrenal Stim", desc: "Start with an extra upgrade pick", icon: "✦", resource: "lumen", cost: 5 },
  { id: "ember-core", name: "Ember Core", desc: "+25% damage this dive", icon: "✸", resource: "ember", cost: 4 },
];
export const BOON_BY_ID: Record<string, Boon> = Object.fromEntries(BOONS.map((b) => [b.id, b]));
