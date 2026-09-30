import { beforeEach, describe, expect, it } from 'vitest';
import { CONFIG, PINTURAS } from '../config';
import { Score, nextPintura } from '../score';

// A tiny localStorage so records and the platano wallet can be exercised.
function installStorage(): Map<string, string> {
  const store = new Map<string, string>();
  (globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: () => null,
    get length() {
      return store.size;
    },
  } as Storage;
  return store;
}

describe('Score: the multiplier stack', () => {
  beforeEach(() => installStorage());

  it('pays 1 point per meter at the start, and stacks contra via x wheelie x vehicle', () => {
    const s = new Score();
    s.setVehicle('motor');
    s.step(100, 1, { airborne: false, wheelie: false });
    expect(s.points).toBe(100);

    const c = new Score();
    c.setVehicle('civic');
    c.setContraVia(true);
    c.setWheelie(true);
    c.step(100, 1, { airborne: false, wheelie: false });
    const expected = 100 * CONFIG.contraViaMultiplier * CONFIG.wheelieMultiplier * 1.22;
    expect(c.points).toBe(Math.floor(expected));
  });

  it('a fondo pays gasScoreMult on top of everything else', () => {
    const s = new Score();
    s.setVehicle('motor');
    s.setGas(true);
    s.step(100, 1, { airborne: false, wheelie: false });
    expect(s.points).toBe(Math.floor(100 * CONFIG.gasScoreMult));
    s.reset();
    expect(s.points).toBe(0);
    s.step(100, 1, { airborne: false, wheelie: false });
    expect(s.points).toBe(100); // reset drops the gas flag
  });

  it('braking pays brakeScoreMult on everything, and reset drops it', () => {
    const s = new Score();
    s.setVehicle('motor');
    s.setBrake(true);
    s.step(100, 1, { airborne: false, wheelie: false });
    expect(s.points).toBe(Math.floor(100 * CONFIG.brakeScoreMult));
    const nm = s.nearMiss();
    expect(nm.pts).toBe(Math.round(CONFIG.nearMissPoints * CONFIG.brakeScoreMult));
    s.reset();
    s.step(100, 1, { airborne: false, wheelie: false });
    expect(s.points).toBe(100);
  });

  it('near-miss points scale with the combo, and the combo decays after comboDecaySec', () => {
    const s = new Score();
    s.setVehicle('motor');
    const first = s.nearMiss();
    const second = s.nearMiss();
    expect(first.combo).toBe(1);
    expect(second.combo).toBe(2);
    expect(second.pts).toBe(first.pts * 2);
    expect(s.comboFraction).toBe(1);
    s.step(0, CONFIG.comboDecaySec / 2, { airborne: false, wheelie: false });
    expect(s.comboFraction).toBeCloseTo(0.5, 5);
    s.step(0, CONFIG.comboDecaySec, { airborne: false, wheelie: false });
    expect(s.combo).toBe(0);
    expect(s.comboFraction).toBe(0);
  });

  it('distance tiers kick in exactly at their thresholds', () => {
    const s = new Score();
    s.setVehicle('motor');
    const tiers = CONFIG.distMultTiers as ReadonlyArray<readonly [number, number]>;
    s.step(tiers[0][0] - 1, 0.01, { airborne: false, wheelie: false });
    expect(s.distMult).toBe(1);
    s.step(1, 0.01, { airborne: false, wheelie: false });
    expect(s.distMult).toBe(tiers[0][1]);
  });

  it('records persist per vehicle and survive a fresh Score', () => {
    const s = new Score();
    s.setVehicle('pasola');
    s.step(250, 5, { airborne: false, wheelie: false });
    const r = s.finishRun('malecon');
    expect(r.isNewRecord).toBe(true);
    expect(r.record).toBe(250);
    expect(r.tramo).toBe('malecon');

    const again = new Score();
    expect(again.recordFor('pasola')).toBe(250);
    expect(again.recordFor('motor')).toBe(0);
    again.setVehicle('pasola');
    expect(again.recordDist).toBe(250);
  });

  it('the platano wallet banks every pickup across runs and refuses overdrafts', () => {
    const s = new Score();
    s.setVehicle('motor');
    for (let i = 0; i < 7; i++) s.collectPlatano();
    s.finishRun('malecon');
    expect(s.bank).toBe(7);
    expect(s.spend(10)).toBe(false);
    expect(s.bank).toBe(7);
    expect(s.spend(5)).toBe(true);
    expect(s.bank).toBe(2);
    expect(new Score().bank).toBe(2); // persisted
  });
});

