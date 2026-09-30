// missions.ts: Los Mandaos, pure logic (no DOM, no three.js).
//
// Three mandaos are active at a time. Finishing all three levels you up,
// pays a set bonus, and raises the multiplicador del barrio (points only).
// The first two sets are fixed tutorials that teach the verbs; after that
// sets are drawn from a pool whose targets step up by tier. One more goal,
// El Mandao del Día, is seeded from the local date and pays more the more
// days in a row it gets done. Everything lives in localStorage under
// ecc.v1.*, every read is guarded, and a corrupt save is a fresh start.
//
// Progress is read from the run's counters (RunStats, which Score provides)
// instead of being pushed by events, so sampling allocates nothing: main
// calls sample() on reward events and every mandaoSampleSec of sim time.
// Copy lives in ui.ts; this module only says which kind, target and progress.

import { CONFIG, type VehicleId } from './config';

export type PoolKind = keyof typeof CONFIG.mandaoPool;
export type MandaoKind = PoolKind | 'distRun' | 'trickHold';

// What a run has done so far. Score implements it.
export interface RunStats {
  readonly distance: number;
  readonly points: number;
  readonly platanos: number;
  readonly nearMisses: number;
  readonly razorMisses: number;
  readonly cvNearMisses: number;
  readonly bestCombo: number;
  readonly cvMeters: number;
  readonly gasSec: number;
  readonly trickSec: number;
  readonly bestTrickHold: number;
  readonly airs: number;
  readonly bestCleanM: number;
}

interface KindDef {
  // "in one run" belongs in the copy (the goal resets every run)
  perRun: boolean;
  // keeps counting across runs
  lifetime: boolean;
  read(s: RunStats, v: VehicleId): number;
}

// Defined once: sampling calls these, it never builds them.
const KINDS: Record<MandaoKind, KindDef> = {
  platanosRun: { perRun: true, lifetime: false, read: (s) => s.platanos },
  nearMissRun: { perRun: true, lifetime: false, read: (s) => s.nearMisses },
  razorRun: { perRun: true, lifetime: false, read: (s) => s.razorMisses },
  comboReach: { perRun: false, lifetime: false, read: (s) => s.bestCombo },
  cvMetersRun: { perRun: true, lifetime: false, read: (s) => s.cvMeters },
  cvNearMissRun: { perRun: true, lifetime: false, read: (s) => s.cvNearMisses },
  trickSecRun: { perRun: true, lifetime: false, read: (s) => s.trickSec },
  trickHold: { perRun: false, lifetime: false, read: (s) => s.bestTrickHold },
  gasSecRun: { perRun: true, lifetime: false, read: (s) => s.gasSec },
  airRun: { perRun: true, lifetime: false, read: (s) => s.airs },
  distRun: { perRun: false, lifetime: false, read: (s) => s.distance },
  reachTramo: { perRun: false, lifetime: false, read: (s) => s.distance },
  pointsRun: { perRun: true, lifetime: false, read: (s) => s.points },
  cleanMeters: { perRun: false, lifetime: false, read: (s) => s.bestCleanM },
  pasolaMeters: { perRun: true, lifetime: false, read: (s, v) => (v === 'pasola' ? s.distance : 0) },
  civicMeters: { perRun: true, lifetime: false, read: (s, v) => (v === 'civic' ? s.distance : 0) },
  platanosTotal: { perRun: false, lifetime: true, read: (s) => s.platanos },
};

const POOL_KINDS = Object.keys(CONFIG.mandaoPool) as PoolKind[];
const RIDE_KINDS: ReadonlySet<MandaoKind> = new Set<MandaoKind>(['pasolaMeters', 'civicMeters']);
// DECISION: the daily is doable on any ride in one run, so no lifetime goal
// and no ride-specific goal is ever the daily.
const DAILY_KINDS: readonly PoolKind[] = POOL_KINDS.filter(
  (k) => !KINDS[k].lifetime && !RIDE_KINDS.has(k),
);

export const LEVEL_NAME_COUNT = 7; // Novato .. Leyenda del Malecón; names live in ui.ts

