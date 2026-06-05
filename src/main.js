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
const battleMessage = document.querySelector("#battleMessage");
const pauseToggle = document.querySelector("#pauseToggle");

const MAP_SIZE = 64;
const HALF_MAP = MAP_SIZE / 2;
const TERRAIN_BASE_Y = -1.35;
const SPAWN_BAND = 5;
const SPAWN_DROP_TOLERANCE = 1.5;
const SPAWN_EDGE_PADDING = 0.72;
const MIN_CAMERA_PITCH = 0.28;
const MAX_CAMERA_PITCH = 1.4;
const MAP_SEED = Math.random() * 10000;
const LAKE_CENTER_X = -HALF_MAP + 13 + Math.sin(MAP_SEED * 0.23) * 4;
const LAKE_CENTER_Z = HALF_MAP - 16 + Math.cos(MAP_SEED * 0.19) * 5;
const rand = (min, max) => min + Math.random() * (max - min);
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x10181b);
scene.fog = new THREE.FogExp2(0x10181b, 0.004);

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: "high-performance",
});
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

const camera = new THREE.PerspectiveCamera(24, window.innerWidth / window.innerHeight, 0.1, 360);
const cameraState = {
  target: new THREE.Vector3(0, 0, -2),
  yaw: 0,
  pitch: 0.92,
  distance: 146,
};

const raycaster = new THREE.Raycaster();
const pointerNdc = new THREE.Vector2();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const tmpPoint = new THREE.Vector3();
const tmpVec = new THREE.Vector3();
const clock = new THREE.Clock();

const textureCache = new Map();

const game = {
  time: 0,
  rage: 6,
  maxRage: 10,
  spoils: 0,
  paused: false,
  over: false,
  result: "",
  defenderPulse: 0,
};

const world = new THREE.Group();
const terrainGroup = new THREE.Group();
const structureGroup = new THREE.Group();
const unitGroup = new THREE.Group();
const effectGroup = new THREE.Group();
scene.add(world);
world.add(terrainGroup, structureGroup, unitGroup, effectGroup);

const structures = [];
const units = [];
const projectiles = [];
const particles = [];
let baseStructure = null;

const cards = [
  {
    id: "raiders",
    title: "Raiders",
    countLabel: "x8",
    unitType: "raider",
    cost: 3,
    count: 8,
    spread: 1.45,
    level: 1,
    upgradeBaseCost: 4,
  },
  {
    id: "brutes",
    title: "Brutes",
    countLabel: "x3",
    unitType: "brute",
    cost: 5,
    count: 3,
    spread: 1.15,
    level: 1,
    upgradeBaseCost: 6,
  },
  {
    id: "torches",
    title: "Torches",
    countLabel: "x5",
    unitType: "torch",
    cost: 4,
    count: 5,
    spread: 1.35,
    level: 1,
    upgradeBaseCost: 5,
  },
];

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

