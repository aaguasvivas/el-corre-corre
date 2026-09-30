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
import { textTexture, worldMaterial, paint, getGradientMap, addCobrador, SIGN_FONT } from './world';

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
  shoveTo: number; // NaN, or the x a Bendición save is sliding it to
  spinT: number; // seconds into the save's spin; <0 means not spinning
  spinDir: number;
  yaw0: number; // its heading before the spin
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

// The vehicle the rider ran into: what the crash flashes and looks at, and
// what a Bendición save shoves aside.
export interface VehicleHit extends VehicleView {
  readonly group: THREE.Group;
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

// Everything static on a vehicle is one merged, vertex-colored geometry per
// pool slot: the paint job, the variety (publico, private car, jeepeta), the
// lamps, plates and the people inside are all baked in, so a car costs one
// draw. Only the animated or textured extras (blinkers, banner, underglow)
// stay their own meshes, via addExtras.
interface TypeAssets {
  build: (slot: number) => THREE.BufferGeometry;
  halfW: number;
  halfL: number;
  pool: number;
  addExtras?: (group: THREE.Group, slot: number) => THREE.Object3D[];
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

function cyl(rTop: number, rBot: number, h: number, x: number, y: number, z: number, seg = 10): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(rTop, rBot, h, seg);
  g.translate(x, y, z);
  return g;
}

function sph(r: number, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(r, 7, 5);
  g.scale(sx, sy, sz);
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
// Hazard materials. Traffic, obstacles and pickups fade on their own fog
// curve (CONFIG.hazardFogFarM, hazardFogPow): full color deep into the haze,
// gone only at the spawn line, so a hazard reads before the scenery behind
// it does. Lamps are vertex colors painted past 1.0; the traffic material
// turns that overflow into glow, so head and tail lamps light up with no
// extra draw and no extra material.
// ---------------------------------------------------------------------------

const LAMP_GAIN = 2;

const HAZARD_FOG = `
#ifdef USE_FOG
	float fogFactor = pow( smoothstep( fogNear, ${CONFIG.hazardFogFarM.toFixed(1)}, vFogDepth ), ${CONFIG.hazardFogPow.toFixed(2)} );
	gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
#endif
`;

const LAMP_CHUNK = `
#include <emissivemap_fragment>
#ifdef USE_COLOR
	totalEmissiveRadiance += vColor.rgb * ( ${CONFIG.lampGlow.toFixed(3)} * step( 1.02, max( vColor.r, max( vColor.g, vColor.b ) ) ) );
#endif
`;

// Bend with the world (worldMaterial), fade on the hazard curve, and with
// `lamps`, glow wherever the vertex color runs past 1.0.
function hazardMaterial<T extends THREE.Material>(m: T, lamps = false): T {
  worldMaterial(m);
  const bend = m.onBeforeCompile;
  const key = `${m.customProgramCacheKey()}haz${lamps ? 'lamp' : ''}`;
  m.onBeforeCompile = (shader, renderer) => {
    bend.call(m, shader, renderer);
    let fs = shader.fragmentShader.replace('#include <fog_fragment>', HAZARD_FOG);
    if (lamps) fs = fs.replace('#include <emissivemap_fragment>', LAMP_CHUNK);
    shader.fragmentShader = fs;
  };
  m.customProgramCacheKey = () => key;
  return m;
}

let _trafficMat: THREE.MeshToonMaterial | null = null;
function trafficMaterial(): THREE.MeshToonMaterial {
  if (!_trafficMat) {
    _trafficMat = hazardMaterial(
      new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: getGradientMap() }),
      true,
    );
  }
  return _trafficMat;
}

// Collects painted parts for one merged, vertex-colored geometry.
class Kit {
  private parts: THREE.BufferGeometry[] = [];

  add(g: THREE.BufferGeometry, color: number): this {
    this.parts.push(paint(g.index ? g : mergeVertices(g), color));
    return this;
  }

  // A lamp: painted past 1.0, which the traffic material turns into glow.
  lamp(g: THREE.BufferGeometry, color: number): this {
    this.add(g, color);
    const arr = (this.parts[this.parts.length - 1].getAttribute('color') as THREE.BufferAttribute)
      .array as Float32Array;
    for (let i = 0; i < arr.length; i++) arr[i] *= LAMP_GAIN;
    return this;
  }

  // Geometry that already carries its own vertex colors (a racimo, a cup).
  addColored(g: THREE.BufferGeometry): this {
    this.parts.push(g.index ? g : mergeVertices(g));
    return this;
  }

  build(): THREE.BufferGeometry {
    const g = mergeGeometries(this.parts)!;
    for (const p of this.parts) p.dispose();
    this.parts = [];
    return g;
  }
}

function skinTone(slot: number, k = 0): number {
  return PALETTE.skinTones[(slot + k) % PALETTE.skinTones.length];
}

// Somebody behind the glass: head, hair and shirt shoulders standing just
// proud of the window, so a car seen from behind (or head-on) has people in
// it. `out` is the side the window faces (-1 back, 1 front).
function person(k: Kit, x: number, y: number, z: number, out: 1 | -1, seed: number, r = 0.12): void {
  k.add(box(r * 3.2, r * 0.9, 0.03, x, y - r * 1.45, z), PALETTE.shirts[seed % PALETTE.shirts.length]);
  k.add(sph(r, x, y, z, 1, 1.1, 0.3), skinTone(seed));
  k.add(sph(r * 1.05, x, y + r * 0.38, z + out * 0.008, 1, 0.6, 0.3), 0x2a1d17);
}

// Dominican plate: white, with the blue band across the top.
function drPlate(k: Kit, x: number, y: number, z: number, w = 0.5): void {
  k.add(box(w, 0.15, 0.03, x, y, z), PALETTE.flagWhite);
  k.add(box(w, 0.04, 0.036, x, y + 0.055, z), PALETTE.flagBlue);
}

// A mirrored pair of lamps: red at the back, warm white at the front. Same
// direction traffic shows you its tail lamps, oncoming traffic its head
// lamps, so direction reads at fog distance before the shape does.
function lampPair(k: Kit, w: number, h: number, x: number, y: number, z: number, color: number): void {
  k.lamp(box(w, h, 0.06, x, y, z), color);
  k.lamp(box(w, h, 0.06, -x, y, z), color);
}

function wheels4(k: Kit, r: number, len: number, x: number, z: number, y = r): void {
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.add(cylX(r, len, sx * x, y, sz * z), PALETTE.darkParts);
}

// ---------------------------------------------------------------------------
// Archetypes
// ---------------------------------------------------------------------------

// Sedan slots rotate three bodies: el carro publico (the brief's beige
// Corolla with its roof sign and a door in primer), a private car in a
// saturated paint, and la jeepeta. The hitbox stays the sedan's for all three.
function sedanAssets(): TypeAssets {
  return {
    halfW: 0.95, halfL: 2.2, pool: 14,
    build: (slot) => {
      const k = new Kit();
      const kind = slot % 3;
      const n = Math.floor(slot / 3);
      if (kind === 2) jeepeta(k, slot, PALETTE.jeepetaPaints[n % PALETTE.jeepetaPaints.length]);
      else sedan(k, slot, kind === 0 ? PALETTE.publicoBeige : PALETTE.sedanPaints[n % PALETTE.sedanPaints.length], kind === 0);
      return k.build();
    },
  };
}

