// Fairness and pacing guards for traffic.ts: the real Traffic class, run
// headless with a seeded RNG and main.ts's speed model. These are the
// brief's sacred rules as executable checks, so escalation and new patterns
// can raise the pressure without ever walling the rider.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CONFIG, ROAD } from '../config';
import type { SetPieceKind, VehicleView } from '../traffic';
import { H, START_X, Sim, WallScan, restoreRandom } from './helpers/trafficSim';

let sim: Sim;

beforeAll(() => {
  sim = new Sim();
});

afterAll(() => {
  restoreRandom();
});

const isStatic = (v: VehicleView): boolean => v.type === 'cart' || v.type === 'guaguaParada';

describe('traffic fairness', () => {
  it('never walls the rider, cruise and a fondo, own side and contra vía, with no ghosting', () => {
    const cases = [
      { throttle: 1, x: START_X },
      { throttle: CONFIG.gasSpeedMult, x: START_X },
      { throttle: CONFIG.gasSpeedMult, x: -START_X },
    ];
    let walls = 0;
    let maxOverlap = 0;
    let tierSeen = 0;
    for (const c of cases) {
      for (let s = 1; s <= 2; s++) {
        sim.start(900 + s * 7 + Math.round(c.x));
        sim.throttle = c.throttle;
        const scan = new WallScan('motor');
        for (let i = 0; i < 150 / H; i++) {
          sim.step(c.x);
          scan.update(sim.traffic);
          const o = sim.traffic.overlapCount;
          if (o > maxOverlap) maxOverlap = o;
        }
        walls += scan.walls;
        tierSeen = Math.max(tierSeen, sim.traffic.escalationTier);
      }
    }
    sim.throttle = 1;
    expect(tierSeen, 'the runs must reach the escalated tiers').toBe(CONFIG.escalation.length - 1);
    expect(walls).toBe(0);
    expect(maxOverlap).toBe(0);
  }, 30000);

  it('the corridor check refuses the car that would close the road', () => {
    // Everything below reaches the rider at the same moment. Five of them
    // leave a gap; the sixth would seal it, so it must be refused. (In seeded
    // runs the check rarely fires: the vehicle cap, the line spacing and the
    // arrival windows keep more than one gap open. This proves it still does
    // its job when a pattern asks for too much.)
    sim.start(5, false);
    sim.step(12, -50);
    const t = 90 / sim.eff; // arrival time shared by every spawn
    const same = 10; // m/s, same direction
    const onc = 12; // m/s, oncoming
    const zSame = t * (sim.eff - same);
    const zOnc = t * (sim.eff + onc);
    const zStatic = t * sim.eff;
    const before = sim.traffic.stats.corridorRejects;
    expect(sim.traffic.debugSpawnVehicle('guaguaParada', -1, zStatic, 1)).toBe(true);
    expect(sim.traffic.debugSpawnVehicle('cart', 4, zStatic, 1)).toBe(true);
    expect(sim.traffic.debugSpawnVehicle('sedan', 0, zSame, 1, ROAD.laneCenters[0], same)).toBe(true);
    expect(sim.traffic.debugSpawnVehicle('sedan', 1, zSame, 1, ROAD.laneCenters[1], same)).toBe(true);
    expect(sim.traffic.debugSpawnVehicle('sedan', 2, zOnc, -1, ROAD.laneCenters[2], onc)).toBe(true);
    expect(sim.traffic.debugSpawnVehicle('sedan', 3, zOnc, -1, ROAD.laneCenters[3], onc)).toBe(false);
    expect(sim.traffic.stats.corridorRejects).toBe(before + 1);
  });

  it('el rebase only starts on a car at least rebaseLeadSec out, and announces itself', () => {
    let swings = 0;
    let minArrival = Infinity;
    for (let s = 1; s <= 3; s++) {
      sim.start(400 + s);
      sim.throttle = CONFIG.gasSpeedMult;
      for (let i = 0; i < 120 / H; i++) {
        sim.step(ROAD.laneCenters[1]);
        for (const v of sim.traffic.vehicleViews) {
          if (!v.active || v.overtakeT <= 0 || v.overtakeT > H * 1.5) continue;
          swings++;
          minArrival = Math.min(minArrival, v.z / (sim.eff - v.dir * v.speed));
        }
      }
      expect(sim.tally.rebases).toBeGreaterThan(0);
    }
    sim.throttle = 1;
    expect(swings).toBeGreaterThan(20);
    expect(minArrival).toBeGreaterThanOrEqual(CONFIG.telegraphMinSec);
    expect(minArrival).toBeGreaterThanOrEqual(CONFIG.rebaseLeadSec[0] - 0.05);
  });

  it('a car behind a braking rider follows and honks instead of rear-ending', () => {
    let crashes = 0;
    let horns = 0;
    for (let s = 1; s <= 20; s++) {
      sim.start(3300 + s);
      for (let i = 0; i < 0.5 / H; i++) sim.step(START_X, -50);
      expect(sim.traffic.debugSpawnVehicle(s % 2 ? 'sedan' : 'motoconcho', 1, -4, 1, START_X, 13.5)).toBe(true);
      sim.throttle = CONFIG.brakeSpeedMult; // an instant full brake, harsher than the eased pedal
      let hit = false;
      for (let i = 0; i < 6 / H && !hit; i++) {
        sim.step(START_X, -50);
        hit = sim.traffic.checkCollision(START_X, 0, sim.radius);
      }
      if (hit) crashes++;
      horns += sim.tally.hornsBehind;
      sim.throttle = 1;
    }
    expect(crashes).toBe(0);
    expect(horns).toBeGreaterThanOrEqual(20);
  });
});

