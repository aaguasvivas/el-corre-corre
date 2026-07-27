// score.ts: scoring and record persistence. Phase 1 model: 1 point per meter.
// Combo, contra via, and popups arrive in Phase 2 on top of this.

const RECORD_KEY = 'ecc.v1.record';

export interface RunResult {
  points: number;
  distanceM: number;
  record: number;
  isNewRecord: boolean;
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
    // private mode etc.: the run still works, the record just does not persist
  }
}

export class Score {
  distance = 0;
  record = readInt(RECORD_KEY);

  get points(): number {
    return Math.floor(this.distance);
  }

  step(ds: number): void {
    this.distance += ds;
  }

  finishRun(): RunResult {
    const points = this.points;
    const isNewRecord = points > this.record;
    if (isNewRecord) {
      this.record = points;
      writeInt(RECORD_KEY, points);
    }
    return { points, distanceM: Math.floor(this.distance), record: this.record, isNewRecord };
  }

  // Defensive save (e.g. app backgrounded mid-run).
  persist(): void {
    if (this.points > this.record) {
      this.record = this.points;
      writeInt(RECORD_KEY, this.record);
    }
  }

  reset(): void {
    this.distance = 0;
  }
}
