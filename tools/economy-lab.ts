// Economy lab: Las Pinturas and Los Mandaos against the REAL Traffic, Score
// and Missions classes, driven by the human-calibrated planning bot of the
// traffic lab (reaction 0.22 s, lookahead 1.6 s, aim noise 0.5 m; the audit
// matched its survival to Adelson's ~2 km average). Numbers are relative
// measures for pricing decisions, not absolute truths: the bot near-misses
// far less than a player who aims.
//
//   sh tools/heavy.sh npx vite-node tools/economy-lab.ts              # every section
//   sh tools/heavy.sh npx vite-node tools/economy-lab.ts -- razor     # a subset
//
// Sections:
//   styles  per-style survival, points, road plátanos and near-misses
//   razor   clearance of every near-miss, per style (sets razorMissM)
//   kinds   share of runs that meet each mandao target, per tier
//           (ALT='comboReach:3,4,5;nearMissRun:4,6' tries other targets)
//   career  fresh saves playing RUNS runs, chasing open mandaos 60% of the
//           time: runs to each motor pintura (road plátanos plus mandao
//           rewards), levels, dailies (PRICES=0,500,... tries a price row)
//
// Env: N (runs per style, default 24), CAREERS (default 12), RUNS (runs per
// career, default 60), PER_DAY (runs per play day, default 4), CAP (s, 240).

/* eslint-disable @typescript-eslint/no-explicit-any */
import { seed, ev, makeTraffic, blankCtx, CONFIG, ROAD, VEHICLES, type VehicleId } from './traffic-lab/env';
import { PINTURAS } from '../src/config';
import { Score, nextPintura } from '../src/score';
import { Missions, type Completion } from '../src/missions';
import { tramoFor } from '../src/tour';

const H = CONFIG.fixedDt;
const START_X = -3.4;
const T = makeTraffic();
const A = T as any;
const ctx = blankCtx() as any;

const args = process.argv.slice(2).filter((a) => a !== '--');
const want = (s: string): boolean => args.length === 0 || args.includes(s);
const log = (...a: unknown[]): void => console.log(...a);
const med = (a: number[]): number => {
  const s = [...a].sort((x, y) => x - y);
  return s.length ? s[Math.floor(s.length / 2)] : NaN;
};
const pct = (a: number[], p: number): number => {
  const s = [...a].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))];
};
const mean = (a: number[]): number => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
const f1 = (n: number): string => (Number.isFinite(n) ? n.toFixed(1) : String(n));

function resetEvents(): void {
  for (const k of Object.keys(ev) as Array<keyof typeof ev>) (ev as any)[k] = () => {};
}

// ---------------------------------------------------------------------------
// The bot
// ---------------------------------------------------------------------------

interface Style {
  name: string;
  cv: boolean; // rides the oncoming lanes
  gas: boolean; // a fondo whenever the road ahead is clear
  trickSec: number; // caballito/derrape hold when the road is clear (0 = never)
  seekNearMiss: boolean; // aims for passes close to cars
}

const STYLES: Style[] = [
  { name: 'calm', cv: false, gas: false, trickSec: 0, seekNearMiss: false },
  { name: 'curious', cv: false, gas: true, trickSec: 2.2, seekNearMiss: false },
  { name: 'contra', cv: true, gas: false, trickSec: 0, seekNearMiss: false },
  { name: 'bold', cv: true, gas: true, trickSec: 2.2, seekNearMiss: true },
];
const HUMAN = { decideEvery: 0.22, horizon: 1.6, noise: 0.5 };

interface RunOut {
  t: number;
  dist: number;
  points: number;
  platanos: number;
  earned: number;
  clearances: number[];
  crashed: boolean;
}

function startTraffic(s: number): void {
  seed(s);
  T.reset();
  A.setTramo('malecon');
  A.startRun();
}