describe('Score: records are the ones the run started with', () => {
  beforeEach(() => installStorage());
  const ride = { airborne: false, wheelie: false };

  it('a mid-run persist on a fresh ride never arms a tape or a record', () => {
    const s = new Score();
    s.setVehicle('pasola');
    s.reset();
    s.step(300, 10, ride);
    s.persist(); // the pause
    expect(s.recordDist).toBe(300); // banked for crash safety...
    expect(s.prevRecordDist).toBe(0); // ...but the run still has no tape
    expect(s.prevRecord).toBe(0);
    s.step(10, 1, ride);
    const r = s.finishRun('malecon');
    expect(r.isNewRecord).toBe(true);
    expect(r.isNewDistRecord).toBe(false); // a first run rode to LA META
    expect(r.prevRecordDist).toBe(0);
  });

  it('a record banked by persist mid-run still reports isNewRecord at the finish', () => {
    const s = new Score();
    s.setVehicle('motor');
    s.reset();
    s.step(200, 5, ride);
    s.finishRun('malecon'); // record 200
    s.reset();
    s.step(300, 5, ride);
    s.persist(); // pause after passing it: storage now says 300
    expect(s.record).toBe(300);
    expect(s.prevRecord).toBe(200);
    s.step(50, 1, ride);
    const r = s.finishRun('malecon');
    expect(r.isNewRecord).toBe(true);
    expect(r.prevRecord).toBe(200);
    expect(r.record).toBe(r.points);
    expect(new Score().recordFor('motor')).toBe(r.points);
  });

  it('a persist mid-run keeps the record the run started with, short of it', () => {
    const s = new Score();
    s.setVehicle('motor');
    s.reset();
    s.step(400, 5, ride);
    s.finishRun('malecon');
    s.reset();
    s.step(380, 5, ride);
    s.persist();
    const r = s.finishRun('malecon');
    expect(r.isNewRecord).toBe(false);
    expect(r.prevRecord).toBeGreaterThan(r.points);
    expect(r.record).toBe(r.prevRecord);
  });

  it('isNewDistRecord only when an earlier distance record falls', () => {
    const s = new Score();
    s.setVehicle('civic');
    s.reset();
    s.step(500, 20, ride);
    expect(s.finishRun('malecon').isNewDistRecord).toBe(false); // first run
    s.reset();
    s.step(450, 20, ride);
    expect(s.finishRun('malecon').isNewDistRecord).toBe(false);
    s.reset();
    s.step(501, 20, ride);
    const r = s.finishRun('malecon');
    expect(r.isNewDistRecord).toBe(true);
    expect(r.prevRecordDist).toBe(500);
    expect(new Score().recordFor('civic')).toBeGreaterThan(0);
  });
});

