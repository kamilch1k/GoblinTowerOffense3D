import "./styles.css";
import * as THREE from "three";
import {
  createIcons,
  Crosshair,
  Factory,
  Hammer,
  Home,
  Map as MapIcon,
  Pause,
  Pickaxe,
  Play,
  Shield,
  Swords,
  Users,
  Zap,
  ZoomIn,
  ZoomOut,
} from "lucide";

createIcons({
  icons: {
    Crosshair,
    Factory,
    Hammer,
    Home,
    Map: MapIcon,
    Pause,
    Pickaxe,
    Play,
    Shield,
    Swords,
    Users,
    Zap,
    ZoomIn,
    ZoomOut,
  },
});

const canvas = document.querySelector("#world");
const selectionBox = document.querySelector("#selectionBox");
const civName = document.querySelector("#civName");
const directiveReadout = document.querySelector("#directiveReadout");
const foodReadout = document.querySelector("#foodReadout");
const oreReadout = document.querySelector("#oreReadout");
const powerReadout = document.querySelector("#powerReadout");
const supplyReadout = document.querySelector("#supplyReadout");
const hqReadout = document.querySelector("#hqReadout");
const hqMeter = document.querySelector("#hqMeter");
const timeReadout = document.querySelector("#timeReadout");
const pauseToggle = document.querySelector("#pauseToggle");
const resetViewButton = document.querySelector("#resetView");
const zoomInButton = document.querySelector("#zoomIn");
const zoomOutButton = document.querySelector("#zoomOut");
const directiveButtons = document.querySelector("#directiveButtons");
const selectedCount = document.querySelector("#selectedCount");
const selectedTitle = document.querySelector("#selectedTitle");
const selectedBody = document.querySelector("#selectedBody");
const aliveReadout = document.querySelector("#aliveReadout");
const civList = document.querySelector("#civList");
const workerReadout = document.querySelector("#workerReadout");
const armyReadout = document.querySelector("#armyReadout");
const buildingReadout = document.querySelector("#buildingReadout");
const killsReadout = document.querySelector("#killsReadout");
const lossesReadout = document.querySelector("#lossesReadout");
const winnerReadout = document.querySelector("#winnerReadout");
const eventLog = document.querySelector("#eventLog");
const battleMessage = document.querySelector("#battleMessage");
const mainMenu = document.querySelector("#mainMenu");
const pauseMenu = document.querySelector("#pauseMenu");
const startSkirmishButton = document.querySelector("#startSkirmish");
const resumeGameButton = document.querySelector("#resumeGame");
const restartGameButton = document.querySelector("#restartGame");
const exitToMenuButton = document.querySelector("#exitToMenu");
const attackOrderButton = document.querySelector("#attackOrder");
const defendOrderButton = document.querySelector("#defendOrder");
const statTime = document.querySelector("#statTime");
const statKills = document.querySelector("#statKills");
const statLosses = document.querySelector("#statLosses");
const statBuildings = document.querySelector("#statBuildings");
const statArmy = document.querySelector("#statArmy");
const statWorkers = document.querySelector("#statWorkers");
const menuSessions = document.querySelector("#menuSessions");
const menuBestTime = document.querySelector("#menuBestTime");
const menuBestKills = document.querySelector("#menuBestKills");
const menuWins = document.querySelector("#menuWins");

const MAP_SIZE = 116;
const HALF_MAP = MAP_SIZE / 2;
const TERRAIN_TEXTURE_SIZE = 8;
const TERRAIN_BASE_Y = -1.2;
const SKY_RADIUS = 440;
const SAVE_KEY = "afkDominionRtsStats";
const MAP_SEED = Math.random() * 10000;
const MAX_PIXEL_RATIO = 1.15;
const ISO_YAW = -Math.PI / 4;
const ISO_PITCH = 0.82;
const MIN_ZOOM = 34;
const MAX_ZOOM = 116;
const CAMERA_LOOK_HEIGHT = 1.1;
const RESOURCE_LOW_WATER = 85;
const THINK_INTERVAL = 2.1;
const UI_INTERVAL = 0.18;

const tmpVec = new THREE.Vector3();
const tmpVec2 = new THREE.Vector3();
const tmpPoint = new THREE.Vector3();
const tmpCameraLook = new THREE.Vector3();
const pointerNdc = new THREE.Vector2();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const raycaster = new THREE.Raycaster();
const clock = new THREE.Clock();

const rand = (min, max) => min + Math.random() * (max - min);
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const lerp = (a, b, t) => a + (b - a) * t;
const formatTime = (seconds) => `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
const resourceText = (value) => Math.floor(value).toLocaleString("en-US");
const colorHex = (value) => `#${value.toString(16).padStart(6, "0")}`;
const distSq2 = (ax, az, bx, bz) => (ax - bx) * (ax - bx) + (az - bz) * (az - bz);
const mapNoise = (x, z, seed = 0) => {
  const value = Math.sin((x + 17.37) * 18.179 + (z - 4.91) * 41.233 + seed * 97.17) * 43758.5453;
  return value - Math.floor(value);
};

const DIRECTIVES = {
  balanced: { label: "Balanced doctrine", workers: 14, army: 12, defense: 1, tech: 1, aggression: 0.58 },
  economy: { label: "Economy boom", workers: 24, army: 8, defense: 1, tech: 1, aggression: 0.32 },
  military: { label: "Military pressure", workers: 15, army: 26, defense: 1, tech: 1, aggression: 0.92 },
  tech: { label: "Tech climb", workers: 18, army: 14, defense: 1, tech: 3, aggression: 0.5 },
  defense: { label: "Fortified hold", workers: 18, army: 16, defense: 4, tech: 1, aggression: 0.28 },
};

const FACTION_BLUEPRINTS = [
  {
    id: "verdant",
    name: "Verdant Concord",
    shortName: "Verdant",
    start: new THREE.Vector3(-38, 0, 34),
    color: 0x78c957,
    accent: 0xf0d46a,
    material: 0x2f5d3f,
    directive: "balanced",
    player: true,
    bonus: { gather: 1.12, workerCost: 0.92, unitHp: 1, unitDamage: 1 },
  },
  {
    id: "iron",
    name: "Iron Dominion",
    shortName: "Iron",
    start: new THREE.Vector3(37, 0, -34),
    color: 0xc75449,
    accent: 0xbec7cf,
    material: 0x5a6066,
    directive: "military",
    bonus: { gather: 0.98, workerCost: 1, unitHp: 1.18, unitDamage: 1.04 },
  },
  {
    id: "sunspire",
    name: "Sunspire League",
    shortName: "Sunspire",
    start: new THREE.Vector3(38, 0, 34),
    color: 0xe6b64c,
    accent: 0x52b8d8,
    material: 0x9d762f,
    directive: "tech",
    bonus: { gather: 1, workerCost: 1, unitHp: 0.96, unitDamage: 1.12, power: 1.22 },
  },
  {
    id: "umbral",
    name: "Umbral Nexus",
    shortName: "Umbral",
    start: new THREE.Vector3(-38, 0, -34),
    color: 0x8d6ae3,
    accent: 0x59e0c9,
    material: 0x3f345d,
    directive: "defense",
    bonus: { gather: 0.96, workerCost: 1, unitHp: 0.96, unitDamage: 1.08, speed: 1.14 },
  },
];

const TERRAIN_FEATURES = [
  { x: -18, z: 18, height: 2.25, rx: 18, rz: 11 },
  { x: 23, z: -8, height: 1.95, rx: 16, rz: 20 },
  { x: -30, z: -18, height: 1.65, rx: 12, rz: 15 },
  { x: 8, z: 30, height: 1.35, rx: 22, rz: 9 },
  { x: 30, z: 24, height: 1.25, rx: 10, rz: 13 },
  { x: -4, z: -34, height: 1.75, rx: 20, rz: 8 },
];

const BUILDING_TYPES = {
  hq: {
    name: "HQ",
    hp: 1600,
    radius: 2.9,
    supply: 14,
    weaponRange: 9,
    weaponDamage: 13,
    cooldown: 1.1,
  },
  refinery: {
    name: "Refinery",
    hp: 520,
    radius: 1.7,
    cost: { ore: 80 },
    gatherBoost: 0.2,
  },
  barracks: {
    name: "Barracks",
    hp: 700,
    radius: 2,
    cost: { food: 70, ore: 110 },
    supply: 6,
  },
  solar: {
    name: "Solar Array",
    hp: 420,
    radius: 1.6,
    cost: { ore: 70 },
    income: { power: 0.55 },
  },
  turret: {
    name: "Turret",
    hp: 560,
    radius: 1.4,
    cost: { ore: 90, power: 24 },
    weaponRange: 12,
    weaponDamage: 18,
    cooldown: 0.85,
  },
  academy: {
    name: "Academy",
    hp: 620,
    radius: 1.8,
    cost: { ore: 125, power: 75 },
    tech: 1,
  },
};

const UNIT_TYPES = {
  worker: {
    name: "Worker",
    hp: 70,
    damage: 4,
    range: 0.55,
    cooldown: 1.2,
    speed: 4.15,
    radius: 0.34,
    supply: 1,
    cost: { food: 34 },
    role: "worker",
    trainAt: ["hq"],
  },
  scout: {
    name: "Scout",
    hp: 75,
    damage: 7,
    range: 0.75,
    cooldown: 0.92,
    speed: 5.55,
    radius: 0.33,
    supply: 1,
    cost: { food: 35, power: 10 },
    role: "army",
    trainAt: ["barracks"],
  },
  soldier: {
    name: "Soldier",
    hp: 125,
    damage: 15,
    range: 1,
    cooldown: 1.05,
    speed: 3.75,
    radius: 0.4,
    supply: 1,
    cost: { food: 45, ore: 28 },
    role: "army",
    trainAt: ["barracks"],
  },
  siege: {
    name: "Siege Walker",
    hp: 220,
    damage: 36,
    range: 6,
    cooldown: 2,
    speed: 2.55,
    radius: 0.65,
    supply: 3,
    cost: { ore: 95, power: 64 },
    role: "army",
    trainAt: ["academy"],
    requiresTech: 1,
    splash: 1.8,
  },
};

const RESOURCE_TYPES = {
  food: { name: "Grove", color: 0x5eb95b, accent: 0xa7d86f, amount: 1800 },
  ore: { name: "Ore Vein", color: 0x727b86, accent: 0xc3cad0, amount: 1500 },
  power: { name: "Power Shard", color: 0x3488db, accent: 0x83e2f2, amount: 900 },
};

const TERRAIN_PATTERNS = {
  grass: ["01002010", "00100020", "10002001", "02010000", "00020100", "20001020", "01000010", "10020102"],
  dirt: ["02030120", "30012003", "10230012", "01003001", "23001020", "00120300", "12003010", "00301023"],
  sand: ["00010000", "01000200", "00000010", "10002000", "00200010", "00010000", "02000001", "00001020"],
  water: ["00111100", "01222110", "12200021", "22033302", "10033001", "01200021", "00122210", "00011100"],
  rock: ["01230123", "23012001", "10230301", "03120120", "12030012", "00312030", "23001023", "01230120"],
};

const scene = new THREE.Scene();
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: false,
  powerPreference: "high-performance",
});
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setPixelRatio(Math.min(MAX_PIXEL_RATIO, window.devicePixelRatio || 1));
renderer.setSize(window.innerWidth, window.innerHeight);

