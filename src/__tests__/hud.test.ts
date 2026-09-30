import { beforeEach, describe, expect, it } from 'vitest';
import { CONFIG } from '../config';
import { AnnounceQueue, announcement } from '../announce';
import { Coach, LEARNED_KEY } from '../coach';
import { STRINGS } from '../ui';

// A tiny localStorage for the coach's learned bits.
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

// Step the lane at 60 Hz for sec seconds; return every text it showed, in order.
function run(q: AnnounceQueue, sec: number): string[] {
  const shown: string[] = [];
  for (let t = 0; t < sec; t += 1 / 60) {
    if (q.step(1 / 60) && q.current) shown.push(q.current.text);
  }
  return shown;
}

describe('the announcement lane', () => {
  it('shows one at a time, each for its full time, in order', () => {
    const q = new AnnounceQueue();
    q.push(announcement('tramo', 'LA ZONA COLONIAL', 'LLEGASTE A'));
    q.push(announcement('mandao', 'Recoge 10 plátanos'));
    const shown: Array<[string, number]> = [];
    for (let t = 0; t < 8; t += 1 / 60) {
      if (q.step(1 / 60) && q.current) shown.push([q.current.text, q.now]);
    }
    expect(shown.map((s) => s[0])).toEqual(['LA ZONA COLONIAL', 'Recoge 10 plátanos']);
    // the mandao waited out the whole sign, plus the exit gap
    expect(shown[1][1] - shown[0][1]).toBeGreaterThanOrEqual(CONFIG.announce.tramo[2] + CONFIG.announceOutSec - 1e-6);
  });

  it('a record cuts a lower one short, but only after its minimum time', () => {
    const q = new AnnounceQueue();
    q.push(announcement('tramo', 'EL CAMPO', 'YA ESTÁS EN'));
    q.step(1 / 60);
    run(q, 0.5); // the sign has been up half a second
    q.push(announcement('record', '¡NUEVO RÉCORD!'));
    let cutAt = -1;
    for (let t = 0; t < 3 && cutAt < 0; t += 1 / 60) {
      q.step(1 / 60);
      if (q.current?.kind === 'record') cutAt = q.now;
    }
    const minSec = CONFIG.announce.tramo[1];
    expect(cutAt).toBeGreaterThanOrEqual(minSec + CONFIG.announceOutSec - 1e-6);
    expect(cutAt).toBeLessThan(CONFIG.announce.tramo[2]);
    expect(q.lastCut).toBe(true);
  });

  it('a queued set-piece name that waited past its ttl is dropped', () => {
    const q = new AnnounceQueue();
    q.push(announcement('tramo', 'LA ZONA COLONIAL', 'LLEGASTE A'));
    q.step(1 / 60);
    q.push(announcement('setPiece', '¡TAPÓN!'));
    const shown = run(q, 6);
    expect(shown).not.toContain('¡TAPÓN!');
  });

  it('equal priorities keep their order; a higher one jumps the queue', () => {
    const q = new AnnounceQueue();
    q.push(announcement('landmark', 'A'));
    q.step(0);
    q.push(announcement('mandao', 'B'));
    q.push(announcement('mandao', 'C'));
    q.push(announcement('shield', 'S'));
    expect(run(q, 12)).toEqual(['S', 'B', 'C']);
  });
});

describe('coach chips', () => {
  let store: Map<string, string>;
  beforeEach(() => {
    store = installStorage();
  });

  // Steps a run at 120 Hz with a fixed behavior; returns [time, chip] changes.
  function ride(c: Coach, sec: number, act: (t: number) => { x?: number; cv?: boolean; trick?: boolean; gas?: boolean; hot?: boolean }) {
    const seen: Array<[number, string | null]> = [];
    let last: string | null = null;
    c.startRun();
    for (let t = 0; t < sec; t += 1 / 120) {
      const a = act(t);
      const id = c.step(t, a.x ?? -3.4, a.cv ?? false, a.trick ?? false, a.gas ?? false, a.hot ?? false);
      if (id !== last) {
        seen.push([+t.toFixed(3), id]);
        last = id;
      }
    }
    return seen;
  }

  it('a new player gets steer, contra vía, the trick and the gas, one at a time, never before coachStartSec', () => {
    const seen = ride(new Coach(), 30, () => ({}));
    const shows = seen.filter((s) => s[1] !== null);
    expect(shows.map((s) => s[1])).toEqual(['steer', 'cv', 'trick', 'gas']);
    expect(shows[0][0]).toBeGreaterThanOrEqual(CONFIG.coachStartSec);
    for (let i = 1; i < shows.length; i++) {
      expect(shows[i][0] - shows[i - 1][0]).toBeGreaterThanOrEqual(CONFIG.coachGapSec - 0.01);
    }
    // each one leaves on its own after coachShowSec
    const firstHide = seen.find((s) => s[1] === null)!;
    expect(firstHide[0] - shows[0][0]).toBeCloseTo(CONFIG.coachShowSec, 1);
  });

  it('doing the move hides its chip at once and it never shows again, even next launch', () => {
    const c = new Coach();
    const seen = ride(c, 3, (t) => ({ x: t > 2 ? -1.5 : -3.4 })); // steers at 2 s
    expect(seen[0][1]).toBe('steer');
    expect(seen[1][0]).toBeCloseTo(2, 1);
    expect(c.isLearned('steer')).toBe(true);
    expect(Number(store.get(LEARNED_KEY)) & 1).toBe(1);
    const next = new Coach(); // a fresh launch reads the saved bits
    const shows = ride(next, 30, () => ({ x: -3.4 })).filter((s) => s[1] !== null);
    expect(shows.map((s) => s[1])).not.toContain('steer');
  });

  it('a move done before its chip appears is learned without the chip', () => {
    const seen = ride(new Coach(), 30, (t) => ({ x: t > 0.5 ? 2 : -3.4, cv: t > 0.6 }));
    const shows = seen.filter((s) => s[1] !== null).map((s) => s[1]);
    expect(shows).toEqual(['trick', 'gas']);
  });

  it('a gas press from before the chips existed counts as learned', () => {
    store.set('ecc.v1.pedalSeen', '1');
    expect(new Coach().isLearned('gas')).toBe(true);
  });

  it('the first hot brake takes the chip until the pads cool, then never shows again', () => {
    const c = new Coach();
    // the steer chip is up at 2 s; the brake cooks from 3 s to 5 s
    const seen = ride(c, 8, (t) => ({ hot: t >= 3 && t < 5 }));
    const hot = seen.filter((s) => s[1] === 'hot');
    expect(hot).toHaveLength(1);
    expect(hot[0][0]).toBeCloseTo(3, 1);
    const after = seen.find((s) => s[0] > hot[0][0]);
    expect(after && after[1] === null && after[0]).toBeCloseTo(5, 1);
    expect(c.isLearned('hot')).toBe(true);
    expect(Number(store.get(LEARNED_KEY)) & 16).toBe(16);
    const again = ride(new Coach(), 8, (t) => ({ hot: t >= 3 && t < 5 }));
    expect(again.map((s) => s[1])).not.toContain('hot');
  });

  it('a hot brake alone never teaches the timed chips', () => {
    const shows = ride(new Coach(), 30, (t) => ({ hot: t >= 3 && t < 5 }))
      .filter((s) => s[1] !== null && s[1] !== 'hot')
      .map((s) => s[1]);
    expect(shows).toEqual(['steer', 'cv', 'trick', 'gas']);
  });
});

