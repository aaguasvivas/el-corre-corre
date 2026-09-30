// HUD probes: the in-run HUD's layout, popups, announcement lane, coach
// chips, contrast, reduced motion and the pause freeze, measured in headless
// Chrome at the iPhone SE (375x667) and 6.9-inch (440x956) sizes, in Spanish
// and English. Same boot as tools/shots.mjs (rAF frozen, Math.random seeded,
// audio held); the sim moves through window.__ecc, CSS and Web Animations
// run on the wall clock, so moments that animate are sampled over time and
// judged by their largest extent. One PASS or FAIL line per check.
//
//   sh tools/heavy.sh node tools/hud-probe.mjs              # every probe
//   sh tools/heavy.sh node tools/hud-probe.mjs band popups  # a subset
//
// Probes: band, popups, lane, cards, coach, contrast, motion, freeze, ids.
// Exit code 1 when any check fails.

import { createServer } from 'vite';
import puppeteer from 'puppeteer-core';
import { realpathSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CHROME =
  process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const VIEWPORTS = {
  se: { width: 375, height: 667, deviceScaleFactor: 1, isMobile: true, hasTouch: true },
  iphone69: { width: 440, height: 956, deviceScaleFactor: 1, isMobile: true, hasTouch: true },
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function bootScript(seed, lang, learned) {
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
    if (lang === 'en') localStorage.setItem('ecc.v1.lang', 'en');
    if (learned !== null) localStorage.setItem('ecc.v1.learned', String(learned));
  } catch {
    // fine
  }
  // Page-side helpers.
  window.__h = {
    key(code, down) {
      window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code, bubbles: true }));
    },
    // Hold a key (A/D) in 1/60 ticks until x crosses the target.
    steer(target) {
      const e = window.__ecc;
      const code = target > e.x() ? 'KeyA' : 'KeyD';
      this.key(code, true);
      for (let i = 0; i < 400 && (code === 'KeyA' ? e.x() < target : e.x() > target); i++) e.tick(1 / 60);
      this.key(code, false);
    },
    rideTo(m) {
      const e = window.__ecc;
      for (let g = 0; g < 400 && e.runDist() < m; g++) e.tick(Math.min(4, Math.max(1 / 60, (m - e.runDist()) / Math.max(e.effSpeed(), 1))));
    },
    // Text-only elements are measured by their ink: the glyph run's box (a
    // Range, which includes transforms) trimmed to the text's real ascent
    // and descent (canvas TextMetrics in the same font), plus the outside
    // half of the stroke. The rest by their border boxes.
    rect(sel) {
      const el = typeof sel === 'string' ? document.querySelector(sel) : sel;
      if (!el) return null;
      let r = el.getBoundingClientRect();
      if (el.childElementCount === 0 && el.textContent) {
        const range = document.createRange();
        range.selectNodeContents(el);
        const box = range.getBoundingClientRect();
        const cs = getComputedStyle(el);
        const g = (this.ctx ??= document.createElement('canvas').getContext('2d'));
        g.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
        const m = g.measureText(el.textContent);
        const content = m.fontBoundingBoxAscent + m.fontBoundingBoxDescent;
        const k = box.height / content; // the element's scale right now
        const stroke = (parseFloat(cs.webkitTextStrokeWidth) || 0) / 2;
        r = {
          left: box.left - stroke * k,
          right: box.right + stroke * k,
          top: box.top + (m.fontBoundingBoxAscent - m.actualBoundingBoxAscent - stroke) * k,
          bottom: box.bottom - (m.fontBoundingBoxDescent - m.actualBoundingBoxDescent - stroke) * k,
          width: box.width,
          height: box.height,
        };
      }
      if (r.width === 0 && r.height === 0) return null;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none') return null;
      return { l: r.left, t: r.top, r: r.right, b: r.bottom };
    },
  };
}