// One run, mirroring main.ts stepSim: speed, pedal, cafecito, traffic, rider,
// score, and the mandao samples (on reward events and every mandaoSampleSec).
function runOnce(st: Style, ride: VehicleId, s: number, cap: number, score: Score, missions: Missions | null): RunOut {
  const veh = VEHICLES[ride];
  const baseR = CONFIG.playerRadius * veh.hitbox;
  const edgeMax = ROAD.edgeX - CONFIG.playerHalfWidth * veh.hitbox;
  const latMax = CONFIG.lateralMaxSpeed * veh.latMaxMult;
  startTraffic(s);
  score.setVehicle(ride);
  if (missions) score.setBarrioMult(missions.barrioMult);
  score.reset();
  missions?.startRun(ride);
  const out: RunOut = { t: 0, dist: 0, points: 0, platanos: 0, earned: 0, clearances: [], crashed: false };
  let el = 0;
  let x = START_X;
  let velX = 0;
  let airY = 0;
  let airVy = 0;
  let airborne = false;
  let hoyoT = 0;
  let scrapeT = 0;
  let scrapeCd = 0;
  let charcoT = 0;
  let cafT = 0;
  let graceT = 0;
  let cafMult = 1;
  let imanT = 0;
  let shield = false;
  let invT = 0;
  let throttleMult = 1;
  let throttle = 0;
  let trickOn = false;
  let trickT = 0;
  let trickCd = 0;
  let target = x;
  let decideT = 0;
  let sampleT = 0;
  let eff = CONFIG.baseSpeed;
  let r = baseR;

  ev.nearMiss = (_x, _z, c) => {
    out.clearances.push(c);
    score.nearMiss(c);
    missions?.sample(score);
  };
  ev.platano = () => {
    score.collectPlatano();
    missions?.sample(score);
  };
  ev.powerup = (k) => {
    if (k === 'cafecito') cafT = CONFIG.cafecitoSec;
    else if (k === 'bendicion') shield = true;
    else imanT = CONFIG.imanSec;
  };
  ev.hoyo = () => {
    hoyoT = CONFIG.hoyoRecoverSec;
    score.hitHoyo();
  };
  ev.policia = () => {
    if (airborne) return;
    airborne = true;
    airVy = Math.max(3.2, eff * CONFIG.policiaLaunchVy);
    A.spawnJumpArc(x, eff, airVy);
    if (trickOn) endTrick();
  };
  ev.charco = () => {
    charcoT = CONFIG.charcoSec;
  };

  function endTrick(): void {
    trickOn = false;
    trickCd = CONFIG.wheelieCooldownBase + trickT * CONFIG.wheelieCooldownPerSec;
    score.endWheelie();
  }

  const danger = (cx: number): number => {
    let d = 0;
    for (const v of A.vehicles) {
      if (!v.active) continue;
      if (v.z < -v.halfL - 1.5) continue;
      const closing = eff - v.dir * v.speed;
      const front = v.z - v.halfL * 0.9 - r;
      let t: number;
      if (front <= 0) t = 0;
      else if (closing <= 0.5) continue;
      else t = front / closing;
      if (t > HUMAN.horizon) continue;
      const hw = v.halfW * 0.9 + r + 0.35;
      const lo = Math.min(x, cx);
      const hi = Math.max(x, cx);
      const reach = Math.abs(cx - x) / (latMax * 0.85) + 0.12;
      if (Math.abs(cx - v.x) < hw) d += 100 / (t + 0.08);
      else if (t < reach && v.x + hw > lo && v.x - hw < hi) d += 60 / (t + 0.08);
    }
    return d;
  };

  while (el < cap) {
    el += H;
    decideT -= H;
    if (decideT <= 0) {
      decideT = HUMAN.decideEvery;
      let best = x;
      let bestCost = Infinity;
      for (let cx = -edgeMax + 0.1; cx <= edgeMax - 0.1; cx += 0.2) {
        let c = danger(cx);
        const inCv = cx > CONFIG.contraViaMinX + 0.3 && cx < ROAD.halfRoad - 0.3;
        if (st.cv) c += inCv ? 0 : 4;
        else c += cx > -0.4 ? 8 : 0;
        let dl = 9;
        for (const lc of ROAD.laneCenters) dl = Math.min(dl, Math.abs(cx - lc));
        c += dl * (st.seekNearMiss ? 0.2 : 0.8);
        c += Math.abs(cx - x) * 0.25;
        for (const q of A.pickups) {
          if (!q.active || q.z < 0 || q.z > 45) continue;
          if (Math.abs(q.x - cx) < 0.8) c -= q.kind === 'platano' ? 2.5 : 4;
        }
        if (st.seekNearMiss) {
          for (const v of A.vehicles) {
            if (!v.active || v.z < 0) continue;
            const closing = eff - v.dir * v.speed;
            if (closing <= 0.5 || v.z / closing > 1.8) continue;
            const clear = Math.abs(cx - v.x) - (v.halfW * CONFIG.vehicleHitboxScale + r);
            if (clear > 0.4 && clear < CONFIG.nearMissRadius - 0.1) c -= 3;
          }
        }
        if (c < bestCost) {
          bestCost = c;
          best = cx;
        }
      }
      target = best + (Math.random() - 0.5) * 2 * HUMAN.noise;
      const here = danger(x);
      throttle = st.gas && here < 40 ? 1 : 0;
    }

    // speed and el pedal, as main.ts
    const speed = Math.min(veh.speedCap, CONFIG.baseSpeed + CONFIG.speedRampPerSec * el) * veh.speedMult;
    const th = cafT > 0 ? Math.max(0, throttle) : throttle;
    const ceiling = Math.max(speed, CONFIG.gasMaxMps) / speed;
    const gasRatio = Math.min(CONFIG.gasSpeedMult, ceiling);
    const thTarget = 1 + th * (gasRatio - 1);
    const rate = thTarget < throttleMult ? CONFIG.brakeResponse : CONFIG.gasResponse;
    throttleMult += (thTarget - throttleMult) * Math.min(1, rate * H);
    if (scrapeT > 0) scrapeT = Math.max(0, scrapeT - H);
    if (hoyoT > 0) hoyoT = Math.max(0, hoyoT - H);
    if (invT > 0) invT = Math.max(0, invT - H);
    if (cafT > 0) {
      cafT = Math.max(0, cafT - H);
      if (cafT === 0) graceT = CONFIG.cafecitoGraceSec;
    }
    if (graceT > 0) graceT = Math.max(0, graceT - H);
    cafMult += ((cafT > 0 ? CONFIG.cafecitoBoost : 1) - cafMult) * Math.min(1, (3 / CONFIG.cafecitoEaseSec) * H);
    if (imanT > 0) imanT = Math.max(0, imanT - H);
    const slow = Math.max(
      scrapeT > 0 ? CONFIG.scrapeSpeedLoss * (scrapeT / CONFIG.scrapeSlowSec) : 0,
      hoyoT > 0 ? CONFIG.potholeSpeedLoss * (hoyoT / CONFIG.hoyoRecoverSec) : 0,
    );
    const cafCap = Math.min(cafMult, ceiling);
    eff = speed * (1 - slow) * (throttleMult + Math.max(0, cafCap - Math.max(throttleMult, 1)));
    const ds = eff * H;

    // the trick: pop it when the road is clear, drop it when it is not
    if (st.trickSec > 0 && !trickOn && trickCd <= 0 && !airborne && danger(x) < 10) {
      trickOn = true;
      trickT = 0;
    }
    if (trickOn) {
      trickT += H;
      if (trickT >= Math.min(st.trickSec, CONFIG.wheelieMaxSec) || danger(x) > 30) endTrick();
    }
    if (trickCd > 0) trickCd -= H;
    r = ride === 'civic' && trickOn ? baseR * CONFIG.driftHitboxMult : baseR;

    const cv = x > CONFIG.contraViaMinX && x < ROAD.halfRoad;
    score.setContraVia(cv);
    score.setWheelie(trickOn);
    const cafe = cafT > 0;
    score.setGas(th >= CONFIG.gasEngageAt && !cafe && throttleMult >= 1 + 0.5 * (gasRatio - 1) - 1e-4);
    score.setBrake(false);

    ctx.ds = ds;
    ctx.dt = H;
    ctx.elapsed = el;
    ctx.speed = eff;
    ctx.playerX = x;
    ctx.playerY = airY;
    ctx.playerR = r;
    ctx.playerCv = cv;
    ctx.live = true;
    ctx.airborne = airborne;
    ctx.wheelie = trickOn && ride !== 'civic';
    ctx.magnet = imanT > 0;
    ctx.runDist = score.distance + ds;
    ctx.shielded = shield;
    ctx.cafecito = cafe;
    A.setTramo(tramoFor(score.distance + ds));
    T.step(ctx);

    // steering: the touch servo, as the lab bot
    let authority = 1;
    if (trickOn) {
      const decay = Math.min(1, trickT / CONFIG.wheelieMaxSec);
      authority *=
        ride === 'civic'
          ? CONFIG.driftSteerFactor
          : CONFIG.wheelieSteerFactorStart + (CONFIG.wheelieSteerFactorEnd - CONFIG.wheelieSteerFactorStart) * decay;
    }
    if (charcoT > 0) {
      authority *= CONFIG.charcoSteerFactor;
      charcoT -= H;
    }
    const desired = Math.max(-latMax, Math.min(latMax, (target - x) * CONFIG.touchServoGain));
    const maxDv = CONFIG.lateralAccel * veh.accelMult * authority * H;
    velX += Math.max(-maxDv, Math.min(maxDv, desired * authority - velX));
    x += velX * H;
    if (scrapeCd > 0) scrapeCd -= H;
    if (Math.abs(x) > edgeMax) {
      x = Math.sign(x) * edgeMax;
      if (Math.abs(velX) > 1.2 && scrapeCd <= 0) {
        scrapeCd = CONFIG.scrapeCooldownSec;
        scrapeT = CONFIG.scrapeSlowSec;
        score.resetCombo();
      }
      velX = 0;
    }
    if (airborne) {
      airY += airVy * H;
      airVy -= CONFIG.jumpGravity * H;
      if (airY <= 0) {
        airY = 0;
        airborne = false;
        score.endAir();
        missions?.sample(score);
      }
    }
    score.step(ds, H, { airborne, wheelie: trickOn });

    if (T.checkCollision(x, 0, r)) {
      if (cafT > 0 || graceT > 0 || invT > 0) {
        // plow
      } else if (shield) {
        shield = false;
        invT = CONFIG.shieldGraceSec;
      } else {
        out.crashed = true;
        break;
      }
    }
    sampleT += H;
    if (sampleT >= CONFIG.mandaoSampleSec) {
      sampleT -= CONFIG.mandaoSampleSec;
      missions?.sample(score);
    }
  }
  missions?.finishRun(score);
  const res = score.finishRun(tramoFor(score.distance));
  out.t = el;
  out.dist = score.distance;
  out.points = res.points;
  out.platanos = res.platanos;
  out.earned = res.platanosEarned;
  resetEvents();
  return out;
}

