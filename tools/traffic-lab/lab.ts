// Traffic lab: headless measurements of pacing, fairness and rewards against
// the REAL Traffic class. Numbers here are relative measures for before/after
// comparisons (the bots are weaker than a good human), not absolute truths.
//
//   npx vite-node tools/traffic-lab/lab.ts                 # every section
//   npx vite-node tools/traffic-lab/lab.ts -- parked bot   # a subset
//
// Sections: parked, bot, opening, platanos, convoy, rebase, walls, brake,
// cafecito, policia, pacing.

/* eslint-disable @typescript-eslint/no-explicit-any */
import { seed, ev, makeTraffic, blankCtx, CONFIG, ROAD, VEHICLES, type VehicleId } from './env';
import { tramoFor } from '../../src/tour';

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
  ev.nearMiss = () => {};
  ev.platano = () => {};
  ev.powerup = () => {};
  ev.hoyo = () => {};
  ev.policia = () => {};
  ev.charco = () => {};
  ev.rebase = () => {};
  ev.hornBehind = () => {};
  ev.setPiece = () => {};
  ev.escalate = () => {};
}

// NOOPEN=1 skips the seeded opening (to compare parked spots on equal terms)
const NOOPEN = process.env.NOOPEN === '1';
function startRun(s: number): void {
  seed(s);
  T.reset();
  if (typeof A.setTramo === 'function') A.setTramo('malecon');
  if (typeof A.startRun === 'function' && !NOOPEN) A.startRun();
}

// The main.ts speed model at a fixed throttle.
function rideSpeed(ride: VehicleId, el: number): number {
  const veh = VEHICLES[ride];
  return Math.min(veh.speedCap, CONFIG.baseSpeed + CONFIG.speedRampPerSec * el) * veh.speedMult;
}

function fill(eff: number, el: number, x: number, r: number, dist: number): void {
  ctx.ds = eff * H;
  ctx.dt = H;
  ctx.elapsed = el;
  ctx.speed = eff;
  ctx.playerX = x;
  ctx.playerR = r;
  ctx.playerCv = x > CONFIG.contraViaMinX && x < ROAD.halfRoad;
  ctx.runDist = dist;
  if (typeof A.setTramo === 'function') A.setTramo(tramoFor(dist));
}

// ---------------------------------------------------------------------------
// Parked riders: survival and hands-off near-miss income per position
// ---------------------------------------------------------------------------
if (want('parked')) {
  resetEvents();
  log('\n=== parked, hands off (30 seeded runs each, 120 s cap) ===');
  const spots: Array<[string, number]> = [
    ['own lane 0 center', -5.1], ['own lane 1 center', -1.7], ['own dashed line (START_X)', -3.4],
    ['center seam', 0], ['CV lane 2 center', 1.7], ['CV dashed line', 3.4], ['right shoulder', -7.6],
  ];
  for (const [label, x] of spots) {
    const ts: number[] = [];
    let nm = 0;
    let secs = 0;
    const combos: number[] = [];
    for (let s = 1; s <= 30; s++) {
      startRun(15000 + s);
      let el = 0;
      let dist = 0;
      let lastNm = -99;
      let combo = 0;
      let best = 0;
      ev.nearMiss = () => {
        nm++;
        combo = el - lastNm <= CONFIG.comboDecaySec ? combo + 1 : 1;
        lastNm = el;
        best = Math.max(best, combo);
      };
      ev.hoyo = () => { combo = 0; };
      while (el < 120) {
        el += H;
        const eff = rideSpeed('motor', el);
        dist += eff * H;
        fill(eff, el, x, 0.5, dist);
        T.step(ctx);
        if (T.checkCollision(x, 0, 0.5)) break;
      }
      ts.push(el);
      secs += el;
      combos.push(best);
    }
    log(`  ${label.padEnd(27)} x=${String(x).padEnd(5)} survival median ${f1(med(ts))} s p90 ${f1(pct(ts, 0.9))} s  near-miss/min ${f1(nm / (secs / 60))}  best combo median ${med(combos)} max ${Math.max(...combos)}`);
  }
  resetEvents();
}

// ---------------------------------------------------------------------------
// Bot: a planning rider (sim.ts decision model) against the real traffic
// ---------------------------------------------------------------------------
interface Policy { name: string; decideEvery: number; horizon: number; noise: number }
type Throttle = 'cruise' | 'gas' | 'brake';