function createPixelTexture(kind, baseHex, fleckHexes = []) {
  const size = 32;
  const canvasTexture = document.createElement("canvas");
  canvasTexture.width = size;
  canvasTexture.height = size;
  const ctx = canvasTexture.getContext("2d");
  const base = hexToRgb(baseHex);
  const flecks = fleckHexes.map(hexToRgb);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const shade = Math.floor(pixelNoise(x, y, kind.length) * 16) - 8;
      ctx.fillStyle = colorString(base, shade);
      ctx.fillRect(x, y, 1, 1);
    }
  }

  for (let i = 0; i < 76; i += 1) {
    const x = Math.floor(Math.abs(pixelNoise(i, i * 2, kind.length + 4)) * size);
    const y = Math.floor(Math.abs(pixelNoise(i * 3, i, kind.length + 9)) * size);
    const color = flecks[i % Math.max(1, flecks.length)] ?? base;
    ctx.fillStyle = colorString(color, Math.floor(pixelNoise(i, y, 2) * 10));
    ctx.fillRect(x, y, kind === "water" ? 3 : 1, 1);
  }

  if (kind === "grassSide") {
    ctx.fillStyle = "#4f9b3b";
    ctx.fillRect(0, 0, size, 6);
    ctx.fillStyle = "#3b7c35";
    for (let x = 0; x < size; x += 2) ctx.fillRect(x, 5 + Math.floor(Math.abs(pixelNoise(x, 4, 3)) * 3), 1, 2);
  }

  if (kind === "path") {
    for (let y = 8; y < size; y += 8) {
      ctx.fillStyle = "rgba(92, 68, 43, 0.34)";
      ctx.fillRect(0, y, size, 1);
    }
  }

  if (kind === "farm") {
    for (let x = 4; x < size; x += 7) {
      ctx.fillStyle = "#7f5629";
      ctx.fillRect(x, 0, 3, size);
      ctx.fillStyle = "#7fc149";
      for (let y = 3; y < size; y += 7) ctx.fillRect(x + 1, y, 1, 3);
    }
  }

  if (kind === "water") {
    ctx.fillStyle = "rgba(145, 218, 242, 0.45)";
    for (let y = 6; y < size; y += 9) {
      for (let x = 0; x < size; x += 8) ctx.fillRect(x + ((y / 3) % 5), y, 5, 1);
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
const hpBackGeometry = new THREE.BoxGeometry(1, 0.08, 0.08);
const hpFillGeometry = new THREE.BoxGeometry(1, 0.09, 0.1);

function materialSet(top, side = top, bottom = materials.dirt) {
  return [side, side, top, bottom, side, side];
}

function addBlock(x, y, z, sx, sy, sz, mats, group = terrainGroup) {
  const mesh = new THREE.Mesh(cubeGeometry, mats);
  mesh.position.set(x, y + sy / 2, z);
  mesh.scale.set(sx, sy, sz);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
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
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

function createLighting() {
  scene.add(new THREE.HemisphereLight(0xbad4e6, 0x3e3124, 1.65));
  const sun = new THREE.DirectionalLight(0xfff0c7, 2.15);
  sun.position.set(-12, 24, 16);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -HALF_MAP - 8;
  sun.shadow.camera.right = HALF_MAP + 8;
  sun.shadow.camera.top = HALF_MAP + 8;
  sun.shadow.camera.bottom = -HALF_MAP - 8;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 70;
  scene.add(sun);
}

function pathScore(x, z) {
  const main = Math.abs(x) < 1.55 && z > -12 && z < HALF_MAP - 5;
  const cross = Math.abs(z + 5) < 1.2 && Math.abs(x) < 12;
  const gate = Math.abs(x) < 4 && z < -5 && z > -13;
  return main || cross || gate;
}

function isVillagePlateau(x, z) {
  return Math.abs(x) < 11.5 && z > -12.2 && z < 8.5;
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

function terrainTileMaterial(x, z) {
  if (isWaterTile(x, z)) return materials.water;
  if (isShoreTile(x, z)) return materials.sand;
  if (pathScore(x, z)) return materials.path;
  if (x > 7 && x < 12 && z > -1 && z < 4) return materials.farm;
  if (x < -14 && z > 9 && z < 17) return materials.mud;
  return materials.grassTop;
}

function makeTerrainTileGeometry(x, z) {
  const h00 = terrainTopHeight(x, z);
  const h10 = terrainTopHeight(x + 1, z);
  const h01 = terrainTopHeight(x, z + 1);
  const h11 = terrainTopHeight(x + 1, z + 1);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute([x, h00, z, x + 1, h10, z, x, h01, z + 1, x + 1, h11, z + 1], 3),
  );
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 1, 1], 2));
  geometry.setIndex([0, 2, 1, 1, 2, 3]);
  geometry.computeVertexNormals();
  return geometry;
}

function addTerrainSkirt(x0, z0, x1, z1, h0, h1) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute([x0, TERRAIN_BASE_Y, z0, x1, TERRAIN_BASE_Y, z1, x0, h0, z0, x1, h1, z1], 3),
  );
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 1, 1], 2));
  geometry.setIndex([0, 1, 2, 1, 3, 2]);
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, materials.rockSide);
  mesh.receiveShadow = true;
  terrainGroup.add(mesh);
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

