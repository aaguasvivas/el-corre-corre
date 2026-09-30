// Feel probes for the loop, the crash, the resume countdown, el freno
// caliente, the micro time-dips, key repeat and the Bendición save. Starts a
// Vite dev server, opens the game in headless Chrome with rAF frozen and
// Math.random seeded (the same boot as tools/shots.mjs), drives everything
// through window.__ecc and synthetic DOM events, and prints one PASS or FAIL
// line per check plus the numbers behind it. Time windows (the restart
// guard) are timed inside the page, never with runner sleeps.
//
//   sh tools/heavy.sh node tools/feel-probe.mjs            # every probe
//   sh tools/heavy.sh node tools/feel-probe.mjs crash dip  # a subset
//
// Probes: crash, judder, countdown, brake, dip, keys, shield, motion.
// Exit code 1 when any check fails.

import { createServer } from 'vite';
import puppeteer from 'puppeteer-core';
import { realpathSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CHROME =
  process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const VIEWPORT = { width: 375, height: 667, deviceScaleFactor: 1, isMobile: true, hasTouch: true };

function bootScript(seed) {
  let a = seed >>> 0;
  window.Math.random = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  window.requestAnimationFrame = () => 0;
  window.cancelAnimationFrame = () => {};
  const Real = window.AudioContext;
  window.AudioContext = class extends Real {
    constructor(...args) {
      super(...args);
      void super.suspend();
    }
    resume() {
      return Promise.resolve();
    }
  };
  try {
    localStorage.clear();
  } catch {
    // fine
  }
  // Page-side helpers shared by every probe.
  window.__p = {
    fire(el, type, x, y, id = 5, extra = {}) {
      el.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true, cancelable: true, composed: true, pointerId: id, pointerType: 'touch',
          isPrimary: id === 5, clientX: x, clientY: y, buttons: type === 'pointerup' ? 0 : 1, ...extra,
        }),
      );
    },
    center(sel) {
      const r = document.querySelector(sel).getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    },
    key(type, code, repeat = false) {
      window.dispatchEvent(new KeyboardEvent(type, { code, repeat, bubbles: true, cancelable: true }));
    },
    wait: (ms) => new Promise((r) => setTimeout(r, ms)),
  };
}

