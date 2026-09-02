import { beforeEach, describe, expect, it } from 'vitest';
import { CONFIG } from '../config';
import { Score } from '../score';

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

  it('reports a close call only when within closeCallShare of the record', () => {
    const s = new Score();
    s.setVehicle('motor');
    s.step(1000, 10, { airborne: false, wheelie: false });
    const best = s.finishRun('zona'); // distance tiers apply, so read the model's number
    s.reset();
    s.step(950, 10, { airborne: false, wheelie: false });
    const near = s.finishRun('malecon');
    expect(near.closeCall).toBe(best.points - near.points);
    expect(near.closeCall!).toBeLessThanOrEqual(Math.max(50, best.points * CONFIG.closeCallShare));
    s.reset();
    s.step(300, 10, { airborne: false, wheelie: false });
    expect(s.finishRun('malecon').closeCall).toBeNull();
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