function createTerrain() {
  for (let x = -HALF_MAP; x < HALF_MAP; x += 1) {
    for (let z = -HALF_MAP; z < HALF_MAP; z += 1) {
      const cx = x + 0.5;
      const cz = z + 0.5;
      const mesh = new THREE.Mesh(makeTerrainTileGeometry(x, z), terrainTileMaterial(cx, cz));
      mesh.receiveShadow = true;
      terrainGroup.add(mesh);
    }
  }

  for (let i = -HALF_MAP; i < HALF_MAP; i += 1) {
    addTerrainSkirt(i, -HALF_MAP, i + 1, -HALF_MAP, terrainTopHeight(i, -HALF_MAP), terrainTopHeight(i + 1, -HALF_MAP));
    addTerrainSkirt(i + 1, HALF_MAP, i, HALF_MAP, terrainTopHeight(i + 1, HALF_MAP), terrainTopHeight(i, HALF_MAP));
    addTerrainSkirt(-HALF_MAP, i + 1, -HALF_MAP, i, terrainTopHeight(-HALF_MAP, i + 1), terrainTopHeight(-HALF_MAP, i));
    addTerrainSkirt(HALF_MAP, i, HALF_MAP, i + 1, terrainTopHeight(HALF_MAP, i), terrainTopHeight(HALF_MAP, i + 1));
  }

  const spawnMat = new THREE.MeshBasicMaterial({
    color: 0x6e9e5c,
    transparent: true,
    opacity: 0.12,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const stripGeo = new THREE.PlaneGeometry(MAP_SIZE, SPAWN_BAND);
  stripGeo.rotateX(-Math.PI / 2);
  const north = new THREE.Mesh(stripGeo, spawnMat);
  north.position.set(0, 1.05, -HALF_MAP + SPAWN_BAND / 2);
  const south = north.clone();
  south.position.z = HALF_MAP - SPAWN_BAND / 2;
  const sideGeo = new THREE.PlaneGeometry(SPAWN_BAND, MAP_SIZE);
  sideGeo.rotateX(-Math.PI / 2);
  const west = new THREE.Mesh(sideGeo, spawnMat);
  west.position.set(-HALF_MAP + SPAWN_BAND / 2, 1.06, 0);
  const east = west.clone();
  east.position.x = HALF_MAP - SPAWN_BAND / 2;
  terrainGroup.add(north, south, west, east);
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

function addWallSegment(parent, x, z, w, d) {
  addBlock(x, 0.05, z, w, 1.7, d, materialSet(materials.castle, materials.stone), parent);
  const count = Math.max(1, Math.floor(w > d ? w : d));
  for (let i = 0; i < count; i += 1) {
    const px = w > d ? x - w / 2 + 0.5 + i : x;
    const pz = w > d ? z : z - d / 2 + 0.5 + i;
    addBlock(px, 1.65, pz, 0.44, 0.44, 0.44, materialSet(materials.castle), parent);
  }
}

function createBase() {
  const base = new THREE.Group();
  base.position.set(0, 0.1, -9.2);
  addBlock(0, 0, 0, 4.7, 2.7, 4.2, materialSet(materials.castle, materials.stone), base);
  addBlock(0, 2.65, 0, 3.6, 0.8, 3.1, materialSet(materials.trim, materials.castle), base);
  addBlock(-2.25, 0.05, -1.75, 1.1, 3.5, 1.1, materialSet(materials.castle), base);
  addBlock(2.25, 0.05, -1.75, 1.1, 3.5, 1.1, materialSet(materials.castle), base);
  addBlock(-2.25, 0.05, 1.75, 1.1, 3.5, 1.1, materialSet(materials.castle), base);
  addBlock(2.25, 0.05, 1.75, 1.1, 3.5, 1.1, materialSet(materials.castle), base);
  addBlock(0, 3.42, 0, 4.6, 0.35, 0.55, materialSet(materials.banner, materials.trim), base);
  addWallSegment(base, 0, 4.3, 7.6, 0.65);
  addWallSegment(base, -4.1, 0.4, 0.65, 7.6);
  addWallSegment(base, 4.1, 0.4, 0.65, 7.6);
  const entity = registerStructure(base, {
    type: "base",
    hp: 1800,
    radius: 3.6,
    value: 20,
    attackRange: 0,
    barWidth: 3,
    barY: 4.5,
  });
  baseStructure = entity;
}

function addGableRoof(parent, slopeMaterial, sideMaterial) {
  const width = 3.42;
  const depth = 2.9;
  const height = 1.12;
  const y = 1.2;
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
  roof.castShadow = true;
  roof.receiveShadow = true;
  parent.add(roof);
  return roof;
}

function createHouse(x, z, roof = "thatch") {
  const house = new THREE.Group();
  house.position.set(x, 0.1, z);
  addBlock(0, 0, 0, 2.8, 1.35, 2.4, materialSet(materials.wood), house);
  addBlock(-0.82, 0.12, 1.24, 0.48, 0.7, 0.12, materialSet(materials.stone), house);
  addBlock(0.8, 0.12, 1.24, 0.48, 0.7, 0.12, materialSet(materials.stone), house);
  const roofMat = roof === "red" ? materials.roof : materials.thatchRoof;
  const roofSideMat = roof === "red" ? materials.roofSide : materials.thatchRoofSide;
  addGableRoof(house, roofMat, roofSideMat);
  return registerStructure(house, {
    type: "house",
    hp: 360,
    radius: 1.6,
    value: 3,
    barWidth: 1.4,
    barY: 2.55,
  });
}

function createTower(x, z) {
  const tower = new THREE.Group();
  tower.position.set(x, 0.1, z);
  addBlock(0, 0, 0, 1.9, 3.2, 1.9, materialSet(materials.castle, materials.stone), tower);
  addBlock(0, 3.05, 0, 2.25, 0.48, 2.25, materialSet(materials.trim, materials.castle), tower);
  for (let i = -1; i <= 1; i += 2) {
    addBlock(i * 0.72, 3.45, -0.72, 0.42, 0.52, 0.42, materialSet(materials.castle), tower);
    addBlock(i * 0.72, 3.45, 0.72, 0.42, 0.52, 0.42, materialSet(materials.castle), tower);
    addBlock(-0.72, 3.45, i * 0.72, 0.42, 0.52, 0.42, materialSet(materials.castle), tower);
    addBlock(0.72, 3.45, i * 0.72, 0.42, 0.52, 0.42, materialSet(materials.castle), tower);
  }
  return registerStructure(tower, {
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
}

function createVillage() {
  createBase();
  createTower(-7.3, -7.6);
  createTower(7.3, -7.6);
  createTower(-5.8, -1.6);
  createTower(5.8, -1.6);
  createHouse(-7.5, -3.9, "thatch");
  createHouse(7.6, -3.7, "red");
  createHouse(-9.2, 2.8, "red");
  createHouse(8.8, 2.2, "thatch");
  createHouse(-4.4, 4.5, "thatch");
  createHouse(4.5, 4.6, "red");

  for (let i = 0; i < 16; i += 1) {
    const pos = new THREE.Vector3(rand(-8.5, 8.5), 0, rand(-2, 6.5));
    spawnUnit("villager", pos, false);
  }
  for (let i = 0; i < 7; i += 1) {
    const pos = new THREE.Vector3(rand(-4.5, 4.5), 0, rand(-9.7, -5.2));
    spawnUnit("knight", pos, false);
  }
}

function drawPx(ctx, x, y, w, h, color) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}

function createUnitTexture(type, frame = 0) {
  const size = 18;
  const canvasTexture = document.createElement("canvas");
  canvasTexture.width = size;
  canvasTexture.height = size;
  const ctx = canvasTexture.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  const bob = frame % 2;
  const step = frame % 4 < 2 ? -1 : 1;

  if (type === "raider" || type === "torch") {
    drawPx(ctx, 4, 4 + bob, 10, 9, "#101010");
    drawPx(ctx, 5, 3 + bob, 8, 6, "#62a33e");
    drawPx(ctx, 3, 5 + bob, 2, 2, "#62a33e");
    drawPx(ctx, 13, 5 + bob, 2, 2, "#62a33e");
    drawPx(ctx, 6, 6 + bob, 2, 1, "#f0cf52");
    drawPx(ctx, 10, 6 + bob, 2, 1, "#f0cf52");
    drawPx(ctx, 6, 9 + bob, 6, 4, "#6f4320");
    drawPx(ctx, 5 + step, 13, 3, 3, "#2d271e");
    drawPx(ctx, 10 - step, 13, 3, 3, "#2d271e");
    if (type === "torch") {
      drawPx(ctx, 13, 8 + bob, 2, 6, "#6d3f1b");
      drawPx(ctx, 13, 5 + bob, 3, 3, "#ff9b27");
      drawPx(ctx, 14, 4 + bob, 1, 1, "#ffe169");
    } else {
      drawPx(ctx, 13, 9 + bob, 4, 1, "#d7d7d2");
      drawPx(ctx, 15, 8 + bob, 1, 1, "#f4f4ef");
    }
  } else if (type === "brute") {
    drawPx(ctx, 3, 3 + bob, 12, 11, "#101010");
    drawPx(ctx, 5, 3 + bob, 8, 6, "#74a944");
    drawPx(ctx, 4, 8 + bob, 10, 6, "#7b4a24");
    drawPx(ctx, 6, 6 + bob, 2, 1, "#ffe169");
    drawPx(ctx, 10, 6 + bob, 2, 1, "#ffe169");
    drawPx(ctx, 14, 4 + bob, 2, 10, "#5b351b");
    drawPx(ctx, 13, 3 + bob, 4, 3, "#8a552a");
    drawPx(ctx, 5 + step, 14, 3, 3, "#2d271e");
    drawPx(ctx, 10 - step, 14, 3, 3, "#2d271e");
  } else if (type === "knight") {
    drawPx(ctx, 4, 3 + bob, 10, 12, "#101010");
    drawPx(ctx, 5, 3 + bob, 8, 5, "#b9bab2");
    drawPx(ctx, 6, 4 + bob, 6, 2, "#4a4c4d");
    drawPx(ctx, 5, 8 + bob, 8, 5, "#315a9d");
    drawPx(ctx, 12, 8 + bob, 3, 5, "#a8aaa5");
    drawPx(ctx, 3, 9 + bob, 3, 1, "#d5d5cf");
    drawPx(ctx, 5 + step, 14, 3, 3, "#343434");
    drawPx(ctx, 10 - step, 14, 3, 3, "#343434");
  } else {
    drawPx(ctx, 5, 4 + bob, 8, 11, "#17110d");
    drawPx(ctx, 6, 3 + bob, 6, 5, "#c58b55");
    drawPx(ctx, 5, 8 + bob, 8, 5, "#d8caa2");
    drawPx(ctx, 7, 6 + bob, 1, 1, "#1a1310");
    drawPx(ctx, 10, 6 + bob, 1, 1, "#1a1310");
    drawPx(ctx, 5 + step, 14, 3, 3, "#4f3d28");
    drawPx(ctx, 10 - step, 14, 3, 3, "#4f3d28");
  }

  const texture = new THREE.CanvasTexture(canvasTexture);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  return texture;
}

const spriteFrameSets = {
  raider: [0, 1, 2, 3].map((frame) => createUnitTexture("raider", frame)),
  brute: [0, 1, 2, 3].map((frame) => createUnitTexture("brute", frame)),
  torch: [0, 1, 2, 3].map((frame) => createUnitTexture("torch", frame)),
  knight: [0, 1, 2, 3].map((frame) => createUnitTexture("knight", frame)),
  villager: [0, 1, 2, 3].map((frame) => createUnitTexture("villager", frame)),
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
  sprite.castShadow = true;

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
    cooldown: stats.cooldown,
    attackTimer: rand(0, stats.cooldown),
    sprite,
    shadow,
    position: sprite.position,
    velocity: new THREE.Vector3(),
    target: null,
    wander: new THREE.Vector3(rand(-8, 8), 0, rand(-2, 8)),
    alive: true,
    frameSeed: Math.random() * 10,
  };

  syncUnitToTerrain(unit);
  units.push(unit);
  unitGroup.add(shadow, sprite);
  if (burst) createSpawnBurst(position, type === "brute" ? 0xb95632 : 0x9ec96d);
  return unit;
}

function createSpawnBurst(position, color) {
  const groundY = sampleTerrainHeight(position.x, position.z);
  for (let i = 0; i < 9; i += 1) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.12, 0.12),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95 }),
    );
    mesh.position.set(position.x + rand(-0.4, 0.4), groundY + 0.45 + rand(0, 0.55), position.z + rand(-0.4, 0.4));
    const particle = {
      mesh,
      life: rand(0.4, 0.75),
      age: 0,
      velocity: new THREE.Vector3(rand(-1.2, 1.2), rand(0.8, 1.8), rand(-1.2, 1.2)),
    };
    particles.push(particle);
    effectGroup.add(mesh);
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

