# FATHOM Next Sprite Pack — Art Rules

## Style
- Top-down pixel art.
- Silhouette-first: each actor must remain readable as a solid black shape.
- Chunky pixels, nearest-neighbor scaling, no anti-aliasing or sub-pixel blur.
- No drop shadows.
- Avoid baked gradients in small sprites.

## Palette
- Abyssal darks: `#04070f`, `#0a1426`, `#102540`, `#16304f`
- Friendly/cool: `#39d7e6`, `#8ff6ff`, `#7fe6d0`
- Danger/warm: `#ffb64a`, `#ffe08a`, `#ff5a4a`, `#ff8f7a`
- Poison: `#8fe04a`
- Surface light: `#fff4d6`

Cool accents identify the player, companion, pickups, and safe interfaces.
Warm accents identify enemies, attacks, weak points, and danger.

## Logical sizes
- Diver and companion: 24×24
- Standard fauna: 32×32
- Elites: 48×48
- Bosses: 96×96+
- Props: 32×32 or 48×48 unless larger silhouettes require more room

## Animation
- Use 2–4 frame cycles.
- Frames remain centered on the same pose anchor.
- Attack actors require a distinct wind-up/charge frame.
- Frame names end in `_f1`, `_f2`, and so on when part of one animation.