function freshSave(): void {
  (globalThis as any).localStorage.clear();
}

const N = Number(process.env.N ?? 24);
const CAP = Number(process.env.CAP ?? 240);

// ---------------------------------------------------------------------------
// Styles: what each way of riding earns
// ---------------------------------------------------------------------------
if (want('styles')) {
  log(`\n=== styles, motor, human-ish bot (N=${N}, cap ${CAP} s), pickups only ===`);
  for (const st of STYLES) {
    const rs: RunOut[] = [];
    freshSave();
    const score = new Score();
    for (let i = 0; i < N; i++) rs.push(runOnce(st, 'motor', 31 * i + 7, CAP, score, null));
    const ts = rs.map((q) => q.t);
    log(
      `  ${st.name.padEnd(8)} survival median ${f1(med(ts))} s (p10 ${f1(pct(ts, 0.1))}, p90 ${f1(pct(ts, 0.9))})  ` +
        `dist median ${Math.round(med(rs.map((q) => q.dist)))} m  points median ${Math.round(med(rs.map((q) => q.points)))}  ` +
        `plátanos/run median ${med(rs.map((q) => q.platanos))} mean ${f1(mean(rs.map((q) => q.platanos)))}  ` +
        `near-miss/run ${f1(mean(rs.map((q) => q.clearances.length)))}`,
    );
  }
}

