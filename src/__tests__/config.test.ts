// The brief's invariants as executable checks. If a feel-tuning round breaks
// one of these, the game gets unfair or incoherent in ways playtesting finds
// late; this finds them at `npm test`.
import { describe, expect, it } from 'vitest';
import { CONFIG, PINTURAS, VEHICLES, type VehicleId } from '../config';

describe('CONFIG invariants from the brief', () => {
  it('telegraph invariant: a threat is readable for >= telegraphMinSec at the fastest the rider can go', () => {
    // Readable means at most 70% fogged. three.js linear fog is
    // smoothstep(fogNear, fogFar, depth), so the 70% line sits at depth
    // fogNear + t70 * (fogFar - fogNear) from the CAMERA; the rider is
    // camBack (plus the gas pull-back) in front of it. CONFIG.fogFar is the
    // nearest fog any tramo uses, so this is the worst tramo. Depth is taken
    // straight ahead: the camera's downward pitch only makes real depth
    // (and so the fog) smaller, which makes this bound conservative.
    let t70 = 0.5;
    for (let lo = 0, hi = 1, i = 0; i < 40; i++) {
      t70 = (lo + hi) / 2;
      if (t70 * t70 * (3 - 2 * t70) < 0.7) lo = t70;
      else hi = t70;
    }
    const fogDepth70 = CONFIG.fogNear + t70 * (CONFIG.fogFar - CONFIG.fogNear);
    const readable = fogDepth70 - (CONFIG.camBack + CONFIG.camGasPullBack);
    // Every archetype's top speed, civics included, even though civics only
    // spawn same-direction today: the bound must not depend on spawner rules.
    const speeds = Object.values(CONFIG.vehicleSpeeds) as ReadonlyArray<readonly [number, number]>;
    const fastestOncoming = Math.max(...speeds.map((r) => r[1]));
    for (const [id, v] of Object.entries(VEHICLES)) {
      const cruise = v.speedCap * v.speedMult;
      // Gas and the cafecito share the sacred ceiling (main.ts stepSim).
      const ceiling = Math.max(cruise, CONFIG.gasMaxMps);
      const gas = Math.min(cruise * CONFIG.gasSpeedMult, ceiling);
      const cafecito = Math.min(cruise * CONFIG.cafecitoBoost, ceiling);
      const fastest = Math.max(cruise, gas, cafecito);
      expect(readable / (fastest + fastestOncoming), `${id} at ${fastest.toFixed(1)} m/s`).toBeGreaterThanOrEqual(
        CONFIG.telegraphMinSec,
      );
    }
    // Threats are born beyond the readable line, so they fade in rather than pop.
    expect(CONFIG.spawnAhead).toBeGreaterThan(readable);
  });

  it('the gas always has headroom: the ceiling sits above every ride at cruise', () => {
    for (const v of Object.values(VEHICLES)) {
      expect(CONFIG.gasMaxMps).toBeGreaterThan(v.speedCap * v.speedMult);
    }
  });

  it('no tramo pulls its fog in closer than the fog the telegraph rule was checked against', () => {
    for (const [tramo, far] of Object.entries(CONFIG.tramoFogFar)) {
      expect(far, `${tramo} fog far`).toBeGreaterThanOrEqual(CONFIG.fogFar);
    }
  });

  it('same-direction traffic is slower than the rider by the time that type unlocks', () => {
    // The ramp matters: civics enter at civicUnlockSec, when the rider is
    // already past their top speed. Lowering baseSpeed once broke the naive
    // version of this rule without breaking the game; this is the real one.
    const speedAt = (sec: number): number => CONFIG.baseSpeed + CONFIG.speedRampPerSec * sec;
    const unlock: Record<string, number> = {
      sedan: 0,
      motoconcho: 0,
      guagua: CONFIG.bigVehicleUnlockSec,
      camion: CONFIG.bigVehicleUnlockSec,
      civic: CONFIG.civicUnlockSec,
    };
    for (const [type, range] of Object.entries(CONFIG.vehicleSpeeds)) {
      expect(range[1], `${type} top speed vs rider at unlock`).toBeLessThan(speedAt(unlock[type] ?? 0));
    }
  });

  it('the pedal never stops the run, the brake bites, and speed is paid for', () => {
    expect(CONFIG.brakeSpeedMult).toBeGreaterThan(0.5);
    expect(CONFIG.brakeSpeedMult).toBeLessThan(1);
    expect(CONFIG.gasSpeedMult).toBeGreaterThan(1);
    expect(CONFIG.gasSpeedMult).toBeLessThanOrEqual(CONFIG.cafecitoBoost);
    expect(CONFIG.brakeResponse).toBeGreaterThan(CONFIG.gasResponse);
    // risk = score: the gas pays, the brake costs
    expect(CONFIG.gasScoreMult).toBeGreaterThan(1);
    expect(CONFIG.brakeScoreMult).toBeLessThan(1);
    expect(CONFIG.brakeScoreMult).toBeGreaterThan(0);
  });

  it('the tour is coherent: the Obelisco offset lands inside a Malecon stretch', () => {
    expect(CONFIG.obeliscoOffsetM).toBeGreaterThan(0);
    expect(CONFIG.obeliscoOffsetM).toBeLessThan(CONFIG.tramoLengthM);
  });

  it('the tour is coherent: La Puerta del Conde lands inside a Zona stretch', () => {
    expect(CONFIG.puertaOffsetM).toBeGreaterThan(0);
    expect(CONFIG.puertaOffsetM).toBeLessThan(CONFIG.tramoLengthM);
  });

  it('distance multiplier tiers ascend in both distance and multiplier', () => {
    const tiers = CONFIG.distMultTiers as ReadonlyArray<readonly [number, number]>;
    for (let i = 1; i < tiers.length; i++) {
      expect(tiers[i][0]).toBeGreaterThan(tiers[i - 1][0]);
      expect(tiers[i][1]).toBeGreaterThan(tiers[i - 1][1]);
    }
  });

  it('Las Pinturas: factory paint is free and owned, prices climb, every ride has the same count', () => {
    const counts = new Set<number>();
    for (const id of Object.keys(PINTURAS) as VehicleId[]) {
      const list = PINTURAS[id];
      counts.add(list.length);
      expect(list[0].price).toBe(0);
      for (let i = 1; i < list.length; i++) expect(list[i].price).toBeGreaterThan(list[i - 1].price);
      for (const p of list) expect(p.hex).toBeGreaterThanOrEqual(0);
    }
    expect(counts.size).toBe(1);
  });

  it('every tramo weights the same vehicle set, so no stretch can spawn a type the pools lack', () => {
    const keys = Object.values(CONFIG.tramoVehicleWeights).map((w) => Object.keys(w).sort().join(','));
    expect(new Set(keys).size).toBe(1);
    expect(keys[0]).toBe(Object.keys(CONFIG.vehicleWeights).sort().join(','));
  });
});