interface BotResult { t: number; dist: number; platanos: number; nearMiss: number; firstReward: number; crashed: boolean }

function runBot(p: Policy, th: Throttle, ride: VehicleId, s: number, cap: number): BotResult {
  const veh = VEHICLES[ride];
  const r = CONFIG.playerRadius * veh.hitbox;
  const edgeMax = ROAD.edgeX - CONFIG.playerHalfWidth * veh.hitbox;
  const latMax = CONFIG.lateralMaxSpeed * veh.latMaxMult;
  startRun(s);
  const res: BotResult = { t: 0, dist: 0, platanos: 0, nearMiss: 0, firstReward: -1, crashed: false };
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
  let imanT = 0;
  let shield = false;
  let invT = 0;
  let graceT = 0;
  let cafMult = 1;
  let throttleMult = 1;
  let target = x;
  let decideT = 0;
  let eff = CONFIG.baseSpeed;
  const reward = (): void => {
    if (res.firstReward < 0) res.firstReward = el;
  };
  ev.nearMiss = () => { res.nearMiss++; reward(); };
  ev.platano = () => { res.platanos++; reward(); };
  ev.powerup = (k) => {
    reward();
    if (k === 'cafecito') cafT = CONFIG.cafecitoSec;
    else if (k === 'bendicion') shield = true;
    else imanT = CONFIG.imanSec;
  };
  ev.hoyo = () => { hoyoT = CONFIG.hoyoRecoverSec; };
  ev.policia = () => {
    if (airborne) return;
    airborne = true;
    airVy = Math.max(3.2, eff * CONFIG.policiaLaunchVy);
    if (typeof A.spawnJumpArc === 'function') A.spawnJumpArc(x, eff, airVy);
  };
  ev.charco = () => { charcoT = CONFIG.charcoSec; };

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
      if (t > p.horizon) continue;
      const hw = v.halfW * 0.9 + r + 0.35;
      const lo = Math.min(x, cx);
      const hi = Math.max(x, cx);
      const reach = Math.abs(cx - x) / (latMax * 0.85) + 0.12;
      if (Math.abs(cx - v.x) < hw) d += 100 / (t + 0.08);
      else if (t < reach && v.x + hw > lo && v.x - hw < hi) d += 60 / (t + 0.08);
    }
    return d;
  };

  const thTarget = th === 'gas' ? CONFIG.gasSpeedMult : th === 'brake' ? CONFIG.brakeSpeedMult : 1;
  const graceSec = (CONFIG as any).cafecitoGraceSec ?? 0;
  while (el < cap) {
    el += H;
    decideT -= H;
    if (decideT <= 0) {
      decideT = p.decideEvery;
      let best = x;
      let bestCost = Infinity;
      for (let cx = -edgeMax + 0.1; cx <= edgeMax - 0.1; cx += 0.2) {
        let c = danger(cx);
        c += cx > -0.4 ? 8 : 0; // stays on its own side
        let dl = 9;
        for (const lc of ROAD.laneCenters) dl = Math.min(dl, Math.abs(cx - lc));
        c += dl * 0.8;
        c += Math.abs(cx - x) * 0.25;
        for (const q of A.pickups) {
          if (!q.active || q.z < 0 || q.z > 45) continue;
          if (Math.abs(q.x - cx) < 0.8) c -= q.kind === 'platano' ? 2.5 : 4;
        }
        if (c < bestCost) {
          bestCost = c;
          best = cx;
        }
      }
      target = best + (p.noise ? (Math.random() - 0.5) * 2 * p.noise : 0);
    }
    const speed = rideSpeed(ride, el);
    // mirrors main.ts: gas is capped by the sacred gasMaxMps ceiling, and the
    // brake bites faster than the gas rises
    const ceiling = Math.max(speed, CONFIG.gasMaxMps) / speed;
    const tgt = Math.min(cafT > 0 ? Math.max(thTarget, 1) : thTarget, ceiling); // the cafecito overrides the brake
    const rate = tgt < throttleMult ? CONFIG.brakeResponse : CONFIG.gasResponse;
    throttleMult += (tgt - throttleMult) * Math.min(1, rate * H);
    if (scrapeT > 0) scrapeT = Math.max(0, scrapeT - H);
    if (hoyoT > 0) hoyoT = Math.max(0, hoyoT - H);
    if (invT > 0) invT = Math.max(0, invT - H);
    // mirrors main.ts: grace second after the cafecito, eased boost
    if (cafT > 0) {
      cafT = Math.max(0, cafT - H);
      if (cafT === 0) graceT = graceSec;
    }
    if (graceT > 0) graceT = Math.max(0, graceT - H);
    const easeSec = (CONFIG as any).cafecitoEaseSec;
    if (easeSec) cafMult += ((cafT > 0 ? CONFIG.cafecitoBoost : 1) - cafMult) * Math.min(1, (3 / easeSec) * H);
    else cafMult = cafT > 0 ? CONFIG.cafecitoBoost : 1;
    if (imanT > 0) imanT = Math.max(0, imanT - H);
    const slow = Math.max(
      scrapeT > 0 ? CONFIG.scrapeSpeedLoss * (scrapeT / CONFIG.scrapeSlowSec) : 0,
      hoyoT > 0 ? CONFIG.potholeSpeedLoss * (hoyoT / CONFIG.hoyoRecoverSec) : 0,
    );
    const cafCap = Math.min(easeSec ? cafMult : cafT > 0 ? CONFIG.cafecitoBoost : 1, ceiling);
    eff = speed * (1 - slow) * (throttleMult + Math.max(0, cafCap - Math.max(throttleMult, 1)));
    res.dist += eff * H;
    fill(eff, el, x, r, res.dist);
    ctx.playerY = airY;
    ctx.airborne = airborne;
    ctx.wheelie = false;
    ctx.magnet = imanT > 0;
    ctx.shielded = shield;
    ctx.cafecito = cafT > 0;
    T.step(ctx);

    let authority = 1;
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
      }
      velX = 0;
    }
    if (airborne) {
      airY += airVy * H;
      airVy -= CONFIG.jumpGravity * H;
      if (airY <= 0) {
        airY = 0;
        airborne = false;
      }
    }
    if (T.checkCollision(x, 0, r)) {
      if (cafT > 0 || graceT > 0 || invT > 0) {
        // plow
      } else if (shield) {
        shield = false;
        invT = CONFIG.shieldGraceSec;
      } else {
        res.crashed = true;
        break;
      }
    }
  }
  res.t = el;
  if (res.firstReward < 0) res.firstReward = el;
  resetEvents();
  return res;
}