function sedan(k: Kit, slot: number, body: number, publico: boolean): void {
  k.add(rbox(1.9, 0.55, 4.4, 0, 0.58, 0, 0.12), body);
  k.add(rbox(1.65, 0.5, 2.1, 0, 1.05, -0.35, 0.14), body);
  const wind = new THREE.BoxGeometry(1.4, 0.4, 0.08);
  wind.rotateX(-0.18);
  wind.translate(0, 1.05, 0.72);
  k.add(wind, PALETTE.glass);
  k.add(box(1.36, 0.32, 0.06, 0, 1.07, -1.42), PALETTE.glass); // rear window
  k.add(box(1.67, 0.28, 1.5, 0, 1.08, -0.32), PALETTE.glass); // side windows
  wheels4(k, 0.34, 0.24, 0.85, 1.4);
  k.add(box(1.96, 0.16, 0.14, 0, 0.38, 2.22), PALETTE.darkParts); // bumpers
  k.add(box(1.96, 0.16, 0.14, 0, 0.38, -2.22), PALETTE.darkParts);
  lampPair(k, 0.34, 0.15, 0.62, 0.68, -2.21, PALETTE.flagRed);
  lampPair(k, 0.36, 0.16, 0.58, 0.65, 2.21, PALETTE.sunGlow);
  drPlate(k, 0, 0.53, -2.225);
  drPlate(k, 0, 0.53, 2.225);
  // the driver sits on the left (+x), seen through both windows
  person(k, 0.42, 1.12, -1.47, -1, slot);
  person(k, 0.42, 1.12, 0.79, 1, slot);
  if (publico) {
    // el carro publico: the roof sign, one door in primer, and a back seat
    // packed the way a concho runs it
    k.add(box(0.55, 0.16, 0.34, 0, 1.42, -0.1), PALETTE.laneDash);
    k.add(box(0.16, 0.05, 0.36, 0, 1.52, -0.1), PALETTE.flagRed);
    const door = PALETTE.publicoDoors[Math.floor(slot / 3) % PALETTE.publicoDoors.length];
    k.add(box(0.06, 0.42, 1.1, slot % 2 ? 0.96 : -0.96, 0.62, 0.5), door);
    person(k, 0, 1.1, -1.47, -1, slot + 1);
    person(k, -0.42, 1.1, -1.47, -1, slot + 2);
  }
}

// La jeepeta: taller, boxier, a spare tire on the tailgate. The status car.
function jeepeta(k: Kit, slot: number, body: number): void {
  k.add(rbox(1.95, 0.72, 4.4, 0, 0.76, 0, 0.14), body);
  k.add(rbox(1.84, 0.6, 3.0, 0, 1.38, -0.4, 0.12), body);
  k.add(box(1.86, 0.32, 2.6, 0, 1.42, -0.38), PALETTE.glass); // side glass
  const wind = new THREE.BoxGeometry(1.6, 0.42, 0.07);
  wind.rotateX(-0.28);
  wind.translate(0, 1.4, 1.12);
  k.add(wind, PALETTE.glass);
  k.add(box(1.5, 0.36, 0.06, 0, 1.42, -1.92), PALETTE.glass); // rear window
  wheels4(k, 0.39, 0.28, 0.9, 1.45);
  k.add(box(0.06, 0.06, 2.4, 0.78, 1.71, -0.4), PALETTE.darkParts); // roof rails
  k.add(box(0.06, 0.06, 2.4, -0.78, 1.71, -0.4), PALETTE.darkParts);
  const spare = new THREE.CylinderGeometry(0.34, 0.34, 0.22, 12);
  spare.rotateX(Math.PI / 2);
  spare.translate(0, 0.98, -2.31);
  k.add(spare, PALETTE.darkParts);
  const hub = new THREE.CylinderGeometry(0.22, 0.22, 0.04, 12);
  hub.rotateX(Math.PI / 2);
  hub.translate(0, 0.98, -2.43);
  k.add(hub, body);
  k.add(box(1.98, 0.18, 0.16, 0, 0.44, 2.24), PALETTE.darkParts);
  k.add(box(1.98, 0.18, 0.16, 0, 0.44, -2.24), PALETTE.darkParts);
  k.add(box(0.9, 0.22, 0.05, 0, 0.84, 2.22), PALETTE.darkParts); // grille
  lampPair(k, 0.16, 0.34, 0.84, 0.92, -2.21, PALETTE.flagRed);
  lampPair(k, 0.36, 0.14, 0.64, 0.88, 2.21, PALETTE.sunGlow);
  drPlate(k, 0, 0.46, -2.335);
  drPlate(k, 0, 0.46, 2.335);
  person(k, 0.42, 1.44, -1.97, -1, slot);
  person(k, 0.42, 1.46, 1.2, 1, slot);
}

function guaguaAssets(banner: THREE.Texture, parked: boolean): TypeAssets {
  // "DIOS ES MI GUIA" front and back in one mesh: the brief's banner above
  // the windshield, and the same banner across the back, which is the side
  // of a guagua the rider actually looks at.
  const front = new THREE.PlaneGeometry(1.9, 0.3);
  front.translate(0, 2.32, 3.52);
  const back = new THREE.PlaneGeometry(2.0, 0.3);
  back.rotateY(Math.PI);
  back.translate(0, 2.05, -3.53);
  const bannerGeo = mergeGeometries([front, back])!;
  const bannerMat = hazardMaterial(new THREE.MeshBasicMaterial({ map: banner }));
  const blinkGeo = mergeGeometries([
    box(0.24, 0.34, 0.08, 0.95, 0.9, -3.58),
    box(0.24, 0.34, 0.08, -0.95, 0.9, -3.58),
  ])!;
  const blinkMat = hazardMaterial(new THREE.MeshBasicMaterial({ color: PALETTE.hazardOrange }));

  return {
    halfW: 1.15, halfL: 3.5, pool: parked ? 3 : 5,
    build: (slot) => {
      const k = new Kit();
      k.add(rbox(2.3, 1.7, 7, 0, 1.35, 0, 0.18), PALETTE.guaguaYellow);
      k.add(box(2.32, 0.14, 6.6, 0, 1.12, 0), PALETTE.colmadoRed); // the stripe
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.add(cylX(0.42, 0.28, sx * 0.98, 0.42, sz * 2.5), PALETTE.darkParts);
      k.add(box(2.34, 0.55, 5.2, 0, 1.8, -0.5), PALETTE.glass); // window band
      k.add(box(2.1, 0.6, 0.1, 0, 1.75, 3.46), PALETTE.glass); // windshield
      k.add(box(2.34, 0.28, 0.24, 0, 0.5, 3.5), PALETTE.darkParts); // bumpers
      k.add(box(2.34, 0.26, 0.22, 0, 0.5, -3.5), PALETTE.darkParts);
      k.add(box(0.08, 0.1, 3.6, -0.95, 2.28, -0.4), PALETTE.darkParts); // roof rack rails
      k.add(box(0.08, 0.1, 3.6, 0.95, 2.28, -0.4), PALETTE.darkParts);
      // roof cargo: whatever the barrio sent along today
      k.add(box(0.7, 0.42, 0.9, -0.5, 2.53, 0.3), PALETTE.laneDash);
      k.add(box(0.6, 0.5, 0.7, 0.5, 2.56, -1.2), PALETTE.shirts[slot % PALETTE.shirts.length]);
      k.add(box(0.5, 0.36, 0.5, 0.15, 2.5, 1.35), PALETTE.laneDash);
      // the back: rear window full of passengers, lamps, ladder, plate
      k.add(box(1.3, 0.5, 0.06, 0.4, 1.6, -3.52), PALETTE.glass);
      for (let i = 0; i < 3; i++) person(k, 0.84 - i * 0.4, 1.62, -3.57, -1, slot + i, 0.12);
      lampPair(k, 0.2, 0.3, 0.95, 0.9, -3.52, PALETTE.flagRed);
      lampPair(k, 0.3, 0.18, 0.85, 0.78, 3.53, PALETTE.sunGlow);
      for (const lx of [-0.42, -0.7]) k.add(box(0.05, 1.3, 0.05, lx, 1.3, -3.58), PALETTE.darkParts);
      for (const ly of [0.85, 1.2, 1.55, 1.88]) k.add(box(0.28, 0.04, 0.04, -0.56, ly, -3.58), PALETTE.darkParts);
      drPlate(k, 0.35, 0.82, -3.535);
      person(k, 0.7, 1.85, 3.53, 1, slot); // el chofer
      return k.build();
    },
    addExtras: (group) => {
      group.add(new THREE.Mesh(bannerGeo, bannerMat));
      if (!parked) return [];
      // el cobrador hangs off the back step on the sidewalk side (world.ts),
      // on the same fog curve as the guagua
      addCobrador(group, hazardMaterial);
      // hazard blinkers over the tail lamps, both in one mesh
      const blink = new THREE.Mesh(blinkGeo, blinkMat);
      group.add(blink);
      // parked on the curb, loaded to one side
      group.rotation.z = 0.045;
      return [blink];
    },
  };
}

