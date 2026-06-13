import "./styles.css";
import * as THREE from "three";
import { createIcons, Home, Pause, Play, RotateCcw, RotateCw, ZoomIn, ZoomOut } from "lucide";

createIcons({
  icons: {
    Home,
    Pause,
    Play,
    RotateCcw,
    RotateCw,
    ZoomIn,
    ZoomOut,
  },
});

const canvas = document.querySelector("#world");
const deckEl = document.querySelector("#deck");
const baseReadout = document.querySelector("#baseReadout");
const baseMeter = document.querySelector("#baseMeter");
const rageReadout = document.querySelector("#rageReadout");
const rageMeter = document.querySelector("#rageMeter");
const raidReadout = document.querySelector("#raidReadout");
const hordeReadout = document.querySelector("#hordeReadout");
const defenderReadout = document.querySelector("#defenderReadout");
const structureReadout = document.querySelector("#structureReadout");
const spoilsReadout = document.querySelector("#spoilsReadout");
const territoryReadout = document.querySelector("#territoryReadout");
const battleMessage = document.querySelector("#battleMessage");
const pauseToggle = document.querySelector("#pauseToggle");
const mainMenu = document.querySelector("#mainMenu");
const pauseMenu = document.querySelector("#pauseMenu");
const startRaidButton = document.querySelector("#startRaid");
const resumeRaidButton = document.querySelector("#resumeRaid");
const restartRaidButton = document.querySelector("#restartRaid");
const exitToMenuButton = document.querySelector("#exitToMenu");
const statTime = document.querySelector("#statTime");
const statSpoils = document.querySelector("#statSpoils");
const statDamage = document.querySelector("#statDamage");
const statStructures = document.querySelector("#statStructures");
const statDefeated = document.querySelector("#statDefeated");
const statLost = document.querySelector("#statLost");
const statSpawned = document.querySelector("#statSpawned");
const statBuildings = document.querySelector("#statBuildings");
const menuBestTime = document.querySelector("#menuBestTime");
const menuBestSpoils = document.querySelector("#menuBestSpoils");
const menuBestDamage = document.querySelector("#menuBestDamage");
const menuRaids = document.querySelector("#menuRaids");

