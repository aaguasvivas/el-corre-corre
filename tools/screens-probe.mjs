// Screen probes for the out-of-run screens: the title (ride picker, paints,
// mandao sheet), the game-over card, the pause screen and the share card.
// Same boot as tools/shots.mjs (rAF frozen, Math.random seeded, audio held
// suspended); everything is driven through window.__ecc, real touch taps
// (page.touchscreen, so the browser's own compatibility mouse events and
// click follow) and computed styles. Prints one PASS or FAIL line per check.
//
//   sh tools/heavy.sh node tools/screens-probe.mjs              # every probe
//   sh tools/heavy.sh node tools/screens-probe.mjs layout share # a subset
//   SHARE_OUT=docs/shots/e1 sh tools/heavy.sh node tools/screens-probe.mjs share
//
// Probes: layout, flow, buy, card, ads, motion, share. Exit code 1 on any failure.

import { createServer } from 'vite';
import puppeteer from 'puppeteer-core';
import { mkdirSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CHROME =
  process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const SE = { width: 375, height: 667, deviceScaleFactor: 2, isMobile: true, hasTouch: true };

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
  // A rejected share promise must fail the run, not vanish.
  window.addEventListener('unhandledrejection', (e) => console.error(`unhandled rejection: ${e.reason?.stack ?? e.reason}`));
  try {
    if (sessionStorage.getItem('__keep')) sessionStorage.removeItem('__keep');
    else localStorage.clear();
  } catch {
    // fine
  }
  // Layout audit of one screen, run in the page. root: the screen element.
  window.__audit = (rootSel, opts = {}) => {
    const W = innerWidth;
    const H = innerHeight;
    const root = document.querySelector(rootSel);
    const out = { targets: [], offscreen: [], clipped: [], overlaps: [], bands: {} };
    const visible = (el) => {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    };
    const all = [...root.querySelectorAll('*')].filter((el) => {
      for (let p = el; p && p !== root; p = p.parentElement) if (!visible(p)) return false;
      return true;
    });
    const name = (el) => `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${el.classList.length ? '.' + [...el.classList].join('.') : ''}`;
    for (const el of all) {
      const r = el.getBoundingClientRect();
      if (el.matches('button, [role=tab]')) {
        const min = opts.min?.[el.id] ?? 44;
        if (r.width < 44 - 0.5 || r.height < min - 0.5) out.targets.push(`${name(el)} ${r.width.toFixed(0)}x${r.height.toFixed(0)} (need 44x${min})`);
      }
      if (el.closest('svg') && el.tagName.toLowerCase() !== 'svg') continue;
      const m = 4;
      if (r.left < m - 0.5 || r.top < m - 0.5 || r.right > W - m + 0.5 || r.bottom > H - m + 0.5) out.offscreen.push(`${name(el)} ${r.left.toFixed(0)},${r.top.toFixed(0)} ${r.right.toFixed(0)},${r.bottom.toFixed(0)}`);
      const cs = getComputedStyle(el);
      if (el.scrollWidth > el.clientWidth + 1 && cs.overflowX !== 'visible') out.clipped.push(`${name(el)} ${el.scrollWidth}>${el.clientWidth}`);
    }
    // Text leaves: an element with its own non-blank text node.
    const leaves = all.filter((el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()));
    // The text's own extent, clipped to the element's line boxes: a range
    // rect covers the font's full ascent and descent, which runs past a
    // tight line-height (the stacked logo, the big points) without any
    // glyph actually touching its neighbour.
    const rects = leaves.map((el) => {
      const range = document.createRange();
      range.selectNodeContents(el);
      const t = range.getBoundingClientRect();
      const b = el.getBoundingClientRect();
      const top = Math.max(t.top, b.top);
      const bottom = Math.min(t.bottom, b.bottom);
      return { el, r: { left: t.left, right: t.right, top, bottom } };
    });
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i];
        const b = rects[j];
        if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
        if (opts.allowOverlap && (a.el.matches(opts.allowOverlap) || b.el.matches(opts.allowOverlap))) continue;
        const ox = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left);
        const oy = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
        if (ox > 2 && oy > 2) out.overlaps.push(`${name(a.el)} "${a.el.textContent.trim().slice(0, 20)}" x ${name(b.el)} "${b.el.textContent.trim().slice(0, 20)}"`);
      }
    }
    // Text inside a card must stay inside the card's padding box.
    for (const { el, r } of rects) {
      const card = el.closest('.card, .md-card, .pause-card, .vdetail, .paints, .hint, .paint-state, .vtab, .btn-big, .btn-mid, .mandao-chip, .title-bank');
      if (!card || card === el) continue;
      const c = card.getBoundingClientRect();
      if (r.left < c.left - 0.5 || r.right > c.right + 0.5 || r.top < c.top - 0.5 || r.bottom > c.bottom + 0.5) out.clipped.push(`${name(el)} spills out of ${name(card)}`);
    }
    const ids = {};
    for (const el of document.querySelectorAll('[id]')) ids[el.id] = (ids[el.id] ?? 0) + 1;
    out.dupIds = Object.entries(ids).filter(([, n]) => n > 1).map(([id, n]) => `${id} x${n}`);
    if (opts.bands) {
      for (const [k, sel] of Object.entries(opts.bands)) {
        const el = document.querySelector(sel);
        if (!el) continue;
        const r = el.getBoundingClientRect();
        out.bands[k] = { top: +(r.top / H).toFixed(3), bottom: +(r.bottom / H).toFixed(3) };
      }
    }
    return out;
  };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function boot(page, url, storage) {
  if (storage) {
    await page.evaluate((e) => {
      localStorage.clear();
      for (const [k, v] of Object.entries(e)) localStorage.setItem(k, v);
      sessionStorage.setItem('__keep', '1');
    }, storage);
    await page.reload({ waitUntil: 'load', timeout: 300000 });
  } else {
    await page.goto(url, { waitUntil: 'load', timeout: 300000 });
  }
  // polling on a timer: the default polls on requestAnimationFrame, which
  // the boot script freezes, so a predicate that is false at first never
  // gets asked again
  await page.waitForFunction(() => window.__ecc !== undefined, { timeout: 300000, polling: 100 });
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  await page.evaluate(() => window.__ecc.tick(1 / 60));
}