function damageUnit(unit, amount) {
  unit.hp -= amount;
  if (unit.hp <= 0) {
    unit.alive = false;
    unitGroup.remove(unit.sprite, unit.shadow);
    if (unit.team === "defender") game.spoils += 1;
  }
}

function damageStructure(structure, amount) {
  structure.hp -= amount;
  setHealthBar(structure);
  if (structure.hp <= 0 && structure.alive) {
    structure.alive = false;
    game.spoils += structure.value;
    const destroyedAt = structure.position.clone();
    createSpawnBurst(destroyedAt, structure.type === "house" ? 0xb56d34 : 0xa7a59a);
    structureGroup.remove(structure.group);
    if (structure.type === "base") {
      game.over = true;
      game.result = "Stronghold breached";
      battleMessage.textContent = game.result;
      battleMessage.classList.add("show");
    }
  }
}

function moveToward(unit, targetPosition, dt, stopDistance = 0) {
  tmpVec.copy(targetPosition).sub(unit.position);
  tmpVec.y = 0;
  const dist = tmpVec.length();
  if (dist <= stopDistance || dist < 0.001) {
    unit.velocity.multiplyScalar(0.8);
    return dist;
  }
  tmpVec.normalize();
  const wiggle = Math.sin(game.time * 2.6 + unit.frameSeed) * 0.22;
  const side = new THREE.Vector3(-tmpVec.z, 0, tmpVec.x).multiplyScalar(wiggle);
  unit.velocity.copy(tmpVec.add(side).normalize()).multiplyScalar(unit.speed);
  unit.position.addScaledVector(unit.velocity, dt);
  unit.position.x = clamp(unit.position.x, -HALF_MAP + 0.8, HALF_MAP - 0.8);
  unit.position.z = clamp(unit.position.z, -HALF_MAP + 0.8, HALF_MAP - 0.8);
  return dist;
}