// One plátano finger for the racimos: a torus arc that leaves the stalk
// heading out and curls up.
function finger(r: number, tube = 0.042, arc = 1.35): THREE.BufferGeometry {
  const g = new THREE.TorusGeometry(r, tube, 3, 3, arc);
  g.rotateZ(-Math.PI / 2);
  g.translate(0, r, 0);
  return g;
}

// Un racimo: a stalk with three rings of fingers curling up around it.
function racimo(x: number, y: number, z: number, rotY: number, tilt: number, variant: number): THREE.BufferGeometry {
  const k = new Kit();
  k.add(cyl(0.035, 0.05, 0.62, 0, 0.31, 0, 5), 0x6b5645);
  for (let ring = 0; ring < 3; ring++) {
    const green = (ring + variant) % 3 === 1 ? 0x8bc34a : PALETTE.platano;
    for (let i = 0; i < 4; i++) {
      const f = finger(0.17 - ring * 0.015);
      f.translate(0.045, 0, 0);
      f.rotateY((i / 4) * Math.PI * 2 + ring * 0.6 + variant);
      f.translate(0, 0.1 + ring * 0.16, 0);
      k.add(f, green);
    }
  }
  const g = k.build();
  g.rotateX(tilt);
  g.rotateY(rotY);
  g.translate(x, y, z);
  return g;
}

function camionAssets(): TypeAssets {
  return {
    halfW: 1.2, halfL: 3.2, pool: 4,
    build: (slot) => {
      const k = new Kit();
      const olive = PALETTE.camionOlive;
      k.add(rbox(2.2, 1.5, 1.7, 0, 1.15, 2.5, 0.14), olive); // cab
      k.add(box(2.4, 0.25, 4.3, 0, 0.75, -0.75), olive); // bed
      k.add(box(0.08, 0.5, 4.3, -1.16, 1.05, -0.75), olive);
      k.add(box(0.08, 0.5, 4.3, 1.16, 1.05, -0.75), olive);
      k.add(box(2.4, 0.5, 0.08, 0, 1.05, 1.35), olive);
      k.add(box(2.4, 0.5, 0.08, 0, 1.05, -2.86), olive); // tailgate
      for (const sx of [-1, 1]) for (const zz of [2.6, -0.4, -2.2]) k.add(cylX(0.4, 0.26, sx * 0.95, 0.4, zz), PALETTE.darkParts);
      k.add(box(1.9, 0.55, 0.08, 0, 1.6, 3.36), PALETTE.glass); // windshield
      k.add(box(2.22, 0.42, 0.9, 0, 1.58, 2.6), PALETTE.glass); // side windows
      k.add(box(1.3, 0.34, 0.05, 0, 0.9, 3.37), PALETTE.darkParts); // grille
      k.add(box(2.3, 0.2, 0.16, 0, 0.45, 3.38), PALETTE.darkParts); // bumper
      for (const sx of [-1, 1]) k.add(box(0.5, 0.45, 0.04, sx * 0.95, 0.4, -2.74), PALETTE.darkParts); // mud flaps
      lampPair(k, 0.24, 0.14, 0.98, 0.72, -2.93, PALETTE.flagRed);
      lampPair(k, 0.28, 0.16, 0.78, 0.82, 3.37, PALETTE.sunGlow);
      drPlate(k, 0, 0.5, -2.93);
      person(k, 0.55, 1.66, 3.42, 1, slot);
      // Los platanos: real racimos, two layers on the bed, never lettuce crates
      const spots: Array<[number, number, number]> = [
        [-0.52, 0.875, -2.3], [0.52, 0.875, -2.25], [-0.5, 0.875, -1.25], [0.54, 0.875, -1.2],
        [-0.53, 0.875, -0.2], [0.5, 0.875, -0.15], [-0.5, 0.875, 0.85], [0.52, 0.875, 0.85],
        [0.02, 1.2, -1.75], [-0.05, 1.2, -0.7], [0.04, 1.2, 0.35],
      ];
      spots.forEach(([x, y, z], i) => k.addColored(racimo(x, y, z, rand(0, 6.28), rand(-0.18, 0.18), i + slot)));
      return k.build();
    },
  };
}

