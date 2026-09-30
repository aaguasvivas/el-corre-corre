// Headless screenshot gallery for art reviews and store candidates. Starts a
// Vite dev server, opens the game in headless Chrome, and drives every scene
// through the window.__ecc test rig plus synthetic DOM events. Before the game
// boots, requestAnimationFrame is frozen, Math.random is seeded and the
// AudioContext is held suspended, so the simulation only moves when a scene
// calls __ecc.tick(): the same command gives the same frames. Moments with
// popups are played at real-time pace (tick, then wait out the rest of the
// step), because the popups animate and stack on the wall clock; looping CSS
// animations are posed at mid-cycle before each capture. Scenes that ride
// long distances turn on __ecc.god(), which only skips vehicle collisions.
//
//   node tools/shots.mjs                                  # every scene, both phones
//   node tools/shots.mjs --scenes title,contravia         # a subset
//   node tools/shots.mjs --viewports se,390x844@3         # presets or WxH@scale
//   node tools/shots.mjs --out docs/shots/baseline        # default docs/shots/latest
//   node tools/shots.mjs --lang en --seed 11              # EN copy, other traffic
//   node tools/shots.mjs --gl swiftshader                 # software WebGL
//   node tools/shots.mjs --list                           # scene and viewport names
//
// Writes <out>/<scene>-<viewport>.png (out is relative to the repo root).
// WebGL runs on the real GPU by default (ANGLE on Metal on a Mac: about 20x
// faster than software here, and closer to a phone); --gl swiftshader is the
// fallback for a machine where the GPU path renders blank. Chrome comes from
// CHROME_PATH, else the standard macOS install. Page console errors and
// warnings are printed; the exit code is 1 when a page throws, WebGL is
// blank, a frame comes out flat, or a scene fails.

