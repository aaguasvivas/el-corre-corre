// Live checks of the traffic package in the real game: draw calls over a
// long god-mode ride, and scripted behavior probes through window.__ecc.
// Boots the page like tools/shots.mjs (seeded Math.random, frozen rAF,
// suspended audio), so the sim only moves on __ecc.tick.
//
//   node tools/traffic-lab/browser-probe.mjs [--root <repo>] [--only drawcalls]
//
// --root points at another checkout (for before/after draw calls); the
// behavior probes need this package's __ecc hooks and skip themselves when
// they are missing.

import { createServer } from 'vite';
import puppeteer from 'puppeteer-core';
import { realpathSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const argv = process.argv.slice(2);
const arg = (name, def) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : def;
};
const ROOT = resolve(arg('--root', HERE));
const ONLY = arg('--only', '');
const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

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
}

const q = (a, p) => {
  const s = [...a].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))];
};

async function main() {
  const server = await createServer({
    root: ROOT,
    configFile: resolve(ROOT, 'vite.config.ts'),
    logLevel: 'warn',
    clearScreen: false,
    server: {
      port: 5299,
      strictPort: false,
      hmr: false,
      fs: { allow: [ROOT, realpathSync(resolve(ROOT, 'node_modules'))] },
    },
  });
  await server.listen();
  const url = server.resolvedUrls.local[0];
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    protocolTimeout: 600000,
    args: ['--enable-gpu', '--ignore-gpu-blocklist', '--hide-scrollbars', '--mute-audio'],
  });
  const noise = [];
  try {
    const page = await browser.newPage();
    page.on('console', (m) => {
      if (m.type() === 'error' || m.type() === 'warn') noise.push(`${m.type()}: ${m.text()}`);
    });
    page.on('pageerror', (e) => noise.push(`pageerror: ${e.message}`));
    await page.setViewport({ width: 375, height: 667, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await page.evaluateOnNewDocument(bootScript, 7);
    const load = async () => {
      await page.goto(url, { waitUntil: 'load', timeout: 300000 });
      await page.waitForFunction(() => window.__ecc !== undefined, { timeout: 300000 });
    };
    await load();
    console.log(`root ${ROOT}`);

    if (!ONLY || ONLY === 'drawcalls') {
      // a 150 s god-mode ride on the start line, sampled every 0.25 s
      const r = await page.evaluate(() => {
        const e = window.__ecc;
        e.start();
        e.god(true);
        const calls = [];
        const cars = [];
        for (let t = 0; t < 150; t += 0.25) {
          e.tick(0.25);
          calls.push(e.info().calls);
          cars.push(e.cars());
        }
        return { calls, cars };
      });
      console.log(
        `drawcalls over 150 s: median ${q(r.calls, 0.5)} p90 ${q(r.calls, 0.9)} max ${Math.max(...r.calls)}; ` +
          `active cars median ${q(r.cars, 0.5)} max ${Math.max(...r.cars)}`,
      );
      await load();
    }

    const has = await page.evaluate(() => typeof window.__ecc.ahead === 'function');
    if (has && (!ONLY || ONLY === 'behavior')) {
      // feel[3] brake probe: a car 4 m behind the rider, brake held for 6 s
      const brake = await page.evaluate(() => {
        const e = window.__ecc;
        let crashes = 0;
        let spawned = 0;
        for (let i = 0; i < 40; i++) {
          if (e.state() !== 'title') e.crash();
          if (e.state() === 'crashing') e.tick(1);
          e.start();
          e.god(false);
          e.tick(0.5);
          if (e.spawnVehicle(i % 2 ? 'sedan' : 'motoconcho', 1, -4, 1, e.x())) spawned++;
          window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowDown' }));
          for (let t = 0; t < 6 && e.state() === 'playing'; t += 1 / 60) e.tick(1 / 60);
          window.dispatchEvent(new KeyboardEvent('keyup', { code: 'ArrowDown' }));
          if (e.state() !== 'playing') crashes++;
        }
        return { crashes, spawned };
      });
      console.log(`brake probe (feel[3]): ${brake.crashes}/40 crashed, ${brake.spawned} cars spawned behind`);
      await load();

      // the opening: first reward and first power-up for a rider who never steers
      const open = await page.evaluate(() => {
        const e = window.__ecc;
        e.start();
        e.god(true);
        let firstPlatano = -1;
        let shieldAt = -1;
        for (let t = 0; t < 16; t += 1 / 60) {
          e.tick(1 / 60);
          if (firstPlatano < 0 && e.platanos() > 0) firstPlatano = t;
          if (shieldAt < 0 && e.powerups().shielded) shieldAt = t;
        }
        return { firstPlatano, shieldAt, combo: e.combo() };
      });
      console.log(`opening: first plátano at ${open.firstPlatano.toFixed(2)} s, Bendición shield at ${open.shieldAt.toFixed(2)} s`);
      await load();

      // hands off on the start line: no near-miss income
      const parked = await page.evaluate(() => {
        const e = window.__ecc;
        e.start();
        e.god(true);
        let best = 0;
        for (let t = 0; t < 90; t += 1 / 30) {
          e.tick(1 / 30);
          best = Math.max(best, e.combo());
        }
        return best;
      });
      console.log(`parked on the start line for 90 s (god mode): best combo ${parked}`);
      await load();

      // cafecito expiry inside a car: the grace second, then steer out
      const caf = await page.evaluate(() => {
        const e = window.__ecc;
        e.start();
        e.god(false);
        e.tick(1);
        e.clearTraffic();
        e.spawnPickup('cafecito', e.x(), 8);
        for (let t = 0; t < 2 && e.powerups().cafecitoT <= 0; t += 1 / 60) e.tick(1 / 60);
        const got = e.powerups().cafecitoT > 0;
        // plow: a slower car right on the rider's line just before expiry
        for (let t = 0; t < 6 && e.powerups().cafecitoT > 0.25; t += 1 / 60) e.tick(1 / 60);
        e.clearTraffic();
        const placed = e.spawnVehicle('guagua', 1, 1.5, 1, e.x());
        const speeds = [];
        let graceSeen = 0;
        for (let t = 0; t < 0.6; t += 1 / 60) {
          e.tick(1 / 60);
          speeds.push(e.effSpeed());
          graceSeen = Math.max(graceSeen, e.powerups().cafGraceT);
        }
        const inside = e.touching(0);
        // now steer out of it
        window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyD' }));
        for (let t = 0; t < 0.6; t += 1 / 60) e.tick(1 / 60);
        window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyD' }));
        e.tick(0.5);
        let maxStep = 0;
        for (let i = 1; i < speeds.length; i++) maxStep = Math.max(maxStep, Math.abs(speeds[i] - speeds[i - 1]));
        return { got, placed, graceSeen, inside, state: e.state(), maxStep, first: speeds[0], last: speeds[speeds.length - 1] };
      });
      console.log(
        `cafecito expiry: picked ${caf.got}, car placed on the rider ${caf.placed}, inside at expiry ${caf.inside}, ` +
          `grace ${caf.graceSeen.toFixed(2)} s, state after steering out: ${caf.state}; ` +
          `speed ${caf.first} -> ${caf.last} m/s, largest per-tick change ${caf.maxStep.toFixed(2)}`,
      );
    }
  } finally {
    await browser.close();
    await server.close();
  }
  console.log(noise.length ? `console noise:\n  ${[...new Set(noise)].join('\n  ')}` : 'console: clean');
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
