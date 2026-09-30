// Audio lab: renders the real AudioEngine (src/audio.ts, served by Vite)
// through OfflineAudioContexts in headless Chrome and checks what the ear
// cannot check headless:
//
//   limiter   the compressor's makeup gain (what CONFIG.masterTrim undoes),
//             and the stacked worst case (near-miss + plátano + horn + bell on
//             a downbeat over the full-intensity dembow) with and without the
//             limiter, over several seeds
//   layers    beat-quantized layer entries, bar-quantized exits with one bar
//             of hysteresis, a flicker that must not exit, the tramo
//             crossfade on the next downbeat
//   tape      the crash tape-stop (steps stretch, low-pass and bus close),
//             the quiet gap, then the idle groove (level and low-pass)
//   duck      musicDuck under a stinger, the combo-break dip, the plátano
//             streak climbing and resetting
//   fuzz      30 s of random public calls and random state: no exception,
//             no NaN, no sample over 1.0
//   sfx       every one-shot rendered alone: peak and audible length
//
//   node tools/audio-lab.mjs                 # every suite
//   node tools/audio-lab.mjs --suites limiter,layers
//
// The engine is built inside the page with window.AudioContext pointed at an
// OfflineAudioContext, and update() is driven at 60 Hz through
// OfflineAudioContext.suspend(). Math.random is seeded. Exit code 1 when a
// check fails.

