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
import { textTexture, worldMaterial, paint, getGradientMap } from './world';

export type VehicleType = 'sedan' | 'guagua' | 'camion' | 'civic' | 'motoconcho' | 'guaguaParada' | 'cart';
export type PowerupKind = 'cafecito' | 'bendicion' | 'iman';

export interface TrafficEvents {
  onNearMiss(x: number, z: number): void;
  onPlatano(x: number, y: number, z: number): void;
  onPowerup(kind: PowerupKind, x: number, z: number): void;
  onHoyo(): void;
  onPolicia(): void;
  onCharco(): void;
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

function civicAssets(): TypeAssets {
  const glowGeo = new THREE.PlaneGeometry(2.3, 4.7);
  glowGeo.rotateX(-Math.PI / 2);
  glowGeo.translate(0, 0.04, 0);
  const glowMat = hazardMaterial(
    new THREE.MeshBasicMaterial({ color: PALETTE.underglow, transparent: true, opacity: 0.5 }),
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
// next one sees it. A stick with a twig and a few leaf clusters.
function ramaGeometry(): THREE.BufferGeometry {
  const k = new Kit();
  k.add(cyl(0.028, 0.045, 1.35, 0, 0.62, 0, 5), PALETTE.palmTrunk);
  const twig = new THREE.CylinderGeometry(0.016, 0.024, 0.42, 4);
  twig.rotateZ(-0.9);
  twig.translate(0.14, 0.98, 0);
  k.add(twig, PALETTE.palmTrunk);
  const leaf = (x: number, y: number, z: number, s: number, color: number): void => {
    const g = new THREE.OctahedronGeometry(0.2 * s, 0);
    g.scale(1, 0.6, 1.3);
    g.translate(x, y, z);
    k.add(g, color);
  };
  leaf(0, 1.34, 0, 1, PALETTE.palmFronds);
  leaf(0.17, 1.2, 0.08, 0.85, PALETTE.platano);
  leaf(-0.13, 1.22, -0.07, 0.8, PALETTE.platano);
  leaf(0.3, 1.1, -0.02, 0.75, PALETTE.palmFronds);
  const g = k.build();
  g.rotateZ(0.26); // stuck in at an angle, never straight
  return g;
}

// Scratch buffer for the corridor sweep: flat [start, end, start, end, ...] so
// spawn validation allocates nothing.
const _corridorBlocks: number[] = [];
const _m4 = new THREE.Matrix4();

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
  private powerupCycle: PowerupKind[] = ['cafecito', 'bendicion', 'iman'];

  // Instanced art, filled from the pools every step by syncVisuals()
  private blobs!: THREE.InstancedMesh;
  private ramas!: THREE.InstancedMesh;
  private platanoMesh!: THREE.InstancedMesh;
  private platanoRim!: THREE.InstancedMesh;

  get activeCars(): number {
    return this.activeCount;
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

    const mat = trafficMaterial();
    for (const [type, a] of defs) {
      this.typeHalfW.set(type, a.halfW);
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
          driftPhase: Math.random() * 7, driftAmp: 0, overtakeT: -1, cruise: 0, blinkers,
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
    // 80 m out. The names stay Spanish in EN (HANDOFF section 8).
    const beamTex = (() => {
      const c = document.createElement('canvas');
      c.width = 2;
      c.height = 64;
      const g = c.getContext('2d')!;
      const grad = g.createLinearGradient(0, 64, 0, 0);
      grad.addColorStop(0, 'rgb(96,96,96)');
      grad.addColorStop(1, 'rgb(0,0,0)');
      g.fillStyle = grad;
      g.fillRect(0, 0, 2, 64);
      return new THREE.CanvasTexture(c);
    })();
    const beamGeo = new THREE.CylinderGeometry(0.62, 0.62, 3.6, 16, 1, true);
    beamGeo.translate(0, 0.95, 0);
    const beams: Record<PowerupKind, number> = { cafecito: 0xff9f43, bendicion: PALETTE.gold, iman: 0xff3b3b };
    for (const kind of ['cafecito', 'bendicion', 'iman'] as const) {
      const icon = powerupIcon(kind);
      const beamMat = worldMaterial(
        new THREE.MeshBasicMaterial({
          color: beams[kind],
          alphaMap: beamTex,
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          fog: false,
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

  // The brief's sacred rule: never commit a spawn that leaves no continuous
  // gap of at least minCorridorMult player widths. This measures the real
  // corridor across the whole road, shoulders included (parked guaguas and
  // vendor carts narrow it too), among everything that ARRIVES together.
  private widestCorridor(lane: number, halfW: number, tCand: number, tWin: number): number {
    const blocks = _corridorBlocks;
    blocks.length = 0;
    // the candidate itself, plus the lane jitter it may be given
    const cx = this.laneX(lane);
    const cw = halfW * CONFIG.vehicleHitboxScale + CONFIG.laneJitterM;
    blocks.push(cx - cw, cx + cw);
    for (const v of this.vehicles) {
      if (!v.active) continue;
      const t = this.arrivalTime(v.z, v.dir, v.speed);
      if (!isFinite(t) || Math.abs(t - tCand) > tWin) continue;
      const w = v.halfW * CONFIG.vehicleHitboxScale;
      blocks.push(v.x - w, v.x + w);
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

  private canPlace(lane: number, z: number, halfL: number, halfW: number, dir: 1 | -1, speed: number): boolean {
    for (const v of this.vehicles) {
      if (!v.active || v.lane !== lane) continue;
      if (Math.abs(v.z - z) < CONFIG.sameLaneGapM + halfL + v.halfL) return false;
    }
    const tCand = this.arrivalTime(z, dir, speed);
    if (!isFinite(tCand)) return true; // never reaches the player, cannot wall them
    const tWin = CONFIG.antiWallWindowM / Math.max(this.lastPlayerSpeed, 1);
    const need = CONFIG.minCorridorMult * 2 * this.lastPlayerR;
    return this.widestCorridor(lane, halfW, tCand, tWin) >= need;
  }

  private laneHasVehicleNear(lane: number, z: number, window: number): boolean {
    for (const v of this.vehicles) {
      if (v.active && v.lane === lane && Math.abs(v.z - z) < window) return true;
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
  ): boolean {
    if (this.activeCount >= CONFIG.trafficMaxActive) return false;
    const isStaticType = type === 'guaguaParada' || type === 'cart';
    const range = CONFIG.vehicleSpeeds[type as keyof typeof CONFIG.vehicleSpeeds];
    const planSpeed = isStaticType ? 0 : (speedOverride ?? (range[0] + range[1]) / 2);
    if (!this.canPlace(lane, z, 3.5, this.typeHalfW.get(type) ?? 1, dir, planSpeed)) return false;
    for (const v of this.vehicles) {
      if (v.active || v.type !== type) continue;
      v.active = true;
      v.lane = lane;
      v.dir = dir;
      v.z = z;
      v.passed = false;
      if (isStaticType) {
        v.speed = 0;
        v.driftAmp = 0;
        v.baseX = lane === 4 ? ROAD.shoulderCenters[1] : ROAD.shoulderCenters[0];
        v.group.rotation.y = (Math.random() - 0.5) * 0.14;
      } else {
        v.speed = speedOverride ?? rand(range[0], range[1]);
        v.cruise = v.speed;
        v.driftAmp = exactX === undefined ? Math.random() * 0.3 : 0; // Dominican lane discipline
        v.baseX = exactX ?? ROAD.laneCenters[lane] + rand(-0.4, 0.4);
        v.group.rotation.y = dir === 1 ? 0 : Math.PI;
      }
      v.x = v.baseX;
      v.group.position.set(v.x, 0, v.z);
      v.group.visible = true;
      this.activeCount++;
      return true;
    }
    return false;
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
      return true;
    }
    return false;
  }

  // ---------------- wave patterns ----------------

  private sameBase(): number {
    return CONFIG.spawnAhead + rand(5, 20);
  }

  private oncBase(extraSpeed = 16): number {
    const need = (this.lastSpeed + extraSpeed) * CONFIG.telegraphMinSec * 1.15;
    return Math.max(CONFIG.spawnAhead + 15, need) + rand(0, 20);
  }

  private runPattern(): void {
    const opts: Array<readonly [string, number]> = [
      ['convoy', 24],
      ['zigzag', 30],
      ['breather', 18],
    ];
    if (this.elapsed > 20) {
      opts.push(['guaguaStop', 14], ['oncomingSwarm', 18]);
    }
    if (this.elapsed > 40) opts.push(['hoyoField', 14]);
    const pick = pickWeighted(opts);

    if (pick === 'convoy') {
      const lane = Math.random() < 0.5 ? 0 : 1;
      const z0 = this.sameBase();
      const n = Math.random() < 0.5 ? 3 : 4;
      const spacing = rand(13, 17);
      for (let i = 0; i < n; i++) {
        const type: VehicleType = i === 0 && Math.random() < 0.4 && this.elapsed > CONFIG.bigVehicleUnlockSec
          ? 'guagua'
          : Math.random() < 0.75 ? 'sedan' : 'motoconcho';
        this.spawnVehicle(type, lane, z0 + i * spacing, 1);
      }
    } else if (pick === 'zigzag') {
      const z0 = this.sameBase();
      let lane = Math.random() < 0.5 ? 0 : 1;
      const spacing = rand(17, 21);
      for (let i = 0; i < 4; i++) {
        const type: VehicleType =
          this.elapsed > CONFIG.civicUnlockSec && Math.random() < 0.3
            ? 'civic'
            : Math.random() < 0.7 ? 'sedan' : 'motoconcho';
        this.spawnVehicle(type, lane, z0 + i * spacing, 1);
        lane = lane === 0 ? 1 : 0;
      }
    } else if (pick === 'guaguaStop') {
      const seaSide = Math.random() < 0.2;
      const z0 = this.sameBase();
      this.spawnVehicle('guaguaParada', seaSide ? 4 : -1, z0, 1);
      this.spawnVehicle('sedan', seaSide ? 3 : 0, z0 - rand(4, 10), seaSide ? -1 : 1);
    } else if (pick === 'oncomingSwarm') {
      const z0 = this.oncBase();
      let lane = Math.random() < 0.5 ? 2 : 3;
      const n = this.elapsed > 60 ? 5 + (Math.random() < 0.5 ? 1 : 0) : Math.random() < 0.4 ? 5 : 4;
      const spacing = rand(14, 19);
      for (let i = 0; i < n; i++) {
        const type: VehicleType =
          i === n - 1 && Math.random() < 0.3 && this.elapsed > CONFIG.bigVehicleUnlockSec
            ? 'guagua'
            : Math.random() < 0.65 ? 'sedan' : 'motoconcho';
        this.spawnVehicle(type, lane, z0 + i * spacing, -1);
        lane = lane === 2 ? 3 : 2;
      }
    } else if (pick === 'breather') {
      this.vehiclePauseUntil = this.elapsed + 2.8;
      const lane = Math.floor(Math.random() * 4);
      const z0 = this.sameBase();
      const n = 7;
      for (let i = 0; i < n; i++) {
        this.spawnPickup('platano', ROAD.laneCenters[lane] + rand(-0.2, 0.2), z0 + i * 2.3);
      }
      if (Math.random() < 0.3) this.schedulePowerupNow(z0 + n * 2.3 + 4);
    } else if (pick === 'hoyoField') {
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

  private schedulePowerupNow(z: number): void {
    const kind = this.powerupCycle[Math.floor(Math.random() * this.powerupCycle.length)];
    const lane = Math.floor(Math.random() * 4);
    const x = ROAD.laneCenters[lane];
    if (!this.laneHasVehicleNear(lane, z, 12)) this.spawnPickup(kind, x, z);
  }

  // Los Tramos: each stretch has its own traffic personality. World tells us
  // where we are; the filler mix follows.
  private tramo: keyof typeof CONFIG.tramoVehicleWeights = 'malecon';

  setTramo(t: keyof typeof CONFIG.tramoVehicleWeights): void {
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
    if (dir === 1 && this.elapsed > CONFIG.civicUnlockSec) opts.push(['civic', w.civic]);
    const type = pickWeighted(opts);
    const lanes: [number, number] = dir === 1 ? [0, 1] : [2, 3];
    let first = Math.random() < 0.5 ? 0 : 1;
    // En contra via, the road answers: oncoming filler aims for your lane.
    if (dir === -1 && this.lastPlayerCv && Math.random() < CONFIG.cvTargetBias) {
      first = this.lastPlayerX < ROAD.laneCenters[2] + CONFIG.laneWidth / 2 ? 0 : 1;
    }
    const range = CONFIG.vehicleSpeeds[type as keyof typeof CONFIG.vehicleSpeeds];
    const z = type === 'civic'
      ? 80 + rand(0, 25) // slow closing speed: let the civic enter through the fog sooner
      : dir === 1 ? this.sameBase() : this.oncBase(range[1]);
    for (const cand of [lanes[first], lanes[1 - first]]) {
      if (this.spawnVehicle(type, cand, z, dir)) return;
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

    const blinkOn = this.time % 0.9 < 0.45;

    // El que va alante manda: same lane, same direction, nobody drives
    // through the vehicle ahead. A faster follower that closes inside its
    // headway matches the leader's speed instead of ghosting through.
    // Spawn validation only guarantees the moment of spawn; this holds the
    // promise for the rest of every vehicle's life.
    for (const v of this.vehicles) {
      if (!v.active || v.speed === 0) continue;
      let leaderSpeed = -1;
      let bestGap = Infinity;
      for (const o of this.vehicles) {
        if (o === v || !o.active || o.lane !== v.lane || o.dir !== v.dir) continue;
        const gap = (o.z - v.z) * v.dir - o.halfL - v.halfL;
        if (gap >= -0.5 && gap < bestGap) {
          bestGap = gap;
          leaderSpeed = o.speed;
        }
      }
      if (leaderSpeed >= 0 && bestGap < 2 + v.speed * 0.12 && leaderSpeed < v.speed) {
        v.speed = leaderSpeed;
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
        // ease onto the seam and back off; lane 1 swings +x, lane 2 swings -x
        v.overtakeT += dt;
        const k = Math.sin(Math.PI * Math.min(1, v.overtakeT / CONFIG.overtakeSec));
        vx += (v.lane === 1 ? 1 : -1) * 1.55 * k;
        if (v.overtakeT >= CONFIG.overtakeSec) v.overtakeT = -1;
      }
      v.x = vx;
      v.group.position.x = v.x;
      v.group.position.z = v.z;
      for (const b of v.blinkers) b.visible = blinkOn;

      if (live && !v.passed && v.z <= 0) {
        v.passed = true;
        const clearance = Math.abs(ctx.playerX - v.x) - (v.halfW * CONFIG.vehicleHitboxScale + ctx.playerR);
        if (clearance >= 0 && clearance <= CONFIG.nearMissRadius) {
          this.events.onNearMiss(v.x, v.z);
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

    const density =
      CONFIG.trafficDensityStart +
      (CONFIG.trafficDensityMax - CONFIG.trafficDensityStart) * Math.min(1, elapsed / CONFIG.densityRampSec);

    if (this.nextPatternAt < 0) this.nextPatternAt = CONFIG.gentleStartSec * 0.7 + rand(0, 2);
    const patternsRunning = elapsed >= this.nextPatternAt || elapsed > CONFIG.gentleStartSec;
    if (elapsed >= this.nextPatternAt) {
      if (elapsed >= this.vehiclePauseUntil) this.runPattern();
      this.nextPatternAt = elapsed + rand(CONFIG.patternIntervalMin, CONFIG.patternIntervalMax) / (0.6 + 0.4 * density);
    }

    let rate = CONFIG.spawnsPerSecAtFull * density;
    if (elapsed < CONFIG.gentleStartSec) rate *= CONFIG.gentleSpawnFactor;
    if (patternsRunning) rate *= CONFIG.fillerPatternShare;
    this.spawnAcc += rate * dt;
    while (this.spawnAcc >= 1) {
      this.spawnAcc -= 1;
      if (elapsed >= this.vehiclePauseUntil) this.spawnFiller();
    }

    // El rebase: swing an inner-lane vehicle onto the center seam. This is
    // why parking on the yellow line is not a free ride: the seam belongs to
    // whoever is overtaking. Cadence tightens with density.
    if (elapsed > CONFIG.overtakeUnlockSec) {
      if (this.nextOvertakeAt < 0) {
        this.nextOvertakeAt = elapsed + rand(CONFIG.overtakeEvery[0], CONFIG.overtakeEvery[1]);
      }
      if (elapsed >= this.nextOvertakeAt) {
        this.nextOvertakeAt =
          elapsed + rand(CONFIG.overtakeEvery[0], CONFIG.overtakeEvery[1]) / (0.5 + 0.5 * density);
        let best: Vehicle | null = null;
        for (const v of this.vehicles) {
          // inner lanes only, moving, far enough out to telegraph the swing
          if (!v.active || v.speed === 0 || v.overtakeT >= 0) continue;
          if (v.lane !== 1 && v.lane !== 2) continue;
          if (v.z < 45 || v.z > 150) continue;
          if (!best || v.z < best.z) best = v; // the nearest telegraphable one
        }
        // Only swing if the seam neighborhood is clear: a rebase into the
        // side of an inner-lane neighbor looks exactly like the ghosting
        // this system exists to prevent.
        if (best) {
          let clear = true;
          for (const o of this.vehicles) {
            if (o === best || !o.active) continue;
            if ((o.lane === 1 || o.lane === 2) && Math.abs(o.z - best.z) < 8) {
              clear = false;
              break;
            }
          }
          if (clear) best.overtakeT = 0;
        }
      }
    }

    // Standalone obstacles, carts, and power-ups on their own cadence
    this.nextHoyoAt = this.cadence(this.nextHoyoAt, CONFIG.hoyoUnlockSec, CONFIG.hoyoEvery, () => {
      const lane = Math.floor(Math.random() * 4);
      const z = this.sameBase();
      if (!this.laneHasVehicleNear(lane, z, 14)) {
        this.spawnObstacle('hoyo', ROAD.laneCenters[lane] + rand(-0.6, 0.6), z);
      }
    });
    this.nextPoliciaAt = this.cadence(this.nextPoliciaAt, CONFIG.policiaUnlockSec, CONFIG.policiaEvery, () => {
      const z = this.sameBase() + 10;
      this.spawnObstacle('policia', 0, z);
      if (Math.random() < 0.45) {
        for (let i = -2; i <= 2; i++) {
          const y = Math.max(0.55, 1.35 - i * i * 0.18);
          this.spawnPickup('platano', rand(-1, 1), z + i * 2.1, y);
        }
      }
    });
    this.nextCharcoAt = this.cadence(this.nextCharcoAt, CONFIG.charcoUnlockSec, CONFIG.charcoEvery, () => {
      const lane = Math.floor(Math.random() * 4);
      const z = this.sameBase();
      if (!this.laneHasVehicleNear(lane, z, 10)) {
        this.spawnObstacle('charco', ROAD.laneCenters[lane] + rand(-0.5, 0.5), z);
      }
    });
    this.nextCartAt = this.cadence(this.nextCartAt, CONFIG.cartUnlockSec, CONFIG.cartEvery, () => {
      this.spawnVehicle('cart', Math.random() < 0.6 ? -1 : 4, this.sameBase(), 1);
    });
    this.nextPowerupAt = this.cadence(this.nextPowerupAt, CONFIG.powerupUnlockSec, CONFIG.powerupEvery, () => {
      this.schedulePowerupNow(this.sameBase());
    });
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
      const hw = v.halfW * CONFIG.vehicleHitboxScale;
      const hl = v.halfL * CONFIG.vehicleHitboxScale;
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

  debugSpawnVehicle(type: VehicleType, lane: number, z: number, dir: 1 | -1, exactX?: number): boolean {
    return this.spawnVehicle(type, lane, z, dir, undefined, exactX);
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
    this.syncVisuals();
  }
}
