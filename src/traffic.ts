// traffic.ts: pooled generic sedans in both directions, spawn validation,
// and circle-vs-rect collision. Phase 2 replaces the simple spawner with
// authored wave patterns; the validation rules here already enforce the
// sacred no-unavoidable-wall rule for a 4-lane road (never all 4 lanes
// occupied inside one z window).

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CONFIG, PALETTE, ROAD } from './config';
import { toonMaterial } from './world';

const POOL_SIZE = 36;

interface Car {
  group: THREE.Group;
  active: boolean;
  lane: number;
  z: number;
  dir: 1 | -1; // 1 = same direction as the player
  speed: number;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export class Traffic {
  private cars: Car[] = [];
  private spawnAcc = 0;
  private elapsed = 0;
  private activeCount = 0;

  get activeCars(): number {
    return this.activeCount;
  }

  constructor(scene: THREE.Scene) {
    const paintedGeo = this.buildPaintedGeo();
    const darkGeo = this.buildDarkGeo();
    const darkMat = toonMaterial(PALETTE.darkParts);
    for (let i = 0; i < POOL_SIZE; i++) {
      const group = new THREE.Group();
      const paint = PALETTE.carPaints[i % PALETTE.carPaints.length];
      const body = new THREE.Mesh(paintedGeo, toonMaterial(paint));
      body.castShadow = true;
      const dark = new THREE.Mesh(darkGeo, darkMat);
      group.add(body, dark);
      group.visible = false;
      scene.add(group);
      this.cars.push({ group, active: false, lane: 0, z: 0, dir: 1, speed: 10 });
    }
  }

  // Chunky sedan, front toward +z. Painted parts and dark parts are two merged
  // meshes per car (2 draw calls each). DECISION: traffic wheels do not spin in
  // Phase 1; the Phase 2 archetype pass revisits that.
  private buildPaintedGeo(): THREE.BufferGeometry {
    const body = new THREE.BoxGeometry(CONFIG.carWidth, 0.55, CONFIG.carLength);
    body.translate(0, 0.58, 0);
    const cabin = new THREE.BoxGeometry(CONFIG.carWidth - 0.25, 0.5, 2.1);
    cabin.translate(0, 1.05, -0.35);
    return mergeGeometries([body, cabin])!;
  }

  private buildDarkGeo(): THREE.BufferGeometry {
    const parts: THREE.BufferGeometry[] = [];
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const wheel = new THREE.CylinderGeometry(0.34, 0.34, 0.24, 10);
        wheel.rotateZ(Math.PI / 2);
        wheel.translate(sx * 0.85, 0.34, sz * 1.4);
        parts.push(wheel);
      }
    }
    const windshield = new THREE.BoxGeometry(CONFIG.carWidth - 0.5, 0.4, 0.08);
    windshield.rotateX(-0.18);
    windshield.translate(0, 1.05, 0.72);
    parts.push(windshield);
    return mergeGeometries(parts)!;
  }

  step(ds: number, dt: number, elapsed: number): void {
    this.elapsed = elapsed;
    for (const car of this.cars) {
      if (!car.active) continue;
      car.z += (car.dir === 1 ? car.speed : -car.speed) * dt - ds;
      if (car.z < -(CONFIG.despawnBehind + CONFIG.carLength)) {
        car.active = false;
        car.group.visible = false;
        this.activeCount--;
        continue;
      }
      car.group.position.z = car.z;
    }

    const density = lerp(
      CONFIG.trafficDensityStart,
      CONFIG.trafficDensityMax,
      Math.min(1, elapsed / CONFIG.densityRampSec),
    );
    let rate = CONFIG.spawnsPerSecAtFull * density;
    if (elapsed < CONFIG.gentleStartSec) rate *= CONFIG.gentleSpawnFactor;
    this.spawnAcc += rate * dt;
    while (this.spawnAcc >= 1) {
      this.spawnAcc -= 1;
      this.trySpawn();
    }
  }

  private trySpawn(): void {
    if (this.activeCount >= CONFIG.trafficMaxActive) return;
    const allowOncoming = this.elapsed >= CONFIG.oncomingUnlockSec;
    const dir: 1 | -1 = allowOncoming && Math.random() < 0.48 ? -1 : 1;
    const z =
      dir === 1
        ? CONFIG.spawnAhead + Math.random() * 20
        : CONFIG.spawnAhead + 15 + Math.random() * 25;

    const first = Math.random() < 0.5 ? 0 : 1;
    const laneOffset = dir === 1 ? 0 : 2;
    for (const cand of [laneOffset + first, laneOffset + (1 - first)]) {
      if (this.laneBlocked(cand, z) || this.wouldWall(cand, z)) continue;
      this.activate(cand, z, dir);
      return;
    }
  }

  private laneBlocked(lane: number, z: number): boolean {
    for (const car of this.cars) {
      if (car.active && car.lane === lane && Math.abs(car.z - z) < CONFIG.sameLaneGapM) return true;
    }
    return false;
  }

  private wouldWall(lane: number, z: number): boolean {
    const occupied = new Set<number>([lane]);
    for (const car of this.cars) {
      if (car.active && Math.abs(car.z - z) < CONFIG.antiWallWindowM) occupied.add(car.lane);
    }
    return occupied.size >= 4;
  }

  private activate(lane: number, z: number, dir: 1 | -1): void {
    for (const car of this.cars) {
      if (car.active) continue;
      car.active = true;
      car.lane = lane;
      car.z = z;
      car.dir = dir;
      car.speed =
        dir === 1
          ? lerp(CONFIG.sameDirSpeedMin, CONFIG.sameDirSpeedMax, Math.random())
          : lerp(CONFIG.oncomingSpeedMin, CONFIG.oncomingSpeedMax, Math.random());
      car.group.position.set(ROAD.laneCenters[lane] + (Math.random() - 0.5) * 0.9, 0, z);
      car.group.rotation.y = dir === 1 ? 0 : Math.PI;
      car.group.visible = true;
      this.activeCount++;
      return;
    }
  }

  checkCollision(px: number, pz: number, pr: number): boolean {
    const hw = (CONFIG.carWidth / 2) * CONFIG.vehicleHitboxScale;
    const hl = (CONFIG.carLength / 2) * CONFIG.vehicleHitboxScale;
    for (const car of this.cars) {
      if (!car.active) continue;
      const dzAbs = Math.abs(car.z - pz);
      if (dzAbs > 4) continue;
      const dx = Math.max(Math.abs(px - car.group.position.x) - hw, 0);
      const dz = Math.max(dzAbs - hl, 0);
      if (dx * dx + dz * dz < pr * pr) return true;
    }
    return false;
  }

  reset(): void {
    for (const car of this.cars) {
      car.active = false;
      car.group.visible = false;
    }
    this.activeCount = 0;
    this.spawnAcc = 0;
  }
}