import { createServer } from 'vite';
import puppeteer from 'puppeteer-core';
import { realpathSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CHROME =
  process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ALL = ['limiter', 'layers', 'tape', 'duck', 'fuzz', 'sfx'];

const argv = process.argv.slice(2);
const si = argv.indexOf('--suites');
const suites = si >= 0 ? argv[si + 1].split(',') : ALL;

// Everything below runs in the page.
async function lab(suites) {
  const { AudioEngine } = await import('/src/audio.ts');
  const { CONFIG } = await import('/src/config.ts');
  window.addEventListener('unhandledrejection', (e) => e.preventDefault());
  const SR = 48000;
  const Q = 128 / SR; // render quantum: suspend() resolution
  const out = { checks: [] };
  const check = (name, ok, detail) => out.checks.push({ name, ok: !!ok, detail });

  const seed = (s) => {
    let a = s >>> 0;
    Math.random = () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  function make(dur, opts = {}) {
    const off = new OfflineAudioContext(2, Math.ceil(dur * SR), SR);
    const Real = window.AudioContext;
    window.AudioContext = function () {
      return off;
    };
    const eng = new AudioEngine();
    eng.unlock();
    window.AudioContext = Real;
    eng.ready = () => true; // an offline context only reads 'running' while it renders
    if (opts.bypass) {
      // the old graph: master straight to the speakers at unity
      eng.master.disconnect();
      eng.master.gain.value = 1;
      eng.master.connect(off.destination);
    }
    if (opts.noMusic) eng.musicFilter.disconnect();
    if (opts.noSfx) eng.sfxBus.disconnect();
    return { off, eng };
  }

  const U = (o) => ({ running: false, speedNorm: 0, combo: 0, contraVia: false, wheelie: false, gas: 0, brake: 0, ...o });

  // 60 Hz update() through suspend(); events fire at their own exact times.
  function drive(off, eng, dur, uFn, events = [], onFrame = null) {
    const slots = new Map();
    const add = (t, kind, fn) => {
      const q = Math.round(t / Q);
      if (q <= 0 || q * Q >= dur - Q) return false;
      if (!slots.has(q)) slots.set(q, { ev: [], frame: false });
      const s = slots.get(q);
      if (kind === 'frame') s.frame = true;
      else s.ev.push(fn);
      return true;
    };
    for (const e of events) if (e.t <= 0) e.fn(eng, 0);
    eng.update(1 / 60, uFn(0));
    for (const e of events) if (e.t > 0) add(e.t, 'ev', e.fn);
    for (let i = 1; i / 60 < dur; i++) add(i / 60, 'frame');
    for (const [q, s] of slots) {
      off.suspend(q * Q).then(() => {
        const t = off.currentTime;
        for (const fn of s.ev) fn(eng, t);
        if (s.frame) {
          eng.update(1 / 60, uFn(t));
          if (onFrame) onFrame(eng, t);
        }
        off.resume();
      });
    }
    return off.startRendering();
  }

  function stats(buf, t0 = 0, t1 = buf.duration) {
    let peak = 0;
    let sum = 0;
    let n = 0;
    let nan = 0;
    let over = 0;
    const a = Math.max(0, Math.floor(t0 * buf.sampleRate));
    const b = Math.min(buf.length, Math.floor(t1 * buf.sampleRate));
    for (let ch = 0; ch < buf.numberOfChannels; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = a; i < b; i++) {
        const v = d[i];
        if (!Number.isFinite(v)) {
          nan++;
          continue;
        }
        const x = Math.abs(v);
        if (x > peak) peak = x;
        if (x > 1) over++;
        sum += v * v;
        n++;
      }
    }
    return { peak: +peak.toFixed(4), rms: +Math.sqrt(sum / Math.max(1, n)).toFixed(4), nan, over };
  }

  const barDur = (60 / CONFIG.audioBpm) * 4;
  const beatDur = 60 / CONFIG.audioBpm;
  const T0 = 0.06; // startRun puts the first step here
  const onGrid = (t, g) => {
    const r = (((t - T0) % g) + g) % g;
    return Math.min(r, g - r) < 0.004;
  };

  // ------------------------------------------------------------------ limiter
  if (suites.includes('limiter')) {
    // Makeup gain: a quiet sine through the same compressor settings.
    const mk = new OfflineAudioContext(1, SR, SR);
    const o = mk.createOscillator();
    o.frequency.value = 440;
    const g = mk.createGain();
    g.gain.value = 0.1;
    const c = mk.createDynamicsCompressor();
    c.threshold.value = CONFIG.limiterThresholdDb;
    c.knee.value = CONFIG.limiterKneeDb;
    c.ratio.value = CONFIG.limiterRatio;
    c.attack.value = CONFIG.limiterAttackSec;
    c.release.value = CONFIG.limiterReleaseSec;
    o.connect(g).connect(c).connect(mk.destination);
    o.start();
    const mb = await mk.startRendering();
    const makeup = stats(mb, 0.5, 1).peak / 0.1;
    out.makeup = +makeup.toFixed(3);
    out.trimShouldBe = +(1 / makeup).toFixed(3);
    check('masterTrim cancels the makeup gain (within 3%)', Math.abs(CONFIG.masterTrim * makeup - 1) < 0.03, `makeup ${makeup.toFixed(3)}, trim ${CONFIG.masterTrim}`);

    const full = U({ running: true, speedNorm: 1, combo: 15, contraVia: true, wheelie: true, gas: 1 });
    const HIT = T0 + barDur * 3; // a downbeat, with every layer and the campo color in
    const stack = (extra) => [
      { t: 0, fn: (e) => { e.startRun(); e.setTramo('campo'); } },
      {
        t: HIT,
        fn: (e) => {
          e.nearMiss(0, 15, true);
          e.platano();
          e.horn(0, 1);
          e.bell();
          if (extra) {
            e.ladder(15);
            e.multUp(4);
            e.recordStinger();
            e.shieldBreak();
            e.farthest();
          }
        },
      },
    ];
    out.stack = [];
    let worst = 0;
    let worstPre = 0;
    for (const s of [1, 2, 3, 4, 5]) {
      seed(s);
      let r = make(8);
      const lim = stats(await drive(r.off, r.eng, 8, () => full, stack(false)), HIT - 0.05, HIT + 1.2);
      seed(s);
      r = make(8, { bypass: true });
      const pre = stats(await drive(r.off, r.eng, 8, () => full, stack(false)), HIT - 0.05, HIT + 1.2);
      seed(s);
      r = make(8);
      const musicOnly = stats(await drive(r.off, r.eng, 8, () => full, stack(false).slice(0, 1)), 4, 8);
      seed(s);
      r = make(8, { bypass: true });
      const musicPre = stats(await drive(r.off, r.eng, 8, () => full, stack(false).slice(0, 1)), 4, 8);
      seed(s);
      r = make(8);
      const extreme = stats(await drive(r.off, r.eng, 8, () => full, stack(true)), HIT - 0.05, HIT + 1.5);
      out.stack.push({ seed: s, limited: lim, preLimiter: pre, musicLimited: musicOnly, musicPre, extremeLimited: extreme });
      worst = Math.max(worst, lim.peak, extreme.peak, musicOnly.peak);
      worstPre = Math.max(worstPre, pre.peak);
    }
    check('stacked worst case peaks <= 1.0 through the limiter (5 seeds, plus an extreme stack)', worst <= 1, `worst limited ${worst}, worst pre-limiter ${worstPre}`);
    check('pre-limiter stack really clips (the case is a real one)', worstPre > 1, `pre ${worstPre}`);
  }

  // ------------------------------------------------------------------- layers
  if (suites.includes('layers')) {
    seed(7);
    const { off, eng } = make(12, { noSfx: true });
    const log = [];
    const spy = (param, tag) => {
      const orig = param.setTargetAtTime.bind(param);
      param.setTargetAtTime = (v, t, tau) => {
        if (off.currentTime > 0.001) log.push({ tag, v: +v.toFixed(3), t: +t.toFixed(4), tau: +tau.toFixed(3), at: +off.currentTime.toFixed(4) });
        return orig(v, t, tau);
      };
    };
    const names = ['hat', 'bass', 'perc', 'gas'];
    eng.dyn.forEach((g, i) => spy(g.gain, names[i]));
    eng.tLayer.forEach((g, i) => spy(g.gain, ['guira', 'lick', 'acc', 'tamb'][i]));
    const W = { comboOn: 1.23, comboOff: 5.37, cvOn: 2.71, cvOff: 3.02, gasOn: 0.8, gasFlickOff: 4.3, gasFlickOn: 4.9, gasOff: 9.0, tramo: 3.3 };
    const uFn = (t) =>
      U({
        running: true,
        speedNorm: 0.5,
        combo: t >= W.comboOn && t < W.comboOff ? 5 : 0,
        contraVia: t >= W.cvOn && t < W.cvOff,
        gas: (t >= W.gasOn && t < W.gasFlickOff) || (t >= W.gasFlickOn && t < W.gasOff) ? 1 : 0,
      });
    const gainTrace = [];
    const buf = await drive(off, eng, 12, uFn, [
      { t: 0, fn: (e) => e.startRun() },
      { t: W.tramo, fn: (e) => e.setTramo('zona') },
    ], (e, t) => {
      if (Math.abs(t * 4 - Math.round(t * 4)) < 0.009) gainTrace.push([+t.toFixed(2), e.layerGains.hat, e.layerGains.bass, e.layerGains.perc, e.layerGains.gas]);
    });
    out.layerLog = log;
    out.gainTrace = gainTrace;
    const entries = (tag) => log.filter((l) => l.tag === tag && l.v > (tag === 'hat' ? 0.3 : 0));
    const exits = (tag) => log.filter((l) => l.tag === tag && l.v <= (tag === 'hat' ? 0.3 : 0));
    for (const [tag, won, woff] of [
      ['hat', W.comboOn, W.comboOff],
      ['bass', W.comboOn, W.comboOff],
      ['perc', W.cvOn, W.cvOff],
    ]) {
      const en = entries(tag);
      const ex = exits(tag);
      check(`${tag}: one entry, on the beat grid, within a beat of the request`, en.length === 1 && onGrid(en[0].t, beatDur) && en[0].t >= won && en[0].t - won <= beatDur + 0.17 && Math.abs(en[0].tau - CONFIG.layerInSec / 3) < 1e-3, JSON.stringify(en));
      check(`${tag}: one exit, on a downbeat, at the end of the bar plus one bar`, ex.length === 1 && onGrid(ex[0].t, barDur) && ex[0].t - woff >= barDur && ex[0].t - woff <= 2 * barDur + beatDur + 0.17 && Math.abs(ex[0].tau - CONFIG.layerOutSec / 3) < 1e-3, JSON.stringify(ex) + ` request ${woff}`);
    }
    const gx = exits('gas');
    check('gas: a 0.6 s flicker off does not take the layer out', !gx.some((l) => l.t > W.gasFlickOff && l.t < W.gasOff), JSON.stringify(gx));
    check('gas: the real release exits on a downbeat after one bar of hysteresis', gx.length === 1 && gx[0].t > W.gasOff && onGrid(gx[0].t, barDur), JSON.stringify(gx));
    const tr = log.filter((l) => ['guira', 'lick', 'acc', 'tamb'].includes(l.tag));
    check('tramo: zona crossfades from the next downbeat over one bar (güira and requinto up, accordion and tambora stay down)', tr.length === 4 && tr.every((l) => onGrid(l.t, barDur) && l.t > W.tramo && l.t - W.tramo <= barDur + 0.17 && Math.abs(l.tau - barDur / 3) < 1e-3) && tr.find((l) => l.tag === 'guira').v > 0 && tr.find((l) => l.tag === 'lick').v > 0 && tr.find((l) => l.tag === 'acc').v === 0, JSON.stringify(tr));
    const st = stats(buf);
    check('layers render: no NaN, no sample over 1.0', st.nan === 0 && st.over === 0, JSON.stringify(st));
  }

  // --------------------------------------------------------------------- tape
  if (suites.includes('tape')) {
    seed(3);
    const { off, eng } = make(7, { noSfx: true });
    const CR = 3.0;
    const steps = [];
    const origStep = eng.scheduleStep.bind(eng);
    eng.scheduleStep = (s, t) => {
      steps.push(+t.toFixed(4));
      return origStep(s, t);
    };
    const trace = [];
    const buf = await drive(
      off,
      eng,
      7,
      (t) => U({ running: t < CR, speedNorm: 0.6, combo: 5 }),
      [
        { t: 0, fn: (e) => e.startRun() },
        { t: CR, fn: (e) => e.stopRun(true) },
      ],
      (e, t) => {
        if (Math.abs(t * 10 - Math.round(t * 10)) < 0.009 && t > 2.7) {
          const m = e.musicState;
          trace.push([+t.toFixed(2), m.mode, m.cutoff, m.level]);
        }
      },
    );
    out.tapeTrace = trace;
    const around = steps.filter((t) => t >= CR - 0.3 && t <= CR + CONFIG.crashSlowmoSec);
    const gaps = around.slice(1).map((t, i) => +(t - around[i]).toFixed(4));
    out.tapeStepGaps = gaps;
    const stepDur = 60 / CONFIG.audioBpm / 4;
    check('tape-stop: steps stretch across the slow-mo (tempo falls with the pitch)', gaps.length >= 3 && gaps[gaps.length - 1] > stepDur * 1.5 && gaps[0] < stepDur * 1.05, JSON.stringify(gaps));
    const at = (tt) => trace.find((r) => Math.abs(r[0] - tt) < 0.051);
    const end = at(CR + CONFIG.crashSlowmoSec + 0.05);
    check('tape-stop: low-pass down near tapeStopHz and the bus silent when the card lands', end && end[2] <= CONFIG.tapeStopHz * 1.3 && end[3] < 0.02, JSON.stringify(end));
    const gapRow = at(CR + CONFIG.crashSlowmoSec + CONFIG.idleMusicDelaySec * 0.5);
    check('a quiet beat between the tape-stop and the idle groove', gapRow && gapRow[1] === 'idle' && gapRow[3] < 0.02, JSON.stringify(gapRow));
    const idleRow = at(CR + CONFIG.crashSlowmoSec + CONFIG.idleMusicDelaySec + 1.2);
    check('idle groove: bus at idleMusicLevel, low-pass at idleMusicHz', idleRow && idleRow[1] === 'idle' && Math.abs(idleRow[3] - CONFIG.musicVolume * CONFIG.idleMusicLevel) < 0.03 && Math.abs(idleRow[2] - CONFIG.idleMusicHz) < 60, JSON.stringify(idleRow));
    const w = (a, b) => stats(buf, a, b).rms;
    out.tapeRms = {
      run: w(2, 3),
      tapestop: w(CR, CR + CONFIG.crashSlowmoSec),
      gap: w(CR + CONFIG.crashSlowmoSec + 0.15, CR + CONFIG.crashSlowmoSec + CONFIG.idleMusicDelaySec),
      idle: w(CR + CONFIG.crashSlowmoSec + CONFIG.idleMusicDelaySec + 0.8, 7),
    };
    check('music never stops dead: the idle groove is audible after the gap', out.tapeRms.idle > out.tapeRms.gap * 1.5, JSON.stringify(out.tapeRms));
    const st = stats(buf);
    check('tape render: no NaN, no sample over 1.0', st.nan === 0 && st.over === 0, JSON.stringify(st));
  }

  // --------------------------------------------------------------------- duck
  if (suites.includes('duck')) {
    seed(5);
    const { off, eng } = make(6, { noSfx: true });
    const rows = [];
    const streak = [];
    await drive(
      off,
      eng,
      6,
      (t) => U({ running: true, speedNorm: 0.5, combo: t < 3.0 ? 4 : 0 }),
      [
        { t: 0, fn: (e) => e.startRun() },
        { t: 1.0, fn: (e) => e.recordStinger() },
        ...[0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6].map((d) => ({ t: 4.0 + d, fn: (e) => { e.platano(); streak.push(e.musicState.streak); } })),
        { t: 5.3, fn: (e) => { e.platano(); streak.push(e.musicState.streak); } },
      ],
      (e, t) => {
        const m = e.musicState;
        rows.push([+t.toFixed(3), m.cutoff, m.level]);
      },
    );
    const near = (tt) => rows.reduce((a, r) => (Math.abs(r[0] - tt) < Math.abs(a[0] - tt) ? r : a));
    const d1 = near(1.15);
    const d2 = near(2.9);
    check('musicDuck: the stinger ducks the bus to musicDuckLevel, then it comes back', Math.abs(d1[2] - CONFIG.musicVolume * CONFIG.musicDuckLevel) < 0.03 && Math.abs(d2[2] - CONFIG.musicVolume) < 0.02, JSON.stringify([d1, d2]));
    const dip = rows.filter((r) => r[0] >= 3.0 && r[0] <= 3.6);
    const minCut = Math.min(...dip.map((r) => r[1]));
    const back = near(3.0 + CONFIG.comboBreakDipSec + 0.1);
    check('combo break: the low-pass dips toward comboBreakDipHz and recovers within about 0.45 s', minCut < CONFIG.comboBreakDipHz * 2 && back[1] > CONFIG.musicRunHz * 0.8, `min ${minCut}, at ${back[0]}: ${back[1]}`);
    out.streak = streak;
    check('plátano string: +1 semitone per pickup inside 0.45 s, reset after a gap', streak.join(',') === '0,1,2,3,4,5,6,0', streak.join(','));
  }

  // --------------------------------------------------------------------- fuzz
  if (suites.includes('fuzz')) {
    seed(99);
    const DUR = 30;
    const { off, eng } = make(DUR);
    const r = Math.random;
    const TR = ['malecon', 'zona', 'campo'];
    let errors = 0;
    const firstErr = [];
    const acts = [
      (e) => e.nearMiss(r() * 2 - 1, Math.floor(r() * 30), r() < 0.3),
      (e) => e.ladder([2, 3, 5, 7, 10, 15][Math.floor(r() * 6)]),
      (e) => e.comboBreak(),
      (e) => e.platano(),
      (e) => e.multUp(1 + Math.floor(r() * 4)),
      (e) => e.tramo(),
      (e) => e.setTramo(TR[Math.floor(r() * 3)]),
      (e) => e.shieldBreak(),
      (e) => e.cafecitoTick(1 + Math.floor(r() * 3)),
      (e) => e.imanEnd(),
      (e) => e.mandao(),
      (e) => e.levelUp(),
      (e) => e.recordStinger(),
      (e) => e.farthest(),
      (e) => e.tapeRiser(r() < 0.5),
      (e) => e.musicDuck(r() * 1500),
      (e) => e.startRun(),
      (e) => e.stopRun(r() < 0.5),
      (e) => e.resumeRun(),
      (e) => e.horn(r() * 2 - 1, 0.9 + r() * 0.2),
      (e) => e.bell(),
      (e) => e.obelisco(),
      (e) => e.turbo(),
      (e) => e.brake(),
      (e) => e.scrape(),
      (e) => e.hoyo(),
      (e) => e.land(),
      (e) => e.launch(),
      (e) => e.splash(),
      (e) => e.click(),
      (e) => e.powerup(r() < 0.5 ? 'cafecito' : 'iman'),
      (e) => e.setMuted(false),
    ];
    const events = [];
    for (let t = 0.05; t < DUR - 0.5; t += 0.05 + r() * 0.4) {
      const n = 1 + Math.floor(r() * 3);
      for (let k = 0; k < n; k++) {
        const a = acts[Math.floor(r() * acts.length)];
        events.push({ t, fn: (e) => { try { a(e); } catch (err) { errors++; if (firstErr.length < 3) firstErr.push(String(err)); } } });
      }
    }
    const st = { combo: 0, cv: false, gas: 0, brake: 0, sp: 0, w: false, run: true };
    const buf = await drive(off, eng, DUR, () => {
      if (r() < 0.05) st.combo = r() < 0.3 ? 0 : st.combo + 1;
      if (r() < 0.02) st.cv = !st.cv;
      if (r() < 0.02) st.gas = r() < 0.5 ? 0 : r();
      if (r() < 0.02) st.brake = r() < 0.7 ? 0 : r();
      if (r() < 0.01) st.run = !st.run;
      st.sp = Math.min(1, st.sp + 0.001);
      return U({ running: st.run, speedNorm: st.sp, combo: st.combo, contraVia: st.cv, wheelie: r() < 0.1, gas: st.gas, brake: st.brake });
    }, events);
    const s = stats(buf);
    out.fuzz = { events: events.length, errors, firstErr, ...s };
    check('fuzz: 30 s of random calls, no exception, no NaN, no sample over 1.0', errors === 0 && s.nan === 0 && s.over === 0, JSON.stringify(out.fuzz));
  }

  // ---------------------------------------------------------------------- sfx
  if (suites.includes('sfx')) {
    const list = [
      ['nearMiss combo 1', (e) => e.nearMiss(0, 1, false)],
      ['nearMiss combo 8', (e) => e.nearMiss(0, 8, false)],
      ['nearMiss combo 13 razor', (e) => e.nearMiss(0, 13, true)],
      ['ladder 3', (e) => e.ladder(3)],
      ['ladder 15', (e) => e.ladder(15)],
      ['comboBreak', (e) => e.comboBreak()],
      ['platano', (e) => e.platano()],
      ['multUp x2', (e) => e.multUp(2)],
      ['multUp x4', (e) => e.multUp(4)],
      ['tramo', (e) => e.tramo()],
      ['shieldBreak', (e) => e.shieldBreak()],
      ['cafecitoTick 3', (e) => e.cafecitoTick(3)],
      ['cafecitoTick 1', (e) => e.cafecitoTick(1)],
      ['imanEnd', (e) => e.imanEnd()],
      ['mandao', (e) => e.mandao()],
      ['levelUp', (e) => e.levelUp()],
      ['recordStinger', (e) => e.recordStinger()],
      ['farthest', (e) => e.farthest()],
      ['obelisco', (e) => e.obelisco()],
      ['bell', (e) => e.bell()],
    ];
    out.sfx = [];
    for (const [name, fn] of list) {
      seed(11);
      const { off, eng } = make(3, { noMusic: true });
      const buf = await drive(off, eng, 3, () => U({}), [{ t: 0.5, fn }]);
      const s = stats(buf, 0.5, 3);
      // audible length: last sample above 1% of the peak
      const d = buf.getChannelData(0);
      let last = 0;
      for (let i = Math.floor(0.5 * SR); i < d.length; i++) if (Math.abs(d[i]) > s.peak * 0.01 + 0.004) last = i;
      out.sfx.push({ name, peak: s.peak, ms: Math.round((last / SR - 0.5) * 1000), nan: s.nan });
    }
    check('every one-shot renders, no NaN, peak under 1.0', out.sfx.every((x) => x.nan === 0 && x.peak > 0.005 && x.peak < 1), JSON.stringify(out.sfx.filter((x) => !(x.nan === 0 && x.peak > 0.005 && x.peak < 1))));
  }
  return out;
}

const server = await createServer({
  root: ROOT,
  appType: 'custom', // no index.html: the lab only needs the modules
  logLevel: 'warn',
  clearScreen: false,
  server: { port: 5231, strictPort: false, hmr: false, fs: { allow: [ROOT, realpathSync(resolve(ROOT, 'node_modules'))] } },
});
let browser;
let failed = false;
try {
  await server.listen();
  const url = server.resolvedUrls.local[0];
  browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--mute-audio'], protocolTimeout: 600000 });
  const page = await browser.newPage();
  page.on('pageerror', (e) => {
    console.log(`pageerror: ${e.message}`);
    failed = true;
  });
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warn') console.log(`console.${m.type()}: ${m.text()}`);
  });
  // Any same-origin document will do; a served module shows as plain text
  // and, unlike Vite's 404 page, carries no Content-Security-Policy.
  await page.goto(`${url}src/tour.ts`, { waitUntil: 'load' });
  const res = await page.evaluate(lab, suites);
  for (const c of res.checks) {
    console.log(`${c.ok ? 'ok  ' : 'FAIL'} ${c.name}${c.ok ? '' : `\n     ${c.detail}`}`);
    if (!c.ok) failed = true;
  }
  delete res.checks;
  if (process.env.AUDIO_LAB_JSON) {
    const { writeFileSync } = await import('node:fs');
    writeFileSync(process.env.AUDIO_LAB_JSON, JSON.stringify(res, null, 1));
    console.log(`details: ${process.env.AUDIO_LAB_JSON}`);
  }
} finally {
  await browser?.close();
  await server.close();
}
process.exit(failed ? 1 : 0);
