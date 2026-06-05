# Goblin Tower Offense 3D

A small Three.js tower offense prototype built around a large sloped low-poly terrain map, blocky medieval villages, image-generated pixel-art units, procedural block textures, deck building, territory claiming, and billboard sprite combat.

## Run

```bash
npm install
npm run dev
```

Or use `Launch Goblin Tower Offense 3D.cmd` / the Desktop shortcut to start the local dev server and open the game.

## Controls

- Drag the map to pan the commander camera.
- Mouse wheel zooms.
- Use the zoom buttons or `+` / `-` for extra camera control.
- Right-drag, `Q`, or `E` rotates the camera.
- Drag active troop and building cards onto unlocked territory.
- Drag the Claim card onto a locked adjacent `5 x 5` territory chunk to unlock more deployment space with mana.
- Spend spoils to unlock new cards, swap cards in and out of the active deck, and upgrade cards.

## Art

The unit sprites use an image-generated pixel-art spritesheet that is processed into transparent `5 x 4` animation frames. Terrain and building surfaces use nearest-neighbor procedural textures so large 3D structures can be assembled from smaller blocks instead of stretched atlas faces. The launcher icon remains in `public/assets`:

- `unit-sprites.png`: processed transparent unit spritesheet.
- `game-icon.png`: source icon artwork.
- `game-icon.ico`: Windows shortcut icon.