// A real touch tap at an element's centre (or at a point).
async function tapEl(page, sel) {
  const p = await page.evaluate((s) => {
    const r = document.querySelector(s).getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, sel);
  await page.touchscreen.tap(p.x, p.y);
}

// Ride, then crash into a car, then tick until the card shows.
async function toGameOver(page, meters = 120) {
  await page.evaluate(async (m) => {
    const e = window.__ecc;
    e.start();
    e.god(true);
    for (let g = 0; g < 200 && e.runDist() < m; g++) e.tick(0.5);
    e.god(false);
    e.clearTraffic();
    for (let i = 0; i < 6 && e.state() === 'playing'; i++) {
      e.spawnVehicle('sedan', 1, 7, 1, e.x() + 0.4);
      for (let k = 0; k < 150 && e.state() === 'playing'; k++) e.tick(1 / 60);
      if (e.state() === 'playing') e.tick(2.2); // a Bendición took it; wait out the grace
    }
    for (let k = 0; k < 120 && e.state() !== 'gameover'; k++) e.tick(1 / 60);
  }, meters);
}

const check = (checks, name, ok, detail = '') => checks.push([name, !!ok, detail]);

function auditChecks(checks, tag, a) {
  check(checks, `${tag}: no duplicate ids`, a.dupIds.length === 0, a.dupIds.join(', '));
  check(checks, `${tag}: every target at least 44 pt`, a.targets.length === 0, a.targets.join('; '));
  check(checks, `${tag}: nothing within 4 px of a screen edge`, a.offscreen.length === 0, a.offscreen.slice(0, 6).join('; '));
  check(checks, `${tag}: no clipped or spilling text`, a.clipped.length === 0, a.clipped.slice(0, 6).join('; '));
  check(checks, `${tag}: no overlapping text`, a.overlaps.length === 0, a.overlaps.slice(0, 6).join('; '));
}

const PROBES = {
  // Layout at the SE, the 6.9-inch phone with its real safe areas, and a
  // landscape phone: targets, edges, clipped text, overlaps, and the bands
  // the rider needs.
  layout: async (page, url) => {
    const checks = [];
    const info = [];
    const sizes = [
      ['se', SE, null],
      ['6.9in', { width: 440, height: 956, deviceScaleFactor: 1, isMobile: true, hasTouch: true }, { sat: 62, sab: 34 }],
      ['landscape', { width: 667, height: 375, deviceScaleFactor: 1, isMobile: true, hasTouch: true }, null],
      ['landscape-notch', { width: 844, height: 390, deviceScaleFactor: 1, isMobile: true, hasTouch: true }, { sal: 47, sar: 47, sab: 21 }],
    ];
    for (const [tag, vp, insets] of sizes) {
      await page.setViewport(vp);
      for (const lang of ['es', 'en']) {
        await boot(page, url, {
          'ecc.v1.lang': lang,
          'ecc.v1.platanosLifetime': '1240',
          'ecc.v1.record.motor': '148210',
          'ecc.v1.recordDist.motor': '1870',
          'ecc.v1.pinturas.motor': '1',
          'ecc.v1.pintura.motor': '1',
        });
        if (insets) {
          await page.evaluate((i) => {
            for (const [k, v] of Object.entries(i)) document.documentElement.style.setProperty(`--${k}`, `${v}px`);
          }, insets);
        }
        const T = `${tag} ${lang}`;
        await page.evaluate(() => window.__ecc.selectVehicle('civic'));
        await page.evaluate(() => window.__ecc.selectVehicle('motor'));
        // The two CORRE lines lean (skew and rotate), so their axis-aligned
        // bounds cross by a few px while the glyphs stay apart.
        const title = await page.evaluate(() =>
          window.__audit('#title', { allowOverlap: '.logo-line', bands: { top: '#vpick', paints: '#t-paints', logo: '.t-top' } }),
        );
        auditChecks(checks, `${T} title`, title);
        if (vp.height > vp.width) {
          check(checks, `${T} title: the picker ends above the rider (53%)`, title.bands.top.bottom <= 0.53, `picker bottom ${title.bands.top.bottom}`);
          check(checks, `${T} title: the paints start below the rider (73%)`, title.bands.paints.top >= 0.73, `paints top ${title.bands.paints.top}`);
        }
        await tapEl(page, '#mandao-chip');
        await sleep(300);
        const sheet = await page.evaluate(() => window.__audit('#mandao-sheet'));
        auditChecks(checks, `${T} sheet`, sheet);
        await page.evaluate(() => document.getElementById('mandao-sheet').classList.add('hidden'));

        await page.evaluate(() => {
          window.__ecc.start();
          window.__ecc.tick(2);
          window.__ecc.pause();
        });
        await sleep(300);
        const pause = await page.evaluate(() => window.__audit('#pause', { min: { 'btn-resume': 64, 'btn-pause-menu': 48 } }));
        auditChecks(checks, `${T} pause`, pause);
        await page.evaluate(() => window.__ecc.resume());
        await page.evaluate(() => window.__ecc.tick(2));
        await toGameOver(page, 150);
        await sleep(1400);
        const go = await page.evaluate(() =>
          window.__audit('#gameover', {
            min: { 'btn-again': 64, 'btn-menu': 48, 'btn-share': 48 },
            allowOverlap: '.md-stamp, .go-stamp',
            bands: { card: '.go-card', actions: '.go-actions', again: '#btn-again' },
          }),
        );
        auditChecks(checks, `${T} game over`, go);
        const again = await page.evaluate(() => {
          const r = document.getElementById('btn-again').getBoundingClientRect();
          return { w: r.width / innerWidth, h: r.height, cy: (r.top + r.height / 2) / innerHeight };
        });
        if (vp.height > vp.width) {
          check(checks, `${T} game over: the card ends above the tumble (55%)`, go.bands.card.bottom <= 0.55, `card bottom ${go.bands.card.bottom}`);
          check(checks, `${T} game over: the buttons start below it (79%)`, go.bands.actions.top >= 0.79, `actions top ${go.bands.actions.top}`);
          check(checks, `${T} game over: OTRA VEZ in the thumb zone, 70%+ wide`, again.w >= 0.7 && again.cy >= 0.8, `width ${(again.w * 100).toFixed(0)}%, centre at ${(again.cy * 100).toFixed(0)}%`);
        }
        info.push(`${T}: title ${JSON.stringify(title.bands)} card ${JSON.stringify(go.bands)}`);
      }
    }
    await page.setViewport(SE);
    return { checks, info };
  },

  // Touch flows on the title: the sheet opened by a real tap stays open,
  // the tabs switch rides, a locked paint previews then refuses, a tap that
  // misses a control never starts a run, a tap on the road does.
  flow: async (page, url) => {
    const checks = [];
    await boot(page, url);
    await tapEl(page, '#mandao-chip');
    await sleep(450);
    const open = await page.evaluate(() => !document.getElementById('mandao-sheet').classList.contains('hidden'));
    check(checks, 'a touch tap opens the mandao sheet and it stays open', open);
    await tapEl(page, '#md-close');
    await sleep(100);
    const closed = await page.evaluate(() => document.getElementById('mandao-sheet').classList.contains('hidden'));
    check(checks, 'the close button closes it', closed);
    check(checks, 'neither started a run', (await page.evaluate(() => window.__ecc.state())) === 'title');

    await tapEl(page, '.vtab[data-v="pasola"]');
    const ride = await page.evaluate(() => ({
      v: window.__ecc.vehicle(),
      sel: document.querySelector('.vtab.sel')?.dataset.v,
      aria: document.querySelector('.vtab[data-v="pasola"]').getAttribute('aria-selected'),
      pips: [...document.querySelectorAll('[data-pips="man"] i.on')].length,
      paints: document.querySelectorAll('#paints .paint').length,
    }));
    check(checks, 'a tab selects its ride', ride.v === 'pasola' && ride.sel === 'pasola' && ride.aria === 'true', JSON.stringify(ride));
    check(checks, 'the detail panel follows (La Pasola handles 5/5)', ride.pips === 5, `pips ${ride.pips}`);

    await tapEl(page, '.paint[data-i="1"]');
    const prev = await page.evaluate(() => ({
      preview: document.querySelector('.paint.preview')?.dataset.i,
      state: document.getElementById('paint-state').className,
      text: document.getElementById('paint-state').textContent,
    }));
    check(checks, 'a locked swatch previews on the first tap', prev.preview === '1' && prev.state.includes('poor'), JSON.stringify(prev));
    await tapEl(page, '.paint[data-i="1"]');
    const deny = await page.evaluate(() => ({
      deny: document.getElementById('paint-state').classList.contains('deny'),
      locked: document.querySelector('.paint[data-i="1"]').classList.contains('locked'),
      bank: window.__ecc.bank(),
      state: window.__ecc.state(),
    }));
    check(checks, 'a second tap without the plátanos shakes the reason and buys nothing', deny.deny && deny.locked && deny.bank === 0 && deny.state === 'title', JSON.stringify(deny));

    // near misses: the gap between two tabs, the gap between two swatches
    const gaps = await page.evaluate(() => {
      const a = document.querySelector('.vtab[data-v="pasola"]').getBoundingClientRect();
      const b = document.querySelector('.vtab[data-v="motor"]').getBoundingClientRect();
      const p = document.querySelector('.paint[data-i="2"]').getBoundingClientRect();
      const q = document.querySelector('.paint[data-i="3"]').getBoundingClientRect();
      return [{ x: (a.right + b.left) / 2, y: a.top + a.height / 2 }, { x: (p.right + q.left) / 2, y: p.top + p.height / 2 }];
    });
    for (const g of gaps) await page.touchscreen.tap(g.x, g.y);
    check(checks, 'a tap between controls never starts a run', (await page.evaluate(() => window.__ecc.state())) === 'title');
    await page.touchscreen.tap(187, 450);
    check(checks, 'a tap on the road starts the run', (await page.evaluate(() => window.__ecc.state())) === 'playing');
    return { checks };
  },

  // A returning player buys a paint: preview, then buy, then it is worn.
  buy: async (page, url) => {
    const checks = [];
    await page.goto(url, { waitUntil: 'load' });
    await boot(page, url, { 'ecc.v1.platanosLifetime': '1240' });
    const hint = await page.evaluate(() => ({
      text: document.getElementById('paint-state').textContent,
      gold: [...document.querySelectorAll('.paint.afford')].map((b) => b.dataset.i).join(','),
    }));
    check(checks, 'the wallet covering a paint says so and golds its price', hint.text.startsWith('¡Ya te alcanza') && hint.gold === '1,2,3', JSON.stringify(hint));
    await tapEl(page, '.paint[data-i="2"]');
    const act = await page.evaluate(() => document.getElementById('paint-state').className);
    check(checks, 'an affordable locked paint offers the buy', act.includes('act'), act);
    await tapEl(page, '.paint[data-i="2"]');
    const r = await page.evaluate(() => ({
      bank: window.__ecc.bank(),
      shown: document.getElementById('bank-n').textContent,
      equipped: document.querySelector('.paint.equipped')?.dataset.i,
      locked: document.querySelector('.paint[data-i="2"]').classList.contains('locked'),
      text: document.getElementById('paint-state').textContent,
    }));
    check(checks, 'the second tap buys and wears it', r.bank === 440 && r.equipped === '2' && !r.locked, JSON.stringify(r));
    check(checks, 'the wallet shows grouped digits', r.shown === '440', r.shown);
    return { checks };
  },

  // The card: the count-up lands on the grouped total while OTRA VEZ is
  // already live, COMPARTIR is sea-deep with white ink, MENU glows when a
  // paint is affordable, and a real tap on OTRA VEZ restarts.
  card: async (page, url) => {
    const checks = [];
    await page.goto(url, { waitUntil: 'load' });
    await boot(page, url, { 'ecc.v1.platanosLifetime': '600', 'ecc.v1.record.motor': '1000000' });
    await toGameOver(page, 150);
    const t0 = await page.evaluate(() => ({ text: document.getElementById('go-points').textContent, pts: window.__ecc.lastRun().points }));
    await sleep(750);
    const t1 = await page.evaluate(() => document.getElementById('go-points').textContent);
    const want = t0.pts.toLocaleString('es-DO');
    check(checks, 'the points count up and land on the grouped total', t0.text !== want && t1 === want, `at the card ${t0.text}, 750 ms later ${t1}, total ${want}`);
    const st = await page.evaluate(() => {
      const s = getComputedStyle(document.getElementById('btn-share'));
      const m = document.getElementById('btn-menu');
      return { bg: s.backgroundColor, color: s.color, glow: m.classList.contains('glow'), best: document.getElementById('go-best').textContent };
    });
    check(checks, 'COMPARTIR is white on sea-deep (5.4:1)', st.bg === 'rgb(14, 116, 144)' && st.color === 'rgb(255, 255, 255)', `${st.color} on ${st.bg}`);
    check(checks, 'MENU glows while a pintura is affordable', st.glow);
    check(checks, 'the record line is grouped', st.best.includes('1,000,000'), st.best);
    await sleep(100);
    await tapEl(page, '#btn-again');
    check(checks, 'a real tap on OTRA VEZ restarts', (await page.evaluate(() => window.__ecc.state())) === 'playing');
    return { checks };
  },

  // Ads and Remove Ads, with the ?ads=sim stand-ins (src/simAds.ts): the
  // rewarded offer on the card never moves OTRA VEZ or MENÚ and keeps the
  // card above the tumble; a tap before it arms is a tap on the card; it
  // pays once per run; the banner keeps CONFIG.bannerGapPx (24) clear of
  // every control on PAUSA and the mandao sheet and leaves with the screen;
  // Remove Ads takes it down at once; the ad privacy link shows on PAUSA
  // only where Google asks for it, and opens the privacy options form.
  ads: async (page, url) => {
    const checks = [];
    const info = [];
    const simUrl = `${url}?ads=sim`;
    const GAP = 24;
    // Every visible button inside root ends at least GAP above the banner.
    const gapCheck = (root) =>
      page.evaluate((sel) => {
        const b = document.getElementById('sim-banner');
        if (!b || b.style.display === 'none') return { banner: false };
        const top = b.getBoundingClientRect().top;
        let worst = Infinity;
        let who = '';
        for (const el of document.querySelectorAll(`${sel} button`)) {
          const r = el.getBoundingClientRect();
          const cs = getComputedStyle(el);
          if (r.width === 0 || cs.visibility === 'hidden' || cs.display === 'none') continue;
          if (top - r.bottom < worst) {
            worst = top - r.bottom;
            who = el.id || el.className;
          }
        }
        return { banner: true, gap: Math.round(worst), who, top: Math.round(top) };
      }, root);
    const adsReady = async () => {
      await page.evaluate(() => window.__ecc.tick(1.3));
      await page.waitForFunction(() => window.__ecc.ads().ready, { timeout: 10000, polling: 50 });
    };
    const offerCard = async (load) => {
      await page.evaluate((l) => {
        window.__eccSim.rewardedLoad = l;
      }, load);
      await page.evaluate(async () => {
        const e = window.__ecc;
        e.start();
        e.tick(1);
        e.clearTraffic();
        const x = e.x();
        for (let i = 0; i < 8; i++) e.spawnPickup('platano', x, 8 + i * 2.2);
        e.tick(3);
      });
      await sleep(120); // the stand-in video loads on a real timer
      await toGameOver(page, 150);
    };
    const rects = () =>
      page.evaluate(() => {
        const r = (id) => {
          const b = document.getElementById(id).getBoundingClientRect();
          return [Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.height)].join(',');
        };
        const card = document.querySelector('.go-card').getBoundingClientRect();
        const rw = document.getElementById('btn-reward').getBoundingClientRect();
        return { again: r('btn-again'), menu: r('btn-menu'), share: r('btn-share'), cardBottom: card.bottom / innerHeight, rw: { w: rw.width, h: rw.height, bottom: rw.bottom }, againTop: document.getElementById('btn-again').getBoundingClientRect().top };
      });

    const sizes = [
      ['se', SE, null],
      ['6.9in', { width: 440, height: 956, deviceScaleFactor: 1, isMobile: true, hasTouch: true }, { sat: 62, sab: 34 }],
    ];
    for (const [tag, vp, insets] of sizes) {
      await page.setViewport(vp);
      for (const lang of ['es', 'en']) {
        const T = `${tag} ${lang}`;
        await page.goto(simUrl, { waitUntil: 'load' });
        await boot(page, simUrl, { 'ecc.v1.lang': lang, 'ecc.v1.platanosLifetime': '1240', 'ecc.v1.record.motor': '1000000' });
        if (insets) {
          await page.evaluate((i) => {
            for (const [k, v] of Object.entries(i)) document.documentElement.style.setProperty(`--${k}`, `${v}px`);
          }, insets);
        }
        await adsReady();

        // The title with its Remove Ads chip.
        const title = await page.evaluate(() => window.__audit('#title', { allowOverlap: '.logo-line', bands: { paints: '#t-paints' } }));
        auditChecks(checks, `${T} title with the Remove Ads chip`, title);
        const chip = await page.evaluate(() => {
          const r = document.getElementById('noads-chip').getBoundingClientRect();
          return { w: r.width, h: r.height, shown: r.width > 0 };
        });
        check(checks, `${T} title: the Remove Ads chip shows, 44 pt`, chip.shown && chip.w >= 44 && chip.h >= 44, JSON.stringify(chip));

        // The mandao sheet: the banner comes, the sheet keeps clear of it.
        await tapEl(page, '#mandao-chip');
        await page.waitForFunction(() => window.__ecc.ads().banner.height > 0, { timeout: 5000, polling: 50 }).catch(() => {});
        await sleep(250);
        const sheetGap = await gapCheck('#mandao-sheet');
        check(checks, `${T} mandao sheet: a banner, and every control ${GAP}+ pt above it`, sheetGap.banner && sheetGap.gap >= GAP, JSON.stringify(sheetGap));
        const cardGap = await page.evaluate(() => {
          const b = document.getElementById('sim-banner').getBoundingClientRect().top;
          return Math.round(b - document.querySelector('.md-card').getBoundingClientRect().bottom);
        });
        check(checks, `${T} mandao sheet: the card ends ${GAP}+ pt above the banner`, cardGap >= GAP, `${cardGap} pt`);
        auditChecks(checks, `${T} mandao sheet with a banner`, await page.evaluate(() => window.__audit('#mandao-sheet')));
        await tapEl(page, '#md-close');
        await sleep(100);
        check(checks, `${T} closing the sheet takes the banner away`, (await page.evaluate(() => window.__ecc.ads().banner.height)) === 0 && (await page.evaluate(() => document.getElementById('sim-banner').style.display)) === 'none');

        // PAUSA with the banner.
        await page.evaluate(() => {
          window.__ecc.start();
          window.__ecc.tick(2);
          window.__ecc.pause();
        });
        await page.waitForFunction(() => window.__ecc.ads().banner.height > 0, { timeout: 5000, polling: 50 }).catch(() => {});
        await sleep(300);
        const pauseGap = await gapCheck('#pause');
        check(checks, `${T} pause: a banner, and every control ${GAP}+ pt above it`, pauseGap.banner && pauseGap.gap >= GAP, JSON.stringify(pauseGap));
        const priv = await page.evaluate(() => {
          const r = document.getElementById('btn-privacy').getBoundingClientRect();
          const b = document.getElementById('sim-banner').getBoundingClientRect().top;
          return { h: r.height, bottom: Math.round(r.bottom), banner: Math.round(b) };
        });
        check(checks, `${T} pause: the privacy link stays visible above the banner`, priv.h >= 44 && priv.bottom <= priv.banner, JSON.stringify(priv));
        auditChecks(checks, `${T} pause with a banner`, await page.evaluate(() => window.__audit('#pause', { min: { 'btn-resume': 64, 'btn-pause-menu': 48 } })));
        // The Remove Ads sheet over PAUSA: the banner steps aside.
        await tapEl(page, '#btn-noads');
        await page.waitForFunction(() => window.__ecc.store().priceState === 'ready', { timeout: 5000, polling: 50 }).catch(() => {});
        await sleep(200);
        const st = await page.evaluate(() => ({ open: window.__ecc.store().open, banner: window.__ecc.ads().banner.height, buy: document.getElementById('st-buy').textContent }));
        check(checks, `${T} Remove Ads sheet over PAUSA: open, priced, the banner hidden`, st.open && st.banner === 0 && /1\.99/.test(st.buy), JSON.stringify(st));
        auditChecks(checks, `${T} Remove Ads sheet`, await page.evaluate(() => window.__audit('#store-sheet')));
        await tapEl(page, '#st-close');
        await sleep(150);
        await page.evaluate(() => window.__ecc.resume());
        await page.evaluate(() => window.__ecc.tick(0.1));
        const afterResume = await page.evaluate(() => ({ h: window.__ecc.ads().banner.height, d: document.getElementById('sim-banner').style.display, state: window.__ecc.state() }));
        check(checks, `${T} SEGUIR: the banner leaves with the pause screen (countdown and play are clear)`, afterResume.h === 0 && afterResume.d === 'none', JSON.stringify(afterResume));
        await page.evaluate(() => window.__ecc.tick(2));

        // The card with the offer, then the same card with the button taken
        // out: OTRA VEZ, MENÚ and COMPARTIR hold still. Measured after the
        // card's drop and the buttons' rise have finished.
        await page.evaluate(() => window.__ecc.menu());
        await offerCard('ok');
        await page.waitForFunction(() => window.__ecc.ads().offer, { timeout: 5000, polling: 50 }).catch(() => {});
        await sleep(600);
        const after = await rects();
        await page.evaluate(() => {
          document.getElementById('btn-reward').classList.add('hidden');
          document.querySelector('.go-plat').classList.remove('offer');
        });
        const before = await rects();
        await page.evaluate(() => {
          document.getElementById('btn-reward').classList.remove('hidden');
          document.querySelector('.go-plat').classList.add('offer');
        });
        check(checks, `${T} card: the offer moves neither OTRA VEZ nor MENÚ nor COMPARTIR`, before.again === after.again && before.menu === after.menu && before.share === after.share, `${JSON.stringify(before)} vs ${JSON.stringify(after)}`);
        check(checks, `${T} card: with the offer it still ends above the tumble (55%)`, after.cardBottom <= 0.55, `card bottom ${after.cardBottom.toFixed(3)}`);
        check(checks, `${T} card: the offer button is 44 pt, far above OTRA VEZ`, after.rw.w >= 44 && after.rw.h >= 44 && after.againTop - after.rw.bottom >= 120, JSON.stringify(after.rw));
        await sleep(1000); // armed: the audit sees the button
        auditChecks(checks, `${T} card with the offer`, await page.evaluate(() => window.__audit('#gameover', { min: { 'btn-again': 64, 'btn-menu': 48, 'btn-share': 48 }, allowOverlap: '.md-stamp, .go-stamp' })));
        // Before it arms, a tap on the button is a tap on the card: OTRA VEZ.
        await offerCard('ok');
        await page.waitForFunction(() => window.__ecc.ads().offer, { timeout: 5000, polling: 50 }).catch(() => {});
        await sleep(150);
        const early = await page.evaluate(() => {
          const r = document.getElementById('btn-reward').getBoundingClientRect();
          return { x: r.left + r.width / 2, y: r.top + r.height / 2, armed: document.getElementById('btn-reward').classList.contains('armed') };
        });
        await page.touchscreen.tap(early.x, early.y);
        const earlyTap = await page.evaluate(() => ({ state: window.__ecc.state(), hold: window.__ecc.ads().hold }));
        check(checks, `${T} card: a tap on the offer before it arms restarts instead (no video)`, !early.armed && earlyTap.state === 'playing' && !earlyTap.hold, JSON.stringify({ early, earlyTap }));

        // Armed: the video pays the run's plátanos once.
        await offerCard('ok');
        await page.waitForFunction(() => document.getElementById('btn-reward').classList.contains('armed'), { timeout: 5000, polling: 50 }).catch(() => {});
        const bank0 = await page.evaluate(() => ({ bank: window.__ecc.bank(), earned: window.__ecc.lastRun().platanosEarned }));
        await tapEl(page, '#btn-reward');
        await page.waitForFunction(() => window.__ecc.ads().paid && !window.__ecc.ads().hold, { timeout: 5000, polling: 50 }).catch(() => {});
        await sleep(900);
        const paid = await page.evaluate(() => ({ bank: window.__ecc.bank(), offer: window.__ecc.ads().offer, text: document.getElementById('gp-earned').textContent, done: document.getElementById('btn-reward').classList.contains('done'), state: window.__ecc.state() }));
        check(checks, `${T} the video doubles the run's plátanos into the bank`, paid.bank === bank0.bank + bank0.earned && bank0.earned >= 1, `${JSON.stringify(bank0)} -> ${paid.bank}`);
        check(checks, `${T} the card counts up and the offer turns into the paid check`, paid.done && paid.text.includes(String(2 * bank0.earned)) && paid.state === 'gameover', JSON.stringify(paid));
        await tapEl(page, '#btn-reward');
        await sleep(400);
        check(checks, `${T} once per run: a second tap pays nothing`, (await page.evaluate(() => window.__ecc.bank())) === paid.bank && !paid.offer);
        // Closed early: nothing paid, the offer comes back with the next video.
        await page.evaluate(() => {
          window.__eccSim.rewarded = 'dismiss';
        });
        await offerCard('ok');
        await page.waitForFunction(() => document.getElementById('btn-reward').classList.contains('armed'), { timeout: 5000, polling: 50 }).catch(() => {});
        const bank1 = await page.evaluate(() => window.__ecc.bank());
        await tapEl(page, '#btn-reward');
        await page.waitForFunction(() => !window.__ecc.ads().hold, { timeout: 5000, polling: 50 }).catch(() => {});
        await sleep(300);
        const dismissed = await page.evaluate(() => ({ bank: window.__ecc.bank(), offer: window.__ecc.ads().offer, paid: window.__ecc.ads().paid }));
        check(checks, `${T} a video closed early pays nothing and the offer comes back`, dismissed.bank === bank1 && !dismissed.paid && dismissed.offer, JSON.stringify(dismissed));
        // Offline: the next video cannot load, so the card offers nothing.
        await page.evaluate(() => {
          window.__eccSim.rewardedLoad = 'fail';
        });
        await tapEl(page, '#btn-reward');
        await page.waitForFunction(() => !window.__ecc.ads().hold, { timeout: 5000, polling: 50 }).catch(() => {});
        await sleep(300);
        const offline = await page.evaluate(() => ({ offer: window.__ecc.ads().offer, rewarded: window.__ecc.ads().rewarded, shown: getComputedStyle(document.getElementById('btn-reward')).display }));
        check(checks, `${T} card: no offer without a loaded video (offline)`, !offline.offer && offline.rewarded === 'idle' && offline.shown === 'none', JSON.stringify(offline));
        await page.evaluate(() => {
          window.__eccSim.rewardedLoad = 'ok';
        });
        await page.evaluate(() => {
          window.__eccSim.rewarded = 'reward';
        });

        // Remove Ads bought on PAUSA: the banner goes at once, the entries hide.
        await page.evaluate(() => {
          window.__ecc.start();
          window.__ecc.tick(1);
          window.__ecc.pause();
        });
        await page.waitForFunction(() => window.__ecc.ads().banner.height > 0, { timeout: 5000, polling: 50 }).catch(() => {});
        await tapEl(page, '#btn-noads');
        await page.waitForFunction(() => window.__ecc.store().priceState === 'ready', { timeout: 5000, polling: 50 }).catch(() => {});
        await tapEl(page, '#st-buy');
        await page.waitForFunction(() => window.__ecc.store().adFree, { timeout: 5000, polling: 50 }).catch(() => {});
        await sleep(150);
        await tapEl(page, '#st-close');
        await sleep(150);
        const free = await page.evaluate(() => ({
          adFree: window.__ecc.store().adFree,
          saved: localStorage.getItem('ecc.v1.adFree'),
          banner: window.__ecc.ads().banner,
          box: !!document.getElementById('sim-banner'),
          link: getComputedStyle(document.getElementById('btn-noads')).display,
        }));
        check(checks, `${T} Remove Ads: bought, saved, the banner removed for good, the entries hidden`, free.adFree && free.saved === '1' && free.banner.height === 0 && free.banner.state === 'none' && !free.box && free.link === 'none', JSON.stringify(free));
        check(checks, `${T} pause: no ad privacy link where Google does not ask for one`, (await page.evaluate(() => getComputedStyle(document.getElementById('btn-adprivacy')).display)) === 'none');

        // Where Google asks for a way back to the consent choices (an EEA
        // device that has chosen): "Privacidad de anuncios" / "Ad privacy"
        // sits with the other PAUSA links, clear of the banner, and opens
        // Google's privacy options form.
        const eeaUrl = `${simUrl}&adprivacy=1`;
        await page.goto(eeaUrl, { waitUntil: 'load' });
        await boot(page, eeaUrl, { 'ecc.v1.lang': lang, 'ecc.v1.record.motor': '1000000' });
        if (insets) {
          await page.evaluate((i) => {
            for (const [k, v] of Object.entries(i)) document.documentElement.style.setProperty(`--${k}`, `${v}px`);
          }, insets);
        }
        await adsReady();
        await page.evaluate(() => {
          window.__ecc.start();
          window.__ecc.tick(1);
          window.__ecc.pause();
        });
        await page.waitForFunction(() => window.__ecc.ads().banner.height > 0, { timeout: 5000, polling: 50 }).catch(() => {});
        await sleep(300);
        const ap = await page.evaluate(() => {
          const el = document.getElementById('btn-adprivacy');
          const r = el.getBoundingClientRect();
          const pr = document.getElementById('btn-privacy').getBoundingClientRect();
          return { shown: getComputedStyle(el).display !== 'none', text: el.textContent, w: Math.round(r.width), h: Math.round(r.height), left: Math.round(r.left), right: Math.round(r.right), vw: innerWidth, privacyShown: pr.height >= 44 };
        });
        const apText = lang === 'es' ? 'Privacidad de anuncios' : 'Ad privacy';
        check(checks, `${T} pause (consent options required): "${apText}" shows, 44 pt, inside the screen, next to Privacidad`, ap.shown && ap.text === apText && ap.h >= 44 && ap.w >= 44 && ap.left >= 0 && ap.right <= ap.vw && ap.privacyShown, JSON.stringify(ap));
        const apGap = await gapCheck('#pause');
        check(checks, `${T} pause with the ad privacy link: every control ${GAP}+ pt above the banner`, apGap.banner && apGap.gap >= GAP, JSON.stringify(apGap));
        auditChecks(checks, `${T} pause with the ad privacy link`, await page.evaluate(() => window.__audit('#pause', { min: { 'btn-resume': 64, 'btn-pause-menu': 48 } })));
        await tapEl(page, '#btn-adprivacy');
        await sleep(150);
        const apTap = await page.evaluate(() => ({ log: window.__eccSim.log.filter((l) => l === 'showPrivacyOptionsForm').length, state: window.__ecc.state() }));
        check(checks, `${T} the ad privacy link opens Google's privacy options form once, PAUSA stays`, apTap.log === 1 && apTap.state === 'paused', JSON.stringify(apTap));
        info.push(`${T}: card with offer ${JSON.stringify(after)}; pause gap ${JSON.stringify(pauseGap)}; sheet gap ${JSON.stringify(sheetGap)}; ad privacy ${JSON.stringify(ap)}`);
      }
    }
    await page.setViewport(SE);
    return { checks, info };
  },

  // Reduced motion: the card shows its final state at once.
  motion: async (page, url) => {
    const checks = [];
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    await boot(page, url);
    await toGameOver(page, 330);
    const r = await page.evaluate(() => ({
      text: document.getElementById('go-points').textContent,
      pts: window.__ecc.lastRun().points.toLocaleString('es-DO'),
      stamp: [...document.querySelectorAll('.md-stamp')].map((s) => getComputedStyle(s).animationName),
      card: getComputedStyle(document.querySelector('.go-card')).animationName,
      prompt: getComputedStyle(document.querySelector('.prompt')).animationName,
    }));
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }]);
    check(checks, 'the points show the total at once', r.text === r.pts, `${r.text} vs ${r.pts}`);
    check(checks, 'a stamp is there and does not slam', r.stamp.length > 0 && r.stamp.every((n) => n === 'none'), JSON.stringify(r.stamp));
    check(checks, 'the card and the prompt do not animate', r.card === 'none' && r.prompt === 'none', `${r.card} ${r.prompt}`);
    return { checks };
  },

  // The share card, drawn through the real COMPARTIR path with the share
  // sheet stubbed (ES and EN), plus the fallback art with no photo.
  share: async (page, url) => {
    const checks = [];
    const out = resolve(ROOT, process.env.SHARE_OUT ?? 'docs/shots/e1');
    mkdirSync(out, { recursive: true });
    for (const lang of ['es', 'en']) {
      await page.goto(url, { waitUntil: 'load' });
      await boot(page, url, { 'ecc.v1.lang': lang, 'ecc.v1.recordDist.motor': '200', 'ecc.v1.record.motor': '1000000' });
      await toGameOver(page, 260);
      await page.evaluate(() => {
        window.__shared = null;
        navigator.canShare = () => true;
        navigator.share = async (d) => {
          window.__shared = await new Promise((res) => {
            const fr = new FileReader();
            fr.onload = () => res({ name: d.files[0].name, text: d.text, url: fr.result });
            fr.readAsDataURL(d.files[0]);
          });
        };
      });
      await sleep(200);
      const at = await page.evaluate(() => window.__ecc.state());
      check(checks, `${lang}: the run ended on the card`, at === 'gameover', at);
      await page.evaluate(() => {
        window.__evlog = [];
        for (const t of ['pointerdown', 'pointerup', 'touchstart', 'touchend', 'mousedown', 'click']) {
          window.addEventListener(t, (e) => window.__evlog.push(`${t}:${e.target.id || e.target.className}`), { capture: true });
        }
      });
      await tapEl(page, '#btn-share');
      const got = await page
        .waitForFunction(() => window.__shared !== null, { timeout: 10000, polling: 100 })
        .then(() => true, () => false);
      const evlog = await page.evaluate(() => window.__evlog.join(' '));
      check(checks, `${lang}: a touch tap on COMPARTIR reaches the share sheet`, got, got ? '' : `events: ${evlog}`);
      if (!got) return { checks };
      const s = await page.evaluate(() => window.__shared);
      writeFileSync(resolve(out, `share-${lang}.png`), Buffer.from(s.url.split(',')[1], 'base64'));
      check(checks, `${lang}: COMPARTIR hands a PNG to the share sheet`, s.name.endsWith('.png'), s.name);
      check(checks, `${lang}: the share text groups its number`, /\d/.test(s.text), s.text);
      check(checks, `${lang}: still on the card after sharing`, (await page.evaluate(() => window.__ecc.state())) === 'gameover');
    }
    // The fallback art: a UI instance whose photo was never taken.
    const fb = await page.evaluate(async () => {
      const m = await import('/src/ui.ts');
      const noop = () => {};
      const ui = new m.UI(document.createElement('div'), new Proxy({}, { get: () => noop }));
      const r = { ...window.__ecc.lastRun(), isNewRecord: true, points: 123456 };
      return ui.drawShareCard(r).toDataURL('image/png');
    });
    writeFileSync(resolve(out, 'share-fallback.png'), Buffer.from(fb.split(',')[1], 'base64'));
    check(checks, 'the fallback card draws without a photo', fb.length > 1000);
    return { checks, info: [`share cards in ${out}`] };
  },
};

async function main() {
  const want = process.argv.slice(2).filter((a) => a !== '--');
  const names = want.length ? want : Object.keys(PROBES);
  for (const n of names) if (!PROBES[n]) throw new Error(`unknown probe ${n}; one of ${Object.keys(PROBES).join(', ')}`);
  const server = await createServer({
    root: ROOT,
    logLevel: 'warn',
    clearScreen: false,
    server: { port: 5197, strictPort: false, hmr: false, fs: { allow: [ROOT, realpathSync(resolve(ROOT, 'node_modules'))] } },
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
    await page.setViewport(SE);
    await page.evaluateOnNewDocument(bootScript, 7);
    await page.goto(url, { waitUntil: 'load', timeout: 300000 });
    for (const name of names) {
      console.log(`\n[${name}]`);
      try {
        const r = await PROBES[name](page, url);
        for (const [what, ok, detail] of r.checks) {
          if (!ok) failed++;
          console.log(`  ${ok ? 'PASS' : 'FAIL'} ${what}${detail ? `  (${detail})` : ''}`);
        }
        for (const line of r.info ?? []) console.log(`       ${line}`);
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
