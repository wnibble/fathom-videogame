# FATHOM Asset Pipeline

Place these files in:

`Game asset (pictures with guide)/`

Required:
- `diver_sheet.png`
- `fauna_enemies_sheet.png`
- `gatekeeper_sheet.png`
- `bichon_sheet.png`
- `surface_station_sheet.png`
- `fathom_asset_slice_manifest.json`

Run:

```bash
npm run extract-assets
```

Expected output:
- `public/assets/sprites/atlas.png`
- `public/assets/sprites/atlas.json`

Runtime access:

```ts
AssetStore.sprite("station_floor");
AssetStore.anim("diver_idle");
AssetStore.anim("dog_swim");
```

Suggested rendering migration:
- Replace procedural `buildPlayerView`.
- Replace procedural `buildSpitterView`.
- Replace procedural `buildDarterView`.
- Replace procedural `buildDrifterView`.
- Instantiate atlas-backed `AnimatedSprite` objects without changing gameplay logic.
