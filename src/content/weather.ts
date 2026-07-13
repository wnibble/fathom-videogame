// Weather / climate — the surface reads the sea before you dive. Each climate is a
// double-edged deal (a bonus AND a punishment), and it changes every dive, so the
// forecast at the Station shapes whether you go now or wait. Applied in dive.ts.

export interface WeatherMods {
  sampleMult: number; // loot/sample value
  scoreMult: number;
  spawnIntervalMult: number; // <1 = enemies spawn faster
  eliteMult: number; // elite/mutation chance
  currentMult: number; // current force strength
  enemySpeedMult: number;
  dashCdMult: number; // >1 = slower dash
  dreadMult: number; // >1 = the deep closes in faster
  lootCountMult: number; // number of loot orbs on kill
}

export interface Weather {
  id: string;
  name: string;
  icon: string;
  desc: string;
  bonus: string;
  penalty: string;
  mods: WeatherMods;
}

const base: WeatherMods = { sampleMult: 1, scoreMult: 1, spawnIntervalMult: 1, eliteMult: 1, currentMult: 1, enemySpeedMult: 1, dashCdMult: 1, dreadMult: 1, lootCountMult: 1 };
const m = (o: Partial<WeatherMods>): WeatherMods => ({ ...base, ...o });

export const WEATHER: Weather[] = [
  { id: "calm", name: "Calm Waters", icon: "≈", desc: "The sea is still.", bonus: "no penalties", penalty: "no bonuses", mods: m({}) },
  { id: "bloom", name: "Bioluminescent Bloom", icon: "✤", desc: "The plankton are alight; so is everything that eats them.", bonus: "+60% loot", penalty: "enemies spawn faster", mods: m({ sampleMult: 1.6, lootCountMult: 1.5, spawnIntervalMult: 0.75 }) },
  { id: "surge", name: "Storm Surge", icon: "↯", desc: "Violent currents rip through the strata.", bonus: "+50% score", penalty: "currents are twice as strong", mods: m({ scoreMult: 1.5, currentMult: 2.0 }) },
  { id: "coldsnap", name: "Cold Snap", icon: "❄", desc: "The cold slows everything down — including you.", bonus: "enemies are sluggish", penalty: "your dash recharges slower", mods: m({ enemySpeedMult: 0.72, dashCdMult: 1.5 }) },
  { id: "redtide", name: "Red Tide", icon: "☣", desc: "A predatory bloom. The deep is hungry and rich.", bonus: "+loot & +score", penalty: "far more elites; dread rises faster", mods: m({ sampleMult: 1.3, scoreMult: 1.3, eliteMult: 2.2, dreadMult: 1.5 }) },
  { id: "doldrums", name: "The Doldrums", icon: "○", desc: "Dead water. Quiet, and thin.", bonus: "calmer seas, weak currents", penalty: "-25% loot", mods: m({ spawnIntervalMult: 1.22, currentMult: 0.4, sampleMult: 0.75, lootCountMult: 0.75 }) },
];

export const WEATHER_BY_ID: Record<string, Weather> = Object.fromEntries(WEATHER.map((w) => [w.id, w]));

export function weatherAt(index: number): Weather {
  return WEATHER[((index % WEATHER.length) + WEATHER.length) % WEATHER.length];
}