describe('Score: el pelito, the live multiplier, airtime and the run counters', () => {
  beforeEach(() => installStorage());
  const ride = { airborne: false, wheelie: false };

  it('a razor pass pays razorMissMult; the rest of the band pays the normal rate', () => {
    const s = new Score();
    s.setVehicle('motor');
    const normal = s.nearMiss(CONFIG.razorMissM + 0.01);
    s.resetCombo();
    const razor = s.nearMiss(CONFIG.razorMissM);
    expect(normal.razor).toBe(false);
    expect(razor.razor).toBe(true);
    expect(razor.pts).toBe(Math.round(CONFIG.nearMissPoints * CONFIG.razorMissMult));
    expect(normal.pts).toBe(CONFIG.nearMissPoints);
    expect(s.nearMisses).toBe(2);
    expect(s.razorMisses).toBe(1);
    expect(s.nearMiss().razor).toBe(false); // no clearance given: a normal pass
  });

  it('liveMult is the product of every active multiplier, barrio included', () => {
    const s = new Score();
    s.setVehicle('civic');
    s.reset();
    expect(s.liveMult).toBeCloseTo(1.22, 9);
    s.setBarrioMult(1.5);
    s.setContraVia(true);
    s.setWheelie(true);
    s.setGas(true);
    s.step(CONFIG.distMultTiers[0][0], 1, ride);
    const expected =
      CONFIG.contraViaMultiplier * CONFIG.wheelieMultiplier * CONFIG.gasScoreMult * 1.22 * CONFIG.distMultTiers[0][1] * 1.5;
    expect(s.liveMult).toBeCloseTo(expected, 9);
    s.setGas(false);
    s.setBrake(true);
    expect(s.liveMult).toBeCloseTo((expected / CONFIG.gasScoreMult) * CONFIG.brakeScoreMult, 9);
  });

  it('the barrio multiplier pays points, never distance', () => {
    const s = new Score();
    s.setVehicle('motor');
    s.setBarrioMult(2);
    s.reset();
    s.step(100, 1, ride);
    expect(s.points).toBe(200);
    expect(s.distance).toBe(100);
    expect(s.finishRun('malecon').distanceM).toBe(100);
  });

  it('a real jump lands airLandBonus at the live multiplier; a bump does not', () => {
    const s = new Score();
    s.setVehicle('motor');
    s.setContraVia(true);
    const air = { airborne: true, wheelie: false };
    for (let t = 0; t < CONFIG.airLandMinSec + 0.05; t += 0.01) s.step(0, 0.01, air);
    const pts = s.endAir();
    const aloft = Math.ceil((CONFIG.airLandMinSec + 0.05) / 0.01) * 0.01;
    expect(pts).toBe(Math.round((CONFIG.airtimePointsPerSec * aloft + CONFIG.airLandBonus) * CONFIG.contraViaMultiplier));
    expect(s.airs).toBe(1);
    s.step(0, 0.1, air);
    expect(s.endAir()).toBe(Math.round(CONFIG.airtimePointsPerSec * 0.1 * CONFIG.contraViaMultiplier));
    expect(s.airs).toBe(1);
  });

  it('run counters: contra vía meters, a fondo and trick seconds, the clean stretch, reset by reset()', () => {
    const s = new Score();
    s.setVehicle('motor');
    s.setContraVia(true);
    s.step(50, 1, ride);
    s.setContraVia(false);
    s.setGas(true);
    s.step(20, 2, { airborne: false, wheelie: true });
    s.step(20, 1, ride);
    s.step(20, 0.5, { airborne: false, wheelie: true });
    s.hitHoyo();
    s.step(30, 1, ride);
    s.setContraVia(true);
    s.nearMiss(1);
    s.nearMiss(1);
    expect(s.cvMeters).toBe(50);
    expect(s.gasSec).toBeCloseTo(4.5, 9);
    expect(s.trickSec).toBeCloseTo(2.5, 9);
    expect(s.bestTrickHold).toBeCloseTo(2, 9);
    expect(s.bestCleanM).toBe(110);
    expect(s.cvNearMisses).toBe(2);
    expect(s.bestCombo).toBe(2);
    s.reset();
    expect([s.cvMeters, s.gasSec, s.trickSec, s.bestTrickHold, s.bestCleanM, s.nearMisses, s.bestCombo, s.airs]).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
  });
});

describe('Score: the wallet and Las Pinturas', () => {
  it('mandao rewards land in the bank at once and count as earned this run', () => {
    installStorage();
    const s = new Score();
    s.setVehicle('motor');
    s.reset();
    for (let i = 0; i < 4; i++) s.collectPlatano();
    s.addToBank(40);
    expect(new Score().bank).toBe(44); // persisted at once, with the pickups so far
    const r = s.finishRun('malecon');
    expect(r.platanos).toBe(4);
    expect(r.platanosEarned).toBe(44);
    expect(s.bank).toBe(44);
  });

  it('the bank never goes negative: no overdraft, no negative spend or reward, corrupt saves read as 0', () => {
    const store = installStorage();
    store.set('ecc.v1.platanosLifetime', '-50');
    const s = new Score();
    expect(s.bank).toBe(0);
    expect(s.spend(1)).toBe(false);
    expect(s.spend(-10)).toBe(false);
    s.addToBank(-30);
    s.addToBank(Number.NaN);
    expect(s.bank).toBe(0);
    store.set('ecc.v1.platanosLifetime', 'abc');
    expect(new Score().bank).toBe(0);
  });

  it('platanosTotal seeds from the old wallet once and never decreases on a purchase', () => {
    const store = installStorage();
    store.set('ecc.v1.platanosLifetime', '300');
    const s = new Score();
    expect(s.platanosTotal).toBe(300);
    expect(s.spend(250)).toBe(true);
    s.setVehicle('motor');
    s.reset();
    s.collectPlatano();
    s.finishRun('malecon');
    expect(s.bank).toBe(51);
    expect(s.platanosTotal).toBe(301);
    const again = new Score();
    expect(again.platanosTotal).toBe(301);
    expect(again.bank).toBe(51);
  });

  it('nextPintura names the cheapest unowned paint and what is still missing', () => {
    const list = PINTURAS.motor;
    const g = nextPintura('motor', new Set([0]), 100)!;
    expect(g.index).toBe(1);
    expect(g.name).toBe(list[1].name);
    expect(g.need).toBe(list[1].price - 100);
    expect(nextPintura('motor', new Set([0, 1]), 99999)!.need).toBe(0);
    expect(nextPintura('motor', new Set([0, 1, 2, 3, 4]), 0)).toBeNull();
  });
});
