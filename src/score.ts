// score.ts: the full scoring model with per-vehicle records.
// Distance +1/m, platano +10, near-miss +25 x combo, airtime +15/s,
// wheelie +5/s. EVERYTHING x2 en contra via, x1.5 during the caballito
// (they stack), and the Civic adds its own +15%. Records persist per vehicle.

import { CONFIG, VEHICLES, type VehicleId } from './config';

const LEGACY_RECORD = 'ecc.v1.record';
const LEGACY_DIST = 'ecc.v1.recordDist';
const PLATANOS_KEY = 'ecc.v1.platanosLifetime'; // future soft currency (roadmap)

const recordKey = (v: VehicleId): string => `ecc.v1.record.${v}`;
const distKey = (v: VehicleId): string => `ecc.v1.recordDist.${v}`;

export interface RunResult {
  points: number;
  distanceM: number;
  platanos: number;
  record: number;
  isNewRecord: boolean;
  closeCall: number | null; // points short of the record, when tantalizingly close
}

export interface NearMissResult {
  pts: number;
  combo: number;
}

// Ladder thresholds live here; the per-language slang lives in ui.ts.
export const LADDER_STEPS = [2, 3, 5, 7, 10, 15] as const;

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

// One-time migration: pre-Phase-5 records belong to El Motor.
function migrateLegacy(): void {
  try {
    const old = localStorage.getItem(LEGACY_RECORD);
    if (old !== null && localStorage.getItem(recordKey('motor')) === null) {
      localStorage.setItem(recordKey('motor'), old);
      const oldDist = localStorage.getItem(LEGACY_DIST);
      if (oldDist !== null) localStorage.setItem(distKey('motor'), oldDist);
    }
    localStorage.removeItem(LEGACY_RECORD);
    localStorage.removeItem(LEGACY_DIST);
  } catch {
    // fine
  }
}

export class Score {
  distance = 0;
  platanos = 0;
  combo = 0;
  record = 0;
  recordDist = 0;

  private vehicle: VehicleId = 'motor';
  private vehicleScoreMult = 1;
  private distTier = 1;
  private pointsF = 0;
  private comboTimer = 0;
  private contraVia = false;
  private wheelieOn = false;
  private airAccum = 0;
  private wheelieAccum = 0;
  private platanosLifetime = readInt(PLATANOS_KEY);

  constructor() {
    migrateLegacy();
  }

  get points(): number {
    return Math.floor(this.pointsF);
  }

  get isContraVia(): boolean {
    return this.contraVia;
  }

  recordFor(v: VehicleId): number {
    return readInt(recordKey(v));
  }

  setVehicle(v: VehicleId): void {
    this.vehicle = v;
    this.vehicleScoreMult = VEHICLES[v].scoreMult;
    this.record = readInt(recordKey(v));
    this.recordDist = readInt(distKey(v));
  }

  get distMult(): number {
    return this.distTier;
  }

  private mult(): number {
    return (
      (this.contraVia ? CONFIG.contraViaMultiplier : 1) *
      (this.wheelieOn ? CONFIG.wheelieMultiplier : 1) *
      this.vehicleScoreMult *
      this.distTier
    );
  }

  setContraVia(on: boolean): void {
    this.contraVia = on;
  }

  setWheelie(on: boolean): void {
    this.wheelieOn = on;
  }

  step(ds: number, dt: number, opts: { airborne: boolean; wheelie: boolean }): void {
    this.distance += ds;
    this.distTier = 1;
    for (const [m, mult] of CONFIG.distMultTiers) {
      if (this.distance >= m) this.distTier = mult;
    }
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
    const pts = Math.round(CONFIG.nearMissPoints * this.combo * this.mult());
    this.pointsF += pts;
    return { pts, combo: this.combo };
  }

  collectPlatano(): number {
    const pts = Math.round(CONFIG.platanoPoints * this.mult());
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
    let closeCall: number | null = null;
    if (isNewRecord) {
      this.record = points;
      writeInt(recordKey(this.vehicle), points);
    } else if (this.record > 0) {
      const short = this.record - points;
      if (short > 0 && short <= Math.max(50, this.record * CONFIG.closeCallShare)) {
        closeCall = short;
      }
    }
    if (this.distance > this.recordDist) {
      this.recordDist = Math.floor(this.distance);
      writeInt(distKey(this.vehicle), this.recordDist);
    }
    writeInt(PLATANOS_KEY, this.platanosLifetime);
    return {
      points,
      distanceM: Math.floor(this.distance),
      platanos: this.platanos,
      record: this.record,
      isNewRecord,
      closeCall,
    };
  }

  // Defensive save (e.g. app backgrounded mid-run, or quitting from PAUSE).
  // Mirrors finishRun on BOTH records: banking points without the distance
  // would leave La Cinta del Récord stranded at an older distance than the
  // Récord the player is being shown.
  persist(): void {
    if (this.points > this.record) {
      this.record = this.points;
      writeInt(recordKey(this.vehicle), this.record);
    }
    if (this.distance > this.recordDist) {
      this.recordDist = Math.floor(this.distance);
      writeInt(distKey(this.vehicle), this.recordDist);
    }
    writeInt(PLATANOS_KEY, this.platanosLifetime);
  }

  reset(): void {
    this.distance = 0;
    this.distTier = 1;
    this.pointsF = 0;
    this.platanos = 0;
    this.combo = 0;
    this.comboTimer = 0;
    this.contraVia = false;
    this.wheelieOn = false;
    this.airAccum = 0;
    this.wheelieAccum = 0;
  }
}