// ---------------------------------------------------------------------------
// Razor: how tight the near-misses are, per style
// ---------------------------------------------------------------------------
if (want('razor')) {
  log(`\n=== razor, clearance at the pass (m), motor, human-ish bot (N=${N}) ===`);
  const cuts = [0.2, 0.3, 0.35, 0.4, 0.45, 0.5, 0.6, 0.8];
  log(`  ${'style'.padEnd(8)} passes  median  ${cuts.map((c) => `<=${c}`.padStart(6)).join(' ')}   razor/run at ${CONFIG.razorMissM}`);
  for (const st of STYLES) {
    const all: number[] = [];
    const perRun: number[] = [];
    freshSave();
    const score = new Score();
    for (let i = 0; i < N; i++) {
      const q = runOnce(st, 'motor', 53 * i + 11, CAP, score, null);
      all.push(...q.clearances);
      perRun.push(q.clearances.filter((c) => c <= CONFIG.razorMissM).length);
    }
    const share = (c: number): string => `${Math.round((all.filter((v) => v <= c).length / Math.max(1, all.length)) * 100)}%`.padStart(6);
    log(`  ${st.name.padEnd(8)} ${String(all.length).padStart(6)}  ${med(all).toFixed(2).padStart(6)}  ${cuts.map(share).join(' ')}   ${f1(mean(perRun))}`);
  }
}

