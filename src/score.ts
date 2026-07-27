// score.ts: the full Phase 2 scoring model.
// Distance +1/m, platano +10, near-miss +25 x combo, airtime +15/s,
// wheelie +5/s, and EVERYTHING x2 en contra via. Records persist.

import { CONFIG } from './config';

const RECORD_KEY = 'ecc.v1.record';
const DIST_KEY = 'ecc.v1.recordDist';
const PLATANOS_KEY = 'ecc.v1.platanosLifetime'; // future soft currency (roadmap)

export interface RunResult {
  points: number;
  distanceM: number;
  platanos: number;
  record: number;
  isNewRecord: boolean;
}

export interface NearMissResult {
  pts: number;
  combo: number;
  ladderText: string | null;
}

// The slang ladder stays Dominican in both languages. DECISION: it is flavor,
// not UI copy, and it does not translate.
const LADDER: ReadonlyArray<readonly [number, string]> = [
  [2, '¡Eso!'],
  [3, '¡Duro!'],
  [5, '¡Diablo!'],
  [7, "¡Tú ta' loco!"],
  [10, "¡ETE E' UN LOCO!"],
  [15, '¡LEYENDA DEL MALECÓN!'],
];

export function ladderTier(combo: number): string | null {
  let text: string | null = null;
  for (const [n, s] of LADDER) {
    if (combo >= n) text = s;
  }
  return text;
}

function readInt(key: string): number {
  try {
    const v = localStorage.getItem(key);
    const n = v === null ? 0 : parseInt(v, 10);
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

function writeInt(key: string, value: number): void {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    // private mode etc.: the run still works, records just do not persist
  }
}

export class Score {
  distance = 0;
  platanos = 0;
  combo = 0;
  record = readInt(RECORD_KEY);
  recordDist = readInt(DIST_KEY);

  private pointsF = 0;
  private comboTimer = 0;
  private contraVia = false;
  private airAccum = 0;
  private wheelieAccum = 0;
  private platanosLifetime = readInt(PLATANOS_KEY);

  get points(): number {
    return Math.floor(this.pointsF);
  }

  get isContraVia(): boolean {
    return this.contraVia;
  }

  private mult(): number {
    return this.contraVia ? CONFIG.contraViaMultiplier : 1;
  }

  setContraVia(on: boolean): void {
    this.contraVia = on;
  }

  step(ds: number, dt: number, opts: { airborne: boolean; wheelie: boolean }): void {
    this.distance += ds;
    this.pointsF += ds * this.mult();
    if (opts.airborne) {
      const a = CONFIG.airtimePointsPerSec * dt * this.mult();
      this.pointsF += a;
      this.airAccum += a;
    }
    if (opts.wheelie) {
      const w = CONFIG.wheeliePointsPerSec * dt * this.mult();
      this.pointsF += w;
      this.wheelieAccum += w;
    }
    if (this.combo > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) this.combo = 0;
    }
  }

  nearMiss(): NearMissResult {
    this.combo += 1;
    this.comboTimer = CONFIG.comboDecaySec;
    const pts = CONFIG.nearMissPoints * this.combo * this.mult();
    this.pointsF += pts;
    let ladderText: string | null = null;
    for (const [n, s] of LADDER) {
      if (this.combo === n) ladderText = s;
    }
    return { pts, combo: this.combo, ladderText };
  }

  collectPlatano(): number {
    const pts = CONFIG.platanoPoints * this.mult();
    this.pointsF += pts;
    this.platanos += 1;
    this.platanosLifetime += 1;
    return pts;
  }

  // Hoyos and edge scrapes kill the chain
  resetCombo(): void {
    this.combo = 0;
    this.comboTimer = 0;
  }

  endAir(): number {
    const r = Math.round(this.airAccum);
    this.airAccum = 0;
    return r;
  }

  endWheelie(): number {
    const r = Math.round(this.wheelieAccum);
    this.wheelieAccum = 0;
    return r;
  }

  finishRun(): RunResult {
    const points = this.points;
    const isNewRecord = points > this.record;
    if (isNewRecord) {
      this.record = points;
      writeInt(RECORD_KEY, points);
    }
    if (this.distance > this.recordDist) {
      this.recordDist = Math.floor(this.distance);
      writeInt(DIST_KEY, this.recordDist);
    }
    writeInt(PLATANOS_KEY, this.platanosLifetime);
    return {
      points,
      distanceM: Math.floor(this.distance),
      platanos: this.platanos,
      record: this.record,
      isNewRecord,
    };
  }

  // Defensive save (e.g. app backgrounded mid-run).
  persist(): void {
    if (this.points > this.record) {
      this.record = this.points;
      writeInt(RECORD_KEY, this.record);
    }
    writeInt(PLATANOS_KEY, this.platanosLifetime);
  }

  reset(): void {
    this.distance = 0;
    this.pointsF = 0;
    this.platanos = 0;
    this.combo = 0;
    this.comboTimer = 0;
    this.contraVia = false;
    this.airAccum = 0;
    this.wheelieAccum = 0;
  }
}