// Every probe runs in a fresh page and returns { checks: [[name, ok, detail]], info }.
const PROBES = {
  // Crash to a tappable OTRA VEZ, the impact frame, the slow-mo and the
  // killer look, then the restart guard timed inside the page.
  crash: async (page) =>
    page.evaluate(async () => {
      const e = window.__ecc;
      const P = window.__p;
      const checks = [];
      e.start();
      e.god(false);
      e.tick(2);
      e.clearTraffic();
      e.spawnVehicle('sedan', 1, 7, 1, e.x() + 1.2);
      let guard = 0;
      while (e.state() === 'playing' && guard++ < 300) e.tick(1 / 60);
      checks.push(['a car crash happens', e.state() === 'crashing', `state ${e.state()}`]);
      const killer = e.killer();
      checks.push(['the crash knows what hit you', killer !== null, JSON.stringify(killer)]);
      checks.push(['the crash shakes hard', e.trauma() >= 0.5, `trauma ${e.trauma()}`]);
      const flash = document.getElementById('flash');
      checks.push(['the impact flashes white', flash.classList.contains('go'), flash.className]);
      // impact frame: the sim holds still for crashImpactSec of real time
      const s0 = e.simT();
      const perFrame = [];
      let frames = 0;
      while (e.state() === 'crashing' && frames < 120) {
        const a = e.simT();
        e.tick(1 / 60);
        frames++;
        perFrame.push(+((e.simT() - a) * 60).toFixed(3));
      }
      const held = perFrame.findIndex((f) => f > 0);
      checks.push([
        'impact frame holds the world about 70 ms',
        held >= 4 && held <= 5,
        `frozen frames ${held} (${Math.round((held * 1000) / 60)} ms), then sim/real ${perFrame[held]}`,
      ]);
      checks.push([
        'the world crawls at crashTimeScale after it',
        perFrame.slice(held, -1).every((f) => Math.abs(f - 0.2) < 0.01),
        `sim advanced ${(e.simT() - s0).toFixed(3)} s in ${frames} frames`,
      ]);
      const toCard = frames / 60;
      checks.push(['the card lands at about crashSlowmoSec', e.state() === 'gameover' && toCard <= 0.43, `card at ${toCard.toFixed(3)} s`]);
      // restart guard: a tap in the card's own frame is swallowed, one 85 ms later restarts
      const go = document.getElementById('gameover');
      const c = P.center('#gameover');
      P.fire(go, 'pointerdown', c.x, c.y, 11);
      P.fire(window, 'pointerup', c.x, c.y, 11);
      const swallowed = e.state() === 'gameover';
      await P.wait(85);
      P.fire(go, 'pointerdown', c.x, c.y, 12);
      P.fire(window, 'pointerup', c.x, c.y, 12);
      const restarted = e.state() === 'playing';
      checks.push(['a tap in the card frame is swallowed', swallowed, '']);
      checks.push([
        'OTRA VEZ is live by 0.5 s after the impact',
        restarted && toCard + 0.08 <= 0.5 + 1e-6,
        `crash to tappable ${(toCard + 0.08).toFixed(3)} s (card ${toCard.toFixed(3)} + guard 0.080)`,
      ]);
      return { checks };
    }),

  // Frame displacement with jittered frame times: every frame must advance
  // the sim by exactly its real dt (no fixed-step beat).
  judder: async (page) =>
    page.evaluate(() => {
      const e = window.__ecc;
      const checks = [];
      e.start();
      e.god(true);
      e.tick(3);
      let seed = 99;
      const rnd = () => {
        seed = (seed * 16807) % 2147483647;
        return seed / 2147483647;
      };
      const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-9)) * Math.cos(2 * Math.PI * rnd());
      const out = {};
      for (const hz of [60, 120]) {
        for (const jitterMs of [0.05, 0.5]) {
          const ratios = [];
          for (let i = 0; i < 240; i++) {
            const dt = Math.max(0.001, 1 / hz + (gauss() * jitterMs) / 1000);
            const a = e.simT();
            e.tick(dt);
            ratios.push((e.simT() - a) / dt);
          }
          const mean = ratios.reduce((s, r) => s + r, 0) / ratios.length;
          const sd = Math.sqrt(ratios.reduce((s, r) => s + (r - mean) ** 2, 0) / ratios.length);
          const odd = ratios.filter((r) => Math.abs(r - 1) > 1e-6).length;
          out[`${hz}Hz ${jitterMs}ms`] = { sd: +sd.toExponential(2), odd };
        }
      }
      const worst = Object.values(out).reduce((m, v) => Math.max(m, v.odd), 0);
      checks.push(['no frame advances more or less than its real dt', worst === 0, JSON.stringify(out)]);
      return { checks };
    }),

  // SEGUIR and the visibility auto-pause both come back through 3, 2, 1,
  // ¡DALE! with the world frozen; the steering finger pre-aims; a pedal
  // finger needs a fresh press; P and Escape pause and resume.
  countdown: async (page) =>
    page.evaluate(() => {
      const e = window.__ecc;
      const P = window.__p;
      const checks = [];
      e.start();
      e.god(true);
      e.tick(3);
      // a thumb holding the gas through the pause
      const gas = P.center('#pedal-gas');
      const pedals = document.getElementById('pedals') ?? document.querySelector('#pedal-gas').parentElement;
      P.fire(pedals, 'pointerdown', gas.x, gas.y, 21);
      e.tick(0.2);
      const gasBefore = e.throttle();
      P.key('keydown', 'KeyP');
      P.key('keyup', 'KeyP');
      checks.push(['P pauses', e.state() === 'paused', e.state()]);
      P.key('keydown', 'KeyP');
      P.key('keyup', 'KeyP');
      const cd = document.getElementById('countdown');
      checks.push(['P resumes into the countdown', e.state() === 'countdown' && cd.textContent === '3', `${e.state()} "${cd.textContent}"`]);
      const t0 = e.simT();
      const x0 = e.x();
      // a steering finger lands and aims right while the world is frozen
      const cx = window.innerWidth / 2;
      const cy = window.innerHeight * 0.55;
      P.fire(document.getElementById('game') ?? document.body, 'pointerdown', cx, cy, 5);
      P.fire(window, 'pointermove', cx - 120, cy, 5);
      const beats = [cd.textContent];
      for (let i = 0; i < 28; i++) {
        e.tick(0.05);
        P.fire(window, 'pointermove', cx - 120, cy, 5);
        if (beats[beats.length - 1] !== cd.textContent) beats.push(cd.textContent);
      }
      checks.push(['the world stays frozen through the count', e.simT() === t0 && e.x() === x0, `sim moved ${(e.simT() - t0).toFixed(4)} s, x moved ${(e.x() - x0).toFixed(3)} m`]);
      checks.push(['the pedal finger held through the pause does nothing', e.throttle() === 0, `throttle before ${gasBefore}, now ${e.throttle()}`]);
      e.tick(0.2);
      if (beats[beats.length - 1] !== cd.textContent) beats.push(cd.textContent);
      checks.push(['3, 2, 1, ¡DALE! in resumeCountdownSec', e.state() === 'playing' && beats.join(',') === '3,2,1,¡DALE!', `${e.state()} beats ${beats.join(',')}`]);
      e.tick(0.5);
      checks.push(['the pre-aimed steer moves the ride after GO', Math.abs(e.x() - x0) > 0.3, `x ${x0.toFixed(2)} -> ${e.x().toFixed(2)}`]);
      P.fire(window, 'pointerup', cx - 120, cy, 5);
      P.fire(window, 'pointerup', gas.x, gas.y, 21);
      // the visibility auto-pause comes back through the same count
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
      document.dispatchEvent(new Event('visibilitychange'));
      checks.push(['backgrounding pauses', e.state() === 'paused', e.state()]);
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
      document.dispatchEvent(new Event('visibilitychange'));
      e.resume();
      checks.push(['SEGUIR after backgrounding counts down too', e.state() === 'countdown', e.state()]);
      P.key('keydown', 'Escape');
      P.key('keyup', 'Escape');
      checks.push(['Escape pauses the countdown', e.state() === 'paused', e.state()]);
      return { checks };
    }),

  // el freno caliente: a long hold cooks the pads at about brakeHeatMaxSec,
  // the brake fades, FRENO says so, and taps never get there.
  brake: async (page) =>
    page.evaluate(() => {
      const e = window.__ecc;
      const P = window.__p;
      const checks = [];
      e.start();
      e.god(true);
      e.tick(4);
      const pedals = document.querySelector('#pedal-brake').parentElement;
      const b = P.center('#pedal-brake');
      const btn = document.getElementById('pedal-brake');
      const label = btn.querySelector('.pedal-label');
      const cruise = e.effSpeed();
      const rows = [];
      P.fire(pedals, 'pointerdown', b.x, b.y, 31);
      let hotAt = -1;
      let deadAt = -1;
      let hotLabel = '';
      let hotClass = false;
      let minEff = Infinity;
      for (let t = 0; t < 4.5; t += 0.05) {
        e.tick(0.05);
        const h = e.brakeHeat();
        const g = e.gas();
        minEff = Math.min(minEff, e.effSpeed());
        if (hotAt < 0 && h.hot) {
          hotAt = t + 0.05;
          hotLabel = label.textContent;
          hotClass = btn.classList.contains('hot');
        }
        if (deadAt < 0 && h.hot && h.auth === 0) deadAt = t + 0.05;
        if (Math.round((t + 0.05) * 20) % 5 === 0) rows.push(`${(t + 0.05).toFixed(2)}s heat ${h.heat} auth ${h.auth} v ${e.effSpeed()} x0.5 ${g.brakeOn ? 'on' : 'off'}`);
      }
      const endHot = e.brakeHeat();
      const endBrakeOn = e.gas().brakeOn;
      const endEff = e.effSpeed();
      P.fire(window, 'pointerup', b.x, b.y, 31);
      let coolAt = -1;
      for (let t = 0; t < 5 && coolAt < 0; t += 0.05) {
        e.tick(0.05);
        if (!e.brakeHeat().hot) coolAt = t + 0.05;
      }
      checks.push(['a full hold bites first', minEff < cruise * 0.85, `cruise ${cruise} m/s, low ${minEff.toFixed(2)} m/s`]);
      checks.push(['the pads cook at about brakeHeatMaxSec', hotAt > 1.85 && hotAt < 2.2, `hot at ${hotAt.toFixed(2)} s`]);
      checks.push(['the brake fades to nothing in about 0.25 s', deadAt > 0 && deadAt - hotAt <= 0.3, `dead ${(deadAt - hotAt).toFixed(2)} s after`]);
      checks.push(['FRENO says ¡CALIENTE! while cooked', hotLabel === '¡CALIENTE!' && hotClass, `label "${hotLabel}", hot class ${hotClass}`]);
      checks.push(['a dead brake stops charging x0.5 and the ride runs at cruise', !endBrakeOn && endEff > cruise * 0.97, `x0.5 ${endBrakeOn}, v ${endEff} (held, heat ${endHot.heat})`]);
      checks.push(['letting go cools the pads to biting again', coolAt > 0 && coolAt < 2.5, `cool after ${coolAt.toFixed(2)} s`]);
      // taps: 0.3 s down, 0.5 s up, 12 times
      e.tick(3);
      let tapHot = false;
      let tapLow = Infinity;
      for (let i = 0; i < 12; i++) {
        P.fire(pedals, 'pointerdown', b.x, b.y, 40 + i);
        for (let k = 0; k < 6; k++) {
          e.tick(0.05);
          tapLow = Math.min(tapLow, e.effSpeed());
          tapHot ||= e.brakeHeat().hot;
        }
        P.fire(window, 'pointerup', b.x, b.y, 40 + i);
        e.tick(0.5);
      }
      checks.push(['taps never cook the pads, and they still bite', !tapHot && tapLow < e.effSpeed() * 0.95, `hot ${tapHot}, low ${tapLow.toFixed(2)} m/s`]);
      // a 1.5 s hold from cold works all the way
      e.tick(4);
      P.fire(pedals, 'pointerdown', b.x, b.y, 60);
      let holdMinAuth = 1;
      for (let k = 0; k < 30; k++) {
        e.tick(0.05);
        holdMinAuth = Math.min(holdMinAuth, e.brakeHeat().auth);
      }
      P.fire(window, 'pointerup', b.x, b.y, 60);
      checks.push(['a 1.5 s hold brakes fully', holdMinAuth === 1 && !e.brakeHeat().hot, `min authority ${holdMinAuth}`]);
      return { checks, info: rows };
    }),

  // Micro time-dips: never in the first 15 s, the sim slows to dipScale for
  // dipHoldMs and eases back over dipReturnMs, never closer than dipMinGapMs.
  dip: async (page) =>
    page.evaluate(() => {
      const e = window.__ecc;
      const checks = [];
      e.start();
      e.god(true);
      e.tick(2);
      e.triggerDip();
      checks.push(['no dip in the first 15 s', !e.dip().active, JSON.stringify(e.dip())]);
      e.tick(14);
      e.triggerDip();
      const rates = [];
      let frames = 0;
      while (e.dip().active && frames < 60) {
        const a = e.simT();
        e.tick(1 / 60);
        frames++;
        rates.push(+((e.simT() - a) * 60).toFixed(2));
      }
      const ms = Math.round((frames * 1000) / 60);
      checks.push(['a dip holds at dipScale then eases back', rates[0] === 0.3 && rates[2] === 0.3 && rates[rates.length - 1] > 0.9, rates.join(' ')]);
      // hold 45 + return 110 ms, to the frame: the last frame reads back 1
      checks.push(['a dip lasts dipHoldMs + dipReturnMs', ms >= 150 && ms <= 190, `${ms} ms`]);
      e.triggerDip();
      checks.push(['no second dip inside dipMinGapMs', !e.dip().active, '']);
      e.tick(0.3);
      e.triggerDip();
      checks.push(['a dip after the gap fires', e.dip().active, '']);
      return { checks };
    }),

  // Key auto-repeat never restarts, starts or arms a trick; a held arrow
  // never spins through the rides.
  keys: async (page) =>
    page.evaluate(async () => {
      const e = window.__ecc;
      const P = window.__p;
      const checks = [];
      const v0 = e.vehicle();
      P.key('keydown', 'ArrowRight');
      const v1 = e.vehicle();
      P.key('keydown', 'ArrowRight', true);
      P.key('keydown', 'ArrowRight', true);
      P.key('keyup', 'ArrowRight');
      checks.push(['a held arrow moves one ride', v1 !== v0 && e.vehicle() === v1, `${v0} -> ${v1} -> ${e.vehicle()}`]);
      P.key('keydown', 'ArrowLeft');
      P.key('keyup', 'ArrowLeft');
      P.key('keydown', 'Space', true);
      checks.push(['a repeat Space does not start a run', e.state() === 'title', e.state()]);
      P.key('keyup', 'Space');
      e.start();
      e.tick(1);
      e.crash();
      e.tick(1);
      await P.wait(100);
      checks.push(['on the card', e.state() === 'gameover', e.state()]);
      P.key('keydown', 'Space', true);
      checks.push(['a repeat Space on the card does not restart', e.state() === 'gameover', e.state()]);
      P.key('keydown', 'Space');
      checks.push(['a fresh Space restarts', e.state() === 'playing', e.state()]);
      P.key('keydown', 'Space', true);
      P.key('keydown', 'Space', true);
      e.tick(0.2);
      checks.push(['the held Space does not open the run with a caballito', !e.wheelie(), `wheelie ${e.wheelie()}`]);
      P.key('keyup', 'Space');
      return { checks };
    }),

  // La Bendición in the game: the hit car is shoved aside with a spin, the
  // save pops, and the run goes on (src/__tests__/shove.test.ts covers the
  // second car on the line and the no-teleport slide).
  shield: async (page) =>
    page.evaluate(() => {
      const e = window.__ecc;
      const checks = [];
      e.start();
      e.god(false);
      e.tick(2);
      e.clearTraffic();
      e.spawnPickup('bendicion', e.x(), 6);
      let g = 0;
      while (!e.powerups().shielded && g++ < 120) e.tick(1 / 30);
      checks.push(['the rider picks up la Bendición', e.powerups().shielded, '']);
      e.clearTraffic();
      const x = e.x();
      checks.push(['a slow car sits on the rider’s line', e.spawnVehicle('sedan', 1, 9, 1, x, 6), '']);
      g = 0;
      while (e.powerups().shielded && e.state() === 'playing' && g++ < 240) e.tick(1 / 60);
      checks.push(['the shield takes the hit', !e.powerups().shielded && e.state() === 'playing', e.state()]);
      const pop = [...document.querySelectorAll('#popup-layer *')].some((n) => /BENDICI/.test(n.textContent));
      checks.push(['¡TE SALVÓ LA BENDICIÓN! pops', pop, '']);
      e.tick(0.5);
      checks.push(['the hit car is off the rider’s line', !e.touching(0.3), '']);
      e.tick(2);
      checks.push(['the save never turns into a second crash', e.state() === 'playing', `${e.state()}, x ${e.x().toFixed(2)} (was ${x.toFixed(2)})`]);
      return { checks };
    }),

  // prefers-reduced-motion scales shake, FOV kicks and roll.
  motion: async (page) =>
    page.evaluate(() => {
      const e = window.__ecc;
      return { checks: [['reduced motion is read at boot', e.motion() < 1, `motion scale ${e.motion()}`]] };
    }),
};