export interface Mandao {
  kind: MandaoKind;
  target: number;
  reward: number; // plátanos when done
  tutorial: boolean;
  progress: number; // this run, or the running total for a lifetime kind
  done: boolean;
  justDone: boolean; // it got done during the current or last run (the card stamps these)
  base: number; // lifetime kinds: progress banked before this run
}

export interface Completion {
  mandao: Mandao;
  daily: boolean;
  reward: number; // plátanos for this mandao (daily: with the streak)
  levelUp: boolean; // it finished the set
  setBonus: number; // plátanos on top when levelUp
  level: number; // level after this completion
  streak: number; // daily only: days in a row, this one included
}

export interface MandaosView {
  level: number;
  levelNameIdx: number;
  mult: number; // multiplicador del barrio
  set: readonly Mandao[]; // the active set
  doneCount: number;
  lastSet: readonly Mandao[] | null; // the set finished this run, until the next run starts
  daily: Mandao;
  dailyDay: string;
  streak: number; // days in a row, 0 when the streak is not alive
}

// Whether a kind's copy says "in one run" (the goal restarts every run).
export function mandaoPerRun(kind: MandaoKind): boolean {
  return KINDS[kind].perRun;
}

const KEY_MANDAOS = 'ecc.v1.mandaos';
const KEY_DAILY = 'ecc.v1.daily';
const KEY_STREAK = 'ecc.v1.streak';

// ---------------------------------------------------------------------------
// Dates (local time; injectable clock)
// ---------------------------------------------------------------------------

const pad = (n: number): string => String(n).padStart(2, '0');

export function dayKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// The local day before a YYYY-MM-DD key: month and year rollover come from
// the Date constructor, leap days included.
export function prevDayKey(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  return dayKey(new Date(y, m - 1, d - 1));
}

function hashDay(day: string): number {
  let h = 5381;
  for (let i = 0; i < day.length; i++) h = ((h << 5) + h + day.charCodeAt(i)) >>> 0;
  return h;
}

export function barrioMultFor(level: number): number {
  return Math.min(CONFIG.barrioMultMax, 1 + CONFIG.barrioMultStep * Math.max(0, level));
}

export function streakMultFor(n: number): number {
  return Math.min(CONFIG.streakMax, 1 + CONFIG.streakStep * (Math.max(1, n) - 1));
}

// ---------------------------------------------------------------------------
// Storage (every read guarded; anything malformed reads as missing)
// ---------------------------------------------------------------------------

function readJson(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? null : (JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // private mode: the mandaos still work this session
  }
}

const isObj = (o: unknown): o is Record<string, unknown> => typeof o === 'object' && o !== null;
const isNum = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
const isDay = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);

function makeMandao(kind: MandaoKind, target: number, reward: number, tutorial: boolean): Mandao {
  return { kind, target, reward, tutorial, progress: 0, done: false, justDone: false, base: 0 };
}

function parseMandao(o: unknown): Mandao | null {
  if (!isObj(o)) return null;
  const { k, t, r, p, d, tut } = o;
  if (typeof k !== 'string' || !(k in KINDS)) return null;
  if (!isNum(t) || t <= 0 || !isNum(r) || r < 0) return null;
  const m = makeMandao(k as MandaoKind, t, r, tut === 1);
  m.done = d === 1;
  m.base = isNum(p) && p > 0 ? p : 0;
  m.progress = m.done ? t : m.base;
  return m;
}

// A lifetime kind stores its live progress (never below base), so a save
// taken mid-run (a pause, a completion) keeps what this run added even if
// the app is killed before the run finishes.
function storeMandao(m: Mandao): Record<string, number | string> {
  const o: Record<string, number | string> = { k: m.kind, t: m.target, r: m.reward, d: m.done ? 1 : 0 };
  if (m.tutorial) o.tut = 1;
  if (KINDS[m.kind].lifetime) o.p = m.progress;
  return o;
}

// ---------------------------------------------------------------------------
// Los Mandaos
// ---------------------------------------------------------------------------

