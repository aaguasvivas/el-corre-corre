import { beforeEach, describe, expect, it } from 'vitest';
import { CONFIG, PINTURAS, type VehicleId } from '../config';
import {
  Missions,
  barrioMultFor,
  dayKey,
  prevDayKey,
  streakMultFor,
  type Completion,
  type RunStats,
} from '../missions';

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

type Stats = { -readonly [K in keyof RunStats]: RunStats[K] };
function stats(over: Partial<Stats> = {}): Stats {
  return {
    distance: 0, points: 0, platanos: 0, nearMisses: 0, razorMisses: 0, cvNearMisses: 0,
    bestCombo: 0, cvMeters: 0, gasSec: 0, trickSec: 0, bestTrickHold: 0, airs: 0, bestCleanM: 0,
    ...over,
  };
}

// A settable local clock: new Date(y, m - 1, d, h) is local time, like the game.
function clock(y: number, m: number, d: number, h = 12): { now: () => Date; set(y: number, m: number, d: number, h?: number): void } {
  let t = new Date(y, m - 1, d, h);
  return {
    now: () => t,
    set(yy, mm, dd, hh = 12) {
      t = new Date(yy, mm - 1, dd, hh);
    },
  };
}

// Stats that finish every kind a mandao can ask for, on any ride.
function crushAll(): Stats {
  return stats({
    distance: 99999, points: 9e9, platanos: 9999, nearMisses: 999, razorMisses: 999, cvNearMisses: 999,
    bestCombo: 99, cvMeters: 99999, gasSec: 9999, trickSec: 9999, bestTrickHold: 99, airs: 99, bestCleanM: 99999,
  });
}

function finishSet(m: Missions, vehicle: VehicleId = 'motor'): Completion[] {
  const got: Completion[] = [];
  m.onComplete = (c) => got.push(c);
  m.startRun(vehicle);
  m.sample(crushAll());
  m.finishRun(crushAll());
  m.onComplete = null;
  return got;
}

