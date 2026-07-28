// traffic.ts: vehicle archetypes, obstacles, pickups, wave patterns, and
// survivable-path validation. Everything here is pooled; nothing allocates
// in the step loop.
//
// The sacred rule lives in canPlace(): the 4 driving lanes are never all
// occupied inside one z window, so a survivable gap always exists. Shoulders
// (parked guaguas, vendor carts) sit outside that set: they remove escape
// hatches but never build the wall.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CONFIG, PALETTE, ROAD } from './config';
import { toonMaterial, textTexture, worldMaterial } from './world';

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
  halfW: number;
  halfL: number;
  passed: boolean;
  driftPhase: number;
  driftAmp: number;
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
    box(1.9, 0.55, 4.4, 0, 0.58, 0),
    box(1.65, 0.5, 2.1, 0, 1.05, -0.35),
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
  const painted = box(2.3, 1.7, 7, 0, 1.35, 0);
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
    box(2.2, 1.5, 1.7, 0, 1.15, 2.5), // cab
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
    box(1.85, 0.42, 4.2, 0, 0.46, 0),
    box(1.55, 0.36, 1.9, 0, 0.83, -0.15),
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

export class Traffic {
  private vehicles: Vehicle[] = [];
  private obstacles: Obstacle[] = [];
  private pickups: Pickup[] = [];
  private events: TrafficEvents;

  private time = 0;
  private elapsed = 0;
  private lastSpeed: number = CONFIG.baseSpeed;
  private spawnAcc = 0;
  private activeCount = 0;

  private nextPatternAt = -1;
  private vehiclePauseUntil = 0;
  private nextHoyoAt = -1;
  private nextPoliciaAt = -1;
  private nextCharcoAt = -1;
  private nextCartAt = -1;
  private nextPowerupAt = -1;
  private powerupCycle: PowerupKind[] = ['cafecito', 'bendicion', 'iman'];

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

    const darkMat = toonMaterial(PALETTE.darkParts);
    const greenMat = toonMaterial(PALETTE.platano);
    for (const [type, a] of defs) {
      for (let i = 0; i < a.pool; i++) {
        const group = new THREE.Group();
        const body = new THREE.Mesh(a.painted, toonMaterial(a.paints[i % a.paints.length]));
        body.castShadow = true;
        const dark = new THREE.Mesh(a.dark, darkMat);
        group.add(body, dark);
        if (a.accent) {
          const color = a.accentColor === 0 ? ACCENT_VARIED[i % ACCENT_VARIED.length] : a.accentColor!;
          group.add(new THREE.Mesh(a.accent, toonMaterial(color)));
        }
        if (a.green) group.add(new THREE.Mesh(a.green, greenMat));
        const blinkers = a.addExtras ? a.addExtras(group) : [];
        group.visible = false;
        scene.add(group);
        this.vehicles.push({
          type, group, active: false, lane: 0, baseX: 0, x: 0, z: 0, dir: 1,
          speed: 10, halfW: a.halfW, halfL: a.halfL, passed: false,
          driftPhase: Math.random() * 7, driftAmp: 0, blinkers,
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
    const bunch = (() => {
      const parts: THREE.BufferGeometry[] = [];
      for (const a of [-0.4, 0, 0.4]) {
        const g = new THREE.BoxGeometry(0.16, 0.5, 0.16);
        g.rotateZ(a);
        g.translate(a * 0.28, 0.25, 0);
        parts.push(g);
      }
      return mergeGeometries(parts)!;
    })();
    const platanoMat = toonMaterial(PALETTE.platano);
    for (let i = 0; i < 40; i++) {
      const group = new THREE.Group();
      group.add(new THREE.Mesh(bunch, platanoMat));
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

  private canPlace(lane: number, z: number, halfL: number): boolean {
    for (const v of this.vehicles) {
      if (!v.active || v.lane !== lane) continue;
      if (Math.abs(v.z - z) < CONFIG.sameLaneGapM + halfL + v.halfL) return false;
    }
    if (lane >= 0 && lane <= 3) {
      const occupied = new Set<number>([lane]);
      for (const v of this.vehicles) {
        if (v.active && v.lane >= 0 && v.lane <= 3 && Math.abs(v.z - z) < CONFIG.antiWallWindowM) {
          occupied.add(v.lane);
        }
      }
      if (occupied.size >= 4) return false;
    }
    return true;
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
    if (!this.canPlace(lane, z, 3.5)) return false;
    for (const v of this.vehicles) {
      if (v.active || v.type !== type) continue;
      v.active = true;
      v.lane = lane;
      v.dir = dir;
      v.z = z;
      v.passed = false;
      const isStatic = type === 'guaguaParada' || type === 'cart';
      if (isStatic) {
        v.speed = 0;
        v.driftAmp = 0;
        v.baseX = lane === 4 ? ROAD.shoulderCenters[1] : ROAD.shoulderCenters[0];
        v.group.rotation.y = (Math.random() - 0.5) * 0.14;
      } else {
        const range = CONFIG.vehicleSpeeds[type as keyof typeof CONFIG.vehicleSpeeds];
        v.speed = speedOverride ?? rand(range[0], range[1]);
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
      const n = Math.random() < 0.4 ? 5 : 4;
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

  private spawnFiller(): void {
    const allowOncoming = this.elapsed >= CONFIG.oncomingUnlockSec;
    const dir: 1 | -1 = allowOncoming && Math.random() < 0.46 ? -1 : 1;
    const w = CONFIG.vehicleWeights;
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
    const first = Math.random() < 0.5 ? 0 : 1;
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

    const blinkOn = this.time % 0.9 < 0.45;

    for (const v of this.vehicles) {
      if (!v.active) continue;
      v.z += (v.dir === 1 ? v.speed : -v.speed) * dt - ds;
      if (v.z < -(CONFIG.despawnBehind + v.halfL * 2) || v.z > 320) {
        v.active = false;
        v.group.visible = false;
        this.activeCount--;
        continue;
      }
      if (v.driftAmp > 0) v.x = v.baseX + Math.sin(this.time * 0.55 + v.driftPhase) * v.driftAmp;
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

  reset(): void {
    for (const v of this.vehicles) {
      v.active = false;
      v.group.visible = false;
    }
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
  }
}