const camera = new THREE.PerspectiveCamera(31, window.innerWidth / window.innerHeight, 0.1, 900);
const cameraState = {
  target: new THREE.Vector3(0, CAMERA_LOOK_HEIGHT, 0),
  distance: 82,
};

const terrainGroup = new THREE.Group();
const resourceGroup = new THREE.Group();
const structureGroup = new THREE.Group();
const unitGroup = new THREE.Group();
const effectGroup = new THREE.Group();
const skyGroup = new THREE.Group();
scene.add(skyGroup, terrainGroup, resourceGroup, structureGroup, unitGroup, effectGroup);

const textureCache = new Map();
const materials = {};
const cubeGeometry = new THREE.BoxGeometry(1, 1, 1);
const ringGeometry = new THREE.RingGeometry(0.58, 0.68, 32);
ringGeometry.rotateX(-Math.PI / 2);
const structureRingGeometry = new THREE.RingGeometry(1.8, 2.04, 48);
structureRingGeometry.rotateX(-Math.PI / 2);
const shotGeometry = new THREE.SphereGeometry(0.12, 8, 6);
const resourceCrystalGeometry = new THREE.OctahedronGeometry(0.7, 0);

const factions = [];
const units = [];
const structures = [];
const resourceNodes = [];
const blockers = [];
const projectiles = [];

let playerFaction = null;
let skySphere = null;
let hoverEntity = null;
let uiTimer = 0;

const game = {
  started: false,
  paused: true,
  time: 0,
  directive: "balanced",
  winner: null,
  selected: [],
  lastMessageAt: 0,
  stats: {
    kills: 0,
    losses: 0,
    buildingsBuilt: 0,
    sessions: 0,
  },
};

const pointer = {
  active: false,
  id: null,
  button: 0,
  startX: 0,
  startY: 0,
  x: 0,
  y: 0,
  moved: false,
  selecting: false,
  panning: false,
  startEntity: null,
};

const keys = new Set();

function hexToRgb(hex) {
  const clean = hex.replace("#", "");
  const value = Number.parseInt(clean, 16);
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
  };
}

