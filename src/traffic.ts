// traffic.ts: vehicle archetypes, obstacles, pickups, wave patterns, and
// survivable-path validation. Everything here is pooled; nothing allocates
// in the step loop.
//
// The sacred rule lives in canPlace(): before committing a spawn, measure the
// widest continuous corridor across the WHOLE road among everything that will
// reach the player at the same time, and refuse the spawn if that corridor is
// under minCorridorMult player widths. Two things matter here. Shoulders count
// (parked guaguas and vendor carts narrow the road just as much), and grouping
// is by arrival time, not by z: oncoming traffic closes at three times the
// speed of same-direction traffic, so vehicles far apart in z can still land
// on you together, and vehicles side by side in z often never do.

import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { CONFIG, PALETTE, ROAD } from './config';
import { toonMaterial, textTexture, worldMaterial, paint, vcToonMaterial } from './world';

export type VehicleType = 'sedan' | 'guagua' | 'camion' | 'civic' | 'motoconcho' | 'guaguaParada' | 'cart';
export type PowerupKind = 'cafecito' | 'bendicion' | 'iman';
export type PatternKind = 'convoy' | 'zigzag' | 'guaguaStop' | 'oncomingSwarm' | 'breather' | 'hoyoField';
// Set pieces: the named moments of a run. Announced ones reach the HUD
// through TrafficEvents.onSetPiece.
export type SetPieceKind =
  | 'guaguaLenta'
  | 'tapon'
  | 'parada'
  | 'caravana'
  | 'camionPlatanos'
  | 'calleEstrecha'
  | 'horaPico';
type Tramo = keyof typeof CONFIG.tramoVehicleWeights;

export interface TrafficEvents {
  // clearance: meters between the rider's circle and the vehicle's hitbox at the pass
  onNearMiss(x: number, z: number, clearance: number): void;
  onPlatano(x: number, y: number, z: number): void;
  onPowerup(kind: PowerupKind, x: number, z: number): void;
  onHoyo(): void;
  onPolicia(): void;
  onCharco(): void;
  onRebase(x: number, z: number): void; // a car starts el rebase: its bocinazo is the telegraph
  onHornBehind(x: number): void; // a car caught behind a slower rider honks instead of rear-ending
  onSetPiece(kind: SetPieceKind): void; // an announced set piece is on its way
  onEscalate(tier: number): void; // the street got harder (tier 1 and up)
}

export interface StepCtx {
  ds: number;
  dt: number;
  elapsed: number;
  speed: number;
  playerX: number;
  playerY: number;
  playerR: number; // collision circle, scaled per vehicle
  playerCv: boolean; // riding en contra via: oncoming filler starts hunting
  live: boolean; // gameplay interactions only while actually playing
  airborne: boolean;
  wheelie: boolean;
  magnet: boolean;
  runDist: number; // meters into this run: escalation follows the distance tiers
  shielded: boolean; // the Bendición is up: the power-up bag skips a second one
  cafecito: boolean; // the cafecito is burning: el río de plátanos
}

interface Vehicle {
  type: VehicleType;
  group: THREE.Group;
  active: boolean;
  lane: number; // 0..3 driving lanes, -1 = right shoulder, 4 = sea shoulder
  baseX: number;
  x: number;
  z: number;
  dir: 1 | -1;
  speed: number;
  cruise: number; // the speed it wants; following can hold it below, never above
  halfW: number;
  halfL: number;
  passed: boolean;
  driftPhase: number;
  driftAmp: number;
  overtakeT: number; // seconds into an overtake swing; <0 means not swinging
  blinkers: THREE.Object3D[];
  threat: boolean; // the rider was on its line within nearMissThreatSec of the pass
  threatX: number; // rider x the last time it was on that line
  honked: boolean; // already honked at a slow rider ahead (once per vehicle)
  lineN: number; // plátanos still to lay beside it, placed once it nears the fog line
  lineSide: number; // -1 / +1: which side of it the racing line runs
  dropT: number; // >= 0: el camión botando plátanos, seconds to the next drop
  noRebase: boolean; // set pieces and line motoconchos never swing onto the seam
}

// Read-only views for tests and the traffic lab.
export interface VehicleView {
  readonly type: VehicleType;
  readonly active: boolean;
  readonly lane: number;
  readonly x: number;
  readonly z: number;
  readonly dir: 1 | -1;
  readonly speed: number;
  readonly halfW: number;
  readonly halfL: number;
  readonly overtakeT: number;
}

export interface PickupView {
  readonly kind: PickupKind;
  readonly active: boolean;
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface TrafficStats {
  spawnAttempts: number;
  corridorRejects: number; // the sacred corridor check said no
  pickupPoolMisses: number; // a pickup could not spawn: the pool was empty
  platanosSpawned: number;
  setPiecesPlaced: number;
}

export type ObstacleKind = 'hoyo' | 'policia' | 'charco';

interface Obstacle {
  kind: ObstacleKind;
  mesh: THREE.Mesh;
  active: boolean;
  x: number;
  z: number;
  armed: boolean;
}

export type PickupKind = 'platano' | PowerupKind;

interface Pickup {
  kind: PickupKind;
  group: THREE.Group;
  active: boolean;
  x: number;
  y: number;
  z: number;
  phase: number;
}

interface TypeAssets {
  painted: THREE.BufferGeometry;
  dark: THREE.BufferGeometry;
  accent?: THREE.BufferGeometry;
  accentColor?: number;
  green?: THREE.BufferGeometry;
  paints: readonly number[];
  halfW: number;
  halfL: number;
  pool: number;
  addExtras?: (group: THREE.Group) => THREE.Object3D[];
}

function box(w: number, h: number, d: number, x: number, y: number, z: number): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  return g;
}

// The big body volumes get soft edges: sharp 90-degree corners are the
// loudest "programmer art" tell there is. Small parts stay crisp boxes.
function rbox(w: number, h: number, d: number, x: number, y: number, z: number, r = 0.09): THREE.BufferGeometry {
  // mergeVertices makes it indexed like BoxGeometry, or mergeGeometries
  // refuses to mix them; identical verts weld, so bevel normals survive
  const g = mergeVertices(new RoundedBoxGeometry(w, h, d, 2, Math.min(r, Math.min(w, h, d) * 0.32)));
  g.translate(x, y, z);
  return g;
}

function cylX(r: number, len: number, x: number, y: number, z: number, seg = 10): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(r, r, len, seg);
  g.rotateZ(Math.PI / 2);
  g.translate(x, y, z);
  return g;
}

function rand(a: number, b: number): number {
  return a + Math.random() * (b - a);
}

function pickWeighted<T>(items: ReadonlyArray<readonly [T, number]>): T {
  let total = 0;
  for (const [, w] of items) total += w;
  let r = Math.random() * total;
  for (const [item, w] of items) {
    r -= w;
    if (r <= 0) return item;
  }
  return items[items.length - 1][0];
}

// ---------------------------------------------------------------------------
// Archetype geometry. Built once per type; pooled groups share the geometry
// and differ only in paint material and small extras.
// ---------------------------------------------------------------------------

function sedanAssets(): TypeAssets {
  const painted = mergeGeometries([
    rbox(1.9, 0.55, 4.4, 0, 0.58, 0, 0.12),
    rbox(1.65, 0.5, 2.1, 0, 1.05, -0.35, 0.14),
  ])!;
  const wheels: THREE.BufferGeometry[] = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) wheels.push(cylX(0.34, 0.24, sx * 0.85, 0.34, sz * 1.4));
  const wind = new THREE.BoxGeometry(1.4, 0.4, 0.08);
  wind.rotateX(-0.18);
  wind.translate(0, 1.05, 0.72);
  const dark = mergeGeometries([...wheels, wind])!;
  // El carro publico: taxi sign on the roof, one mismatched door
  const accent = mergeGeometries([
    box(0.55, 0.16, 0.34, 0, 1.42, -0.1),
    box(0.06, 0.42, 1.1, 0.96, 0.62, 0.5),
  ])!;
  return {
    painted, dark, accent, accentColor: PALETTE.laneDash,
    paints: [0xd6ccc2, 0xd6ccc2, 0xb3d9ff, 0xf2e9dc, 0xa8e6cf],
    halfW: 0.95, halfL: 2.2, pool: 14,
  };
}

function guaguaAssets(banner: THREE.Texture, withBlinkers: boolean): TypeAssets {
  const painted = rbox(2.3, 1.7, 7, 0, 1.35, 0, 0.18);
  const parts: THREE.BufferGeometry[] = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) parts.push(cylX(0.42, 0.28, sx * 0.98, 0.42, sz * 2.5));
  parts.push(box(2.34, 0.55, 5.2, 0, 1.8, -0.5)); // window band
  parts.push(box(2.1, 0.6, 0.1, 0, 1.75, 3.46)); // windshield
  parts.push(box(2.34, 0.28, 0.24, 0, 0.5, 3.5)); // bumper
  parts.push(box(0.08, 0.1, 3.6, -0.95, 2.28, -0.4)); // roof rack rails
  parts.push(box(0.08, 0.1, 3.6, 0.95, 2.28, -0.4));
  const dark = mergeGeometries(parts)!;
  const accent = mergeGeometries([
    box(0.7, 0.42, 0.9, -0.5, 2.53, 0.3), // roof cargo
    box(0.6, 0.5, 0.7, 0.5, 2.56, -1.2),
    box(0.5, 0.36, 0.5, 0.15, 2.5, 1.35),
  ])!;
  return {
    painted, dark, accent, accentColor: PALETTE.laneDash,
    paints: [PALETTE.guaguaYellow],
    halfW: 1.15, halfL: 3.5, pool: withBlinkers ? 3 : 5,
    addExtras: (group) => {
      const refs: THREE.Object3D[] = [];
      // "Dios es mi guia" above the windshield
      const b = new THREE.Mesh(
        new THREE.PlaneGeometry(1.9, 0.3),
        worldMaterial(new THREE.MeshBasicMaterial({ map: banner })),
      );
      b.position.set(0, 2.32, 3.52);
      group.add(b);
      if (withBlinkers) {
        const mat = worldMaterial(new THREE.MeshBasicMaterial({ color: PALETTE.hazardOrange }));
        for (const sx of [-1, 1]) {
          const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.1), mat);
          lamp.position.set(sx * 0.9, 1.0, -3.52);
          group.add(lamp);
          refs.push(lamp);
        }
      }
      return refs;
    },
  };
}