// Sample rects of several selectors on the wall clock for ms. Returns the
// union per selector (for edge checks) and every sample (for overlaps, which
// only count between states that exist at the same instant).
async function sampleRects(page, sels, ms = 420, every = 25) {
  const out = {};
  const samples = [];
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const got = await page.evaluate((ss) => Object.fromEntries(ss.map((s) => [s, window.__h.rect(s)])), sels);
    samples.push(got);
    for (const [s, r] of Object.entries(got)) {
      if (!r) continue;
      const u = out[s];
      out[s] = u ? { l: Math.min(u.l, r.l), t: Math.min(u.t, r.t), r: Math.max(u.r, r.r), b: Math.max(u.b, r.b) } : r;
    }
    await sleep(every);
  }
  Object.defineProperty(out, 'samples', { value: samples });
  return out;
}

// Pairs among sels that overlap in any one sample.
function overlapsIn(rects, sels, pad) {
  const bad = new Set();
  for (const smp of rects.samples) {
    for (let i = 0; i < sels.length; i++) {
      for (let j = i + 1; j < sels.length; j++) {
        const a = smp[sels[i]];
        const b = smp[sels[j]];
        if (a && b && overlap(a, b, pad)) bad.add(`${sels[i]} ${fmt(a)} x ${sels[j]} ${fmt(b)}`);
      }
    }
  }
  return [...bad];
}

const overlap = (a, b, pad = 0) => a.l < b.r + pad && b.l < a.r + pad && a.t < b.b + pad && b.t < a.b + pad;
const fmt = (r) => (r ? `${Math.round(r.l)},${Math.round(r.t)} to ${Math.round(r.r)},${Math.round(r.b)}` : 'none');

// ---------------------------------------------------------------------------