function colorString(rgb) {
  return `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
}

function createIndexedTexture(key, paletteHexes, pattern) {
  const cacheKey = `${key}-${paletteHexes.join("-")}`;
  if (textureCache.has(cacheKey)) return textureCache.get(cacheKey);
  const canvasTexture = document.createElement("canvas");
  canvasTexture.width = TERRAIN_TEXTURE_SIZE;
  canvasTexture.height = TERRAIN_TEXTURE_SIZE;
  const ctx = canvasTexture.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  const palette = paletteHexes.map(hexToRgb);
  for (let y = 0; y < TERRAIN_TEXTURE_SIZE; y += 1) {
    for (let x = 0; x < TERRAIN_TEXTURE_SIZE; x += 1) {
      const index = Number.parseInt(pattern[y]?.[x] ?? "0", 10);
      ctx.fillStyle = colorString(palette[index] ?? palette[0]);
      ctx.fillRect(x, y, 1, 1);
    }
  }
  const texture = new THREE.CanvasTexture(canvasTexture);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  textureCache.set(cacheKey, texture);
  return texture;
}

function createUnitTexture(type, faction) {
  const key = `${type}-${faction.id}`;
  if (textureCache.has(key)) return textureCache.get(key);
  const canvasTexture = document.createElement("canvas");
  canvasTexture.width = 32;
  canvasTexture.height = 32;
  const ctx = canvasTexture.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, 32, 32);
  ctx.fillStyle = "rgba(0,0,0,0.34)";
  ctx.fillRect(10, 25, 12, 3);
  const body = colorHex(faction.color);
  const accent = colorHex(faction.accent);
  const dark = "#1b2224";
  if (type === "worker") {
    ctx.fillStyle = body;
    ctx.fillRect(12, 12, 8, 12);
    ctx.fillStyle = accent;
    ctx.fillRect(14, 8, 5, 5);
    ctx.fillStyle = "#d2b071";
    ctx.fillRect(7, 17, 5, 2);
    ctx.fillRect(20, 15, 4, 2);
    ctx.fillStyle = dark;
    ctx.fillRect(13, 24, 2, 3);
    ctx.fillRect(18, 24, 2, 3);
  } else if (type === "scout") {
    ctx.fillStyle = accent;
    ctx.fillRect(11, 9, 10, 9);
    ctx.fillStyle = body;
    ctx.fillRect(9, 17, 14, 8);
    ctx.fillStyle = dark;
    ctx.fillRect(7, 14, 3, 10);
    ctx.fillRect(22, 14, 3, 10);
  } else if (type === "siege") {
    ctx.fillStyle = body;
    ctx.fillRect(7, 13, 18, 11);
    ctx.fillStyle = accent;
    ctx.fillRect(10, 9, 9, 5);
    ctx.fillStyle = "#d7d6c8";
    ctx.fillRect(18, 10, 9, 3);
    ctx.fillStyle = dark;
    ctx.fillRect(8, 24, 4, 3);
    ctx.fillRect(20, 24, 4, 3);
  } else {
    ctx.fillStyle = body;
    ctx.fillRect(12, 10, 8, 14);
    ctx.fillStyle = accent;
    ctx.fillRect(13, 7, 6, 5);
    ctx.fillStyle = "#d7d6c8";
    ctx.fillRect(20, 12, 6, 2);
    ctx.fillStyle = dark;
    ctx.fillRect(11, 24, 3, 3);
    ctx.fillRect(18, 24, 3, 3);
  }
  const texture = new THREE.CanvasTexture(canvasTexture);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  textureCache.set(key, texture);
  return texture;
}

function initMaterials() {
  materials.grass = new THREE.MeshStandardMaterial({
    map: createIndexedTexture("grass", ["#477f35", "#5fae47", "#2f5f2f", "#b6bd5a"], TERRAIN_PATTERNS.grass),
    roughness: 0.96,
  });
  materials.dirt = new THREE.MeshStandardMaterial({
    map: createIndexedTexture("dirt", ["#6b4726", "#8a6034", "#3d2b19", "#a47142"], TERRAIN_PATTERNS.dirt),
    roughness: 0.98,
  });
  materials.sand = new THREE.MeshStandardMaterial({
    map: createIndexedTexture("sand", ["#cdb66e", "#ead18b", "#967e48", "#d9c17b"], TERRAIN_PATTERNS.sand),
    roughness: 0.92,
  });
  materials.water = new THREE.MeshStandardMaterial({
    map: createIndexedTexture("water", ["#287fc1", "#3da6df", "#15558b", "#8ddcf0"], TERRAIN_PATTERNS.water),
    transparent: true,
    opacity: 0.9,
    roughness: 0.34,
  });
  materials.rock = new THREE.MeshStandardMaterial({
    map: createIndexedTexture("rock", ["#686c67", "#8e928a", "#414640", "#757d70"], TERRAIN_PATTERNS.rock),
    roughness: 0.96,
  });
  materials.trunk = new THREE.MeshStandardMaterial({ color: 0x6a4324, roughness: 0.92, flatShading: true });
  materials.leaves = new THREE.MeshStandardMaterial({ color: 0x3f8b42, roughness: 0.96, flatShading: true });
  materials.leavesDark = new THREE.MeshStandardMaterial({ color: 0x2f6738, roughness: 0.98, flatShading: true });
  materials.outcrop = new THREE.MeshStandardMaterial({ color: 0x747a74, roughness: 0.96, flatShading: true });
  materials.selection = new THREE.MeshBasicMaterial({
    color: 0xbce57f,
    transparent: true,
    opacity: 0.86,
    side: THREE.DoubleSide,
  });
  materials.enemySelection = new THREE.MeshBasicMaterial({
    color: 0xf06d5a,
    transparent: true,
    opacity: 0.82,
    side: THREE.DoubleSide,
  });
  materials.shadow = new THREE.MeshBasicMaterial({
    color: 0x000000,
    transparent: true,
    opacity: 0.23,
    depthWrite: false,
  });
}

function createSkyTexture() {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 256;
  const ctx = c.getContext("2d");
  const gradient = ctx.createLinearGradient(0, 0, 0, c.height);
  gradient.addColorStop(0, "#0b1328");
  gradient.addColorStop(0.45, "#152f45");
  gradient.addColorStop(1, "#5e7d86");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, c.width, c.height);
  for (let i = 0; i < 520; i += 1) {
    const x = Math.random() * c.width;
    const y = Math.random() * c.height * 0.58;
    const size = Math.random() < 0.86 ? 1 : 2;
    ctx.fillStyle = Math.random() < 0.72 ? "#e8f4ff" : "#ffd889";
    ctx.globalAlpha = rand(0.28, 0.95);
    ctx.fillRect(Math.floor(x), Math.floor(y), size, size);
  }
  ctx.globalAlpha = 0.22;
  for (let i = 0; i < 14; i += 1) {
    ctx.fillStyle = i % 2 ? "#8f6bea" : "#5ae2cf";
    ctx.beginPath();
    ctx.ellipse(rand(40, 470), rand(26, 150), rand(28, 80), rand(5, 15), rand(-0.8, 0.8), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createSkybox() {
  const geometry = new THREE.SphereGeometry(SKY_RADIUS, 32, 16);
  const material = new THREE.MeshBasicMaterial({
    map: createSkyTexture(),
    side: THREE.BackSide,
    fog: false,
  });
  skySphere = new THREE.Mesh(geometry, material);
  skySphere.position.y = -90;
  skyGroup.add(skySphere);

  const glowGeometry = new THREE.CircleGeometry(55, 32);
  const glowMaterial = new THREE.MeshBasicMaterial({
    color: 0xffd880,
    transparent: true,
    opacity: 0.22,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const glow = new THREE.Mesh(glowGeometry, glowMaterial);
  glow.position.set(-165, 135, -190);
  glow.lookAt(0, 0, 0);
  skyGroup.add(glow);
}

function createLighting() {
  scene.add(new THREE.HemisphereLight(0xbad8ff, 0x2d261b, 1.58));
  const sun = new THREE.DirectionalLight(0xffe1a8, 2.25);
  sun.position.set(-28, 56, 26);
  scene.add(sun);
}

function waterScore(x, z) {
  const lake = ((x + 4) / 12) ** 2 + ((z + 2) / 8.5) ** 2;
  const river = Math.abs(z - Math.sin((x + MAP_SEED) * 0.1) * 6) / 2.6 + Math.abs(x) / 78;
  return Math.min(lake, river);
}

function isWater(x, z) {
  return waterScore(x, z) < 1;
}

function isShore(x, z) {
  if (isWater(x, z)) return false;
  return [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ].some(([dx, dz]) => isWater(x + dx, z + dz));
}

function plateauWeight(x, z) {
  let strongest = 0;
  for (const blueprint of FACTION_BLUEPRINTS) {
    const dist = Math.hypot(x - blueprint.start.x, z - blueprint.start.z);
    strongest = Math.max(strongest, clamp(1 - (dist - 6) / 8, 0, 1));
  }
  return strongest;
}

function terrainTopHeight(x, z) {
  if (isWater(x, z)) return -0.62;
  const roll =
    Math.sin((x + MAP_SEED) * 0.12) * 0.46 +
    Math.cos((z - MAP_SEED) * 0.16) * 0.38 +
    Math.sin((x * 0.07 + z * 0.13 + MAP_SEED) * 1.18) * 0.32;
  const ridge =
    Math.exp(-((x + 23) ** 2) / 320 - ((z - 4) ** 2) / 120) * 1.55 +
    Math.exp(-((x - 18) ** 2) / 220 - ((z + 18) ** 2) / 260) * 1.35;
  const features = TERRAIN_FEATURES.reduce((sum, feature) => {
    const dx = (x - feature.x) / feature.rx;
    const dz = (z - feature.z) / feature.rz;
    return sum + Math.exp(-(dx * dx + dz * dz)) * feature.height;
  }, 0);
  const edge = Math.max(Math.abs(x), Math.abs(z)) / HALF_MAP;
  const edgeRise = edge > 0.76 ? (edge - 0.76) * 5.2 : 0;
  const cut = mapNoise(Math.floor(x / 4), Math.floor(z / 4), 6) > 0.64 ? 0.34 : 0;
  const raw = clamp(roll + ridge + features + edgeRise - cut, -0.14, 4.45);
  const terraced = Math.round(raw / 0.34) * 0.34;
  return lerp(terraced, isShore(x, z) ? -0.12 : 0.1, plateauWeight(x, z));
}

function terrainKind(x, z) {
  if (isWater(x, z)) return "water";
  if (isShore(x, z)) return "sand";
  const height = terrainTopHeight(x, z);
  if (height > 2.05) return "rock";
  if (height > 1.05 && mapNoise(Math.floor(x), Math.floor(z), 4) > 0.34) return "dirt";
  if (Math.sin(x * 0.2 + z * 0.17) > 0.72) return "dirt";
  return "grass";
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

function pushSkirt(buffers, x0, z0, x1, z1, h0, h1) {
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

function createTerrain() {
  terrainGroup.clear();
  const byKind = new Map();
  for (let x = -HALF_MAP; x < HALF_MAP; x += 1) {
    for (let z = -HALF_MAP; z < HALF_MAP; z += 1) {
      const key = terrainKind(x + 0.5, z + 0.5);
      if (!byKind.has(key)) byKind.set(key, terrainBuffers());
      pushTerrainTile(byKind.get(key), x, z);
    }
  }
  for (const [key, buffers] of byKind) {
    const mesh = new THREE.Mesh(geometryFromBuffers(buffers), materials[key]);
    terrainGroup.add(mesh);
  }
  const skirtBuffers = terrainBuffers();
  for (let i = -HALF_MAP; i < HALF_MAP; i += 1) {
    pushSkirt(skirtBuffers, i, -HALF_MAP, i + 1, -HALF_MAP, terrainTopHeight(i, -HALF_MAP), terrainTopHeight(i + 1, -HALF_MAP));
    pushSkirt(skirtBuffers, i + 1, HALF_MAP, i, HALF_MAP, terrainTopHeight(i + 1, HALF_MAP), terrainTopHeight(i, HALF_MAP));
    pushSkirt(skirtBuffers, -HALF_MAP, i + 1, -HALF_MAP, i, terrainTopHeight(-HALF_MAP, i + 1), terrainTopHeight(-HALF_MAP, i));
    pushSkirt(skirtBuffers, HALF_MAP, i, HALF_MAP, i + 1, terrainTopHeight(HALF_MAP, i), terrainTopHeight(HALF_MAP, i + 1));
  }
  terrainGroup.add(new THREE.Mesh(geometryFromBuffers(skirtBuffers), materials.rock));
  createTerrainDetails();
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
  return lerp(lerp(h00, h10, tx), lerp(h01, h11, tx), tz);
}

function addBlock(group, material, x, y, z, sx, sy, sz) {
  const mesh = new THREE.Mesh(cubeGeometry, material);
  mesh.position.set(x, y + sy / 2, z);
  mesh.scale.set(sx, sy, sz);
  group.add(mesh);
  return mesh;
}

function isNearFactionStart(x, z, radius = 9) {
  return FACTION_BLUEPRINTS.some((blueprint) => distSq2(x, z, blueprint.start.x, blueprint.start.z) < radius * radius);
}

function createTreeCluster(x, z, height, scale = 1) {
  const group = new THREE.Group();
  addBlock(group, materials.trunk, 0, 0, 0, 0.32 * scale, 1.05 * scale, 0.32 * scale);
  addBlock(group, materials.leaves, 0, 1.02 * scale, 0, 1.25 * scale, 0.72 * scale, 1.25 * scale);
  addBlock(group, materials.leavesDark, -0.24 * scale, 1.52 * scale, 0.14 * scale, 0.86 * scale, 0.58 * scale, 0.86 * scale);
  group.position.set(x, height, z);
  freezeStaticObject(group);
  terrainGroup.add(group);
}

function createRockOutcrop(x, z, height, scale = 1) {
  const group = new THREE.Group();
  addBlock(group, materials.outcrop, 0, 0, 0, 1.15 * scale, 0.62 * scale, 0.92 * scale);
  addBlock(group, materials.rock, -0.34 * scale, 0.54 * scale, 0.18 * scale, 0.58 * scale, 0.52 * scale, 0.48 * scale);
  addBlock(group, materials.outcrop, 0.44 * scale, 0.34 * scale, -0.28 * scale, 0.5 * scale, 0.44 * scale, 0.6 * scale);
  group.rotation.y = mapNoise(x, z, 19) * Math.PI;
  group.position.set(x, height, z);
  freezeStaticObject(group);
  terrainGroup.add(group);
}

function createTerrainDetails() {
  for (let x = -HALF_MAP + 6; x < HALF_MAP - 6; x += 4) {
    for (let z = -HALF_MAP + 6; z < HALF_MAP - 6; z += 4) {
      const jitterX = (mapNoise(x, z, 1) - 0.5) * 2.2;
      const jitterZ = (mapNoise(x, z, 2) - 0.5) * 2.2;
      const px = x + jitterX;
      const pz = z + jitterZ;
      if (isWater(px, pz) || isShore(px, pz) || isNearFactionStart(px, pz, 12)) continue;
      const height = terrainTopHeight(px, pz);
      const noise = mapNoise(x, z, 3);
      if (height > 2.05 && noise > 0.42) {
        createRockOutcrop(px, pz, height, 0.75 + mapNoise(x, z, 4) * 0.65);
      } else if (height > 0.25 && height < 2.2 && noise > 0.82) {
        createTreeCluster(px, pz, height, 0.78 + mapNoise(x, z, 5) * 0.45);
      }
    }
  }
}

function factionMaterials(faction) {
  if (faction.materials) return faction.materials;
  faction.materials = {
    primary: new THREE.MeshStandardMaterial({ color: faction.material, roughness: 0.86, flatShading: true }),
    color: new THREE.MeshStandardMaterial({ color: faction.color, roughness: 0.78, flatShading: true }),
    accent: new THREE.MeshStandardMaterial({ color: faction.accent, roughness: 0.72, flatShading: true }),
    dark: new THREE.MeshStandardMaterial({ color: 0x1d2326, roughness: 0.9, flatShading: true }),
    glass: new THREE.MeshStandardMaterial({ color: faction.accent, roughness: 0.45, emissive: faction.accent, emissiveIntensity: 0.16, flatShading: true }),
    stone: new THREE.MeshStandardMaterial({ color: 0x97968d, roughness: 0.94, flatShading: true }),
    trim: new THREE.MeshStandardMaterial({ color: 0xc5bea3, roughness: 0.88, flatShading: true }),
    wood: new THREE.MeshStandardMaterial({ color: 0x735033, roughness: 0.92, flatShading: true }),
    plaster: new THREE.MeshStandardMaterial({ color: 0xbda982, roughness: 0.9, flatShading: true }),
    roof: new THREE.MeshStandardMaterial({ color: faction.color, roughness: 0.82, flatShading: true }),
    thatch: new THREE.MeshStandardMaterial({ color: 0xa48545, roughness: 0.96, flatShading: true }),
  };
  return faction.materials;
}

function freezeStaticObject(object) {
  object.traverse((child) => {
    child.updateMatrix();
    child.matrixAutoUpdate = false;
  });
  object.updateMatrix();
  object.matrixAutoUpdate = false;
}

function addRoofPrism(group, material, x, y, z, sx, sy, sz) {
  const x0 = x - sx / 2;
  const x1 = x + sx / 2;
  const z0 = z - sz / 2;
  const z1 = z + sz / 2;
  const y0 = y;
  const y1 = y + sy;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute([
    x0, y0, z0, x1, y0, z0, x, y1, z0,
    x0, y0, z1, x1, y0, z1, x, y1, z1,
  ], 3));
  geometry.setIndex([
    0, 1, 2,
    4, 3, 5,
    3, 0, 2, 3, 2, 5,
    1, 4, 5, 1, 5, 2,
    0, 3, 4, 0, 4, 1,
  ]);
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, material);
  group.add(mesh);
  return mesh;
}

function addCrenels(group, material, y, halfX, halfZ, size = 0.42) {
  for (let i = -1; i <= 1; i += 2) {
    addBlock(group, material, i * halfX, y, -halfZ, size, size, size);
    addBlock(group, material, i * halfX, y, halfZ, size, size, size);
    addBlock(group, material, -halfX, y, i * halfZ, size, size, size);
    addBlock(group, material, halfX, y, i * halfZ, size, size, size);
  }
}

function addVillageHouse(group, mats, roofMaterial = mats.thatch) {
  addBlock(group, mats.plaster, 0, 0, 0, 2.85, 1.35, 2.35);
  addBlock(group, mats.wood, 0, 0, 1.22, 0.48, 0.8, 0.14);
  addBlock(group, mats.stone, -0.92, 0.1, 1.24, 0.42, 0.62, 0.16);
  addBlock(group, mats.stone, 0.92, 0.1, 1.24, 0.42, 0.62, 0.16);
  addBlock(group, mats.dark, 0, 0.1, 1.33, 0.42, 0.72, 0.1);
  addBlock(group, mats.glass, -0.72, 0.68, 1.35, 0.28, 0.28, 0.08);
  addBlock(group, mats.glass, 0.72, 0.68, 1.35, 0.28, 0.28, 0.08);
  addRoofPrism(group, roofMaterial, 0, 1.22, 0, 3.3, 1.04, 2.75);
  addBlock(group, mats.stone, 0.82, 1.74, -0.62, 0.28, 0.72, 0.28);
}

function addStoneTower(group, mats, withBarrel = false) {
  addBlock(group, mats.stone, 0, 0, 0, 1.9, 3.15, 1.9);
  addBlock(group, mats.trim, 0, 3.05, 0, 2.24, 0.48, 2.24);
  addCrenels(group, mats.stone, 3.45, 0.72, 0.72);
  addBlock(group, mats.dark, 0, 0.12, 0.98, 0.5, 0.85, 0.12);
  if (withBarrel) {
    const barrel = addBlock(group, mats.dark, 0, 2.75, 1.14, 0.28, 0.28, 1.65);
    barrel.name = "barrel";
  }
}

function addWallSegment(group, mats, x, z, w, d) {
  addBlock(group, mats.stone, x, 0.04, z, w, 1.25, d);
  const count = Math.max(1, Math.floor(Math.max(w, d)));
  for (let i = 0; i < count; i += 1) {
    const px = w > d ? x - w / 2 + 0.5 + i : x;
    const pz = w > d ? z : z - d / 2 + 0.5 + i;
    addBlock(group, mats.stone, px, 1.25, pz, 0.38, 0.36, 0.38);
  }
}

function createStructureModel(type, faction) {
  const mats = factionMaterials(faction);
  const group = new THREE.Group();
  if (type === "hq") {
    addBlock(group, mats.stone, 0, 0, 0, 4.7, 2.35, 4.2);
    addBlock(group, mats.trim, 0, 2.28, 0, 3.65, 0.7, 3.1);
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) addBlock(group, mats.stone, sx * 2.15, 0.04, sz * 1.78, 1.05, 3.2, 1.05);
    }
    addBlock(group, mats.color, 0, 3.05, 0, 4.35, 0.34, 0.5);
    addBlock(group, mats.accent, 0, 3.42, 0, 3.35, 0.22, 0.28);
    addWallSegment(group, mats, 0, 3.95, 7.2, 0.55);
    addWallSegment(group, mats, -3.85, 0.35, 0.55, 7.2);
    addWallSegment(group, mats, 3.85, 0.35, 0.55, 7.2);
  } else if (type === "refinery") {
    addBlock(group, mats.stone, 0, 0, 0, 2.7, 0.9, 2.2);
    addRoofPrism(group, mats.roof, -0.25, 0.86, -0.05, 2.45, 0.7, 2.35);
    addBlock(group, mats.dark, 1.18, 0.84, -0.72, 0.34, 1.55, 0.34);
    addBlock(group, mats.glass, -0.76, 0.88, 0.35, 0.72, 0.75, 0.72);
    addBlock(group, mats.accent, 0.86, 0.12, 1.1, 0.64, 0.48, 0.34);
  } else if (type === "barracks") {
    addVillageHouse(group, mats, mats.roof);
    addBlock(group, mats.wood, -1.7, 0.05, 0.1, 0.55, 1.15, 1.65);
    addBlock(group, mats.wood, 1.7, 0.05, 0.1, 0.55, 1.15, 1.65);
    addBlock(group, mats.color, 0, 1.9, 1.46, 0.16, 0.75, 0.16);
  } else if (type === "solar") {
    addBlock(group, mats.stone, 0, 0, 0, 1.3, 0.55, 1.3);
    for (let i = -1; i <= 1; i += 2) {
      const panel = addBlock(group, mats.glass, i * 0.95, 0.65, 0, 1.35, 0.12, 2.2);
      panel.rotation.z = i * -0.22;
    }
  } else if (type === "turret") {
    addStoneTower(group, mats, true);
  } else if (type === "academy") {
    addVillageHouse(group, mats, mats.thatch);
    addBlock(group, mats.glass, 0, 1.18, -0.25, 1.05, 1.45, 1.05);
    addRoofPrism(group, mats.accent, 0, 2.52, -0.25, 1.22, 0.72, 1.22);
    addBlock(group, mats.accent, 0, 3.2, -0.25, 0.3, 0.45, 0.3);
  }
  return group;
}

function structureBarHeight(type) {
  if (type === "hq") return 5.15;
  if (type === "turret") return 4.55;
  if (type === "academy") return 3.8;
  if (type === "barracks") return 3.2;
  return 2.75;
}

function structureFireHeight(type) {
  if (type === "hq") return 3.8;
  if (type === "turret") return 3.65;
  return 2.1;
}

function createSelectionRing(radius, faction, hostile = false) {
  const ring = new THREE.Mesh(radius > 1 ? structureRingGeometry : ringGeometry, hostile ? materials.enemySelection : materials.selection);
  ring.scale.setScalar(radius > 1 ? radius / 1.9 : radius / 0.6);
  ring.visible = false;
  return ring;
}

function createHealthBar(entity, width = 2) {
  const group = new THREE.Group();
  const bg = addBlock(group, new THREE.MeshBasicMaterial({ color: 0x2a1e1e }), 0, 0, 0, width, 0.08, 0.08);
  const fill = addBlock(group, new THREE.MeshBasicMaterial({ color: 0x78d765 }), -width / 2, 0.01, 0, width, 0.09, 0.1);
  fill.geometry.translate(0.5, 0, 0);
  group.userData = { fill, bg, width };
  entity.healthBar = group;
  return group;
}

function updateHealthBar(entity) {
  if (!entity.healthBar) return;
  const fill = entity.healthBar.userData.fill;
  const width = entity.healthBar.userData.width;
  const pct = clamp(entity.hp / entity.maxHp, 0, 1);
  fill.scale.x = pct;
  fill.material.color.setHex(pct > 0.55 ? 0x78d765 : pct > 0.25 ? 0xe6c65b : 0xd65b4d);
  fill.position.x = -width / 2;
}

function syncStructureToTerrain(structure) {
  const y = sampleTerrainHeight(structure.position.x, structure.position.z);
  structure.position.y = y;
  structure.group.position.copy(structure.position);
  structure.selectRing.position.set(structure.position.x, y + 0.08, structure.position.z);
  if (structure.healthBar) {
    structure.healthBar.position.set(structure.position.x, y + structure.barHeight, structure.position.z);
    structure.healthBar.lookAt(camera.position);
  }
}

function createStructure(type, faction, x, z, free = false) {
  const definition = BUILDING_TYPES[type];
  if (!free && !payCost(faction, definition.cost)) return null;
  const group = createStructureModel(type, faction);
  const structure = {
    id: crypto.randomUUID(),
    kind: "structure",
    type,
    name: definition.name,
    faction,
    position: new THREE.Vector3(x, sampleTerrainHeight(x, z), z),
    radius: definition.radius,
    hp: definition.hp,
    maxHp: definition.hp,
    alive: true,
    reload: rand(0, 1),
    rallyPoint: new THREE.Vector3(x + rand(-3, 3), 0, z + rand(-3, 3)),
    selectRing: createSelectionRing(definition.radius, faction),
    healthBar: null,
    barHeight: structureBarHeight(type),
    group,
  };
  structure.healthBar = createHealthBar(structure, type === "hq" ? 3.2 : 2.2);
  structureGroup.add(group, structure.selectRing, structure.healthBar);
  structures.push(structure);
  faction.structures.push(structure);
  blockers.push({ owner: structure, x, z, radius: definition.radius + 0.4 });
  syncStructureToTerrain(structure);
  updateHealthBar(structure);
  if (!free && faction.player) {
    game.stats.buildingsBuilt += 1;
    logEvent(`${definition.name} construction started.`);
  }
  return structure;
}

function createResourceNode(type, x, z, amount = RESOURCE_TYPES[type].amount) {
  const definition = RESOURCE_TYPES[type];
  const group = new THREE.Group();
  const baseMat = new THREE.MeshStandardMaterial({ color: definition.color, roughness: 0.8, flatShading: true });
  const accentMat = new THREE.MeshStandardMaterial({
    color: definition.accent,
    roughness: 0.45,
    emissive: type === "power" ? definition.accent : 0x000000,
    emissiveIntensity: type === "power" ? 0.25 : 0,
    flatShading: true,
  });
  if (type === "food") {
    for (let i = 0; i < 5; i += 1) {
      addBlock(group, baseMat, rand(-0.9, 0.9), 0, rand(-0.9, 0.9), 0.34, rand(0.6, 1.2), 0.34);
      addBlock(group, accentMat, rand(-0.9, 0.9), rand(0.8, 1.3), rand(-0.9, 0.9), 0.68, 0.5, 0.68);
    }
  } else if (type === "ore") {
    for (let i = 0; i < 6; i += 1) {
      const rock = new THREE.Mesh(resourceCrystalGeometry, i % 2 ? baseMat : accentMat);
      rock.position.set(rand(-1, 1), rand(0.2, 0.65), rand(-1, 1));
      rock.scale.setScalar(rand(0.5, 1));
      group.add(rock);
    }
  } else {
    for (let i = 0; i < 4; i += 1) {
      const crystal = new THREE.Mesh(resourceCrystalGeometry, i % 2 ? baseMat : accentMat);
      crystal.position.set(rand(-0.8, 0.8), rand(0.5, 1.2), rand(-0.8, 0.8));
      crystal.scale.set(0.55, rand(1.1, 1.8), 0.55);
      group.add(crystal);
    }
  }
  const node = {
    id: crypto.randomUUID(),
    kind: "resource",
    type,
    name: definition.name,
    amount,
    maxAmount: amount,
    position: new THREE.Vector3(x, sampleTerrainHeight(x, z), z),
    radius: 1.55,
    group,
  };
  group.position.copy(node.position);
  resourceGroup.add(group);
  resourceNodes.push(node);
  return node;
}

function createResourceFields() {
  resourceGroup.clear();
  resourceNodes.length = 0;
  for (const blueprint of FACTION_BLUEPRINTS) {
    const sx = blueprint.start.x;
    const sz = blueprint.start.z;
    createResourceNode("food", sx + Math.sign(-sx || 1) * 6, sz + 3, 1900);
    createResourceNode("ore", sx + 3, sz + Math.sign(-sz || 1) * 6, 1600);
    createResourceNode("power", sx - Math.sign(-sx || 1) * 6, sz - 4, 950);
  }
  const neutralNodes = [
    ["ore", -8, 28],
    ["food", 12, 25],
    ["power", 0, 32],
    ["ore", -22, -4],
    ["food", 22, -2],
    ["power", 0, -28],
    ["ore", 28, 10],
    ["food", -28, -12],
  ];
  for (const [type, x, z] of neutralNodes) {
    createResourceNode(type, x + rand(-3, 3), z + rand(-3, 3), RESOURCE_TYPES[type].amount * 1.25);
  }
}

function createFaction(blueprint) {
  return {
    ...blueprint,
    resources: { food: 220, ore: 160, power: 70 },
    units: [],
    structures: [],
    defeated: false,
    tech: 0,
    nextThink: rand(0.2, 1.8),
    waveTimer: rand(18, 32),
    lastAttackAt: 0,
    rallyPoint: blueprint.start.clone(),
  };
}

function resetWorld() {
  for (const group of [structureGroup, unitGroup, effectGroup]) group.clear();
  factions.length = 0;
  units.length = 0;
  structures.length = 0;
  blockers.length = 0;
  projectiles.length = 0;
  game.selected = [];
  game.time = 0;
  game.winner = null;
  game.stats.kills = 0;
  game.stats.losses = 0;
  game.stats.buildingsBuilt = 0;
  for (const blueprint of FACTION_BLUEPRINTS) {
    const faction = createFaction(blueprint);
    factions.push(faction);
    if (faction.player) playerFaction = faction;
  }
  createResourceFields();
  for (const faction of factions) {
    const hq = createStructure("hq", faction, faction.start.x, faction.start.z, true);
    faction.hq = hq;
    faction.rallyPoint.copy(hq.position);
    for (let i = 0; i < 5; i += 1) {
      spawnUnit("worker", faction, hq.position.x + rand(-3.5, 3.5), hq.position.z + rand(-3.5, 3.5), true);
    }
    spawnUnit("soldier", faction, hq.position.x + rand(-3, 3), hq.position.z + rand(-3, 3), true);
    spawnUnit("scout", faction, hq.position.x + rand(-3, 3), hq.position.z + rand(-3, 3), true);
  }
  logEvent("The four HQs are online. The skirmish is now autonomous.", true);
  setDirective(game.directive);
  resetCamera();
  updateUI(true);
}

function currentSupply(faction) {
  return faction.units.filter((unit) => unit.alive).reduce((sum, unit) => sum + UNIT_TYPES[unit.type].supply, 0);
}

function supplyCap(faction) {
  return faction.structures
    .filter((structure) => structure.alive)
    .reduce((sum, structure) => sum + (BUILDING_TYPES[structure.type].supply ?? 0), 0);
}

function hasStructure(faction, type) {
  return faction.structures.some((structure) => structure.alive && structure.type === type);
}

function structureCount(faction, type) {
  return faction.structures.filter((structure) => structure.alive && (!type || structure.type === type)).length;
}

function unitCount(faction, type) {
  return faction.units.filter((unit) => unit.alive && (!type || unit.type === type)).length;
}

function armyUnits(faction) {
  return faction.units.filter((unit) => unit.alive && UNIT_TYPES[unit.type].role === "army");
}

function canPay(faction, cost = {}) {
  return Object.entries(cost).every(([key, value]) => faction.resources[key] >= value);
}

function payCost(faction, cost = {}) {
  if (!canPay(faction, cost)) return false;
  for (const [key, value] of Object.entries(cost)) faction.resources[key] -= value;
  return true;
}

function adjustedUnitCost(type, faction) {
  const base = UNIT_TYPES[type].cost;
  const cost = {};
  for (const [key, value] of Object.entries(base)) {
    cost[key] = key === "food" && type === "worker" ? Math.ceil(value * (faction.bonus.workerCost ?? 1)) : value;
  }
  return cost;
}

function trainUnit(type, faction, source = null, free = false) {
  const definition = UNIT_TYPES[type];
  if (!definition) return null;
  if (!free && currentSupply(faction) + definition.supply > supplyCap(faction)) return null;
  if (!free && (definition.requiresTech ?? 0) > faction.tech) return null;
  if (!free && !payCost(faction, adjustedUnitCost(type, faction))) return null;
  const producer =
    source ??
    faction.structures.find((structure) => structure.alive && definition.trainAt.includes(structure.type)) ??
    faction.hq;
  const angle = rand(0, Math.PI * 2);
  const radius = (producer?.radius ?? 2) + rand(1.2, 3.2);
  const x = clamp((producer?.position.x ?? faction.start.x) + Math.cos(angle) * radius, -HALF_MAP + 1, HALF_MAP - 1);
  const z = clamp((producer?.position.z ?? faction.start.z) + Math.sin(angle) * radius, -HALF_MAP + 1, HALF_MAP - 1);
  return spawnUnit(type, faction, x, z, free);
}

function spawnUnit(type, faction, x, z, free = false) {
  const definition = UNIT_TYPES[type];
  const hp = Math.round(definition.hp * (faction.bonus.unitHp ?? 1));
  const damage = definition.damage * (faction.bonus.unitDamage ?? 1);
  const speed = definition.speed * (faction.bonus.speed ?? 1);
  const texture = createUnitTexture(type, faction);
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false });
  const sprite = new THREE.Sprite(material);
  const scale = type === "siege" ? 1.85 : type === "soldier" ? 1.35 : 1.15;
  sprite.scale.set(scale, scale * 1.28, 1);
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(type === "siege" ? 0.85 : 0.48, 18), materials.shadow);
  shadow.rotation.x = -Math.PI / 2;
  const selectRing = createSelectionRing(definition.radius, faction);
  const unit = {
    id: crypto.randomUUID(),
    kind: "unit",
    type,
    name: definition.name,
    faction,
    position: new THREE.Vector3(x, sampleTerrainHeight(x, z), z),
    velocity: new THREE.Vector3(),
    hp,
    maxHp: hp,
    damage,
    speed,
    range: definition.range,
    cooldown: definition.cooldown,
    attackTimer: rand(0, definition.cooldown),
    radius: definition.radius,
    role: definition.role,
    alive: true,
    order: { type: definition.role === "worker" ? "gather" : "guard", target: null, point: faction.rallyPoint.clone() },
    cargoType: null,
    cargo: 0,
    harvestTimer: 0,
    frameSeed: Math.random() * 100,
    sprite,
    shadow,
    selectRing,
  };
  units.push(unit);
  faction.units.push(unit);
  unitGroup.add(shadow, sprite, selectRing);
  syncUnitToTerrain(unit);
  if (!free && faction.player) logEvent(`${definition.name} trained.`);
  return unit;
}

function syncUnitToTerrain(unit) {
  const y = sampleTerrainHeight(unit.position.x, unit.position.z);
  unit.position.y = y + unit.sprite.scale.y * 0.45;
  unit.sprite.position.copy(unit.position);
  unit.shadow.position.set(unit.position.x, y + 0.04, unit.position.z);
  unit.selectRing.position.set(unit.position.x, y + 0.07, unit.position.z);
}

function nearestResource(unit, preferredType = null) {
  let best = null;
  let bestScore = Infinity;
  for (const node of resourceNodes) {
    if (node.amount <= 0) continue;
    if (preferredType && node.type !== preferredType) continue;
    const distance = unit.position.distanceToSquared(node.position);
    if (distance < bestScore) {
      bestScore = distance;
      best = node;
    }
  }
  return best;
}

function nearestDropoff(unit) {
  let best = null;
  let bestScore = Infinity;
  for (const structure of unit.faction.structures) {
    if (!structure.alive || (structure.type !== "hq" && structure.type !== "refinery")) continue;
    const distance = unit.position.distanceToSquared(structure.position);
    if (distance < bestScore) {
      bestScore = distance;
      best = structure;
    }
  }
  return best;
}

function preferredGatherType(faction) {
  const resources = faction.resources;
  if (resources.food < RESOURCE_LOW_WATER) return "food";
  if (resources.ore < RESOURCE_LOW_WATER) return "ore";
  if (resources.power < 55 || DIRECTIVES[faction.directive].tech > 1) return "power";
  const roll = Math.random();
  if (roll < 0.42) return "food";
  if (roll < 0.78) return "ore";
  return "power";
}

function nearestEnemyEntity(from, faction, maxDistance = Infinity) {
  let best = null;
  let bestScore = maxDistance * maxDistance;
  for (const unit of units) {
    if (!unit.alive || unit.faction === faction) continue;
    const score = from.distanceToSquared(unit.position);
    if (score < bestScore) {
      bestScore = score;
      best = unit;
    }
  }
  for (const structure of structures) {
    if (!structure.alive || structure.faction === faction) continue;
    const score = from.distanceToSquared(structure.position) - (structure.type === "hq" ? 20 : 0);
    if (score < bestScore) {
      bestScore = score;
      best = structure;
    }
  }
  return best;
}

function enemyHqTarget(faction) {
  let best = null;
  let bestScore = Infinity;
  for (const other of factions) {
    if (other === faction || other.defeated || !other.hq?.alive) continue;
    const score = faction.hq.position.distanceToSquared(other.hq.position);
    if (score < bestScore) {
      bestScore = score;
      best = other.hq;
    }
  }
  return best;
}

function moveToward(unit, point, dt, stopDistance = 0, targetEntity = null) {
  tmpVec.copy(point).sub(unit.position);
  tmpVec.y = 0;
  const distance = tmpVec.length();
  if (distance <= stopDistance) {
    unit.velocity.multiplyScalar(0.55);
    separateFromBlockers(unit, targetEntity);
    syncUnitToTerrain(unit);
    return distance;
  }
  tmpVec.normalize();
  const avoid = obstacleAvoidance(unit, tmpVec, targetEntity);
  unit.velocity.lerp(avoid.multiplyScalar(unit.speed), 0.28);
  unit.position.addScaledVector(unit.velocity, dt);
  unit.position.x = clamp(unit.position.x, -HALF_MAP + 1, HALF_MAP - 1);
  unit.position.z = clamp(unit.position.z, -HALF_MAP + 1, HALF_MAP - 1);
  separateFromBlockers(unit, targetEntity);
  separateUnits(unit);
  syncUnitToTerrain(unit);
  return distance;
}

function obstacleAvoidance(unit, direction, targetEntity = null) {
  const desired = tmpVec2.copy(direction);
  const aheadX = unit.position.x + direction.x * (1.4 + unit.speed * 0.28);
  const aheadZ = unit.position.z + direction.z * (1.4 + unit.speed * 0.28);
  for (const blocker of blockers) {
    if (!blocker.owner.alive || blocker.owner === targetEntity) continue;
    const dx = aheadX - blocker.x;
    const dz = aheadZ - blocker.z;
    const minDist = blocker.radius + unit.radius + 0.35;
    const d2 = dx * dx + dz * dz;
    if (d2 > minDist * minDist || d2 < 0.0001) continue;
    const push = new THREE.Vector3(dx, 0, dz).normalize().multiplyScalar((minDist * minDist - d2) / (minDist * minDist));
    desired.add(push.multiplyScalar(1.6));
  }
  if (desired.lengthSq() < 0.001) desired.copy(direction);
  return desired.normalize();
}

function separateFromBlockers(unit, targetEntity = null) {
  for (const blocker of blockers) {
    if (!blocker.owner.alive || blocker.owner === targetEntity) continue;
    const dx = unit.position.x - blocker.x;
    const dz = unit.position.z - blocker.z;
    const minDist = blocker.radius + unit.radius + 0.08;
    const d = Math.hypot(dx, dz);
    if (d >= minDist || d < 0.0001) continue;
    unit.position.x += (dx / d) * (minDist - d);
    unit.position.z += (dz / d) * (minDist - d);
  }
}

function separateUnits(unit) {
  for (const other of units) {
    if (other === unit || !other.alive) continue;
    const dx = unit.position.x - other.position.x;
    const dz = unit.position.z - other.position.z;
    const minDist = unit.radius + other.radius + 0.08;
    const d = Math.hypot(dx, dz);
    if (d <= 0.0001 || d >= minDist) continue;
    const push = (minDist - d) * 0.28;
    unit.position.x += (dx / d) * push;
    unit.position.z += (dz / d) * push;
  }
}

function updateWorker(unit, dt) {
  const danger = nearestEnemyEntity(unit.position, unit.faction, 4.4);
  if (danger && danger.kind === "unit") {
    tmpPoint.copy(unit.position).sub(danger.position).setY(0).normalize().multiplyScalar(5).add(unit.position);
    moveToward(unit, tmpPoint, dt);
    return;
  }
  if (unit.cargo > 0) {
    const dropoff = nearestDropoff(unit);
    if (!dropoff) return;
    const distance = moveToward(unit, dropoff.position, dt, dropoff.radius + 0.8, dropoff);
    if (distance <= dropoff.radius + 1) {
      unit.faction.resources[unit.cargoType] += unit.cargo;
      unit.cargo = 0;
      unit.cargoType = null;
      unit.order.target = nearestResource(unit, preferredGatherType(unit.faction));
    }
    return;
  }
  if (!unit.order.target || unit.order.target.amount <= 0 || unit.order.target.kind !== "resource") {
    unit.order.target = nearestResource(unit, preferredGatherType(unit.faction)) ?? nearestResource(unit);
  }
  const node = unit.order.target;
  if (!node) return;
  const distance = moveToward(unit, node.position, dt, node.radius + 0.35, node);
  if (distance <= node.radius + 0.45) {
    unit.harvestTimer -= dt;
    if (unit.harvestTimer <= 0) {
      unit.harvestTimer = 0.55;
      const boost = 1 + structureCount(unit.faction, "refinery") * 0.12;
      const amount = Math.min(node.amount, 8 * (unit.faction.bonus.gather ?? 1) * boost);
      node.amount -= amount;
      unit.cargo = amount;
      unit.cargoType = node.type;
      node.group.scale.setScalar(clamp(node.amount / node.maxAmount, 0.28, 1));
      if (node.amount <= 0) {
        resourceGroup.remove(node.group);
      }
    }
  }
}

function updateCombatUnit(unit, dt) {
  if (unit.order.type === "move" && unit.order.point) {
    const threat = nearestEnemyEntity(unit.position, unit.faction, unit.type === "siege" ? 9 : 5.5);
    if (threat) unit.order = { type: "attack", target: threat };
    else {
      moveToward(unit, unit.order.point, dt, 0.9);
      return;
    }
  }
  if (unit.order.type === "attack" && (!unit.order.target || !unit.order.target.alive)) {
    unit.order.target = nearestEnemyEntity(unit.position, unit.faction, 18) ?? enemyHqTarget(unit.faction);
  }
  if (unit.order.type === "guard") {
    const threat = nearestEnemyEntity(unit.position, unit.faction, 12);
    if (threat) unit.order = { type: "attack", target: threat };
    else {
      const home = unit.faction.rallyPoint ?? unit.faction.hq.position;
      moveToward(unit, home, dt, 2.4);
      return;
    }
  }
  const target = unit.order.target ?? nearestEnemyEntity(unit.position, unit.faction, 12);
  if (!target) return;
  const stop = unit.range + (target.radius ?? 0.5) + 0.08;
  const distance = moveToward(unit, target.position, dt, stop, target);
  if (distance <= stop + 0.2) {
    unit.attackTimer -= dt;
    if (unit.attackTimer <= 0) {
      unit.attackTimer = unit.cooldown;
      createProjectile(unit, target);
    }
  }
}

function createProjectile(source, target) {
  const material = new THREE.MeshBasicMaterial({ color: source.faction.accent });
  const mesh = new THREE.Mesh(shotGeometry, material);
  mesh.position.copy(source.position);
  mesh.position.y += 0.55;
  effectGroup.add(mesh);
  projectiles.push({
    mesh,
    source,
    target,
    damage: source.damage,
    faction: source.faction,
    speed: source.type === "siege" ? 14 : 18,
    splash: UNIT_TYPES[source.type]?.splash ?? 0,
    alive: true,
  });
}

function updateProjectiles(dt) {
  for (const projectile of projectiles) {
    if (!projectile.alive || !projectile.target?.alive) {
      projectile.alive = false;
      effectGroup.remove(projectile.mesh);
      continue;
    }
    tmpVec.copy(projectile.target.position).add(new THREE.Vector3(0, projectile.target.kind === "structure" ? 1.2 : 0.55, 0)).sub(projectile.mesh.position);
    if (tmpVec.lengthSq() < 0.22) {
      projectile.alive = false;
      damageEntity(projectile.target, projectile.damage, projectile.faction);
      if (projectile.splash > 0) {
        for (const unit of units) {
          if (!unit.alive || unit.faction === projectile.faction || unit === projectile.target) continue;
          if (unit.position.distanceToSquared(projectile.target.position) < projectile.splash * projectile.splash) {
            damageEntity(unit, projectile.damage * 0.36, projectile.faction);
          }
        }
      }
      createHit(projectile.target.position, projectile.faction.accent);
      effectGroup.remove(projectile.mesh);
      continue;
    }
    projectile.mesh.position.addScaledVector(tmpVec.normalize(), projectile.speed * dt);
  }
  for (let i = projectiles.length - 1; i >= 0; i -= 1) {
    if (!projectiles[i].alive) projectiles.splice(i, 1);
  }
}

function createHit(position, color) {
  const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8 });
  for (let i = 0; i < 4; i += 1) {
    const mesh = new THREE.Mesh(cubeGeometry, material);
    mesh.position.set(position.x + rand(-0.25, 0.25), sampleTerrainHeight(position.x, position.z) + rand(0.5, 1.2), position.z + rand(-0.25, 0.25));
    mesh.scale.setScalar(rand(0.08, 0.18));
    mesh.userData.life = rand(0.28, 0.5);
    mesh.userData.velocity = new THREE.Vector3(rand(-1, 1), rand(1, 2), rand(-1, 1));
    effectGroup.add(mesh);
  }
}

function updateEffects(dt) {
  for (const child of [...effectGroup.children]) {
    if (!child.userData.life) continue;
    child.userData.life -= dt;
    child.position.addScaledVector(child.userData.velocity, dt);
    child.material.opacity = clamp(child.userData.life * 2, 0, 1);
    if (child.userData.life <= 0) effectGroup.remove(child);
  }
}

function damageEntity(entity, amount, sourceFaction) {
  if (!entity?.alive) return;
  entity.hp -= amount;
  if (entity.healthBar) updateHealthBar(entity);
  if (entity.hp > 0) return;
  entity.alive = false;
  if (entity.kind === "unit") {
    unitGroup.remove(entity.sprite, entity.shadow, entity.selectRing);
    if (entity.faction.player) game.stats.losses += 1;
    if (sourceFaction?.player && entity.faction !== sourceFaction) game.stats.kills += 1;
  } else if (entity.kind === "structure") {
    structureGroup.remove(entity.group, entity.selectRing, entity.healthBar);
    blockers.forEach((blocker) => {
      if (blocker.owner === entity) blocker.owner.alive = false;
    });
    if (entity.type === "hq") {
      entity.faction.defeated = true;
      entity.faction.units.forEach((unit) => {
        if (unit.alive) unit.order = { type: "attack", target: sourceFaction?.hq ?? null };
      });
      logEvent(`${entity.faction.shortName} HQ has fallen.`);
    }
    if (sourceFaction?.player && entity.faction !== sourceFaction) game.stats.kills += 3;
  }
  createHit(entity.position, sourceFaction?.accent ?? 0xffffff);
  game.selected = game.selected.filter((item) => item !== entity);
  updateSelectionVisuals();
}

function updateUnits(dt) {
  for (const unit of units) {
    if (!unit.alive) continue;
    unit.velocity.multiplyScalar(0.72);
    if (unit.role === "worker") updateWorker(unit, dt);
    else updateCombatUnit(unit, dt);
    unit.sprite.material.rotation = Math.sin(game.time * 4 + unit.frameSeed) * 0.02;
  }
  for (let i = units.length - 1; i >= 0; i -= 1) {
    if (!units[i].alive) units.splice(i, 1);
  }
}

function updateStructures(dt) {
  for (const faction of factions) {
    for (const structure of faction.structures) {
      if (!structure.alive) continue;
      const definition = BUILDING_TYPES[structure.type];
      if (definition.income) {
        for (const [key, value] of Object.entries(definition.income)) {
          faction.resources[key] += value * dt * (faction.bonus.power ?? 1);
        }
      }
      if (!definition.weaponRange) continue;
      structure.reload -= dt;
      if (structure.reload > 0) continue;
      const target = nearestEnemyEntity(structure.position, faction, definition.weaponRange);
      if (!target) continue;
      structure.reload = definition.cooldown;
      const material = new THREE.MeshBasicMaterial({ color: faction.accent });
      const mesh = new THREE.Mesh(shotGeometry, material);
      mesh.position.copy(structure.position);
      mesh.position.y += structureFireHeight(structure.type);
      effectGroup.add(mesh);
      projectiles.push({
        mesh,
        source: structure,
        target,
        damage: definition.weaponDamage,
        faction,
        speed: 18,
        splash: 0,
        alive: true,
      });
    }
  }
}

function findBuildSpot(faction, type) {
  const hq = faction.hq;
  const baseRadius = structureCount(faction) < 4 ? 7 : 11;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const ring = baseRadius + Math.floor(attempt / 16) * 3 + rand(-1, 1);
    const angle = attempt * 2.399 + rand(-0.35, 0.35);
    const x = clamp(hq.position.x + Math.cos(angle) * ring, -HALF_MAP + 4, HALF_MAP - 4);
    const z = clamp(hq.position.z + Math.sin(angle) * ring, -HALF_MAP + 4, HALF_MAP - 4);
    if (isWater(x, z)) continue;
    const radius = BUILDING_TYPES[type].radius + 1.8;
    const occupied = structures.some((structure) => structure.alive && distSq2(x, z, structure.position.x, structure.position.z) < (radius + structure.radius) ** 2);
    if (occupied) continue;
    return { x, z };
  }
  return null;
}

function requestBuild(faction, type) {
  if (!BUILDING_TYPES[type]?.cost) return null;
  const spot = findBuildSpot(faction, type);
  if (!spot) return null;
  const structure = createStructure(type, faction, spot.x, spot.z);
  if (structure) {
    faction.tech = Math.max(faction.tech, faction.structures.filter((item) => item.alive && item.type === "academy").length);
    if (faction.player) showMessage(`${BUILDING_TYPES[type].name} online`);
  }
  return structure;
}

function requestTrain(faction, type) {
  const definition = UNIT_TYPES[type];
  if (!definition) return null;
  const source = faction.structures.find((structure) => structure.alive && definition.trainAt.includes(structure.type));
  if (!source) return null;
  const unit = trainUnit(type, faction, source);
  if (unit && faction.player) showMessage(`${definition.name} ready`);
  return unit;
}

function thinkFaction(faction, dt) {
  if (faction.defeated) return;
  faction.nextThink -= dt;
  faction.waveTimer -= dt;
  if (faction.nextThink > 0) return;
  faction.nextThink = THINK_INTERVAL + rand(-0.5, 0.65);
  const directive = DIRECTIVES[faction.player ? game.directive : faction.directive];
  faction.directive = faction.player ? game.directive : faction.directive;
  faction.tech = faction.structures.filter((structure) => structure.alive && structure.type === "academy").length;

  if (unitCount(faction, "worker") < directive.workers) requestTrain(faction, "worker");
  if (structureCount(faction, "refinery") < Math.ceil(directive.workers / 8)) requestBuild(faction, "refinery");
  if (!hasStructure(faction, "barracks")) requestBuild(faction, "barracks");
  if (structureCount(faction, "solar") < Math.max(1, directive.tech)) requestBuild(faction, "solar");
  if (directive.defense > structureCount(faction, "turret")) requestBuild(faction, "turret");
  if (directive.tech > 1 && !hasStructure(faction, "academy")) requestBuild(faction, "academy");

  const army = armyUnits(faction);
  const targetArmy = directive.army;
  if (hasStructure(faction, "barracks") && army.length < targetArmy) {
    requestTrain(faction, Math.random() < 0.24 ? "scout" : "soldier");
  }
  if (hasStructure(faction, "academy") && faction.tech > 0 && army.length > 5 && Math.random() < 0.55) {
    requestTrain(faction, "siege");
  }

  const threat = nearestEnemyEntity(faction.hq.position, faction, 14);
  if (threat) {
    for (const unit of army) {
      if (unit.position.distanceToSquared(faction.hq.position) < 360) unit.order = { type: "attack", target: threat };
    }
  }

  const ready = armyUnits(faction);
  if (faction.waveTimer <= 0 && ready.length >= Math.max(5, Math.floor(targetArmy * 0.5)) && Math.random() < directive.aggression) {
    const target = enemyHqTarget(faction);
    if (target) {
      const count = Math.min(ready.length, Math.max(5, Math.floor(ready.length * 0.72)));
      for (const unit of ready.slice(0, count)) unit.order = { type: "attack", target };
      faction.waveTimer = lerp(42, 18, directive.aggression) + rand(0, 14);
      logEvent(`${faction.shortName} launches a strike at ${target.faction.shortName}.`);
    }
  }
}

function updateFactions(dt) {
  for (const faction of factions) thinkFaction(faction, dt);
}

function checkWinner() {
  if (game.winner) return;
  const alive = factions.filter((faction) => !faction.defeated && faction.hq?.alive);
  if (alive.length === 1 && game.started) {
    game.winner = alive[0];
    winnerReadout.textContent = `${alive[0].shortName} victory`;
    showMessage(`${alive[0].name} controls the map`);
    logEvent(`${alive[0].name} wins the skirmish.`);
    const stats = loadStats();
    stats.sessions += 1;
    stats.bestTime = Math.max(stats.bestTime, game.time);
    stats.bestKills = Math.max(stats.bestKills, game.stats.kills);
    if (alive[0].player) stats.wins += 1;
    saveStats(stats);
    updateMenuStats();
  }
}

function screenToWorld(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  pointerNdc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  pointerNdc.y = -(((clientY - rect.top) / rect.height) * 2 - 1);
  raycaster.setFromCamera(pointerNdc, camera);
  const hit = raycaster.ray.intersectPlane(groundPlane, tmpPoint);
  if (!hit) return null;
  tmpPoint.x = clamp(tmpPoint.x, -HALF_MAP, HALF_MAP);
  tmpPoint.z = clamp(tmpPoint.z, -HALF_MAP, HALF_MAP);
  tmpPoint.y = sampleTerrainHeight(tmpPoint.x, tmpPoint.z);
  return tmpPoint.clone();
}

function entityAtScreen(clientX, clientY) {
  const point = screenToWorld(clientX, clientY);
  if (!point) return null;
  let best = null;
  let bestScore = Infinity;
  const candidates = [...units, ...structures, ...resourceNodes];
  for (const entity of candidates) {
    if (entity.alive === false || entity.amount === 0) continue;
    const radius = (entity.radius ?? 0.6) + 0.55;
    const score = distSq2(point.x, point.z, entity.position.x, entity.position.z);
    if (score < radius * radius && score < bestScore) {
      bestScore = score;
      best = entity;
    }
  }
  return best;
}

function selectEntities(entities, additive = false) {
  if (!additive) game.selected = [];
  for (const entity of entities) {
    if (!entity || entity.faction !== playerFaction || entity.alive === false) continue;
    if (!game.selected.includes(entity)) game.selected.push(entity);
  }
  updateSelectionVisuals();
  updateSelectedPanel();
}

function updateSelectionVisuals() {
  for (const unit of units) unit.selectRing.visible = game.selected.includes(unit);
  for (const structure of structures) {
    structure.selectRing.visible = game.selected.includes(structure);
    structure.selectRing.material = structure.faction === playerFaction ? materials.selection : materials.enemySelection;
  }
}

function selectInBox(x0, y0, x1, y1) {
  const minX = Math.min(x0, x1);
  const maxX = Math.max(x0, x1);
  const minY = Math.min(y0, y1);
  const maxY = Math.max(y0, y1);
  const selected = [];
  for (const unit of playerFaction.units) {
    if (!unit.alive) continue;
    const projected = unit.position.clone().project(camera);
    const sx = (projected.x * 0.5 + 0.5) * window.innerWidth;
    const sy = (-projected.y * 0.5 + 0.5) * window.innerHeight;
    if (sx >= minX && sx <= maxX && sy >= minY && sy <= maxY) selected.push(unit);
  }
  selectEntities(selected);
}

function issueOrder(point, target = null) {
  const selectedUnits = game.selected.filter((entity) => entity.kind === "unit" && entity.alive);
  const selectedStructures = game.selected.filter((entity) => entity.kind === "structure" && entity.alive);
  if (selectedUnits.length === 0 && selectedStructures.length > 0 && point) {
    for (const structure of selectedStructures) structure.rallyPoint.copy(point);
    showMessage("Rally point set");
    return;
  }
  if (selectedUnits.length === 0) return;
  if (target && target.faction !== playerFaction && target.kind !== "resource") {
    for (const unit of selectedUnits) unit.order = { type: "attack", target };
    showMessage("Attack order issued");
    return;
  }
  if (target?.kind === "resource") {
    for (const unit of selectedUnits.filter((unit) => unit.role === "worker")) {
      unit.order = { type: "gather", target };
      unit.cargo = 0;
      unit.cargoType = null;
    }
    showMessage("Workers assigned");
    return;
  }
  selectedUnits.forEach((unit, index) => {
    const side = Math.ceil(Math.sqrt(selectedUnits.length));
    const ox = (index % side - (side - 1) / 2) * 0.9;
    const oz = (Math.floor(index / side) - (side - 1) / 2) * 0.9;
    unit.order = { type: "move", point: new THREE.Vector3(point.x + ox, 0, point.z + oz), target: null };
  });
  showMessage("Move order issued");
}

function orderSelectedAttack() {
  const selectedUnits = game.selected.filter((entity) => entity.kind === "unit" && entity.role === "army" && entity.alive);
  const target = enemyHqTarget(playerFaction) ?? nearestEnemyEntity(playerFaction.hq.position, playerFaction);
  if (!target || selectedUnits.length === 0) return;
  for (const unit of selectedUnits) unit.order = { type: "attack", target };
  showMessage("Selected army attacking");
}

function orderSelectedDefend() {
  const selectedUnits = game.selected.filter((entity) => entity.kind === "unit" && entity.alive);
  const point = playerFaction.hq.position.clone();
  for (const unit of selectedUnits.length ? selectedUnits : armyUnits(playerFaction)) {
    unit.order = { type: "guard", point };
  }
  showMessage("Defensive posture");
}

function startSelectionBox(x, y) {
  selectionBox.classList.remove("hidden");
  selectionBox.style.left = `${x}px`;
  selectionBox.style.top = `${y}px`;
  selectionBox.style.width = "0px";
  selectionBox.style.height = "0px";
}

function updateSelectionBox(x0, y0, x1, y1) {
  selectionBox.style.left = `${Math.min(x0, x1)}px`;
  selectionBox.style.top = `${Math.min(y0, y1)}px`;
  selectionBox.style.width = `${Math.abs(x1 - x0)}px`;
  selectionBox.style.height = `${Math.abs(y1 - y0)}px`;
}

function hideSelectionBox() {
  selectionBox.classList.add("hidden");
}

function onPointerDown(event) {
  if (!game.started || document.body.classList.contains("menu-open")) return;
  const startEntity = entityAtScreen(event.clientX, event.clientY);
  const leftButton = event.button === 0;
  const rightButton = event.button === 2;
  if (!leftButton && !rightButton) return;
  pointer.active = true;
  pointer.id = event.pointerId;
  pointer.button = event.button;
  pointer.startX = event.clientX;
  pointer.startY = event.clientY;
  pointer.x = event.clientX;
  pointer.y = event.clientY;
  pointer.moved = false;
  pointer.startEntity = startEntity;
  pointer.selecting = leftButton;
  pointer.panning = rightButton;
  if (pointer.selecting) startSelectionBox(event.clientX, event.clientY);
  if (pointer.selecting) canvas.classList.add("selecting");
  if (pointer.panning) canvas.classList.add("panning");
  if (pointer.panning || event.button !== 0) event.preventDefault();
  canvas.setPointerCapture?.(event.pointerId);
}

function onPointerMove(event) {
  if (pointer.active && pointer.id !== null && event.pointerId !== pointer.id) return;
  if (!pointer.active) {
    if (event.target === canvas) hoverEntity = entityAtScreen(event.clientX, event.clientY);
    return;
  }
  if (!pointer.active) return;
  const dx = event.clientX - pointer.x;
  const dy = event.clientY - pointer.y;
  const totalDx = event.clientX - pointer.startX;
  const totalDy = event.clientY - pointer.startY;
  pointer.moved = pointer.moved || Math.hypot(totalDx, totalDy) > 5;
  pointer.x = event.clientX;
  pointer.y = event.clientY;
  if (pointer.panning) {
    if (pointer.moved) panCamera(dx, dy);
    event.preventDefault();
    return;
  }
  hoverEntity = entityAtScreen(event.clientX, event.clientY);
  if (pointer.selecting) updateSelectionBox(pointer.startX, pointer.startY, event.clientX, event.clientY);
}

function onPointerUp(event) {
  if (!pointer.active) return;
  if (pointer.id !== null && event.pointerId !== pointer.id) return;
  const wasSelecting = pointer.selecting;
  const wasPanning = pointer.panning;
  pointer.active = false;
  pointer.id = null;
  pointer.selecting = false;
  pointer.panning = false;
  try {
    canvas.releasePointerCapture?.(event.pointerId);
  } catch {
    // The browser may already release capture after a context-menu/right-button gesture.
  }
  canvas.classList.remove("panning", "selecting");
  hideSelectionBox();
  if (wasSelecting) {
    if (pointer.moved) selectInBox(pointer.startX, pointer.startY, event.clientX, event.clientY);
    else selectEntities([entityAtScreen(event.clientX, event.clientY)], event.shiftKey);
  } else if (wasPanning && !pointer.moved) {
    const point = screenToWorld(event.clientX, event.clientY);
    const target = entityAtScreen(event.clientX, event.clientY);
    if (pointer.button === 2) issueOrder(point, target);
  }
  pointer.startEntity = null;
}

function panCamera(dx, dy) {
  const scale = cameraState.distance / Math.min(window.innerWidth, window.innerHeight) * 0.72;
  const forward = new THREE.Vector3(Math.sin(ISO_YAW), 0, Math.cos(ISO_YAW)).normalize();
  const right = new THREE.Vector3(forward.z, 0, -forward.x).normalize();
  cameraState.target.addScaledVector(right, dx * scale);
  cameraState.target.addScaledVector(forward, -dy * scale);
  cameraState.target.x = clamp(cameraState.target.x, -HALF_MAP + 8, HALF_MAP - 8);
  cameraState.target.z = clamp(cameraState.target.z, -HALF_MAP + 8, HALF_MAP - 8);
}

function updateKeyboardCamera(dt) {
  const speed = cameraState.distance * dt * 0.42;
  const forward = new THREE.Vector3(Math.sin(ISO_YAW), 0, Math.cos(ISO_YAW)).normalize();
  const right = new THREE.Vector3(forward.z, 0, -forward.x).normalize();
  if (keys.has("KeyW") || keys.has("ArrowUp")) cameraState.target.addScaledVector(forward, speed);
  if (keys.has("KeyS") || keys.has("ArrowDown")) cameraState.target.addScaledVector(forward, -speed);
  if (keys.has("KeyA") || keys.has("ArrowLeft")) cameraState.target.addScaledVector(right, -speed);
  if (keys.has("KeyD") || keys.has("ArrowRight")) cameraState.target.addScaledVector(right, speed);
  cameraState.target.x = clamp(cameraState.target.x, -HALF_MAP + 8, HALF_MAP - 8);
  cameraState.target.z = clamp(cameraState.target.z, -HALF_MAP + 8, HALF_MAP - 8);
}

function updateCamera() {
  const direction = new THREE.Vector3(
    Math.sin(ISO_YAW) * Math.cos(ISO_PITCH),
    Math.sin(ISO_PITCH),
    Math.cos(ISO_YAW) * Math.cos(ISO_PITCH),
  );
  tmpCameraLook.copy(cameraState.target);
  tmpCameraLook.y = CAMERA_LOOK_HEIGHT;
  camera.position.copy(tmpCameraLook).addScaledVector(direction, cameraState.distance);
  camera.lookAt(tmpCameraLook);
}

function zoomCamera(factor) {
  cameraState.distance = clamp(cameraState.distance * factor, MIN_ZOOM, MAX_ZOOM);
  updateCamera();
}

function resetCamera() {
  cameraState.target.copy(playerFaction?.hq?.position ?? new THREE.Vector3(0, 0, 0));
  cameraState.target.y = CAMERA_LOOK_HEIGHT;
  cameraState.distance = 82;
  updateCamera();
}

function setDirective(id) {
  game.directive = id;
  if (playerFaction) playerFaction.directive = id;
  directiveReadout.textContent = DIRECTIVES[id].label;
  for (const button of directiveButtons.querySelectorAll("button")) {
    button.classList.toggle("active", button.dataset.directive === id);
  }
  if (game.started) logEvent(`Doctrine changed to ${DIRECTIVES[id].label}.`);
}

function showMessage(text) {
  battleMessage.textContent = text;
  battleMessage.classList.add("show");
  game.lastMessageAt = game.time;
}

function updateMessage() {
  if (battleMessage.classList.contains("show") && game.time - game.lastMessageAt > 1.6) {
    battleMessage.classList.remove("show");
  }
}

function logEvent(text, reset = false) {
  if (reset) eventLog.innerHTML = "";
  const li = document.createElement("li");
  li.textContent = `${formatTime(game.time)}  ${text}`;
  eventLog.prepend(li);
  while (eventLog.children.length > 9) eventLog.lastElementChild.remove();
}

function updateSelectedPanel() {
  selectedCount.textContent = game.selected.length;
  if (game.selected.length === 0) {
    selectedTitle.textContent = "No selection";
    selectedBody.textContent = "Left-click or drag-select your units. Right-click the map or an enemy to issue direct orders.";
    return;
  }
  if (game.selected.length > 1) {
    const workers = game.selected.filter((entity) => entity.type === "worker").length;
    const army = game.selected.filter((entity) => entity.kind === "unit" && entity.role === "army").length;
    selectedTitle.textContent = `${game.selected.length} selected`;
    selectedBody.textContent = `${workers} workers, ${army} army units. Right-click resources, enemies, or terrain to override the AFK brain.`;
    return;
  }
  const entity = game.selected[0];
  if (entity.kind === "unit") {
    selectedTitle.textContent = `${entity.name}`;
    const order = entity.order?.type ? entity.order.type.replace("-", " ") : "idle";
    selectedBody.textContent = `${entity.faction.name}. HP ${Math.max(0, Math.ceil(entity.hp))}/${entity.maxHp}. Current order: ${order}.`;
  } else {
    selectedTitle.textContent = `${entity.name}`;
    selectedBody.textContent = `${entity.faction.name}. HP ${Math.max(0, Math.ceil(entity.hp))}/${entity.maxHp}. Right-click terrain to set its rally point.`;
  }
}

function updateUI(force = false) {
  uiTimer -= force ? UI_INTERVAL : 0;
  if (uiTimer > 0 && !force) return;
  uiTimer = UI_INTERVAL;
  const player = playerFaction;
  civName.textContent = player.name;
  foodReadout.textContent = resourceText(player.resources.food);
  oreReadout.textContent = resourceText(player.resources.ore);
  powerReadout.textContent = resourceText(player.resources.power);
  supplyReadout.textContent = `${currentSupply(player)} / ${supplyCap(player)}`;
  const hqPct = player.hq?.alive ? clamp(player.hq.hp / player.hq.maxHp, 0, 1) : 0;
  hqReadout.textContent = `${Math.round(hqPct * 100)}%`;
  hqMeter.style.width = `${hqPct * 100}%`;
  timeReadout.textContent = formatTime(game.time);
  const workers = unitCount(player, "worker");
  const army = armyUnits(player).length;
  workerReadout.textContent = workers;
  armyReadout.textContent = `${army} army`;
  buildingReadout.textContent = player.structures.filter((item) => item.alive).length;
  killsReadout.textContent = game.stats.kills;
  lossesReadout.textContent = game.stats.losses;
  const alive = factions.filter((faction) => !faction.defeated).length;
  aliveReadout.textContent = `${alive} alive`;
  winnerReadout.textContent = game.winner ? `${game.winner.shortName} victory` : "Skirmish";
  civList.innerHTML = factions
    .map((faction) => {
      const liveUnits = faction.units.filter((unit) => unit.alive).length;
      const hq = faction.hq?.alive ? Math.round((faction.hq.hp / faction.hq.maxHp) * 100) : 0;
      return `
        <div class="civ-row">
          <span class="civ-dot" style="background:${colorHex(faction.color)}"></span>
          <div><strong>${faction.shortName}</strong><span>${liveUnits} units | HQ ${hq}%</span></div>
          <span>${faction.defeated ? "Out" : DIRECTIVES[faction.directive].label.split(" ")[0]}</span>
        </div>
      `;
    })
    .join("");
  statTime.textContent = formatTime(game.time);
  statKills.textContent = game.stats.kills;
  statLosses.textContent = game.stats.losses;
  statBuildings.textContent = game.stats.buildingsBuilt;
  statArmy.textContent = army;
  statWorkers.textContent = workers;
  updateSelectedPanel();
  updateCommandButtons();
}

function updateCommandButtons() {
  for (const button of document.querySelectorAll("[data-build]")) {
    const type = button.dataset.build;
    button.disabled = !canPay(playerFaction, BUILDING_TYPES[type].cost);
    button.title = costTitle(BUILDING_TYPES[type].cost);
  }
  for (const button of document.querySelectorAll("[data-train]")) {
    const type = button.dataset.train;
    const definition = UNIT_TYPES[type];
    const source = playerFaction.structures.some((structure) => structure.alive && definition.trainAt.includes(structure.type));
    button.disabled =
      !source ||
      currentSupply(playerFaction) + definition.supply > supplyCap(playerFaction) ||
      (definition.requiresTech ?? 0) > playerFaction.tech ||
      !canPay(playerFaction, adjustedUnitCost(type, playerFaction));
    button.title = source ? costTitle(adjustedUnitCost(type, playerFaction)) : `Needs ${definition.trainAt.map((item) => BUILDING_TYPES[item].name).join(" or ")}`;
  }
}

function costTitle(cost = {}) {
  const entries = Object.entries(cost);
  if (entries.length === 0) return "Free";
  return entries.map(([key, value]) => `${key}: ${value}`).join(", ");
}

function loadStats() {
  try {
    return JSON.parse(localStorage.getItem(SAVE_KEY)) ?? { sessions: 0, bestTime: 0, bestKills: 0, wins: 0 };
  } catch {
    return { sessions: 0, bestTime: 0, bestKills: 0, wins: 0 };
  }
}

function saveStats(stats) {
  localStorage.setItem(SAVE_KEY, JSON.stringify(stats));
}

function updateMenuStats() {
  const stats = loadStats();
  menuSessions.textContent = stats.sessions ?? 0;
  menuBestTime.textContent = formatTime(stats.bestTime ?? 0);
  menuBestKills.textContent = stats.bestKills ?? 0;
  menuWins.textContent = stats.wins ?? 0;
}

function setMenuOpen(open) {
  document.body.classList.toggle("menu-open", open);
}

function setPaused(paused, showPauseMenu = false) {
  game.paused = paused;
  pauseToggle.innerHTML = paused ? '<i data-lucide="play"></i>' : '<i data-lucide="pause"></i>';
  pauseToggle.setAttribute("aria-label", paused ? "Resume" : "Pause");
  pauseToggle.setAttribute("title", paused ? "Resume" : "Pause");
  createIcons({
    icons: { Play, Pause },
  });
  pauseMenu.classList.toggle("hidden", !showPauseMenu);
  setMenuOpen(showPauseMenu || !game.started);
}

function startGame() {
  resetWorld();
  game.started = true;
  game.paused = false;
  game.stats.sessions += 1;
  mainMenu.classList.add("hidden");
  pauseMenu.classList.add("hidden");
  setMenuOpen(false);
  setPaused(false);
  showMessage("AFK simulation running");
}

function exitToMenu() {
  game.started = false;
  game.paused = true;
  mainMenu.classList.remove("hidden");
  pauseMenu.classList.add("hidden");
  setMenuOpen(true);
  updateMenuStats();
}

function togglePause() {
  if (!game.started) return;
  if (game.paused) setPaused(false);
  else setPaused(true, true);
}

function bindEvents() {
  canvas.addEventListener("contextmenu", (event) => event.preventDefault());
  canvas.addEventListener("auxclick", (event) => event.preventDefault());
  canvas.addEventListener("pointerdown", onPointerDown);
  window.addEventListener("pointermove", onPointerMove, { passive: false });
  window.addEventListener("pointerup", onPointerUp);
  window.addEventListener("pointercancel", onPointerUp);
  canvas.addEventListener("wheel", (event) => {
    event.preventDefault();
    zoomCamera(event.deltaY > 0 ? 1.08 : 0.92);
  }, { passive: false });
  window.addEventListener("keydown", (event) => {
    keys.add(event.code);
    if (event.code === "Space") {
      event.preventDefault();
      togglePause();
    }
  });
  window.addEventListener("keyup", (event) => keys.delete(event.code));
  window.addEventListener("resize", () => {
    renderer.setPixelRatio(Math.min(MAX_PIXEL_RATIO, window.devicePixelRatio || 1));
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    updateCamera();
  });
  resetViewButton.addEventListener("click", resetCamera);
  zoomInButton.addEventListener("click", () => zoomCamera(0.86));
  zoomOutButton.addEventListener("click", () => zoomCamera(1.14));
  pauseToggle.addEventListener("click", togglePause);
  startSkirmishButton.addEventListener("click", startGame);
  resumeGameButton.addEventListener("click", () => setPaused(false));
  restartGameButton.addEventListener("click", startGame);
  exitToMenuButton.addEventListener("click", exitToMenu);
  directiveButtons.addEventListener("click", (event) => {
    const button = event.target.closest("[data-directive]");
    if (button) setDirective(button.dataset.directive);
  });
  document.querySelectorAll("[data-build]").forEach((button) => {
    button.addEventListener("click", () => requestBuild(playerFaction, button.dataset.build));
  });
  document.querySelectorAll("[data-train]").forEach((button) => {
    button.addEventListener("click", () => requestTrain(playerFaction, button.dataset.train));
  });
  attackOrderButton.addEventListener("click", orderSelectedAttack);
  defendOrderButton.addEventListener("click", orderSelectedDefend);
}

function animate() {
  requestAnimationFrame(animate);
  let dt = Math.min(clock.getDelta(), 0.05);
  if (!game.started || game.paused) dt = 0;
  if (dt > 0) {
    game.time += dt;
    updateKeyboardCamera(dt);
    updateFactions(dt);
    updateStructures(dt);
    updateUnits(dt);
    updateProjectiles(dt);
    updateEffects(dt);
    checkWinner();
    updateMessage();
  }
  if (skySphere) skySphere.rotation.y += (dt || 0.002) * 0.01;
  updateCamera();
  uiTimer -= dt || 0.016;
  updateUI();
  renderer.render(scene, camera);
}

function init() {
  initMaterials();
  createSkybox();
  createLighting();
  createTerrain();
  resetWorld();
  game.started = false;
  game.paused = true;
  mainMenu.classList.remove("hidden");
  setMenuOpen(true);
  bindEvents();
  updateMenuStats();
  updateUI(true);
  animate();
}

init();