// ---------------------------------------------------------------------------
// Career: fresh saves, a style mix, mandaos on, buying the next pintura
// ---------------------------------------------------------------------------
if (want('career')) {
  const CAREERS = Number(process.env.CAREERS ?? 12);
  const RUNS = Number(process.env.RUNS ?? 60);
  const PER_DAY = Number(process.env.PER_DAY ?? 4);
  // DECISION (lab only): a typical player mixes styles; most runs are calm or
  // curious, a quarter try contra vía, a sixth go all in.
  const MIX: Array<[number, Style]> = [
    [0.35, STYLES[0]],
    [0.3, STYLES[1]],
    [0.2, STYLES[2]],
    [0.15, STYLES[3]],
  ];
  // DECISION (lab only): 60% of runs chase an open mandao with the style it
  // needs (a player reads the list); the rest follow the mix.
  const CHASE: Record<string, string> = {
    cvMetersRun: 'contra', cvNearMissRun: 'bold', nearMissRun: 'bold', razorRun: 'bold', comboReach: 'bold',
    trickSecRun: 'curious', trickHold: 'curious', gasSecRun: 'curious', pointsRun: 'bold', reachTramo: 'curious',
    cleanMeters: 'curious',
  };
  const chase = (m: Missions, u1: number, u2: number): Style | null => {
    if (u1 >= 0.6) return null;
    const v = m.view();
    const open = [...v.set, v.daily].filter((x) => !x.done && CHASE[x.kind]);
    if (!open.length) return null;
    const name = CHASE[open[Math.floor(u2 * open.length)].kind];
    return STYLES.find((st) => st.name === name) ?? null;
  };
  const pick = (u: number): Style => {
    let acc = 0;
    for (const [w, st] of MIX) {
      acc += w;
      if (u < acc) return st;
    }
    return MIX[MIX.length - 1][1];
  };
  log(`\n=== career: ${CAREERS} fresh saves x ${RUNS} runs, ${PER_DAY} runs per day, motor paints bought in order ===`);
  // PRICES=0,300,700,1300,2600 tries a price row without touching config.ts
  const prices = process.env.PRICES ? process.env.PRICES.split(',').map(Number) : PINTURAS.motor.map((p) => p.price);
  log(`  motor prices ${prices.join(' / ')}${process.env.PRICES ? ' (PRICES override)' : ''}`);
  const paintRuns: number[][] = prices.slice(1).map(() => []);
  const levelsAt: Record<number, number[]> = { 1: [], 2: [], 3: [], 4: [], 10: [], 20: [], 40: [], 60: [] };
  const pickupPerRun: number[] = [];
  const mandaoPerRun: number[] = [];
  const mandaoFirst10: number[] = [];
  const dailyDone: number[] = [];
  const rideRuns: number[] = [];
  const cum: number[][] = Array.from({ length: RUNS + 1 }, () => []);
  for (let c = 0; c < CAREERS; c++) {
    freshSave();
    let day = 0;
    const now = (): Date => new Date(2026, 9, 1 + day, 12);
    const score = new Score();
    const missions = new Missions({ now, rng: () => Math.random() });
    let rewards = 0;
    let dailies = 0;
    missions.onComplete = (k: Completion) => {
      score.addToBank(k.reward + k.setBonus);
      rewards += k.reward + k.setBonus;
      if (k.daily) dailies++;
    };
    const owned = new Set<number>([0]);
    let rng = (c + 1) * 7919;
    const u = (): number => {
      rng = (rng * 16807) % 2147483647;
      return rng / 2147483647;
    };
    let early = 0;
    let earnedSoFar = 0;
    for (let run = 1; run <= RUNS; run++) {
      day = Math.floor((run - 1) / PER_DAY);
      // a ride mandao sends the player to that ride, like the list asks
      const v = missions.view();
      const rideGoal = v.set.find((m) => !m.done && (m.kind === 'pasolaMeters' || m.kind === 'civicMeters'));
      const ride: VehicleId = rideGoal ? (rideGoal.kind === 'pasolaMeters' ? 'pasola' : 'civic') : 'motor';
      if (ride !== 'motor') rideRuns.push(run);
      const before = rewards;
      const st = chase(missions, u(), u()) ?? pick(u());
      const q = runOnce(st, ride, 100000 * (c + 1) + run, CAP, score, missions);
      pickupPerRun.push(q.platanos);
      mandaoPerRun.push(rewards - before);
      if (run <= 10) early += rewards - before;
      for (;;) {
        const g = process.env.PRICES ? null : nextPintura('motor', owned, score.bank);
        const idx = g ? g.index : owned.size;
        if (idx >= prices.length || score.bank < prices[idx]) break;
        score.spend(prices[idx]);
        owned.add(idx);
        paintRuns[idx - 1].push(run);
      }
      if (levelsAt[run]) levelsAt[run].push(missions.level);
      earnedSoFar += q.earned;
      cum[run].push(earnedSoFar);
    }
    for (let i = 0; i < paintRuns.length; i++) if (paintRuns[i].length < c + 1) paintRuns[i].push(Infinity);
    mandaoFirst10.push(early);
    dailyDone.push(dailies);
  }
  const show = (a: number[]): string => {
    const fin = a.filter(Number.isFinite);
    return `median ${Number.isFinite(med(a)) ? med(a) : `>${RUNS}`} (p25 ${pct(a, 0.25)}, p75 ${Number.isFinite(pct(a, 0.75)) ? pct(a, 0.75) : `>${RUNS}`}; ${fin.length}/${a.length} got it)`;
  };
  PINTURAS.motor.slice(1).forEach((p, i) => log(`  ${p.name.padEnd(14)} ${String(prices[i + 1]).padStart(5)}  run ${show(paintRuns[i])}`));
  const gaps: number[] = [];
  for (let i = 1; i < paintRuns.length; i++) {
    for (let c = 0; c < CAREERS; c++) {
      if (Number.isFinite(paintRuns[i][c])) gaps.push(paintRuns[i][c] - paintRuns[i - 1][c]);
    }
  }
  log(`  runs between paints: median ${med(gaps)}`);
  log(`  pickups/run median ${med(pickupPerRun)} mean ${f1(mean(pickupPerRun))}; mandao plátanos/run mean ${f1(mean(mandaoPerRun))}; mandao plátanos in runs 1-10 median ${med(mandaoFirst10)}`);
  log(`  plátanos earned by run (median): ${[1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30, 40, 50, 60].filter((r) => r <= RUNS).map((r) => `${r}:${med(cum[r])}`).join('  ')}`);
  log(`  level after run 1 / 2 / 3 / 4 / 10 / 20 / 40 / 60: ${[1, 2, 3, 4, 10, 20, 40, 60].map((r) => (levelsAt[r].length ? med(levelsAt[r]) : '-')).join(' / ')}; dailies done per career median ${med(dailyDone)}; ride-goal runs ${rideRuns.length}`);
}