export interface MissionsOptions {
  now?: () => Date;
  rng?: () => number;
}

export class Missions {
  level = 0;
  // Fired for each mandao that gets done during sample(); main pays it,
  // toasts it and sounds it. Rare, so it may allocate.
  onComplete: ((c: Completion) => void) | null = null;

  private set: Mandao[] = [];
  private lastSet: Mandao[] | null = null;
  private daily: Mandao = makeMandao('platanosRun', 1, 0, false);
  private dailyDay = '';
  private streakLast = '';
  private streakN = 0;
  private vehicle: VehicleId = 'motor';
  private running = false;
  private setLive = true; // false after a mid-run level up: the new set starts next run
  private readonly now: () => Date;
  private readonly rng: () => number;

  constructor(opts: MissionsOptions = {}) {
    this.now = opts.now ?? (() => new Date());
    this.rng = opts.rng ?? Math.random;
    this.load();
    this.ensureDaily();
  }

  get barrioMult(): number {
    return barrioMultFor(this.level);
  }

  // A run begins: per-run progress restarts, lifetime progress continues,
  // the daily rolls over if the date changed.
  startRun(vehicle: VehicleId): void {
    this.vehicle = vehicle;
    this.ensureDaily();
    this.running = true;
    this.setLive = true;
    this.lastSet = null;
    for (let i = 0; i < this.set.length; i++) this.resetForRun(this.set[i]);
    this.resetForRun(this.daily);
  }

  // Re-read the run's counters. Zero allocations unless something completes.
  sample(s: RunStats): void {
    if (!this.running) return;
    if (this.setLive) {
      for (let i = 0; i < this.set.length; i++) {
        const m = this.set[i];
        if (m.done) continue;
        if (this.advance(m, s)) this.completeSetMandao(m);
        if (!this.setLive) break; // that one finished the set
      }
    }
    const d = this.daily;
    if (!d.done && this.advance(d, s)) this.completeDaily();
  }

  // The run ended: one last read, lifetime progress banked, saved.
  finishRun(s: RunStats): void {
    this.sample(s);
    this.running = false;
    for (let i = 0; i < this.set.length; i++) {
      const m = this.set[i];
      if (KINDS[m.kind].lifetime && !m.done) m.base = m.progress;
    }
    this.save();
  }

  // Defensive save (pause, backgrounding): per-run progress restarts with
  // the next run anyway, lifetime progress so far is kept.
  persist(s: RunStats): void {
    this.sample(s);
    this.save();
  }

  view(): MandaosView {
    if (!this.running) this.ensureDaily();
    let doneCount = 0;
    for (const m of this.set) if (m.done) doneCount++;
    const today = dayKey(this.now());
    const alive = this.streakN > 0 && (this.streakLast === today || this.streakLast === prevDayKey(today));
    return {
      level: this.level,
      levelNameIdx: Math.min(this.level, LEVEL_NAME_COUNT - 1),
      mult: this.barrioMult,
      set: this.set,
      doneCount,
      lastSet: this.lastSet,
      daily: this.daily,
      dailyDay: this.dailyDay,
      streak: alive ? this.streakN : 0,
    };
  }

  // ---------------- internals ----------------

  private resetForRun(m: Mandao): void {
    m.justDone = false;
    if (m.done) {
      m.progress = m.target;
      return;
    }
    m.progress = KINDS[m.kind].lifetime ? m.base : 0;
  }

  // Updates progress; true when the mandao just reached its target.
  private advance(m: Mandao, s: RunStats): boolean {
    const def = KINDS[m.kind];
    const v = def.read(s, this.vehicle);
    const p = def.lifetime ? m.base + v : v;
    m.progress = p < m.target ? p : m.target;
    if (p < m.target) return false;
    m.done = true;
    m.justDone = true;
    return true;
  }