describe('traffic pacing', () => {
  it('the opening: own-side traffic by 6 s, a plátano by 3 s, a Bendición around 14 s', () => {
    for (let s = 1; s <= 20; s++) {
      sim.start(6100 + s);
      const lastZ = new Map<VehicleView, number>();
      let firstOwn = Infinity;
      let firstPlatano = Infinity;
      let firstPowerupAt = Infinity;
      while (sim.elapsed < 16) {
        sim.step(START_X);
        for (const v of sim.traffic.vehicleViews) {
          if (!v.active) {
            lastZ.delete(v);
            continue;
          }
          const pz = lastZ.get(v);
          lastZ.set(v, v.z);
          if (pz !== undefined && pz > 0 && v.z <= 0 && v.dir === 1 && !isStatic(v)) {
            firstOwn = Math.min(firstOwn, sim.elapsed);
          }
        }
        if (sim.tally.platanos > 0) firstPlatano = Math.min(firstPlatano, sim.elapsed);
        if (sim.tally.powerups.length > 0) firstPowerupAt = Math.min(firstPowerupAt, sim.elapsed);
      }
      expect(firstOwn, `seed ${s}`).toBeLessThanOrEqual(6);
      expect(firstPlatano, `seed ${s}`).toBeLessThanOrEqual(3);
      expect(sim.tally.powerups[0], `seed ${s}`).toBe('bendicion');
      expect(firstPowerupAt).toBeGreaterThan(CONFIG.firstPowerupSec - 2);
      expect(firstPowerupAt).toBeLessThan(CONFIG.firstPowerupSec + 2);
    }
  });

  it('convoys spawn at least three cars', () => {
    let convoys = 0;
    let full = 0;
    for (let s = 1; s <= 200; s++) {
      sim.start(5000 + s, false);
      sim.step(12, -50);
      const before = sim.traffic.activeCars;
      sim.traffic.debugRunPattern('convoy');
      const n = sim.traffic.activeCars - before;
      convoys++;
      if (n >= 3) full++;
    }
    expect(full / convoys).toBeGreaterThanOrEqual(0.9);
  });

  it('civics only join once the rider closes on them properly', () => {
    for (let s = 1; s <= 3; s++) {
      sim.start(2200 + s);
      while (sim.elapsed < 70) {
        sim.step(12, -50);
        for (const v of sim.traffic.vehicleViews) {
          if (!v.active || v.type !== 'civic') continue;
          // spawned this tick far ahead: the rider already closes fast enough
          if (v.z > CONFIG.spawnAhead) expect(sim.eff - CONFIG.vehicleSpeeds.civic[1]).toBeGreaterThanOrEqual(CONFIG.civicMinClosing - 0.1);
        }
      }
    }
  });

  it('escalation follows the distance tiers, in order', () => {
    const tiers = CONFIG.escalation.map((e) => e.atM);
    const mult = (CONFIG.distMultTiers as ReadonlyArray<readonly [number, number]>).map((t) => t[0]);
    expect(tiers.slice(1)).toEqual(mult);
    sim.start(77);
    sim.throttle = CONFIG.gasSpeedMult;
    while (sim.dist < 2300) sim.step(12, -50);
    sim.throttle = 1;
    expect(sim.tally.escalations).toEqual([1, 2, 3]);
  });
});

