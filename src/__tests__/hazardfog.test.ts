// Traffic, obstacles and pickups fade on their own fog curve (traffic.ts
// HAZARD_FOG). These checks keep that curve honest against the brief's
// telegraph rule, against pop-in at the spawn line, and against the scenery.
import { describe, expect, it } from 'vitest';
import { CONFIG, VEHICLES } from '../config';

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

// Fraction of a hazard's own color left after the fog, mirroring the shader.
const hazardVisible = (d: number): number =>
  1 - Math.pow(smoothstep(CONFIG.fogNear, CONFIG.hazardFogFarM, d), CONFIG.hazardFogPow);
const sceneryVisible = (d: number): number => 1 - smoothstep(CONFIG.fogNear, CONFIG.fogFar, d);

// Farthest distance at which a hazard is still at least half visible.
function halfVisibleAt(): number {
  let lo: number = CONFIG.fogNear;
  let hi: number = CONFIG.hazardFogFarM;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (hazardVisible(mid) >= 0.5) lo = mid;
    else hi = mid;
  }
  return lo;
}

describe('hazard fog', () => {
  it('a vehicle is at least half visible telegraphMinSec before it reaches you, at max closing speed', () => {
    // Same bound as the telegraph test in config.test.ts: gas and the
    // cafecito never stack and share the sacred gasMaxMps ceiling.
    const fastestRide = Math.max(
      ...Object.values(VEHICLES).map((v) => {
        const cruise = v.speedCap * v.speedMult;
        const ceiling = Math.max(cruise, CONFIG.gasMaxMps);
        return Math.max(
          cruise,
          Math.min(cruise * CONFIG.gasSpeedMult, ceiling),
          Math.min(cruise * CONFIG.cafecitoBoost, ceiling),
        );
      }),
    );
    const speeds = Object.values(CONFIG.vehicleSpeeds) as ReadonlyArray<readonly [number, number]>;
    const fastestOncoming = Math.max(...speeds.map((r) => r[1]));
    const closing = fastestRide + fastestOncoming;
    // Fog depth is measured from the camera; the rider sits camBack (plus the
    // gas pull-back) in front of it.
    const fromRider = halfVisibleAt() - (CONFIG.camBack + CONFIG.camGasPullBack);
    expect(fromRider / closing).toBeGreaterThanOrEqual(CONFIG.telegraphMinSec);
  });

  it('hazards fade in at the spawn line instead of popping in', () => {
    expect(CONFIG.hazardFogFarM).toBeLessThanOrEqual(CONFIG.spawnAhead);
    expect(hazardVisible(CONFIG.spawnAhead)).toBeLessThan(0.01);
  });

  it('hazards read at least as early as the scenery behind them', () => {
    for (let d: number = CONFIG.fogNear; d <= CONFIG.fogFar; d += 5) {
      expect(hazardVisible(d), `at ${d} m`).toBeGreaterThanOrEqual(sceneryVisible(d));
    }
  });
});
