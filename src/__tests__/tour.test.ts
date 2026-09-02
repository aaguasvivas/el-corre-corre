import { describe, expect, it } from 'vitest';
import { CONFIG } from '../config';
import { TRAMO_ORDER, lapLength, nextBorderIn, nextObeliscoAfter, nextTramoAfter, tramoFor } from '../tour';

const L = CONFIG.tramoLengthM;

describe('Los Tramos: the national lap', () => {
  it('starts every run at home on the Malecon', () => {
    expect(tramoFor(0)).toBe('malecon');
    expect(tramoFor(-5)).toBe('malecon'); // never negative-index the lap
  });

  it('crosses a border exactly every tramoLengthM, in riding order, forever', () => {
    for (let lap = 0; lap < 4; lap++) {
      TRAMO_ORDER.forEach((t, i) => {
        const start = lap * lapLength() + i * L;
        expect(tramoFor(start)).toBe(t);
        expect(tramoFor(start + L - 0.01)).toBe(t);
        expect(tramoFor(start + L)).toBe(TRAMO_ORDER[(i + 1) % TRAMO_ORDER.length]);
      });
    }
  });

  it('knows how far the next border is and what is behind it', () => {
    expect(nextBorderIn(0)).toBe(L);
    expect(nextBorderIn(L - 40)).toBeCloseTo(40);
    expect(nextBorderIn(L)).toBe(L);
    expect(nextTramoAfter(0)).toBe('zona');
    expect(nextTramoAfter(L + 1)).toBe('campo');
    expect(nextTramoAfter(2 * L + 1)).toBe('malecon');
  });

  it('stands one Obelisco per lap, always inside a Malecon stretch, ahead of the rider', () => {
    let d = 0;
    const seen: number[] = [];
    for (let i = 0; i < 6; i++) {
      const at = nextObeliscoAfter(d);
      expect(at).toBeGreaterThan(d);
      expect(tramoFor(at)).toBe('malecon');
      seen.push(at);
      d = at;
    }
    // consecutive sightings are exactly one lap apart: never two in one Malecon
    for (let i = 1; i < seen.length; i++) expect(seen[i] - seen[i - 1]).toBe(lapLength());
    expect(seen[0]).toBe(CONFIG.obeliscoOffsetM);
  });
});
