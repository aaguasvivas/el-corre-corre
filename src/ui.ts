// ui.ts: DOM screens, HUD, floating popups, and copy strings.
// Spanish-first with an EN flip. The slang stays Dominican in both languages.

import type { RunResult } from './score';

type Lang = 'es' | 'en';
const LANG_KEY = 'ecc.v1.lang';
const POPUP_POOL = 12;

const STRINGS = {
  es: {
    subtitle: '¡Dale, que vamo’ tarde!',
    startTouch: "TOCA PA' EMPEZAR",
    startKey: 'DALE A ESPACIO',
    record: 'Récord',
    points: 'Puntos',
    distance: 'Distancia',
    platanos: 'Plátanos',
    again: 'OTRA VEZ',
    newRecord: '¡NUEVO RÉCORD!',
    pause: 'PAUSA',
    resume: 'Toca pa’ seguir',
    gameOverTitles: ['¡Te dieron, loco!', '¡Diablo!', '¡Eso tuvo feo!'],
  },
  en: {
    subtitle: "Let's go, we're late!",
    startTouch: 'TAP TO START',
    startKey: 'PRESS SPACE',
    record: 'Best',
    points: 'Points',
    distance: 'Distance',
    platanos: 'Plantains',
    again: 'AGAIN',
    newRecord: 'NEW RECORD!',
    pause: 'PAUSED',
    resume: 'Tap to resume',
    gameOverTitles: ['They got you!', '¡Diablo!', 'That was ugly!'],
  },
} as const;

const NEAR_MISS_TEXTS = ['¡Cerquita!', '¡Por un pelito!'] as const;

const BANANA_SVG =
  '<svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true"><path d="M4 7 C5 15 13 20 20 15 C15 22 4 19 2 9 Z" fill="#f4c430" stroke="#7cb342" stroke-width="1.4"/></svg>';

export interface UICallbacks {
  onStart(): void;
  onRestart(): void;
  onResume(): void;
  onPause(): void;
}

function readLang(): Lang {
  try {
    return localStorage.getItem(LANG_KEY) === 'en' ? 'en' : 'es';
  } catch {
    return 'es';
  }
}

