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
    const fastestRide = Math.max(...Object.values(VEHICLES).map((v) => v.speedCap * v.speedMult));
    const speeds = Object.values(CONFIG.vehicleSpeeds) as ReadonlyArray<readonly [number, number]>;
    const fastestOncoming = Math.max(...speeds.map((r) => r[1]));
    // same bound as the telegraph test in config.test.ts: gas and cafecito never stack
    const closing = fastestRide * Math.max(CONFIG.cafecitoBoost, CONFIG.gasSpeedMult) + fastestOncoming;
    expect(halfVisibleAt() / closing).toBeGreaterThanOrEqual(CONFIG.telegraphMinSec);
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