const PROBES = {
  // The top band at its fullest: ×15 tier slam, both pills, the multiplier on
  // fire, then the longest set-piece card, then La Cinta's chip.
  band: async (page, vp) => {
    const checks = [];
    await page.evaluate(() => {
      const e = window.__ecc;
      e.start();
      e.god(true);
      e.tick(1);
      for (let i = 0; i < 160; i++) e.nearMiss(0.8); // a long score
      e.tick(4.6);
      e.setRecordDist(99999);
      window.__h.rideTo(520);
      window.__h.steer(3.4);
      window.__h.key('Space', true); // the caballito, held
      e.tick(0.3);
      for (let i = 0; i < 15; i++) {
        e.nearMiss(0.8);
        e.tick(0.03);
      }
    });
    const top = ['#score-n', '#combo-n', '#combo-tier', '#hud-cv', '#hud-cab', '#hud-pause', '#hud-platanos', '#hud-mult'];
    const r = await sampleRects(page, top, 420);
    const st = await page.evaluate(() => ({ combo: window.__ecc.combo(), mult: window.__ecc.liveMult(), fire: document.getElementById('hud-mult').classList.contains('fire') }));
    checks.push(['the fullest band is up (combo 15+, both pills, fire chip)', st.combo >= 15 && !!r['#hud-cv'] && !!r['#hud-cab'] && st.fire, `combo ${st.combo}, ×${st.mult}`]);
    const bad = overlapsIn(r, top, 1);
    checks.push(['nothing in the top band overlaps, even at the slam peak', bad.length === 0, bad.join('; ') || 'clear']);
    const out = top.filter((s) => r[s] && (r[s].l < 8 || r[s].r > vp.width - 8 || r[s].t < 4));
    checks.push(['every top-band item keeps 8 px from the edges', out.length === 0, out.map((s) => `${s} ${fmt(r[s])}`).join('; ') || 'ok']);

    // The longest set-piece name in the lane: one line (or two at most), clear of the band.
    await page.evaluate(() => {
      const e = window.__ecc;
      for (let i = 0; i < 400 && (e.hud().kind !== null || e.hud().queued > 0); i++) e.tick(1 / 20);
      e.setPiece('camionPlatanos');
      e.tick(1 / 60);
    });
    const lane = await sampleRects(page, ['#an-card', '#hud-cv', '#hud-cab', '#combo-tier'], 420);
    const lines = await page.evaluate(() => {
      const t = document.querySelector('#an-card .an-text');
      const fs = parseFloat(getComputedStyle(t).fontSize);
      return { lines: Math.round(t.offsetHeight / (fs * 1.08)), fs: Math.round(fs * 10) / 10, text: t.textContent };
    });
    checks.push([
      'the lane card fits: inside the edges, at most two lines',
      !!lane['#an-card'] && lane['#an-card'].l >= 8 && lane['#an-card'].r <= vp.width - 8 && lines.lines <= 2,
      `${lines.text} ${lines.fs}px, ${lines.lines} line(s), ${fmt(lane['#an-card'])}`,
    ]);
    checks.push([
      'the lane card sits below the pills and ends above the horizon (33.5% of the height)',
      !!lane['#an-card'] && lane['#an-card'].t >= (lane['#hud-cv']?.b ?? 0) && lane['#an-card'].b <= vp.height * 0.335,
      `card ${fmt(lane['#an-card'])}, pills bottom ${Math.round(lane['#hud-cv']?.b ?? 0)}, horizon ${Math.round(vp.height * 0.335)}`,
    ]);
    // Then La Cinta's chip takes the free lane.
    await page.evaluate(() => {
      const e = window.__ecc;
      for (let i = 0; i < 200 && e.hud().kind !== null; i++) e.tick(1 / 20);
      e.setRecordDist(e.runDist() + 152);
      e.tick(0.05);
    });
    const tape = await page.evaluate(() => ({ r: window.__h.rect('#hud-tape'), txt: document.getElementById('tape-n').textContent, hud: window.__ecc.hud() }));
    checks.push(['La Cinta chip shows in the free lane, counting in 10 m steps', !!tape.r && /1[56]0/.test(tape.txt), `"${tape.txt}" ${fmt(tape.r)}`]);
    await page.evaluate(() => window.__h.key('Space', false));
    return { checks };
  },

  // Popups at both kerbs: inside the screen at the peak of their pop, below
  // the band, above the pedals; at most four at once; plátanos add up.
  popups: async (page, vp) => {
    const checks = [];
    const band = await page.evaluate(() => {
      const e = window.__ecc;
      e.start();
      e.god(true);
      e.tick(2);
      e.clearTraffic();
      const pills = document.getElementById('hud-pills').getBoundingClientRect();
      const ped = document.getElementById('pedals').getBoundingClientRect();
      return { top: pills.bottom, bottom: ped.top };
    });
    const extents = [];
    for (const side of [6.4, -6.4]) {
      await page.evaluate((x) => {
        const e = window.__ecc;
        window.__h.steer(x);
        e.clearTraffic();
        e.spawnPickup('cafecito', e.x(), 5);
        e.tick(0.3);
        e.nearMiss(0.2); // ¡Por un pelito!, the longest near-miss line
        e.tick(1 / 60);
      }, side);
      const got = await page.evaluate(async () => {
        const seen = new Map();
        const t0 = performance.now();
        while (performance.now() - t0 < 700) {
          for (const el of document.querySelectorAll('.popup')) {
            if (parseFloat(getComputedStyle(el).opacity) < 0.05) continue;
            const r = el.getBoundingClientRect();
            const u = seen.get(el) ?? { l: 1e9, t: 1e9, r: -1e9, b: -1e9, text: el.textContent };
            seen.set(el, { l: Math.min(u.l, r.left), t: Math.min(u.t, r.top), r: Math.max(u.r, r.right), b: Math.max(u.b, r.bottom), text: el.textContent });
          }
          await new Promise((res) => setTimeout(res, 16));
        }
        return [...seen.values()];
      });
      extents.push(...got);
    }
    const outX = extents.filter((p) => p.l < 8 || p.r > vp.width - 8);
    checks.push(['popups never reach the screen edge, at the peak of the pop', extents.length >= 3 && outX.length === 0, `${extents.length} sampled; ${outX.map((p) => `${p.text} ${fmt(p)}`).join('; ') || 'all inside'}`]);
    const outY = extents.filter((p) => p.t < band.top - 1 || p.b > band.bottom + 1);
    checks.push(['popups stay between the pills and the pedals', outY.length === 0, `band ${Math.round(band.top)}..${Math.round(band.bottom)}; ${outY.map((p) => `${p.text} ${fmt(p)}`).join('; ') || 'all inside'}`]);

    // Eight near-misses in 200 ms: never more than four up at once.
    const most = await page.evaluate(async () => {
      const e = window.__ecc;
      let most = 0;
      for (let i = 0; i < 8; i++) {
        e.nearMiss(0.8);
        e.tick(1 / 60);
        await new Promise((res) => setTimeout(res, 25));
        const up = [...document.querySelectorAll('.popup')].filter((el) => parseFloat(getComputedStyle(el).opacity) > 0.05).length;
        most = Math.max(most, up);
      }
      return most;
    });
    checks.push(['at most four popups at once', most <= 4, `${most} at the most`]);

    // A string of six plátanos reads as one growing "+N".
    const agg = await page.evaluate(async () => {
      const e = window.__ecc;
      for (const el of document.querySelectorAll('.popup')) for (const a of el.getAnimations()) a.finish();
      e.clearTraffic();
      const x = e.x();
      const before = e.platanos();
      for (let i = 0; i < 6; i++) e.spawnPickup('platano', x, 6 + i * 2.2);
      const texts = new Set();
      for (let i = 0; i < 90; i++) {
        e.tick(1 / 60);
        for (const el of document.querySelectorAll('.popup')) {
          if (parseFloat(getComputedStyle(el).opacity) > 0.05 && el.textContent.startsWith('+')) texts.add(el.textContent);
        }
        await new Promise((res) => setTimeout(res, 16));
      }
      const live = [...document.querySelectorAll('.popup')].filter((el) => parseFloat(getComputedStyle(el).opacity) > 0.05 && el.textContent.startsWith('+'));
      return { got: e.platanos() - before, live: live.map((el) => el.textContent), texts: [...texts] };
    });
    checks.push(['six plátanos in a string read as one "+N" popup', agg.got === 6 && agg.live.length === 1, `collected ${agg.got}; up now: ${agg.live.join(', ')}; seen: ${agg.texts.join(' ')}`]);
    return { checks };
  },

  // One lane: a record waits out a set piece's minimum, then cuts it; a
  // mandao waits for both; never two at once.
  lane: async (page) => {
    const checks = [];
    const seq = await page.evaluate(() => {
      const e = window.__ecc;
      e.start();
      e.god(true);
      e.tick(2);
      e.clearTraffic();
      e.setPiece('tapon');
      e.tick(1 / 60);
      const log = [];
      let last = null;
      const note = (t) => {
        const h = e.hud();
        const k = h.kind ?? '-';
        if (k !== last) {
          log.push([Math.round(t * 1000) / 1000, k, h.lane]);
          last = k;
        }
      };
      let t = 0;
      note(t);
      // 0.3 s in: the tape bursts (a record), and 10 plátanos finish a mandao.
      for (; t < 0.3; t += 1 / 60) {
        e.tick(1 / 60);
        note(t);
      }
      e.setRecordDist(e.runDist() + 2);
      const x = e.x();
      for (let i = 0; i < 10; i++) e.spawnPickup('platano', x, 4 + i * 1.2);
      for (; t < 9; t += 1 / 60) {
        e.tick(1 / 60);
        note(t);
      }
      return log;
    });
    const kinds = seq.map((s) => s[1]).filter((k) => k !== '-');
    const at = (k) => seq.find((s) => s[1] === k)?.[0] ?? -1;
    checks.push(['set piece, then the record, then the mandao, one at a time', kinds.join(' ') === 'setPiece record mandao', seq.map((s) => `${s[0]}s ${s[1]}`).join(', ')]);
    checks.push(['the record waited out the set piece minimum (0.9 s)', at('record') >= 0.9, `record at ${at('record')} s`]);
    const cards = await page.evaluate(() => document.querySelectorAll('.an-card').length);
    checks.push(['the lane is one element', cards === 1, `${cards} card element(s)`]);
    return { checks };
  },

  // Every kind of card with its longest real copy: inside the edges at the
  // peak of its pop, at most two lines, below the pills, above the horizon.
  cards: async (page, vp, lang) => {
    const checks = [];
    const copy = {
      es: [
        ['tramo', 'LA ZONA COLONIAL', 'LLEGASTE A'],
        ['record', '¡MÁS LEJOS QUE NUNCA!', ''],
        ['shield', '¡TE SALVÓ LA BENDICIÓN!', ''],
        ['mult', '¡MULTIPLICADOR ×4!', '¡La calle se puso brava!'],
        ['setPiece', '¡SE LE CAEN LOS PLÁTANOS!', ''],
        ['mandao', 'Corre 1,500 m seguidos sin caer en un hoyo · +200 plátanos', '¡MANDAO HECHO!'],
        ['mandao', 'Haz 3 cerquitas en contra vía en una corrida · +150 plátanos', '¡MANDAO DEL DÍA!'],
        ['levelUp', 'Leyenda del Malecón ×3 · +500 plátanos', '¡SUBISTE DE NIVEL!'],
        ['nudge', '¡Ya casi el récord!', ''],
      ],
      en: [
        ['tramo', 'LA ZONA COLONIAL', 'YOU REACHED'],
        ['record', 'FARTHEST EVER!', ''],
        ['shield', 'LA BENDICIÓN SAVED YOU!', ''],
        ['mult', 'MULTIPLIER ×4!', 'The street got wild!'],
        ['setPiece', 'SPILLED PLANTAINS!', ''],
        ['mandao', 'Ride 1,500 m straight without a pothole · +200 plantains', 'MISSION DONE!'],
        ['mandao', 'Pull 3 wrong-way near-misses in one run · +150 plantains', 'DAILY DONE!'],
        ['levelUp', 'Legend of the Malecón ×3 · +500 plantains', 'LEVEL UP!'],
        ['nudge', 'Record in reach!', ''],
      ],
    }[lang];
    await page.evaluate(() => {
      window.__ecc.start();
      window.__ecc.god(true);
      window.__ecc.tick(1);
    });
    const pillsBottom = await page.evaluate(() => document.getElementById('hud-pills').getBoundingClientRect().bottom);
    for (const [kind, text, kicker] of copy) {
      await page.evaluate(
        (k, t, kk) => {
          const e = window.__ecc;
          for (let i = 0; i < 400 && (e.hud().kind !== null || e.hud().queued > 0); i++) e.tick(1 / 20);
          e.tick(0.25);
          e.announce(k, t, kk);
          e.tick(1 / 60);
        },
        kind,
        text,
        kicker,
      );
      const r = (await sampleRects(page, ['#an-card'], 380))['#an-card'];
      const m = await page.evaluate(() => {
        const t = document.querySelector('#an-card .an-text');
        const fs = parseFloat(getComputedStyle(t).fontSize);
        const c = document.getElementById('an-card');
        const dbg = `${c.className} ws=${getComputedStyle(t).whiteSpace} h=${t.offsetHeight} sw=${t.scrollWidth} cw=${c.clientWidth} fit=${c.style.getPropertyValue('--an-fit')}`;
        return { lines: Math.round(t.offsetHeight / (fs * 1.1)), fs: Math.round(fs * 10) / 10, dbg };
      });
      // (a tilted card's corner may rise a few px into the gap under the pills)
      const ok = !!r && r.l >= 8 && r.r <= vp.width - 8 && r.t >= pillsBottom - 4 && r.b <= vp.height * 0.345 && m.lines <= 2 && m.fs >= 12;
      checks.push([`${kind}: "${text}"`, ok, `${m.fs}px, ${m.lines} line(s), ${fmt(r)}, pills ${Math.round(pillsBottom)}, horizon ${Math.round(vp.height * 0.335)}; ${m.dbg}`]);
    }
    return { checks };
  },

  // Coach chips on a first launch: steer at coachStartSec, gone once you
  // steer, the next one a gap later; hidden through the resume countdown.
  coach: async (page) => {
    const checks = [];
    const r = await page.evaluate(() => {
      const e = window.__ecc;
      e.start();
      e.tick(1.0);
      const early = e.hud().coach;
      e.tick(0.6);
      const first = e.hud().coach;
      const text = document.getElementById('coach-text').textContent;
      const shown = !document.getElementById('coach').classList.contains('off');
      window.__h.key('KeyD', true);
      e.tick(0.4);
      window.__h.key('KeyD', false);
      e.tick(1 / 60);
      const afterSteer = e.hud().coach;
      let next = null;
      let nextAt = 0;
      for (let t = 0; t < 6 && !next; t += 1 / 20) {
        e.tick(1 / 20);
        next = e.hud().coach;
        nextAt = t;
      }
      e.pause();
      e.resume();
      e.tick(0.2);
      const cd = e.state();
      const coachDisplay = getComputedStyle(document.getElementById('coach')).display;
      return { early, first, text, shown, afterSteer, next, nextAt, cd, coachDisplay, learned: e.hud().learned };
    });
    checks.push(['no hint before coachStartSec', r.early === null, `at 1.0 s: ${r.early}`]);
    checks.push(['the steer hint shows first', r.first === 'steer' && r.shown && r.text.length > 5, `"${r.text}"`]);
    checks.push(['steering hides it at once and learns it', r.afterSteer === null && (r.learned & 1) === 1, `learned bits ${r.learned}`]);
    checks.push(['contra vía comes next, a gap later', r.next === 'cv', `${r.next} after ${r.nextAt.toFixed(2)} s more`]);
    checks.push(['no hint during the resume countdown', r.cd === 'countdown' && r.coachDisplay === 'none', `${r.cd}, #coach display ${r.coachDisplay}`]);
    return { checks };
  },

  // Text on plates, from the computed colors (translucent plates composited
  // over white, the worst backdrop). 4.5:1 under 24 px, 3:1 at 24 px and up.
  contrast: async (page) => {
    const rows = await page.evaluate(() => {
      const e = window.__ecc;
      e.start();
      e.tick(0.5);
      const parse = (c) => {
        const m = c.match(/rgba?\(([^)]+)\)/);
        if (!m) return null;
        const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
        return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
      };
      const lin = (c) => {
        c /= 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      };
      const L = (c) => 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
      const over = (fg, bg) => ({ r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a), a: 1 });
      const ratio = (a, b) => {
        const [x, y] = [L(a), L(b)].sort((p, q) => q - p);
        return (x + 0.05) / (y + 0.05);
      };
      const white = { r: 255, g: 255, b: 255, a: 1 };
      const peach = { r: 255, g: 217, b: 160, a: 1 };
      const out = [];
      const check = (name, el, bgEl = el) => {
        const cs = getComputedStyle(el);
        const fg = parse(cs.color);
        const bg = parse(getComputedStyle(bgEl).backgroundColor);
        const size = parseFloat(cs.fontSize);
        const worst = Math.min(ratio(fg, over(bg, white)), ratio(fg, over(bg, peach)));
        out.push({ name, ratio: Math.round(worst * 100) / 100, size, need: size >= 24 ? 3 : 4.5 });
      };
      const $ = (s) => document.querySelector(s);
      const mult = $('#hud-mult');
      mult.classList.remove('off');
      mult.textContent = '×2';
      check('multiplier chip', mult);
      mult.classList.add('hot');
      check('multiplier chip, hot', mult);
      mult.classList.remove('hot');
      mult.classList.add('fire');
      check('multiplier chip, fire', mult);
      check('plátano pill', $('#plat-n'), $('#hud-platanos'));
      $('#hud-cv').classList.add('on');
      $('#hud-cab').classList.add('on');
      check('contra vía pill', $('#hud-cv'));
      check('caballito pill', $('#hud-cab'));
      $('#hud-record').textContent = 'RÉCORD 12,345';
      check('record label', $('#hud-record'));
      $('#hud-tape').classList.remove('off');
      check('La Cinta chip', $('#tape-n'), $('#hud-tape'));
      $('#coach').classList.remove('off');
      check('coach chip', $('#coach-text'), $('#coach'));
      check('speedometer', $('#pedal-kmh'), $('#pedal-speed'));
      for (const [tag, sel] of [['×0.5 tag', '.pedal-mult-brake span'], ['×1.5 tag', '.pedal-mult-gas span'], ['¡CALIENTE! tag', '.pedal-hot-tag span']]) check(tag, $(sel));
      const card = $('#an-card');
      for (const style of ['sign', 'gold', 'red', 'blue', 'cream']) {
        card.className = `an-card an-${style} show`;
        card.querySelector('.an-kicker').textContent = 'KICKER';
        card.querySelector('.an-text').textContent = 'TEXTO';
        check(`lane ${style}, big line`, card.querySelector('.an-text'), card);
        check(`lane ${style}, kicker`, card.querySelector('.an-kicker'), card);
      }
      card.className = 'an-card';
      return out;
    });
    const checks = rows.map((r) => [`${r.name} ${r.ratio}:1 at ${r.size}px`, r.ratio >= r.need, `needs ${r.need}:1`]);
    return { checks };
  },

  // prefers-reduced-motion: nothing in the HUD loops, popups only fade.
  motion: async (page) => {
    const r = await page.evaluate(async () => {
      const e = window.__ecc;
      e.start();
      e.god(true);
      e.tick(1);
      window.__h.steer(3.4);
      e.nearMiss(0.8);
      e.nearMiss(0.8);
      e.tick(1 / 60);
      await new Promise((res) => setTimeout(res, 60));
      const loops = document.getAnimations().filter((a) => {
        const t = a.effect?.target;
        return t && (t.closest?.('#hud') || t.id === 'cv-vignette') && a.effect.getComputedTiming().iterations === Infinity;
      });
      const pop = [...document.querySelectorAll('.popup')].flatMap((el) => el.getAnimations());
      const scales = pop.flatMap((a) => a.effect.getKeyframes().map((k) => k.transform)).filter((tr) => /scale\((?!1\))/.test(tr));
      return { loops: loops.map((a) => a.animationName ?? 'waapi'), popups: pop.length, scales: scales.length, cv: e.cv() };
    });
    return {
      checks: [
        ['no looping HUD animation under reduce', r.cv && r.loops.length === 0, r.loops.join(', ') || 'none'],
        ['popups fade in place: no scale, no rise', r.popups > 0 && r.scales === 0, `${r.popups} popup animations, ${r.scales} scaled keyframes`],
      ],
    };
  },

  // Pause freezes the HUD (CSS and the popups); SEGUIR's countdown keeps it
  // frozen; GO lets it go.
  freeze: async (page) => {
    const r = await page.evaluate(() => {
      const e = window.__ecc;
      e.start();
      e.god(true);
      e.tick(1);
      e.nearMiss(0.8);
      e.tick(1 / 60);
      e.pause();
      e.tick(1 / 60);
      const paused = { frozen: e.hud().frozen, popups: [...document.querySelectorAll('.popup')].flatMap((el) => el.getAnimations()).map((a) => a.playState) };
      e.resume();
      e.tick(0.2);
      const counting = e.hud().frozen;
      e.tick(2);
      return { paused, counting, after: e.hud().frozen, state: e.state() };
    });
    return {
      checks: [
        ['PAUSA freezes the HUD and its popups', r.paused.frozen && r.paused.popups.length > 0 && r.paused.popups.every((s) => s === 'paused'), r.paused.popups.join(', ')],
        ['it stays frozen through the countdown and runs again at GO', r.counting && !r.after && r.state === 'playing', `countdown frozen ${r.counting}, after ${r.after}`],
      ],
    };
  },

  // One element per id, and the quiet vignette (index.html) actually renders.
  ids: async (page) => {
    const r = await page.evaluate(() => {
      window.__ecc.start();
      window.__ecc.tick(0.2);
      const count = new Map();
      for (const el of document.querySelectorAll('[id]')) count.set(el.id, (count.get(el.id) ?? 0) + 1);
      const dup = [...count].filter(([, n]) => n > 1).map(([id, n]) => `${id} x${n}`);
      const v = getComputedStyle(document.getElementById('vignette'));
      const pause = document.getElementById('hud-pause').getBoundingClientRect();
      return { dup, vOpacity: v.opacity, vBg: v.backgroundImage.slice(0, 60), pause: [pause.width, pause.height] };
    });
    return {
      checks: [
        ['no duplicate ids', r.dup.length === 0, r.dup.join(', ') || 'none'],
        ['the quiet vignette renders (not overridden by the contra vía glow)', Number(r.vOpacity) === 1 && !r.vBg.includes('206, 17, 38'), `opacity ${r.vOpacity}, ${r.vBg}`],
        ['the pause button is at least 44 x 44', r.pause[0] >= 44 && r.pause[1] >= 44, `${r.pause[0]} x ${r.pause[1]}`],
      ],
    };
  },
};

