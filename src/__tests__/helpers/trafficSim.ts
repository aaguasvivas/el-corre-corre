// Headless traffic for tests: the real Traffic class in node, with a no-op
// canvas and a seeded Math.random. The speed model mirrors main.ts stepSim
// (ramp, per-ride cap and multiplier, a fixed throttle factor).

import * as THREE from 'three';
import { CONFIG, ROAD, VEHICLES, type VehicleId } from '../../config';
import { Traffic, type PowerupKind, type SetPieceKind, type StepCtx, type TrafficEvents } from '../../traffic';

export const H = CONFIG.fixedDt;
export const START_X = (ROAD.laneCenters[0] + ROAD.laneCenters[1]) / 2;

function installCanvasStub(): void {
  const g = globalThis as Record<string, unknown>;
  if (g.document) return;
  const ctx2d = new Proxy(
    {},
    {
      get(_t, p) {
        if (p === 'createLinearGradient' || p === 'createRadialGradient') return () => ({ addColorStop() {} });
        if (p === 'measureText') return () => ({ width: 10 });
        return () => {};
      },
      set() {
        return true;
      },
    },
  );
  g.document = { createElement: () => ({ width: 1, height: 1, style: {}, getContext: () => ctx2d }) };
}

const realRandom = Math.random;

// mulberry32: small, fast, and the same stream on every machine
export function seedRandom(s: number): void {
  let a = s >>> 0;
  Math.random = () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function restoreRandom(): void {
  Math.random = realRandom;
}

export interface Tally {
  nearMiss: number;
  clearances: number[];
  platanos: number;
  powerups: PowerupKind[];
  rebases: number;
  hornsBehind: number;
  setPieces: SetPieceKind[];
  escalations: number[];
  policia: number;
}

export function newTally(): Tally {
  return {
    nearMiss: 0,
    clearances: [],
    platanos: 0,
    powerups: [],
    rebases: 0,
    hornsBehind: 0,
    setPieces: [],
    escalations: [],
    policia: 0,
  };
}

export class Sim {
  readonly traffic: Traffic;
  tally: Tally = newTally();
  onPolicia: (() => void) | null = null;
  ride: VehicleId = 'motor';
  throttle = 1; // speed factor: 1 cruise, 1.3 gas, 0.7 brake
  elapsed = 0;
  dist = 0;
  eff: number = CONFIG.baseSpeed;
  private readonly ctx: StepCtx = {
    ds: 0, dt: H, elapsed: 0, speed: 0, playerX: START_X, playerY: 0, playerR: CONFIG.playerRadius,
    playerCv: false, live: true, airborne: false, wheelie: false, magnet: false,
    runDist: 0, shielded: false, cafecito: false,
  };

  // buildSeed: construction still draws randoms (art variety, geometry
  // uuids), so it is seeded too; otherwise a test would depend on the
  // process. The drift phases no longer come from it (traffic.ts takes them
  // from the pool slot), so art edits cannot reshuffle seeded traffic.
  constructor(buildSeed = 1) {
    installCanvasStub();
    seedRandom(buildSeed);
    const t = (): Tally => this.tally;
    const events: TrafficEvents = {
      onNearMiss: (_x, _z, clearance) => {
        t().nearMiss++;
        t().clearances.push(clearance);
      },
      onPlatano: () => {
        t().platanos++;
      },
      onPowerup: (kind) => {
        t().powerups.push(kind);
      },
      onHoyo: () => {},
      onPolicia: () => {
        t().policia++;
        this.onPolicia?.();
      },
      onCharco: () => {},
      onRebase: () => {
        t().rebases++;
      },
      onHornBehind: () => {
        t().hornsBehind++;
      },
      onSetPiece: (kind) => {
        t().setPieces.push(kind);
      },
      onEscalate: (tier) => {
        t().escalations.push(tier);
      },
    };
    this.traffic = new Traffic(new THREE.Scene(), events);
  }

  // A fresh run on the Malecón, the way main.ts starts one.
  start(seed: number, opening = true): void {
    seedRandom(seed);
    this.traffic.reset();
    this.traffic.setTramo('malecon');
    if (opening) this.traffic.startRun();
    this.tally = newTally();
    this.elapsed = 0;
    this.dist = 0;
  }

  get radius(): number {
    return CONFIG.playerRadius * VEHICLES[this.ride].hitbox;
  }

  // One fixed step with the rider at x (height y). Returns the ctx used.
  step(x: number, y = 0, over?: Partial<StepCtx>): StepCtx {
    const veh = VEHICLES[this.ride];
    this.elapsed += H;
    this.eff =
      Math.min(veh.speedCap, CONFIG.baseSpeed + CONFIG.speedRampPerSec * this.elapsed) * veh.speedMult * this.throttle;
    this.dist += this.eff * H;
    const c = this.ctx;
    c.ds = this.eff * H;
    c.elapsed = this.elapsed;
    c.speed = this.eff;
    c.playerX = x;
    c.playerY = y;
    c.playerR = this.radius;
    c.playerCv = x > CONFIG.contraViaMinX && x < ROAD.halfRoad;
    c.runDist = this.dist;
    c.airborne = y > 0;
    c.shielded = false;
    c.cafecito = false;
    c.magnet = false;
    c.live = true; // an override holds for its own step only
    if (over) Object.assign(c, over);
    this.traffic.step(c);
    return c;
  }
}

// Forward lateral reachability over the whole road: can a rider with the
// ride's top lateral speed stay out of every hitbox at every tick? A tick
// with no reachable free bin is an unavoidable wall.
export class WallScan {
  private readonly bin = 0.025;
  private readonly edge: number;
  private readonly nb: number;
  private readonly dil: number;
  private reach: Uint8Array;
  private next: Uint8Array;
  private readonly free: Uint8Array;
  walls = 0;

  constructor(private readonly ride: VehicleId) {
    const veh = VEHICLES[ride];
    this.edge = ROAD.edgeX - CONFIG.playerHalfWidth * veh.hitbox;
    this.nb = Math.floor((2 * this.edge) / this.bin) + 1;
    this.dil = Math.max(1, Math.floor((CONFIG.lateralMaxSpeed * veh.latMaxMult * H) / this.bin));
    this.reach = new Uint8Array(this.nb).fill(1);
    this.next = new Uint8Array(this.nb);
    this.free = new Uint8Array(this.nb);
  }

  reset(): void {
    this.reach.fill(1);
  }

  update(traffic: Traffic): void {
    const r = CONFIG.playerRadius * VEHICLES[this.ride].hitbox;
    const { bin, edge, nb, dil, free } = this;
    free.fill(1);
    for (const v of traffic.vehicleViews) {
      if (!v.active) continue;
      const hw = v.halfW * CONFIG.vehicleHitboxScale;
      const hl = v.halfL * CONFIG.vehicleHitboxScale;
      const az = Math.abs(v.z);
      if (az >= hl + r) continue;
      const ext = az <= hl ? hw + r : hw + Math.sqrt(r * r - (az - hl) * (az - hl));
      const lo = Math.max(0, Math.ceil((v.x - ext + edge) / bin));
      const hi = Math.min(nb - 1, Math.floor((v.x + ext + edge) / bin));
      for (let b = lo; b <= hi; b++) free[b] = 0;
    }
    let any = 0;
    for (let b = 0; b < nb; b++) {
      let ok = 0;
      const lo = Math.max(0, b - dil);
      const hi = Math.min(nb - 1, b + dil);
      for (let k = lo; k <= hi; k++) {
        if (this.reach[k]) {
          ok = 1;
          break;
        }
      }
      this.next[b] = ok & free[b];
      any |= this.next[b];
    }
    if (!any) {
      this.walls++;
      this.next.set(free); // restart from whatever is free now
    }
    const tmp = this.reach;
    this.reach = this.next;
    this.next = tmp;
  }
}