async function main() {
  const want = process.argv.slice(2).filter((a) => a !== '--');
  const names = want.length ? want : Object.keys(PROBES);
  for (const n of names) if (!PROBES[n]) throw new Error(`unknown probe ${n}; one of ${Object.keys(PROBES).join(', ')}`);
  const server = await createServer({
    root: ROOT,
    logLevel: 'warn',
    clearScreen: false,
    server: { port: 5198, strictPort: false, hmr: false, fs: { allow: [ROOT, realpathSync(resolve(ROOT, 'node_modules'))] } },
  });
  let browser;
  let failed = 0;
  try {
    await server.listen();
    const url = server.resolvedUrls.local[0];
    browser = await puppeteer.launch({
      executablePath: CHROME,
      headless: true,
      timeout: 300000,
      protocolTimeout: 300000,
      args: ['--enable-gpu', '--ignore-gpu-blocklist', '--mute-audio'],
    });
    const ctx = await browser.createBrowserContext();
    const page = await ctx.newPage();
    const noise = [];
    page.on('console', (m) => {
      if (m.type() === 'error' || m.type() === 'warn') noise.push(`console.${m.type()}: ${m.text()}`);
    });
    page.on('pageerror', (err) => {
      noise.push(`pageerror: ${err.message}`);
      failed++;
    });
    await page.setViewport(VIEWPORT);
    await page.evaluateOnNewDocument(bootScript, 7);
    for (const name of names) {
      await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: name === 'motion' ? 'reduce' : 'no-preference' }]);
      await page.goto(url, { waitUntil: 'load', timeout: 300000 });
      await page.waitForFunction(() => window.__ecc !== undefined, { timeout: 300000 });
      await page.evaluate(() => window.__ecc.tick(1 / 60));
      console.log(`\n[${name}]`);
      try {
        const r = await PROBES[name](page);
        for (const [what, ok, detail] of r.checks) {
          if (!ok) failed++;
          console.log(`  ${ok ? 'PASS' : 'FAIL'} ${what}${detail ? `  (${detail})` : ''}`);
        }
        for (const line of r.info ?? []) console.log(`       ${line}`);
        if (name === 'crash' || name === 'judder') {
          const info = await page.evaluate(() => window.__ecc.info());
          console.log(`       draw calls ${info.calls}, triangles ${info.tris} (${name === 'crash' ? 'on the card' : 'riding'})`);
        }
      } catch (err) {
        failed++;
        console.log(`  FAIL ${name} threw: ${err.message}`);
      }
      for (const line of noise.splice(0)) console.log(`  ${line}`);
    }
    await ctx.close();
  } finally {
    await browser?.close();
    await server.close();
  }
  console.log(failed ? `\n${failed} check(s) failed` : '\nall checks pass');
  return failed ? 1 : 0;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