// The underglow's light pool: an ellipse that is brightest under the car
// and fades to nothing before the plane's edge, so the glow reads as light
// spilling onto the road instead of a flat teal mat with hard corners.
// Shared by the traffic Civics and the player's (player.ts).
let _underglowMap: THREE.CanvasTexture | null = null;
export function underglowMap(): THREE.CanvasTexture {
  if (!_underglowMap) {
    _underglowMap = canvasTex(64, (g) => {
      g.translate(32, 32);
      const grad = g.createRadialGradient(0, 0, 0, 0, 0, 32);
      grad.addColorStop(0, 'rgba(255,255,255,1)');
      grad.addColorStop(0.55, 'rgba(255,255,255,0.8)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grad;
      g.fillRect(-32, -32, 64, 64);
    });
  }
  return _underglowMap;
}

function civicAssets(): TypeAssets {
  const glowGeo = new THREE.PlaneGeometry(2.5, 5.0);
  glowGeo.rotateX(-Math.PI / 2);
  glowGeo.translate(0, 0.04, 0);
  const glowMat = hazardMaterial(
    new THREE.MeshBasicMaterial({
      color: PALETTE.underglow,
      map: underglowMap(),
      transparent: true,
      opacity: 0.7,
      depthWrite: false,
    }),
  );
  return {
    halfW: 0.93, halfL: 2.1, pool: 5,
    build: (slot) => {
      const k = new Kit();
      const paintHex = PALETTE.civicPaints[slot % PALETTE.civicPaints.length];
      k.add(rbox(1.85, 0.42, 4.2, 0, 0.46, 0, 0.11), paintHex);
      k.add(rbox(1.55, 0.36, 1.9, 0, 0.83, -0.15, 0.12), paintHex);
      k.add(box(1.7, 0.07, 0.4, 0, 1.02, -2.0), paintHex); // el aleron
      k.add(box(0.08, 0.26, 0.08, -0.6, 0.85, -1.98), paintHex);
      k.add(box(0.08, 0.26, 0.08, 0.6, 0.85, -1.98), paintHex);
      wheels4(k, 0.3, 0.26, 0.83, 1.35);
      const wind = new THREE.BoxGeometry(1.35, 0.34, 0.07);
      wind.rotateX(-0.22);
      wind.translate(0, 0.86, 0.68);
      k.add(wind, PALETTE.glass);
      k.add(box(1.3, 0.26, 0.05, 0, 0.84, -1.12), PALETTE.glass); // rear window
      k.add(box(1.57, 0.22, 1.3, 0, 0.86, -0.1), PALETTE.glass); // side glass
      k.lamp(box(1.6, 0.1, 0.05, 0, 0.58, -2.12), PALETTE.flagRed); // full-width tail bar
      lampPair(k, 0.34, 0.1, 0.6, 0.52, 2.11, PALETTE.sunGlow);
      drPlate(k, 0, 0.42, -2.125, 0.44);
      const pipe = new THREE.CylinderGeometry(0.075, 0.075, 0.22, 10); // que se oiga
      pipe.rotateX(Math.PI / 2);
      pipe.translate(0.55, 0.3, -2.12);
      k.add(pipe, 0xd9d9d9);
      person(k, 0.42, 0.88, -1.17, -1, slot, 0.1);
      return k.build();
    },
    addExtras: (group) => {
      group.add(new THREE.Mesh(glowGeo, glowMat));
      return [];
    },
  };
}

// Motoconchos: bright bikes and the lime chaleco, so a narrow hazard still
// reads at distance; sometimes a side-saddle passenger.
function motoconchoAssets(withPassenger: boolean): TypeAssets {
  return {
    halfW: 0.4, halfL: 1.05, pool: withPassenger ? 4 : 6,
    build: (i) => {
      const slot = i + (withPassenger ? 2 : 0);
      const k = new Kit();
      const bike = PALETTE.motoPaints[slot % PALETTE.motoPaints.length];
      const shirt = PALETTE.shirts[slot % PALETTE.shirts.length];
      const jeans = 0x2f4a6f;
      k.add(box(0.3, 0.28, 1.1, 0, 0.55, 0.05), bike);
      k.add(box(0.24, 0.16, 0.4, 0, 0.72, 0.24), bike);
      k.add(cylX(0.3, 0.16, 0, 0.3, 0.78), PALETTE.darkParts);
      k.add(cylX(0.3, 0.16, 0, 0.3, -0.72), PALETTE.darkParts);
      k.add(cylX(0.03, 0.5, 0, 0.92, 0.5), PALETTE.darkParts);
      k.add(box(0.3, 0.1, 0.75, 0, 0.72, -0.35), PALETTE.darkParts);
      k.add(box(0.06, 0.4, 0.06, 0, 0.52, 0.72), PALETTE.darkParts);
      k.lamp(box(0.12, 0.08, 0.04, 0, 0.66, -0.52), PALETTE.flagRed);
      k.lamp(box(0.14, 0.12, 0.05, 0, 0.86, 0.66), PALETTE.sunGlow);
      k.add(box(0.16, 0.1, 0.02, 0, 0.48, -0.51), PALETTE.flagWhite);
      // el motoconchista: jeans, arms to the bars, the chaleco, a gorra
      for (const sx of [-1, 1]) {
        k.add(box(0.12, 0.12, 0.4, sx * 0.14, 0.82, 0.1), jeans);
        k.add(box(0.1, 0.4, 0.12, sx * 0.16, 0.56, 0.28), jeans);
        const arm = new THREE.BoxGeometry(0.08, 0.08, 0.58);
        arm.rotateX(0.58);
        arm.translate(sx * 0.2, 1.08, 0.25);
        k.add(arm, shirt);
      }
      k.add(box(0.34, 0.46, 0.26, 0, 1.1, -0.02), PALETTE.vestHiVis);
      k.add(box(0.35, 0.05, 0.27, 0, 1.0, -0.02), 0xd9d9d9); // reflective strip
      k.add(sph(0.15, 0, 1.47, -0.02), skinTone(slot));
      k.add(sph(0.16, 0, 1.53, -0.02, 1, 0.62, 1), slot % 2 ? PALETTE.flagRed : PALETTE.darkParts);
      k.add(box(0.22, 0.03, 0.14, 0, 1.53, 0.14), slot % 2 ? PALETTE.flagRed : PALETTE.darkParts);
      if (withPassenger) {
        k.add(box(0.3, 0.4, 0.22, 0, 1.06, -0.48), PALETTE.shirts[(slot + 1) % PALETTE.shirts.length]);
        k.add(box(0.42, 0.1, 0.12, 0.26, 0.78, -0.48), jeans); // legs to one side
        k.add(sph(0.15, 0, 1.4, -0.48), skinTone(slot, 2));
      }
      return k.build();
    },
  };
}

function cartAssets(): TypeAssets {
  return {
    halfW: 0.55, halfL: 0.8, pool: 3,
    build: (slot) => {
      const k = new Kit();
      const body = slot % 2 ? PALETTE.colmadoRed : PALETTE.colmadoTeal;
      k.add(box(1.05, 0.62, 1.5, 0, 0.72, 0), body);
      k.add(box(1.15, 0.08, 1.6, 0, 1.06, 0), body);
      k.add(cylX(0.28, 0.12, 0, 0.28, 0.45), PALETTE.darkParts);
      k.add(cylX(0.28, 0.12, 0, 0.28, -0.45), PALETTE.darkParts);
      k.add(box(0.05, 1.5, 0.05, -0.35, 1.6, 0), PALETTE.darkParts);
      const umbrella = new THREE.ConeGeometry(1.05, 0.5, 8);
      umbrella.translate(-0.35, 2.5, 0);
      k.add(umbrella, slot % 2 ? PALETTE.colmadoTeal : PALETTE.colmadoRed);
      // the day's goods on top
      k.add(sph(0.14, 0.25, 1.2, 0.35), PALETTE.hazardOrange);
      k.add(sph(0.14, 0.2, 1.2, -0.3), PALETTE.guaguaYellow);
      k.add(sph(0.13, -0.1, 1.19, 0.5), PALETTE.platano);
      return k.build();
    },
  };
}

// ---------------------------------------------------------------------------
// Pickup and obstacle art
// ---------------------------------------------------------------------------

// One plátano: a tapered torus arc, belly down and ends up, with dark tips
// and a lighter belly. Its belly centerline sits at the origin; about 0.55 m
// long. Shared by the pickups and the rider's rack.
export function platanoFruit(): THREE.BufferGeometry {
  const R = 0.34;
  const TUBE = 0.1;
  const ARC = 1.85;
  const fruit = new THREE.TorusGeometry(R, TUBE, 5, 9, ARC);
  const pos = fruit.getAttribute('position') as THREE.BufferAttribute;
  const col = new Float32Array(pos.count * 3);
  const green = new THREE.Color(PALETTE.platano);
  const belly = new THREE.Color(0xc0ca33);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const u = Math.min(ARC, Math.max(0, Math.atan2(y, x)));
    const cx = R * Math.cos(u);
    const cy = R * Math.sin(u);
    const taper = 0.45 + 0.55 * Math.sin((Math.PI * u) / ARC); // fat middle, pointed ends
    const ox = (x - cx) * taper;
    const oy = (y - cy) * taper;
    pos.setXYZ(i, cx + ox, cy + oy, pos.getZ(i) * taper);
    const outward = (ox * cx + oy * cy) / (R * TUBE * taper); // -1 inside the curve, 1 the belly
    c.copy(green).lerp(belly, Math.max(0, outward) * 0.55);
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
  }
  fruit.setAttribute('color', new THREE.BufferAttribute(col, 3));
  fruit.computeVertexNormals();
  const tipA = new THREE.ConeGeometry(0.045, 0.12, 5);
  tipA.rotateZ(Math.PI);
  tipA.translate(R, -0.05, 0);
  const tipB = new THREE.ConeGeometry(0.045, 0.12, 5);
  tipB.rotateZ(ARC);
  tipB.translate(R * Math.cos(ARC) - Math.sin(ARC) * 0.05, R * Math.sin(ARC) + Math.cos(ARC) * 0.05, 0);
  const g = new Kit().addColored(fruit).add(tipA, 0x4a3b26).add(tipB, 0x4a3b26).build();
  g.rotateZ(-Math.PI / 2 - ARC / 2);
  g.translate(0, R, 0);
  return g;
}

