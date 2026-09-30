// score.ts: the full scoring model with per-vehicle records.
// Distance +1/m, platano +10, near-miss +25 x combo (x2 more por un pelito),
// airtime +15/s plus a landing bonus, wheelie +5/s. EVERYTHING x2 en contra
// via, x1.5 during the caballito, x1.5 a fondo, x0.5 while braking, the
// Civic's own +22%, the distance tier and the barrio multiplier from Los
// Mandaos (they all stack). Records persist per vehicle.
//
// Records are read at run start and held for the whole run (runStartRecord,
// runStartRecordDist). Every in-run moment (the ¡NUEVO RÉCORD! banner, La
// Cinta, the close call, the game-over badges) compares against those, so a
// mid-run persist (pause, backgrounding) can never fake a record.

import { CONFIG, PINTURAS, VEHICLES, type VehicleId } from './config';
import type { Tramo } from './tour';

const LEGACY_RECORD = 'ecc.v1.record';
const LEGACY_DIST = 'ecc.v1.recordDist';
// The spendable wallet. The key predates the store; it is kept so no save
// is lost, even though a purchase makes it go down.
const WALLET_KEY = 'ecc.v1.platanosLifetime';
// Every plátano ever picked up. Never decreases; seeded from the wallet the
// first time it is read.
const TOTAL_KEY = 'ecc.v1.platanosTotal';

const recordKey = (v: VehicleId): string => `ecc.v1.record.${v}`;
const distKey = (v: VehicleId): string => `ecc.v1.recordDist.${v}`;

export interface RunResult {
  points: number;
  distanceM: number;
  platanos: number; // picked up this run
  platanosEarned: number; // picked up plus every mandao reward this run
  record: number; // the points record after this run
  isNewRecord: boolean; // points beat the record the run started with
  isNewDistRecord: boolean; // distance beat a previous distance record (not a first run)
  prevRecord: number; // the points record the run started with
  prevRecordDist: number; // the distance record the run started with
  tramo: Tramo; // how far into the country the run got
  bestCombo: number;
  nearMisses: number;
  razorMisses: number;
  cvMeters: number;
  gasSec: number;
  trickSec: number;
  airs: number; // clean landings off a policía
}

export interface NearMissResult {
  pts: number;
  combo: number;
  razor: boolean;
}