describe('traffic rewards', () => {
  it('a parked rider earns no near-misses; a real dodge does', () => {
    for (let s = 1; s <= 6; s++) {
      sim.start(15000 + s);
      while (sim.elapsed < 90) sim.step(START_X);
      expect(sim.tally.nearMiss, `seed ${s}`).toBe(0);
    }
    // on an oncoming car's line until 0.5 s out, then out of it
    sim.start(42, false);
    sim.step(12, -50);
    const carX = ROAD.laneCenters[2];
    expect(sim.traffic.debugSpawnVehicle('sedan', 2, 70, -1, carX, 12)).toBe(true);
    const dodgeX = carX - (0.95 * CONFIG.vehicleHitboxScale + CONFIG.playerRadius + 0.4);
    for (let i = 0; i < 4 / H; i++) {
      let near = Infinity;
      for (const v of sim.traffic.vehicleViews) if (v.active && v.z > 0) near = Math.min(near, v.z / (sim.eff + v.speed));
      sim.step(near > 0.5 ? carX : dodgeX);
    }
    expect(sim.tally.nearMiss).toBe(1);
    expect(sim.tally.clearances[0]).toBeCloseTo(0.4, 1);
  });

  it('plátanos trace the racing line: most sit next to traffic, almost none inside it', () => {
    const cross = { free: 0, risky: 0, blocked: 0 };
    for (let s = 1; s <= 5; s++) {
      sim.start(700 + s);
      const lastZ = new Map<object, number>();
      while (sim.elapsed < 180) {
        sim.step(START_X, -50); // parked out of reach: every plátano crosses the rider line
        for (const p of sim.traffic.pickupViews) {
          if (!p.active || p.kind !== 'platano') {
            lastZ.delete(p);
            continue;
          }
          const pz = lastZ.get(p);
          lastZ.set(p, p.z);
          if (pz === undefined || pz <= 0 || p.z > 0) continue;
          let cls: 'free' | 'risky' | 'blocked' = 'free';
          for (const v of sim.traffic.vehicleViews) {
            if (!v.active) continue;
            const dx = Math.abs(p.x - v.x);
            const dz = Math.abs(v.z - p.z);
            if (dx < v.halfW * CONFIG.vehicleHitboxScale + 0.5 && dz < v.halfL * CONFIG.vehicleHitboxScale + 0.5) {
              cls = 'blocked';
              break;
            }
            if (dx < 2.2 && dz < 8) cls = 'risky';
          }
          cross[cls]++;
        }
      }
    }
    const total = cross.free + cross.risky + cross.blocked;
    expect(total).toBeGreaterThan(500);
    expect(cross.risky / total).toBeGreaterThanOrEqual(0.4);
    expect(cross.blocked / total).toBeLessThanOrEqual(0.005);
  });

  it('the policía arc follows the real jump: a straight jump takes every plátano', () => {
    for (const speed of [20, 32, 48]) {
      sim.start(88, false);
      sim.step(12, -50);
      const vy = Math.max(3.2, speed * CONFIG.policiaLaunchVy);
      const laid = sim.traffic.spawnJumpArc(0, speed, vy);
      expect(laid).toBe(CONFIG.jumpArcCount);
      let y = 0;
      let vyNow = vy;
      for (let i = 0; i < 2 / H; i++) {
        y += vyNow * H;
        vyNow -= CONFIG.jumpGravity * H;
        if (y < 0) y = 0;
        sim.step(0, y, { speed, ds: speed * H });
      }
      expect(sim.tally.platanos, `speed ${speed}`).toBe(laid);
    }
  });

  it('every set piece spawns legally: no wall, no ghosting', () => {
    const kinds: SetPieceKind[] = ['guaguaLenta', 'tapon', 'parada', 'caravana', 'camionPlatanos', 'calleEstrecha', 'horaPico'];
    for (const kind of kinds) {
      for (let s = 1; s <= 3; s++) {
        sim.start(3100 + s, false);
        while (sim.elapsed < 30) sim.step(12, -50);
        sim.traffic.debugRunSetPiece(kind);
        const scan = new WallScan('motor');
        let maxOverlap = 0;
        for (let i = 0; i < 12 / H; i++) {
          sim.step(START_X, -50);
          scan.update(sim.traffic);
          maxOverlap = Math.max(maxOverlap, sim.traffic.overlapCount);
        }
        expect(scan.walls, `${kind} seed ${s}`).toBe(0);
        expect(maxOverlap, `${kind} seed ${s}`).toBe(0);
      }
    }
  }, 20000);
});
