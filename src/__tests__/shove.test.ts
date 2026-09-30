// La Bendición's save, the hoverboard half (research-subway[8]): the car it
// took slides off the rider's line with a spin, every car on that line
// within shoveClearM ahead slides off too, and nothing teleports. Runs the
// real Traffic class headless (see helpers/trafficSim).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { CONFIG } from '../config';
import type { VehicleHit } from '../traffic';
import { H, START_X, Sim, restoreRandom } from './helpers/trafficSim';

let sim: Sim;

beforeAll(() => {
  sim = new Sim();
});

afterAll(() => {
  restoreRandom();
});

// Test-only access to the pool: a second car right behind the first on the
// same line is what traffic following makes, but the spawner never places one.
interface Car extends VehicleHit {
  z: number;
  baseX: number;
  group: THREE.Group;
}

describe('la Bendición save', () => {
  it('shoves the hit car and the next car on the line aside, smoothly, and the rider rides on', () => {
    sim.start(4101, false);
    for (let i = 0; i < 0.5 / H; i++) sim.step(START_X, -50);
    const r = sim.radius;
    expect(sim.traffic.debugSpawnVehicle('sedan', 1, 30, 1, START_X, 8)).toBe(true);
    expect(sim.traffic.debugSpawnVehicle('sedan', 1, 60, 1, START_X, 8)).toBe(true);
    const cars = sim.traffic.vehicleViews as unknown as Car[];
    const mine = cars.filter((v) => v.active && Math.abs(v.baseX - START_X) < 1e-6);
    expect(mine.length).toBe(2);
    const [first, second] = mine[0].z < mine[1].z ? mine : [mine[1], mine[0]];
    // the rider is in the first car's bumper, the second 10 m further up
    first.z = first.halfL * CONFIG.vehicleHitboxScale + r * 0.5;
    second.z = first.z + 10;
    const hit = sim.traffic.hitVehicle(START_X, 0, r);
    expect(hit).toBe(first);
    const yaw0 = first.group.rotation.y;
    sim.traffic.shove(hit!, START_X, r);

    let maxJump = 0;
    let spun = 0;
    let hitAgain = false;
    const last = [first.x, second.x];
    for (let i = 0; i < 3 / H; i++) {
      sim.step(START_X, -50);
      maxJump = Math.max(maxJump, Math.abs(first.x - last[0]), Math.abs(second.x - last[1]));
      last[0] = first.x;
      last[1] = second.x;
      spun = Math.max(spun, Math.abs(first.group.rotation.y - yaw0));
      // the rider holds the line after the save (grace is main.ts's, not
      // needed here: neither car may still be on it once it slides)
      if (i * H > CONFIG.shieldGraceSec) {
        const h = sim.traffic.hitVehicle(START_X, 0, r);
        if (h === first || h === second) hitAgain = true;
      }
    }
    const clear = (c: Car): number => Math.abs(c.x - START_X) - (c.halfW * CONFIG.vehicleHitboxScale + r);
    expect(hitAgain).toBe(false);
    expect(clear(first)).toBeGreaterThan(CONFIG.shoveMarginM * 0.9);
    expect(clear(second)).toBeGreaterThan(CONFIG.shoveMarginM * 0.9);
    // a slide, never a teleport: at most shoveRate of the distance per step
    expect(maxJump).toBeLessThan(0.25);
    // the hit car spins most of the way round, then settles back on its heading
    expect(spun).toBeGreaterThan(Math.PI);
    expect(first.group.rotation.y).toBeCloseTo(yaw0, 5);
  });
});
