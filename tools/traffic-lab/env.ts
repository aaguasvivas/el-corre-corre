// Headless environment for the traffic lab: the REAL src/traffic.ts in node,
// with a no-op canvas, an in-memory localStorage and a seeded Math.random.
// Adapted from the audit harness (docs/audit/raw/harness/traffic-lane).
//
// Run the lab with: npx vite-node tools/traffic-lab/lab.ts -- <sections>

import * as THREE from 'three';
import { CONFIG, ROAD, VEHICLES, type VehicleId } from '../../src/config';
import { Traffic, type StepCtx, type TrafficEvents } from '../../src/traffic';

const ctxProxy: unknown = new Proxy(
  {},
  {
    get(_t, p) {
      if (p === 'createLinearGradient' || p === 'createRadialGradient') return () => ({ addColorStop() {} });
      if (p === 'measureText') return () => ({ width: 10 });
      if (p === 'getImageData') return (_x: number, _y: number, w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) });
      return () => {};
    },
    set() {
      return true;
    },
  },
);
const g = globalThis as Record<string, unknown>;
g.document ??= {
  createElement: () => ({ width: 1, height: 1, style: {}, getContext: () => ctxProxy }),
  fonts: { ready: Promise.resolve() },
};
if (!g.localStorage) {
  const store = new Map<string, string>();
  g.localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
  };
}

export function seed(s: number): void {
  let a = s >>> 0;
  Math.random = () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Every event the lab can listen to. Handlers are swapped per experiment.
export const ev = {
  nearMiss: (_x: number, _z: number, _c: number): void => {},
  platano: (): void => {},
  powerup: (_k: string): void => {},
  hoyo: (): void => {},
  policia: (): void => {},
  charco: (): void => {},
  rebase: (_x: number, _z: number): void => {},
  hornBehind: (_x: number): void => {},
  setPiece: (_k: string): void => {},
  escalate: (_t: number): void => {},
};

export function makeTraffic(): Traffic {
  const events: Record<string, unknown> = {
    onNearMiss: (x: number, z: number, c: number) => ev.nearMiss(x, z, c),
    onPlatano: () => ev.platano(),
    onPowerup: (k: string) => ev.powerup(k),
    onHoyo: () => ev.hoyo(),
    onPolicia: () => ev.policia(),
    onCharco: () => ev.charco(),
    onRebase: (x: number, z: number) => ev.rebase(x, z),
    onHornBehind: (x: number) => ev.hornBehind(x),
    onSetPiece: (k: string) => ev.setPiece(k),
    onEscalate: (t: number) => ev.escalate(t),
  };
  return new Traffic(new THREE.Scene(), events as unknown as TrafficEvents);
}

export function blankCtx(): StepCtx {
  const c: Record<string, unknown> = {
    ds: 0, dt: CONFIG.fixedDt, elapsed: 0, speed: 0, playerX: -3.4, playerY: 0, playerR: CONFIG.playerRadius,
    playerCv: false, live: true, airborne: false, wheelie: false, magnet: false,
    runDist: 0, shielded: false, cafecito: false,
  };
  return c as unknown as StepCtx;
}

export { CONFIG, ROAD, VEHICLES, type VehicleId, Traffic };