// The next pintura worth saving for on a ride, for the game-over line.
export interface PinturaGoal {
  index: number;
  name: string;
  price: number;
  need: number; // plátanos still missing; 0 when the bank covers it
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

function hasKey(key: string): boolean {
  try {
    return localStorage.getItem(key) !== null;
  } catch {
    return false;
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

// The cheapest pintura on this ride the player does not own yet, and how
// far the bank is from it. null once the whole row is owned.
export function nextPintura(v: VehicleId, owned: ReadonlySet<number>, bank: number): PinturaGoal | null {
  const list = PINTURAS[v];
  let best = -1;
  for (let i = 1; i < list.length; i++) {
    if (owned.has(i)) continue;
    if (best < 0 || list[i].price < list[best].price) best = i;
  }
  if (best < 0) return null;
  const p = list[best];
  return { index: best, name: p.name, price: p.price, need: Math.max(0, p.price - Math.max(0, bank)) };
}

export class Score {
  distance = 0;
  platanos = 0;
  combo = 0;
  record = 0;
  recordDist = 0;

  // This run's counters. Mandaos read them (see missions.ts RunStats).
  nearMisses = 0;
  razorMisses = 0;
  cvNearMisses = 0;
  bestCombo = 0;
  cvMeters = 0;
  gasSec = 0;
  trickSec = 0;
  bestTrickHold = 0; // longest single caballito or derrape, s
  airs = 0;
  bestCleanM = 0; // longest stretch without eating a hoyo, m

  private vehicle: VehicleId = 'motor';
  private vehicleScoreMult = 1;
  private barrioMult = 1;
  private distTier = 1;
  private pointsF = 0;
  private comboTimer = 0;
  private contraVia = false;
  private wheelieOn = false;
  private gasOn = false;
  private brakeOn = false;
  private airAccum = 0;
  private airT = 0;
  private wheelieAccum = 0;
  private trickHold = 0;
  private cleanM = 0;
  private rewardsThisRun = 0;
  private runStartRecord = 0;
  private runStartRecordDist = 0;
  private wallet = readInt(WALLET_KEY);
  private total = Math.max(readInt(TOTAL_KEY), hasKey(TOTAL_KEY) ? 0 : this.wallet);

  constructor() {
    migrateLegacy();
    // Seed the lifetime total once, so a purchase before the first finished
    // run cannot lower where it starts.
    if (!hasKey(TOTAL_KEY)) writeInt(TOTAL_KEY, this.total);
  }

  get points(): number {
    return Math.floor(this.pointsF);
  }

  get isContraVia(): boolean {
    return this.contraVia;
  }

  // 1 right after a near-miss, 0 as the combo is about to drop. The HUD
  // draws it so a vanishing combo never feels like a mystery.
  get comboFraction(): number {
    if (this.combo <= 0) return 0;
    return Math.max(0, Math.min(1, this.comboTimer / CONFIG.comboDecaySec));
  }

  // The records this run is chasing, frozen at run start.
  get prevRecord(): number {
    return this.runStartRecord;
  }

  get prevRecordDist(): number {
    return this.runStartRecordDist;
  }

  recordFor(v: VehicleId): number {
    return readInt(recordKey(v));
  }

  setVehicle(v: VehicleId): void {
    this.vehicle = v;
    this.vehicleScoreMult = VEHICLES[v].scoreMult;
    this.record = readInt(recordKey(v));
    this.recordDist = readInt(distKey(v));
    this.snapshotRecords();
  }

  // Los Mandaos' level bonus. Set before a run; it multiplies points only,
  // never distance, so La Cinta stays an honest skill line.
  setBarrioMult(m: number): void {
    this.barrioMult = m > 0 ? m : 1;
  }

  get distMult(): number {
    return this.distTier;
  }

  // Everything that multiplies a point right now, as one number: the HUD
  // chip shows it, so the player sees that stacking risks pays.
  get liveMult(): number {
    return this.mult();
  }

  private mult(): number {
    return (
      (this.contraVia ? CONFIG.contraViaMultiplier : 1) *
      (this.wheelieOn ? CONFIG.wheelieMultiplier : 1) *
      (this.gasOn ? CONFIG.gasScoreMult : 1) *
      (this.brakeOn ? CONFIG.brakeScoreMult : 1) *
      this.vehicleScoreMult *
      this.distTier *
      this.barrioMult
    );
  }

  setContraVia(on: boolean): void {
    this.contraVia = on;
  }

  setWheelie(on: boolean): void {
    this.wheelieOn = on;
  }

  // A fondo: the pedal's reward side. Stacks with everything else.
  setGas(on: boolean): void {
    this.gasOn = on;
  }

  // Frenando: the pedal's cost side. Braking is always safe and never free.
  setBrake(on: boolean): void {
    this.brakeOn = on;
  }

  step(ds: number, dt: number, opts: { airborne: boolean; wheelie: boolean }): void {
    this.distance += ds;
    this.distTier = 1;
    // Indexed: destructuring in a 120 Hz loop allocates an iterator per tier.
    for (let i = 0; i < CONFIG.distMultTiers.length; i++) {
      const tier = CONFIG.distMultTiers[i];
      if (this.distance >= tier[0]) this.distTier = tier[1];
    }
    const m = this.mult();
    this.pointsF += ds * m;
    if (opts.airborne) {
      const a = CONFIG.airtimePointsPerSec * dt * m;
      this.pointsF += a;
      this.airAccum += a;
      this.airT += dt;
    }
    if (opts.wheelie) {
      const w = CONFIG.wheeliePointsPerSec * dt * m;
      this.pointsF += w;
      this.wheelieAccum += w;
      this.trickSec += dt;
      this.trickHold += dt;
      if (this.trickHold > this.bestTrickHold) this.bestTrickHold = this.trickHold;
    } else {
      this.trickHold = 0;
    }
    if (this.contraVia) this.cvMeters += ds;
    if (this.gasOn) this.gasSec += dt;
    this.cleanM += ds;
    if (this.cleanM > this.bestCleanM) this.bestCleanM = this.cleanM;
    if (this.combo > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) this.combo = 0;
    }
  }

  // clearance: meters between the rider's circle and the vehicle's hitbox at
  // the pass. At razorMissM or tighter it is ¡Por un pelito! and pays double.
  nearMiss(clearance: number = Infinity): NearMissResult {
    const razor = clearance <= CONFIG.razorMissM;
    this.combo += 1;
    this.comboTimer = CONFIG.comboDecaySec;
    if (this.combo > this.bestCombo) this.bestCombo = this.combo;
    this.nearMisses += 1;
    if (razor) this.razorMisses += 1;
    if (this.contraVia) this.cvNearMisses += 1;
    const pts = Math.round(
      CONFIG.nearMissPoints * this.combo * this.mult() * (razor ? CONFIG.razorMissMult : 1),
    );
    this.pointsF += pts;
    return { pts, combo: this.combo, razor };
  }

  collectPlatano(): number {
    const pts = Math.round(CONFIG.platanoPoints * this.mult());
    this.pointsF += pts;
    this.platanos += 1;
    this.wallet += 1;
    this.total += 1;
    return pts;
  }

  // Hoyos and edge scrapes kill the chain
  resetCombo(): void {
    this.combo = 0;
    this.comboTimer = 0;
  }

  // A hoyo also ends the clean stretch the "sin caer en un hoyo" mandao counts.
  hitHoyo(): void {
    this.resetCombo();
    this.cleanM = 0;
  }

  // The rider touched down. A real jump (airLandMinSec or longer aloft)
  // lands a flat bonus at the live multiplier. Returns everything the jump
  // paid, for the ¡AIRE! popup.
  endAir(): number {
    if (this.airT >= CONFIG.airLandMinSec) {
      const bonus = CONFIG.airLandBonus * this.mult();
      this.pointsF += bonus;
      this.airAccum += bonus;
      this.airs += 1;
    }
    const r = Math.round(this.airAccum);
    this.airAccum = 0;
    this.airT = 0;
    return r;
  }

  endWheelie(): number {
    const r = Math.round(this.wheelieAccum);
    this.wheelieAccum = 0;
    return r;
  }

  finishRun(tramo: Tramo): RunResult {
    const points = this.points;
    const distanceM = Math.floor(this.distance);
    const prevRecord = this.runStartRecord;
    const prevRecordDist = this.runStartRecordDist;
    const isNewRecord = points > prevRecord;
    // DECISION: a first run on a ride rode to LA META, not to a record, so
    // only beating an earlier distance counts as "farther than ever".
    const isNewDistRecord = prevRecordDist > 0 && distanceM > prevRecordDist;
    this.bankRecords();
    return {
      points,
      distanceM,
      platanos: this.platanos,
      platanosEarned: this.platanos + this.rewardsThisRun,
      record: this.record,
      isNewRecord,
      isNewDistRecord,
      prevRecord,
      prevRecordDist,
      tramo,
      bestCombo: this.bestCombo,
      nearMisses: this.nearMisses,
      razorMisses: this.razorMisses,
      cvMeters: Math.floor(this.cvMeters),
      gasSec: Math.floor(this.gasSec),
      trickSec: Math.floor(this.trickSec),
      airs: this.airs,
    };
  }

  // Las Pinturas: the wallet is what can be spent.
  get bank(): number {
    return this.wallet;
  }

  // Every plátano ever picked up; spending never lowers it.
  get platanosTotal(): number {
    return this.total;
  }

  // A mandao reward lands in the wallet at once (a killed app keeps it).
  addToBank(n: number): void {
    const add = Math.floor(n);
    if (!(add > 0)) return;
    this.wallet += add;
    this.rewardsThisRun += add;
    writeInt(WALLET_KEY, this.wallet);
  }

  spend(n: number): boolean {
    if (!(n >= 0) || this.wallet < n) return false;
    this.wallet -= n;
    writeInt(WALLET_KEY, this.wallet);
    return true;
  }

  // Defensive save (app backgrounded mid-run, or quitting from PAUSE). It
  // banks both records and the wallet for crash safety; the run keeps
  // chasing the records it started with, so this can never fake one.
  persist(): void {
    this.bankRecords();
  }

  private bankRecords(): void {
    if (this.points > this.record) {
      this.record = this.points;
      writeInt(recordKey(this.vehicle), this.record);
    }
    if (this.distance > this.recordDist) {
      this.recordDist = Math.floor(this.distance);
      writeInt(distKey(this.vehicle), this.recordDist);
    }
    writeInt(WALLET_KEY, this.wallet);
    writeInt(TOTAL_KEY, this.total);
  }

  private snapshotRecords(): void {
    this.runStartRecord = this.record;
    this.runStartRecordDist = this.recordDist;
  }

  reset(): void {
    this.snapshotRecords();
    this.distance = 0;
    this.distTier = 1;
    this.pointsF = 0;
    this.platanos = 0;
    this.combo = 0;
    this.comboTimer = 0;
    this.contraVia = false;
    this.wheelieOn = false;
    this.gasOn = false;
    this.brakeOn = false;
    this.airAccum = 0;
    this.airT = 0;
    this.wheelieAccum = 0;
    this.trickHold = 0;
    this.cleanM = 0;
    this.rewardsThisRun = 0;
    this.nearMisses = 0;
    this.razorMisses = 0;
    this.cvNearMisses = 0;
    this.bestCombo = 0;
    this.cvMeters = 0;
    this.gasSec = 0;
    this.trickSec = 0;
    this.bestTrickHold = 0;
    this.airs = 0;
    this.bestCleanM = 0;
  }
}