function camionAssets(): TypeAssets {
  const painted = mergeGeometries([
    rbox(2.2, 1.5, 1.7, 0, 1.15, 2.5, 0.14), // cab
    box(2.4, 0.25, 4.3, 0, 0.75, -0.75), // bed
    box(0.08, 0.5, 4.3, -1.16, 1.05, -0.75),
    box(0.08, 0.5, 4.3, 1.16, 1.05, -0.75),
    box(2.4, 0.5, 0.08, 0, 1.05, 1.35),
  ])!;
  const parts: THREE.BufferGeometry[] = [];
  for (const sx of [-1, 1]) for (const zz of [2.6, -0.4, -2.2]) parts.push(cylX(0.4, 0.26, sx * 0.95, 0.4, zz));
  parts.push(box(1.9, 0.55, 0.08, 0, 1.6, 3.36));
  const dark = mergeGeometries(parts)!;
  // Los platanos: two jittered layers on the bed
  const load: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 10; i++) {
    const layer = i < 6 ? 0 : 1;
    load.push(
      box(
        0.55, 0.48, 0.55,
        rand(-0.72, 0.72),
        1.02 + layer * 0.42,
        -0.75 + (layer === 0 ? (i - 2.5) * 0.62 : (i - 7.5) * 0.9),
      ),
    );
  }
  return {
    painted, dark, green: mergeGeometries(load)!,
    paints: [PALETTE.camionOlive],
    halfW: 1.2, halfL: 3.2, pool: 4,
  };
}

function civicAssets(): TypeAssets {
  const painted = mergeGeometries([
    rbox(1.85, 0.42, 4.2, 0, 0.46, 0, 0.11),
    rbox(1.55, 0.36, 1.9, 0, 0.83, -0.15, 0.12),
    box(1.7, 0.07, 0.4, 0, 1.02, -2.0), // el alerón
    box(0.08, 0.26, 0.08, -0.6, 0.85, -1.98),
    box(0.08, 0.26, 0.08, 0.6, 0.85, -1.98),
  ])!;
  const parts: THREE.BufferGeometry[] = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) parts.push(cylX(0.3, 0.26, sx * 0.83, 0.3, sz * 1.35));
  const wind = new THREE.BoxGeometry(1.35, 0.34, 0.07);
  wind.rotateX(-0.22);
  wind.translate(0, 0.86, 0.68);
  parts.push(wind);
  const dark = mergeGeometries(parts)!;
  return {
    painted, dark,
    paints: PALETTE.civicPaints,
    halfW: 0.93, halfL: 2.1, pool: 5,
    addExtras: (group) => {
      const glow = new THREE.Mesh(
        new THREE.PlaneGeometry(2.3, 4.7),
        worldMaterial(
          new THREE.MeshBasicMaterial({ color: PALETTE.underglow, transparent: true, opacity: 0.5 }),
        ),
      );
      glow.rotation.x = -Math.PI / 2;
      glow.position.y = 0.04;
      group.add(glow);
      return [];
    },
  };
}

function motoconchoAssets(withPassenger: boolean): TypeAssets {
  const painted = mergeGeometries([
    box(0.3, 0.28, 1.1, 0, 0.55, 0.05),
    box(0.24, 0.16, 0.4, 0, 0.72, 0.24),
  ])!;
  const parts: THREE.BufferGeometry[] = [
    cylX(0.3, 0.16, 0, 0.3, 0.78),
    cylX(0.3, 0.16, 0, 0.3, -0.72),
    cylX(0.03, 0.5, 0, 0.92, 0.5),
    box(0.3, 0.1, 0.75, 0, 0.72, -0.35),
    box(0.06, 0.4, 0.06, 0, 0.52, 0.72),
  ];
  const dark = mergeGeometries(parts)!;
  // Driver (and sometimes a side-saddle passenger) as the accent geometry;
  // heads are separate skin-toned boxes merged into a second accent... keep it
  // simple: torso+head in one accent geo would share color, so torsos live in
  // accent and heads ride in addExtras with the shared skin material.
  const torsos: THREE.BufferGeometry[] = [box(0.32, 0.46, 0.24, 0, 1.1, -0.02)];
  if (withPassenger) {
    torsos.push(box(0.3, 0.4, 0.22, 0, 1.06, -0.48));
    torsos.push(box(0.42, 0.1, 0.12, 0.26, 0.78, -0.48)); // legs to one side
  }
  const headPos: Array<[number, number, number]> = [[0, 1.47, -0.02]];
  if (withPassenger) headPos.push([0, 1.4, -0.48]);
  return {
    painted, dark,
    accent: mergeGeometries(torsos)!,
    accentColor: 0, // varied per slot below
    paints: [0xe63946, 0x3a5a8c, 0x2a9d8f],
    halfW: 0.4, halfL: 1.05, pool: withPassenger ? 4 : 6,
    addExtras: (group) => {
      const skin = toonMaterial(PALETTE.skin);
      for (const [hx, hy, hz] of headPos) {
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8), skin);
        head.position.set(hx, hy, hz);
        group.add(head);
      }
      return [];
    },
  };
}

function cartAssets(): TypeAssets {
  const painted = mergeGeometries([
    box(1.05, 0.62, 1.5, 0, 0.72, 0),
    box(1.15, 0.08, 1.6, 0, 1.06, 0),
  ])!;
  const dark = mergeGeometries([
    cylX(0.28, 0.12, 0, 0.28, 0.45),
    cylX(0.28, 0.12, 0, 0.28, -0.45),
    box(0.05, 1.5, 0.05, -0.35, 1.6, 0),
  ])!;
  return {
    painted, dark,
    paints: [PALETTE.colmadoTeal, PALETTE.colmadoRed],
    halfW: 0.55, halfL: 0.8, pool: 3,
    addExtras: (group) => {
      const umbrella = new THREE.Mesh(
        new THREE.ConeGeometry(1.05, 0.5, 8),
        toonMaterial(PALETTE.colmadoRed),
      );
      umbrella.position.set(-0.35, 2.5, 0);
      umbrella.castShadow = true;
      group.add(umbrella);
      return [];
    },
  };
}

// ---------------------------------------------------------------------------

const ACCENT_VARIED = [0xffd3b6, 0xb3d9ff, 0xf2e9dc, 0xcdb4db];

// Scratch buffer for the corridor sweep: flat [start, end, start, end, ...] so
// spawn validation allocates nothing.
const _corridorBlocks: number[] = [];

const HIT = CONFIG.vehicleHitboxScale;
// The dashed line between your two lanes (mirrored on the oncoming side):
// where the rider starts, and where lane-splitting motoconchos ride.
const LINE_X = (ROAD.laneCenters[0] + ROAD.laneCenters[1]) / 2;
const SWING_M = 1.55; // how far el rebase carries a car from its lane center toward the seam
// Beyond this the fog hides everything in every tramo, so a set piece may
// clear filler out of its way there without anything visibly vanishing.
const FOGGED_Z = 150;
// Where el río de plátanos steps when its line is blocked, nearest first.
const RIVER_STEPS = [0.85, -0.85, 1.7, -1.7, 2.55, -2.55] as const;

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

// The set-piece library. tier: the escalation tier that unlocks it; tramo:
// the stretch it belongs to (null = anywhere).
interface SetPieceDef {
  kind: SetPieceKind;
  tier: number;
  tramo: Tramo | null;
}
const SET_PIECES: readonly SetPieceDef[] = [
  { kind: 'guaguaLenta', tier: 0, tramo: null },
  { kind: 'parada', tier: 0, tramo: 'malecon' },
  { kind: 'camionPlatanos', tier: 0, tramo: 'campo' },
  { kind: 'tapon', tier: 1, tramo: null },
  { kind: 'calleEstrecha', tier: 1, tramo: 'zona' },
  { kind: 'caravana', tier: 2, tramo: null },
  { kind: 'horaPico', tier: 3, tramo: null },
];
// DECISION: la guagua lenta is the quiet teaching piece and is not announced;
// every other piece calls its name, so a run has moments worth retelling.
const PIECE_ANNOUNCED: Record<SetPieceKind, boolean> = {
  guaguaLenta: false,
  parada: true,
  camionPlatanos: true,
  tapon: true,
  calleEstrecha: true,
  caravana: true,
  horaPico: true,
};

export class Traffic {
  private vehicles: Vehicle[] = [];
  private obstacles: Obstacle[] = [];
  private pickups: Pickup[] = [];
  private events: TrafficEvents;

  private time = 0;
  private elapsed = 0;
  private lastSpeed: number = CONFIG.baseSpeed;
  private lastPlayerX = 0;
  private lastPlayerCv = false;
  private lastPlayerR: number = CONFIG.playerRadius;
  private lastPlayerSpeed: number = CONFIG.baseSpeed;
  private typeHalfW = new Map<VehicleType, number>();
  private typeHalfL = new Map<VehicleType, number>();
  private spawnAcc = 0;
  private activeCount = 0;

  private nextPatternAt = -1;
  private nextOvertakeAt = -1;
  private vehiclePauseUntil = 0;
  private nextHoyoAt = -1;
  private nextPoliciaAt = -1;
  private nextCharcoAt = -1;
  private nextCartAt = -1;
  private nextPowerupAt = -1;
  private nextTrailAt = -1;
  private lastPlatanoAt = 0;

  // Power-up shuffle bag: every kind once per bag, in a random order.
  private bag: PowerupKind[] = ['cafecito', 'bendicion', 'iman'];
  private bagIdx = 3;
  private firstPowerupDue = false;
  private lastShielded = false;

  // The opening is seeded on the first live step, once the rider's speed is known.
  private openingPending = false;

  // Escalation and the wave director
  private tier = 0;
  private setPhase: 'build' | 'peak' | 'breather' = 'build';
  private setBuilds = 0;
  private lastPiece: SetPieceKind | null = null;
  private sawT = 0; // seconds left in the post-breather sawtooth
  private horaPicoUntil = 0;

  // Shoulder anti-camping
  private campSide = 0;
  private campT = 0;
  private nextCampAt = 0;

  // El río de plátanos
  private lastCafecito = false;

  private readonly statsData: TrafficStats = {
    spawnAttempts: 0,
    corridorRejects: 0,
    pickupPoolMisses: 0,
    platanosSpawned: 0,
    setPiecesPlaced: 0,
  };

  get activeCars(): number {
    return this.activeCount;
  }

  get stats(): Readonly<TrafficStats> {
    return this.statsData;
  }

  get vehicleViews(): readonly VehicleView[] {
    return this.vehicles;
  }

  get pickupViews(): readonly PickupView[] {
    return this.pickups;
  }

  get escalationTier(): number {
    return this.tier;
  }