describe('Los Mandaos: sets, levels and the barrio multiplier', () => {
  beforeEach(() => installStorage());

  it('starts at level 0 with tutorial set 1, then tutorial set 2, then the pool at tier 0', () => {
    const c = clock(2026, 9, 29);
    const m = new Missions({ now: c.now, rng: () => 0.3 });
    const v0 = m.view();
    expect(v0.level).toBe(0);
    expect(v0.mult).toBe(1);
    expect(v0.set.map((x) => [x.kind, x.target])).toEqual(CONFIG.mandaoTutorial[0].map(([k, t]) => [k, t]));
    expect(v0.set.every((x) => x.tutorial && x.reward === CONFIG.mandaoTutorialReward)).toBe(true);

    const first = finishSet(m).filter((x) => !x.daily);
    expect(first.length).toBe(3);
    expect(first[2].levelUp).toBe(true);
    expect(first[2].setBonus).toBe(CONFIG.mandaoSetBonus);
    expect(m.view().level).toBe(1);
    expect(m.view().set.map((x) => x.kind)).toEqual(CONFIG.mandaoTutorial[1].map(([k]) => k));

    finishSet(m);
    const v2 = m.view();
    expect(v2.level).toBe(2);
    expect(v2.mult).toBe(1 + 2 * CONFIG.barrioMultStep);
    expect(new Set(v2.set.map((x) => x.kind)).size).toBe(3);
    for (const x of v2.set) {
      expect(x.tutorial).toBe(false);
      expect(x.target).toBe(CONFIG.mandaoPool[x.kind as keyof typeof CONFIG.mandaoPool][0]);
      expect(x.reward).toBe(CONFIG.mandaoReward[0]);
    }
  });

  it('set 1 is doable in a first run: 10 plátanos, 2 cerquitas and 300 m', () => {
    const m = new Missions({ now: clock(2026, 9, 29).now });
    const got: Completion[] = [];
    m.onComplete = (c) => got.push(c);
    m.startRun('motor');
    m.sample(stats({ distance: 320, platanos: 11, nearMisses: 2 }));
    const set = got.filter((x) => !x.daily);
    expect(set.map((x) => x.mandao.kind).sort()).toEqual(['distRun', 'nearMissRun', 'platanosRun']);
    expect(set.some((x) => x.levelUp)).toBe(true);
  });

  it('per-run goals restart every run, done goals stay done', () => {
    const m = new Missions({ now: clock(2026, 9, 29).now });
    m.startRun('motor');
    m.sample(stats({ platanos: 7, nearMisses: 2 }));
    m.finishRun(stats({ platanos: 7, nearMisses: 2 }));
    const after1 = m.view().set;
    expect(after1.find((x) => x.kind === 'platanosRun')!.progress).toBe(7);
    expect(after1.find((x) => x.kind === 'nearMissRun')!.done).toBe(true);

    m.startRun('motor');
    const fresh = m.view().set;
    expect(fresh.find((x) => x.kind === 'platanosRun')!.progress).toBe(0);
    expect(fresh.find((x) => x.kind === 'nearMissRun')!.done).toBe(true);
    m.sample(stats({ platanos: 5 }));
    expect(m.view().set.find((x) => x.kind === 'platanosRun')!.done).toBe(false);

    // and survives a reload
    m.finishRun(stats({ platanos: 5 }));
    const again = new Missions({ now: clock(2026, 9, 29).now });
    expect(again.view().set.find((x) => x.kind === 'nearMissRun')!.done).toBe(true);
    expect(again.view().doneCount).toBe(1);
  });

  it('a lifetime goal keeps counting across runs and reloads', () => {
    const store = installStorage();
    store.set(
      'ecc.v1.mandaos',
      JSON.stringify({
        v: 1,
        level: 3,
        set: [
          { k: 'platanosTotal', t: 150, r: 60, d: 0, p: 0 },
          { k: 'airRun', t: 2, r: 60, d: 0 },
          { k: 'comboReach', t: 5, r: 60, d: 0 },
        ],
      }),
    );
    const m = new Missions({ now: clock(2026, 9, 29).now });
    for (let run = 0; run < 2; run++) {
      m.startRun('motor');
      m.sample(stats({ platanos: 60 }));
      m.finishRun(stats({ platanos: 60 }));
    }
    const reloaded = new Missions({ now: clock(2026, 9, 29).now });
    expect(reloaded.view().set[0].progress).toBe(120);
    const got: Completion[] = [];
    reloaded.onComplete = (c) => got.push(c);
    reloaded.startRun('motor');
    reloaded.sample(stats({ platanos: 29 }));
    expect(got.length).toBe(0);
    reloaded.sample(stats({ platanos: 30 }));
    expect(got.map((c) => c.mandao.kind)).toEqual(['platanosTotal']);
  });

  it('a pause saves lifetime progress; the run ending later does not count it twice', () => {
    const store = installStorage();
    const set = [
      { k: 'platanosTotal', t: 150, r: 60, d: 0, p: 40 },
      { k: 'airRun', t: 2, r: 60, d: 0 },
      { k: 'comboReach', t: 5, r: 60, d: 0 },
    ];
    store.set('ecc.v1.mandaos', JSON.stringify({ v: 1, level: 3, set }));
    const m = new Missions({ now: clock(2026, 9, 29).now });
    m.startRun('motor');
    m.persist(stats({ platanos: 25 }));
    // the app dies while paused: a fresh boot sees the paused progress
    expect(new Missions({ now: clock(2026, 9, 29).now }).view().set[0].progress).toBe(65);
    // or the run goes on and ends normally: 40 + 30, not 40 + 25 + 30
    m.finishRun(stats({ platanos: 30 }));
    expect(new Missions({ now: clock(2026, 9, 29).now }).view().set[0].progress).toBe(70);
  });

  it('ride goals count only on that ride', () => {
    installStorage().set(
      'ecc.v1.mandaos',
      JSON.stringify({
        v: 1,
        level: 2,
        set: [
          { k: 'pasolaMeters', t: 800, r: 60, d: 0 },
          { k: 'airRun', t: 2, r: 60, d: 0 },
          { k: 'comboReach', t: 5, r: 60, d: 0 },
        ],
      }),
    );
    const m = new Missions({ now: clock(2026, 9, 29).now });
    m.startRun('motor');
    m.sample(stats({ distance: 2000 }));
    expect(m.view().set[0].done).toBe(false);
    m.finishRun(stats({ distance: 2000 }));
    m.startRun('pasola');
    m.sample(stats({ distance: 801 }));
    expect(m.view().set[0].done).toBe(true);
  });

  it('a mid-run level up shows the finished set and starts the new one next run', () => {
    const m = new Missions({ now: clock(2026, 9, 29).now });
    m.startRun('motor');
    m.sample(stats({ distance: 320, platanos: 11, nearMisses: 2 }));
    const v = m.view();
    expect(v.level).toBe(1);
    expect(v.lastSet!.every((x) => x.done)).toBe(true);
    // the new set does not start on this run's numbers
    m.sample(stats({ distance: 5000, platanos: 50, nearMisses: 9, cvMeters: 900, gasSec: 60, bestTrickHold: 3 }));
    expect(m.view().doneCount).toBe(0);
    m.finishRun(stats());
    m.startRun('motor');
    expect(m.view().lastSet).toBeNull();
    m.sample(stats({ cvMeters: 150 }));
    expect(m.view().doneCount).toBe(1);
  });

  it('the multiplicador del barrio climbs 0.25 per level and caps at ×3', () => {
    expect(barrioMultFor(0)).toBe(1);
    expect(barrioMultFor(2)).toBe(1.5);
    expect(barrioMultFor(8)).toBe(CONFIG.barrioMultMax);
    expect(barrioMultFor(40)).toBe(CONFIG.barrioMultMax);
    const m = new Missions({ now: clock(2026, 9, 29).now, rng: () => 0.7 });
    for (let i = 0; i < 12; i++) finishSet(m, m.view().set.some((x) => x.kind === 'civicMeters') ? 'civic' : 'pasola');
    expect(m.view().level).toBe(12);
    expect(m.barrioMult).toBe(CONFIG.barrioMultMax);
    // tier 2 targets and rewards from here on, never two ride goals at once
    for (const x of m.view().set) expect(x.reward).toBe(CONFIG.mandaoReward[2]);
    expect(m.view().set.filter((x) => x.kind === 'pasolaMeters' || x.kind === 'civicMeters').length).toBeLessThanOrEqual(1);
  });

  it('a corrupt or foreign save is a fresh start, never a crash', () => {
    for (const bad of ['{nope', '"a string"', '[]', '{"v":2,"level":5}', '{"v":1,"level":-3,"set":[]}', 'null']) {
      const store = installStorage();
      store.set('ecc.v1.mandaos', bad);
      store.set('ecc.v1.daily', '{broken');
      store.set('ecc.v1.streak', '{"last":"yesterday","n":"many"}');
      const m = new Missions({ now: clock(2026, 9, 29).now });
      const v = m.view();
      expect(v.level).toBe(0);
      expect(v.set.map((x) => x.kind)).toEqual(CONFIG.mandaoTutorial[0].map(([k]) => k));
      expect(v.streak).toBe(0);
      expect(v.dailyDay).toBe('2026-09-29');
      expect(JSON.parse(store.get('ecc.v1.mandaos')!).v).toBe(1); // rewritten clean
    }
  });

  it('a valid level with a broken set keeps the level and redraws the set', () => {
    installStorage().set('ecc.v1.mandaos', JSON.stringify({ v: 1, level: 4, set: [{ k: 'nope', t: 3 }] }));
    const m = new Missions({ now: clock(2026, 9, 29).now });
    expect(m.view().level).toBe(4);
    expect(m.view().set.length).toBe(3);
  });

  it('storage that throws still gives a playable session', () => {
    (globalThis as unknown as { localStorage: Storage }).localStorage = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
    } as unknown as Storage;
    const m = new Missions({ now: clock(2026, 9, 29).now });
    expect(finishSet(m).length).toBeGreaterThanOrEqual(3);
    expect(m.view().level).toBe(1);
  });
});

