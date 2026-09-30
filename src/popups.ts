// popups.ts: the floating reward text (¡Cerquita! +250, +30, ¡CAFECITO!).
// Each one pops in (0.6 -> 1.1 -> 1.0 over 160 ms), holds, then rises and
// fades. They are measured and clamped inside the free band the UI hands
// over (below the top band, above the pedals, inside the safe margins), so
// none ever touches a screen edge, even at the peak of its pop. A new one
// steps aside from the ones still up; at most CONFIG.popupMax show at once.
// Plátanos picked up close together add into one "+N" that punches as it
// grows. Web Animations on transform and opacity only.

import { CONFIG } from './config';

export interface Band {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

interface Slot {
  el: HTMLElement;
  anim: Animation | null;
  x: number;
  y: number;
  w: number;
  h: number;
  seq: number; // spawn order, to retire the oldest
}

const POOL = 8;
const PEAK_MS = 90; // the top of the pop (scale 1.1)
const SETTLE_MS = 160; // back to 1.0
const HOLD_MS = 520; // then it starts to rise
const FADE_MS = 200;
const PEAK_SCALE = 1.1;
const EDGE_PX = 12; // the closest a popup's edge may come to the band's edge
const DODGE: ReadonlyArray<readonly [number, number]> = [[0, 0], [0, 1], [0, -1], [0, 2], [0, -2], [1, 0], [-1, 0], [1, 1], [-1, 1]];

function frames(lifeMs: number, reduced: boolean): Keyframe[] {
  const at = (ms: number): number => Math.min(1, ms / lifeMs);
  const rise = CONFIG.popupRisePx;
  const t = (dy: number, s: number): string => `translate(-50%, -50%) translateY(${dy}px) scale(${s})`;
  if (reduced) {
    return [
      { offset: 0, opacity: 0, transform: t(0, 1) },
      { offset: at(80), opacity: 1, transform: t(0, 1) },
      { offset: at(lifeMs - FADE_MS), opacity: 1, transform: t(0, 1) },
      { offset: 1, opacity: 0, transform: t(0, 1) },
    ];
  }
  return [
    { offset: 0, opacity: 0, transform: t(0, 0.6), easing: 'cubic-bezier(0.2, 0.9, 0.3, 1)' },
    { offset: at(PEAK_MS), opacity: 1, transform: t(0, PEAK_SCALE), easing: 'ease-in-out' },
    { offset: at(SETTLE_MS), opacity: 1, transform: t(0, 1) },
    { offset: at(HOLD_MS), opacity: 1, transform: t(0, 1), easing: 'cubic-bezier(0.33, 1, 0.68, 1)' },
    { offset: at(lifeMs - FADE_MS), opacity: 1, transform: t(-rise * 0.75, 1) },
    { offset: 1, opacity: 0, transform: t(-rise, 0.96) },
  ];
}

const LIFE_MS = CONFIG.popupSec * 1000;
const BIG_MS = CONFIG.popupBigSec * 1000;
const FRAMES = frames(LIFE_MS, false);
const FRAMES_BIG = frames(BIG_MS, false);
const FRAMES_CALM = frames(LIFE_MS, true);
const FRAMES_CALM_BIG = frames(BIG_MS, true);
const OPTS: KeyframeAnimationOptions = { duration: LIFE_MS, fill: 'forwards', delay: 0 };
const OPTS_BIG: KeyframeAnimationOptions = { duration: BIG_MS, fill: 'forwards', delay: 0 };
const STAGGER_MS = 120; // popups born together pop one after another...
const STAGGER_MAX_MS = 240; // ...but never later than this after their event

export class Popups {
  private readonly slots: Slot[] = [];
  private seq = 0;
  private nextPopAt = 0; // performance.now() before which a new popup waits its turn
  private now = 0; // seconds, the UI clock (so the plátano window follows the sim in tests)
  private chain: Slot | null = null;
  private chainSum = 0;
  private chainAt = -Infinity;
  private readonly reduced = window.matchMedia('(prefers-reduced-motion: reduce)');

  constructor(
    layer: HTMLElement,
    private readonly band: () => Band,
  ) {
    for (let i = 0; i < POOL; i++) {
      const el = document.createElement('div');
      el.className = 'popup';
      layer.appendChild(el);
      this.slots.push({ el, anim: null, x: 0, y: 0, w: 0, h: 0, seq: 0 });
    }
  }

  update(dt: number): void {
    this.now += dt;
  }

  // Everything off at once (a new run, the title).
  clear(): void {
    for (const s of this.slots) {
      s.anim?.cancel();
      s.anim = null;
    }
    this.chain = null;
  }

  // Paused with the game: the popups hold where they are.
  freeze(on: boolean): void {
    for (const s of this.slots) {
      if (!s.anim) continue;
      if (on && s.anim.playState === 'running') s.anim.pause();
      else if (!on && s.anim.playState === 'paused') s.anim.play();
    }
  }

  // A popup at xPct/yPct of the screen (where it happened).
  show(text: string, xPct: number, yPct: number, cls: string, big = false): void {
    const s = this.take();
    s.el.className = `popup ${cls}`;
    s.el.textContent = text;
    this.place(s, xPct, yPct, true);
    this.play(s, big);
  }

