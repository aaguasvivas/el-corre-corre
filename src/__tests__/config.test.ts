// The brief's invariants as executable checks. If a feel-tuning round breaks
// one of these, the game gets unfair or incoherent in ways playtesting finds
// late; this finds them at `npm test`.
import { describe, expect, it } from 'vitest';
import { CONFIG, PINTURAS, VEHICLES, type VehicleId } from '../config';

describe('CONFIG invariants from the brief', () => {
  it('telegraph invariant: anything that can kill you is visible for >= telegraphMinSec at max closing speed', () => {
    const fastestRide = Math.max(...Object.values(VEHICLES).map((v) => v.speedCap * v.speedMult));
    const speeds = Object.values(CONFIG.vehicleSpeeds) as ReadonlyArray<readonly [number, number]>;
    const fastestOncoming = Math.max(...speeds.map((r) => r[1]));
    // gas and cafecito never stack, so the bound is the larger of the two
    const closing = fastestRide * Math.max(CONFIG.cafecitoBoost, CONFIG.gasSpeedMult) + fastestOncoming;
    expect(CONFIG.spawnAhead / closing).toBeGreaterThanOrEqual(CONFIG.telegraphMinSec);
  });

  it('fog never hides what the spawner promised you could see', () => {
    // spawnAhead can sit beyond fogFar (the world fades in), but the reaction
    // window itself must be inside clear air at max closing speed
    const fastestRide = Math.max(...Object.values(VEHICLES).map((v) => v.speedCap * v.speedMult));
    const speeds = Object.values(CONFIG.vehicleSpeeds) as ReadonlyArray<readonly [number, number]>;
    const fastestOncoming = Math.max(...speeds.map((r) => r[1]));
    expect(CONFIG.fogFar / (fastestRide + fastestOncoming)).toBeGreaterThanOrEqual(CONFIG.telegraphMinSec);
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

  it('the throttle never stops the run and the brake floor keeps the gentle start survivable', () => {
    expect(CONFIG.brakeSpeedMult).toBeGreaterThan(0.5);
    expect(CONFIG.brakeSpeedMult).toBeLessThan(1);
    expect(CONFIG.gasSpeedMult).toBeGreaterThan(1);
    expect(CONFIG.gasSpeedMult).toBeLessThanOrEqual(CONFIG.cafecitoBoost);
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