describe('El Mandao del Día: date math and the streak', () => {
  beforeEach(() => installStorage());

  it('local date keys roll over months, years and leap days', () => {
    expect(dayKey(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
    expect(prevDayKey('2026-03-01')).toBe('2026-02-28');
    expect(prevDayKey('2028-03-01')).toBe('2028-02-29');
    expect(prevDayKey('2027-01-01')).toBe('2026-12-31');
    expect(prevDayKey('2026-10-01')).toBe('2026-09-30');
  });

  it('the daily is seeded by the date: same day same goal, at the tier-1 target', () => {
    const c = clock(2026, 9, 29, 8);
    const a = new Missions({ now: c.now }).view().daily;
    installStorage();
    c.set(2026, 9, 29, 22);
    const b = new Missions({ now: c.now }).view().daily;
    expect([b.kind, b.target]).toEqual([a.kind, a.target]);
    expect(a.target).toBe(CONFIG.mandaoPool[a.kind as keyof typeof CONFIG.mandaoPool][1]);
    expect(a.kind).not.toBe('platanosTotal');
    // over a month of dates the goal varies
    const kinds = new Set<string>();
    for (let d = 1; d <= 30; d++) {
      installStorage();
      kinds.add(new Missions({ now: clock(2026, 11, d).now }).view().daily.kind);
    }
    expect(kinds.size).toBeGreaterThan(4);
  });

  it('pays once per day; a same-day replay pays nothing more', () => {
    const c = clock(2026, 9, 29);
    const m = new Missions({ now: c.now });
    const got = finishSet(m).filter((x) => x.daily);
    expect(got.length).toBe(1);
    expect(got[0].streak).toBe(1);
    expect(got[0].reward).toBe(CONFIG.dailyReward);
    expect(finishSet(m).filter((x) => x.daily).length).toBe(0);
    expect(m.view().daily.done).toBe(true);
  });

  it('days in a row grow the streak across a month and a year boundary, capped', () => {
    const c = clock(2026, 12, 29);
    const m = new Missions({ now: c.now });
    const days: Array<[number, number, number]> = [
      [2026, 12, 29], [2026, 12, 30], [2026, 12, 31], [2027, 1, 1], [2027, 1, 2], [2027, 1, 3], [2027, 1, 4], [2027, 1, 5],
    ];
    const streaks: number[] = [];
    const rewards: number[] = [];
    for (const [y, mo, d] of days) {
      c.set(y, mo, d);
      const daily = finishSet(m).find((x) => x.daily)!;
      streaks.push(daily.streak);
      rewards.push(daily.reward);
    }
    expect(streaks).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(rewards[1]).toBe(Math.round(CONFIG.dailyReward * streakMultFor(2)));
    expect(rewards[7]).toBe(Math.round(CONFIG.dailyReward * CONFIG.streakMax));
    expect(m.view().streak).toBe(8);
  });

  it('a missed day quietly restarts the streak (no lost-streak state is shown)', () => {
    const c = clock(2026, 2, 27);
    const m = new Missions({ now: c.now });
    finishSet(m);
    c.set(2026, 2, 28);
    finishSet(m);
    expect(m.view().streak).toBe(2);
    c.set(2026, 3, 2); // skipped March 1
    expect(m.view().streak).toBe(0); // not alive: shown as no streak at all
    const d = finishSet(m).find((x) => x.daily)!;
    expect(d.streak).toBe(1);
    expect(m.view().streak).toBe(1);
  });

  it('the daily rolls over at local midnight between runs, not mid-run', () => {
    const c = clock(2026, 9, 29, 23);
    const m = new Missions({ now: c.now });
    const before = m.view().dailyDay;
    m.startRun('motor');
    c.set(2026, 9, 30, 0);
    expect(m.view().dailyDay).toBe(before); // a run in progress keeps its daily
    m.finishRun(stats());
    expect(m.view().dailyDay).toBe('2026-09-30');
  });
});

describe('Economy: Las Pinturas against real income', () => {
  // Measured with tools/economy-lab.ts (-- career: 24 fresh saves, a mix of
  // riding styles, the human-ish bot): the median run picks up 53 plátanos
  // from the road, tutorial set 1 is done in run 1 and set 2 by run 3.
  // Re-measure after touching plátano placement, survival or the tutorials.
  const MEDIAN_RUN_PLATANOS = 53;
  const TUTORIAL_DONE_BY_RUN = [1, 3];

  it('the first pintura is affordable within 4 median runs (road plátanos plus the tutorial sets, no daily)', () => {
    const cheapest = Math.min(...Object.values(PINTURAS).map((list) => list[1].price));
    let bank = 0;
    let runs = 0;
    while (bank < cheapest && runs < 10) {
      runs++;
      bank += MEDIAN_RUN_PLATANOS;
      CONFIG.mandaoTutorial.forEach((set, i) => {
        if (TUTORIAL_DONE_BY_RUN[i] === runs) bank += set.length * CONFIG.mandaoTutorialReward + CONFIG.mandaoSetBonus;
      });
    }
    expect(runs).toBeLessThanOrEqual(4);
    // and not in the very first run: the first paint is a goal, not a gift
    expect(runs).toBeGreaterThan(1);
  });

  it('every pintura has a Spanish name, and Oro Fino is the top of every row', () => {
    for (const list of Object.values(PINTURAS)) {
      for (const p of list) expect(p.name.length).toBeGreaterThan(2);
      expect(list[list.length - 1].name).toBe('Oro Fino');
      expect(list[list.length - 1].price).toBe(Math.max(...list.map((p) => p.price)));
    }
  });
});
