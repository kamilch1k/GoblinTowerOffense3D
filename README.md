# Goblin Tower Offense 3D

A small Three.js tower offense prototype built around primitive cube terrain, blocky medieval structures, generated pixel-art texture assets, and billboard sprite units.

## Run

```bash
npm install
npm run dev
```

## Controls

- Drag the map to pan the commander camera.
- Mouse wheel zooms.
- Right-drag, `Q`, or `E` rotates the camera.
- Drag troop cards onto the outer map bands to spawn swarms.

## Generated Art

The bitmap art in `public/assets` was generated with Codex's built-in image generation workflow:

- `block-atlas.png`: pixel-art terrain/building texture atlas.
- `character-sheet-keyed.png`: source character sheet with chroma key.
- `character-sheet.png`: character sheet after local chroma-key removal.
- `card-portraits.png`: troop card portrait strip.
