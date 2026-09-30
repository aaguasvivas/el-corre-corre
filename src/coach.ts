// coach.ts: contextual first-time hints, not a tutorial. One chip at a
// time, in order (steer, contra vía, the trick, the gas), each only until
// the move has been done once, ever. Learned moves persist as a bitmask in
// localStorage (ecc.v1.learned). A move done before its chip appears is
// learned too, so a player who already knows it never sees the chip.

import { CONFIG } from './config';

export type CoachId = 'steer' | 'cv' | 'trick' | 'gas';

export const COACH_ORDER: readonly CoachId[] = ['steer', 'cv', 'trick', 'gas'];
const BIT: Record<CoachId, number> = { steer: 1, cv: 2, trick: 4, gas: 8 };
export const LEARNED_KEY = 'ecc.v1.learned';
const PEDAL_SEEN_KEY = 'ecc.v1.pedalSeen'; // a gas press from before the chips existed

function readLearned(): number {
  try {
    const n = Number(localStorage.getItem(LEARNED_KEY) ?? 0);
    const gas = localStorage.getItem(PEDAL_SEEN_KEY) === '1' ? BIT.gas : 0;
    return ((Number.isInteger(n) ? n : 0) | gas) & 15;
  } catch {
    return 0;
  }
}

export class Coach {
  learned = readLearned();
  showing: CoachId | null = null;
  private shownAt = 0;
  private nextAt: number = CONFIG.coachStartSec;
  private shownThisRun = 0; // bitmask: each chip shows at most once a run
  private x0 = Number.NaN;

  isLearned(id: CoachId): boolean {
    return (this.learned & BIT[id]) !== 0;
  }

  startRun(): void {
    this.showing = null;
    this.nextAt = CONFIG.coachStartSec;
    this.shownThisRun = 0;
    this.x0 = Number.NaN;
  }

  // One live sim step, t seconds into the run, with what the player did:
  // the rider's x (m), riding en contra vía, holding the trick, holding the
  // gas. Returns the chip to show now, or null for none.
  step(t: number, x: number, cv: boolean, trick: boolean, gas: boolean): CoachId | null {
    if (Number.isNaN(this.x0)) this.x0 = x;
    if (Math.abs(x - this.x0) > CONFIG.coachSteerM) this.learn('steer');
    if (cv) this.learn('cv');
    if (trick) this.learn('trick');
    if (gas) this.learn('gas');
    if (this.showing && (this.isLearned(this.showing) || t - this.shownAt >= CONFIG.coachShowSec)) {
      this.showing = null;
    }
    if (!this.showing && t >= this.nextAt) {
      for (const id of COACH_ORDER) {
        if (this.isLearned(id) || (this.shownThisRun & BIT[id]) !== 0) continue;
        this.showing = id;
        this.shownAt = t;
        this.shownThisRun |= BIT[id];
        this.nextAt = t + CONFIG.coachGapSec;
        break;
      }
    }
    return this.showing;
  }

  private learn(id: CoachId): void {
    if (this.isLearned(id)) return;
    this.learned |= BIT[id];
    try {
      localStorage.setItem(LEARNED_KEY, String(this.learned));
    } catch {
      // fine: the chip may show once more next launch
    }
  }
}