  constructor(scene: THREE.Scene, events: TrafficEvents) {
    this.events = events;
    const banner = textTexture('DIOS ES MI GUÍA', 256, 40, '#ffffff', '#002d62', 'bold 26px sans-serif');

    const defs: Array<[VehicleType, TypeAssets]> = [
      ['sedan', sedanAssets()],
      ['guagua', guaguaAssets(banner, false)],
      ['guaguaParada', guaguaAssets(banner, true)],
      ['camion', camionAssets()],
      ['civic', civicAssets()],
      ['motoconcho', motoconchoAssets(false)],
      ['motoconcho', motoconchoAssets(true)],
      ['cart', cartAssets()],
    ];

    const vcMat = vcToonMaterial();
    for (const [type, a] of defs) {
      this.typeHalfW.set(type, a.halfW);
      this.typeHalfL.set(type, a.halfL);
      for (let i = 0; i < a.pool; i++) {
        const group = new THREE.Group();
        // Every static part of a vehicle becomes one merged, vertex-colored
        // mesh. The per-slot paint job is baked into the vertices, so 27 cars
        // on screen cost 27 draws for their bodies instead of ~95. Only the
        // animated or unlit extras (blinkers, banner, underglow, heads,
        // umbrella) stay as their own meshes, via addExtras.
        const parts = [paint(a.painted.clone(), a.paints[i % a.paints.length])];
        parts.push(paint(a.dark.clone(), PALETTE.darkParts));
        if (a.accent) {
          const color = a.accentColor === 0 ? ACCENT_VARIED[i % ACCENT_VARIED.length] : a.accentColor!;
          parts.push(paint(a.accent.clone(), color));
        }
        if (a.green) parts.push(paint(a.green.clone(), PALETTE.platano));
        const body = new THREE.Mesh(mergeGeometries(parts)!, vcMat);
        body.castShadow = true;
        group.add(body);
        const blinkers = a.addExtras ? a.addExtras(group) : [];
        group.visible = false;
        scene.add(group);
        this.vehicles.push({
          type, group, active: false, lane: 0, baseX: 0, x: 0, z: 0, dir: 1,
          speed: 10, halfW: a.halfW, halfL: a.halfL, passed: false,
          driftPhase: Math.random() * 7, driftAmp: 0, overtakeT: -1, cruise: 0, blinkers,
          threat: false, threatX: 0, honked: false, lineN: 0, lineSide: 1,
          dropT: -1, noRebase: false,
        });
      }
    }

    this.buildObstacles(scene);
    this.buildPickups(scene);
  }

  // ---------------- obstacles ----------------

  private buildObstacles(scene: THREE.Scene): void {
    const hoyoTex = (() => {
      const c = document.createElement('canvas');
      c.width = c.height = 96;
      const g = c.getContext('2d')!;
      g.clearRect(0, 0, 96, 96);
      g.fillStyle = '#6b6259';
      g.beginPath();
      g.arc(48, 48, 46, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#16100d';
      g.beginPath();
      g.arc(48, 48, 39, 0, Math.PI * 2);
      g.fill();
      return new THREE.CanvasTexture(c);
    })();

    for (let i = 0; i < 8; i++) {
      const mesh = new THREE.Mesh(
        new THREE.CircleGeometry(0.85, 20),
        worldMaterial(new THREE.MeshBasicMaterial({ map: hoyoTex, transparent: true })),
      );
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.y = 0.02;
      mesh.visible = false;
      scene.add(mesh);
      this.obstacles.push({ kind: 'hoyo', mesh, active: false, x: 0, z: 0, armed: true });
    }

    const stripeTex = (() => {
      const c = document.createElement('canvas');
      c.width = 128;
      c.height = 16;
      const g = c.getContext('2d')!;
      for (let i = 0; i < 8; i++) {
        g.fillStyle = i % 2 ? '#2a2624' : '#f4c430';
        g.fillRect(i * 16, 0, 16, 16);
      }
      const t = new THREE.CanvasTexture(c);
      t.wrapS = THREE.RepeatWrapping;
      t.repeat.set(6, 1);
      return t;
    })();

    for (let i = 0; i < 4; i++) {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(ROAD.halfRoad * 2, 0.22, 1.0),
        worldMaterial(new THREE.MeshToonMaterial({ map: stripeTex })),
      );
      mesh.position.y = 0.11;
      mesh.castShadow = true;
      mesh.visible = false;
      scene.add(mesh);
      this.obstacles.push({ kind: 'policia', mesh, active: false, x: 0, z: 0, armed: true });
    }

    for (let i = 0; i < 5; i++) {
      const mesh = new THREE.Mesh(
        new THREE.CircleGeometry(1, 20),
        worldMaterial(
          new THREE.MeshBasicMaterial({ color: PALETTE.charco, transparent: true, opacity: 0.5 }),
        ),
      );
      mesh.rotation.x = -Math.PI / 2;
      mesh.scale.set(1.15, 1.7, 1);
      mesh.position.y = 0.015;
      mesh.visible = false;
      scene.add(mesh);
      this.obstacles.push({ kind: 'charco', mesh, active: false, x: 0, z: 0, armed: true });
    }
  }

  // ---------------- pickups ----------------