function updateGoblin(unit, dt) {
  const nearbyKnight = nearestUnit(unit.position, (other) => other.team === "defender", 5);
  if (nearbyKnight && unit.type === "raider") {
    unit.target = nearbyKnight;
  } else {
    unit.target = nearestStructure(unit.position, (structure) =>
      unit.type === "raider" ? true : structure.type !== "tower" || structure.hp < 220,
    );
  }

  if (!unit.target) return;
  const targetPos = unit.target.position;
  const radius = unit.target.radius ?? 0.55;
  const dist = moveToward(unit, targetPos, dt, unit.range + radius);
  if (dist <= unit.range + radius + 0.08) {
    unit.attackTimer -= dt;
    if (unit.attackTimer <= 0) {
      unit.attackTimer = unit.cooldown;
      if (unit.target.sprite) damageUnit(unit.target, unit.damage);
      else damageStructure(unit.target, unit.damage * (unit.type === "torch" ? 1.35 : 1));
      createHitParticle(targetPos, unit.type === "torch" ? 0xf0a443 : 0xbfd07a);
    }
  }
}

function updateKnight(unit, dt) {
  unit.target = nearestUnit(unit.position, (other) => other.team === "goblin", 10);
  if (!unit.target) {
    const guard = baseStructure?.alive ? baseStructure.position : new THREE.Vector3(0, 0, -4);
    const patrol = tmpPoint.set(
      guard.x + Math.sin(game.time * 0.55 + unit.frameSeed) * 5,
      0,
      guard.z + 4 + Math.cos(game.time * 0.45 + unit.frameSeed) * 3,
    );
    moveToward(unit, patrol, dt, 0.7);
    return;
  }

  const dist = moveToward(unit, unit.target.position, dt, unit.range + 0.3);
  if (dist <= unit.range + 0.35) {
    unit.attackTimer -= dt;
    if (unit.attackTimer <= 0) {
      unit.attackTimer = unit.cooldown;
      damageUnit(unit.target, unit.damage);
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
      unit.velocity.copy(tmpVec).multiplyScalar(unit.speed * 1.7);
      unit.position.addScaledVector(unit.velocity, dt);
    }
  } else {
    if (unit.position.distanceTo(unit.wander) < 0.5 || Math.random() < 0.003) {
      unit.wander.set(rand(-9, 9), 0, rand(-1, 7.8));
    }
    moveToward(unit, unit.wander, dt, 0.4);
  }
}