  private completeSetMandao(m: Mandao): void {
    let all = true;
    for (const o of this.set) if (!o.done) all = false;
    let setBonus = 0;
    if (all) {
      setBonus = CONFIG.mandaoSetBonus;
      this.level += 1;
      this.lastSet = this.set;
      this.set = this.drawSet(this.level, this.lastSet);
      this.setLive = false;
    }
    this.save();
    this.onComplete?.({
      mandao: m,
      daily: false,
      reward: m.reward,
      levelUp: all,
      setBonus,
      level: this.level,
      streak: 0,
    });
  }

  private completeDaily(): void {
    const day = this.dailyDay;
    this.streakN = this.streakLast === prevDayKey(day) ? this.streakN + 1 : this.streakLast === day ? this.streakN : 1;
    this.streakLast = day;
    const reward = Math.round(this.daily.reward * streakMultFor(this.streakN));
    this.save();
    this.onComplete?.({
      mandao: this.daily,
      daily: true,
      reward,
      levelUp: false,
      setBonus: 0,
      level: this.level,
      streak: this.streakN,
    });
  }

  private drawSet(level: number, prev: readonly Mandao[] | null): Mandao[] {
    const tut = CONFIG.mandaoTutorial;
    if (level < tut.length) {
      return tut[level].map(([k, t]) => makeMandao(k, t, CONFIG.mandaoTutorialReward, true));
    }
    const tier = Math.min(2, Math.floor((level - tut.length) / CONFIG.mandaoTierEvery));
    // Fisher-Yates over the pool, then take three distinct kinds: fresh ones
    // first (not in the set just finished), and at most one ride-specific.
    const order = POOL_KINDS.slice();
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      const tmp = order[i];
      order[i] = order[j];
      order[j] = tmp;
    }
    const picked: PoolKind[] = [];
    const take = (allowRepeat: boolean): void => {
      for (const k of order) {
        if (picked.length >= 3) return;
        if (picked.includes(k)) continue;
        if (!allowRepeat && prev?.some((m) => m.kind === k)) continue;
        if (RIDE_KINDS.has(k) && picked.some((p) => RIDE_KINDS.has(p))) continue;
        picked.push(k);
      }
    };
    take(false);
    take(true);
    return picked.map((k) => makeMandao(k, CONFIG.mandaoPool[k][tier], CONFIG.mandaoReward[tier], false));
  }

  private ensureDaily(): void {
    const today = dayKey(this.now());
    if (this.dailyDay === today) return;
    this.dailyDay = today;
    const kind = DAILY_KINDS[hashDay(today) % DAILY_KINDS.length];
    this.daily = makeMandao(kind, CONFIG.mandaoPool[kind][1], CONFIG.dailyReward, false);
    this.save();
  }

  private load(): void {
    const m = readJson(KEY_MANDAOS);
    let loaded = false;
    if (isObj(m) && m.v === 1 && isNum(m.level) && m.level >= 0 && Number.isInteger(m.level)) {
      this.level = m.level;
      const list = Array.isArray(m.set) ? m.set.map(parseMandao) : [];
      if (list.length === 3 && list.every((x): x is Mandao => x !== null)) {
        this.set = list;
        loaded = true;
      }
    } else {
      this.level = 0;
    }
    if (!loaded) this.set = this.drawSet(this.level, null);

    const d = readJson(KEY_DAILY);
    if (isObj(d) && isDay(d.day)) {
      const parsed = parseMandao(d);
      if (parsed && (DAILY_KINDS as readonly string[]).includes(parsed.kind)) {
        this.daily = parsed;
        this.dailyDay = d.day;
      }
    }

    const s = readJson(KEY_STREAK);
    if (isObj(s) && isDay(s.last) && isNum(s.n) && s.n >= 1 && Number.isInteger(s.n)) {
      this.streakLast = s.last;
      this.streakN = s.n;
    }
    if (!loaded) this.save();
  }

  private save(): void {
    writeJson(KEY_MANDAOS, { v: 1, level: this.level, set: this.set.map(storeMandao) });
    if (this.dailyDay) writeJson(KEY_DAILY, { day: this.dailyDay, ...storeMandao(this.daily) });
    if (this.streakN > 0) writeJson(KEY_STREAK, { last: this.streakLast, n: this.streakN });
  }
}