// ---------------------------------------------------------------------------
// Kinds: how often one run meets each mandao target, for the style that
// would chase it (the best of the four). Sets the pool's targets by tier.
// ---------------------------------------------------------------------------
if (want('kinds')) {
  const K = Number(process.env.N ?? 24);
  type Snap = Record<string, number>;
  const snap = (s: Score, ride: VehicleId): Snap => ({
    platanosRun: s.platanos,
    nearMissRun: s.nearMisses,
    razorRun: s.razorMisses,
    comboReach: s.bestCombo,
    cvMetersRun: s.cvMeters,
    cvNearMissRun: s.cvNearMisses,
    trickSecRun: s.trickSec,
    gasSecRun: s.gasSec,
    airRun: s.airs,
    reachTramo: s.distance,
    pointsRun: s.points,
    cleanMeters: s.bestCleanM,
    pasolaMeters: ride === 'pasola' ? s.distance : 0,
    civicMeters: ride === 'civic' ? s.distance : 0,
    platanosTotal: s.platanos,
    distRun: s.distance,
    trickHold: s.bestTrickHold,
  });
  const byStyle: Record<string, Snap[]> = {};
  for (const st of STYLES) {
    freshSave();
    const score = new Score();
    const snaps: Snap[] = [];
    for (let i = 0; i < K; i++) {
      // ride goals are measured on their ride; everything else on the motor
      const ride: VehicleId = i % 6 === 4 ? 'pasola' : i % 6 === 5 ? 'civic' : 'motor';
      runOnce(st, ride, 71 * i + 5, CAP, score, null);
      snaps.push(snap(score, ride));
    }
    byStyle[st.name] = snaps;
  }
  log(`\n=== kinds: share of runs that meet each target, best style (N=${K} per style; 1 in 6 on La Pasola, 1 in 6 on El Civic) ===`);
  const pool = CONFIG.mandaoPool as Record<string, readonly number[]>;
  const tut = CONFIG.mandaoTutorial.flat() as ReadonlyArray<readonly [string, number]>;
  const row = (kind: string, targets: readonly number[]): void => {
    const cells = targets.map((t) => {
      let best = 0;
      let who = '';
      for (const st of STYLES) {
        const s = byStyle[st.name];
        const n = s.filter((q) => q[kind] >= t).length;
        if (n / s.length > best) {
          best = n / s.length;
          who = st.name;
        }
      }
      return `${String(t).padStart(6)} ${`${Math.round(best * 100)}%`.padStart(4)} ${who.padEnd(7)}`;
    });
    const med1 = (st: string): number => med(byStyle[st].map((q) => q[kind]));
    log(`  ${kind.padEnd(14)} ${cells.join('  ')}   medians calm/curious/contra/bold ${STYLES.map((st) => Math.round(med1(st.name))).join('/')}`);
  };
  log('  tutorial:');
  for (const [k, t] of tut) row(k, [t]);
  log('  pool, tiers 0 / 1 / 2:');
  for (const k of Object.keys(pool)) row(k, pool[k]);
  // ALT='comboReach:3,4,5;nearMissRun:4,6,9' tries other targets
  const alt = process.env.ALT;
  if (alt) {
    log('  alternatives:');
    for (const part of alt.split(';')) {
      const [k, list] = part.split(':');
      row(k, list.split(',').map(Number));
    }
  }
}
