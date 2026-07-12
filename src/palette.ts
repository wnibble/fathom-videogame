// The FATHOM master deep-sea palette. One cohesive ramp; biomes pull sub-palettes.
// Abyssal navy/teal darks → aqua/amber/coral biolum accents → warm surface light.

// Concrete colors (hex ints for Pixi tints).
export const COLOR = {
  abyss: 0x04070f,
  deepNavy: 0x0a1426,
  navy: 0x102540,
  midwater: 0x16304f, // Twilight Drift fog tint
  teal: 0x1f6f7a,
  aqua: 0x39d7e6,
  aquaBright: 0x8ff6ff,
  amber: 0xffb64a,
  amberBright: 0xffe08a,
  coral: 0xff5a4a,
  coralBright: 0xff8f7a,
  poison: 0x8fe04a,
  surface: 0xfff4d6,
  hpFull: 0x53e0a0,
  hpLow: 0xff5a4a,
  white: 0xffffff,
} as const;

export type ColorKey = keyof typeof COLOR;