// An inverted hull: the same shape pushed out along its normals, drawn
// back faces only, so it shows as a clean rim around the original.
function shell(src: THREE.BufferGeometry, w: number): THREE.BufferGeometry {
  const g = src.clone();
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  const nor = g.getAttribute('normal') as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    pos.setXYZ(i, pos.getX(i) + nor.getX(i) * w, pos.getY(i) + nor.getY(i) * w, pos.getZ(i) + nor.getZ(i) * w);
  }
  return g;
}

// Power-up icons stand upright facing the rider inside a glowing gold ring,
// 1.4 times the old size: a cafecito cup with steam, the Bendicion as a
// shield wearing the flag's cross, the Iman as the classic horseshoe.
function powerupIcon(kind: PowerupKind): THREE.BufferGeometry {
  const k = new Kit();
  k.lamp(new THREE.TorusGeometry(0.56, 0.05, 6, 28), PALETTE.gold);
  if (kind === 'cafecito') {
    const cup = new Kit()
      .add(cyl(0.3, 0.24, 0.04, 0, -0.2, 0, 16), PALETTE.laneDash) // saucer
      .add(cyl(0.2, 0.14, 0.28, 0, -0.04, 0, 14), PALETTE.flagWhite)
      .add(cyl(0.185, 0.185, 0.02, 0, 0.1, 0, 14), 0x6f4e37) // el cafe
      .add(new THREE.TorusGeometry(0.07, 0.024, 5, 12).translate(-0.21, -0.03, 0), PALETTE.flagWhite)
      .build();
    cup.rotateX(-0.35); // tip the cup at the rider so the coffee shows
    k.addColored(cup);
    k.lamp(sph(0.05, 0.04, 0.22, -0.06), PALETTE.flagWhite); // steam
    k.lamp(sph(0.045, -0.04, 0.31, -0.08), PALETTE.flagWhite);
    k.lamp(sph(0.04, 0.05, 0.4, -0.1), PALETTE.flagWhite);
  } else if (kind === 'bendicion') {
    const s = new THREE.Shape();
    s.moveTo(-0.28, 0.3);
    s.lineTo(0.28, 0.3);
    s.lineTo(0.28, -0.02);
    s.quadraticCurveTo(0.26, -0.24, 0, -0.38);
    s.quadraticCurveTo(-0.26, -0.24, -0.28, -0.02);
    s.closePath();
    const plate = new THREE.ExtrudeGeometry(s, { depth: 0.08, bevelEnabled: false, curveSegments: 5 });
    plate.translate(0, 0, -0.04);
    const shield = new Kit().lamp(plate, PALETTE.gold);
    // the flag's quadrants, built facing +z (blue at the hoist, top left)
    const quad = (pts: Array<[number, number]>, color: number): void => {
      const q = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
      shield.add(new THREE.ShapeGeometry(q).translate(0, 0, 0.045), color);
    };
    quad([[-0.22, 0.035], [-0.035, 0.035], [-0.035, 0.245], [-0.22, 0.245]], PALETTE.flagBlue);
    quad([[0.035, 0.035], [0.22, 0.035], [0.22, 0.245], [0.035, 0.245]], PALETTE.flagRed);
    quad([[-0.22, -0.035], [-0.035, -0.035], [-0.035, -0.29], [-0.2, -0.16]], PALETTE.flagRed);
    quad([[0.035, -0.035], [0.2, -0.16], [0.035, -0.29], [0.035, -0.035]], PALETTE.flagBlue);
    shield.add(box(0.07, 0.6, 0.02, 0, -0.03, 0.05), PALETTE.flagWhite); // la cruz
    shield.add(box(0.46, 0.07, 0.02, 0, 0, 0.05), PALETTE.flagWhite);
    shield.lamp(box(0.09, 0.09, 0.03, 0, 0, 0.058), PALETTE.gold); // el escudo
    const g = shield.build();
    g.rotateY(Math.PI); // face the rider, who looks down +z
    k.addColored(g);
  } else {
    const m = new Kit()
      .add(new THREE.TorusGeometry(0.2, 0.075, 8, 14, Math.PI).translate(0, 0.08, 0), PALETTE.flagRed)
      .add(cyl(0.075, 0.075, 0.18, 0.2, -0.01, 0), PALETTE.flagRed)
      .add(cyl(0.075, 0.075, 0.18, -0.2, -0.01, 0), PALETTE.flagRed)
      .lamp(cyl(0.078, 0.078, 0.1, 0.2, -0.15, 0), 0xd9d9d9)
      .lamp(cyl(0.078, 0.078, 0.1, -0.2, -0.15, 0), 0xd9d9d9)
      .build();
    m.rotateZ(0.22);
    k.addColored(m);
  }
  const g = k.build();
  g.translate(0, 0.35, 0);
  return g;
}

// The power-up beam's shader (see buildPickups). Additive, so it only ever
// adds light.
const BEAM_VS = `
varying vec3 vEccN;
varying vec3 vEccV;
varying float vEccH;
#include <common>
void main() {
  vEccH = uv.y;
  #include <beginnormal_vertex>
  #include <defaultnormal_vertex>
  #include <begin_vertex>
  #include <project_vertex>
  vEccN = normalize( transformedNormal );
  vEccV = normalize( -mvPosition.xyz );
}
`;