  private buildPickups(scene: THREE.Scene): void {
    // An actual platano: five box segments walking an arc (ends up, belly
    // down), tapered toward both ends, with dark tips. The old three fanned
    // sticks read as anything but a banana.
    const platanoGeo = (() => {
      const fruit: THREE.BufferGeometry[] = [];
      const tips: THREE.BufferGeometry[] = [];
      const SEG = 5;
      const R = 0.34;
      const ARC = 1.85;
      const step = (ARC * R) / SEG;
      const place = (g: THREE.BufferGeometry, a: number): void => {
        g.rotateZ(a - Math.PI / 2); // long axis follows the arc tangent
        g.translate(Math.sin(a) * R, 0.2 + R - Math.cos(a) * R, 0);
      };
      for (let i = 0; i < SEG; i++) {
        const t = (i + 0.5) / SEG;
        const thick = 0.11 * (0.6 + 0.5 * Math.sin(Math.PI * t)); // fat middle
        const g = new THREE.BoxGeometry(thick, step + 0.03, thick);
        place(g, -ARC / 2 + ARC * t);
        fruit.push(g);
      }
      for (const sgn of [-1, 1]) {
        const tip = new THREE.BoxGeometry(0.06, 0.1, 0.06);
        place(tip, sgn * (ARC / 2 + 0.08));
        tips.push(tip);
      }
      return { fruit: mergeGeometries(fruit)!, tips: mergeGeometries(tips)! };
    })();
    const platanoMat = toonMaterial(PALETTE.platano);
    const tipMat = toonMaterial(0x4a3b26);
    for (let i = 0; i < 40; i++) {
      const group = new THREE.Group();
      group.add(new THREE.Mesh(platanoGeo.fruit, platanoMat));
      group.add(new THREE.Mesh(platanoGeo.tips, tipMat));
      group.rotation.z = 0.14; // a little rake so the spin shows the curve
      group.visible = false;
      scene.add(group);
      this.pickups.push({ kind: 'platano', group, active: false, x: 0, y: 0.55, z: 0, phase: Math.random() * 7 });
    }

    const ringGeo = new THREE.TorusGeometry(0.42, 0.045, 8, 20);
    ringGeo.rotateX(Math.PI / 2);
    const gold = worldMaterial(new THREE.MeshBasicMaterial({ color: PALETTE.gold }));
    const addPowerup = (kind: PowerupKind, build: (g: THREE.Group) => void, count: number): void => {
      for (let i = 0; i < count; i++) {
        const group = new THREE.Group();
        const ring = new THREE.Mesh(ringGeo, gold);
        ring.position.y = 0.1;
        group.add(ring);
        build(group);
        group.visible = false;
        scene.add(group);
        this.pickups.push({ kind, group, active: false, x: 0, y: 0.7, z: 0, phase: Math.random() * 7 });
      }
    };
    addPowerup('cafecito', (g) => {
      const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.16, 0.26, 12), toonMaterial(0x6f4e37));
      cup.position.y = 0.42;
      const foam = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.21, 0.06, 12), toonMaterial(PALETTE.laneDash));
      foam.position.y = 0.56;
      g.add(cup, foam);
    }, 2);
    addPowerup('bendicion', (g) => {
      const badge = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.58, 0.1), gold);
      badge.position.y = 0.55;
      const inner = new THREE.Mesh(
        new THREE.BoxGeometry(0.32, 0.4, 0.12),
        worldMaterial(new THREE.MeshBasicMaterial({ color: 0xffffff })),
      );
      inner.position.y = 0.55;
      g.add(badge, inner);
    }, 2);
    addPowerup('iman', (g) => {
      const red = toonMaterial(PALETTE.flagRed);
      const l = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.4, 0.15), red);
      l.position.set(-0.17, 0.5, 0);
      const r = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.4, 0.15), red);
      r.position.set(0.17, 0.5, 0);
      const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.49, 0.16, 0.15), red);
      bridge.position.set(0, 0.72, 0);
      const tips = new THREE.Mesh(new THREE.BoxGeometry(0.49, 0.07, 0.16), toonMaterial(0xd9d9d9));
      tips.position.set(0, 0.32, 0);
      g.add(l, r, bridge, tips);
    }, 2);
  }

  // ---------------- placement validation ----------------

  // When the player will reach something sitting at z. Same-direction traffic
  // closes slowly, oncoming closes fast, so two vehicles far apart in z can
  // still arrive together. Comparing raw z misses exactly that case.
  private arrivalTime(z: number, dir: number, speed: number): number {
    const closing = this.lastPlayerSpeed - dir * speed;
    return closing > 0.5 ? z / closing : Infinity;
  }

  private laneX(lane: number): number {
    if (lane === -1) return ROAD.shoulderCenters[0];
    if (lane === 4) return ROAD.shoulderCenters[1];
    return ROAD.laneCenters[lane];
  }

  // Where el rebase takes an inner-lane car: onto the center seam, measured
  // from the lane center so a car jittered toward the seam never overshoots.
  private swingX(v: Vehicle): number {
    return ROAD.laneCenters[v.lane] + (v.lane === 1 ? SWING_M : -SWING_M);
  }

  // How far a car of this half width may sit off its lane center toward -x
  // or +x and still keep its whole body (drift included) inside its lane.
  // On the shoulder side it also keeps clear of a parked guagua.
  private laneRoom(lane: number, halfW: number, towardPlus: boolean): number {
    let room = CONFIG.laneWidth / 2 - halfW - 0.05;
    if ((lane === 0 && !towardPlus) || (lane === 3 && towardPlus)) {
      const toShoulder = ROAD.shoulderCenters[1] - ROAD.laneCenters[3];
      room = Math.min(room, toShoulder - (halfW + (this.typeHalfW.get('guaguaParada') ?? 1.15)) * 0.85);
    }
    return Math.max(0, room);
  }

  // The brief's sacred rule: never commit a spawn that leaves no continuous
  // gap of at least minCorridorMult player widths. This measures the real
  // corridor across the whole road, shoulders included (parked guaguas and
  // vendor carts narrow it too), among everything that ARRIVES together.
  private widestCorridor(cx: number, cw: number, tCand: number, tWin: number): number {
    const blocks = _corridorBlocks;
    blocks.length = 0;
    blocks.push(cx - cw, cx + cw); // the candidate, drift included
    for (const v of this.vehicles) {
      if (!v.active) continue;
      const t = this.arrivalTime(v.z, v.dir, v.speed);
      if (!isFinite(t) || Math.abs(t - tCand) > tWin) continue;
      const w = v.halfW * HIT + v.driftAmp;
      let lo = v.baseX - w;
      let hi = v.baseX + w;
      if (v.overtakeT >= 0) {
        const sx = this.swingX(v);
        lo = Math.min(lo, sx - w);
        hi = Math.max(hi, sx + w);
      }
      blocks.push(lo, hi);
    }
    // widest free run across the drivable width, sweeping the interval starts
    let widest = 0;
    let cursor = -ROAD.edgeX;
    // insertion sort over pairs: the list is tiny and this allocates nothing
    for (let i = 2; i < blocks.length; i += 2) {
      const a = blocks[i];
      const b = blocks[i + 1];
      let j = i - 2;
      while (j >= 0 && blocks[j] > a) {
        blocks[j + 2] = blocks[j];
        blocks[j + 3] = blocks[j + 1];
        j -= 2;
      }
      blocks[j + 2] = a;
      blocks[j + 3] = b;
    }
    for (let i = 0; i < blocks.length; i += 2) {
      if (blocks[i] > cursor) {
        const gap = blocks[i] - cursor;
        if (gap > widest) widest = gap;
      }
      if (blocks[i + 1] > cursor) cursor = blocks[i + 1];
    }
    if (ROAD.edgeX - cursor > widest) widest = ROAD.edgeX - cursor;
    return widest;
  }

  private canPlace(
    lane: number,
    x: number,
    z: number,
    halfL: number,
    halfW: number,
    drift: number,
    dir: 1 | -1,
    speed: number,
    gapM: number,
  ): boolean {
    this.statsData.spawnAttempts++;
    // Nobody spawns on top of anyone sharing its line: the same lane, or a
    // body that overlaps sideways (a motoconcho on the dashed line touches
    // both lanes beside it).
    for (const v of this.vehicles) {
      if (!v.active) continue;
      const sideBySide =
        v.lane === lane || Math.abs(v.baseX - x) < v.halfW + halfW + v.driftAmp + drift + 0.1;
      if (sideBySide && Math.abs(v.z - z) < gapM + halfL + v.halfL) return false;
    }
    if (this.pickupInWay(x, z, halfW, halfL, drift, dir, speed, false)) return false;
    const tCand = this.arrivalTime(z, dir, speed);
    if (!isFinite(tCand) || tCand <= 0) return true; // never reaches the player, cannot wall them
    const tWin = CONFIG.antiWallWindowM / Math.max(this.lastPlayerSpeed, 1);
    const need = CONFIG.minCorridorMult * 2 * this.lastPlayerR;
    if (this.widestCorridor(x, halfW * HIT + drift, tCand, tWin) < need) {
      this.statsData.corridorRejects++;
      return false;
    }
    return true;
  }

  // Would a vehicle spawned here sit on a pickup at the moment the rider
  // reaches it? A pickup already in view vetoes the spawn; with clearFar set,
  // pickups still deep in the fog make way instead.
  private pickupInWay(
    x: number,
    z: number,
    halfW: number,
    halfL: number,
    drift: number,
    dir: 1 | -1,
    speed: number,
    clearFar: boolean,
  ): boolean {
    const vr = Math.max(this.lastPlayerSpeed, 1);
    const closing = vr - dir * speed;
    for (const p of this.pickups) {
      if (!p.active || p.z <= 0) continue;
      const reach = p.kind === 'platano' ? 0.5 : 1.1;
      if (Math.abs(p.x - x) >= halfW * HIT + reach + drift + 0.2) continue;
      // where the vehicle is when this pickup reaches the rider line
      const rel = z - closing * (p.z / vr);
      if (Math.abs(rel) >= halfL * HIT + reach + 1 + 0.02 * p.z) continue;
      if (!clearFar) {
        if (p.z <= CONFIG.platanoLayZ) return true;
      } else if (p.z > CONFIG.platanoLayZ) {
        p.active = false;
        p.group.visible = false;
      }
    }
    return false;
  }

  // Is a pickup at (x, z) reachable when the rider gets there, given where
  // every vehicle will be by then? Speeds are assumed constant, so the
  // margin grows with distance.
  private pickupClear(x: number, z: number, reach = 0.5): boolean {
    const vr = Math.max(this.lastPlayerSpeed, 1);
    const tp = z / vr;
    for (const v of this.vehicles) {
      if (!v.active) continue;
      const rel = v.z - (vr - v.dir * v.speed) * tp;
      if (Math.abs(rel) >= v.halfL * HIT + reach + 1 + 0.02 * z) continue;
      let lo = v.baseX;
      let hi = v.baseX;
      if (v.overtakeT >= 0) {
        const sx = this.swingX(v);
        lo = Math.min(lo, sx);
        hi = Math.max(hi, sx);
      }
      const w = v.halfW * HIT + reach + v.driftAmp + 0.15;
      if (x > lo - w && x < hi + w) return false;
    }
    return true;
  }

  private vehicleNear(x: number, z: number, window: number): boolean {
    for (const v of this.vehicles) {
      if (v.active && Math.abs(v.x - x) < v.halfW + 1.2 && Math.abs(v.z - z) < window) return true;
    }
    return false;
  }

  private spawnVehicle(
    type: VehicleType,
    lane: number,
    z: number,
    dir: 1 | -1,
    speedOverride?: number,
    exactX?: number,
    gapM?: number,
  ): Vehicle | null {
    if (this.activeCount >= CONFIG.trafficMaxActive) return null;
    const isStaticType = type === 'guaguaParada' || type === 'cart';
    const halfW = this.typeHalfW.get(type) ?? 1;
    const halfL = this.typeHalfL.get(type) ?? 2;
    let speed = 0;
    if (!isStaticType) {
      const range = CONFIG.vehicleSpeeds[type as keyof typeof CONFIG.vehicleSpeeds];
      speed = speedOverride ?? rand(range[0], range[1]);
    }
    // The lateral spot is decided before validation, so the corridor check
    // measures where the car really goes.
    let x: number;
    let drift = 0;
    let onLine = false;
    if (isStaticType) {
      x = lane === 4 ? ROAD.shoulderCenters[1] : ROAD.shoulderCenters[0];
    } else if (exactX !== undefined) {
      x = exactX;
    } else if (type === 'motoconcho' && Math.random() < CONFIG.motoLineShare) {
      // lane-splitting on the dashed line of its own side
      x = dir === 1 ? LINE_X : -LINE_X;
      drift = Math.random() * CONFIG.laneDriftM * 0.5;
      onLine = true;
    } else {
      const minus = Math.min(CONFIG.laneJitterM, this.laneRoom(lane, halfW, false));
      const plus = Math.min(CONFIG.laneJitterM, this.laneRoom(lane, halfW, true));
      // a rider parked between this lane and the next one gets company
      const toRider = this.lastPlayerX - ROAD.laneCenters[lane];
      const lean = Math.abs(toRider) > 1 && Math.abs(toRider) < 2.6 && Math.random() < CONFIG.lineCampLean;
      const j = !lean ? rand(-minus, plus) : toRider > 0 ? rand(0, plus) : rand(-minus, 0);
      drift = Math.min(Math.random() * CONFIG.laneDriftM, Math.max(0, (j < 0 ? minus : plus) - Math.abs(j)));
      x = ROAD.laneCenters[lane] + j;
    }
    const gap = gapM ?? CONFIG.escalation[this.tier].gapM;
    if (!this.canPlace(lane, x, z, halfL, halfW, drift, dir, speed, gap)) return null;
    for (const v of this.vehicles) {
      if (v.active || v.type !== type) continue;
      this.pickupInWay(x, z, halfW, halfL, drift, dir, speed, true);
      v.active = true;
      v.lane = lane;
      v.dir = dir;
      v.z = z;
      v.passed = false;
      v.threat = false;
      v.honked = false;
      v.lineN = 0;
      v.dropT = -1;
      v.overtakeT = -1;
      v.noRebase = onLine;
      v.speed = speed;
      v.cruise = speed;
      v.driftAmp = drift;
      v.baseX = x;
      if (isStaticType) {
        v.group.rotation.y = (Math.random() - 0.5) * 0.14;
      } else {
        v.group.rotation.y = dir === 1 ? 0 : Math.PI;
      }
      v.x = v.baseX;
      v.group.position.set(v.x, 0, v.z);
      v.group.visible = true;
      this.activeCount++;
      return v;
    }
    return null;
  }

  private spawnObstacle(kind: ObstacleKind, x: number, z: number): boolean {
    for (const o of this.obstacles) {
      if (o.active || o.kind !== kind) continue;
      o.active = true;
      o.armed = true;
      o.x = x;
      o.z = z;
      o.mesh.position.x = x;
      o.mesh.position.z = z;
      o.mesh.visible = true;
      return true;
    }
    return false;
  }

  private spawnPickup(kind: PickupKind, x: number, z: number, y?: number): boolean {
    for (const p of this.pickups) {
      if (p.active || p.kind !== kind) continue;
      p.active = true;
      p.x = x;
      p.z = z;
      p.y = y ?? (kind === 'platano' ? 0.55 : 0.7);
      p.group.position.set(x, p.y, z);
      p.group.visible = true;
      if (kind === 'platano') {
        this.statsData.platanosSpawned++;
        this.lastPlatanoAt = this.elapsed;
      }
      return true;
    }
    this.statsData.pickupPoolMisses++;
    return false;
  }

  // ---------------- plátano lines ----------------

  // Mark a car to carry a racing line: n plátanos beside it on `side`, laid
  // when it nears the fog line so they land right where you pass it.
  private attachLine(v: Vehicle, n: number, side: number): void {
    if (Math.abs(v.baseX - this.laneX(v.lane)) > 1) return; // lane-splitters carry none
    v.lineN = n;
    v.lineSide = side;
  }

  private layLine(v: Vehicle): void {
    const n = v.lineN;
    v.lineN = 0;
    const t = this.arrivalTime(v.z, v.dir, v.speed);
    if (!isFinite(t) || t <= 0) return;
    const zc = this.lastPlayerSpeed * t; // the plátano the rider takes as it passes the car
    const edge = ROAD.edgeX - 0.6;
    const x = clamp(v.baseX + v.lineSide * (v.halfW * HIT + 0.5 + CONFIG.platanoLineGapM + v.driftAmp), -edge, edge);
    for (let i = 0; i < n; i++) {
      const z = zc + (i - (n - 1) / 2) * CONFIG.platanoLineSpacingM;
      if (z > 2 && this.pickupClear(x, z)) this.spawnPickup('platano', x, z);
    }
  }

  // Lay a short line in whichever lane is clear, starting from a random lane.
  // shape: lateral offset per index. Returns false when no lane was clear.
  private layLaneLine(z0: number, n: number, spacing: number, amp: number, freq: number): boolean {
    const start = Math.floor(Math.random() * 4);
    for (let k = 0; k < 4; k++) {
      const lc = ROAD.laneCenters[(start + k) % 4];
      let clear = 0;
      for (let i = 0; i < n; i++) if (this.pickupClear(lc + amp * Math.sin(i * freq), z0 + i * spacing)) clear++;
      if (clear < n - 1) continue;
      for (let i = 0; i < n; i++) {
        const x = lc + amp * Math.sin(i * freq);
        const z = z0 + i * spacing;
        if (this.pickupClear(x, z)) this.spawnPickup('platano', x, z);
      }
      return true;
    }
    return false;
  }

  // El río de plátanos: while the cafecito burns, a plátano every few meters
  // along the free path ahead, stepping aside around whatever is in the way.
  private layRiver(x0: number): void {
    const edge = ROAD.edgeX - 0.7;
    let x = clamp(x0, -edge, edge);
    for (let z = CONFIG.cafecitoRiverFromZ; z <= CONFIG.spawnAhead; z += CONFIG.cafecitoRiverSpacingM) {
      if (!this.pickupClear(x, z)) {
        let found = false;
        for (const d of RIVER_STEPS) {
          const nx = x + d;
          if (nx < -edge || nx > edge || !this.pickupClear(nx, z)) continue;
          x = nx;
          found = true;
          break;
        }
        if (!found) continue;
      }
      this.spawnPickup('platano', x, z);
    }
  }

  // Called by main.ts right after the rider launches off a policía acostado:
  // plátanos along the rider's own parabola, so a straight jump takes them all.
  spawnJumpArc(x: number, speed: number, vy: number): number {
    const g = CONFIG.jumpGravity;
    const flight = (2 * vy) / g;
    const n = CONFIG.jumpArcCount;
    let spawned = 0;
    for (let k = 0; k < n; k++) {
      const t = ((k + 1) / (n + 1)) * flight;
      // the rider's reach is centered 0.6 above its own height
      const y = 0.6 + vy * t - 0.5 * g * t * t;
      if (this.spawnPickup('platano', x, speed * t, y)) spawned++;
    }
    return spawned;
  }

  // ---------------- power-ups ----------------

  // Shuffle bag: each kind once per bag. A Bendición drawn while the shield
  // is already up would do nothing, so it is skipped.
  private drawPowerup(): PowerupKind {
    for (let tries = 0; tries < 4; tries++) {
      if (this.bagIdx >= this.bag.length) {
        for (let i = this.bag.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          const tmp = this.bag[i];
          this.bag[i] = this.bag[j];
          this.bag[j] = tmp;
        }
        this.bagIdx = 0;
      }
      const k = this.bag[this.bagIdx++];
      if (k === 'bendicion' && this.lastShielded) continue;
      return k;
    }
    return 'cafecito';
  }

  // Put a power-up at xWant if it is reachable there, else in the nearest
  // lane that is.
  private placePowerup(kind: PowerupKind, xWant: number, z: number): boolean {
    const edge = ROAD.edgeX - 0.8;
    const x0 = clamp(xWant, -edge, edge);
    if (this.pickupClear(x0, z, 1.1)) return this.spawnPickup(kind, x0, z);
    let best = NaN;
    for (const lc of ROAD.laneCenters) {
      if (!this.pickupClear(lc, z, 1.1)) continue;
      if (Number.isNaN(best) || Math.abs(lc - x0) < Math.abs(best - x0)) best = lc;
    }
    return Number.isNaN(best) ? false : this.spawnPickup(kind, best, z);
  }

  private schedulePowerupNow(z: number): void {
    this.placePowerup(this.drawPowerup(), ROAD.laneCenters[Math.floor(Math.random() * 4)], z);
  }

  // ---------------- wave patterns ----------------

  private sameBase(): number {
    return CONFIG.spawnAhead + rand(5, 20);
  }

  private oncBase(extraSpeed = 16): number {
    const need = (this.lastSpeed + extraSpeed) * CONFIG.telegraphMinSec * 1.15;
    return Math.max(CONFIG.spawnAhead + 15, need) + rand(0, 20);
  }

  // During the opening, same-direction traffic is slow enough that the rider
  // closes on it at openingClosing, so the stream keeps arriving early.
  private sameSpeed(type: VehicleType): number | undefined {
    if (this.elapsed >= CONFIG.openingSec) return undefined;
    const r = CONFIG.vehicleSpeeds[type as keyof typeof CONFIG.vehicleSpeeds];
    const want = this.lastPlayerSpeed - rand(CONFIG.openingClosing[0], CONFIG.openingClosing[1]);
    return Math.max(6, Math.min(rand(r[0], r[1]), want));
  }

  // Civics join only once the rider closes on them properly: no idling in
  // the fog early, no blink arrivals.
  private civicOk(): boolean {
    return (
      this.elapsed > CONFIG.civicUnlockSec &&
      this.lastPlayerSpeed - CONFIG.vehicleSpeeds.civic[1] >= CONFIG.civicMinClosing
    );
  }

  private runSwarm(n: number): number {
    const z0 = this.oncBase();
    let lane = Math.random() < 0.5 ? 2 : 3;
    const spacing = rand(14, 19);
    let placed = 0;
    for (let i = 0; i < n; i++) {
      const type: VehicleType =
        i === n - 1 && Math.random() < 0.3 && this.elapsed > CONFIG.bigVehicleUnlockSec
          ? 'guagua'
          : Math.random() < 0.65 ? 'sedan' : 'motoconcho';
      const v = this.spawnVehicle(type, lane, z0 + i * spacing, -1);
      if (v) {
        placed++;
        this.attachLine(v, 1, lane === 2 ? 1 : -1); // toward the contra vía dashed line: x2 bait
      }
      lane = lane === 2 ? 3 : 2;
    }
    return placed;
  }

  private runPattern(kind: PatternKind): void {
    if (kind === 'convoy') {
      const lane = Math.random() < 0.5 ? 0 : 1;
      const z0 = this.sameBase();
      const n = Math.random() < 0.5 ? 3 : 4;
      const spacing = rand(13, 17);
      const side = Math.random() < 0.5 ? 1 : -1;
      for (let i = 0; i < n; i++) {
        const type: VehicleType = i === 0 && Math.random() < 0.4 && this.elapsed > CONFIG.bigVehicleUnlockSec
          ? 'guagua'
          : Math.random() < 0.75 ? 'sedan' : 'motoconcho';
        const v = this.spawnVehicle(type, lane, z0 + i * spacing, 1, this.sameSpeed(type), undefined, CONFIG.convoyGapM);
        if (v) this.attachLine(v, 2, side);
      }
    } else if (kind === 'zigzag') {
      const z0 = this.sameBase();
      let lane = Math.random() < 0.5 ? 0 : 1;
      const spacing = rand(17, 21);
      for (let i = 0; i < 4; i++) {
        const type: VehicleType =
          this.civicOk() && Math.random() < 0.3 ? 'civic' : Math.random() < 0.7 ? 'sedan' : 'motoconcho';
        const v = this.spawnVehicle(type, lane, z0 + i * spacing, 1, this.sameSpeed(type));
        if (v) this.attachLine(v, 2, lane === 0 ? 1 : -1); // the gap side: weave to take it
        lane = lane === 0 ? 1 : 0;
      }
    } else if (kind === 'guaguaStop') {
      const seaSide = Math.random() < 0.2;
      const z0 = this.sameBase();
      const p = this.spawnVehicle('guaguaParada', seaSide ? 4 : -1, z0, 1);
      if (p) this.attachLine(p, 3, seaSide ? -1 : 1); // thread the gap between the bus and the lane
      this.spawnVehicle('sedan', seaSide ? 3 : 0, z0 - rand(4, 10), seaSide ? -1 : 1);
    } else if (kind === 'oncomingSwarm') {
      const n = this.elapsed > 60 ? 5 + (Math.random() < 0.5 ? 1 : 0) : Math.random() < 0.4 ? 5 : 4;
      this.runSwarm(n);
    } else if (kind === 'breather') {
      this.vehiclePauseUntil = this.elapsed + 2.8;
      this.sawT = CONFIG.breatherRecoverSec;
      const z0 = this.sameBase();
      this.layLaneLine(z0, 6, 2.8, 1.2, 0.6); // an S through a clear lane
      if (Math.random() < CONFIG.breatherPowerupChance) this.schedulePowerupNow(z0 + 6 * 2.8 + 4);
    } else if (kind === 'hoyoField') {
      this.vehiclePauseUntil = this.elapsed + 2.2;
      const z0 = this.sameBase();
      for (let i = 0; i < 5; i++) {
        const lane = Math.floor(Math.random() * 4);
        this.spawnObstacle('hoyo', ROAD.laneCenters[lane] + rand(-0.6, 0.6), z0 + i * rand(6, 10));
      }
      if (Math.random() < 0.35) {
        const lane = Math.floor(Math.random() * 4);
        this.spawnObstacle('charco', ROAD.laneCenters[lane], z0 + rand(10, 30));
      }
    }
  }

  // ---------------- the wave director ----------------

  private pickBuild(): PatternKind {
    const e = this.elapsed;
    const wStop = e > 20 ? 14 : 0;
    const wSwarm = e > 20 ? 18 : 0;
    const wHoyo = e > 40 ? 14 : 0;
    let r = Math.random() * (24 + 30 + wStop + wSwarm + wHoyo);
    if ((r -= 24) < 0) return 'convoy';
    if ((r -= 30) < 0) return 'zigzag';
    if ((r -= wStop) < 0) return 'guaguaStop';
    if ((r -= wSwarm) < 0) return 'oncomingSwarm';
    return 'hoyoField';
  }

  private pieceEligible(d: SetPieceDef): boolean {
    if (d.tier > this.tier) return false;
    if (d.tramo !== null && d.tramo !== this.tramo) return false;
    if (this.elapsed < CONFIG.setPieceUnlockSec && d.kind !== 'guaguaLenta') return false;
    return true;
  }

  // Deeper tiers lean on their own pieces; the same piece never runs twice
  // in a row unless it is the only one available.
  private pickPiece(): SetPieceKind {
    let total = 0;
    for (const d of SET_PIECES) if (this.pieceEligible(d) && d.kind !== this.lastPiece) total += 1 + d.tier;
    if (total === 0) return this.lastPiece ?? 'guaguaLenta';
    let r = Math.random() * total;
    for (const d of SET_PIECES) {
      if (!this.pieceEligible(d) || d.kind === this.lastPiece) continue;
      r -= 1 + d.tier;
      if (r < 0) return d.kind;
    }
    return 'guaguaLenta';
  }

  // One step of the current set: build, peak, breather. Returns the wait
  // until the next step.
  private directorStep(density: number, patternMult: number): number {
    if (this.setPhase === 'build') {
      this.runPattern(this.pickBuild());
      if (++this.setBuilds >= CONFIG.setBuildPatterns) this.setPhase = 'peak';
      return (rand(CONFIG.patternIntervalMin, CONFIG.patternIntervalMax) / (0.6 + 0.4 * density)) * patternMult;
    }
    if (this.setPhase === 'peak') {
      const kind = this.pickPiece();
      this.lastPiece = kind;
      this.runSetPiece(kind);
      this.setPhase = 'breather';
      return CONFIG.setPeakSec * patternMult;
    }
    this.runPattern('breather');
    this.setPhase = 'build';
    this.setBuilds = 0;
    return CONFIG.setBreatherSec;
  }

  // A set piece built around one vehicle tries a little further out, then
  // the other lane of your side, when its spot is taken at the spawn line,
  // instead of silently not happening.
  private spawnKey(type: VehicleType, lane: number, z0: number, speed: number): Vehicle | null {
    for (let k = 0; k < 3; k++) {
      for (let j = 0; j < 2; j++) {
        const l = j === 0 ? lane : 1 - lane;
        const v = this.spawnVehicle(type, l, z0 + k * 24, 1, speed, ROAD.laneCenters[l]);
        if (v) return v;
      }
    }
    return null;
  }

  // A set piece outranks filler: slow filler piles up just past the fog line
  // and would refuse it. Clear that band (still invisible) in its lanes.
  private clearFogged(dir: 1 | -1): void {
    for (const v of this.vehicles) {
      if (!v.active || v.dir !== dir || v.speed === 0 || v.z <= FOGGED_Z) continue;
      if (v.lane < 0 || v.lane > 3) continue;
      v.active = false;
      v.group.visible = false;
      this.activeCount--;
    }
  }

  private runSetPiece(kind: SetPieceKind): void {
    let placed = 0;
    const z0 = this.sameBase();
    this.clearFogged(kind === 'caravana' ? -1 : 1);
    if (kind === 'guaguaLenta') {
      // Crawls in lane 1; the plátano line runs past it on the seam side,
      // the way you overtake a guagua in real life.
      const v = this.spawnKey('guagua', 1, z0, CONFIG.guaguaLentaMps);
      if (v) {
        placed++;
        v.noRebase = true;
        this.attachLine(v, 4, 1); // on its left: toward the seam, or toward lane 1 from lane 0
      }
    } else if (kind === 'tapon') {
      // Both of your lanes jammed and crawling. Three exits: the seam (where
      // a jammed car may swing out), the shoulder (a cart waits there) or
      // contra vía at x2.
      const sp = CONFIG.taponSpacingM;
      for (let i = 0; i < 3; i++) {
        const type: VehicleType = i === 1 && Math.random() < 0.5 ? 'guagua' : 'sedan';
        const v = this.spawnVehicle(type, 0, z0 + i * sp, 1, CONFIG.taponMps, undefined, CONFIG.convoyGapM);
        if (v) {
          placed++;
          this.attachLine(v, 1, -1); // the shoulder exit
        }
      }
      for (let i = 0; i < 2; i++) {
        const type: VehicleType = Math.random() < 0.5 ? 'sedan' : 'camion';
        if (this.spawnVehicle(type, 1, z0 + sp * 0.5 + i * sp, 1, CONFIG.taponMps, undefined, CONFIG.convoyGapM)) placed++;
      }
      this.spawnVehicle('cart', -1, z0 + 40, 1);
    } else if (kind === 'parada') {
      // The guagua stops on the shoulder with its hazards on, and a carro
      // público has pulled in behind it, half onto the shoulder. DECISION:
      // it is placed already stopped (it would brake deep in the fog anyway),
      // so the corridor check validates it as the parked car it will be; a
      // car that changes speed after validation could close a gap unseen.
      let p: Vehicle | null = null;
      for (let k = 0; k < 3 && !p; k++) p = this.spawnVehicle('guaguaParada', -1, z0 + k * 24, 1);
      if (p) {
        placed++;
        const c = this.spawnVehicle('sedan', 0, p.z - 9, 1, 0, ROAD.shoulderCenters[0] + 1.3, 1);
        if (c) c.noRebase = true;
        if (this.tier >= 1) this.spawnVehicle('guagua', 1, p.z + rand(-4, 6), 1);
      }
    } else if (kind === 'caravana') {
      placed = this.runSwarm(5);
    } else if (kind === 'camionPlatanos') {
      const v = this.spawnKey('camion', 1, z0, CONFIG.camionPlatanosMps);
      if (v) {
        placed++;
        v.noRebase = true;
        v.dropT = 0;
      }
    } else if (kind === 'calleEstrecha') {
      // Carts close both shoulders and motoconchos split both dashed lines.
      if (this.spawnVehicle('cart', -1, z0, 1)) placed++;
      if (this.spawnVehicle('cart', 4, z0 + 6, 1, undefined, undefined, 1)) placed++;
      const m = this.spawnVehicle('motoconcho', 0, z0 + rand(-8, 8), 1, undefined, LINE_X);
      if (m) m.noRebase = true;
      // the oncoming one arrives with the carts
      const vs = rand(CONFIG.vehicleSpeeds.motoconcho[0], CONFIG.vehicleSpeeds.motoconcho[1]);
      const zOnc = Math.min(300, (z0 * (this.lastPlayerSpeed + vs)) / Math.max(this.lastPlayerSpeed, 1));
      const o = this.spawnVehicle('motoconcho', 3, Math.max(zOnc, this.oncBase(vs)), -1, vs, -LINE_X);
      if (o) o.noRebase = true;
    } else if (kind === 'horaPico') {
      this.horaPicoUntil = this.elapsed + CONFIG.horaPicoSec;
      placed = 1;
    }
    if (placed === 0) return;
    this.statsData.setPiecesPlaced++;
    if (PIECE_ANNOUNCED[kind]) this.events.onSetPiece(kind);
  }

  // Los Tramos: each stretch has its own traffic personality. World tells us
  // where we are; the filler mix follows.
  private tramo: Tramo = 'malecon';

  setTramo(t: Tramo): void {
    this.tramo = t;
  }

  private spawnFiller(): void {
    const allowOncoming = this.elapsed >= CONFIG.oncomingUnlockSec;
    const dir: 1 | -1 = allowOncoming && Math.random() < CONFIG.oncomingShare ? -1 : 1;
    const w = CONFIG.tramoVehicleWeights[this.tramo] ?? CONFIG.vehicleWeights;
    const opts: Array<readonly [VehicleType, number]> = [
      ['sedan', w.sedan],
      ['motoconcho', w.motoconcho],
    ];
    if (this.elapsed > CONFIG.bigVehicleUnlockSec) {
      opts.push(['guagua', w.guagua], ['camion', w.camion]);
    }
    if (dir === 1 && this.civicOk()) opts.push(['civic', w.civic]);
    const type = pickWeighted(opts);
    const lanes: [number, number] = dir === 1 ? [0, 1] : [2, 3];
    let first = Math.random() < 0.5 ? 0 : 1;
    // En contra via, the road answers: oncoming filler aims for your lane.
    if (dir === -1 && this.lastPlayerCv && Math.random() < CONFIG.cvTargetBias) {
      first = this.lastPlayerX < ROAD.laneCenters[2] + CONFIG.laneWidth / 2 ? 0 : 1;
    }
    const range = CONFIG.vehicleSpeeds[type as keyof typeof CONFIG.vehicleSpeeds];
    const z = dir === 1 ? this.sameBase() : this.oncBase(range[1]);
    const speed = dir === 1 ? this.sameSpeed(type) : undefined;
    for (const cand of [lanes[first], lanes[1 - first]]) {
      if (this.spawnVehicle(type, cand, z, dir, speed)) return;
    }
  }

  // ---------------- the run ----------------

  // A new run: the opening is seeded on the first live step, when the
  // rider's real speed is known, and the first power-up is a Bendición.
  startRun(): void {
    this.openingPending = true;
    this.firstPowerupDue = true;
  }

  // Gentle means no threats, not no content: slow cars on your side that you
  // catch in the first seconds, and a plátano weave from the start line.
  private seedOpening(playerX: number): void {
    this.openingPending = false;
    for (const [type, lane, z, speed] of CONFIG.openingCars) {
      const v = this.spawnVehicle(type, lane, z, 1, speed, ROAD.laneCenters[lane]);
      if (v) v.noRebase = true;
    }
    const n = CONFIG.openingTrailCount;
    for (let i = 0; i < n; i++) {
      const x = playerX - CONFIG.openingTrailAmpM * Math.sin((i / (n - 1)) * Math.PI);
      const z = CONFIG.openingTrailStartZ + i * CONFIG.openingTrailSpacingM;
      if (this.pickupClear(x, z)) this.spawnPickup('platano', x, z);
    }
  }

  // ---------------- main step ----------------

  step(ctx: StepCtx): void {
    const { ds, dt, elapsed, live } = ctx;
    this.time += dt;
    this.elapsed = elapsed;
    this.lastSpeed = ctx.speed;
    this.lastPlayerX = ctx.playerX;
    this.lastPlayerCv = ctx.playerCv;
    this.lastPlayerR = ctx.playerR;
    this.lastPlayerSpeed = ctx.speed;
    this.lastShielded = ctx.shielded;

    const blinkOn = this.time % 0.9 < 0.45;

    // El que va alante manda: nobody drives through the vehicle ahead on its
    // line (same lane, or a body overlapping sideways). A faster follower
    // that closes inside its headway matches the leader's speed instead of
    // ghosting through. The live rider leads too: a car catching a slower
    // rider from behind (brake, hoyo, scrape) matches the rider and honks
    // once instead of rear-ending someone it cannot see.
    for (const v of this.vehicles) {
      if (!v.active || v.speed === 0) continue;
      let leaderSpeed = -1;
      let bestGap = Infinity;
      let riderLeads = false;
      for (const o of this.vehicles) {
        if (o === v || !o.active || o.dir !== v.dir) continue;
        if (o.lane !== v.lane && !this.sharesLine(o, v)) continue;
        const gap = (o.z - v.z) * v.dir - o.halfL - v.halfL;
        if (gap >= -0.5 && gap < bestGap) {
          bestGap = gap;
          leaderSpeed = o.speed;
        }
      }
      if (live && v.dir === 1 && v.z < 0 && Math.abs(v.x - ctx.playerX) < v.halfW * HIT + ctx.playerR + 0.6) {
        const gap = -v.z - v.halfL - ctx.playerR;
        if (gap >= -0.5 && gap < bestGap) {
          bestGap = gap;
          leaderSpeed = Math.max(0, ctx.speed - CONFIG.riderLeadMarginMps);
          riderLeads = true;
        }
      }
      if (leaderSpeed >= 0 && bestGap < 2 + v.speed * 0.12 && leaderSpeed < v.speed) {
        v.speed = leaderSpeed;
        if (riderLeads && !v.honked) {
          v.honked = true;
          this.events.onHornBehind(v.x);
        }
      } else if (v.speed < v.cruise) {
        // the road opened up: ease back to the speed it wanted, so traffic
        // keeps overtaking itself instead of settling into one slow parade
        v.speed = Math.min(v.cruise, v.speed + 2.5 * dt);
      }
    }

    for (const v of this.vehicles) {
      if (!v.active) continue;
      v.z += (v.dir === 1 ? v.speed : -v.speed) * dt - ds;
      if (v.z < -(CONFIG.despawnBehind + v.halfL * 2) || v.z > 320) {
        v.active = false;
        v.group.visible = false;
        this.activeCount--;
        continue;
      }
      // x is derived fresh every frame: base, plus lane drift, plus the
      // overtake swing. Never accumulated, so nothing can walk off its lane.
      let vx = v.baseX;
      if (v.driftAmp > 0) vx += Math.sin(this.time * 0.55 + v.driftPhase) * v.driftAmp;
      if (v.overtakeT >= 0) {
        // ease onto the seam and back off
        v.overtakeT += dt;
        const k = Math.sin(Math.PI * Math.min(1, v.overtakeT / CONFIG.overtakeSec));
        vx += (this.swingX(v) - v.baseX) * k;
        if (v.overtakeT >= CONFIG.overtakeSec) v.overtakeT = -1;
      }
      v.x = vx;
      v.group.position.x = v.x;
      v.group.position.z = v.z;
      for (const b of v.blinkers) b.visible = blinkOn;

      if (!live) continue;

      if (v.lineN > 0) {
        const t = this.arrivalTime(v.z, v.dir, v.speed);
        if (isFinite(t) && this.lastPlayerSpeed * t <= CONFIG.platanoLayZ) this.layLine(v);
      }

      // el camión botando plátanos: one off the back every few meters, only
      // while it is far enough ahead that none lands on your nose
      if (v.dropT >= 0) {
        v.dropT -= dt;
        if (v.dropT <= 0) {
          v.dropT += CONFIG.camionDropEveryM / Math.max(v.speed, 1);
          const pz = v.z - v.halfL - 0.8;
          // a car tailing the camión would sit on the drop: skip that one
          if (v.z > CONFIG.camionDropZ[0] && v.z < CONFIG.camionDropZ[1] && this.pickupClear(v.x, pz)) {
            this.spawnPickup('platano', v.x, pz);
          }
        }
      }

      // Near-miss: it has to be a dodge. The rider must have been on this
      // vehicle's line within nearMissThreatSec of the pass, then moved out.
      if (!v.passed) {
        const lineW = v.halfW * HIT + ctx.playerR;
        if (v.z <= 0) {
          v.passed = true;
          const clearance = Math.abs(ctx.playerX - v.x) - lineW;
          if (
            v.threat &&
            clearance >= 0 &&
            clearance <= CONFIG.nearMissRadius &&
            Math.abs(ctx.playerX - v.threatX) >= CONFIG.nearMissDodgeM
          ) {
            this.events.onNearMiss(v.x, v.z, clearance);
          }
        } else if (Math.abs(ctx.playerX - v.x) < lineW) {
          if (this.arrivalTime(v.z, v.dir, v.speed) <= CONFIG.nearMissThreatSec) {
            v.threat = true;
            v.threatX = ctx.playerX;
          }
        }
      }
    }

    for (const o of this.obstacles) {
      if (!o.active) continue;
      o.z -= ds;
      o.mesh.position.z = o.z;
      if (o.z < -(CONFIG.despawnBehind + 3)) {
        o.active = false;
        o.mesh.visible = false;
        continue;
      }
      if (!live || !o.armed) continue;
      if (o.kind === 'policia') {
        if (o.z <= 0 && o.z > -2 && Math.abs(ctx.playerX - o.x) < ROAD.halfRoad) {
          o.armed = false;
          if (!ctx.airborne && !ctx.wheelie) this.events.onPolicia();
        }
      } else if (o.kind === 'hoyo') {
        const dx = ctx.playerX - o.x;
        if (dx * dx + o.z * o.z < 1.2 * 1.2) {
          o.armed = false;
          if (!ctx.airborne && !ctx.wheelie) this.events.onHoyo();
        }
      } else {
        if (Math.abs(ctx.playerX - o.x) < 1.35 && Math.abs(o.z) < 1.75) {
          o.armed = false;
          if (!ctx.airborne && !ctx.wheelie) this.events.onCharco();
        }
      }
    }

    for (const p of this.pickups) {
      if (!p.active) continue;
      p.z -= ds;
      if (p.z < -(CONFIG.despawnBehind + 3)) {
        p.active = false;
        p.group.visible = false;
        continue;
      }
      if (ctx.magnet && p.kind === 'platano') {
        const dx = ctx.playerX - p.x;
        const dz = -p.z;
        const dist = Math.hypot(dx, dz);
        if (dist < CONFIG.imanRadius && dist > 0.01) {
          // Pull must outrun the world scroll or platanos escape backward at speed
          const pullSpeed = Math.max(CONFIG.imanPullSpeed, (ds / dt) * 1.5);
          const pull = (pullSpeed * dt) / dist;
          p.x += dx * pull;
          p.z += dz * pull;
          if (p.y > 0.55) p.y = Math.max(0.55, p.y - 2.5 * dt);
        }
      }
      p.group.position.x = p.x;
      p.group.position.z = p.z;
      p.group.position.y = p.y + Math.sin(this.time * 3.2 + p.phase) * 0.1;
      p.group.rotation.y += dt * 2.2;

      if (!live) continue;
      const dx = ctx.playerX - p.x;
      const reach = p.kind === 'platano' ? CONFIG.platanoRadius : 1.1;
      if (dx * dx + p.z * p.z < reach * reach) {
        const yOk =
          p.kind !== 'platano' || Math.abs(ctx.playerY + 0.6 - p.y) < CONFIG.platanoYTolerance;
        if (yOk) {
          p.active = false;
          p.group.visible = false;
          if (p.kind === 'platano') this.events.onPlatano(p.x, p.y, p.z);
          else this.events.onPowerup(p.kind, p.x, p.z);
        }
      }
    }

    if (!live) return;

    // ---------------- spawning ----------------

    if (this.openingPending) this.seedOpening(ctx.playerX);

    // Escalation follows the run's distance tiers.
    let tier = 0;
    for (let i = 1; i < CONFIG.escalation.length; i++) if (ctx.runDist >= CONFIG.escalation[i].atM) tier = i;
    if (tier > this.tier) {
      this.tier = tier;
      this.events.onEscalate(tier);
    }
    const esc = CONFIG.escalation[this.tier];

    const density =
      CONFIG.trafficDensityStart +
      (CONFIG.trafficDensityMax - CONFIG.trafficDensityStart) * Math.min(1, elapsed / CONFIG.densityRampSec);
    if (this.sawT > 0) this.sawT = Math.max(0, this.sawT - dt);

    if (this.nextPatternAt < 0) this.nextPatternAt = CONFIG.gentleStartSec * 0.7 + rand(0, 2);
    const patternsRunning = elapsed >= this.nextPatternAt || elapsed > CONFIG.gentleStartSec;
    if (elapsed >= this.nextPatternAt) {
      this.nextPatternAt =
        elapsed < this.vehiclePauseUntil ? this.vehiclePauseUntil : elapsed + this.directorStep(density, esc.pattern);
    }

    let rate = CONFIG.spawnsPerSecAtFull * density * esc.spawn;
    if (elapsed < CONFIG.gentleStartSec) rate *= CONFIG.gentleSpawnFactor;
    if (patternsRunning) rate *= CONFIG.fillerPatternShare;
    if (this.sawT > 0) rate *= 1 - CONFIG.breatherDip * (this.sawT / CONFIG.breatherRecoverSec);
    if (elapsed < this.horaPicoUntil) rate *= CONFIG.horaPicoSpawnMult;
    this.spawnAcc += rate * dt;
    while (this.spawnAcc >= 1) {
      this.spawnAcc -= 1;
      if (elapsed >= this.vehiclePauseUntil) this.spawnFiller();
    }

    // El rebase: swing an inner-lane vehicle onto the center seam. This is
    // why parking on the yellow line is not a free ride: the seam belongs to
    // whoever is overtaking. Once due, it waits for a car that will reach you
    // inside rebaseLeadSec, and the car announces itself with a bocinazo.
    if (elapsed > CONFIG.overtakeUnlockSec) {
      if (this.nextOvertakeAt < 0) {
        this.nextOvertakeAt = elapsed + rand(CONFIG.overtakeEvery[0], CONFIG.overtakeEvery[1]);
      }
      if (elapsed >= this.nextOvertakeAt) {
        const best = this.pickRebase();
        if (best) {
          best.overtakeT = 0;
          this.events.onRebase(best.x, best.z);
          const seam = Math.abs(ctx.playerX) < CONFIG.seamBandM ? CONFIG.seamRebaseMult : 1;
          this.nextOvertakeAt =
            elapsed +
            (rand(CONFIG.overtakeEvery[0], CONFIG.overtakeEvery[1]) / (0.5 + 0.5 * density)) * esc.rebase * seam;
        }
      }
    }

    // The first power-up of every run: a Bendición on the rider's line.
    if (this.firstPowerupDue) {
      const lead = (CONFIG.firstPowerupSec - elapsed) * this.lastPlayerSpeed;
      if (lead <= CONFIG.spawnAhead + 10) {
        this.firstPowerupDue = false;
        this.placePowerup('bendicion', ctx.playerX, Math.max(lead, 40));
      }
    }

    // El río de plátanos starts with the cafecito.
    if (ctx.cafecito && !this.lastCafecito) this.layRiver(ctx.playerX);
    this.lastCafecito = ctx.cafecito;

    // Shoulder anti-camping: the road takes the calm line away.
    const side = ctx.playerX < -ROAD.halfRoad ? -1 : ctx.playerX > ROAD.halfRoad ? 1 : 0;
    if (side !== 0 && side === this.campSide) this.campT += dt;
    else {
      this.campSide = side;
      this.campT = 0;
    }
    if (this.campT >= CONFIG.shoulderCampSec && elapsed >= this.nextCampAt) {
      const type: VehicleType = Math.random() < 0.5 ? 'cart' : 'guaguaParada';
      if (this.spawnVehicle(type, side < 0 ? -1 : 4, this.sameBase(), 1)) {
        this.nextCampAt = elapsed + rand(CONFIG.shoulderCampCooldown[0], CONFIG.shoulderCampCooldown[1]);
        this.campT = 0;
      }
    }

    // Standalone obstacles, carts, power-ups and plátano trails on their own cadence
    this.nextHoyoAt = this.cadence(this.nextHoyoAt, CONFIG.hoyoUnlockSec, CONFIG.hoyoEvery, this.fireHoyo);
    this.nextPoliciaAt = this.cadence(this.nextPoliciaAt, CONFIG.policiaUnlockSec, CONFIG.policiaEvery, this.firePolicia);
    this.nextCharcoAt = this.cadence(this.nextCharcoAt, CONFIG.charcoUnlockSec, CONFIG.charcoEvery, this.fireCharco);
    this.nextCartAt = this.cadence(this.nextCartAt, CONFIG.cartUnlockSec, CONFIG.cartEvery, this.fireCart);
    this.nextPowerupAt = this.cadence(this.nextPowerupAt, CONFIG.powerupUnlockSec, CONFIG.powerupEvery, this.firePowerup);
    this.nextTrailAt = this.cadence(this.nextTrailAt, CONFIG.platanoTrailUnlockSec, CONFIG.platanoTrailEvery, this.fireTrail);
  }

  // Cadence callbacks, bound once so the 120 Hz step allocates nothing.
  private readonly fireHoyo = (): void => {
    const x = ROAD.laneCenters[Math.floor(Math.random() * 4)] + rand(-0.6, 0.6);
    const z = this.sameBase();
    if (!this.vehicleNear(x, z, 14)) this.spawnObstacle('hoyo', x, z);
  };

  private readonly firePolicia = (): void => {
    const z = this.sameBase() + 10;
    if (!this.spawnObstacle('policia', 0, z)) return;
    if (Math.random() < 0.45) {
      // a short ground line into the bump; the arc itself follows the real
      // jump (spawnJumpArc) once the rider launches
      const x = ROAD.laneCenters[Math.floor(Math.random() * 4)];
      for (let i = 1; i <= CONFIG.policiaLeadIn; i++) {
        const pz = z - i * CONFIG.platanoLineSpacingM;
        if (this.pickupClear(x, pz)) this.spawnPickup('platano', x, pz);
      }
    }
  };

  private readonly fireCharco = (): void => {
    const x = ROAD.laneCenters[Math.floor(Math.random() * 4)] + rand(-0.5, 0.5);
    const z = this.sameBase();
    if (!this.vehicleNear(x, z, 10)) this.spawnObstacle('charco', x, z);
  };

  private readonly fireCart = (): void => {
    this.spawnVehicle('cart', Math.random() < 0.6 ? -1 : 4, this.sameBase(), 1);
  };

  private readonly firePowerup = (): void => {
    this.schedulePowerupNow(this.sameBase());
  };

  // A drought filler: a short trail only when nothing else laid plátanos lately.
  private readonly fireTrail = (): void => {
    if (this.elapsed - this.lastPlatanoAt < CONFIG.platanoTrailDroughtSec) return;
    this.layLaneLine(this.sameBase(), CONFIG.platanoTrailLen, 3, 0.5, 1.1);
  };

  // Do two vehicles' bodies overlap sideways? A car out on el rebase still
  // owns its home line: it comes back to it, so it keeps following whatever
  // is there (and whatever is behind that line keeps following it).
  private sharesLine(a: Vehicle, b: Vehicle): boolean {
    const w = a.halfW + b.halfW + 0.05;
    if (Math.abs(a.x - b.x) < w) return true;
    if (a.overtakeT >= 0 && Math.abs(a.baseX - b.x) < w) return true;
    if (b.overtakeT >= 0 && Math.abs(a.x - b.baseX) < w) return true;
    return false;
  }

  // Rebase candidates: a moving inner-lane car arriving inside
  // rebaseLeadSec, the soonest one whose swing path is clear.
  private pickRebase(): Vehicle | null {
    let best: Vehicle | null = null;
    let bestT = Infinity;
    for (const v of this.vehicles) {
      if (!v.active || v.speed === 0 || v.overtakeT >= 0 || v.noRebase) continue;
      if (v.lane !== 1 && v.lane !== 2) continue;
      const t = this.arrivalTime(v.z, v.dir, v.speed);
      if (t < CONFIG.rebaseLeadSec[0] || t > CONFIG.rebaseLeadSec[1] || t >= bestT) continue;
      if (!this.rebaseClear(v)) continue;
      best = v;
      bestT = t;
    }
    return best;
  }

  // A rebase into the side of another vehicle looks exactly like the
  // ghosting car-following exists to prevent, and one swept across a plátano
  // line would bury it: sample the swing and refuse either.
  private rebaseClear(v: Vehicle): boolean {
    const sx = this.swingX(v);
    const lo = Math.min(v.baseX, sx) - v.halfW - v.driftAmp;
    const hi = Math.max(v.baseX, sx) + v.halfW + v.driftAmp;
    const vVel = v.dir * v.speed;
    for (const o of this.vehicles) {
      if (o === v || !o.active) continue;
      const w = o.halfW + o.driftAmp + 0.2;
      if (o.x + w < lo || o.x - w > hi) continue;
      const oVel = o.dir * o.speed;
      for (let t = 0; t <= CONFIG.overtakeSec + 0.01; t += 0.325) {
        if (Math.abs(o.z + oVel * t - (v.z + vVel * t)) < o.halfL + v.halfL + 3) return false;
      }
    }
    const vr = Math.max(this.lastPlayerSpeed, 1);
    for (const p of this.pickups) {
      if (!p.active || p.z <= 0 || p.x < lo - 0.5 || p.x > hi + 0.5) continue;
      const tp = p.z / vr;
      if (tp > CONFIG.overtakeSec + 0.5) continue;
      if (Math.abs(v.z - (vr - vVel) * tp) < v.halfL * HIT + 1.5) return false;
    }
    return true;
  }

  private cadence(
    nextAt: number,
    unlock: number,
    range: readonly [number, number],
    fire: () => void,
  ): number {
    if (this.elapsed < unlock) return nextAt;
    if (nextAt < 0) return this.elapsed + rand(range[0] * 0.4, range[1] * 0.7);
    if (this.elapsed >= nextAt) {
      fire();
      return this.elapsed + rand(range[0], range[1]);
    }
    return nextAt;
  }

  // ---------------- queries ----------------

  checkCollision(px: number, pz: number, pr: number): boolean {
    for (const v of this.vehicles) {
      if (!v.active) continue;
      const dzAbs = Math.abs(v.z - pz);
      if (dzAbs > v.halfL + 1.5) continue;
      const hw = v.halfW * HIT;
      const hl = v.halfL * HIT;
      const dx = Math.max(Math.abs(px - v.x) - hw, 0);
      const dz = Math.max(dzAbs - hl, 0);
      if (dx * dx + dz * dz < pr * pr) return true;
    }
    return false;
  }

  // Test hooks for automated checks; gameplay never calls these.
  debugSpawnPickup(kind: PickupKind, x: number, z: number, y?: number): boolean {
    return this.spawnPickup(kind, x, z, y);
  }

  debugSpawnObstacle(kind: ObstacleKind, x: number, z: number): boolean {
    return this.spawnObstacle(kind, x, z);
  }

  debugSpawnVehicle(type: VehicleType, lane: number, z: number, dir: 1 | -1, exactX?: number, speed?: number): boolean {
    return this.spawnVehicle(type, lane, z, dir, speed, exactX) !== null;
  }

  debugRunPattern(kind: PatternKind): void {
    this.runPattern(kind);
  }

  debugRunSetPiece(kind: SetPieceKind): void {
    this.lastPiece = kind;
    this.runSetPiece(kind);
  }

  // Test probe: active vehicle pairs whose boxes materially interpenetrate.
  // Anything above zero is traffic ghosting through traffic.
  get overlapCount(): number {
    let n = 0;
    for (let i = 0; i < this.vehicles.length; i++) {
      const a = this.vehicles[i];
      if (!a.active) continue;
      for (let j = i + 1; j < this.vehicles.length; j++) {
        const b = this.vehicles[j];
        if (!b.active) continue;
        if (
          Math.abs(a.x - b.x) < (a.halfW + b.halfW) * 0.8 &&
          Math.abs(a.z - b.z) < (a.halfL + b.halfL) * 0.8
        ) {
          n++;
        }
      }
    }
    return n;
  }

  reset(): void {
    for (const v of this.vehicles) {
      v.active = false;
      v.group.visible = false;
      v.overtakeT = -1;
    }
    this.nextOvertakeAt = -1;
    for (const o of this.obstacles) {
      o.active = false;
      o.mesh.visible = false;
    }
    for (const p of this.pickups) {
      p.active = false;
      p.group.visible = false;
    }
    this.activeCount = 0;
    this.spawnAcc = 0;
    this.nextPatternAt = -1;
    this.vehiclePauseUntil = 0;
    this.nextHoyoAt = -1;
    this.nextPoliciaAt = -1;
    this.nextCharcoAt = -1;
    this.nextCartAt = -1;
    this.nextPowerupAt = -1;
    this.nextTrailAt = -1;
    this.lastPlatanoAt = 0;
    this.bagIdx = this.bag.length;
    this.firstPowerupDue = false;
    this.openingPending = false;
    this.tier = 0;
    this.setPhase = 'build';
    this.setBuilds = 0;
    this.lastPiece = null;
    this.sawT = 0;
    this.horaPicoUntil = 0;
    this.campSide = 0;
    this.campT = 0;
    this.nextCampAt = 0;
    this.lastCafecito = false;
    this.lastShielded = false;
    this.elapsed = 0;
  }
}