describe('in-run copy', () => {
  const tramos = ['malecon', 'zona', 'campo'] as const;

  it('the tramo sign never reads "A EL": no ES kicker ending in " A" before a name starting with "EL "', () => {
    for (const t of tramos) {
      const kicker = STRINGS.es.tramoKicker[t];
      const name = STRINGS.es.tramoNames[t];
      expect(`${kicker} ${name}`.includes(' A EL ')).toBe(false);
      if (name.startsWith('EL ')) expect(kicker.endsWith(' A')).toBe(false);
    }
    expect(`${STRINGS.es.tramoKicker.campo} ${STRINGS.es.tramoNames.campo}`).toBe('YA ESTÁS EN EL CAMPO');
    expect(`${STRINGS.es.tramoKicker.malecon} ${STRINGS.es.tramoNames.malecon}`).toBe('DE VUELTA EN EL MALECÓN');
  });

  it('both languages carry the same strings, with no em dash anywhere', () => {
    expect(Object.keys(STRINGS.en).sort()).toEqual(Object.keys(STRINGS.es).sort());
    for (const lang of ['es', 'en'] as const) {
      expect(JSON.stringify(STRINGS[lang])).not.toContain('\u2014');
    }
  });

  it('the slang ladder has six rungs in both languages, typographic apostrophes, no em dash', () => {
    for (const lang of ['es', 'en'] as const) {
      const ladder = STRINGS[lang].ladder;
      expect(ladder).toHaveLength(6);
      for (const rung of ladder) {
        expect(rung).not.toMatch(/['\u2014]/);
      }
    }
    expect(STRINGS.en.ladder).toEqual(['That’s it!', 'Sick!', 'Dang!', 'You’re crazy!', 'THIS GUY’S A MANIAC!', 'LEGEND OF THE MALECÓN!']);
  });

  it('copy agrees with its numbers and its ride', () => {
    expect(STRINGS.es.toGo(1)).toBe('FALTA 1');
    expect(STRINGS.es.toGo(1200)).toBe('FALTAN 1,200');
    expect(STRINGS.en.inVehicle('EL CIVIC TUNEAO', true)).toBe('in EL CIVIC TUNEAO down the Malecón');
    expect(STRINGS.en.inVehicle('EL MOTOR', false)).toBe('on EL MOTOR down the Malecón');
    expect(STRINGS.es.inVehicleReached('EL CIVIC TUNEAO', 'EL CAMPO', true)).toBe('en EL CIVIC TUNEAO hasta EL CAMPO');
    expect(STRINGS.es.shareLevel('Novato', '')).toBe('Nivel Novato');
    expect(STRINGS.en.shareLevel('Passenger', '×1.5')).toBe('Level Passenger ×1.5');
  });

  it('coach chips and La Cinta chip exist in both languages and group their numbers', () => {
    for (const lang of ['es', 'en'] as const) {
      const t = STRINGS[lang];
      for (const s of [t.coachSteer, t.coachCv('×2'), t.coachTrick('X'), t.coachGas('×1.5'), t.tapeToGo(1200)]) {
        expect(s.length).toBeGreaterThan(4);
        expect(s).not.toMatch(/['\u2014]/);
      }
      expect(t.tapeToGo(1200)).toContain('1,200');
    }
    expect(STRINGS.es.tapeToGo(180)).toBe('Faltan 180 m');
    expect(STRINGS.en.tapeToGo(180)).toBe('180 m to go');
    // closeCall is the game-over card's distance line (meters short of the tape)
    expect(STRINGS.es.closeCall(1234)).toBe('¡Te quedaste a 1,234 m!');
  });
});
