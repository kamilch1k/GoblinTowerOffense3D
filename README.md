# Goblin Tower Offense 3D

A small Three.js tower offense prototype built around a sloped low-poly terrain map, blocky medieval structures, low-definition procedural pixel-art materials, and billboard sprite units.

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
- Drag troop cards onto the outer map bands to spawn swarms.
- Spend spoils on card upgrades to improve goblin levels and swarm sizes.

## Art

The in-game pixel art is generated from tiny canvas drawings and nearest-neighbor procedural textures at runtime, keeping the look deliberately chunky and low definition. The launcher icon remains in `public/assets`:

- `game-icon.png`: source icon artwork.
- `game-icon.ico`: Windows shortcut icon.