function clampPct(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export class UI {
  private lang: Lang = readLang();
  private cb: UICallbacks;
  private goTitleIdx = 0;
  private lastScore = -1;
  private lastRecord = 0;
  private lastResult: RunResult | null = null;
  private comboShown = 0;
  private platShown = -1;
  private cvShown = false;
  private nearMissIdx = 0;
  private popupIdx = 0;
  private lastPopupAt = 0;
  private popupBurst = 0;

  private hud: HTMLElement;
  private title: HTMLElement;
  private gameover: HTMLElement;
  private pause: HTMLElement;
  private vignette: HTMLElement;
  private bannerEl: HTMLElement;
  private popups: HTMLElement[] = [];
  private scoreEl: HTMLElement;
  private comboEl: HTMLElement;
  private cvEl: HTMLElement;
  private platEl: HTMLElement;
  private hudRecordEl: HTMLElement;
  private subtitleEl: HTMLElement;
  private promptEl: HTMLElement;
  private titleRecordEl: HTMLElement;
  private langBtn: HTMLElement;
  private goTitleEl: HTMLElement;
  private goBadge: HTMLElement;
  private goPointsLabel: HTMLElement;
  private goPoints: HTMLElement;
  private goDistLabel: HTMLElement;
  private goDist: HTMLElement;
  private goRecLabel: HTMLElement;
  private goRec: HTMLElement;
  private goPlatLabel: HTMLElement;
  private goPlat: HTMLElement;
  private btnAgain: HTMLElement;
  private pauseTitle: HTMLElement;
  private pauseSub: HTMLElement;

  constructor(root: HTMLElement, cb: UICallbacks) {
    this.cb = cb;
    root.innerHTML = `
      <div id="vignette"></div>
      <div id="hud" class="hidden">
        <div id="hud-score">0</div>
        <div id="hud-combo" class="hidden"></div>
        <div id="hud-cv" class="hidden">¡EN CONTRA VÍA! ×2</div>
        <div id="hud-record"></div>
        <div id="hud-left">
          <button id="hud-pause" type="button" aria-label="Pausa"><i></i><i></i></button>
          <div id="hud-platanos">${BANANA_SVG}<span id="plat-n">0</span></div>
        </div>
      </div>
      <div id="popup-layer"></div>
      <div id="banner"></div>
      <div id="title" class="screen hidden">
        <button id="lang" class="chip" type="button"></button>
        <div class="logo">
          <span class="logo-el">EL</span>
          <span class="logo-line">CORRE</span>
          <span class="logo-line">CORRE</span>
          <div class="flagbar"><i class="fb-blue"></i><i class="fb-white"></i><i class="fb-red"></i></div>
        </div>
        <div id="subtitle" class="subtitle"></div>
        <div id="prompt" class="prompt"></div>
        <div id="title-record" class="title-record"></div>
      </div>
      <div id="gameover" class="screen hidden">
        <div class="card">
          <div id="go-title" class="go-title"></div>
          <div id="go-new" class="badge hidden"></div>
          <div id="go-points-label" class="go-points-label"></div>
          <div id="go-points" class="go-points">0</div>
          <div class="go-rows">
            <div><span id="go-dist-label"></span><b id="go-dist"></b></div>
            <div><span id="go-rec-label"></span><b id="go-rec"></b></div>
            <div><span id="go-plat-label"></span><b id="go-plat"></b></div>
          </div>
          <button id="btn-again" class="btn-big" type="button"></button>
        </div>
      </div>
      <div id="pause" class="screen hidden">
        <div id="pause-title" class="pause-title"></div>
        <div id="pause-sub" class="pause-sub"></div>
      </div>`;

    const q = (sel: string): HTMLElement => root.querySelector(sel)!;
    this.hud = q('#hud');
    this.title = q('#title');
    this.gameover = q('#gameover');
    this.pause = q('#pause');
    this.vignette = q('#vignette');
    this.bannerEl = q('#banner');
    this.scoreEl = q('#hud-score');
    this.comboEl = q('#hud-combo');
    this.cvEl = q('#hud-cv');
    this.platEl = q('#plat-n');
    this.hudRecordEl = q('#hud-record');
    this.subtitleEl = q('#subtitle');
    this.promptEl = q('#prompt');
    this.titleRecordEl = q('#title-record');
    this.langBtn = q('#lang');
    this.goTitleEl = q('#go-title');
    this.goBadge = q('#go-new');
    this.goPointsLabel = q('#go-points-label');
    this.goPoints = q('#go-points');
    this.goDistLabel = q('#go-dist-label');
    this.goDist = q('#go-dist');
    this.goRecLabel = q('#go-rec-label');
    this.goRec = q('#go-rec');
    this.goPlatLabel = q('#go-plat-label');
    this.goPlat = q('#go-plat');
    this.btnAgain = q('#btn-again');
    this.pauseTitle = q('#pause-title');
    this.pauseSub = q('#pause-sub');

    const layer = q('#popup-layer');
    for (let i = 0; i < POPUP_POOL; i++) {
      const el = document.createElement('div');
      el.className = 'popup';
      layer.appendChild(el);
      this.popups.push(el);
    }

    this.title.addEventListener('pointerdown', () => this.cb.onStart());
    this.langBtn.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      this.toggleLang();
    });
    this.gameover.addEventListener('pointerdown', () => this.cb.onRestart());
    this.pause.addEventListener('pointerdown', () => this.cb.onResume());
    q('#hud-pause').addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      this.cb.onPause();
    });

    this.applyLang();
  }

  private t(): (typeof STRINGS)[Lang] {
    return STRINGS[this.lang];
  }

  private toggleLang(): void {
    this.lang = this.lang === 'es' ? 'en' : 'es';
    try {
      localStorage.setItem(LANG_KEY, this.lang);
    } catch {
      // fine, the toggle just will not stick between visits
    }
    this.applyLang();
  }

  private applyLang(): void {
    const t = this.t();
    document.documentElement.lang = this.lang;
    this.langBtn.textContent = this.lang === 'es' ? 'EN' : 'ES';
    this.subtitleEl.textContent = t.subtitle;
    this.promptEl.textContent = window.matchMedia('(pointer: coarse)').matches
      ? t.startTouch
      : t.startKey;
    this.titleRecordEl.textContent =
      this.lastRecord > 0 ? `${t.record}: ${this.lastRecord}` : '';
    this.hudRecordEl.textContent =
      this.lastRecord > 0 ? `${t.record.toUpperCase()} ${this.lastRecord}` : '';
    this.goPointsLabel.textContent = t.points.toUpperCase();
    this.goDistLabel.textContent = `${t.distance} `;
    this.goRecLabel.textContent = `${t.record} `;
    this.goPlatLabel.textContent = `${t.platanos} `;
    this.btnAgain.textContent = t.again;
    this.goBadge.textContent = t.newRecord;
    this.pauseTitle.textContent = t.pause;
    this.pauseSub.textContent = t.resume;
    if (this.lastResult) {
      this.goTitleEl.textContent = t.gameOverTitles[this.goTitleIdx];
    }
  }

  showTitle(record: number): void {
    this.lastRecord = record;
    this.applyLang();
    this.title.classList.remove('hidden');
    this.hud.classList.add('hidden');
    this.gameover.classList.add('hidden');
    this.pause.classList.add('hidden');
    this.setContraVia(false);
  }

  showPlaying(record: number): void {
    this.lastRecord = record;
    this.applyLang();
    this.lastScore = -1;
    this.setScore(0);
    this.comboShown = 0;
    this.comboEl.classList.add('hidden');
    this.platShown = -1;
    this.setPlatanos(0);
    this.setContraVia(false);
    for (const p of this.popups) p.classList.remove('go');
    this.hud.classList.remove('hidden');
    this.title.classList.add('hidden');
    this.gameover.classList.add('hidden');
    this.pause.classList.add('hidden');
  }

  showGameOver(r: RunResult): void {
    const t = this.t();
    this.lastResult = r;
    this.lastRecord = r.record;
    this.goTitleIdx = Math.floor(Math.random() * t.gameOverTitles.length);
    this.goTitleEl.textContent = t.gameOverTitles[this.goTitleIdx];
    this.goPoints.textContent = String(r.points);
    this.goDist.textContent = `${r.distanceM} m`;
    this.goRec.textContent = String(r.record);
    this.goPlat.textContent = String(r.platanos);
    this.goBadge.classList.toggle('hidden', !r.isNewRecord);
    this.gameover.classList.remove('hidden');
    this.hud.classList.add('hidden');
    this.setContraVia(false);
  }

  showPause(): void {
    this.pause.classList.remove('hidden');
  }

  hidePause(): void {
    this.pause.classList.add('hidden');
  }

  setScore(n: number): void {
    if (n === this.lastScore) return;
    this.lastScore = n;
    this.scoreEl.textContent = String(n);
  }

  setCombo(n: number, tier: string | null): void {
    if (n === this.comboShown) return;
    this.comboShown = n;
    if (n < 2) {
      this.comboEl.classList.add('hidden');
      return;
    }
    this.comboEl.textContent = tier ? `×${n} ${tier}` : `×${n}`;
    this.comboEl.classList.remove('hidden', 'bump');
    void this.comboEl.offsetWidth;
    this.comboEl.classList.add('bump');
  }

  setPlatanos(n: number): void {
    if (n === this.platShown) return;
    this.platShown = n;
    this.platEl.textContent = String(n);
    const wrap = this.platEl.parentElement!;
    wrap.classList.remove('bump');
    void wrap.offsetWidth;
    wrap.classList.add('bump');
  }

  setContraVia(on: boolean): void {
    if (on === this.cvShown) return;
    this.cvShown = on;
    this.cvEl.classList.toggle('hidden', !on);
    this.vignette.classList.toggle('on', on);
  }

  nextNearMissText(): string {
    this.nearMissIdx = (this.nearMissIdx + 1) % NEAR_MISS_TEXTS.length;
    return NEAR_MISS_TEXTS[this.nearMissIdx];
  }

  popup(text: string, xPct: number, yPct: number, cls: string): void {
    const now = performance.now();
    if (now - this.lastPopupAt < 220) this.popupBurst += 1;
    else this.popupBurst = 0;
    this.lastPopupAt = now;
    const el = this.popups[this.popupIdx];
    this.popupIdx = (this.popupIdx + 1) % POPUP_POOL;
    el.className = `popup ${cls}`;
    el.style.left = `${clampPct(xPct, 8, 92)}%`;
    el.style.top = `${clampPct(yPct - this.popupBurst * 6, 10, 80)}%`;
    el.textContent = text;
    void el.offsetWidth;
    el.classList.add('go');
  }

  banner(text: string): void {
    this.bannerEl.textContent = text;
    this.bannerEl.classList.remove('show');
    void this.bannerEl.offsetWidth;
    this.bannerEl.classList.add('show');
  }
}