const BEAM_FS = `
uniform vec3 uColor;
varying vec3 vEccN;
varying vec3 vEccV;
varying float vEccH;
void main() {
  float facing = abs( dot( normalize( vEccN ), normalize( vEccV ) ) );
  float core = facing * facing;
  float rise = smoothstep( 0.0, 0.2, vEccH ) * pow( 1.0 - vEccH, 1.4 );
  gl_FragColor = vec4( uColor * ( core * rise * 0.6 ), 1.0 );
  #include <colorspace_fragment>
}
`;

function canvasTex(size: number, draw: (g: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  draw(g);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// A jittered ring of n points around the canvas center.
function blob(g: CanvasRenderingContext2D, cx: number, cy: number, r: number, jitter: number, n: number): void {
  g.beginPath();
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const rr = r + (Math.random() - 0.5) * 2 * jitter;
    const x = cx + Math.cos(a) * rr;
    const y = cy + Math.sin(a) * rr;
    if (i === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  g.closePath();
}

// La rama: the branch every Dominican driver sticks in a pothole so the
// next one sees it. A thin, tall stick driven in at a lean, a small tuft of
// leaves left at the tip, and a red trapo knotted under the tuft. Up close
// it reads as a stick, never a little tree; far off the rag is the dot of
// color that says "hoyo aquí". The rag's two tails cross, so one of them
// faces the camera whatever way the instance is turned.
function ramaGeometry(): THREE.BufferGeometry {
  const LEAN = 0.2;
  const stick = new Kit();
  stick.add(cyl(0.014, 0.03, 1.95, 0, 0.82, 0, 5), PALETTE.palmTrunk); // from inside the hole to 1.8 m
  const twig = new THREE.CylinderGeometry(0.008, 0.013, 0.24, 4);
  twig.rotateZ(-0.85);
  twig.translate(0.07, 1.32, 0);
  stick.add(twig, PALETTE.palmTrunk);
  const leaf = (x: number, y: number, z: number, s: number, color: number, yaw: number): void => {
    const g = new THREE.OctahedronGeometry(0.1 * s, 0);
    g.scale(0.7, 0.5, 1.6);
    g.rotateY(yaw);
    g.translate(x, y, z);
    stick.add(g, color);
  };
  leaf(0, 1.82, 0, 1, PALETTE.palmFronds, 0.3);
  leaf(0.05, 1.76, 0.03, 0.8, PALETTE.platano, 1.9);
  leaf(-0.04, 1.77, -0.03, 0.75, PALETTE.palmFronds, -1.2);
  const g = stick.build();
  g.rotateZ(LEAN); // stuck in at an angle, never straight
  // el trapo, tied where the stick is at 1.5 m, hanging plumb
  const kx = -Math.sin(LEAN) * 1.5;
  const ky = Math.cos(LEAN) * 1.5;
  const rag = new Kit().addColored(g).add(box(0.085, 0.07, 0.085, kx, ky, 0), PALETTE.flagRed);
  for (const yaw of [0.7, -0.85]) {
    const tail = new THREE.BoxGeometry(0.17, 0.3, 0.02);
    tail.rotateZ(0.12);
    tail.translate(0.05, -0.17, 0);
    tail.rotateY(yaw);
    tail.translate(kx, ky, 0);
    rag.add(tail, PALETTE.flagRed);
  }
  return rag.build();
}

// Scratch buffer for the corridor sweep: flat [start, end, start, end, ...] so
// spawn validation allocates nothing.
const _corridorBlocks: number[] = [];
const _m4 = new THREE.Matrix4();

const HIT = CONFIG.vehicleHitboxScale;
// The dashed line between your two lanes (mirrored on the oncoming side):
// where the rider starts, and where lane-splitting motoconchos ride.
const LINE_X = (ROAD.laneCenters[0] + ROAD.laneCenters[1]) / 2;
const SWING_M = 1.55; // how far el rebase carries a car from its lane center toward the seam
// Side by side, two bodies may come this close (a share of their summed half
// widths) and still read as passing, never as one inside the other: a lane
// car leans this near a parked guagua, and no two sways may meet deeper.
const SIDE_CLEAR = 0.85;
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

  // Instanced art, filled from the pools every step by syncVisuals()
  private blobs!: THREE.InstancedMesh;
  private ramas!: THREE.InstancedMesh;
  private platanoMesh!: THREE.InstancedMesh;
  private platanoRim!: THREE.InstancedMesh;

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
    const banner = textTexture('DIOS ES MI GUÍA', 256, 40, '#ffffff', '#002d62', `26px ${SIGN_FONT}`);

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

    const mat = trafficMaterial();
    for (const [type, a] of defs) {
      this.typeHalfW.set(type, a.halfW);
      this.typeHalfL.set(type, a.halfL);
      for (let i = 0; i < a.pool; i++) {
        const group = new THREE.Group();
        // DECISION: traffic casts no real shadow. The blob under every car
        // grounds it at any distance (the sun's shadow camera only covers
        // 45 m) and takes a dozen draws off the shadow pass in dense traffic.
        group.add(new THREE.Mesh(a.build(i), mat));
        const blinkers = a.addExtras ? a.addExtras(group, i) : [];
        group.visible = false;
        scene.add(group);
        this.vehicles.push({
          type, group, active: false, lane: 0, baseX: 0, x: 0, z: 0, dir: 1,
          speed: 10, halfW: a.halfW, halfL: a.halfL, passed: false,
          // DECISION: the phase comes from the slot, spread by the golden
          // angle, not from Math.random. Building the art draws randoms too
          // (every geometry and material takes some for its uuid), so a
          // random phase here changed with every art edit and reshuffled the
          // traffic that the seeded tests replay.
          driftPhase: (this.vehicles.length * 2.39996) % (Math.PI * 2), driftAmp: 0, overtakeT: -1, cruise: 0, blinkers,
          threat: false, threatX: 0, honked: false, lineN: 0, lineSide: 1,
          dropT: -1, noRebase: false, shoveTo: NaN, spinT: -1, spinDir: 1, yaw0: 0,
        });
      }
    }

    // Blob shadows: one instanced draw for every car on the road
    const blobGeo = new THREE.PlaneGeometry(1, 1);
    blobGeo.rotateX(-Math.PI / 2);
    const blobTex = canvasTex(64, (g) => {
      const grad = g.createRadialGradient(32, 32, 2, 32, 32, 32);
      grad.addColorStop(0, 'rgba(20,14,10,0.78)');
      grad.addColorStop(0.55, 'rgba(20,14,10,0.55)');
      grad.addColorStop(1, 'rgba(20,14,10,0)');
      g.fillStyle = grad;
      g.fillRect(0, 0, 64, 64);
    });
    this.blobs = new THREE.InstancedMesh(
      blobGeo,
      hazardMaterial(new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false })),
      this.vehicles.length,
    );
    this.blobs.count = 0;
    this.blobs.visible = false;
    this.blobs.frustumCulled = false;
    scene.add(this.blobs);

    this.buildObstacles(scene);
    this.buildPickups(scene);
  }

  // ---------------- obstacles ----------------

  private buildObstacles(scene: THREE.Scene): void {
    // El hoyo: a jagged light rim you can see from far, a black core whose
    // far wall catches the light, and cracks running out into the asphalt.
    const hoyoTex = canvasTex(128, (g) => {
      blob(g, 64, 64, 57, 4, 14);
      g.fillStyle = '#9a8f82';
      g.fill();
      blob(g, 64, 64, 46, 4, 14);
      const core = g.createLinearGradient(0, 20, 0, 110);
      core.addColorStop(0, '#16100d');
      core.addColorStop(0.6, '#1e1612');
      core.addColorStop(1, '#4a3d33');
      g.fillStyle = core;
      g.fill();
      g.strokeStyle = 'rgba(20,14,10,0.6)';
      g.lineWidth = 2;
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + Math.random() * 1.2;
        const kink = a + (Math.random() - 0.5) * 0.5;
        g.beginPath();
        g.moveTo(64 + Math.cos(a) * 50, 64 + Math.sin(a) * 50);
        g.lineTo(64 + Math.cos(kink) * 57, 64 + Math.sin(kink) * 57);
        g.lineTo(64 + Math.cos(a) * 63, 64 + Math.sin(a) * 63);
        g.stroke();
      }
    });
    const hoyoMat = hazardMaterial(new THREE.MeshBasicMaterial({ map: hoyoTex, transparent: true }));
    const hoyoGeo = new THREE.CircleGeometry(0.85, 20);
    for (let i = 0; i < 8; i++) {
      const mesh = new THREE.Mesh(hoyoGeo, hoyoMat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.y = 0.02;
      mesh.visible = false;
      scene.add(mesh);
      this.obstacles.push({ kind: 'hoyo', mesh, active: false, x: 0, z: 0, armed: true });
    }
    this.ramas = new THREE.InstancedMesh(ramaGeometry(), trafficMaterial(), 8);
    this.ramas.count = 0;
    this.ramas.visible = false;
    this.ramas.frustumCulled = false;
    this.ramas.castShadow = true;
    scene.add(this.ramas);

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
      t.colorSpace = THREE.SRGBColorSpace;
      t.wrapS = THREE.RepeatWrapping;
      t.repeat.set(6, 1);
      return t;
    })();

    const policiaMat = hazardMaterial(new THREE.MeshToonMaterial({ map: stripeTex, gradientMap: getGradientMap() }));
    const policiaGeo = new THREE.BoxGeometry(ROAD.halfRoad * 2, 0.22, 1.0);
    for (let i = 0; i < 4; i++) {
      const mesh = new THREE.Mesh(policiaGeo, policiaMat);
      mesh.position.y = 0.11;
      mesh.castShadow = true;
      mesh.visible = false;
      scene.add(mesh);
      this.obstacles.push({ kind: 'policia', mesh, active: false, x: 0, z: 0, armed: true });
    }

    // El charco: glossy sky blue with a bright rim and a glint, so it reads
    // wet, not painted on.
    const charcoTex = canvasTex(128, (g) => {
      blob(g, 64, 64, 56, 5, 16);
      g.fillStyle = 'rgba(77,182,201,0.82)';
      g.fill();
      g.lineWidth = 3;
      g.strokeStyle = 'rgba(255,255,255,0.6)';
      g.stroke();
      const sky = g.createRadialGradient(56, 44, 4, 56, 44, 40);
      sky.addColorStop(0, 'rgba(210,244,250,0.7)');
      sky.addColorStop(1, 'rgba(210,244,250,0)');
      g.fillStyle = sky;
      g.fill();
      g.fillStyle = 'rgba(255,255,255,0.9)';
      for (const [x, y, w, r] of [[50, 50, 22, -0.5], [78, 76, 12, -0.5]]) {
        g.save();
        g.translate(x, y);
        g.rotate(r);
        g.beginPath();
        g.ellipse(0, 0, w, 3, 0, 0, Math.PI * 2);
        g.fill();
        g.restore();
      }
    });
    const charcoMat = hazardMaterial(
      new THREE.MeshBasicMaterial({ map: charcoTex, transparent: true, depthWrite: false }),
    );
    const charcoGeo = new THREE.CircleGeometry(1, 20);
    for (let i = 0; i < 5; i++) {
      const mesh = new THREE.Mesh(charcoGeo, charcoMat);
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
    // Los platanos: every one of them is one instanced draw, plus one more
    // for the gold rim that says "grab me". Each pickup keeps a Group as a
    // transform proxy (not in the scene); syncVisuals copies it in.
    const fruit = platanoFruit();
    fruit.scale(1.35, 1.35, 1.35);
    fruit.translate(0, 0.27, 0);
    const PLATANOS = 40;
    this.platanoMesh = new THREE.InstancedMesh(fruit, trafficMaterial(), PLATANOS);
    this.platanoRim = new THREE.InstancedMesh(
      shell(fruit, 0.045),
      hazardMaterial(new THREE.MeshBasicMaterial({ color: 0xffe082, side: THREE.BackSide })),
      PLATANOS,
    );
    for (const m of [this.platanoMesh, this.platanoRim]) {
      m.count = 0;
      m.visible = false;
      m.frustumCulled = false;
      scene.add(m);
    }
    for (let i = 0; i < PLATANOS; i++) {
      const group = new THREE.Group();
      group.rotation.z = 0.14; // a little rake so the spin shows the curve
      group.visible = false;
      this.pickups.push({ kind: 'platano', group, active: false, x: 0, y: 0.55, z: 0, phase: Math.random() * 7 });
    }

    // Power-ups: one merged icon each, plus a light beam that marks it from
    // 80 m out. The names stay Spanish in EN (HANDOFF section 8). The beam is
    // light, not a tube: brightest where it faces the camera, fading to
    // nothing at its silhouette, rising out of the road with no hard foot
    // and thinning toward the sky. The old flat-alpha cylinder read as a
    // colored pillar standing on the asphalt.
    const beamGeo = new THREE.CylinderGeometry(0.5, 0.62, 3.6, 16, 1, true);
    beamGeo.translate(0, 0.95, 0);
    const beams: Record<PowerupKind, number> = { cafecito: 0xff9f43, bendicion: PALETTE.gold, iman: 0xff3b3b };
    for (const kind of ['cafecito', 'bendicion', 'iman'] as const) {
      const icon = powerupIcon(kind);
      const beamMat = worldMaterial(
        new THREE.ShaderMaterial({
          uniforms: { uColor: { value: new THREE.Color(beams[kind]) } },
          vertexShader: BEAM_VS,
          fragmentShader: BEAM_FS,
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      for (let i = 0; i < 2; i++) {
        const group = new THREE.Group();
        group.add(new THREE.Mesh(icon, trafficMaterial()), new THREE.Mesh(beamGeo, beamMat));
        group.visible = false;
        scene.add(group);
        this.pickups.push({ kind, group, active: false, x: 0, y: 0.7, z: 0, phase: Math.random() * 7 });
      }
    }
  }

  // Everything that only changes how traffic LOOKS, after the step moved it:
  // bob and lean, blob shadows, the ramas in the hoyos, the platano
  // instances, and power-ups turned to face the rider. Allocation-free.
  private syncVisuals(): void {
    const t = this.time;
    let n = 0;
    for (const v of this.vehicles) {
      if (!v.active) continue;
      if (v.speed > 0) {
        // every moving vehicle rides its springs; guaguas sit heavy on the
        // curb side and sway with it
        v.group.position.y = Math.abs(Math.sin(t * 7 + v.driftPhase)) * 0.03;
        if (v.type === 'guagua') v.group.rotation.z = 0.035 + Math.sin(t * 2.1 + v.driftPhase) * 0.015;
      }
      // the low sun sits ahead and to the sea side, so the blob stretches
      // back toward the rider and a little inland
      _m4.makeScale(v.halfW * 2.5, 1, v.halfL * 2.3 + 1);
      _m4.setPosition(v.x - 0.25, 0.025, v.z - 0.6);
      this.blobs.setMatrixAt(n++, _m4);
    }
    this.blobs.count = n;
    this.blobs.visible = n > 0; // an empty instanced mesh still costs a draw call
    this.blobs.instanceMatrix.needsUpdate = true;

    n = 0;
    for (const o of this.obstacles) {
      if (!o.active || o.kind !== 'hoyo') continue;
      _m4.makeRotationY(o.x * 5.3);
      _m4.setPosition(o.x, 0, o.z);
      this.ramas.setMatrixAt(n++, _m4);
    }
    this.ramas.count = n;
    this.ramas.visible = n > 0;
    this.ramas.instanceMatrix.needsUpdate = true;

    n = 0;
    for (const p of this.pickups) {
      if (!p.active) continue;
      if (p.kind === 'platano') {
        p.group.updateMatrix();
        this.platanoMesh.setMatrixAt(n, p.group.matrix);
        this.platanoRim.setMatrixAt(n, p.group.matrix);
        n++;
      } else {
        // a gentle sway instead of the spin: the icon never goes edge-on
        p.group.rotation.y = Math.sin(t * 1.7 + p.phase) * 0.35;
      }
    }
    this.platanoMesh.count = n;
    this.platanoRim.count = n;
    this.platanoMesh.visible = this.platanoRim.visible = n > 0;
    this.platanoMesh.instanceMatrix.needsUpdate = true;
    this.platanoRim.instanceMatrix.needsUpdate = true;
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
      room = Math.min(room, toShoulder - (halfW + (this.typeHalfW.get('guaguaParada') ?? 1.15)) * SIDE_CLEAR);
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
      v.shoveTo = NaN;
      v.spinT = -1;
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
      // A Bendición save slides the base over (eased, never a teleport) and
      // spins the car once around.
      if (!Number.isNaN(v.shoveTo)) {
        v.baseX += (v.shoveTo - v.baseX) * Math.min(1, CONFIG.shoveRate * dt);
        if (Math.abs(v.shoveTo - v.baseX) < 0.02) {
          v.baseX = v.shoveTo;
          v.shoveTo = NaN;
        }
      }
      if (v.spinT >= 0) {
        v.spinT += dt;
        const k = Math.min(1, v.spinT / CONFIG.shoveSpinSec);
        v.group.rotation.y = v.yaw0 + v.spinDir * Math.PI * 2 * (1 - (1 - k) * (1 - k));
        if (k >= 1) {
          v.group.rotation.y = v.yaw0;
          v.spinT = -1;
        }
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

    this.syncVisuals();
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
  // Clear right now is not enough: both keep their slow lane sway, so a pass
  // that starts clear can end with one in the other's side, and two that
  // stop side by side keep swaying (wave 2: a stopped line motoconcho beside
  // a stopped car leaning toward the line). Two whose sways can meet deeper
  // than SIDE_CLEAR share the line too, so one queues behind the other.
  private sharesLine(a: Vehicle, b: Vehicle): boolean {
    const w = a.halfW + b.halfW + 0.05;
    if (Math.abs(a.x - b.x) < w) return true;
    if (a.overtakeT >= 0 && Math.abs(a.baseX - b.x) < w) return true;
    if (b.overtakeT >= 0 && Math.abs(a.x - b.baseX) < w) return true;
    return Math.abs(a.baseX - b.baseX) - a.driftAmp - b.driftAmp < (a.halfW + b.halfW) * SIDE_CLEAR;
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
    return this.hitVehicle(px, pz, pr) !== null;
  }

  // The vehicle whose hitbox the rider's circle touches, or null.
  hitVehicle(px: number, pz: number, pr: number): VehicleHit | null {
    for (const v of this.vehicles) {
      if (!v.active) continue;
      const dzAbs = Math.abs(v.z - pz);
      if (dzAbs > v.halfL + 1.5) continue;
      const hw = v.halfW * HIT;
      const hl = v.halfL * HIT;
      const dx = Math.max(Math.abs(px - v.x) - hw, 0);
      const dz = Math.max(dzAbs - hl, 0);
      if (dx * dx + dz * dz < pr * pr) return v;
    }
    return null;
  }

  // ---------------- crash and save ----------------

  // The crash: what hit you stops dead where it is, so it stays in frame.
  stopVehicle(hit: VehicleHit): void {
    const v = hit as Vehicle;
    v.speed = 0;
    v.cruise = 0;
  }

  // La Bendición's second half. The car it took slides off the rider's line
  // with a spin, and every car on that line within shoveClearM ahead slides
  // off it too, so a save never turns into a second crash.
  shove(hit: VehicleHit, px: number, pr: number): void {
    const v = hit as Vehicle;
    this.slideOff(v, px, pr);
    v.spinT = 0;
    v.spinDir = v.x >= px ? 1 : -1;
    v.yaw0 = v.group.rotation.y;
    for (const o of this.vehicles) {
      if (!o.active || o === v || o.z < 0 || o.z - o.halfL > CONFIG.shoveClearM) continue;
      if (Math.abs(o.x - px) >= o.halfW * HIT + pr + CONFIG.shoveMarginM) continue;
      this.slideOff(o, px, pr);
    }
  }

  // Aim a vehicle at the nearest spot beside the rider's line, on its own
  // side of the rider, or the other side if the road runs out.
  private slideOff(v: Vehicle, px: number, pr: number): void {
    const need = v.halfW * HIT + pr + CONFIG.shoveMarginM;
    const lim = ROAD.edgeX - v.halfW;
    let to = px + (v.x >= px ? need : -need);
    if (Math.abs(to) > lim) to = px + (v.x >= px ? -need : need);
    v.shoveTo = Math.max(-lim, Math.min(lim, to));
    v.driftAmp = 0;
    v.overtakeT = -1;
    v.noRebase = true;
  }

  // Test hooks for automated checks; gameplay never calls these.
  debugSpawnPickup(kind: PickupKind, x: number, z: number, y?: number): boolean {
    return this.spawnPickup(kind, x, z, y);
  }

  debugSpawnObstacle(kind: ObstacleKind, x: number, z: number): boolean {
    return this.spawnObstacle(kind, x, z);
  }

  // drift: give the vehicle this lane sway after it is placed (an exactX
  // spawn has none). The spawn checks ran without it, so tests that pass it
  // own the geometry they build.
  debugSpawnVehicle(
    type: VehicleType,
    lane: number,
    z: number,
    dir: 1 | -1,
    exactX?: number,
    speed?: number,
    drift?: number,
  ): boolean {
    const v = this.spawnVehicle(type, lane, z, dir, speed, exactX);
    if (v && drift !== undefined) v.driftAmp = drift;
    return v !== null;
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
    this.syncVisuals();
  }
}