// Which probes run per viewport and language.
const MATRIX = {
  band: [['se', 'es'], ['se', 'en'], ['iphone69', 'es'], ['iphone69', 'en']],
  popups: [['se', 'es'], ['iphone69', 'en']],
  lane: [['se', 'es']],
  cards: [['se', 'es'], ['se', 'en'], ['iphone69', 'es'], ['iphone69', 'en']],
  coach: [['se', 'es'], ['se', 'en']],
  contrast: [['se', 'es']],
  motion: [['se', 'es']],
  freeze: [['se', 'es']],
  ids: [['se', 'es']],
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
      args: ['--enable-gpu', '--ignore-gpu-blocklist', '--mute-audio', '--hide-scrollbars'],
    });
    for (const name of names) {
      for (const [vpName, lang] of MATRIX[name]) {
        const vp = VIEWPORTS[vpName];
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
        try {
          await page.setViewport(vp);
          await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: name === 'motion' ? 'reduce' : 'no-preference' }]);
          await page.evaluateOnNewDocument(bootScript, 7, lang, name === 'coach' ? null : 15);
          await page.goto(url, { waitUntil: 'load', timeout: 300000 });
          await page.waitForFunction(() => window.__ecc !== undefined, { timeout: 300000 });
          await page.evaluate(() => document.fonts.ready.then(() => undefined));
          await page.evaluate(() => window.__ecc.tick(1 / 60));
          console.log(`\n[${name} ${vpName} ${lang}]`);
          const r = await PROBES[name](page, vp, lang);
          for (const [what, ok, detail] of r.checks) {
            if (!ok) failed++;
            console.log(`  ${ok ? 'PASS' : 'FAIL'} ${what}${detail ? `  (${detail})` : ''}`);
          }
        } catch (err) {
          failed++;
          console.log(`  FAIL ${name} threw: ${err.message}`);
        } finally {
          for (const line of noise) console.log(`  ${line}`);
          await ctx.close();
        }
      }
    }
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
