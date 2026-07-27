// ui.ts: DOM screens, HUD, and copy strings. Spanish-first with an EN flip.
// Phase 1 keeps screens minimal; Phase 5 does the full art pass on them.

import type { RunResult } from './score';

type Lang = 'es' | 'en';
const LANG_KEY = 'ecc.v1.lang';

const STRINGS = {
  es: {
    subtitle: '¡Dale, que vamo’ tarde!',
    startTouch: "TOCA PA' EMPEZAR",
    startKey: 'DALE A ESPACIO',
    record: 'Récord',
    points: 'Puntos',
    distance: 'Distancia',
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
    again: 'AGAIN',
    newRecord: 'NEW RECORD!',
    pause: 'PAUSED',
    resume: 'Tap to resume',
    gameOverTitles: ['They got you!', '¡Diablo!', 'That was ugly!'],
  },
} as const;

export interface UICallbacks {
  onStart(): void;
  onRestart(): void;
  onResume(): void;
}

function readLang(): Lang {
  try {
    return localStorage.getItem(LANG_KEY) === 'en' ? 'en' : 'es';
  } catch {
    return 'es';
  }
}

export class UI {
  private lang: Lang = readLang();
  private cb: UICallbacks;
  private goTitleIdx = 0;
  private lastScore = -1;
  private lastRecord = 0;
  private lastResult: RunResult | null = null;

  private hud: HTMLElement;
  private title: HTMLElement;
  private gameover: HTMLElement;
  private pause: HTMLElement;
  private scoreEl: HTMLElement;
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
  private btnAgain: HTMLElement;
  private pauseTitle: HTMLElement;
  private pauseSub: HTMLElement;

  constructor(root: HTMLElement, cb: UICallbacks) {
    this.cb = cb;
    root.innerHTML = `
      <div id="hud" class="hidden">
        <div id="hud-score">0</div>
        <div id="hud-record"></div>
      </div>
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
    this.scoreEl = q('#hud-score');
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
    this.btnAgain = q('#btn-again');
    this.pauseTitle = q('#pause-title');
    this.pauseSub = q('#pause-sub');

    this.title.addEventListener('pointerdown', () => this.cb.onStart());
    this.langBtn.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      this.toggleLang();
    });
    this.gameover.addEventListener('pointerdown', () => this.cb.onRestart());
    this.pause.addEventListener('pointerdown', () => this.cb.onResume());

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
  }

  showPlaying(record: number): void {
    this.lastRecord = record;
    this.applyLang();
    this.lastScore = -1;
    this.setScore(0);
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
    this.goBadge.classList.toggle('hidden', !r.isNewRecord);
    this.gameover.classList.remove('hidden');
    this.hud.classList.add('hidden');
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
}