function createHitParticle(position, color) {
  const groundY = sampleTerrainHeight(position.x, position.z);
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.14, 6, 4),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 }),
  );
  mesh.position.set(position.x, Math.max(position.y, groundY + 0.65), position.z);
  particles.push({
    mesh,
    life: 0.28,
    age: 0,
    velocity: new THREE.Vector3(rand(-0.5, 0.5), rand(0.8, 1.4), rand(-0.5, 0.5)),
  });
  effectGroup.add(mesh);
}

function shootTower(tower, target) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.12, 0.12, 0.5),
    new THREE.MeshBasicMaterial({ color: 0xf2d186 }),
  );
  mesh.position.set(tower.position.x, 3.7, tower.position.z);
  projectiles.push({
    mesh,
    target,
    speed: 12,
    damage: tower.attackDamage,
    alive: true,
  });
  effectGroup.add(mesh);
}

function updateTowers(dt) {
  for (const structure of structures) {
    if (!structure.alive || structure.type !== "tower") continue;
    structure.reload -= dt;
    if (structure.reload > 0) continue;
    const target = nearestUnit(structure.position, (unit) => unit.team === "goblin", structure.attackRange);
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
    tmpVec.copy(projectile.target.position).add(new THREE.Vector3(0, 0.9, 0)).sub(projectile.mesh.position);
    const dist = tmpVec.length();
    if (dist < 0.25) {
      projectile.alive = false;
      damageUnit(projectile.target, projectile.damage);
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
    particle.mesh.material.opacity = Math.max(0, pct);
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
  const livingGoblins = units.filter((unit) => unit.team === "goblin").length;
  const livingKnights = units.filter((unit) => unit.team === "defender").length;
  if (livingGoblins > 7 && livingKnights < 18) {
    for (let i = 0; i < 2; i += 1) {
      spawnUnit("knight", new THREE.Vector3(rand(-3.3, 3.3), 0, rand(-8.4, -5.7)));
    }
  }
}

function cardCount(card) {
  return card.count + Math.floor((card.level - 1) * (card.id === "brutes" ? 0.7 : 1.35));
}

function cardUpgradeCost(card) {
  return card.level >= 7 ? null : card.upgradeBaseCost + card.level * 3;
}

function createCardArtDataUrl(card) {
  const canvasArt = document.createElement("canvas");
  canvasArt.width = 64;
  canvasArt.height = 48;
  const ctx = canvasArt.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = card.id === "brutes" ? "#463421" : card.id === "torches" ? "#27324a" : "#263a33";
  ctx.fillRect(0, 0, 64, 48);
  ctx.fillStyle = "#1a211f";
  ctx.fillRect(0, 34, 64, 14);
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
  if (cost === null || game.spoils < cost) return;
  game.spoils -= cost;
  card.level += 1;
  buildDeck();
  updateHud();
}

function buildDeck() {
  deckEl.innerHTML = "";
  for (const card of cards) {
    const button = document.createElement("div");
    const cost = cardUpgradeCost(card);
    button.className = "card";
    button.dataset.card = card.id;
    button.role = "button";
    button.tabIndex = 0;
    button.style.setProperty("--card-art", createCardArtDataUrl(card));
    button.innerHTML = `
      <span class="cost">${card.cost}</span>
      <span class="card-level">Lv ${card.level}</span>
      <span class="card-title"><span>${card.title}</span><span class="card-count">x${cardCount(card)}</span></span>
      <button class="upgrade-button" type="button" title="Upgrade with spoils">${cost === null ? "MAX" : `+ ${cost}`}</button>
    `;
    button.addEventListener("pointerdown", (event) => beginCardDrag(event, card));
    button.querySelector(".upgrade-button").addEventListener("pointerdown", (event) => event.stopPropagation());
    button.querySelector(".upgrade-button").addEventListener("click", (event) => {
      event.stopPropagation();
      upgradeCard(card);
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
  if (game.over || game.paused || game.rage < card.cost) return;
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
  const spawnPoint = spawnPointForDrop(point);
  dragState.point = spawnPoint;
  dragState.valid = !!spawnPoint && game.rage >= dragState.card.cost;
  spawnPreview.visible = !!point;
  if (point) {
    const previewPoint = spawnPoint ?? point;
    spawnPreview.position.x = previewPoint.x;
    spawnPreview.position.z = previewPoint.z;
    spawnPreview.position.y = sampleTerrainHeight(previewPoint.x, previewPoint.z) + 0.08;
    spawnPreview.material = dragState.valid ? materials.spawnGood : materials.spawnBad;
  }
}

function endCardDrag() {
  if (!dragState) return;
  if (dragState.valid && dragState.point) {
    spawnSwarm(dragState.card, dragState.point);
  }
  dragState.ghost.remove();
  dragState = null;
  spawnPreview.visible = false;
}

function canSpawnAt(point) {
  return !!spawnPointForDrop(point);
}

function spawnSides(point) {
  const innerLimit = HALF_MAP - SPAWN_BAND;
  const sides = [];
  if (point.z <= -innerLimit) sides.push("north");
  if (point.z >= innerLimit) sides.push("south");
  if (point.x <= -innerLimit) sides.push("west");
  if (point.x >= innerLimit) sides.push("east");
  return sides;
}

function spawnPointForDrop(point) {
  if (!point) return null;
  const outerLimit = HALF_MAP + SPAWN_DROP_TOLERANCE;
  if (Math.abs(point.x) > outerLimit || Math.abs(point.z) > outerLimit) return null;

  const clamped = new THREE.Vector3(
    clamp(point.x, -HALF_MAP + SPAWN_EDGE_PADDING, HALF_MAP - SPAWN_EDGE_PADDING),
    0,
    clamp(point.z, -HALF_MAP + SPAWN_EDGE_PADDING, HALF_MAP - SPAWN_EDGE_PADDING),
  );
  return spawnSides(clamped).length > 0 ? clamped : null;
}

function clampToSpawnBand(point, sides) {
  const innerLimit = HALF_MAP - SPAWN_BAND;
  point.x = clamp(point.x, -HALF_MAP + SPAWN_EDGE_PADDING, HALF_MAP - SPAWN_EDGE_PADDING);
  point.z = clamp(point.z, -HALF_MAP + SPAWN_EDGE_PADDING, HALF_MAP - SPAWN_EDGE_PADDING);

  if (sides.includes("west")) point.x = clamp(point.x, -HALF_MAP + SPAWN_EDGE_PADDING, -innerLimit);
  if (sides.includes("east")) point.x = clamp(point.x, innerLimit, HALF_MAP - SPAWN_EDGE_PADDING);
  if (sides.includes("north")) point.z = clamp(point.z, -HALF_MAP + SPAWN_EDGE_PADDING, -innerLimit);
  if (sides.includes("south")) point.z = clamp(point.z, innerLimit, HALF_MAP - SPAWN_EDGE_PADDING);
  return point;
}

function spawnSwarm(card, point) {
  const sides = spawnSides(point);
  game.rage = clamp(game.rage - card.cost, 0, game.maxRage);
  const count = cardCount(card);
  for (let i = 0; i < count; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const radius = Math.sqrt(Math.random()) * card.spread;
    const pos = clampToSpawnBand(
      new THREE.Vector3(point.x + Math.cos(angle) * radius, 0, point.z + Math.sin(angle) * radius),
      sides,
    );
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

let pointerPan = null;

function beginWorldDrag(event) {
  if (event.target !== canvas || dragState) return;
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

  const forward = new THREE.Vector3();
  camera.getWorldDirection(forward);
  forward.y = 0;
  forward.normalize();
  const right = new THREE.Vector3().crossVectors(forward, camera.up).normalize();
  const scale = cameraState.distance / Math.min(window.innerWidth, window.innerHeight) * 0.58;
  cameraState.target.addScaledVector(right, -dx * scale);
  cameraState.target.addScaledVector(forward, dy * scale);
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

  const dir = new THREE.Vector3(
    Math.sin(cameraState.yaw) * Math.cos(cameraState.pitch),
    Math.sin(cameraState.pitch),
    Math.cos(cameraState.yaw) * Math.cos(cameraState.pitch),
  );
  camera.position.copy(cameraState.target).addScaledVector(dir, cameraState.distance);
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
  cameraState.distance = clamp(cameraState.distance * factor, 18, 214);
  updateCamera();
}

function resetCamera() {
  cameraState.target.set(0, 0, -2);
  cameraState.yaw = 0;
  cameraState.pitch = 0.92;
  cameraState.distance = 146;
  updateCamera();
}

function updateHud() {
  const basePct = baseStructure ? clamp(baseStructure.hp / baseStructure.maxHp, 0, 1) : 0;
  baseReadout.textContent = `${Math.round(basePct * 100)}%`;
  baseMeter.style.width = `${basePct * 100}%`;
  rageReadout.textContent = `${Math.floor(game.rage)} / ${game.maxRage}`;
  rageMeter.style.width = `${(game.rage / game.maxRage) * 100}%`;
  const totalSeconds = Math.floor(game.time);
  raidReadout.textContent = `${String(Math.floor(totalSeconds / 60)).padStart(2, "0")}:${String(totalSeconds % 60).padStart(2, "0")}`;
  hordeReadout.textContent = units.filter((unit) => unit.team === "goblin").length;
  defenderReadout.textContent = units.filter((unit) => unit.team === "defender").length;
  structureReadout.textContent = structures.filter((structure) => structure.alive).length;
  spoilsReadout.textContent = game.spoils;

  for (const cardEl of deckEl.querySelectorAll(".card")) {
    const card = cards.find((item) => item.id === cardEl.dataset.card);
    const cannotDeploy = game.paused || game.over || game.rage < card.cost;
    cardEl.classList.toggle("disabled", cannotDeploy);
    cardEl.setAttribute("aria-disabled", String(cannotDeploy));
    const upgradeButton = cardEl.querySelector(".upgrade-button");
    const upgradeCost = cardUpgradeCost(card);
    upgradeButton.disabled = game.over || upgradeCost === null || game.spoils < upgradeCost;
  }
}

function togglePause() {
  if (game.over) return;
  game.paused = !game.paused;
  pauseToggle.innerHTML = game.paused ? '<i data-lucide="play"></i>' : '<i data-lucide="pause"></i>';
  pauseToggle.setAttribute("aria-label", game.paused ? "Resume" : "Pause");
  pauseToggle.setAttribute("title", game.paused ? "Resume" : "Pause");
  createIcons({ icons: { Play, Pause } });
  battleMessage.textContent = game.paused ? "Paused" : "";
  battleMessage.classList.toggle("show", game.paused);
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
  });
}

function animate() {
  requestAnimationFrame(animate);
  let dt = Math.min(clock.getDelta(), 0.05);
  if (game.paused || game.over) dt = 0;
  if (dt > 0) {
    game.time += dt;
    game.rage = clamp(game.rage + dt * 0.62, 0, game.maxRage);
    updateUnits(dt);
    updateTowers(dt);
    updateProjectiles(dt);
    updateParticles(dt);
    updateDefenderSpawns(dt);
    if (baseStructure?.alive && game.time > 220 && units.filter((unit) => unit.team === "goblin").length === 0) {
      game.over = true;
      game.result = "Raid repelled";
      battleMessage.textContent = game.result;
      battleMessage.classList.add("show");
    }
  }
  updateHud();
  renderer.render(scene, camera);
}

function boot() {
  createLighting();
  createTerrain();
  createVillage();
  buildDeck();
  bindInput();
  resize();
  updateHud();
  animate();
}

boot();