const MAP_SIZE = 100;
const HALF_MAP = MAP_SIZE / 2;
const TERRAIN_BASE_Y = -1.35;
const TERRITORY_SIZE = 5;
const TERRITORY_CHUNKS = MAP_SIZE / TERRITORY_SIZE;
const SPAWN_DROP_TOLERANCE = 1.5;
const SPAWN_EDGE_PADDING = 0.72;
const MIN_CAMERA_PITCH = 0.28;
const MAX_CAMERA_PITCH = 1.4;
const MAP_SEED = Math.random() * 10000;
const LAKE_CENTER_X = -HALF_MAP + 13 + Math.sin(MAP_SEED * 0.23) * 4;
const LAKE_CENTER_Z = HALF_MAP - 16 + Math.cos(MAP_SEED * 0.19) * 5;
const MAX_ACTIVE_CARDS = 8;
const VILLAGE_SITES = [
  { x: 0, z: -16, radius: 13, main: true },
  { x: -28, z: 16, radius: 8 },
  { x: 28, z: 14, radius: 8 },
  { x: -30, z: -22, radius: 7 },
  { x: 30, z: -25, radius: 7 },
];
const rand = (min, max) => min + Math.random() * (max - min);
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const formatTime = (seconds) => `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
const saveKey = "goblinTowerOffenseStats";
const ENABLE_REALTIME_SHADOWS = false;
const MAX_RENDER_PIXEL_RATIO = 1;
const HUD_UPDATE_INTERVAL = 0.16;
const SPAWN_PARTICLE_COUNT = 5;
const MAX_PARTICLES = 140;
const STRUCTURE_BLOCK_CELL_SIZE = 1.75;
const TERRAIN_TEXTURE_SIZE = 16;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x10181b);

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: false,
  powerPreference: "high-performance",
});
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = ENABLE_REALTIME_SHADOWS;
if (ENABLE_REALTIME_SHADOWS) renderer.shadowMap.type = THREE.BasicShadowMap;
renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_RENDER_PIXEL_RATIO));

const camera = new THREE.PerspectiveCamera(24, window.innerWidth / window.innerHeight, 0.1, 640);
const cameraState = {
  target: new THREE.Vector3(0, 0, -2),
  yaw: 0,
  pitch: 0.92,
  distance: 226,
};

const raycaster = new THREE.Raycaster();
const pointerNdc = new THREE.Vector2();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const tmpPoint = new THREE.Vector3();
const tmpVec = new THREE.Vector3();
const tmpVec2 = new THREE.Vector3();
const tmpSteering = new THREE.Vector3();
const tmpCameraForward = new THREE.Vector3();
const tmpCameraRight = new THREE.Vector3();
const tmpCameraDir = new THREE.Vector3();
const fallbackGuard = new THREE.Vector3(0, 0, -4);
const clock = new THREE.Clock();

const loader = new THREE.TextureLoader();
const textureCache = new Map();

const game = {
  time: 0,
  rage: 6,
  maxRage: 10,
  spoils: 0,
  started: false,
  paused: true,
  over: false,
  result: "",
  defenderPulse: 0,
  statsRecorded: false,
  stats: {
    spawned: 0,
    buildingsPlaced: 0,
    structuresDestroyed: 0,
    defeated: 0,
    lost: 0,
    damageDealt: 0,
    damageTaken: 0,
  },
};

const world = new THREE.Group();
const terrainGroup = new THREE.Group();
const territoryGroup = new THREE.Group();
const structureGroup = new THREE.Group();
const unitGroup = new THREE.Group();
const effectGroup = new THREE.Group();
scene.add(world);
world.add(terrainGroup, territoryGroup, structureGroup, unitGroup, effectGroup);

const structures = [];
const goblinBuildings = [];
const movementBlockers = [];
const units = [];
const projectiles = [];
const particles = [];
const cardElements = new Map();
const effectMaterials = new Map();
let baseStructure = null;
const unlockedTerritory = new Set();
let hudUpdateTimer = 0;
let hudDirty = true;
let perfElapsed = 0;
let perfFrames = 0;
let perfWorstFrame = 0;
const perfStats = {
  fps: 0,
  avgFrameMs: 0,
  worstFrameMs: 0,
  drawCalls: 0,
  triangles: 0,
  units: 0,
  particles: 0,
  projectiles: 0,
  pixelRatio: MAX_RENDER_PIXEL_RATIO,
  shadows: ENABLE_REALTIME_SHADOWS,
};
window.__goblinPerf = perfStats;

const cards = [
  {
    id: "claim",
    title: "Claim",
    type: "territory",
    cost: 2,
    level: 1,
    upgradeBaseCost: 4,
    unlocked: true,
    active: true,
    unlockCost: 0,
  },
  {
    id: "raiders",
    title: "Raiders",
    type: "unit",
    unitType: "raider",
    cost: 3,
    count: 8,
    spread: 1.45,
    level: 1,
    upgradeBaseCost: 4,
    unlocked: true,
    active: true,
    unlockCost: 0,
  },
  {
    id: "spikes",
    title: "Spikes",
    type: "building",
    buildingType: "spikes",
    cost: 2,
    level: 1,
    upgradeBaseCost: 5,
    unlocked: true,
    active: true,
    unlockCost: 0,
  },
  {
    id: "brutes",
    title: "Brutes",
    type: "unit",
    unitType: "brute",
    cost: 5,
    count: 3,
    spread: 1.15,
    level: 1,
    upgradeBaseCost: 6,
    unlocked: true,
    active: true,
    unlockCost: 5,
  },
  {
    id: "torches",
    title: "Torches",
    type: "unit",
    unitType: "torch",
    cost: 4,
    count: 5,
    spread: 1.35,
    level: 1,
    upgradeBaseCost: 5,
    unlocked: true,
    active: true,
    unlockCost: 4,
  },
  {
    id: "den",
    title: "Den",
    type: "building",
    buildingType: "den",
    cost: 4,
    level: 1,
    upgradeBaseCost: 7,
    unlocked: true,
    active: true,
    unlockCost: 7,
  },
  {
    id: "catapult",
    title: "Catapult",
    type: "building",
    buildingType: "catapult",
    cost: 6,
    level: 1,
    upgradeBaseCost: 9,
    unlocked: true,
    active: true,
    unlockCost: 10,
  },
  {
    id: "drum",
    title: "Drum",
    type: "building",
    buildingType: "drum",
    cost: 3,
    level: 1,
    upgradeBaseCost: 6,
    unlocked: true,
    active: true,
    unlockCost: 8,
  },
];

async function loadTextureAsset(path, key = path) {
  if (textureCache.has(key)) return textureCache.get(key);
  const texture = await loader.loadAsync(path);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  textureCache.set(key, texture);
  return texture;
}

const unitSpriteSheet = await loadTextureAsset("/assets/unit-sprites.png", "unit-sprites");

function spriteSheetFrame(row, col) {
  const key = `unit-frame-${row}-${col}`;
  if (textureCache.has(key)) return textureCache.get(key);
  const texture = unitSpriteSheet.clone();
  texture.repeat.set(1 / 4, 1 / 5);
  texture.offset.set(col / 4, 1 - (row + 1) / 5);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  textureCache.set(key, texture);
  return texture;
}

function hexToRgb(hex) {
  const value = Number.parseInt(hex.replace("#", ""), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function colorString(rgb, shade = 0) {
  const channels = rgb.map((channel) => clamp(Math.round(channel + shade), 0, 255));
  return `rgb(${channels[0]}, ${channels[1]}, ${channels[2]})`;
}

function pixelNoise(x, y, seed) {
  return Math.sin((x + 1) * 12.9898 + (y + 3) * 78.233 + seed * 37.719) % 1;
}

const TERRAIN_16_PATTERNS = {
  grassTop: [
    "0100200010002001",
    "0001002000200010",
    "1000020001000200",
    "0020100000201000",
    "0000201000010002",
    "2010000102000100",
    "0001000020001000",
    "0100200100010002",
    "1000002001000200",
    "0020100000200010",
    "0002001000010002",
    "0100000102001000",
    "1001000020000100",
    "0000200100010200",
    "0201000002001000",
    "1000010200000102",
  ],
  dirtBlock: [
    "0020100301202001",
    "2300012020010030",
    "0102300012100200",
    "0010023000120031",
    "3201000122001000",
    "0002310000102203",
    "1020003100200100",
    "0001200030012020",
    "2030001200100300",
    "0010200312001002",
    "1200030010200300",
    "0002100200031020",
    "3020010001200300",
    "0100302010001200",
    "2001000302100001",
    "0002301000203100",
  ],
  mud: [
    "0020200302202002",
    "2300022020020030",
    "0202300022200200",
    "0020023000220032",
    "3202000222002000",
    "0002320000202203",
    "2020003200200200",
    "0002200030022020",
    "2030002200200300",
    "0020200322002002",
    "2200030020200300",
    "0002200200032020",
    "3020020002200300",
    "0200302020002200",
    "2002000302200002",
    "0002302000203200",
  ],
  sand: [
    "0000100000001000",
    "0010000200010000",
    "0000001000000010",
    "1000000000200000",
    "0002000010000000",
    "0100000000001000",
    "0000000200000001",
    "0001000000100000",
    "0000000010002000",
    "0200010000000000",
    "0000000001000001",
    "0010000200000000",
    "0000100000010000",
    "1000000000000200",
    "0002000100000000",
    "0000000001000010",
  ],
  water: [
    "0000000000000000",
    "0000200000002000",
    "1111111111111111",
    "0000000000000000",
    "0000002220000000",
    "0000000000000000",
    "0000000000000000",
    "1111111111111111",
    "0000200000200000",
    "0000000000000000",
    "0000222000002220",
    "0000000000000000",
    "1111111111111111",
    "0000000000000000",
    "0000002000000200",
    "0000000000000000",
  ],
  path: [
    "0010100010100100",
    "1200012000100012",
    "0012000101200010",
    "0100010001001200",
    "2001200100010010",
    "0010001210000100",
    "0100100012001001",
    "1200010010001200",
    "0010012001000010",
    "0101200010012000",
    "2000010012001001",
    "0012000100010010",
    "0100012001001200",
    "1200100010010001",
    "0010010001200100",
    "0101200100012000",
  ],
  generic: [
    "0010001000100100",
    "1200010000100012",
    "0012000101000010",
    "0100010001001200",
    "2001000100010010",
    "0010001010000100",
    "0100100012001001",
    "1200010010001000",
    "0010012001000010",
    "0101000010012000",
    "2000010012001001",
    "0012000100010010",
    "0100012001001000",
    "1200100010010001",
    "0010010001200100",
    "0101000100012000",
  ],
};

function terrainPalette(base, flecks) {
  const palette = [base, ...flecks];
  while (palette.length < 4) palette.push(base);
  return palette;
}

function drawIndexedTerrainTexture(ctx, pattern, palette) {
  for (let y = 0; y < TERRAIN_TEXTURE_SIZE; y += 1) {
    const row = pattern[y] ?? pattern[0];
    for (let x = 0; x < TERRAIN_TEXTURE_SIZE; x += 1) {
      const paletteIndex = Number.parseInt(row[x] ?? "0", 10);
      ctx.fillStyle = colorString(palette[Number.isNaN(paletteIndex) ? 0 : paletteIndex] ?? palette[0]);
      ctx.fillRect(x, y, 1, 1);
    }
  }
}

function createPixelTexture(kind, baseHex, fleckHexes = []) {
  const size = TERRAIN_TEXTURE_SIZE;
  const canvasTexture = document.createElement("canvas");
  canvasTexture.width = size;
  canvasTexture.height = size;
  const ctx = canvasTexture.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  const base = hexToRgb(baseHex);
  const flecks = fleckHexes.map(hexToRgb);
  const palette = terrainPalette(base, flecks);

  drawIndexedTerrainTexture(ctx, TERRAIN_16_PATTERNS[kind] ?? TERRAIN_16_PATTERNS.generic, palette);

  if (kind === "grassSide") {
    ctx.fillStyle = "#4f9b3b";
    ctx.fillRect(0, 0, size, 3);
    const darkGrass = hexToRgb("#3b7c35");
    for (let x = 0; x < size; x += 2) {
      ctx.fillStyle = colorString(darkGrass);
      ctx.fillRect(x, 2 + Math.floor(Math.abs(pixelNoise(x, 4, 3)) * 2), 1, 1);
    }
  }

  if (kind === "path") {
    for (let y = 4; y < size; y += 4) {
      ctx.fillStyle = "rgba(92, 68, 43, 0.34)";
      ctx.fillRect(0, y, size, 1);
    }
  }

  if (kind === "farm") {
    for (let x = 2; x < size; x += 4) {
      ctx.fillStyle = "#7f5629";
      ctx.fillRect(x, 0, 2, size);
      ctx.fillStyle = "#7fc149";
      for (let y = 2; y < size; y += 4) ctx.fillRect(x + 1, y, 1, 2);
    }
  }

  const texture = new THREE.CanvasTexture(canvasTexture);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  textureCache.set(`terrain-${kind}`, texture);
  return texture;
}

function terrainMaterial(kind, base, flecks, options = {}) {
  return new THREE.MeshStandardMaterial({
    map: createPixelTexture(kind, base, flecks),
    roughness: options.roughness ?? 0.95,
    metalness: 0,
    transparent: options.transparent ?? false,
    opacity: options.opacity ?? 1,
  });
}

const materials = {
  grassTop: terrainMaterial("grassTop", "#4f9d3d", ["#73bd48", "#326f32", "#d8d566"]),
  grassSide: terrainMaterial("grassSide", "#8a5b2d", ["#6e4424", "#a3703d", "#5f8d38"]),
  sand: terrainMaterial("sand", "#c9b36c", ["#ead18a", "#aa8f52", "#8c7446"]),
  water: terrainMaterial("water", "#1c77ad", ["#2d9bd1", "#0e4e83", "#8ad8ed"], {
    roughness: 0.42,
  }),
  rockSide: terrainMaterial("rockSide", "#64645f", ["#8b8b83", "#444642", "#737b68"]),
  dirt: terrainMaterial("dirtBlock", "#7b4d28", ["#9a6738", "#503018", "#a06e3e"]),
  stone: terrainMaterial("stoneBrick", "#777872", ["#a0a099", "#4b4c49", "#686b63"], { roughness: 0.9 }),
  cobble: terrainMaterial("cobble", "#6f706a", ["#97978e", "#424541", "#575b53"], { roughness: 0.94 }),
  wood: terrainMaterial("woodPlank", "#865326", ["#b17435", "#4d2d15", "#c28a4b"], { roughness: 0.88 }),
  thatch: terrainMaterial("thatch", "#c5a134", ["#f0d36a", "#7b5b1b", "#a57d24"]),
  castle: terrainMaterial("castleStone", "#777a78", ["#a6aaa6", "#434747", "#656b68"], { roughness: 0.88 }),
  path: terrainMaterial("path", "#a88952", ["#d2b477", "#72583a", "#b9a063"]),
  moss: terrainMaterial("moss", "#768252", ["#95a56a", "#4d5f36", "#8a9160"]),
  farm: terrainMaterial("farm", "#63411f", ["#8a5c2d", "#4d3119", "#83ba4a"]),
  cliff: terrainMaterial("cliff", "#64645f", ["#85857d", "#41433f", "#767966"]),
  trim: terrainMaterial("trim", "#b58532", ["#edc15a", "#6d4617", "#d49a37"], { roughness: 0.78 }),
  roof: new THREE.MeshStandardMaterial({ color: 0xa73b2e, roughness: 0.84, flatShading: true }),
  roofSide: new THREE.MeshStandardMaterial({ color: 0x67251e, roughness: 0.9, flatShading: true }),
  thatchRoof: new THREE.MeshStandardMaterial({ color: 0xcaa746, roughness: 0.95, flatShading: true }),
  thatchRoofSide: new THREE.MeshStandardMaterial({ color: 0x7b5a20, roughness: 0.98, flatShading: true }),
  mud: terrainMaterial("mud", "#60401f", ["#7a532c", "#382715", "#8a673b"]),
  banner: terrainMaterial("banner", "#9a2d27", ["#d85a43", "#5d1717", "#e4bb58"], { roughness: 0.72 }),
  spawnGood: new THREE.MeshBasicMaterial({
    color: 0x8eed71,
    transparent: true,
    opacity: 0.44,
    side: THREE.DoubleSide,
  }),
  spawnBad: new THREE.MeshBasicMaterial({
    color: 0xe66f5b,
    transparent: true,
    opacity: 0.36,
    side: THREE.DoubleSide,
  }),
  territory: new THREE.MeshBasicMaterial({
    color: 0x8eed71,
    transparent: true,
    opacity: 0.12,
    side: THREE.DoubleSide,
    depthWrite: false,
  }),
  territoryPreview: new THREE.MeshBasicMaterial({
    color: 0xe4c153,
    transparent: true,
    opacity: 0.34,
    side: THREE.DoubleSide,
    depthWrite: false,
  }),
  territoryEdge: new THREE.LineBasicMaterial({
    color: 0xe4c153,
    transparent: true,
    opacity: 0.34,
    depthWrite: false,
  }),
  shadow: new THREE.MeshBasicMaterial({
    color: 0x000000,
    transparent: true,
    opacity: 0.24,
    depthWrite: false,
  }),
  hpBack: new THREE.MeshBasicMaterial({ color: 0x2b2324 }),
  hpGood: new THREE.MeshBasicMaterial({ color: 0x7bd66e }),
  hpWarn: new THREE.MeshBasicMaterial({ color: 0xe2bd53 }),
  hpBad: new THREE.MeshBasicMaterial({ color: 0xd95b4c }),
};

const cubeGeometry = new THREE.BoxGeometry(1, 1, 1);
const circleGeometry = new THREE.CircleGeometry(1, 28);
circleGeometry.rotateX(-Math.PI / 2);
const wheelGeometry = new THREE.CylinderGeometry(0.28, 0.28, 0.26, 10);
wheelGeometry.rotateZ(Math.PI / 2);
const hpBackGeometry = new THREE.BoxGeometry(1, 0.08, 0.08);
const hpFillGeometry = new THREE.BoxGeometry(1, 0.09, 0.1);
const spawnParticleGeometry = new THREE.BoxGeometry(0.12, 0.12, 0.12);
const hitParticleGeometry = new THREE.SphereGeometry(0.14, 6, 4);
const arrowGeometry = new THREE.BoxGeometry(0.12, 0.12, 0.5);
const catapultShotGeometry = new THREE.SphereGeometry(0.24, 8, 6);

function effectMaterial(color, opacity = 0.9) {
  const key = `${color}-${opacity}`;
  if (!effectMaterials.has(key)) {
    effectMaterials.set(key, new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity }));
  }
  return effectMaterials.get(key);
}

function materialSet(top, side = top, bottom = materials.dirt) {
  return [side, side, top, bottom, side, side];
}

function addBlock(x, y, z, sx, sy, sz, mats, group = terrainGroup) {
  if (group !== terrainGroup && Math.max(sx, sy, sz) > STRUCTURE_BLOCK_CELL_SIZE) {
    const blockGroup = new THREE.Group();
    blockGroup.position.set(x, y, z);
    const nx = Math.max(1, Math.ceil(sx / STRUCTURE_BLOCK_CELL_SIZE));
    const ny = Math.max(1, Math.ceil(sy / STRUCTURE_BLOCK_CELL_SIZE));
    const nz = Math.max(1, Math.ceil(sz / STRUCTURE_BLOCK_CELL_SIZE));
    const cellX = sx / nx;
    const cellY = sy / ny;
    const cellZ = sz / nz;
    for (let ix = 0; ix < nx; ix += 1) {
      for (let iy = 0; iy < ny; iy += 1) {
        for (let iz = 0; iz < nz; iz += 1) {
          const mesh = new THREE.Mesh(cubeGeometry, mats);
          mesh.position.set(
            -sx / 2 + cellX / 2 + ix * cellX,
            cellY / 2 + iy * cellY,
            -sz / 2 + cellZ / 2 + iz * cellZ,
          );
          mesh.scale.set(cellX, cellY, cellZ);
          if (ENABLE_REALTIME_SHADOWS) {
            mesh.castShadow = true;
            mesh.receiveShadow = true;
          }
          blockGroup.add(mesh);
        }
      }
    }
    group.add(blockGroup);
    return blockGroup;
  }

  const mesh = new THREE.Mesh(cubeGeometry, mats);
  mesh.position.set(x, y + sy / 2, z);
  mesh.scale.set(sx, sy, sz);
  if (ENABLE_REALTIME_SHADOWS) {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
  }
  group.add(mesh);
  return mesh;
}

function makeRampGeometry(direction = "north") {
  const base = [
    [-0.5, 0, -0.5],
    [0.5, 0, -0.5],
    [-0.5, 0, 0.5],
    [0.5, 0, 0.5],
    [-0.5, 1, -0.5],
    [0.5, 1, -0.5],
  ];
  const index = [
    0, 2, 3, 0, 3, 1, 0, 1, 5, 0, 5, 4, 2, 4, 5, 2, 5, 3, 0, 4, 2, 1, 3, 5,
  ];
  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.Float32BufferAttribute(base.flat(), 3));
  geom.setAttribute(
    "uv",
    new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 1, 1, 0, 0, 1, 0], 2),
  );
  geom.setIndex(index);
  geom.computeVertexNormals();

  if (direction === "south") geom.rotateY(Math.PI);
  if (direction === "east") geom.rotateY(Math.PI / 2);
  if (direction === "west") geom.rotateY(-Math.PI / 2);
  return geom;
}

function addRamp(x, y, z, sx, sy, sz, direction, material, group = terrainGroup) {
  const mesh = new THREE.Mesh(makeRampGeometry(direction), material);
  mesh.position.set(x, y, z);
  mesh.scale.set(sx, sy, sz);
  if (ENABLE_REALTIME_SHADOWS) {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
  }
  group.add(mesh);
  return mesh;
}

function createLighting() {
  scene.add(new THREE.HemisphereLight(0xbad4e6, 0x3e3124, 1.65));
  const sun = new THREE.DirectionalLight(0xfff0c7, 2.15);
  sun.position.set(-12, 24, 16);
  sun.castShadow = ENABLE_REALTIME_SHADOWS;
  if (ENABLE_REALTIME_SHADOWS) {
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -HALF_MAP - 8;
    sun.shadow.camera.right = HALF_MAP + 8;
    sun.shadow.camera.top = HALF_MAP + 8;
    sun.shadow.camera.bottom = -HALF_MAP - 8;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 70;
  }
  scene.add(sun);
}

function distanceToSegment(px, pz, ax, az, bx, bz) {
  const abx = bx - ax;
  const abz = bz - az;
  const apx = px - ax;
  const apz = pz - az;
  const lengthSq = abx * abx + abz * abz;
  const t = lengthSq === 0 ? 0 : clamp((apx * abx + apz * abz) / lengthSq, 0, 1);
  const dx = px - (ax + abx * t);
  const dz = pz - (az + abz * t);
  return Math.hypot(dx, dz);
}

function pathScore(x, z) {
  const mainSite = VILLAGE_SITES[0];
  const trunk = Math.abs(x) < 1.55 && z > mainSite.z - 9 && z < HALF_MAP - 6;
  const gate = Math.abs(x - mainSite.x) < 4 && z < mainSite.z + 4 && z > mainSite.z - 5;
  const villageRoad = VILLAGE_SITES.some((site) =>
    !site.main && distanceToSegment(x, z, mainSite.x, mainSite.z + 4, site.x, site.z) < 1.28,
  );
  return trunk || gate || villageRoad;
}

function isVillagePlateau(x, z) {
  return VILLAGE_SITES.some((site) => Math.hypot(x - site.x, z - site.z) < site.radius);
}

function waterScore(x, z) {
  const lake = ((x - LAKE_CENTER_X) / 6.5) ** 2 + ((z - LAKE_CENTER_Z) / 8.5) ** 2;
  const inlet = ((x + HALF_MAP - 4.5) / 3.6) ** 2 + ((z - (LAKE_CENTER_Z - 7)) / 5.5) ** 2;
  return Math.min(lake, inlet);
}

function isWaterTile(x, z) {
  return waterScore(x, z) < 1;
}

function isShoreTile(x, z) {
  if (isWaterTile(x, z)) return false;
  const neighbors = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
    [1, 1],
    [-1, -1],
    [1, -1],
    [-1, 1],
  ];
  return neighbors.some(([dx, dz]) => isWaterTile(x + dx, z + dz));
}

function terrainTopHeight(x, z) {
  if (isWaterTile(x, z)) return -0.32;
  if (isShoreTile(x, z)) return -0.06;
  if (pathScore(x, z) || isVillagePlateau(x, z)) return 0;

  const edge = Math.max(Math.abs(x), Math.abs(z)) / HALF_MAP;
  const rolling =
    Math.sin((x + MAP_SEED) * 0.24) * 0.34 +
    Math.cos((z - MAP_SEED) * 0.2) * 0.32 +
    Math.sin((x * 0.13 + z * 0.18 + MAP_SEED) * 1.7) * 0.26;
  const ridge =
    Math.exp(-((x + 19 + Math.sin(MAP_SEED) * 3) ** 2) / 120 - ((z + 7) ** 2) / 420) * 1.25 +
    Math.exp(-((x - 18) ** 2) / 190 - ((z - 16 + Math.cos(MAP_SEED) * 4) ** 2) / 170) * 1.05;
  const edgeRise = edge > 0.74 ? (edge - 0.74) * 3.4 : 0;
  return clamp(rolling + ridge + edgeRise, -0.12, 1.85);
}

function terrainMaterialKey(x, z) {
  if (isWaterTile(x, z)) return "water";
  if (isShoreTile(x, z)) return "sand";
  if (pathScore(x, z)) return "path";
  if ((x > 6 && x < 12 && z > -6 && z < 2) || (x < -34 && z > 12 && z < 20)) return "farm";
  if (x < -36 && z > -31 && z < -18) return "mud";
  return "grassTop";
}

function terrainMaterialForKey(key) {
  return {
    water: materials.water,
    sand: materials.sand,
    path: materials.path,
    farm: materials.farm,
    mud: materials.mud,
    grassTop: materials.grassTop,
  }[key];
}

function terrainBuffers() {
  return { positions: [], uvs: [], indices: [] };
}

function pushTerrainTile(buffers, x, z) {
  const vertexOffset = buffers.positions.length / 3;
  const h00 = terrainTopHeight(x, z);
  const h10 = terrainTopHeight(x + 1, z);
  const h01 = terrainTopHeight(x, z + 1);
  const h11 = terrainTopHeight(x + 1, z + 1);
  buffers.positions.push(x, h00, z, x + 1, h10, z, x, h01, z + 1, x + 1, h11, z + 1);
  buffers.uvs.push(0, 0, 1, 0, 0, 1, 1, 1);
  buffers.indices.push(vertexOffset, vertexOffset + 2, vertexOffset + 1, vertexOffset + 1, vertexOffset + 2, vertexOffset + 3);
}

function pushTerrainSkirt(buffers, x0, z0, x1, z1, h0, h1) {
  const vertexOffset = buffers.positions.length / 3;
  buffers.positions.push(x0, TERRAIN_BASE_Y, z0, x1, TERRAIN_BASE_Y, z1, x0, h0, z0, x1, h1, z1);
  buffers.uvs.push(0, 0, 1, 0, 0, 1, 1, 1);
  buffers.indices.push(vertexOffset, vertexOffset + 1, vertexOffset + 2, vertexOffset + 1, vertexOffset + 3, vertexOffset + 2);
}

function geometryFromBuffers(buffers) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(buffers.positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(buffers.uvs, 2));
  geometry.setIndex(buffers.indices);
  geometry.computeVertexNormals();
  return geometry;
}

function sampleTerrainHeight(x, z) {
  const clampedX = clamp(x, -HALF_MAP + 0.001, HALF_MAP - 0.001);
  const clampedZ = clamp(z, -HALF_MAP + 0.001, HALF_MAP - 0.001);
  const x0 = Math.floor(clampedX);
  const z0 = Math.floor(clampedZ);
  const tx = clampedX - x0;
  const tz = clampedZ - z0;
  const h00 = terrainTopHeight(x0, z0);
  const h10 = terrainTopHeight(x0 + 1, z0);
  const h01 = terrainTopHeight(x0, z0 + 1);
  const h11 = terrainTopHeight(x0 + 1, z0 + 1);
  const hx0 = h00 + (h10 - h00) * tx;
  const hx1 = h01 + (h11 - h01) * tx;
  return hx0 + (hx1 - hx0) * tz;
}

function territoryKey(cx, cz) {
  return `${cx},${cz}`;
}

function parseTerritoryKey(key) {
  return key.split(",").map((part) => Number.parseInt(part, 10));
}

function territoryChunkFromPoint(point) {
  if (!point) return null;
  if (Math.abs(point.x) > HALF_MAP || Math.abs(point.z) > HALF_MAP) return null;
  const cx = clamp(Math.floor((point.x + HALF_MAP) / TERRITORY_SIZE), 0, TERRITORY_CHUNKS - 1);
  const cz = clamp(Math.floor((point.z + HALF_MAP) / TERRITORY_SIZE), 0, TERRITORY_CHUNKS - 1);
  return { cx, cz, key: territoryKey(cx, cz) };
}

function territoryBounds(cx, cz) {
  const x0 = -HALF_MAP + cx * TERRITORY_SIZE;
  const z0 = -HALF_MAP + cz * TERRITORY_SIZE;
  return { x0, z0, x1: x0 + TERRITORY_SIZE, z1: z0 + TERRITORY_SIZE };
}

function territoryCenter(cx, cz) {
  const bounds = territoryBounds(cx, cz);
  return new THREE.Vector3((bounds.x0 + bounds.x1) / 2, 0, (bounds.z0 + bounds.z1) / 2);
}

function isChunkUnlocked(cx, cz) {
  return unlockedTerritory.has(territoryKey(cx, cz));
}

function isChunkUnlockable(cx, cz) {
  if (cx < 0 || cz < 0 || cx >= TERRITORY_CHUNKS || cz >= TERRITORY_CHUNKS) return false;
  if (isChunkUnlocked(cx, cz)) return false;
  return [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ].some(([dx, dz]) => isChunkUnlocked(cx + dx, cz + dz));
}

function isPointInUnlockedTerritory(point) {
  const chunk = territoryChunkFromPoint(point);
  return !!chunk && unlockedTerritory.has(chunk.key);
}

function initializeTerritory() {
  for (let cx = 0; cx < TERRITORY_CHUNKS; cx += 1) {
    for (let cz = 0; cz < TERRITORY_CHUNKS; cz += 1) {
      unlockedTerritory.add(territoryKey(cx, cz));
    }
  }
}

function rebuildTerritoryOverlay(activeChunk = null) {
  territoryGroup.clear();
  const geometry = new THREE.PlaneGeometry(TERRITORY_SIZE - 0.16, TERRITORY_SIZE - 0.16);
  geometry.rotateX(-Math.PI / 2);
  const edgeGeometry = new THREE.EdgesGeometry(geometry);
  for (let cx = 0; cx < TERRITORY_CHUNKS; cx += 1) {
    for (let cz = 0; cz < TERRITORY_CHUNKS; cz += 1) {
      const unlocked = isChunkUnlocked(cx, cz);
      const unlockable = isChunkUnlockable(cx, cz);
      const active = activeChunk?.cx === cx && activeChunk?.cz === cz;
      if (!unlocked && !unlockable && !active) continue;
      const center = territoryCenter(cx, cz);
      const mesh = new THREE.Mesh(geometry, materials.territory);
      mesh.position.set(center.x, sampleTerrainHeight(center.x, center.z) + 0.18, center.z);
      const edge = new THREE.LineSegments(edgeGeometry, materials.territoryEdge);
      edge.position.copy(mesh.position);
      mesh.material = active ? materials.territoryPreview : materials.territory;
      territoryGroup.add(mesh, edge);
    }
  }
}

function hideTerritoryOverlay() {
  territoryGroup.clear();
}

function updateTerritoryPlacementOverlay(point) {
  const chunk = territoryChunkFromPoint(point);
  rebuildTerritoryOverlay(chunk);
}

function territoryUnlockCost() {
  if (unlockedTerritory.size >= TERRITORY_CHUNKS * TERRITORY_CHUNKS) return 0;
  return 2 + Math.floor(Math.max(0, unlockedTerritory.size - TERRITORY_CHUNKS * 4) / 18);
}

function unlockTerritoryAt(point) {
  const chunk = territoryChunkFromPoint(point);
  if (!chunk || !isChunkUnlockable(chunk.cx, chunk.cz)) return false;
  const cost = territoryUnlockCost();
  if (game.rage < cost) return false;
  game.rage = clamp(game.rage - cost, 0, game.maxRage);
  unlockedTerritory.add(chunk.key);
  updateTerritoryPlacementOverlay(point);
  createSpawnBurst(territoryCenter(chunk.cx, chunk.cz), 0xe4c153);
  return true;
}

function createTerrain() {
  const byMaterial = new Map();
  for (let x = -HALF_MAP; x < HALF_MAP; x += 1) {
    for (let z = -HALF_MAP; z < HALF_MAP; z += 1) {
      const cx = x + 0.5;
      const cz = z + 0.5;
      const key = terrainMaterialKey(cx, cz);
      if (!byMaterial.has(key)) byMaterial.set(key, terrainBuffers());
      pushTerrainTile(byMaterial.get(key), x, z);
    }
  }

  for (const [key, buffers] of byMaterial) {
    const mesh = new THREE.Mesh(geometryFromBuffers(buffers), terrainMaterialForKey(key));
    mesh.receiveShadow = ENABLE_REALTIME_SHADOWS;
    terrainGroup.add(mesh);
  }

  const skirtBuffers = terrainBuffers();
  for (let i = -HALF_MAP; i < HALF_MAP; i += 1) {
    pushTerrainSkirt(skirtBuffers, i, -HALF_MAP, i + 1, -HALF_MAP, terrainTopHeight(i, -HALF_MAP), terrainTopHeight(i + 1, -HALF_MAP));
    pushTerrainSkirt(skirtBuffers, i + 1, HALF_MAP, i, HALF_MAP, terrainTopHeight(i + 1, HALF_MAP), terrainTopHeight(i, HALF_MAP));
    pushTerrainSkirt(skirtBuffers, -HALF_MAP, i + 1, -HALF_MAP, i, terrainTopHeight(-HALF_MAP, i + 1), terrainTopHeight(-HALF_MAP, i));
    pushTerrainSkirt(skirtBuffers, HALF_MAP, i, HALF_MAP, i + 1, terrainTopHeight(HALF_MAP, i), terrainTopHeight(HALF_MAP, i + 1));
  }
  const skirt = new THREE.Mesh(geometryFromBuffers(skirtBuffers), materials.rockSide);
  skirt.receiveShadow = ENABLE_REALTIME_SHADOWS;
  terrainGroup.add(skirt);

  initializeTerritory();
  hideTerritoryOverlay();
}

function healthBar(width = 1.8) {
  const group = new THREE.Group();
  const back = new THREE.Mesh(hpBackGeometry, materials.hpBack);
  back.scale.set(width, 1, 1);
  const fill = new THREE.Mesh(hpFillGeometry, materials.hpGood);
  fill.position.x = -width / 2;
  fill.scale.set(width, 1, 1);
  fill.userData.width = width;
  fill.userData.baseX = -width / 2;
  group.add(back, fill);
  group.userData.fill = fill;
  return group;
}

function setHealthBar(entity) {
  if (!entity.healthBar) return;
  const pct = clamp(entity.hp / entity.maxHp, 0, 1);
  const fill = entity.healthBar.userData.fill;
  fill.scale.x = fill.userData.width * pct;
  fill.position.x = fill.userData.baseX + (fill.userData.width * pct) / 2;
  fill.material = pct > 0.55 ? materials.hpGood : pct > 0.25 ? materials.hpWarn : materials.hpBad;
}

function registerStructure(group, options) {
  const entity = {
    id: crypto.randomUUID(),
    team: "defender",
    group,
    position: group.position,
    hp: options.hp,
    maxHp: options.hp,
    radius: options.radius ?? 1.5,
    type: options.type,
    value: options.value ?? 1,
    attackRange: options.attackRange ?? 0,
    attackDamage: options.attackDamage ?? 0,
    attackCooldown: options.attackCooldown ?? 1.5,
    reload: rand(0, 1),
    alive: true,
    healthBar: healthBar(options.barWidth ?? 2),
  };
  entity.healthBar.position.set(0, options.barY ?? 2.4, 0);
  group.add(entity.healthBar);
  structures.push(entity);
  structureGroup.add(group);
  return entity;
}

function addBlocker(owner, x, z, width, depth, options = {}) {
  const blocker = {
    owner,
    x,
    z,
    width,
    depth,
    pad: options.pad ?? 0.18,
    targetSkip: options.targetSkip ?? false,
  };
  movementBlockers.push(blocker);
  return blocker;
}

function removeOwnedBlockers(owner) {
  for (let i = movementBlockers.length - 1; i >= 0; i -= 1) {
    if (movementBlockers[i].owner === owner) movementBlockers.splice(i, 1);
  }
}

function syncOwnedBlockers(owner) {
  for (const blocker of movementBlockers) {
    if (blocker.owner !== owner) continue;
    blocker.x = owner.position.x;
    blocker.z = owner.position.z;
  }
}

function addWallSegment(parent, x, z, w, d, owner = null) {
  addBlock(x, 0.05, z, w, 1.7, d, materialSet(materials.castle, materials.stone), parent);
  if (owner) addBlocker(owner, parent.position.x + x, parent.position.z + z, w, d, { pad: 0.34 });
  const count = Math.max(1, Math.floor(w > d ? w : d));
  for (let i = 0; i < count; i += 1) {
    const px = w > d ? x - w / 2 + 0.5 + i : x;
    const pz = w > d ? z : z - d / 2 + 0.5 + i;
    addBlock(px, 1.65, pz, 0.44, 0.44, 0.44, materialSet(materials.castle), parent);
  }
}

function createBase(x = 0, z = -16) {
  const base = new THREE.Group();
  base.position.set(x, sampleTerrainHeight(x, z) + 0.1, z);
  addBlock(0, 0, 0, 4.7, 2.7, 4.2, materialSet(materials.castle, materials.stone), base);
  addBlock(0, 2.65, 0, 3.6, 0.8, 3.1, materialSet(materials.trim, materials.castle), base);
  addBlock(-2.25, 0.05, -1.75, 1.1, 3.5, 1.1, materialSet(materials.castle), base);
  addBlock(2.25, 0.05, -1.75, 1.1, 3.5, 1.1, materialSet(materials.castle), base);
  addBlock(-2.25, 0.05, 1.75, 1.1, 3.5, 1.1, materialSet(materials.castle), base);
  addBlock(2.25, 0.05, 1.75, 1.1, 3.5, 1.1, materialSet(materials.castle), base);
  addBlock(0, 3.42, 0, 4.6, 0.35, 0.55, materialSet(materials.banner, materials.trim), base);
  const entity = registerStructure(base, {
    type: "base",
    hp: 1800,
    radius: 3.6,
    value: 20,
    attackRange: 0,
    barWidth: 3,
    barY: 4.5,
  });
  addBlocker(entity, x, z, 5.2, 4.7, { pad: 0.34, targetSkip: true });
  addWallSegment(base, 0, 4.3, 7.6, 0.65, entity);
  addWallSegment(base, -4.1, 0.4, 0.65, 7.6, entity);
  addWallSegment(base, 4.1, 0.4, 0.65, 7.6, entity);
  baseStructure = entity;
}

function addGableRoof(parent, slopeMaterial, sideMaterial, options = {}) {
  const width = options.width ?? 3.42;
  const depth = options.depth ?? 2.9;
  const height = options.height ?? 1.12;
  const y = options.y ?? 1.2;
  const vertices = [
    -width / 2, y, -depth / 2,
    width / 2, y, -depth / 2,
    -width / 2, y, depth / 2,
    width / 2, y, depth / 2,
    0, y + height, -depth / 2,
    0, y + height, depth / 2,
  ];
  const indices = [
    0, 2, 5, 0, 5, 4,
    1, 4, 5, 1, 5, 3,
    0, 4, 1,
    2, 3, 5,
    0, 1, 2, 1, 3, 2,
  ];
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.clearGroups();
  geometry.addGroup(0, 12, 0);
  geometry.addGroup(12, 6, 1);
  geometry.addGroup(18, 6, 0);
  geometry.computeVertexNormals();
  const roof = new THREE.Mesh(geometry, [slopeMaterial, sideMaterial]);
  roof.castShadow = ENABLE_REALTIME_SHADOWS;
  roof.receiveShadow = ENABLE_REALTIME_SHADOWS;
  parent.add(roof);
  return roof;
}

function createHouse(x, z, roof = "thatch") {
  const house = new THREE.Group();
  house.position.set(x, sampleTerrainHeight(x, z) + 0.1, z);
  addBlock(0, 0, 0, 2.8, 1.35, 2.4, materialSet(materials.wood), house);
  addBlock(-0.82, 0.12, 1.24, 0.48, 0.7, 0.12, materialSet(materials.stone), house);
  addBlock(0.8, 0.12, 1.24, 0.48, 0.7, 0.12, materialSet(materials.stone), house);
  const roofMat = roof === "red" ? materials.roof : materials.thatchRoof;
  const roofSideMat = roof === "red" ? materials.roofSide : materials.thatchRoofSide;
  addGableRoof(house, roofMat, roofSideMat);
  const entity = registerStructure(house, {
    type: "house",
    hp: 360,
    radius: 1.6,
    value: 3,
    barWidth: 1.4,
    barY: 2.55,
  });
  addBlocker(entity, x, z, 2.9, 2.5, { pad: 0.24, targetSkip: true });
  return entity;
}

function createTower(x, z) {
  const tower = new THREE.Group();
  tower.position.set(x, sampleTerrainHeight(x, z) + 0.1, z);
  addBlock(0, 0, 0, 1.9, 3.2, 1.9, materialSet(materials.castle, materials.stone), tower);
  addBlock(0, 3.05, 0, 2.25, 0.48, 2.25, materialSet(materials.trim, materials.castle), tower);
  for (let i = -1; i <= 1; i += 2) {
    addBlock(i * 0.72, 3.45, -0.72, 0.42, 0.52, 0.42, materialSet(materials.castle), tower);
    addBlock(i * 0.72, 3.45, 0.72, 0.42, 0.52, 0.42, materialSet(materials.castle), tower);
    addBlock(-0.72, 3.45, i * 0.72, 0.42, 0.52, 0.42, materialSet(materials.castle), tower);
    addBlock(0.72, 3.45, i * 0.72, 0.42, 0.52, 0.42, materialSet(materials.castle), tower);
  }
  const entity = registerStructure(tower, {
    type: "tower",
    hp: 520,
    radius: 1.35,
    value: 5,
    attackRange: 9,
    attackDamage: 16,
    attackCooldown: 0.95,
    barWidth: 1.5,
    barY: 4.3,
  });
  addBlocker(entity, x, z, 2.2, 2.2, { pad: 0.26, targetSkip: true });
  return entity;
}

function createVillageCluster(site) {
  const houseCount = site.main ? 6 : 3 + Math.floor(rand(0, 2.99));
  const towerCount = site.main ? 4 : 1 + Math.floor(rand(0, 1.99));
  if (site.main) createBase(site.x, site.z);

  for (let i = 0; i < towerCount; i += 1) {
    const angle = (i / towerCount) * Math.PI * 2 + (site.main ? 0.75 : rand(-0.4, 0.4));
    const radius = site.main ? 7.4 : site.radius - 1.8;
    createTower(site.x + Math.cos(angle) * radius, site.z + Math.sin(angle) * radius);
  }

  for (let i = 0; i < houseCount; i += 1) {
    const angle = (i / houseCount) * Math.PI * 2 + rand(-0.28, 0.28);
    const radius = rand(site.main ? 6.2 : 3.5, site.main ? 10.2 : site.radius - 1.2);
    createHouse(site.x + Math.cos(angle) * radius, site.z + Math.sin(angle) * radius, i % 2 ? "red" : "thatch");
  }

  const villagers = site.main ? 18 : 7;
  for (let i = 0; i < villagers; i += 1) {
    const pos = new THREE.Vector3(site.x + rand(-site.radius * 0.55, site.radius * 0.55), 0, site.z + rand(-site.radius * 0.45, site.radius * 0.55));
    const unit = spawnUnit("villager", pos, false);
    unit.home = new THREE.Vector3(site.x, 0, site.z);
  }

  const knights = site.main ? 8 : 3;
  for (let i = 0; i < knights; i += 1) {
    const pos = new THREE.Vector3(site.x + rand(-site.radius * 0.35, site.radius * 0.35), 0, site.z + rand(-site.radius * 0.35, site.radius * 0.35));
    spawnUnit("knight", pos, false);
  }
}

function createVillage() {
  for (const site of VILLAGE_SITES) createVillageCluster(site);
}

function registerGoblinBuilding(group, options) {
  const building = {
    id: crypto.randomUUID(),
    type: options.type,
    team: "goblin",
    group,
    position: group.position,
    level: options.level ?? 1,
    hp: options.hp,
    maxHp: options.hp,
    radius: options.radius ?? 1,
    range: options.range ?? 0,
    cooldown: options.cooldown ?? 1,
    reload: rand(0, options.cooldown ?? 1),
    alive: true,
    spawned: 0,
    speed: options.speed ?? 0,
    damage: options.damage ?? 0,
    target: null,
    velocity: new THREE.Vector3(),
    frameSeed: Math.random() * 10,
    slowUntil: 0,
    healthBar: healthBar(options.barWidth ?? 1.2),
  };
  building.healthBar.position.set(0, options.barY ?? 1.6, 0);
  group.add(building.healthBar);
  goblinBuildings.push(building);
  structureGroup.add(group);
  return building;
}

function createGoblinDen(point, level) {
  const den = new THREE.Group();
  den.position.set(point.x, sampleTerrainHeight(point.x, point.z) + 0.08, point.z);
  addBlock(0, 0, 0, 1.6, 0.9, 1.45, materialSet(materials.wood), den);
  addBlock(-0.5, 0.08, 0.72, 0.36, 0.5, 0.16, materialSet(materials.mud), den);
  addBlock(0.5, 0.08, 0.72, 0.36, 0.5, 0.16, materialSet(materials.mud), den);
  addGableRoof(den, materials.thatchRoof, materials.thatchRoofSide, { width: 2.0, depth: 1.75, height: 0.62, y: 0.82 });
  const building = registerGoblinBuilding(den, {
    type: "den",
    level,
    hp: 260 + level * 58,
    cooldown: Math.max(2.2, 4.8 - level * 0.32),
    radius: 1.2,
    barY: 2.35,
  });
  addBlocker(building, point.x, point.z, 1.8, 1.6, { pad: 0.24, targetSkip: true });
  return building;
}

function createSpikeTrap(point, level) {
  const trap = new THREE.Group();
  trap.position.set(point.x, sampleTerrainHeight(point.x, point.z) + 0.06, point.z);
  addBlock(0, 0, 0, 1.45, 0.14, 1.45, materialSet(materials.wood), trap);
  for (let x = -0.45; x <= 0.45; x += 0.45) {
    for (let z = -0.45; z <= 0.45; z += 0.45) {
      addBlock(x, 0.12, z, 0.13, 0.45, 0.13, materialSet(materials.trim), trap);
    }
  }
  const building = registerGoblinBuilding(trap, {
    type: "spikes",
    level,
    hp: 180 + level * 34,
    cooldown: Math.max(0.38, 0.82 - level * 0.05),
    radius: 1.3,
    range: 2.25 + level * 0.08,
    barY: 1.05,
  });
  return building;
}

function createCatapult(point, level) {
  const catapult = new THREE.Group();
  catapult.userData.wheels = [];
  catapult.position.set(point.x, sampleTerrainHeight(point.x, point.z) + 0.08, point.z);
  addBlock(0, 0, 0, 1.8, 0.36, 1.4, materialSet(materials.wood), catapult);
  addBlock(0, 0.18, 0.08, 1.25, 0.22, 1.0, materialSet(materials.trim, materials.wood), catapult);
  addBlock(-0.58, 0.22, 0.55, 0.34, 0.34, 0.34, materialSet(materials.stone), catapult);
  addBlock(0.58, 0.22, 0.55, 0.34, 0.34, 0.34, materialSet(materials.stone), catapult);
  addBlock(-0.58, 0.22, -0.55, 0.34, 0.34, 0.34, materialSet(materials.stone), catapult);
  addBlock(0.58, 0.22, -0.55, 0.34, 0.34, 0.34, materialSet(materials.stone), catapult);
  addBlock(0, 0.46, -0.18, 0.28, 1.2, 0.24, materialSet(materials.wood), catapult);
  addBlock(0, 1.3, 0.32, 0.22, 0.22, 1.55, materialSet(materials.trim), catapult);
  for (const x of [-0.74, 0.74]) {
    for (const z of [-0.55, 0.55]) {
      const wheel = new THREE.Mesh(wheelGeometry, materials.stone);
      wheel.position.set(x, 0.18, z);
      wheel.castShadow = ENABLE_REALTIME_SHADOWS;
      wheel.receiveShadow = ENABLE_REALTIME_SHADOWS;
      catapult.userData.wheels.push(wheel);
      catapult.add(wheel);
    }
  }
  const building = registerGoblinBuilding(catapult, {
    type: "catapult",
    level,
    hp: 340 + level * 72,
    cooldown: Math.max(1.2, 2.7 - level * 0.16),
    damage: 64 + level * 18,
    speed: 1.15 + level * 0.04,
    radius: 1.45,
    range: 12.5 + level * 0.8,
    barY: 2.1,
  });
  building.blocker = addBlocker(building, point.x, point.z, 2.0, 1.55, { pad: 0.24, targetSkip: true });
  return building;
}

function createWarDrum(point, level) {
  const drum = new THREE.Group();
  drum.position.set(point.x, sampleTerrainHeight(point.x, point.z) + 0.08, point.z);
  addBlock(0, 0, 0, 1.25, 0.95, 1.25, materialSet(materials.banner, materials.wood), drum);
  addBlock(-0.85, 0, 0, 0.18, 1.55, 0.18, materialSet(materials.trim), drum);
  addBlock(0.85, 0, 0, 0.18, 1.55, 0.18, materialSet(materials.trim), drum);
  addBlock(0, 1.42, 0, 1.9, 0.24, 0.18, materialSet(materials.banner), drum);
  const building = registerGoblinBuilding(drum, {
    type: "drum",
    level,
    hp: 240 + level * 48,
    cooldown: 1,
    radius: 1.2,
    range: 8.5 + level * 0.55,
    barY: 2.2,
  });
  addBlocker(building, point.x, point.z, 1.45, 1.45, { pad: 0.24, targetSkip: true });
  return building;
}

function placeBuilding(card, point) {
  game.rage = clamp(game.rage - cardManaCost(card), 0, game.maxRage);
  const p = point.clone();
  if (card.buildingType === "den") createGoblinDen(p, card.level);
  if (card.buildingType === "spikes") createSpikeTrap(p, card.level);
  if (card.buildingType === "catapult") createCatapult(p, card.level);
  if (card.buildingType === "drum") createWarDrum(p, card.level);
  game.stats.buildingsPlaced += 1;
  createSpawnBurst(p, 0x83c16b);
}

const spriteFrameSets = {
  raider: [0, 1, 2, 3].map((frame) => spriteSheetFrame(0, frame)),
  brute: [0, 1, 2, 3].map((frame) => spriteSheetFrame(1, frame)),
  torch: [0, 1, 2, 3].map((frame) => spriteSheetFrame(2, frame)),
  knight: [0, 1, 2, 3].map((frame) => spriteSheetFrame(3, frame)),
  villager: [0, 1, 2, 3].map((frame) => spriteSheetFrame(4, frame)),
};

const spriteMaterials = Object.fromEntries(
  Object.entries(spriteFrameSets).map(([type, frames]) => [
    type,
    frames.map(
      (texture) =>
        new THREE.SpriteMaterial({
          map: texture,
          transparent: true,
          alphaTest: 0.08,
          depthWrite: false,
        }),
    ),
  ]),
);

const unitStats = {
  raider: {
    team: "goblin",
    hp: 55,
    speed: 3.35,
    damage: 11,
    range: 0.85,
    cooldown: 0.55,
    scale: [1.0, 1.1],
    radius: 0.34,
    target: "mixed",
  },
  brute: {
    team: "goblin",
    hp: 190,
    speed: 1.8,
    damage: 32,
    range: 1,
    cooldown: 0.9,
    scale: [1.35, 1.55],
    radius: 0.48,
    target: "buildings",
  },
  torch: {
    team: "goblin",
    hp: 68,
    speed: 2.8,
    damage: 23,
    range: 1.05,
    cooldown: 0.72,
    scale: [1.04, 1.15],
    radius: 0.36,
    target: "buildings",
  },
  knight: {
    team: "defender",
    hp: 150,
    speed: 2.25,
    damage: 18,
    range: 0.9,
    cooldown: 0.72,
    scale: [1.08, 1.24],
    radius: 0.38,
    target: "goblins",
  },
  villager: {
    team: "civilian",
    hp: 35,
    speed: 1.25,
    damage: 0,
    range: 0,
    cooldown: 1,
    scale: [0.94, 1.02],
    radius: 0.32,
    target: "none",
  },
};

function unitLevelScale(level) {
  return 1 + (level - 1) * 0.22;
}

function syncUnitToTerrain(unit) {
  const groundY = sampleTerrainHeight(unit.position.x, unit.position.z);
  unit.groundY = groundY;
  unit.position.y = groundY + unit.sprite.scale.y * 0.54;
  unit.shadow.position.set(unit.position.x, groundY + 0.025, unit.position.z);
}

function spawnUnit(type, position, burst = true, level = 1) {
  const stats = unitStats[type];
  const levelScale = stats.team === "goblin" ? unitLevelScale(level) : 1;
  const sprite = new THREE.Sprite(spriteMaterials[type][0]);
  sprite.position.set(position.x, 0, position.z);
  sprite.scale.set(stats.scale[0] * (1 + (level - 1) * 0.035), stats.scale[1] * (1 + (level - 1) * 0.035), 1);
  sprite.castShadow = ENABLE_REALTIME_SHADOWS;

  const shadow = new THREE.Mesh(circleGeometry, materials.shadow);
  shadow.scale.set(stats.scale[0] * 0.45, stats.scale[0] * 0.24, 1);

  const unit = {
    id: crypto.randomUUID(),
    type,
    team: stats.team,
    level,
    hp: Math.round(stats.hp * levelScale),
    maxHp: Math.round(stats.hp * levelScale),
    speed: stats.speed * (stats.team === "goblin" ? 1 + (level - 1) * 0.035 : 1),
    damage: Math.round(stats.damage * levelScale),
    range: stats.range,
    radius: stats.radius ?? stats.scale[0] * 0.36,
    cooldown: stats.cooldown,
    attackTimer: rand(0, stats.cooldown),
    sprite,
    shadow,
    position: sprite.position,
    velocity: new THREE.Vector3(),
    target: null,
    home: new THREE.Vector3(position.x, 0, position.z),
    wander: new THREE.Vector3(position.x + rand(-4, 4), 0, position.z + rand(-4, 4)),
    slowUntil: 0,
    alive: true,
    frameSeed: Math.random() * 10,
  };

  syncUnitToTerrain(unit);
  units.push(unit);
  unitGroup.add(shadow, sprite);
  if (unit.team === "goblin") game.stats.spawned += 1;
  if (burst) createSpawnBurst(position, type === "brute" ? 0xb95632 : 0x9ec96d);
  return unit;
}

function addParticle(particle) {
  if (particles.length >= MAX_PARTICLES) {
    const oldest = particles.shift();
    if (oldest) effectGroup.remove(oldest.mesh);
  }
  particles.push(particle);
  effectGroup.add(particle.mesh);
}

function createSpawnBurst(position, color) {
  const groundY = sampleTerrainHeight(position.x, position.z);
  const material = effectMaterial(color, 0.86);
  for (let i = 0; i < SPAWN_PARTICLE_COUNT; i += 1) {
    const mesh = new THREE.Mesh(spawnParticleGeometry, material);
    mesh.position.set(position.x + rand(-0.4, 0.4), groundY + 0.45 + rand(0, 0.55), position.z + rand(-0.4, 0.4));
    addParticle({
      mesh,
      life: rand(0.4, 0.75),
      age: 0,
      velocity: new THREE.Vector3(rand(-1.2, 1.2), rand(0.8, 1.8), rand(-1.2, 1.2)),
    });
  }
}

function nearestUnit(from, predicate, maxDistance = Infinity) {
  let best = null;
  let bestDist = maxDistance * maxDistance;
  for (const unit of units) {
    if (!unit.alive || !predicate(unit)) continue;
    const dist = from.distanceToSquared(unit.position);
    if (dist < bestDist) {
      best = unit;
      bestDist = dist;
    }
  }
  return best;
}

function nearestStructure(from, predicate = () => true) {
  let best = null;
  let bestDist = Infinity;
  for (const structure of structures) {
    if (!structure.alive || !predicate(structure)) continue;
    const dist = from.distanceToSquared(structure.position);
    const weighted = dist + (structure.type === "base" ? 8 : 0);
    if (weighted < bestDist) {
      best = structure;
      bestDist = weighted;
    }
  }
  return best;
}

function nearestGoblinBuilding(from, predicate = () => true, maxDistance = Infinity) {
  let best = null;
  let bestDist = maxDistance * maxDistance;
  for (const building of goblinBuildings) {
    if (!building.alive || !predicate(building)) continue;
    const dist = from.distanceToSquared(building.position);
    if (dist < bestDist) {
      best = building;
      bestDist = dist;
    }
  }
  return best;
}

function nearestDefenderTarget(from, maxDistance = Infinity) {
  const unitTarget = nearestUnit(from, (unit) => unit.team === "goblin", maxDistance);
  const buildingTarget = nearestGoblinBuilding(from, () => true, maxDistance);
  if (!unitTarget) return buildingTarget;
  if (!buildingTarget) return unitTarget;
  return from.distanceToSquared(unitTarget.position) <= from.distanceToSquared(buildingTarget.position) ? unitTarget : buildingTarget;
}

function nearestHumanTarget(unit, maxDistance) {
  return nearestUnit(
    unit.position,
    (other) => other.team === "defender" || other.team === "civilian",
    maxDistance,
  );
}

function damageUnit(unit, amount, sourceTeam = null) {
  const applied = Math.min(unit.hp, amount);
  if (sourceTeam === "goblin" && (unit.team === "defender" || unit.team === "civilian")) game.stats.damageDealt += Math.round(applied);
  if (sourceTeam === "defender" && unit.team === "goblin") game.stats.damageTaken += Math.round(applied);
  unit.hp -= amount;
  if (unit.hp <= 0) {
    unit.alive = false;
    unitGroup.remove(unit.sprite, unit.shadow);
    if (unit.team === "defender" || unit.team === "civilian") {
      game.spoils += 1;
      game.stats.defeated += 1;
    }
    if (unit.team === "goblin") game.stats.lost += 1;
  }
}

function damageGoblinBuilding(building, amount, sourceTeam = null) {
  const applied = Math.min(building.hp, amount);
  if (sourceTeam === "defender") game.stats.damageTaken += Math.round(applied);
  building.hp -= amount;
  setHealthBar(building);
  if (building.hp <= 0 && building.alive) {
    building.alive = false;
    removeOwnedBlockers(building);
    createSpawnBurst(building.position.clone(), building.type === "catapult" ? 0xb6a58a : 0x83c16b);
    structureGroup.remove(building.group);
  }
}

function damageCombatTarget(target, amount, sourceTeam = null) {
  if (target.sprite) damageUnit(target, amount, sourceTeam);
  else if (goblinBuildings.includes(target)) damageGoblinBuilding(target, amount, sourceTeam);
  else damageStructure(target, amount, sourceTeam);
}

function damageStructure(structure, amount, sourceTeam = null) {
  const applied = Math.min(structure.hp, amount);
  if (sourceTeam === "goblin") game.stats.damageDealt += Math.round(applied);
  structure.hp -= amount;
  setHealthBar(structure);
  if (structure.hp <= 0 && structure.alive) {
    structure.alive = false;
    removeOwnedBlockers(structure);
    game.stats.structuresDestroyed += 1;
    game.spoils += structure.value;
    const destroyedAt = structure.position.clone();
    createSpawnBurst(destroyedAt, structure.type === "house" ? 0xb56d34 : 0xa7a59a);
    structureGroup.remove(structure.group);
    if (structure.type === "base") {
      game.over = true;
      game.result = "Stronghold breached";
      recordRaidStats();
      battleMessage.textContent = game.result;
      battleMessage.classList.add("show");
    }
  }
}

function goblinDrumMultiplier(unit, stat) {
  if (unit.team !== "goblin") return 1;
  let boost = 1;
  for (const building of goblinBuildings) {
    if (!building.alive || building.type !== "drum") continue;
    if (unit.position.distanceToSquared(building.position) > building.range * building.range) continue;
    boost = Math.max(boost, stat === "speed" ? 1.12 + building.level * 0.03 : 1.16 + building.level * 0.04);
  }
  return boost;
}

function isBlockingObstacle(entity) {
  return entity.alive && entity.type !== "spikes";
}

function isLiveBlocker(blocker) {
  return !blocker.owner || isBlockingObstacle(blocker.owner);
}

function forEachBlockingObstacle(callback) {
  for (const blocker of movementBlockers) {
    if (isLiveBlocker(blocker)) callback(blocker);
  }
}

function expandedBlockerBounds(blocker, unit) {
  const pad = blocker.pad + (unit.radius ?? 0.36);
  return {
    left: blocker.x - blocker.width / 2 - pad,
    right: blocker.x + blocker.width / 2 + pad,
    top: blocker.z - blocker.depth / 2 - pad,
    bottom: blocker.z + blocker.depth / 2 + pad,
  };
}

function pointInsideBounds(x, z, bounds) {
  return x >= bounds.left && x <= bounds.right && z >= bounds.top && z <= bounds.bottom;
}

function segmentIntersectsBounds(ax, az, bx, bz, bounds) {
  const dx = bx - ax;
  const dz = bz - az;
  let tMin = 0;
  let tMax = 1;
  const axes = [
    [ax, dx, bounds.left, bounds.right],
    [az, dz, bounds.top, bounds.bottom],
  ];

  for (const [start, delta, min, max] of axes) {
    if (Math.abs(delta) < 0.0001) {
      if (start < min || start > max) return false;
      continue;
    }
    const inv = 1 / delta;
    let t1 = (min - start) * inv;
    let t2 = (max - start) * inv;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return false;
  }
  return true;
}

function steerAroundObstacles(unit, direction, targetEntity) {
  const steering = tmpSteering.copy(direction);
  const lookAhead = 1.8 + unit.speed * 0.72;
  const aheadX = unit.position.x + direction.x * lookAhead;
  const aheadZ = unit.position.z + direction.z * lookAhead;

  forEachBlockingObstacle((blocker) => {
    if (blocker.owner === unit) return;
    if (blocker.owner === targetEntity && blocker.targetSkip) return;
    const bounds = expandedBlockerBounds(blocker, unit);
    if (!segmentIntersectsBounds(unit.position.x, unit.position.z, aheadX, aheadZ, bounds)) return;

    const centerDx = blocker.x - unit.position.x;
    const centerDz = blocker.z - unit.position.z;
    const lateralSigned = direction.x * centerDz - direction.z * centerDx;
    const turnSign = lateralSigned >= 0 ? -1 : 1;
    const forward = Math.max(0, centerDx * direction.x + centerDz * direction.z);
    const force = Math.max(0.35, 1 - forward / Math.max(lookAhead, 0.001)) * 1.55;
    steering.x += -direction.z * turnSign * force;
    steering.z += direction.x * turnSign * force;
  });

  if (steering.lengthSq() < 0.001) return direction;
  return steering.normalize();
}

function separateFromObstacles(unit, targetEntity) {
  forEachBlockingObstacle((blocker) => {
    if (blocker.owner === unit) return;
    if (blocker.owner === targetEntity && blocker.targetSkip) return;
    const bounds = expandedBlockerBounds(blocker, unit);
    if (!pointInsideBounds(unit.position.x, unit.position.z, bounds)) return;

    const pushLeft = Math.abs(unit.position.x - bounds.left);
    const pushRight = Math.abs(bounds.right - unit.position.x);
    const pushTop = Math.abs(unit.position.z - bounds.top);
    const pushBottom = Math.abs(bounds.bottom - unit.position.z);
    const minPush = Math.min(pushLeft, pushRight, pushTop, pushBottom);

    if (minPush === pushLeft) unit.position.x = bounds.left - 0.02;
    else if (minPush === pushRight) unit.position.x = bounds.right + 0.02;
    else if (minPush === pushTop) unit.position.z = bounds.top - 0.02;
    else unit.position.z = bounds.bottom + 0.02;
  });
  unit.position.x = clamp(unit.position.x, -HALF_MAP + 0.8, HALF_MAP - 0.8);
  unit.position.z = clamp(unit.position.z, -HALF_MAP + 0.8, HALF_MAP - 0.8);
}

function moveToward(unit, targetPosition, dt, stopDistance = 0, targetEntity = null, speedMultiplier = 1) {
  tmpVec.copy(targetPosition).sub(unit.position);
  tmpVec.y = 0;
  const dist = tmpVec.length();
  if (dist <= stopDistance || dist < 0.001) {
    unit.velocity.multiplyScalar(0.8);
    separateFromObstacles(unit, targetEntity);
    return dist;
  }
  tmpVec.normalize();
  const wiggle = Math.sin(game.time * 2.6 + (unit.frameSeed ?? 0)) * 0.22;
  const direction = steerAroundObstacles(unit, tmpVec, targetEntity);
  tmpVec2.set(-direction.z, 0, direction.x).multiplyScalar(wiggle);
  unit.velocity
    .copy(direction.add(tmpVec2).normalize())
    .multiplyScalar(unit.speed * speedMultiplier * goblinDrumMultiplier(unit, "speed") * (game.time < (unit.slowUntil ?? 0) ? 0.52 : 1));
  unit.position.addScaledVector(unit.velocity, dt);
  unit.position.x = clamp(unit.position.x, -HALF_MAP + 0.8, HALF_MAP - 0.8);
  unit.position.z = clamp(unit.position.z, -HALF_MAP + 0.8, HALF_MAP - 0.8);
  separateFromObstacles(unit, targetEntity);
  return dist;
}

function updateGoblin(unit, dt) {
  const humanRange = unit.type === "raider" ? 11 : 5.5;
  const nearbyHuman = nearestHumanTarget(unit, humanRange);
  const structureTarget = nearestStructure(unit.position, (structure) =>
    unit.type === "raider" ? true : structure.type !== "tower" || structure.hp < 220,
  );

  if (nearbyHuman && (unit.type === "raider" || !structureTarget || nearbyHuman.position.distanceToSquared(unit.position) < 10)) {
    unit.target = nearbyHuman;
  } else {
    unit.target = structureTarget ?? nearestHumanTarget(unit, 18);
  }

  if (!unit.target) return;
  const targetPos = unit.target.position;
  const radius = unit.target.radius ?? 0.55;
  const dist = moveToward(unit, targetPos, dt, unit.range + radius, unit.target);
  if (dist <= unit.range + radius + 0.08) {
    unit.attackTimer -= dt;
    if (unit.attackTimer <= 0) {
      unit.attackTimer = unit.cooldown;
      const damage = unit.damage * goblinDrumMultiplier(unit, "damage");
      if (unit.target.sprite) damageUnit(unit.target, damage, "goblin");
      else damageStructure(unit.target, damage * (unit.type === "torch" ? 1.35 : 1), "goblin");
      createHitParticle(targetPos, unit.type === "torch" ? 0xf0a443 : 0xbfd07a);
    }
  }
}

function updateKnight(unit, dt) {
  unit.target = nearestDefenderTarget(unit.position, 12);
  if (!unit.target) {
    const guard = baseStructure?.alive ? baseStructure.position : fallbackGuard;
    const patrol = tmpPoint.set(
      guard.x + Math.sin(game.time * 0.55 + unit.frameSeed) * 5,
      0,
      guard.z + 4 + Math.cos(game.time * 0.45 + unit.frameSeed) * 3,
    );
    moveToward(unit, patrol, dt, 0.7);
    return;
  }

  const dist = moveToward(unit, unit.target.position, dt, unit.range + 0.3, unit.target);
  if (dist <= unit.range + 0.35) {
    unit.attackTimer -= dt;
    if (unit.attackTimer <= 0) {
      unit.attackTimer = unit.cooldown;
      damageCombatTarget(unit.target, unit.damage, "defender");
      createHitParticle(unit.target.position, 0xbcd5e6);
    }
  }
}

function updateVillager(unit, dt) {
  const danger = nearestUnit(unit.position, (other) => other.team === "goblin", 5.5);
  if (danger) {
    tmpVec.copy(unit.position).sub(danger.position).setY(0);
    if (tmpVec.lengthSq() > 0.001) {
      tmpVec.normalize();
      const fleeTarget = tmpPoint.copy(unit.position).addScaledVector(tmpVec, 5);
      moveToward(unit, fleeTarget, dt, 0, null, 1.7);
    }
  } else {
    if (unit.position.distanceToSquared(unit.wander) < 0.25 || Math.random() < 0.003) {
      unit.wander.set(unit.home.x + rand(-5, 5), 0, unit.home.z + rand(-4, 5));
    }
    moveToward(unit, unit.wander, dt, 0.4);
  }
}

function createHitParticle(position, color) {
  const groundY = sampleTerrainHeight(position.x, position.z);
  const mesh = new THREE.Mesh(hitParticleGeometry, effectMaterial(color, 0.9));
  mesh.position.set(position.x, Math.max(position.y, groundY + 0.65), position.z);
  addParticle({
    mesh,
    life: 0.28,
    age: 0,
    velocity: new THREE.Vector3(rand(-0.5, 0.5), rand(0.8, 1.4), rand(-0.5, 0.5)),
  });
}

function shootTower(tower, target) {
  const mesh = new THREE.Mesh(arrowGeometry, effectMaterial(0xf2d186, 1));
  mesh.position.set(tower.position.x, tower.position.y + 3.7, tower.position.z);
  projectiles.push({
    mesh,
    target,
    speed: 12,
    damage: tower.attackDamage,
    sourceTeam: "defender",
    alive: true,
  });
  effectGroup.add(mesh);
}

function shootCatapult(catapult, target) {
  const mesh = new THREE.Mesh(catapultShotGeometry, effectMaterial(0x6d6d66, 1));
  mesh.position.set(catapult.position.x, catapult.position.y + 1.35, catapult.position.z);
  projectiles.push({
    mesh,
    target,
    speed: 8.8,
    damage: catapult.damage,
    sourceTeam: "goblin",
    alive: true,
  });
  effectGroup.add(mesh);
}

function updateTowers(dt) {
  for (const structure of structures) {
    if (!structure.alive || structure.type !== "tower") continue;
    structure.reload -= dt;
    if (structure.reload > 0) continue;
    const target = nearestDefenderTarget(structure.position, structure.attackRange);
    if (target) {
      structure.reload = structure.attackCooldown;
      shootTower(structure, target);
    }
  }
}

function updateProjectiles(dt) {
  for (const projectile of projectiles) {
    if (!projectile.alive || !projectile.target?.alive) {
      projectile.alive = false;
      effectGroup.remove(projectile.mesh);
      continue;
    }
    tmpVec.copy(projectile.target.position);
    tmpVec.y += 0.9;
    tmpVec.sub(projectile.mesh.position);
    const dist = tmpVec.length();
    if (dist < 0.25) {
      projectile.alive = false;
      damageCombatTarget(projectile.target, projectile.damage, projectile.sourceTeam);
      createHitParticle(projectile.target.position, 0xf5d27d);
      effectGroup.remove(projectile.mesh);
      continue;
    }
    tmpVec.normalize();
    projectile.mesh.position.addScaledVector(tmpVec, projectile.speed * dt);
    projectile.mesh.lookAt(projectile.target.position.x, projectile.target.position.y + 0.8, projectile.target.position.z);
  }
  for (let i = projectiles.length - 1; i >= 0; i -= 1) {
    if (!projectiles[i].alive) projectiles.splice(i, 1);
  }
}

function updateParticles(dt) {
  for (const particle of particles) {
    particle.age += dt;
    particle.mesh.position.addScaledVector(particle.velocity, dt);
    particle.velocity.y -= dt * 3.8;
    const pct = 1 - particle.age / particle.life;
    particle.mesh.scale.setScalar(0.65 + pct * 0.6);
  }
  for (let i = particles.length - 1; i >= 0; i -= 1) {
    if (particles[i].age >= particles[i].life) {
      effectGroup.remove(particles[i].mesh);
      particles.splice(i, 1);
    }
  }
}

function updateUnitAnimation(unit) {
  const frames = spriteMaterials[unit.type];
  if (!frames) return;
  const moving = unit.velocity.lengthSq() > 0.03;
  const frame = moving
    ? Math.floor((game.time * 8 + unit.frameSeed) % frames.length)
    : Math.floor((game.time * 2 + unit.frameSeed) % Math.min(2, frames.length));
  unit.sprite.material = frames[frame];
  syncUnitToTerrain(unit);
}

function updateUnits(dt) {
  for (const unit of units) {
    if (!unit.alive) continue;
    unit.velocity.multiplyScalar(0);
    if (unit.team === "goblin") updateGoblin(unit, dt);
    else if (unit.team === "defender") updateKnight(unit, dt);
    else updateVillager(unit, dt);
    updateUnitAnimation(unit);
  }
  for (let i = units.length - 1; i >= 0; i -= 1) {
    if (!units[i].alive) units.splice(i, 1);
  }
}

function updateDefenderSpawns(dt) {
  if (!baseStructure?.alive) return;
  game.defenderPulse -= dt;
  if (game.defenderPulse > 0) return;
  game.defenderPulse = Math.max(9, 17 - game.time * 0.035);
  let livingGoblins = 0;
  let livingKnights = 0;
  for (const unit of units) {
    if (unit.team === "goblin") livingGoblins += 1;
    else if (unit.team === "defender") livingKnights += 1;
  }
  if (livingGoblins > 7 && livingKnights < 18) {
    for (let i = 0; i < 2; i += 1) {
      spawnUnit("knight", new THREE.Vector3(rand(-3.3, 3.3), 0, rand(-8.4, -5.7)));
    }
  }
}

function syncBuildingToTerrain(building) {
  building.position.y = sampleTerrainHeight(building.position.x, building.position.z) + 0.08;
  syncOwnedBlockers(building);
}

function updateGoblinBuildings(dt) {
  for (const building of goblinBuildings) {
    if (!building.alive) continue;
    building.reload -= dt;

    if (building.type === "catapult") {
      const target = nearestStructure(building.position);
      building.target = target;
      if (!target) {
        building.velocity.multiplyScalar(0.7);
        continue;
      }

      const rangeSq = building.range * building.range;
      if (building.position.distanceToSquared(target.position) > rangeSq) {
        moveToward(building, target.position, dt, building.range * 0.88, target, 1);
        syncBuildingToTerrain(building);
        if (building.velocity.lengthSq() > 0.002) {
          building.group.rotation.y = Math.atan2(building.velocity.x, building.velocity.z);
          const wheelSpin = Math.hypot(building.velocity.x, building.velocity.z) * dt * 3.6;
          for (const wheel of building.group.userData.wheels ?? []) wheel.rotation.x += wheelSpin;
        }
        building.reload = Math.min(building.reload, 0.28);
        continue;
      }

      building.velocity.multiplyScalar(0.75);
      syncBuildingToTerrain(building);
      if (building.reload <= 0) {
        building.reload = building.cooldown;
        shootCatapult(building, target);
      }
      continue;
    }

    if (building.reload > 0) continue;

    if (building.type === "den") {
      let nearby = 0;
      for (const unit of units) {
        if (unit.alive && unit.team === "goblin" && unit.position.distanceToSquared(building.position) < 36) nearby += 1;
      }
      if (nearby < 9 + building.level * 2) {
        building.reload = building.cooldown;
        building.spawned += 1;
        const pos = new THREE.Vector3(building.position.x + rand(-1.2, 1.2), 0, building.position.z + rand(-1.2, 1.2));
        spawnUnit("raider", pos, true, building.level);
      } else {
        building.reload = 0.8;
      }
    }

    if (building.type === "spikes") {
      let hit = false;
      const rangeSq = building.range * building.range;
      for (const target of units) {
        if (
          target.alive &&
          (target.team === "defender" || target.team === "civilian") &&
          target.position.distanceToSquared(building.position) <= rangeSq
        ) {
          hit = true;
          target.slowUntil = Math.max(target.slowUntil ?? 0, game.time + 1.05);
          damageUnit(target, 34 + building.level * 12, "goblin");
          createHitParticle(target.position, 0xddd0a8);
        }
      }
      if (hit) {
        building.reload = building.cooldown;
      } else {
        building.reload = 0.18;
      }
    }

    if (building.type === "drum") {
      building.reload = building.cooldown;
      let helped = false;
      for (const unit of units) {
        if (!unit.alive || unit.team !== "goblin") continue;
        if (unit.position.distanceToSquared(building.position) > building.range * building.range) continue;
        unit.hp = Math.min(unit.maxHp, unit.hp + 4 + building.level * 2);
        helped = true;
      }
      if (helped) createHitParticle(building.position, 0xe4bb58);
    }
  }
}

function cardCount(card) {
  if (card.type !== "unit") return 1;
  return card.count + Math.floor((card.level - 1) * (card.id === "brutes" ? 0.7 : 1.35));
}

function cardUpgradeCost(card) {
  return card.level >= 7 ? null : card.upgradeBaseCost + card.level * 3;
}

function cardManaCost(card) {
  return card.type === "territory" ? territoryUnlockCost() : card.cost;
}

function activeCardCount() {
  return cards.filter((card) => card.unlocked && card.active).length;
}

function createCardArtDataUrl(card) {
  const canvasArt = document.createElement("canvas");
  canvasArt.width = 64;
  canvasArt.height = 48;
  const ctx = canvasArt.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = card.type === "territory" ? "#263a33" : card.type === "building" ? "#2e3330" : card.id === "brutes" ? "#463421" : card.id === "torches" ? "#27324a" : "#263a33";
  ctx.fillRect(0, 0, 64, 48);
  ctx.fillStyle = "#1a211f";
  ctx.fillRect(0, 34, 64, 14);
  if (card.type === "unit") {
    const bodies = card.id === "brutes" ? [[24, 12, 18, 22]] : card.id === "torches" ? [[22, 12, 13, 20], [38, 18, 10, 16]] : [[12, 14, 10, 16], [27, 10, 12, 19], [43, 16, 9, 15]];
    for (const [x, y, w, h] of bodies) {
      ctx.fillStyle = "#101010";
      ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
      ctx.fillStyle = "#5ea140";
      ctx.fillRect(x + 2, y, w - 4, Math.max(5, Math.floor(h * 0.34)));
      ctx.fillStyle = "#7a4826";
      ctx.fillRect(x + 1, y + Math.floor(h * 0.35), w - 2, Math.floor(h * 0.38));
      ctx.fillStyle = "#2e2318";
      ctx.fillRect(x + 2, y + h - 4, 3, 4);
      ctx.fillRect(x + w - 5, y + h - 4, 3, 4);
      ctx.fillStyle = "#f3ce54";
      ctx.fillRect(x + 3, y + 4, 2, 1);
      ctx.fillRect(x + w - 5, y + 4, 2, 1);
    }
  }
  if (card.id === "claim") {
    ctx.fillStyle = "#7fc149";
    ctx.fillRect(12, 10, 16, 16);
    ctx.fillRect(31, 10, 16, 16);
    ctx.fillRect(12, 29, 16, 10);
    ctx.fillStyle = "#e4c153";
    ctx.fillRect(29, 27, 8, 8);
  }
  if (card.id === "spikes") {
    ctx.fillStyle = "#8b5b2e";
    ctx.fillRect(14, 29, 36, 6);
    ctx.fillStyle = "#d9d6c9";
    for (let i = 0; i < 6; i += 1) ctx.fillRect(16 + i * 6, 17, 3, 14);
  }
  if (card.id === "den") {
    ctx.fillStyle = "#6f4320";
    ctx.fillRect(18, 20, 28, 16);
    ctx.fillStyle = "#caa746";
    ctx.fillRect(14, 14, 36, 9);
  }
  if (card.id === "catapult") {
    ctx.fillStyle = "#8b5b2e";
    ctx.fillRect(14, 28, 34, 6);
    ctx.fillRect(28, 13, 6, 22);
    ctx.fillStyle = "#aaa79a";
    ctx.fillRect(36, 15, 8, 8);
  }
  if (card.id === "drum") {
    ctx.fillStyle = "#9a2d27";
    ctx.fillRect(22, 15, 20, 22);
    ctx.fillStyle = "#edc15a";
    ctx.fillRect(20, 13, 24, 5);
    ctx.fillRect(20, 34, 24, 4);
  }
  if (card.id === "brutes") {
    ctx.fillStyle = "#8a562d";
    ctx.fillRect(42, 7, 7, 25);
    ctx.fillStyle = "#b88043";
    ctx.fillRect(40, 5, 11, 7);
  }
  if (card.id === "torches") {
    ctx.fillStyle = "#8b4e22";
    ctx.fillRect(47, 8, 3, 20);
    ctx.fillStyle = "#ff9d28";
    ctx.fillRect(45, 5, 8, 7);
    ctx.fillStyle = "#ffe36f";
    ctx.fillRect(48, 4, 3, 3);
  }
  return `url("${canvasArt.toDataURL("image/png")}")`;
}

function upgradeCard(card) {
  const cost = cardUpgradeCost(card);
  if (!card.unlocked || cost === null || game.spoils < cost) return;
  game.spoils -= cost;
  card.level += 1;
  buildDeck();
  updateHud();
}

function unlockCard(card) {
  if (card.unlocked || game.spoils < card.unlockCost) return;
  game.spoils -= card.unlockCost;
  card.unlocked = true;
  if (activeCardCount() < MAX_ACTIVE_CARDS) card.active = true;
  buildDeck();
  updateHud();
}

function toggleCardActive(card) {
  if (!card.unlocked) return;
  if (card.active) {
    if (activeCardCount() <= 1) return;
    card.active = false;
  } else if (activeCardCount() < MAX_ACTIVE_CARDS) {
    card.active = true;
  }
  buildDeck();
  updateHud();
}

function buildDeck() {
  deckEl.innerHTML = "";
  cardElements.clear();
  const visibleCards = cards.filter(
    (card) => card.type !== "territory" || unlockedTerritory.size < TERRITORY_CHUNKS * TERRITORY_CHUNKS,
  );
  for (const card of visibleCards) {
    const button = document.createElement("div");
    const cost = cardUpgradeCost(card);
    button.className = "card";
    button.dataset.card = card.id;
    button.role = "button";
    button.tabIndex = 0;
    button.style.setProperty("--card-art", createCardArtDataUrl(card));
    const detail = card.type === "unit" ? `x${cardCount(card)}` : card.type === "territory" ? "5x5" : "Build";
    button.innerHTML = `
      <span class="cost">${cardManaCost(card)}</span>
      <span class="card-level">Lv ${card.level}</span>
      <span class="card-title"><span>${card.title}</span><span class="card-count">${detail}</span></span>
      <button class="upgrade-button" type="button" title="Upgrade with spoils">${cost === null ? "MAX" : `+ ${cost}`}</button>
      <button class="deck-button" type="button">${card.unlocked ? (card.active ? "Bench" : "Add") : `Unlock ${card.unlockCost}`}</button>
    `;
    button.addEventListener("pointerdown", (event) => beginCardDrag(event, card));
    button.querySelector(".upgrade-button").addEventListener("pointerdown", (event) => event.stopPropagation());
    button.querySelector(".upgrade-button").addEventListener("click", (event) => {
      event.stopPropagation();
      upgradeCard(card);
    });
    button.querySelector(".deck-button").addEventListener("pointerdown", (event) => event.stopPropagation());
    button.querySelector(".deck-button").addEventListener("click", (event) => {
      event.stopPropagation();
      if (card.unlocked) toggleCardActive(card);
      else unlockCard(card);
    });
    cardElements.set(card.id, {
      root: button,
      cost: button.querySelector(".cost"),
      upgradeButton: button.querySelector(".upgrade-button"),
      deckButton: button.querySelector(".deck-button"),
    });
    deckEl.append(button);
  }
}

let dragState = null;
const spawnPreview = new THREE.Mesh(new THREE.RingGeometry(0.75, 1.05, 48), materials.spawnBad);
spawnPreview.rotation.x = -Math.PI / 2;
spawnPreview.position.y = 0.18;
spawnPreview.visible = false;
scene.add(spawnPreview);

function beginCardDrag(event, card) {
  if (!game.started || game.over || game.paused || !card.unlocked || !card.active || game.rage < cardManaCost(card)) return;
  event.preventDefault();
  const ghost = document.createElement("div");
  ghost.className = "drag-ghost";
  ghost.dataset.card = card.id;
  ghost.style.setProperty("--card-art", createCardArtDataUrl(card));
  document.body.append(ghost);
  dragState = {
    card,
    ghost,
    point: null,
    valid: false,
  };
  updateCardDrag(event);
}

function updateCardDrag(event) {
  if (!dragState) return;
  dragState.ghost.style.left = `${event.clientX - 38}px`;
  dragState.ghost.style.top = `${event.clientY - 48}px`;
  const point = pointerToGround(event.clientX, event.clientY);
  const actionPoint = actionPointForDrop(dragState.card, point);
  dragState.point = actionPoint;
  dragState.valid = !!actionPoint && game.rage >= cardManaCost(dragState.card);
  if (dragState.card.type === "territory") updateTerritoryPlacementOverlay(point);
  else hideTerritoryOverlay();
  spawnPreview.visible = !!point;
  if (point) {
    const previewPoint = actionPoint ?? point;
    spawnPreview.position.x = previewPoint.x;
    spawnPreview.position.z = previewPoint.z;
    spawnPreview.position.y = sampleTerrainHeight(previewPoint.x, previewPoint.z) + 0.08;
    spawnPreview.material = dragState.valid
      ? dragState.card.type === "territory"
        ? materials.territoryPreview
        : materials.spawnGood
      : materials.spawnBad;
  }
}

function endCardDrag() {
  if (!dragState) return;
  if (dragState.valid && dragState.point) {
    if (dragState.card.type === "territory") unlockTerritoryAt(dragState.point);
    if (dragState.card.type === "unit") spawnSwarm(dragState.card, dragState.point);
    if (dragState.card.type === "building") placeBuilding(dragState.card, dragState.point);
  }
  dragState.ghost.remove();
  dragState = null;
  spawnPreview.visible = false;
  hideTerritoryOverlay();
}

function canSpawnAt(point) {
  return !!point && isPointInUnlockedTerritory(point) && !isWaterTile(point.x, point.z);
}

function actionPointForDrop(card, point) {
  if (!point) return null;
  const outerLimit = HALF_MAP + SPAWN_DROP_TOLERANCE;
  if (Math.abs(point.x) > outerLimit || Math.abs(point.z) > outerLimit) return null;
  const clamped = new THREE.Vector3(
    clamp(point.x, -HALF_MAP + SPAWN_EDGE_PADDING, HALF_MAP - SPAWN_EDGE_PADDING),
    0,
    clamp(point.z, -HALF_MAP + SPAWN_EDGE_PADDING, HALF_MAP - SPAWN_EDGE_PADDING),
  );
  if (card.type === "territory") {
    const chunk = territoryChunkFromPoint(clamped);
    if (!chunk || !isChunkUnlockable(chunk.cx, chunk.cz)) return null;
    return territoryCenter(chunk.cx, chunk.cz);
  }
  if (!canSpawnAt(clamped)) return null;
  return clamped;
}

function spawnSwarm(card, point) {
  game.rage = clamp(game.rage - cardManaCost(card), 0, game.maxRage);
  const count = cardCount(card);
  for (let i = 0; i < count; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const radius = Math.sqrt(Math.random()) * card.spread;
    const candidate = new THREE.Vector3(
      clamp(point.x + Math.cos(angle) * radius, -HALF_MAP + SPAWN_EDGE_PADDING, HALF_MAP - SPAWN_EDGE_PADDING),
      0,
      clamp(point.z + Math.sin(angle) * radius, -HALF_MAP + SPAWN_EDGE_PADDING, HALF_MAP - SPAWN_EDGE_PADDING),
    );
    const pos = canSpawnAt(candidate) ? candidate : point.clone();
    spawnUnit(card.unitType, pos, true, card.level);
  }
}

function pointerToGround(clientX, clientY) {
  const rect = renderer.domElement.getBoundingClientRect();
  pointerNdc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  pointerNdc.y = -(((clientY - rect.top) / rect.height) * 2 - 1);
  raycaster.setFromCamera(pointerNdc, camera);
  const hit = raycaster.ray.intersectPlane(groundPlane, tmpPoint);
  return hit ? tmpPoint.clone() : null;
}

function loadBestStats() {
  try {
    return JSON.parse(localStorage.getItem(saveKey)) ?? { raids: 0, bestTime: 0, bestSpoils: 0, bestDamage: 0 };
  } catch {
    return { raids: 0, bestTime: 0, bestSpoils: 0, bestDamage: 0 };
  }
}

function saveBestStats(stats) {
  localStorage.setItem(saveKey, JSON.stringify(stats));
}

function recordRaidStats() {
  if (game.statsRecorded || game.time <= 0) return;
  const best = loadBestStats();
  best.raids += 1;
  best.bestTime = Math.max(best.bestTime, Math.floor(game.time));
  best.bestSpoils = Math.max(best.bestSpoils, game.spoils);
  best.bestDamage = Math.max(best.bestDamage, game.stats.damageDealt);
  saveBestStats(best);
  game.statsRecorded = true;
}

function updateStatsPanels() {
  statTime.textContent = formatTime(game.time);
  statSpoils.textContent = game.spoils;
  statDamage.textContent = game.stats.damageDealt;
  statStructures.textContent = game.stats.structuresDestroyed;
  statDefeated.textContent = game.stats.defeated;
  statLost.textContent = game.stats.lost;
  statSpawned.textContent = game.stats.spawned;
  statBuildings.textContent = game.stats.buildingsPlaced;

  const best = loadBestStats();
  menuBestTime.textContent = formatTime(best.bestTime ?? 0);
  menuBestSpoils.textContent = best.bestSpoils ?? 0;
  menuBestDamage.textContent = best.bestDamage ?? 0;
  menuRaids.textContent = best.raids ?? 0;
}

function setMenuOpen(open) {
  document.body.classList.toggle("menu-open", open);
}

function setPauseButton(paused) {
  pauseToggle.innerHTML = paused ? '<i data-lucide="play"></i>' : '<i data-lucide="pause"></i>';
  pauseToggle.setAttribute("aria-label", paused ? "Resume" : "Pause");
  pauseToggle.setAttribute("title", paused ? "Resume" : "Pause");
  createIcons({ icons: { Play, Pause } });
}

function closeMenus() {
  mainMenu.classList.add("hidden");
  pauseMenu.classList.add("hidden");
  setMenuOpen(false);
}

function startRaid() {
  if (game.time > 0 || game.statsRecorded) {
    window.location.reload();
    return;
  }
  game.started = true;
  game.paused = false;
  battleMessage.classList.remove("show");
  closeMenus();
  setPauseButton(false);
}

function showMainMenu() {
  game.started = false;
  game.paused = true;
  if (dragState) endCardDrag();
  pauseMenu.classList.add("hidden");
  mainMenu.classList.remove("hidden");
  startRaidButton.textContent = game.time > 0 ? "Start New Raid" : "Start Raid";
  setMenuOpen(true);
  setPauseButton(true);
  updateStatsPanels();
}

function showPauseMenu() {
  if (!game.started || game.over) return;
  game.paused = true;
  pauseMenu.classList.remove("hidden");
  mainMenu.classList.add("hidden");
  setMenuOpen(true);
  setPauseButton(true);
  updateStatsPanels();
}

function resumeRaid() {
  if (!game.started || game.over) return;
  game.paused = false;
  closeMenus();
  setPauseButton(false);
}

function restartRaid() {
  recordRaidStats();
  window.location.reload();
}

function exitToMainMenu() {
  recordRaidStats();
  showMainMenu();
}

let pointerPan = null;

function beginWorldDrag(event) {
  if (event.target !== canvas || dragState || document.body.classList.contains("menu-open")) return;
  pointerPan = {
    x: event.clientX,
    y: event.clientY,
    rotate: event.button === 2 || event.shiftKey,
  };
  canvas.classList.add("dragging");
}

function updateWorldDrag(event) {
  if (!pointerPan || dragState) return;
  const dx = event.clientX - pointerPan.x;
  const dy = event.clientY - pointerPan.y;
  pointerPan.x = event.clientX;
  pointerPan.y = event.clientY;

  if (pointerPan.rotate) {
    cameraState.yaw -= dx * 0.0065;
    cameraState.pitch = clamp(cameraState.pitch + dy * 0.0055, MIN_CAMERA_PITCH, MAX_CAMERA_PITCH);
    updateCamera();
    return;
  }

  camera.getWorldDirection(tmpCameraForward);
  tmpCameraForward.y = 0;
  tmpCameraForward.normalize();
  tmpCameraRight.crossVectors(tmpCameraForward, camera.up).normalize();
  const scale = cameraState.distance / Math.min(window.innerWidth, window.innerHeight) * 0.58;
  cameraState.target.addScaledVector(tmpCameraRight, -dx * scale);
  cameraState.target.addScaledVector(tmpCameraForward, dy * scale);
  cameraState.target.x = clamp(cameraState.target.x, -HALF_MAP + 8, HALF_MAP - 8);
  cameraState.target.z = clamp(cameraState.target.z, -HALF_MAP + 8, HALF_MAP - 8);
  updateCamera();
}

function endWorldDrag() {
  pointerPan = null;
  canvas.classList.remove("dragging");
}

function updateCamera() {
  const aspect = window.innerWidth / window.innerHeight;
  camera.aspect = aspect;
  camera.updateProjectionMatrix();

  tmpCameraDir.set(
    Math.sin(cameraState.yaw) * Math.cos(cameraState.pitch),
    Math.sin(cameraState.pitch),
    Math.cos(cameraState.yaw) * Math.cos(cameraState.pitch),
  );
  camera.position.copy(cameraState.target).addScaledVector(tmpCameraDir, cameraState.distance);
  camera.lookAt(cameraState.target);
}

function resize() {
  renderer.setSize(window.innerWidth, window.innerHeight);
  updateCamera();
}

function rotateCamera(amount) {
  cameraState.yaw += amount;
  updateCamera();
}

function pitchCamera(amount) {
  cameraState.pitch = clamp(cameraState.pitch + amount, MIN_CAMERA_PITCH, MAX_CAMERA_PITCH);
  updateCamera();
}

function zoomCamera(factor) {
  cameraState.distance = clamp(cameraState.distance * factor, 18, 340);
  updateCamera();
}

function resetCamera() {
  cameraState.target.set(0, 0, -2);
  cameraState.yaw = 0;
  cameraState.pitch = 0.92;
  cameraState.distance = 226;
  updateCamera();
}

function updatePerformanceStats(frameDt) {
  perfElapsed += frameDt;
  perfFrames += 1;
  perfWorstFrame = Math.max(perfWorstFrame, frameDt);
  if (perfElapsed < 1) return;
  perfStats.fps = Math.round(perfFrames / perfElapsed);
  perfStats.avgFrameMs = Number(((perfElapsed * 1000) / perfFrames).toFixed(2));
  perfStats.worstFrameMs = Number((perfWorstFrame * 1000).toFixed(2));
  perfStats.drawCalls = renderer.info.render.calls;
  perfStats.triangles = renderer.info.render.triangles;
  perfStats.units = units.length;
  perfStats.particles = particles.length;
  perfStats.projectiles = projectiles.length;
  perfStats.pixelRatio = renderer.getPixelRatio();
  perfStats.shadows = renderer.shadowMap.enabled;
  document.documentElement.dataset.fps = String(perfStats.fps);
  document.documentElement.dataset.frameMs = String(perfStats.avgFrameMs);
  document.documentElement.dataset.drawCalls = String(perfStats.drawCalls);
  document.documentElement.dataset.triangles = String(perfStats.triangles);
  perfElapsed = 0;
  perfFrames = 0;
  perfWorstFrame = 0;
}

function updateHud() {
  const basePct = baseStructure ? clamp(baseStructure.hp / baseStructure.maxHp, 0, 1) : 0;
  baseReadout.textContent = `${Math.round(basePct * 100)}%`;
  baseMeter.style.width = `${basePct * 100}%`;
  rageReadout.textContent = `${Math.floor(game.rage)} / ${game.maxRage}`;
  rageMeter.style.width = `${(game.rage / game.maxRage) * 100}%`;
  raidReadout.textContent = formatTime(game.time);
  let goblinCount = 0;
  let defenderCount = 0;
  for (const unit of units) {
    if (unit.team === "goblin") goblinCount += 1;
    else if (unit.team === "defender") defenderCount += 1;
  }
  let structureCount = 0;
  for (const structure of structures) {
    if (structure.alive) structureCount += 1;
  }
  hordeReadout.textContent = goblinCount;
  defenderReadout.textContent = defenderCount;
  structureReadout.textContent = structureCount;
  spoilsReadout.textContent = game.spoils;
  territoryReadout.textContent = `${unlockedTerritory.size}/${TERRITORY_CHUNKS * TERRITORY_CHUNKS}`;

  for (const [cardId, refs] of cardElements) {
    const card = cards.find((item) => item.id === cardId);
    const cannotDeploy = game.paused || game.over || !card.unlocked || !card.active || game.rage < cardManaCost(card);
    refs.root.classList.toggle("disabled", cannotDeploy);
    refs.root.classList.toggle("locked", !card.unlocked);
    refs.root.classList.toggle("benched", card.unlocked && !card.active);
    refs.root.setAttribute("aria-disabled", String(cannotDeploy));
    refs.cost.textContent = cardManaCost(card);
    const upgradeCost = cardUpgradeCost(card);
    refs.upgradeButton.disabled = game.over || !card.unlocked || upgradeCost === null || game.spoils < upgradeCost;
    refs.deckButton.textContent = card.unlocked ? (card.active ? "Bench" : "Add") : `Unlock ${card.unlockCost}`;
    refs.deckButton.disabled = game.over || (!card.unlocked && game.spoils < card.unlockCost) || (card.unlocked && !card.active && activeCardCount() >= MAX_ACTIVE_CARDS);
  }
  updateStatsPanels();
}

function togglePause() {
  if (game.over) return;
  if (!game.started) {
    startRaid();
    return;
  }
  if (game.paused) resumeRaid();
  else showPauseMenu();
}

function bindInput() {
  window.addEventListener("resize", resize);
  window.addEventListener("pointermove", (event) => {
    updateCardDrag(event);
    updateWorldDrag(event);
  });
  window.addEventListener("pointerup", () => {
    endCardDrag();
    endWorldDrag();
  });
  canvas.addEventListener("pointerdown", beginWorldDrag);
  canvas.addEventListener("contextmenu", (event) => event.preventDefault());
  canvas.addEventListener("wheel", (event) => {
    event.preventDefault();
    zoomCamera(Math.exp(event.deltaY * 0.0012));
  }, { passive: false });

  document.querySelector("#rotateLeft").addEventListener("click", () => rotateCamera(0.32));
  document.querySelector("#rotateRight").addEventListener("click", () => rotateCamera(-0.32));
  document.querySelector("#resetView").addEventListener("click", resetCamera);
  document.querySelector("#zoomIn").addEventListener("click", () => zoomCamera(0.82));
  document.querySelector("#zoomOut").addEventListener("click", () => zoomCamera(1.18));
  pauseToggle.addEventListener("click", togglePause);
  startRaidButton.addEventListener("click", startRaid);
  resumeRaidButton.addEventListener("click", resumeRaid);
  restartRaidButton.addEventListener("click", restartRaid);
  exitToMenuButton.addEventListener("click", exitToMainMenu);

  window.addEventListener("keydown", (event) => {
    if (event.key.toLowerCase() === "q") rotateCamera(0.16);
    if (event.key.toLowerCase() === "e") rotateCamera(-0.16);
    if (event.key.toLowerCase() === "r") pitchCamera(0.1);
    if (event.key.toLowerCase() === "f") pitchCamera(-0.1);
    if (event.key === "+" || event.key === "=") zoomCamera(0.88);
    if (event.key === "-" || event.key === "_") zoomCamera(1.14);
    if (event.key === " ") {
      event.preventDefault();
      togglePause();
    }
    if (event.key === "Escape") togglePause();
  });
}

function animate() {
  requestAnimationFrame(animate);
  const frameDt = Math.min(clock.getDelta(), 0.05);
  let dt = frameDt;
  if (!game.started || game.paused || game.over) dt = 0;
  if (dt > 0) {
    game.time += dt;
    game.rage = clamp(game.rage + dt * 0.62, 0, game.maxRage);
    updateUnits(dt);
    updateGoblinBuildings(dt);
    updateTowers(dt);
    updateProjectiles(dt);
    updateParticles(dt);
    updateDefenderSpawns(dt);
    let goblinsAlive = 0;
    for (const unit of units) {
      if (unit.team === "goblin") goblinsAlive += 1;
    }
    if (baseStructure?.alive && game.time > 220 && goblinsAlive === 0) {
      game.over = true;
      game.result = "Raid repelled";
      recordRaidStats();
      battleMessage.textContent = game.result;
      battleMessage.classList.add("show");
    }
  }
  hudUpdateTimer += frameDt;
  if (hudDirty || hudUpdateTimer >= HUD_UPDATE_INTERVAL) {
    hudDirty = false;
    hudUpdateTimer = 0;
    updateHud();
  }
  renderer.render(scene, camera);
  updatePerformanceStats(frameDt);
}

function boot() {
  createLighting();
  createTerrain();
  createVillage();
  buildDeck();
  bindInput();
  resize();
  showMainMenu();
  updateHud();
  animate();
}

boot();