import { createServer } from 'vite';
import puppeteer from 'puppeteer-core';
import { inflateSync } from 'node:zlib';
import { mkdirSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CHROME =
  process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

// A busy machine is slow: page loads (and shader compiles under software
// WebGL) can take minutes, and a timeout there says nothing about the game.
const LOAD_MS = 300000;

// ---------------------------------------------------------------------------
// Viewports
// ---------------------------------------------------------------------------

// iphone69 at 3x is exactly 1320x2868, the App Store 6.9-inch size.
const VIEWPORTS = {
  iphone69: { width: 440, height: 956, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  se: { width: 375, height: 667, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
};

function parseViewport(name) {
  if (VIEWPORTS[name]) return { name, ...VIEWPORTS[name] };
  const m = /^(\d+)x(\d+)(?:@(\d+(?:\.\d+)?))?$/.exec(name);
  if (!m) throw new Error(`unknown viewport "${name}" (presets: ${Object.keys(VIEWPORTS).join(', ')}, or WxH@scale)`);
  return {
    name,
    width: +m[1],
    height: +m[2],
    deviceScaleFactor: m[3] ? +m[3] : 1,
    isMobile: true,
    hasTouch: true,
  };
}

// ---------------------------------------------------------------------------
// Scene helpers (everything goes through __ecc or a DOM event)
// ---------------------------------------------------------------------------

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function helpers(page, vp) {
  const ecc = (name, ...args) =>
    page.evaluate((n, a) => window.__ecc[n](...a), name, args);

  // One synthetic touch pointer. Moves and the lift go to the element the
  // finger landed on, like implicit pointer capture on a real touch screen.
  const touch = (type, x, y) =>
    page.evaluate(
      (t, px, py) => {
        const target =
          t === 'pointerdown' ? (document.elementFromPoint(px, py) ?? document.body) : window.__shotTouch;
        window.__shotTouch = target;
        target.dispatchEvent(
          new PointerEvent(t, {
            bubbles: true,
            cancelable: true,
            composed: true,
            pointerId: 7,
            pointerType: 'touch',
            isPrimary: true,
            clientX: px,
            clientY: py,
            buttons: t === 'pointerup' ? 0 : 1,
          }),
        );
      },
      type,
      x,
      y,
    );

  const s = {
    page,
    ecc,
    tick: (sec) => ecc('tick', sec),
    down: (x, y) => touch('pointerdown', x, y),
    move: (x, y) => touch('pointermove', x, y),
    up: (x, y) => touch('pointerup', x, y),

    // Tap a DOM control by selector (the game listens on pointerdown).
    tap: (selector) =>
      page.evaluate((sel) => {
        const el = document.querySelector(sel);
        if (!el) throw new Error(`no element ${sel}`);
        const r = el.getBoundingClientRect();
        const init = {
          bubbles: true,
          cancelable: true,
          composed: true,
          pointerId: 9,
          pointerType: 'touch',
          isPrimary: true,
          clientX: r.left + r.width / 2,
          clientY: r.top + r.height / 2,
        };
        el.dispatchEvent(new PointerEvent('pointerdown', { ...init, buttons: 1 }));
        el.dispatchEvent(new PointerEvent('pointerup', { ...init, buttons: 0 }));
      }, selector),

    start: async (god = true) => {
      await ecc('start');
      await ecc('god', god);
    },

    // Ride (sim time) until the run has covered `meters`. Chunked so each
    // render lands near the target instead of overshooting it.
    rideTo: (meters) =>
      page.evaluate((m) => {
        const e = window.__ecc;
        for (let guard = 0; guard < 400 && e.runDist() < m; guard++) {
          const sec = (m - e.runDist()) / Math.max(e.effSpeed(), 1);
          e.tick(Math.min(4, Math.max(1 / 60, sec)));
        }
        return e.runDist();
      }, meters),

    // Play at real-time pace: tick one step, then wait out whatever is left
    // of it, so CSS popups and their stacking see the timing a player would.
    // With `until` (a JS expression over e = __ecc) it stops right after the
    // step where that first holds, so a scene's settle time is measured from
    // the event itself.
    play: async (maxSec, until = 'false', step = 1 / 20) => {
      const t0 = Date.now();
      const holds = () => page.evaluate((src) => new Function('e', `return (${src});`)(window.__ecc), until);
      if (await holds()) return true;
      for (let t = 0; t < maxSec - 1e-9; t += step) {
        const done = await page.evaluate(
          (src, st) => {
            const e = window.__ecc;
            e.tick(st);
            return new Function('e', `return (${src});`)(e);
          },
          until,
          step,
        );
        if (done) return true;
        const wait = t0 + (t + step) * 1000 - Date.now();
        if (wait > 0) await sleep(wait);
      }
      return false;
    },

    // God mode rides straight through traffic, which would leave a car
    // ghosted into the rider. Before a clean shot, ride on until nothing is
    // within half a metre of the rider's circle.
    unghost: async () => {
      if (!(await s.tickUntil('!e.touching(0.5)', 4, 1 / 20))) throw new Error('rider never came clear of traffic');
    },

    // Jump every finished-able CSS animation (popups, cards, banners) to its
    // end, so a long ride's leftovers do not pile into the next moment.
    clearFx: () =>
      page.evaluate(() => {
        for (const a of document.getAnimations()) {
          if (a.effect?.getComputedTiming().endTime !== Infinity) a.finish();
        }
      }),

    // Spawn through __ecc, retrying for a moment if the spawner's own
    // corridor rule turns it down (it will not stack a car on another).
    spawn: async (...args) => {
      for (let i = 0; i < 20; i++) {
        if (await ecc('spawnVehicle', ...args)) return;
        await s.play(0.1);
      }
      throw new Error(`spawnVehicle ${args.join(' ')} refused`);
    },

    // Tick in small steps until a condition on __ecc holds (or give up).
    tickUntil: (predicateSrc, maxSec, step = 0.05) =>
      page.evaluate(
        (src, max, st) => {
          const e = window.__ecc;
          const ok = new Function('e', `return (${src});`);
          for (let t = 0; t < max; t += st) {
            if (ok(e)) return true;
            e.tick(st);
          }
          return ok(e);
        },
        predicateSrc,
        maxSec,
        step,
      ),

    // Ride a real dodge chain at real-time pace: sit on the next car's line,
    // then step out of it at the last moment (a near-miss must be a dodge).
    // onLine and dodge map the next car's x to the rider's two targets.
    // Steers with the keyboard, so no finger is left on the screen.
    dodgeChain: async (onLine, dodge, maxSec, until) => {
      const t0 = Date.now();
      const step = 1 / 30;
      let done = false;
      for (let t = 0; t < maxSec - 1e-9 && !done; t += step) {
        done = await page.evaluate(
          (onSrc, dodgeSrc, untilSrc, st) => {
            const e = window.__ecc;
            const a = e.ahead();
            const x = e.x();
            let target = x;
            if (a) target = new Function('ax', `return (${a.t < 0.42 ? dodgeSrc : onSrc});`)(a.x);
            const want = target > x + 0.08 ? 'KeyA' : target < x - 0.08 ? 'KeyD' : null;
            if (want !== window.__shotKey) {
              if (window.__shotKey) window.dispatchEvent(new KeyboardEvent('keyup', { code: window.__shotKey }));
              if (want) window.dispatchEvent(new KeyboardEvent('keydown', { code: want }));
              window.__shotKey = want;
            }
            e.tick(st);
            return new Function('e', `return (${untilSrc});`)(e);
          },
          onLine,
          dodge,
          until,
          step,
        );
        const wait = t0 + (t + step) * 1000 - Date.now();
        if (wait > 0) await sleep(wait);
      }
      await page.evaluate(() => {
        if (window.__shotKey) window.dispatchEvent(new KeyboardEvent('keyup', { code: window.__shotKey }));
        window.__shotKey = null;
      });
      return done;
    },

    // A returning player: write these storage keys, then reload so the game
    // boots on them (records, the wallet, owned paints).
    seed: async (entries) => {
      await page.evaluate((e) => {
        for (const [k, v] of Object.entries(e)) localStorage.setItem(k, v);
        sessionStorage.setItem('__shotKeep', '1');
      }, entries);
      await page.reload({ waitUntil: 'load', timeout: LOAD_MS });
      await page.waitForFunction(() => window.__ecc !== undefined, { timeout: LOAD_MS });
      await page.evaluate(() => document.fonts.ready.then(() => undefined));
      await ecc('tick', 1 / 60);
    },

    // Where a pedal is on screen: the centre of #pedal-gas or #pedal-brake.
    pedalAt: (which) =>
      page.evaluate((sel) => {
        const r = document.querySelector(sel).getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      }, which === 'gas' ? '#pedal-gas' : '#pedal-brake'),

    // Drag a finger sideways until the rider sits at world x (a feedback
    // loop, so the pixel-to-metre guess only has to be close).
    steerTo: async (targetX) => {
      const y = vp.height * 0.7;
      let fx = vp.width / 2;
      await s.down(fx, y);
      for (let i = 0; i < 8; i++) {
        const err = targetX - (await ecc('x'));
        if (Math.abs(err) < 0.15) break;
        // screen right is world -x; ~16.8 m of road per 1.3 screen widths
        fx = Math.min(vp.width - 2, Math.max(2, fx - (err * vp.width) / (16.8 * 1.3)));
        await s.move(fx, y);
        await s.tick(0.5);
      }
      await s.up(fx, y);
    },
  };
  return s;
}

// ---------------------------------------------------------------------------
// Scenes. settle: ms of real time for CSS animations before the freeze, or
// 'finish' to jump every finite animation to its end (clean gameplay shots).
// ---------------------------------------------------------------------------

// Clip the rear corner of a slower car: a dead-center rear-end buries the
// bike in the trunk, a corner hit leaves the tumble in the open.
async function crashSetup(s, ride = 'motor') {
  if (ride !== 'motor') await s.ecc('selectVehicle', ride);
  await s.start(false);
  await s.tick(2);
  await s.ecc('clearTraffic');
  await s.spawn('sedan', 1, 7, 1, (await s.ecc('x')) + 1.2);
  if (!(await s.tickUntil("e.state() === 'crashing'", 5, 1 / 60))) throw new Error('no crash');
}

// Hold the full-screen flash at `ms` into its fade, whatever the wall clock did.
async function poseFlash(s, ms) {
  await s.page.evaluate((t) => {
    for (const a of document.getAnimations()) {
      if (a.effect?.target?.id === 'flash') {
        a.pause();
        a.currentTime = t;
      }
    }
  }, ms);
}

const SCENES = [
  {
    id: 'title',
    what: 'Title screen in attract mode',
    settle: 900,
    run: async (s) => {
      await s.tick(0.6);
    },
  },
  {
    id: 'title-pintura',
    what: 'Title with El Civic selected and a locked pintura previewed',
    settle: 700,
    run: async (s) => {
      await s.tap('.vtab[data-v="civic"]');
      await s.tap('.paint[data-i="1"]');
      await s.tick(0.6);
    },
  },
  {
    id: 'title-rich',
    what: 'A returning player: records, 1,240 plátanos, two paints owned, a buyable one previewed',
    settle: 700,
    run: async (s) => {
      await s.seed({
        'ecc.v1.platanosLifetime': '1240',
        'ecc.v1.record.motor': '48210',
        'ecc.v1.recordDist.motor': '1870',
        'ecc.v1.record.pasola': '9120',
        'ecc.v1.pinturas.motor': '1',
        'ecc.v1.pintura.motor': '1',
      });
      await s.tap('.paint[data-i="2"]');
      await s.tick(0.6);
    },
  },
  {
    id: 'title-mandaos',
    what: 'Title with the Los Mandaos list open (tutorial set 1, the daily, a 3-day streak)',
    settle: 400,
    run: async (s) => {
      const d = new Date();
      const p = (n) => String(n).padStart(2, '0');
      const today = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
      await s.seed({ 'ecc.v1.streak': JSON.stringify({ last: today, n: 3 }) });
      await s.tap('#mandao-chip');
      await s.tick(0.3);
    },
  },
  {
    id: 'mandao-toast',
    what: 'Mid-run: a mandao gets done (10 plátanos) and its gold card drops into the announcement lane',
    settle: 450,
    run: async (s) => {
      await s.start();
      await s.tick(1);
      await s.ecc('clearTraffic');
      const x = await s.ecc('x');
      for (let i = 0; i < 10; i++) await s.ecc('spawnPickup', 'platano', x, 8 + i * 2.2);
      if (!(await s.play(4, "e.hud().kind === 'mandao'"))) throw new Error('no mandao card');
    },
  },
  {
    id: 'meta',
    what: 'A first run: LA META stands at 400 m (no distance record yet)',
    settle: 'finish',
    run: async (s) => {
      await s.start();
      await s.rideTo(345);
      await s.clearFx();
      await s.ecc('clearTraffic');
      await s.tick(0.1);
    },
  },
  {
    id: 'malecon',
    what: 'El Malecon, 4 s into a run, with traffic both ways',
    settle: 'finish',
    run: async (s) => {
      await s.start();
      await s.tick(3);
      // The street is placed by hand on an emptied road, so the shot keeps
      // the same composition whatever the opening seeds.
      await s.ecc('clearTraffic');
      await s.spawn('guagua', 0, 36, 1);
      await s.spawn('sedan', 1, 62, 1);
      await s.spawn('sedan', 2, 80, -1);
      await s.spawn('motoconcho', 3, 50, -1);
      await s.tick(1);
    },
  },
  {
    id: 'contravia',
    what: 'En contra via: rider in the oncoming lanes, vignette and pill on',
    settle: 400,
    run: async (s) => {
      await s.start();
      await s.tick(1.5);
      await s.steerTo(3.4);
      await s.spawn('sedan', 3, 40, -1, 5.5);
      await s.spawn('motoconcho', 2, 62, -1, 1.4);
      await s.tick(0.6);
    },
  },
  {
    id: 'nearmiss',
    what: 'Near-miss chain: dodging a string of oncoming cars, up to the combo 5 ladder popup',
    settle: 120,
    run: async (s) => {
      await s.start();
      await s.tick(1.5);
      await s.ecc('clearTraffic');
      await s.steerTo(2.3);
      // Oncoming cars alternating the two contra via lanes, 24 m apart. A
      // near-miss has to be a dodge: sit on each car's line, step out late.
      for (let i = 0; i < 6; i++) {
        const lane = i % 2 ? 3 : 2;
        // fixed speeds (each type's top speed), so the pass timing holds
        // whatever the RNG draws
        await s.spawn(i === 2 ? 'guagua' : 'sedan', lane, 30 + i * 24, -1, lane === 2 ? 1.7 : 5.1, i === 2 ? 11 : 14);
      }
      const onLine = 'ax < 3.4 ? ax + 0.6 : ax - 0.6';
      const dodge = 'ax < 3.4 ? ax + 1.8 : ax - 1.8';
      if (!(await s.dodgeChain(onLine, dodge, 8, 'e.combo() >= 5'))) throw new Error('combo 5 never reached');
    },
  },
  {
    id: 'wheelie',
    what: 'Caballito: flick up and hold, pill on',
    settle: 150,
    run: async (s, vp) => {
      await s.start();
      await s.tick(2);
      const x = vp.width / 2;
      const y = vp.height * 0.72;
      await s.down(x, y);
      await s.move(x, y - 80); // fast and vertical: a flick
      await s.play(0.4);
    },
  },
  {
    id: 'gas',
    what: 'A fondo at the speed cap: GAS pedal held, x1.5 tag, gold km/h, full speed lines',
    settle: 'finish',
    run: async (s) => {
      await s.start();
      const p = await s.pedalAt('gas');
      await s.down(p.x, p.y);
      // Top speed a fondo: about two minutes into a run, which is also where
      // the lap brings the rider back to the Malecon.
      if (!(await s.tickUntil('e.effSpeed() >= 50', 180, 4))) throw new Error('never reached top speed');
      await s.unghost();
      if (!(await s.ecc('gas')).gasOn) throw new Error('gas is not paying');
    },
  },
  {
    id: 'gas-early',
    what: 'A fondo 6 s into a run: the pedal answers at low speed too',
    settle: 'finish',
    run: async (s) => {
      await s.start();
      await s.tick(5);
      const p = await s.pedalAt('gas');
      await s.down(p.x, p.y);
      await s.tick(1.2);
      if (!(await s.ecc('gas')).gasOn) throw new Error('gas is not paying');
    },
  },
  {
    id: 'brake',
    what: 'Frenando: FRENO held, x0.5 tag, tail light on',
    settle: 'finish',
    run: async (s) => {
      await s.start();
      await s.tick(4);
      const p = await s.pedalAt('brake');
      await s.down(p.x, p.y);
      await s.tick(0.8);
      if (!(await s.ecc('gas')).brakeOn) throw new Error('brake is not engaged');
    },
  },
  {
    id: 'brake-hot',
    what: 'El freno caliente: FRENO held past 2 s, ¡CALIENTE! and smoke off the rear wheel',
    settle: 'finish',
    run: async (s) => {
      await s.start();
      await s.tick(4);
      const p = await s.pedalAt('brake');
      await s.down(p.x, p.y);
      if (!(await s.tickUntil('e.brakeHeat().hot', 4, 1 / 20))) throw new Error('the pads never cooked');
      await s.tick(0.4);
    },
  },
  {
    id: 'overhead-fade',
    what: 'A pasacalle 18 m ahead, halfway through its fade as it climbs toward the HUD',
    settle: 'finish',
    run: async (s) => {
      await s.start();
      await s.tick(3);
      await s.ecc('overhead', 18, 'pasacalle');
      await s.tick(1 / 60);
    },
  },
  {
    id: 'overhead-pass',
    what: 'A pasacalle 10 m ahead, where it used to cover the score and the pause button: gone',
    settle: 'finish',
    run: async (s) => {
      await s.start();
      await s.tick(3);
      await s.ecc('overhead', 10, 'pasacalle');
      await s.tick(1 / 60);
    },
  },
  {
    id: 'zona',
    what: 'La Zona Colonial, 300 m past the border',
    settle: 'finish',
    run: async (s) => {
      await s.start();
      await s.rideTo(1300);
      await s.unghost();
    },
  },
  {
    id: 'campo',
    what: 'El Campo, 300 m past the border',
    settle: 'finish',
    run: async (s) => {
      await s.start();
      await s.rideTo(2300);
      await s.unghost();
    },
  },
  {
    id: 'tramo-card',
    what: 'Arrival card crossing into La Zona',
    settle: 600,
    run: async (s) => {
      await s.start();
      await s.rideTo(975);
      await s.clearFx();
      if (!(await s.play(4, "e.tramo() === 'zona'"))) throw new Error('no border crossing');
      await s.play(0.3);
    },
  },
  {
    id: 'cinta',
    what: 'La Cinta del Record stretched across the road ahead',
    settle: 'finish',
    run: async (s) => {
      await s.start();
      await s.tick(3);
      await s.ecc('setRecordDist', (await s.ecc('runDist')) + 30);
      await s.tick(0.1);
    },
  },
  {
    id: 'pickups',
    what: 'Road art: a platano string, the three power-ups, hoyos with la rama, a charco',
    settle: 'finish',
    run: async (s) => {
      await s.start();
      await s.tick(1.5);
      for (let i = 0; i < 6; i++) await s.ecc('spawnPickup', 'platano', -3.4, 9 + i * 2.3);
      await s.ecc('spawnPickup', 'cafecito', -0.6, 20);
      await s.ecc('spawnPickup', 'bendicion', -5.8, 23);
      await s.ecc('spawnPickup', 'iman', 1.4, 26);
      await s.ecc('spawnObstacle', 'hoyo', -1.4, 15);
      await s.ecc('spawnObstacle', 'hoyo', -5.4, 38);
      await s.ecc('spawnObstacle', 'charco', 1.9, 13);
      await s.tick(1 / 60);
    },
  },
  // The crash at three moments: the impact frame (white flash, the killer
  // lit), mid tumble (the rider in the air, off the ride), and the card
  // landing over the rider lying under the stars.
  {
    id: 'crash-impact',
    what: 'Crash, the impact frame: white flash, the car that hit you lit',
    settle: 0,
    run: async (s) => {
      await crashSetup(s);
      await s.tick(1 / 60);
      await poseFlash(s, 40);
    },
  },
  {
    id: 'crash',
    what: 'Crash, mid tumble in the slow-mo',
    settle: 0,
    run: async (s) => {
      await crashSetup(s);
      await s.play(0.22, 'false', 1 / 60);
    },
  },
  {
    id: 'crash-civic',
    what: 'Crash in El Civic: el tiguere flies out of the sunroof, the car slews',
    settle: 0,
    run: async (s) => {
      await crashSetup(s, 'civic');
      await s.play(0.22, 'false', 1 / 60);
    },
  },
  {
    id: 'crash-pasola',
    what: 'Crash on La Pasola, mid tumble',
    settle: 0,
    run: async (s) => {
      await crashSetup(s, 'pasola');
      await s.play(0.22, 'false', 1 / 60);
    },
  },
  {
    id: 'crash-card',
    what: 'Crash, the card just landed over the tumble',
    settle: 250,
    run: async (s) => {
      await crashSetup(s);
      if (!(await s.play(1, "e.state() === 'gameover'", 1 / 60))) throw new Error('no game over');
      await s.play(0.25, 'false', 1 / 60);
    },
  },
  {
    id: 'gameover',
    what: 'Game-over card after a 400 m run (a first run: LA META, a mandao stamped)',
    settle: 1500,
    run: async (s) => {
      await s.start();
      await s.rideTo(400);
      await s.unghost();
      await s.ecc('god', false);
      await s.ecc('clearTraffic');
      // Every run hands out a Bendición around 14 s, so the first car may
      // only take the shield: keep sending one until the rider goes down. A
      // slower car can also hold the spot for a moment (the spawner will not
      // stack one car on another), so a refused spawn is offered again while
      // the run is live.
      let crashed = false;
      for (let i = 0; i < 4 && !crashed; i++) {
        try {
          await s.spawn('sedan', 1, 7, 1, await s.ecc('x'));
        } catch (err) {
          if (i >= 3 || (await s.ecc('state')) !== 'playing') throw err;
          continue;
        }
        crashed = await s.play(2.5, "e.state() === 'crashing'");
      }
      if (!crashed) throw new Error('no crash');
      if (!(await s.play(2, "e.state() === 'gameover'"))) throw new Error('no game over');
    },
  },
  {
    id: 'gameover-levelup',
    what: 'Game over on the run that finished the first mandao set: three stamps and the level-up line',
    settle: 1800,
    run: async (s) => {
      await s.start();
      await s.tick(1);
      await s.ecc('clearTraffic');
      const x = await s.ecc('x');
      for (let i = 0; i < 10; i++) await s.ecc('spawnPickup', 'platano', x, 8 + i * 2.2);
      await s.tick(3);
      await s.ecc('nearMiss', 1.0);
      await s.ecc('nearMiss', 1.0);
      await s.rideTo(330);
      await s.unghost();
      await s.ecc('god', false);
      await s.ecc('clearTraffic');
      let crashed = false;
      for (let i = 0; i < 4 && !crashed; i++) {
        try {
          await s.spawn('sedan', 1, 7, 1, await s.ecc('x'));
        } catch (err) {
          if (i >= 3 || (await s.ecc('state')) !== 'playing') throw err;
          continue;
        }
        crashed = await s.play(2.5, "e.state() === 'crashing'");
      }
      if (!crashed) throw new Error('no crash');
      if (!(await s.play(2, "e.state() === 'gameover'"))) throw new Error('no game over');
      if (!(await s.ecc('mandaos')).lastSet) throw new Error('the set did not finish');
    },
  },
  {
    id: 'gameover-far',
    what: 'Game over for a returning player: La Cinta fell (farthest ever), the points record did not',
    settle: 1500,
    run: async (s) => {
      await s.seed({
        'ecc.v1.platanosLifetime': '380',
        'ecc.v1.record.motor': '99999',
        'ecc.v1.recordDist.motor': '240',
      });
      await s.start();
      await s.rideTo(300);
      await s.unghost();
      await s.ecc('god', false);
      await s.ecc('clearTraffic');
      let crashed = false;
      for (let i = 0; i < 4 && !crashed; i++) {
        try {
          await s.spawn('sedan', 1, 7, 1, await s.ecc('x'));
        } catch (err) {
          if (i >= 3 || (await s.ecc('state')) !== 'playing') throw err;
          continue;
        }
        crashed = await s.play(2.5, "e.state() === 'crashing'");
      }
      if (!crashed) throw new Error('no crash');
      if (!(await s.play(2, "e.state() === 'gameover'"))) throw new Error('no game over');
    },
  },
  {
    id: 'pause',
    what: 'Pause screen over a live run',
    settle: 500,
    run: async (s) => {
      await s.start();
      await s.tick(3);
      await s.tap('#hud-pause');
      await s.tick(0);
    },
  },

  {
    id: 'resume',
    what: 'SEGUIR: the resume countdown, world frozen',
    settle: 'finish',
    run: async (s) => {
      await s.start();
      await s.tick(3);
      await s.tap('#hud-pause');
      await s.tick(0);
      await s.tap('#btn-resume');
      await s.tick(0.6);
      if ((await s.ecc('state')) !== 'countdown') throw new Error('no countdown');
    },
  },

  {
    id: 'setpiece',
    what: 'A set piece calls its name: el camión botando plátanos, the longest one',
    settle: 200,
    run: async (s) => {
      await s.start();
      await s.tick(3);
      await s.clearFx();
      await s.ecc('setPiece', 'camionPlatanos');
      await s.play(0.05);
    },
  },
  {
    id: 'camion',
    what: 'El camión botando plátanos: a trail dropping off its back, in view',
    settle: 'finish',
    run: async (s) => {
      await s.start();
      await s.tick(2);
      await s.ecc('clearTraffic');
      await s.ecc('setPiece', 'camionPlatanos');
      await s.tick(13);
    },
  },
  {
    id: 'escalate',
    what: 'Crossing 500 m: the multiplier popup with la calle se puso brava under it',
    settle: 200,
    run: async (s) => {
      await s.start();
      await s.tick(3);
      await s.clearFx();
      // A fresh save's LA META tape stands at 400 m; the jump to 499 m would
      // burst it in the same frame, so this run chases a far record instead.
      await s.ecc('setRecordDist', 5000);
      await s.ecc('setDistance', 499);
      if (!(await s.play(1, 'e.distMult() >= 2'))) throw new Error('no tier');
    },
  },

  // The in-run HUD at its limits.
  {
    id: 'hud-max',
    what: 'The top band at its fullest: ×15 LEYENDA tier, contra vía and caballito pills, the multiplier on fire, a long score, La Cinta chip',
    settle: 360,
    run: async (s, vp) => {
      await s.start();
      await s.tick(2);
      await s.ecc('clearTraffic');
      // A long score: a burst of near-misses, then that combo dies out.
      for (let i = 0; i < 160; i++) await s.ecc('nearMiss', 0.8);
      await s.tick(4.6);
      await s.ecc('setRecordDist', 9000);
      await s.rideTo(520); // the ×2 tier: with contra vía and the caballito, ×6
      await s.clearFx();
      await s.steerTo(3.4); // en contra vía
      await s.ecc('setRecordDist', (await s.ecc('runDist')) + 152);
      const x = vp.width / 2;
      const y = vp.height * 0.72;
      await s.down(x, y);
      await s.move(x, y - 80); // flick and hold: the caballito
      await s.tick(0.1);
      for (let i = 0; i < 15; i++) {
        await s.ecc('nearMiss', 0.8);
        await s.play(0.06);
      }
      await s.play(0.3);
    },
  },
  {
    id: 'popups-edge',
    what: 'Popups at the right kerb: a razor pass and a plátano string adding into one "+N", clamped inside the screen',
    settle: 140,
    run: async (s) => {
      await s.start();
      await s.tick(1.5);
      await s.ecc('clearTraffic');
      await s.steerTo(-6.3);
      await s.ecc('clearTraffic');
      const x = await s.ecc('x');
      for (let i = 0; i < 5; i++) await s.ecc('spawnPickup', 'platano', x, 7 + i * 2.2);
      await s.play(0.5);
      await s.ecc('nearMiss', 0.2);
      await s.play(0.25);
    },
  },
  {
    id: 'coach-steer',
    what: 'First launch: the steering hint above the pedals',
    coach: 0,
    settle: 400,
    run: async (s) => {
      await s.start();
      await s.tick(1.7);
    },
  },
  {
    id: 'coach-cv',
    what: 'The contra vía hint (steering already learned)',
    coach: 1,
    settle: 400,
    run: async (s) => {
      await s.start();
      await s.tick(1.7);
    },
  },
  {
    id: 'coach-gas',
    what: 'The gas hint, pointing at the pedal (everything else learned)',
    coach: 7,
    settle: 400,
    run: async (s) => {
      await s.start();
      await s.tick(1.7);
    },
  },
  {
    id: 'cafecito',
    what: 'El cafecito on the pedals: the gold ring draining, CAFECITO, FRENO dimmed',
    settle: 'finish',
    run: async (s) => {
      await s.start();
      await s.tick(2);
      await s.ecc('clearTraffic');
      await s.ecc('spawnPickup', 'cafecito', await s.ecc('x'), 6);
      if (!(await s.tickUntil('e.powerups().cafecitoT > 0', 2, 1 / 30))) throw new Error('no cafecito');
      await s.tick(1.6);
    },
  },
  {
    id: 'tramo-campo',
    what: 'The road sign crossing into El Campo (YA ESTÁS EN EL CAMPO)',
    settle: 600,
    run: async (s) => {
      await s.start();
      await s.rideTo(1975);
      await s.clearFx();
      if (!(await s.play(4, "e.tramo() === 'campo'"))) throw new Error('no border crossing');
      await s.play(0.3);
    },
  },

  // App Store candidates: 440x956 @3 = 1320x2868.
  {
    id: 'store-contravia',
    what: 'Store: contra via near-miss chain between two oncoming lanes',
    only: ['iphone69'],
    settle: 120,
    run: async (s) => {
      await s.start();
      await s.tick(2);
      await s.ecc('clearTraffic');
      await s.steerTo(2.3);
      const zs = [30, 54, 78, 102, 126, 150];
      for (let i = 0; i < zs.length; i++) {
        const lane = i % 2 ? 3 : 2;
        await s.spawn(i === 2 ? 'guagua' : 'sedan', lane, zs[i], -1, lane === 2 ? 1.7 : 5.1, i === 2 ? 11 : 14);
      }
      const onLine = 'ax < 3.4 ? ax + 0.6 : ax - 0.6';
      const dodge = 'ax < 3.4 ? ax + 1.8 : ax - 1.8';
      if (!(await s.dodgeChain(onLine, dodge, 8, 'e.combo() >= 5'))) throw new Error('combo 5 never reached');
    },
  },
  {
    id: 'store-record',
    what: 'Store: bursting La Cinta, confetti and the ¡MÁS LEJOS QUE NUNCA! banner',
    only: ['iphone69'],
    settle: 250,
    run: async (s) => {
      await s.start();
      await s.tick(3);
      await s.ecc('setRecordDist', (await s.ecc('runDist')) + 12);
      if (!(await s.play(3, 'e.confetti().live > 0'))) throw new Error('tape never burst');
      // The confetti bursts at the rider and the road carries it past the
      // camera in about a third of a second, so the sim stops early while the
      // settle lets the banner finish popping in on the wall clock.
      await s.play(0.12);
    },
  },
  {
    id: 'store-zona',
    what: 'Store: caballito through La Zona Colonial',
    only: ['iphone69'],
    settle: 150,
    run: async (s, vp) => {
      await s.start();
      await s.rideTo(1350);
      await s.unghost();
      await s.clearFx();
      const x = vp.width / 2;
      const y = vp.height * 0.72;
      await s.down(x, y);
      await s.move(x, y - 80);
      await s.play(0.4);
    },
  },
];

// ---------------------------------------------------------------------------
// PNG check: decode the written screenshot and measure how much it varies.
// A dead WebGL context leaves a flat frame behind the HUD.
// ---------------------------------------------------------------------------

function pngStats(buf) {
  let o = 8;
  let w = 0, h = 0, depth = 0, ctype = 0;
  const idat = [];
  while (o < buf.length) {
    const len = buf.readUInt32BE(o);
    const type = buf.toString('latin1', o + 4, o + 8);
    const data = buf.subarray(o + 8, o + 8 + len);
    if (type === 'IHDR') {
      w = data.readUInt32BE(0);
      h = data.readUInt32BE(4);
      depth = data[8];
      ctype = data[9];
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    o += 12 + len;
  }
  if (depth !== 8 || (ctype !== 2 && ctype !== 6)) return { w, h, std: NaN };
  const bpp = ctype === 6 ? 4 : 3;
  const stride = w * bpp;
  const raw = inflateSync(Buffer.concat(idat));
  const px = Buffer.alloc(stride * h);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    const src = y * (stride + 1) + 1;
    const row = y * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? px[row + x - bpp] : 0;
      const b = y > 0 ? px[row - stride + x] : 0;
      const c = x >= bpp && y > 0 ? px[row - stride + x - bpp] : 0;
      let v = raw[src + x];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      px[row + x] = v & 255;
    }
  }
  let n = 0, sum = 0, sum2 = 0;
  for (let gy = 1; gy < 48; gy++) {
    for (let gx = 1; gx < 24; gx++) {
      const i = Math.floor((gy / 48) * h) * stride + Math.floor((gx / 24) * w) * bpp;
      const l = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
      n++;
      sum += l;
      sum2 += l * l;
    }
  }
  const mean = sum / n;
  return { w, h, std: Math.sqrt(Math.max(0, sum2 / n - mean * mean)) };
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

const GL_ARGS = {
  gpu: ['--enable-gpu', '--ignore-gpu-blocklist'],
  swiftshader: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
};

function parseArgs(argv) {
  const out = {
    scenes: null,
    viewports: ['iphone69', 'se'],
    out: 'docs/shots/latest',
    lang: 'es',
    seed: 7,
    gl: 'gpu',
    list: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      if (i + 1 >= argv.length) throw new Error(`${a} needs a value`);
      return argv[++i];
    };
    if (a === '--scenes') out.scenes = next().split(',').filter(Boolean);
    else if (a === '--viewports') out.viewports = next().split(',').filter(Boolean);
    else if (a === '--out') out.out = next();
    else if (a === '--lang') out.lang = next();
    else if (a === '--seed') out.seed = Number(next());
    else if (a === '--gl') out.gl = next();
    else if (a === '--list') out.list = true;
    else throw new Error(`unknown argument ${a}`);
  }
  if (!GL_ARGS[out.gl]) throw new Error(`--gl must be one of ${Object.keys(GL_ARGS).join(', ')}`);
  return out;
}

// Installed before any game script: rAF never fires (only __ecc.tick moves
// the sim), Math.random is a seeded mulberry32, the language is chosen, and
// every AudioContext is held suspended. The audio engine draws from
// Math.random on its own clock (horns, fills); a running context would make
// traffic depend on wall time, and the shots are silent anyway.
function bootScript(seed, lang) {
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
  const RealAudioContext = window.AudioContext;
  window.AudioContext = class extends RealAudioContext {
    constructor(...args) {
      super(...args);
      void super.suspend();
    }
    resume() {
      return Promise.resolve();
    }
  };
  try {
    // Every scene starts as a first launch that already knows the moves (so
    // no coach chip sits in the shot), unless it reloaded itself with seeded
    // storage (s.seed), which marks the reload in sessionStorage and keeps
    // what the first load wrote. A coach scene (coach: <learned bits>, as
    // ?coach=n) names what is already known: 1 steer, 2 contra vía, 4 the
    // trick, 8 the gas.
    if (sessionStorage.getItem('__shotKeep')) {
      sessionStorage.removeItem('__shotKeep');
    } else {
      localStorage.clear();
      if (lang === 'en') localStorage.setItem('ecc.v1.lang', 'en');
      const coach = /[?&]coach=(\d+)/.exec(location.search);
      localStorage.setItem('ecc.v1.learned', coach ? coach[1] : '15');
    }
  } catch {
    // fine
  }
}

// Render once and read the canvas back in the same task (before the
// compositor clears the drawing buffer), so a blank WebGL context is caught
// at boot with a clear message instead of as a gallery of empty frames.
async function glCheck(page) {
  return page.evaluate(() => {
    window.__ecc.tick(1 / 60);
    const src = document.getElementById('game');
    const c = document.createElement('canvas');
    c.width = 24;
    c.height = 48;
    const g = c.getContext('2d');
    g.drawImage(src, 0, 0, 24, 48);
    const d = g.getImageData(0, 0, 24, 48).data;
    const colors = new Set();
    for (let i = 0; i < d.length; i += 4) colors.add((d[i] >> 4) * 256 + (d[i + 1] >> 4) * 16 + (d[i + 2] >> 4));
    const gl = document.createElement('canvas').getContext('webgl2');
    const dbg = gl?.getExtension('WEBGL_debug_renderer_info');
    return { colors: colors.size, renderer: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : 'unknown' };
  });
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.list) {
    for (const sc of SCENES) console.log(`${sc.id.padEnd(16)} ${sc.what}${sc.only ? ` [${sc.only.join(', ')}]` : ''}`);
    console.log(`\nviewports: ${Object.keys(VIEWPORTS).join(', ')}, or WxH@scale`);
    return 0;
  }
  const scenes = opts.scenes
    ? opts.scenes.map((id) => {
        const sc = SCENES.find((x) => x.id === id);
        if (!sc) throw new Error(`unknown scene "${id}" (see --list)`);
        return sc;
      })
    : SCENES;
  const viewports = opts.viewports.map(parseViewport);
  const outDir = resolve(ROOT, opts.out);
  mkdirSync(outDir, { recursive: true });

  const server = await createServer({
    root: ROOT,
    logLevel: 'warn',
    clearScreen: false,
    // node_modules may be a symlink (a worktree sharing the main
    // checkout's install); its real path must be servable for the font.
    server: {
      port: 5199,
      strictPort: false,
      hmr: false,
      fs: { allow: [ROOT, realpathSync(resolve(ROOT, 'node_modules'))] },
    },
  });
  let browser;
  let failures = 0;
  let renderer = '';
  try {
    await server.listen();
    const url = server.resolvedUrls.local[0];
    browser = await puppeteer.launch({
      executablePath: CHROME,
      headless: true,
      timeout: LOAD_MS, // a cold Chrome on macOS can take 20 s+ to open DevTools
      protocolTimeout: 600000, // long rides (El Campo) are one evaluate each
      args: [
        ...GL_ARGS[opts.gl],
        '--hide-scrollbars',
        '--mute-audio',
      ],
    });
    console.log(`server ${url}  chrome ${await browser.version()}  out ${outDir}`);

    // Warm-up load: lets Vite finish its first dependency pass so no scene
    // gets caught by an optimizer reload.
    {
      const ctx = await browser.createBrowserContext();
      const page = await ctx.newPage();
      await page.goto(url, { waitUntil: 'load', timeout: LOAD_MS });
      await page.waitForFunction(() => window.__ecc !== undefined, { timeout: LOAD_MS });
      await ctx.close();
    }

    // One page per viewport, reloaded for every scene: a fresh document (the
    // boot script wipes localStorage) without paying for a cold context and
    // an empty module cache each time.
    for (const vp of viewports) {
      const ctx = await browser.createBrowserContext();
      const page = await ctx.newPage();
      let noise = [];
      page.on('console', (m) => {
        if (m.type() === 'error' || m.type() === 'warn') noise.push(`console.${m.type()}: ${m.text()}`);
      });
      page.on('pageerror', (e) => {
        noise.push(`pageerror: ${e.message}`);
        failures++;
      });
      page.on('requestfailed', (r) => noise.push(`requestfailed: ${r.url()} ${r.failure()?.errorText ?? ''}`));
      await page.setViewport(vp);
      await page.evaluateOnNewDocument(bootScript, opts.seed, opts.lang);

      for (const sc of scenes) {
        if (sc.only && !sc.only.includes(vp.name)) continue;
        const tag = `${sc.id}-${vp.name}`;
        const t0 = Date.now();
        noise = [];
        try {
          // Coach chips show on a first launch; scenes that are not about
          // them start with every move learned (see bootScript).
          await page.goto(sc.coach === undefined ? url : `${url}?coach=${sc.coach}`, { waitUntil: 'load', timeout: LOAD_MS });
          await page.waitForFunction(() => window.__ecc !== undefined, { timeout: LOAD_MS });
          await page.evaluate(() => document.fonts.ready.then(() => undefined));
          const gl = await glCheck(page);
          if (gl.colors < 4) {
            throw new Error(`WebGL canvas is blank (${gl.colors} colors, ${gl.renderer}); try --gl swiftshader`);
          }
          if (!renderer) {
            renderer = gl.renderer;
            console.log(`webgl ${renderer}`);
          }

          // A fresh document starts with every test flag off; say so anyway,
          // so no scene inherits a flag from the one before it.
          await page.evaluate(() => window.__ecc.god(false));
          const s = helpers(page, vp);
          await sc.run(s, vp);

          // Freeze the overlay. Finite animations (popups, cards) stop where
          // real time left them, or jump to their end for 'finish'. Loops
          // (the pulsing prompt and pill, the vignette, the speed lines) are
          // posed at mid-cycle, their peak, so a frame never depends on the
          // wall-clock phase a loop happened to be in. The announcement lane
          // runs on the HUD's clock, which __ecc.tick advances, so a long
          // ride's mandao cards are long gone by the capture.
          if (sc.settle !== 'finish') await sleep(sc.settle);
          await page.evaluate(
            (finish) => {
              for (const a of document.getAnimations()) {
                const t = a.effect?.getComputedTiming();
                if (t?.endTime === Infinity) {
                  a.pause();
                  a.currentTime = Number(t.duration) * 0.5;
                } else if (finish) a.finish();
                else a.pause();
              }
            },
            sc.settle === 'finish',
          );
          const probe = await page.evaluate(() => {
            const e = window.__ecc;
            return `state=${e.state()} tramo=${e.tramo()} run=${e.runDist()}m x=${e.x().toFixed(2)} v=${e.effSpeed()} combo=${e.combo()} cv=${e.cv()} wheelie=${e.wheelie()} cars=${e.cars()} audio=${e.audio().ctx}`;
          });
          const file = resolve(outDir, `${tag}.png`);
          await page.screenshot({ path: file, type: 'png', captureBeyondViewport: false });
          const st = pngStats(readFileSync(file));
          const flat = st.std < 6;
          if (flat) failures++;
          console.log(
            `${flat ? 'FLAT' : 'ok  '} ${tag.padEnd(26)} ${st.w}x${st.h} std=${st.std.toFixed(1)} ${((Date.now() - t0) / 1000).toFixed(1)}s  ${probe}`,
          );
        } catch (err) {
          failures++;
          console.log(`FAIL ${tag}: ${err.message}`);
        } finally {
          for (const line of noise) console.log(`     ${tag} ${line}`);
        }
      }
      await ctx.close();
    }
  } finally {
    await browser?.close();
    await server.close();
  }
  if (failures) console.log(`${failures} problem(s)`);
  return failures ? 1 : 0;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
