# AFK Dominion RTS

A Three.js isometric AFK RTS prototype. Four civilizations start with HQs, gather food/ore/power, build bases, train armies, defend, and launch attacks automatically. You rule the Verdant Concord by changing doctrine or by directly selecting units and issuing orders.

## Run

```bash
npm install
npm run dev
```

Or use the existing Windows launcher/desktop shortcut; it will pick a free local port if another Vite app is already running.

This branch can also be served on another Vite port, for example:

```bash
npm run dev -- --host 127.0.0.1 --port 5174
```

## Controls

- Left-click selects your units or buildings.
- Left-drag empty terrain pans the map.
- Shift-left-drag or drag from one of your units to box-select.
- Right-click terrain to move selected units or set a selected building rally point.
- Right-click enemies to attack, or resources to assign selected workers.
- Middle/right-drag pans the locked isometric RTS camera.
- Mouse wheel zooms; `WASD` / arrow keys pan.
- Use the doctrine buttons to steer AFK progression toward balanced, economy, military, tech, or defense.
- Use the command bar to force-build structures, train units, or order attack/defense.

## Systems

- Civilizations: Verdant Concord, Iron Dominion, Sunspire League, and Umbral Nexus.
- Economy: workers harvest food, ore, and power from resource nodes and return them to HQs/refineries.
- Base building: HQs, refineries, barracks, solar arrays, turrets, and academies are placed automatically around each base.
- Combat: armies path around structures, acquire nearby enemies, fire projectiles, and destroy buildings.
- View: fixed isometric RTS camera with a procedural star-and-nebula skybox.

## Art

Terrain uses low-resolution nearest-neighbor pixel textures. Units are generated as faction-colored 2D pixel sprites at runtime. Buildings are made from small blocky 3D pieces so faces avoid stretched textures.