if (want('bot')) {
  const N = Number(process.env.N ?? 24);
  const CAP = Number(process.env.CAP ?? 240);
  log(`\n=== bot, motor, own side, seeks plátanos (N=${N}, cap ${CAP} s) ===`);
  const policies: Policy[] = [
    { name: 'human-ish', decideEvery: 0.22, horizon: 1.6, noise: 0.5 },
    { name: 'skilled', decideEvery: 0.05, horizon: 2.6, noise: 0 },
  ];
  for (const p of policies) {
    for (const th of ['cruise', 'gas', 'brake'] as const) {
      const rs: BotResult[] = [];
      for (let i = 0; i < N; i++) rs.push(runBot(p, th, 'motor', 31 * i + 7, CAP));
      const ts = rs.map((q) => q.t);
      log(
        `  ${p.name.padEnd(10)} ${th.padEnd(6)} survival p10 ${f1(pct(ts, 0.1))} median ${f1(med(ts))} p90 ${f1(pct(ts, 0.9))} s  ` +
          `dist median ${Math.round(med(rs.map((q) => q.dist)))} m  under20s ${ts.filter((t) => t < 20).length}/${N}  ` +
          `plátanos/run ${f1(mean(rs.map((q) => q.platanos)))}  near-miss/min ${f1(mean(rs.map((q) => (q.nearMiss / q.t) * 60)))}  ` +
          `first reward median ${f1(med(rs.map((q) => q.firstReward)))} s`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Opening: what reaches a rider parked at START_X, and when
// ---------------------------------------------------------------------------
if (want('opening')) {
  resetEvents();
  const N = 100;
  const own: number[] = [];
  const own2: number[] = [];
  const own3: number[] = [];
  const onc: number[] = [];
  const plat: number[] = [];
  const pu: number[] = [];
  const puKind: Record<string, number> = {};
  const ownIn15: number[] = [];
  for (let s = 1; s <= N; s++) {
    startRun(6100 + s);
    let el = 0;
    let dist = 0;
    const ownTimes: number[] = [];
    let fo = -1, fp = -1, fpu = -1;
    const seen = new Set<unknown>();
    // power-ups ignore height, so the parked rider takes them: count that too
    ev.powerup = (k) => {
      if (fpu >= 0) return;
      fpu = el;
      puKind[k] = (puKind[k] ?? 0) + 1;
    };
    while (el < 40) {
      el += H;
      const eff = rideSpeed('motor', el);
      dist += eff * H;
      fill(eff, el, START_X, 0.5, dist);
      ctx.playerY = -50; // nothing gets collected: this times arrivals only
      T.step(ctx);
      for (const v of A.vehicles) {
        if (!v.active || seen.has(v) || v.z > 0) continue;
        seen.add(v);
        if (v.type === 'cart' || v.type === 'guaguaParada') continue;
        if (v.dir === 1) ownTimes.push(el);
        else if (fo < 0) fo = el;
      }
      for (const q of A.pickups) {
        if (!q.active || q.z > 0.5) continue;
        if (q.kind === 'platano' && fp < 0) fp = el;
        if (q.kind !== 'platano' && fpu < 0) {
          fpu = el;
          puKind[q.kind] = (puKind[q.kind] ?? 0) + 1;
        }
      }
    }
    own.push(ownTimes[0] ?? 40);
    own2.push(ownTimes[1] ?? 40);
    own3.push(ownTimes[2] ?? 40);
    ownIn15.push(ownTimes.filter((t) => t < 15).length);
    onc.push(fo < 0 ? 40 : fo);
    plat.push(fp < 0 ? 40 : fp);
    pu.push(fpu < 0 ? 40 : fpu);
  }
  log(`\n=== opening (rider parked at START_X, ${N} seeded runs) ===`);
  log(`  own-side arrivals: 1st median ${f1(med(own))} s (max ${f1(Math.max(...own))}), 2nd ${f1(med(own2))} s, 3rd ${f1(med(own3))} s; own-side passes in first 15 s mean ${f1(mean(ownIn15))}`);
  log(`  first oncoming arrival median ${f1(med(onc))} s (min ${f1(Math.min(...onc))})`);
  log(`  first plátano at the rider line median ${f1(med(plat))} s (max ${f1(Math.max(...plat))})`);
  log(`  first power-up at the rider line median ${f1(med(pu))} s; kinds ${JSON.stringify(puKind)}`);
}

// ---------------------------------------------------------------------------
// Plátano placement vs danger (the audit's exp4 metric)
// ---------------------------------------------------------------------------
if (want('platanos')) {
  resetEvents();
  const RUNS = 12;
  const SECS = 240;
  const cross = { free: 0, risky: 0, blocked: 0, cv: 0, total: 0 };
  // tag every plátano with the code path that laid it
  const bySrc: Record<string, { free: number; risky: number; blocked: number }> = {};
  let src = 'other';
  const tagged = new Map<unknown, string>();
  const saved: Array<[string, unknown, boolean]> = [];
  const wrap = (name: string): void => {
    const orig = A[name];
    if (typeof orig !== 'function') return;
    saved.push([name, orig, Object.prototype.hasOwnProperty.call(A, name)]);
    A[name] = (...a: any[]) => {
      const outer = src === 'other';
      if (outer) src = name;
      try {
        return orig.apply(A, a);
      } finally {
        if (outer) src = 'other';
      }
    };
  };
  for (const n of ['layLine', 'layRiver', 'seedOpening', 'spawnJumpArc', 'fireTrail', 'firePolicia', 'runPattern', 'layLaneLine']) wrap(n);
  const origPick = A.spawnPickup;
  A.spawnPickup = (...a: any[]) => {
    const ok = origPick.apply(A, a);
    if (ok && a[0] === 'platano') {
      for (const q of A.pickups) if (q.active && q.kind === 'platano' && q.x === a[1] && q.z === a[2]) tagged.set(q, src === 'other' ? 'camion/other' : src);
    }
    return ok;
  };
  for (let s = 1; s <= RUNS; s++) {
    startRun(700 + s);
    let el = 0;
    let dist = 0;
    const prevZ = new Map<unknown, number>();
    while (el < SECS) {
      el += H;
      const eff = rideSpeed('motor', el);
      dist += eff * H;
      fill(eff, el, START_X, 0.5, dist);
      ctx.playerY = -50;
      T.step(ctx);
      for (const q of A.pickups) {
        if (!q.active || q.kind !== 'platano') {
          prevZ.delete(q);
          continue;
        }
        const pz = prevZ.get(q);
        prevZ.set(q, q.z);
        if (pz !== undefined && pz > 0 && q.z <= 0) {
          cross.total++;
          if (q.x > 0.25) cross.cv++;
          let cls: 'free' | 'risky' | 'blocked' = 'free';
          for (const v of A.vehicles) {
            if (!v.active) continue;
            const hw = v.halfW * 0.9 + 0.5;
            const hl = v.halfL * 0.9 + 0.5;
            if (Math.abs(q.x - v.x) < hw && Math.abs(v.z - q.z) < hl) {
              cls = 'blocked';
              break;
            }
            if (Math.abs(q.x - v.x) < 2.2 && Math.abs(v.z - q.z) < 8) cls = 'risky';
          }
          cross[cls]++;
          const tag = tagged.get(q) ?? '?';
          (bySrc[tag] ??= { free: 0, risky: 0, blocked: 0 })[cls]++;
        }
      }
    }
  }
  const p = (n: number): string => `${((n / cross.total) * 100).toFixed(1)}%`;
  log(`\n=== plátano crossings at the rider line (${RUNS} x ${SECS} s) ===`);
  log(`  total ${cross.total} (${f1(cross.total / RUNS)} per run): free ${p(cross.free)}, risky ${p(cross.risky)}, blocked ${p(cross.blocked)}, in CV lanes ${p(cross.cv)}`);
  for (const [k, c] of Object.entries(bySrc)) log(`    ${k.padEnd(14)} free ${c.free} risky ${c.risky} blocked ${c.blocked}`);
  log(`  pickup pool misses ${A.stats?.pickupPoolMisses ?? '-'}`);
  A.spawnPickup = origPick;
  for (const [n, orig, own] of saved) {
    if (own) A[n] = orig;
    else delete A[n];
  }
}

// ---------------------------------------------------------------------------
// Convoys: planned vs spawned
// ---------------------------------------------------------------------------
if (want('convoy')) {
  resetEvents();
  const sizes: Record<number, number> = {};
  let n = 0;
  let ge3 = 0;
  const orig = A.spawnVehicle.bind(A);
  let calls: any[] = [];
  A.spawnVehicle = (...a: any[]) => {
    const r = orig(...a);
    calls.push([...a, r]);
    return r;
  };
  for (let s = 0; s < 3000 && n < 1000; s++) {
    seed(5000 + s);
    T.reset();
    A.elapsed = 70;
    A.lastSpeed = 30;
    A.lastPlayerSpeed = 30;
    calls = [];
    const forced = A.runPattern.length > 0;
    if (forced) A.runPattern('convoy');
    else A.runPattern();
    if (calls.length === 0) continue;
    const same = calls.every((k) => k[1] === calls[0][1] && k[3] === 1) && !calls.some((k) => k[0] === 'guaguaParada');
    if (!same) continue;
    const ok = calls.filter((k) => k[k.length - 1]).length;
    sizes[ok] = (sizes[ok] ?? 0) + 1;
    n++;
    if (ok >= 3) ge3++;
  }
  A.spawnVehicle = orig;
  log(`\n=== convoys (${n} seeded) === spawned-size histogram ${JSON.stringify(sizes)}; >= 3 cars in ${((ge3 / n) * 100).toFixed(1)}%`);
}

// ---------------------------------------------------------------------------
// El rebase: arrival time of the swinging car when the swing starts
// ---------------------------------------------------------------------------
if (want('rebase')) {
  resetEvents();
  log('\n=== el rebase: arrival time at swing start (10 seeded 200 s runs, swings after 60 s) ===');
  for (const [label, mult, ride, gx] of [
    ['motor cruise, own side', 1, 'motor', -1.7],
    ['motor a fondo, own side', CONFIG.gasSpeedMult, 'motor', -1.7],
    ['civic a fondo, CV', CONFIG.gasSpeedMult, 'civic', 1.7],
  ] as const) {
    const arr: number[] = [];
    let horns = 0;
    for (let s = 1; s <= 10; s++) {
      startRun(4000 + s);
      let el = 0;
      let dist = 0;
      ev.rebase = () => { horns++; };
      while (el < 200) {
        el += H;
        const eff = rideSpeed(ride, el) * mult;
        dist += eff * H;
        const before = new Set(A.vehicles.filter((v: any) => v.active && v.overtakeT >= 0));
        fill(eff, el, gx, 0.5, dist);
        T.step(ctx);
        if (el < 60) continue;
        for (const v of A.vehicles) {
          if (!v.active || v.overtakeT < 0 || v.overtakeT > H * 1.5 || before.has(v)) continue;
          arr.push(v.z / (eff - v.dir * v.speed));
        }
      }
    }
    const under = arr.filter((t) => t < CONFIG.telegraphMinSec).length;
    log(`  ${label.padEnd(24)} swings ${arr.length}  min ${arr.length ? Math.min(...arr).toFixed(2) : '-'} s  median ${f1(med(arr))} s  under ${CONFIG.telegraphMinSec} s: ${under} (${((under / Math.max(1, arr.length)) * 100).toFixed(0)}%)  horn events ${horns}`);
  }
  resetEvents();
}

// ---------------------------------------------------------------------------
// Unavoidable walls: omniscient forward lateral reachability
// ---------------------------------------------------------------------------
function wallScan(label: string, ghostX: number, mult: number, ride: VehicleId, runs: number, secs: number): void {
  const BIN = 0.025;
  const veh = VEHICLES[ride];
  const r = CONFIG.playerRadius * veh.hitbox;
  const edge = ROAD.edgeX - CONFIG.playerHalfWidth * veh.hitbox;
  const nb = Math.floor((2 * edge) / BIN) + 1;
  const latMax = CONFIG.lateralMaxSpeed * veh.latMaxMult;
  const dil = Math.max(1, Math.floor((latMax * H) / BIN));
  let reach = new Uint8Array(nb);
  let next = new Uint8Array(nb);
  const free = new Uint8Array(nb);
  let walls = 0;
  let overlapTicks = 0;
  const times: number[] = [];
  let rejections = 0;
  let attempts = 0;
  const origCorr = A.widestCorridor.bind(A);
  A.widestCorridor = (...a: any[]) => {
    const w = origCorr(...a);
    attempts++;
    if (w < CONFIG.minCorridorMult * 2 * A.lastPlayerR) rejections++;
    return w;
  };
  for (let s = 1; s <= runs; s++) {
    startRun(9000 + s * 13 + Math.round(ghostX * 7) + Math.round(mult * 100));
    let el = 0;
    let dist = 0;
    reach.fill(1);
    while (el < secs) {
      el += H;
      const eff = rideSpeed(ride, el) * mult;
      dist += eff * H;
      fill(eff, el, ghostX, r, dist);
      T.step(ctx);
      if (T.overlapCount > 0) overlapTicks++;
      free.fill(1);
      for (const v of A.vehicles) {
        if (!v.active) continue;
        const hw = v.halfW * 0.9;
        const hl = v.halfL * 0.9;
        const az = Math.abs(v.z);
        if (az >= hl + r) continue;
        const ext = az <= hl ? hw + r : hw + Math.sqrt(r * r - (az - hl) * (az - hl));
        const lo = Math.max(0, Math.ceil((v.x - ext + edge) / BIN));
        const hi = Math.min(nb - 1, Math.floor((v.x + ext + edge) / BIN));
        for (let b = lo; b <= hi; b++) free[b] = 0;
      }
      let any = 0;
      for (let b = 0; b < nb; b++) {
        let ok = 0;
        const lo = Math.max(0, b - dil);
        const hi = Math.min(nb - 1, b + dil);
        for (let k = lo; k <= hi; k++) if (reach[k]) { ok = 1; break; }
        next[b] = ok & free[b];
        any |= next[b];
      }
      if (!any) {
        walls++;
        times.push(+el.toFixed(1));
        for (let b = 0; b < nb; b++) next[b] = free[b];
      }
      const tmp = reach;
      reach = next;
      next = tmp;
    }
  }
  A.widestCorridor = origCorr;
  log(`  ${label.padEnd(30)} walls ${walls} over ${runs} x ${secs} s ${times.slice(0, 8).join(',')}  ghosting ticks ${overlapTicks}  corridor rejections ${rejections}/${attempts}`);
}

if (want('walls')) {
  resetEvents();
  const R = Number(process.env.RUNS ?? 6);
  log('\n=== unavoidable walls (omniscient lateral reachability) ===');
  wallScan('motor own side, cruise', -3.4, 1, 'motor', R, 240);
  wallScan('motor own side, a fondo', -3.4, CONFIG.gasSpeedMult, 'motor', R, 240);
  wallScan('motor seam, cruise', 0, 1, 'motor', R, 240);
  wallScan('motor CV, a fondo', 3.4, CONFIG.gasSpeedMult, 'motor', R, 240);
  wallScan('civic CV, a fondo', 3.4, CONFIG.gasSpeedMult, 'civic', R, 240);
  wallScan('pasola own side, brake', -3.4, CONFIG.brakeSpeedMult, 'pasola', Math.max(2, R - 2), 240);
}

// ---------------------------------------------------------------------------
// feel[3] brake probe: a car 4 m behind the rider, rider holds the brake
// ---------------------------------------------------------------------------
if (want('brake')) {
  resetEvents();
  let crashes = 0;
  let spawned = 0;
  let horns = 0;
  for (let s = 1; s <= 40; s++) {
    startRun(3300 + s);
    let el = 0;
    let dist = 0;
    let tm = 1;
    ev.hornBehind = () => { horns++; };
    let crashed = false;
    while (el < 6.5) {
      el += H;
      if (Math.abs(el - 0.5) < H / 2) {
        if (T.debugSpawnVehicle(s % 2 ? 'sedan' : 'motoconcho', 1, -4, 1, START_X)) spawned++;
      }
      if (el >= 0.5) tm += (CONFIG.brakeSpeedMult - tm) * Math.min(1, CONFIG.brakeResponse * H);
      const eff = rideSpeed('motor', el) * tm;
      dist += eff * H;
      fill(eff, el, START_X, 0.5, dist);
      T.step(ctx);
      if (T.checkCollision(START_X, 0, 0.5)) {
        crashed = true;
        break;
      }
    }
    if (crashed) crashes++;
  }
  log(`\n=== brake probe (feel[3]): car 4 m behind at 0.5 s, brake held ===  crashes ${crashes}/40 (spawned ${spawned}), horn-behind events ${horns}`);
  resetEvents();
}

// ---------------------------------------------------------------------------
// Cafecito expiry while plowing straight down a lane
// ---------------------------------------------------------------------------
if (want('cafecito')) {
  resetEvents();
  let inside = 0;
  let crashOnExpiry = 0;
  const N = 400;
  const graceSec = (CONFIG as any).cafecitoGraceSec ?? 0;
  for (let s = 1; s <= N; s++) {
    startRun(8100 + s);
    const x = s % 2 ? ROAD.laneCenters[0] : ROAD.laneCenters[1];
    let el = 0;
    let dist = 0;
    let cafT = 0;
    let invT = 0;
    let tm = 1;
    while (el < 66) {
      el += H;
      if (Math.abs(el - 60) < H / 2) cafT = CONFIG.cafecitoSec;
      let expired = false;
      if (invT > 0) invT = Math.max(0, invT - H);
      if (cafT > 0) {
        cafT = Math.max(0, cafT - H);
        if (cafT === 0) {
          expired = true;
          invT = graceSec;
        }
      }
      tm += ((cafT > 0 ? CONFIG.cafecitoBoost : 1) - tm) * Math.min(1, (3 / CONFIG.cafecitoEaseSec) * H);
      const eff = rideSpeed('motor', el) * (graceSec > 0 ? tm : cafT > 0 ? CONFIG.cafecitoBoost : 1);
      dist += eff * H;
      fill(eff, el, x, 0.5, dist);
      ctx.cafecito = cafT > 0;
      T.step(ctx);
      if (expired) {
        const hit = T.checkCollision(x, 0, 0.5);
        if (hit) inside++;
        if (hit && invT <= 0) crashOnExpiry++;
        break;
      }
    }
  }
  log(`\n=== cafecito expiry, plowing lane centers (${N} runs) ===  inside a car at expiry ${inside} (${((inside / N) * 100).toFixed(1)}%), crash on the expiry tick ${crashOnExpiry}`);
  resetEvents();
}

// ---------------------------------------------------------------------------
// Policía plátano arc: how many of the arc does a centered rider collect?
// ---------------------------------------------------------------------------
if (want('policia')) {
  resetEvents();
  log('\n=== policía arcs, rider at the bump x, 200 runs per speed ===');
  const hasJumpArc = typeof A.spawnJumpArc === 'function';
  for (const speed of [20, 30, 42, 54.6]) {
    const got: number[] = [];
    const planned: number[] = [];
    for (let s = 1; s <= 200; s++) {
      seed(8800 + s);
      T.reset();
      A.nextPatternAt = 1e9;
      A.vehiclePauseUntil = 1e9;
      A.elapsed = 100;
      A.lastSpeed = speed;
      A.lastPlayerSpeed = speed;
      const z = 60;
      const x = 0;
      A.spawnObstacle('policia', x, z);
      let arcN = 0;
      if (!hasJumpArc) {
        // the old pre-placed arc, forced on (it rolled 45% in the game)
        for (let i = -2; i <= 2; i++) {
          const y = Math.max(0.55, 1.35 - i * i * 0.18);
          if (A.spawnPickup('platano', x + (Math.random() * 2 - 1), z + i * 2.1, y)) arcN++;
        }
      }
      let count = 0;
      let airY = 0;
      let airVy = 0;
      let air = false;
      ev.platano = () => { count++; };
      ev.policia = () => {
        if (air) return;
        air = true;
        airVy = Math.max(3.2, speed * CONFIG.policiaLaunchVy);
        if (hasJumpArc) arcN += A.spawnJumpArc(x, speed, airVy);
      };
      let el = 100;
      for (let i = 0; i < 120 * 5; i++) {
        el += H;
        fill(speed, el, x, 0.5, 0);
        ctx.playerY = airY;
        ctx.airborne = air;
        A.nextPatternAt = 1e9;
        A.nextOvertakeAt = 1e9;
        A.nextHoyoAt = 1e9;
        A.nextPoliciaAt = 1e9;
        A.nextCharcoAt = 1e9;
        A.nextCartAt = 1e9;
        A.nextPowerupAt = 1e9;
        A.vehiclePauseUntil = 1e9;
        T.step(ctx);
        if (air) {
          airY += airVy * H;
          airVy -= CONFIG.jumpGravity * H;
          if (airY <= 0) { airY = 0; air = false; }
        }
      }
      got.push(count);
      planned.push(arcN);
    }
    log(`  ${String(speed).padEnd(5)} m/s: collected avg ${mean(got).toFixed(2)} of ${mean(planned).toFixed(2)}, all of them in ${got.filter((g, i) => g >= planned[i] && g > 0).length}/200`);
  }
  resetEvents();
}

// ---------------------------------------------------------------------------
// Pacing: arrivals at the rider line per 30 s and active cars, 4-minute runs
// ---------------------------------------------------------------------------
if (want('pacing')) {
  resetEvents();
  const RUNS = 12;
  const B = 8;
  const own = new Array(B).fill(0);
  const onc = new Array(B).fill(0);
  const active = new Array(B).fill(0);
  const ticks = new Array(B).fill(0);
  const pieces: Record<string, number> = {};
  ev.setPiece = (k) => { pieces[k] = (pieces[k] ?? 0) + 1; };
  for (let s = 1; s <= RUNS; s++) {
    startRun(7700 + s);
    let el = 0;
    let dist = 0;
    const seen = new Set<unknown>();
    while (el < 240) {
      el += H;
      const eff = rideSpeed('motor', el);
      dist += eff * H;
      fill(eff, el, START_X, 0.5, dist); // out of reach below the road: counts arrivals, never collects
      ctx.playerY = -50;
      T.step(ctx);
      const b = Math.min(B - 1, Math.floor(el / 30));
      active[b] += A.activeCount;
      ticks[b]++;
      for (const v of A.vehicles) {
        if (!v.active || seen.has(v) || v.z > 0) continue;
        seen.add(v);
        if (v.type === 'cart' || v.type === 'guaguaParada') continue;
        if (v.dir === 1) own[b]++;
        else onc[b]++;
      }
      for (const v of A.vehicles) if (!v.active) seen.delete(v);
    }
  }
  log(`\n=== pacing (${RUNS} x 240 s, motor cruise) ===`);
  log('  bucket     own/30s  onc/30s  avg active');
  for (let b = 0; b < B; b++) {
    log(`  ${String(b * 30).padStart(3)}-${String(b * 30 + 30).padEnd(4)}  ${f1(own[b] / RUNS).padStart(7)}  ${f1(onc[b] / RUNS).padStart(7)}  ${f1(active[b] / ticks[b]).padStart(8)}`);
  }
  log(`  set pieces per run: ${JSON.stringify(Object.fromEntries(Object.entries(pieces).map(([k, v]) => [k, +(v / RUNS).toFixed(2)])))}`);
  resetEvents();
}
