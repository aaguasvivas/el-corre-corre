// Audio probe: the real game (index.html, served by Vite) in headless Chrome
// with a LIVE AudioContext, driven through window.__ecc. Where
// tools/audio-lab.mjs renders the engine offline, this checks the wiring in
// main.ts: which AudioEngine call each game event makes, with what
// arguments, and what the music does across a whole session (title radio,
// run, gas, combo layers, a tramo border, pause, the crash tape-stop, the
// game-over radio, a restart).
//
//   node tools/audio-probe.mjs            # exit code 1 when a check fails
//
// Every AudioEngine method is wrapped on the prototype (the same module
// instance main.ts uses), so calls are logged without touching the game.
// rAF is off, as in tools/shots.mjs: only __ecc.tick moves the sim and the
// audio scheduler, so the probe ticks at real-time pace where music timing
// matters and fast where only the calls matter. Chrome runs with
// --mute-audio.

import { createServer } from 'vite';
import puppeteer from 'puppeteer-core';
import { realpathSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CHROME =
  process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function boot() {
  let a = 7;
  Math.random = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  window.requestAnimationFrame = () => 0;
  window.cancelAnimationFrame = () => {};
  try {
    localStorage.clear();
  } catch {
    // fine
  }
}

// In the page: wrap every public AudioEngine method.
async function spy() {
  const { AudioEngine } = await import('/src/audio.ts');
  const names = [
    'startRun', 'resumeRun', 'stopRun', 'setTramo', 'tapeRiser', 'musicDuck', 'nearMiss', 'ladder',
    'comboBreak', 'platano', 'powerup', 'bell', 'obelisco', 'multUp', 'tramo', 'shieldBreak',
    'cafecitoTick', 'imanEnd', 'mandao', 'levelUp', 'recordStinger', 'farthest', 'horn', 'scrape',
    'hoyo', 'land', 'launch', 'turbo', 'brake', 'splash', 'click',
  ];
  window.__calls = [];
  window.__total = {}; // per method, never cleared
  let riser = null;
  for (const n of names) {
    const orig = AudioEngine.prototype[n];
    AudioEngine.prototype[n] = function (...args) {
      const r = orig.apply(this, args);
      if (n === 'tapeRiser') {
        // called every tick: log the edges only
        if (args[0] === riser) return r;
        riser = args[0];
      }
      window.__total[n] = (window.__total[n] ?? 0) + 1;
      const row = { n, at: +performance.now().toFixed(0), args };
      if (n === 'platano') row.streak = this.musicState.streak;
      window.__calls.push(row);
      return r;
    };
  }
}

const server = await createServer({
  root: ROOT,
  logLevel: 'warn',
  clearScreen: false,
  server: { port: 5243, strictPort: false, hmr: false, fs: { allow: [ROOT, realpathSync(resolve(ROOT, 'node_modules'))] } },
});
let browser;
let failed = false;
const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok });
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : `\n     ${detail}`}`);
  if (!ok) failed = true;
};
try {
  await server.listen();
  const url = server.resolvedUrls.local[0];
  browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    protocolTimeout: 600000,
    args: ['--enable-gpu', '--ignore-gpu-blocklist', '--mute-audio', '--autoplay-policy=no-user-gesture-required'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 375, height: 667, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const noise = [];
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warn') noise.push(`console.${m.type()}: ${m.text()}`);
  });
  page.on('pageerror', (e) => noise.push(`pageerror: ${e.message}`));
  await page.evaluateOnNewDocument(boot);
  await page.goto(url, { waitUntil: 'load', timeout: 300000 });
  await page.waitForFunction(() => window.__ecc !== undefined, { timeout: 300000 });
  await page.evaluate(spy);

  const ecc = (n, ...a) => page.evaluate((nn, aa) => window.__ecc[nn](...aa), n, a);
  const au = () => ecc('audio');
  const calls = (n) => page.evaluate((nn) => window.__calls.filter((c) => c.n === nn), n);
  const total = (n) => page.evaluate((nn) => window.__total[nn] ?? 0, n);
  const clearCalls = () => page.evaluate(() => (window.__calls.length = 0));
  // Real-time pace: one 1/30 s tick, then wait out the rest of it.
  const play = async (sec, until = 'false') => {
    const t0 = Date.now();
    for (let t = 0; t < sec; t += 1 / 30) {
      const done = await page.evaluate((src) => {
        window.__ecc.tick(1 / 30);
        return new Function('e', `return (${src});`)(window.__ecc);
      }, until);
      if (done) return true;
      const wait = t0 + (t + 1 / 30) * 1000 - Date.now();
      if (wait > 0) await sleep(wait);
    }
    return false;
  };
  // Sim-only: as fast as the page can tick.
  const fast = (until, max) =>
    page.evaluate(
      (src, m) => {
        const e = window.__ecc;
        const ok = new Function('e', `return (${src});`);
        for (let t = 0; t < m; t += 1 / 30) {
          if (ok(e)) return true;
          e.tick(1 / 30);
        }
        return ok(e);
      },
      until,
      max,
    );
  const steerTo = async (x) => {
    for (let i = 0; i < 90; i++) {
      const px = await ecc('x');
      if (Math.abs(px - x) < 0.25) break;
      const key = x > px ? 'KeyA' : 'KeyD';
      await page.evaluate((k) => window.dispatchEvent(new KeyboardEvent('keydown', { code: k })), key);
      await play(1 / 30);
      await page.evaluate((k) => window.dispatchEvent(new KeyboardEvent('keyup', { code: k })), key);
    }
  };

  // ---- title: nothing until a gesture, then the colmado radio
  let a = await au();
  check('before any gesture: no AudioContext', a.ctx === 'none' && !a.unlocked, JSON.stringify(a));
  await page.keyboard.press('ArrowRight'); // a trusted gesture on the title (vehicle select)
  await page.keyboard.press('ArrowLeft');
  await play(1.2);
  a = await au();
  check('title after a gesture: running, idle groove through the ~700 Hz radio filter', a.ctx === 'running' && a.music.mode === 'idle' && Math.abs(a.music.cutoff - 700) < 40 && Math.abs(a.music.level - 0.4) < 0.03, JSON.stringify(a));

  // ---- a run: the radio opens up
  await ecc('start');
  await ecc('god', true);
  await play(1.5);
  a = await au();
  check('run: startRun called, filter open to cruise, full level', (await calls('startRun')).length === 1 && a.music.mode === 'run' && a.music.cutoff > 8000 && Math.abs(a.music.level - 0.5) < 0.03, JSON.stringify(a.music));

  // ---- near-miss chain (the nearmiss scene's staging): pitch climbs, ladder stabs
  await clearCalls();
  await ecc('clearTraffic');
  await steerTo(2.3);
  for (let i = 0; i < 6; i++) {
    const lane = i % 2 ? 3 : 2;
    for (let k = 0; k < 20; k++) {
      if (await ecc('spawnVehicle', i === 2 ? 'guagua' : 'sedan', lane, 30 + i * 24, -1, lane === 2 ? 1.7 : 5.1, i === 2 ? 11 : 14)) break;
      await play(0.1);
    }
  }
  const onLine = 'ax < 3.4 ? ax + 0.6 : ax - 0.6';
  const dodgeX = 'ax < 3.4 ? ax + 1.8 : ax - 1.8';
  let chain = false;
  const t0 = Date.now();
  for (let t = 0; t < 8 && !chain; t += 1 / 30) {
    chain = await page.evaluate(
      (onSrc, dodgeSrc) => {
        const e = window.__ecc;
        const ah = e.ahead();
        const x = e.x();
        let target = x;
        if (ah) target = new Function('ax', `return (${ah.t < 0.42 ? dodgeSrc : onSrc});`)(ah.x);
        const want = target > x + 0.08 ? 'KeyA' : target < x - 0.08 ? 'KeyD' : null;
        if (want !== window.__k) {
          if (window.__k) window.dispatchEvent(new KeyboardEvent('keyup', { code: window.__k }));
          if (want) window.dispatchEvent(new KeyboardEvent('keydown', { code: want }));
          window.__k = want;
        }
        e.tick(1 / 30);
        return e.combo() >= 5;
      },
      onLine,
      dodgeX,
    );
    const wait = t0 + (t + 1 / 30) * 1000 - Date.now();
    if (wait > 0) await sleep(wait);
  }
  await page.evaluate(() => {
    if (window.__k) window.dispatchEvent(new KeyboardEvent('keyup', { code: window.__k }));
    window.__k = null;
  });
  const nm = await calls('nearMiss');
  const combos = nm.map((c) => c.args[1]);
  // a chain left over from the ride before may start above 1: the combos
  // must still climb one by one to 5
  const climbs = combos.length >= 3 && combos.every((c, i) => i === 0 || c === combos[i - 1] + 1) && combos[combos.length - 1] === 5;
  check('near-miss: combo reaches 5, nearMiss gets each combo in order and a boolean razor flag', chain && climbs && nm.every((c) => typeof c.args[2] === 'boolean' && Math.abs(c.args[0]) <= 1), JSON.stringify(nm.map((c) => c.args)));
  const lad = (await calls('ladder')).map((c) => c.args[0]);
  const wantLad = [2, 3, 5].filter((k) => combos.includes(k));
  check('ladder stabs on the tiers crossed (2, 3, 5), nowhere else', lad.join(',') === wantLad.join(','), JSON.stringify({ lad, combos }));
  await play(2.5); // entries wait for a beat; give the layers a bar
  a = await au();
  check('combo 5 in contra vía: hats, bass and perc layers up', a.layers.hat > 0.8 && a.layers.bass > 0.85 && a.layers.perc > 0.75, JSON.stringify(a.layers));

  // ---- the chain decays: a falling third, and the layers leave on a bar line
  await steerTo(-3.4); // home lane: perc should leave too
  const broke = await play(6, "e.combo() === 0");
  await play(0.2);
  check('combo decay: comboBreak() fires once', broke && (await calls('comboBreak')).length === 1, JSON.stringify(await calls('comboBreak')));
  await play(6); // up to two bars to the exit downbeat, plus the 1.2 s fade
  a = await au();
  check('after the break: bass and perc out, hats back to their floor', a.layers.bass < 0.05 && a.layers.perc < 0.05 && Math.abs(a.layers.hat - 0.3) < 0.05, JSON.stringify(a.layers));

  // ---- a fondo: the gas layer and the filter all the way open
  await ecc('pedal', 1);
  await play(3);
  a = await au();
  check('gas held: turbo, gas layer in, low-pass fully open', (await calls('turbo')).length >= 1 && a.layers.gas > 0.6 && a.music.cutoff > 15000, JSON.stringify(a));
  await ecc('pedal', 0);
  await play(0.3);

  // ---- La Cinta: the snare roll in the last 60 m, the burst stinger
  await clearCalls();
  await ecc('setRecordDist', (await ecc('runDist')) + 110);
  const rose = await play(6, 'e.audio().music.riser');
  const riserAt = await ecc('runDist');
  const burst = await play(4, "e.audio().music.riser === false");
  const riserCalls = await calls('tapeRiser');
  check('La Cinta: the riser turns on inside tapeRiserM, farthest() at the burst, riser off after', rose && burst && riserCalls.length >= 2 && riserCalls[0].args[0] === true && (await calls('farthest')).length === 1, JSON.stringify({ rose, burst, riserAt, riserCalls }));

  // ---- a plátano string climbs a semitone per pickup
  await clearCalls();
  await ecc('clearTraffic');
  const px = await ecc('x');
  for (let i = 0; i < 6; i++) await ecc('spawnPickup', 'platano', px, 9 + i * 2.3);
  await play(2);
  const pl = await calls('platano');
  check('plátano string: 6 pickups, streak 0..5', pl.map((c) => c.streak).join(',') === '0,1,2,3,4,5', JSON.stringify(pl.map((c) => [c.at, c.streak])));

  // ---- power-ups and their end cues (sim time is enough for calls)
  await clearCalls();
  await ecc('spawnPickup', 'cafecito', await ecc('x'), 12);
  await fast('e.powerups().cafecitoT > 0', 3);
  await fast('e.powerups().cafecitoT === 0', 7);
  const ticks = (await calls('cafecitoTick')).map((c) => c.args[0]);
  check('cafecito: pickup jingle, then ticks 3, 2, 1 in its last second', (await calls('powerup')).some((c) => c.args[0] === 'cafecito') && ticks.join(',') === '3,2,1', JSON.stringify(ticks));
  await ecc('spawnPickup', 'iman', await ecc('x'), 12);
  await fast('e.powerups().imanT > 0', 3);
  await fast('e.powerups().imanT === 0', 10);
  check('imán: pickup, then one end cue', (await calls('imanEnd')).length === 1, JSON.stringify(await calls('imanEnd')));

  // ---- the Bendición takes a hit: shieldBreak, not the bell
  await clearCalls();
  await ecc('clearTraffic');
  await ecc('spawnPickup', 'bendicion', await ecc('x'), 12);
  await fast('e.powerups().shielded', 3);
  const bellsBefore = (await calls('bell')).length;
  await ecc('god', false);
  // a slow car dead ahead on the rider's own line
  await ecc('spawnVehicle', 'sedan', 1, 30, 1, await ecc('x'), 4);
  await fast("!e.powerups().shielded || e.state() !== 'playing'", 4);
  await ecc('god', true);
  check('shield break: shieldBreak() once, the run goes on', (await calls('shieldBreak')).length === 1 && (await ecc('state')) === 'playing' && bellsBefore === 1, JSON.stringify({ sb: await calls('shieldBreak'), state: await ecc('state'), bellsBefore }));

  // ---- the distance multiplier: its own arpeggio, not the cafecito jingle
  await clearCalls();
  const tierNow = await ecc('distMult');
  await ecc('setDistance', { 1: 505, 2: 1205, 3: 2205 }[tierNow]);
  await play(0.2);
  const mu = await calls('multUp');
  check(`multiplier x${tierNow + 1}: multUp(${tierNow + 1}), no cafecito jingle`, mu.length === 1 && mu[0].args[0] === tierNow + 1 && (await calls('powerup')).length === 0, JSON.stringify({ tierNow, mu }));

  // ---- a tramo border: the fanfare now, the band's color on the next bar
  await page.evaluate(() => {
    const e = window.__ecc;
    for (let g = 0; g < 400 && e.runDist() < 975; g++) e.tick(Math.min(2, Math.max(1 / 60, (975 - e.runDist()) / Math.max(e.effSpeed(), 1))));
  });
  const crossed = await play(5, "e.tramo() === 'zona'");
  const setT = (await calls('setTramo')).map((c) => c.args[0]);
  check('border into la Zona: setTramo(zona) and one tramo() fanfare in the run', crossed && setT.includes('zona') && (await total('tramo')) === 1, JSON.stringify({ crossed, setT, n: await total('tramo') }));
  await play(2.5);
  a = await au();
  check('the band takes la Zona color within a bar', a.music.tramo === 'zona', JSON.stringify(a.music));
  check('the Obelisco on the way rang its own bell (obelisco(), not bell())', (await total('obelisco')) >= 1, JSON.stringify({ obelisco: await total('obelisco'), bell: await total('bell') }));
  const info = [];
  for (let i = 0; i < 6; i++) {
    await play(0.5);
    info.push(await ecc('info'));
  }
  console.log(`     draw calls in la Zona: ${info.map((x) => x.calls).join(' ')}; triangles ${info.map((x) => x.tris).join(' ')}`);

  // ---- pause and back
  await clearCalls();
  await page.evaluate(() => document.querySelector('#hud-pause').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })));
  await play(0.6);
  a = await au();
  const stopP = await calls('stopRun');
  check('pause: stopRun(false), the idle radio under the pause card', (await ecc('state')) === 'paused' && stopP.length === 1 && stopP[0].args[0] === false && a.music.mode === 'idle', JSON.stringify({ stopP, m: a.music }));
  await page.keyboard.press('Space');
  await play(0.5);
  a = await au();
  check('resume: resumeRun, run mode, same tramo', (await calls('resumeRun')).length === 1 && a.music.mode === 'run' && a.music.tramo === 'zona', JSON.stringify(a.music));

  // ---- the crash: a tape-stop over the slow-mo, a breath, then the radio
  await clearCalls();
  await ecc('god', false);
  await ecc('crash');
  a = await au();
  const stopC = await calls('stopRun');
  check('crash: stopRun(true), tape-stop starts', stopC.length === 1 && stopC[0].args[0] === true && a.music.mode === 'tapestop', JSON.stringify({ stopC, m: a.music }));
  await play(0.3);
  a = await au();
  const mid = a.music;
  await play(0.6);
  a = await au();
  const after = a.music;
  check('tape-stop: the filter sweeps down and the bus fades, then idle', mid.mode === 'tapestop' && mid.cutoff < 1500 && mid.level < 0.25 && after.mode === 'idle', JSON.stringify({ mid, after }));
  await play(1.5);
  a = await au();
  check('game over: the idle radio comes back (level ~0.4, ~700 Hz)', (await ecc('state')) === 'gameover' && a.music.mode === 'idle' && Math.abs(a.music.level - 0.4) < 0.04 && Math.abs(a.music.cutoff - 700) < 40, JSON.stringify({ state: await ecc('state'), m: a.music }));

  // ---- OTRA VEZ: straight back to the Malecón dembow
  await clearCalls();
  await ecc('start');
  await play(0.4);
  a = await au();
  check('restart: run mode, back home on the Malecón, filter open', a.music.mode === 'run' && a.music.tramo === 'malecon' && a.music.cutoff > 8000, JSON.stringify(a.music));

  check('console: no errors or warnings, no page errors', noise.length === 0, noise.join('\n     '));
} finally {
  await browser?.close();
  await server.close();
}
console.log(`${checks.filter((c) => c.ok).length}/${checks.length} checks ok`);
process.exit(failed ? 1 : 0);