  // A plátano: the first opens a "+N", the next ones inside
  // CONFIG.platanoAggSec add to it and make it punch.
  platano(pts: number, xPct: number, yPct: number, label: (sum: number) => string): void {
    const c = this.chain;
    if (c && this.now - this.chainAt <= CONFIG.platanoAggSec && this.alive(c)) {
      this.chainSum += pts;
      this.chainAt = this.now;
      c.el.textContent = label(this.chainSum);
      this.place(c, (c.x / window.innerWidth) * 100, (c.y / window.innerHeight) * 100, false);
      c.anim!.currentTime = PEAK_MS; // back to the top of the pop, and the hold starts over
      return;
    }
    const s = this.take();
    s.el.className = 'popup pop-sm pop-gold';
    s.el.textContent = label(pts);
    this.place(s, xPct, yPct, true);
    this.play(s, false);
    this.chain = s;
    this.chainSum = pts;
    this.chainAt = this.now;
  }

  private alive(s: Slot): boolean {
    return s.anim !== null && s.anim.playState === 'running';
  }

  // A free element, retiring the oldest live popup once popupMax are up.
  private take(): Slot {
    let live = 0;
    let oldest: Slot | null = null;
    let free: Slot | null = null;
    for (const s of this.slots) {
      if (this.alive(s)) {
        live++;
        if (!oldest || s.seq < oldest.seq) oldest = s;
      } else if (!free) {
        free = s;
      }
    }
    if (live >= CONFIG.popupMax && oldest) {
      oldest.anim!.finish();
      if (oldest === this.chain) this.chain = null;
      if (!free) free = oldest;
    }
    const s = free ?? oldest ?? this.slots[0];
    s.anim?.cancel();
    s.anim = null;
    if (s === this.chain) this.chain = null;
    s.seq = ++this.seq;
    return s;
  }

  // Popups born in the same instant cascade STAGGER_MS apart instead of
  // landing as one clump.
  private play(s: Slot, big: boolean): void {
    const calm = this.reduced.matches;
    const now = performance.now();
    const delay = Math.min(STAGGER_MAX_MS, Math.max(0, this.nextPopAt - now));
    this.nextPopAt = now + delay + STAGGER_MS;
    const opts = big ? OPTS_BIG : OPTS;
    opts.delay = delay;
    s.anim = s.el.animate(big ? (calm ? FRAMES_CALM_BIG : FRAMES_BIG) : calm ? FRAMES_CALM : FRAMES, opts);
  }

  // Measure, clamp into the band (with room for the pop and the rise), and
  // step aside from the popups still up (see DODGE).
  private place(s: Slot, xPct: number, yPct: number, dodge: boolean): void {
    const b = this.band();
    const w = s.el.offsetWidth;
    const h = s.el.offsetHeight;
    const halfW = (w * PEAK_SCALE) / 2 + EDGE_PX;
    const halfH = (h * PEAK_SCALE) / 2;
    const xLo = b.left + halfW;
    const xHi = b.right - halfW;
    const clampX = (x: number): number => (xHi <= xLo ? (b.left + b.right) / 2 : Math.min(xHi, Math.max(xLo, x)));
    const x0 = clampX((xPct / 100) * window.innerWidth);
    const yLo = b.top + halfH + CONFIG.popupRisePx;
    const yHi = Math.max(yLo, b.bottom - halfH);
    const clampY = (y: number): number => Math.min(yHi, Math.max(yLo, y));
    const y0 = clampY((yPct / 100) * window.innerHeight);
    let x = x0;
    let y = y0;
    if (dodge) {
      // its own spot, a row below, above, two below, two above; then, on a
      // short screen with no rows to spare, a step to either side
      const d = h + 6;
      const dx = w * PEAK_SCALE + 10;
      let found = false;
      for (const [kx, ky] of DODGE) {
        const cx = clampX(x0 + kx * dx);
        const cy = clampY(y0 + ky * d);
        if (!this.hits(s, cx, cy, w, h)) {
          x = cx;
          y = cy;
          found = true;
          break;
        }
      }
      // Nowhere free: the newest news wins its own spot, and whatever older
      // popup is in the way leaves now rather than sit under it.
      if (!found) {
        for (const o of this.slots) {
          if (o !== s && this.alive(o) && this.hitsOne(o, x, y, w, h)) {
            o.anim!.finish();
            if (o === this.chain) this.chain = null;
          }
        }
      }
    }
    s.x = x;
    s.y = y;
    s.w = w;
    s.h = h;
    s.el.style.left = `${x}px`;
    s.el.style.top = `${y}px`;
  }

  // Does a popup at (x, y) overlap one still up? Every popup rises the same
  // way, so one that pops below an older one only has to clear where the
  // older one popped (the older one rises away first); one that pops above
  // has to clear the older one's whole path up.
  private hits(self: Slot, x: number, y: number, w: number, h: number): boolean {
    for (const o of this.slots) {
      if (o !== self && this.alive(o) && this.hitsOne(o, x, y, w, h)) return true;
    }
    return false;
  }

  private hitsOne(o: Slot, x: number, y: number, w: number, h: number): boolean {
    const dx = Math.abs(o.x - x) < ((o.w + w) * PEAK_SCALE) / 2 + 4;
    const top = o.y - o.h / 2 - (y >= o.y ? 0 : CONFIG.popupRisePx);
    const bottom = o.y + o.h / 2;
    return dx && y + h / 2 > top - 4 && y - h / 2 < bottom + 4;
  }
}
