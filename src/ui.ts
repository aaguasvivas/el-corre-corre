// ui.ts: DOM screens, HUD, floating popups, vehicle cards, copy strings, and
// the share card. Spanish-first with an EN flip. The slang stays Dominican in
// both languages.

import { VEHICLES, type VehicleId } from './config';
import { LADDER_STEPS, type RunResult } from './score';
import { drawDominicanFlag } from './flag';

type Lang = 'es' | 'en';
const LANG_KEY = 'ecc.v1.lang';
const POPUP_POOL = 12;

const STRINGS = {
  es: {
    subtitle: '¡Dale, que vamo’ tarde!',
    startTouch: "TOCA PA' EMPEZAR",
    startKey: 'DALE A ESPACIO',
    ctrlSteerTouch: 'Arrastra pa’ esquivar',
    ctrlSteerKey: 'A / D pa’ esquivar',
    ctrlTrickTouch: (trick: string) => `Desliza arriba y aguanta: ${trick}`,
    ctrlTrickKey: (trick: string) => `Aguanta W: ${trick}`,
    record: 'Récord',
    points: 'Puntos',
    distance: 'Distancia',
    platanos: 'Plátanos',
    again: 'OTRA VEZ',
    menu: 'MENÚ',
    share: 'COMPARTIR',
    resumeBtn: 'SEGUIR',
    newRecord: '¡NUEVO RÉCORD!',
    pause: 'PAUSA',
    resume: 'Toca pa’ seguir',
    closeCall: (n: number) => `¡Te quedaste a ${n}!`,
    inVehicle: (v: string) => `en ${v} por el Malecón`,
    shareText: (n: number) => `${n} puntos por el Malecón.`,
    shareAsk: '¿Me lo puedes ganar?',
    ariaSound: 'Sonido',
    ariaPause: 'Pausa',
    gameOverTitles: ['¡Te dieron, loco!', '¡Diache!', '¡Eso tuvo feo!'],
    cvPill: '¡EN CONTRA VÍA! ×2',
    trickPillBike: '¡CABALLITO! ×1.5',
    trickPillCar: '¡DERRAPE! ×1.5',
    trickBike: '¡CABALLITO!',
    trickCar: '¡DERRAPE!',
    air: '¡AIRE!',
    obelisco: '¡El Obelisco!',
    multUp: (n: number) => `¡MULTIPLICADOR ×${n}!`,
    nearMiss: ['¡Cerquita!', '¡Por un pelito!'],
    ladder: ['¡Eso!', '¡Duro!', '¡Diache!', "¡Tú ta' loco!", "¡ETE E' UN LOCO!", '¡LEYENDA DEL MALECÓN!'],
  },
  en: {
    subtitle: "Let's go, we're late!",
    startTouch: 'TAP TO START',
    startKey: 'PRESS SPACE',
    ctrlSteerTouch: 'Drag to weave',
    ctrlSteerKey: 'A / D to weave',
    ctrlTrickTouch: (trick: string) => `Swipe up and hold: ${trick}`,
    ctrlTrickKey: (trick: string) => `Hold W: ${trick}`,
    record: 'Best',
    points: 'Points',
    distance: 'Distance',
    platanos: 'Plantains',
    again: 'AGAIN',
    menu: 'MENU',
    share: 'SHARE',
    resumeBtn: 'RESUME',
    newRecord: 'NEW RECORD!',
    pause: 'PAUSED',
    resume: 'Tap to resume',
    closeCall: (n: number) => `Only ${n} short!`,
    inVehicle: (v: string) => `on ${v} down the Malecón`,
    shareText: (n: number) => `${n} points down the Malecón.`,
    shareAsk: 'Can you beat it?',
    ariaSound: 'Sound',
    ariaPause: 'Pause',
    gameOverTitles: ['They got you!', 'Wipeout!', 'That was ugly!'],
    cvPill: 'WRONG WAY! ×2',
    trickPillBike: 'WHEELIE! ×1.5',
    trickPillCar: 'DRIFT! ×1.5',
    trickBike: 'WHEELIE!',
    trickCar: 'DRIFT!',
    air: 'AIR!',
    obelisco: 'The Obelisco!',
    multUp: (n: number) => `MULTIPLIER ×${n}!`,
    nearMiss: ['So close!', 'By a hair!'],
    ladder: ["Let's go!", 'Hard!', 'Insane!', "You're crazy!", 'CERTIFIED MADMAN!', 'LEGEND OF THE MALECÓN!'],
  },
} as const;
const VEHICLE_IDS: VehicleId[] = ['pasola', 'motor', 'civic'];

const BANANA_SVG =
  '<svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true"><path d="M4 7 C5 15 13 20 20 15 C15 22 4 19 2 9 Z" fill="#f4c430" stroke="#7cb342" stroke-width="1.4"/></svg>';

// La bandera, properly: the white cross quarters it, blue at the upper hoist
// and lower fly, red at the upper fly and lower hoist, and el escudo in the
// middle. Without the escudo it just reads as the French flag, which is the
// one thing a Dominican flag must never do.
const FLAG_SVG = `<svg class="flag-svg" viewBox="0 0 80 50" role="img" aria-label="Bandera dominicana">
  <rect width="80" height="50" fill="#ffffff"/>
  <rect x="0" y="0" width="36" height="21" fill="#002d62"/>
  <rect x="44" y="0" width="36" height="21" fill="#ce1126"/>
  <rect x="0" y="29" width="36" height="21" fill="#ce1126"/>
  <rect x="44" y="29" width="36" height="21" fill="#002d62"/>
  <g class="escudo">
    <path d="M39.4 33.2c-5-1.1-7.6-5.2-7.2-10.6" fill="none" stroke="#2f7d32" stroke-width="1.9" stroke-linecap="round"/>
    <path d="M40.6 33.2c5-1.1 7.6-5.2 7.2-10.6" fill="none" stroke="#2f7d32" stroke-width="1.9" stroke-linecap="round"/>
    <path d="M33.6 25.4l-1.9 1.5M33 21.9l-2.1.9M33.4 18.6l-1.9-.2" stroke="#2f7d32" stroke-width="1.2" stroke-linecap="round"/>
    <path d="M46.4 25.4l1.9 1.5M47 21.9l2.1.9M46.6 18.6l1.9-.2" stroke="#2f7d32" stroke-width="1.2" stroke-linecap="round"/>
    <rect x="33.2" y="13.1" width="13.6" height="2.2" rx="1.1" fill="#002d62"/>
    <rect x="33.8" y="33.4" width="12.4" height="2.2" rx="1.1" fill="#ce1126"/>
    <path d="M35 16.9h10v8.1L40 30.4 35 25z" fill="#f7f3e8" stroke="#002d62" stroke-width="0.8"/>
    <rect x="39.3" y="18.5" width="1.4" height="8" fill="#f4c430"/>
    <rect x="37.1" y="20.8" width="5.8" height="1.4" fill="#f4c430"/>
  </g>
</svg>`;

export interface UICallbacks {
  onStart(): void;
  onRestart(): void;
  onResume(): void;
  onPause(): void;
  onToggleMute(): void;
  onSelectVehicle(v: VehicleId): void;
  onMenu(): void;
  onShare(): void;
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

// Every card is a different run, so every card needs a different filename.
// A fixed name meant each save silently replaced the last one. Score first so
// the folder sorts by how good the run was, then a stamp to keep ties apart,
// and a -record marker so the ones worth keeping are obvious at a glance.
function shareFileName(r: RunResult): string {
  const d = new Date();
  const p = (n: number): string => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
  return `el-corre-corre-${r.points}pts${r.isNewRecord ? '-record' : ''}-${stamp}.png`;
}

function statBars(): string {
  return VEHICLE_IDS.map((id) => {
    const v = VEHICLES[id];
    const bar = (label: string, n: number): string =>
      `<div class="vc-stat"><span>${label}</span><div class="vc-bar"><b style="width:${n * 20}%"></b></div></div>`;
    return `
      <div class="vcard" data-v="${id}">
        <div class="vc-name">${v.name}</div>
        ${bar('VEL', v.stats.vel)}${bar('MAN', v.stats.man)}${bar('AGU', v.stats.agu)}
        <div class="vc-tag">${v.tagline}</div>
        <div class="vc-rec" data-rec="${id}"></div>
      </div>`;
  }).join('');
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
  private cabShown = false;
  private multShown = 1;
  private nearMissIdx = 0;
  private popupIdx = 0;
  private lastPopupAt = 0;
  private popupBurst = 0;
  private selectedVehicle: VehicleId = 'motor';

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
  private cabEl: HTMLElement;
  private platEl: HTMLElement;
  private multEl: HTMLElement;
  private hudRecordEl: HTMLElement;
  private subtitleEl: HTMLElement;
  private promptEl: HTMLElement;
  private ctrlSteerEl: HTMLElement;
  private ctrlTrickEl: HTMLElement;
  private readonly fontsReady: Promise<unknown> = document.fonts
    ? document.fonts.ready
    : Promise.resolve();
  // Which controls to advertise. Seeded from the device, then corrected by
  // whatever the player actually touches first: a phone has no space bar.
  private inputMode: 'touch' | 'key' = window.matchMedia('(pointer: coarse)').matches
    ? 'touch'
    : 'key';
  private titleRecordEl: HTMLElement;
  private langBtn: HTMLElement;
  private muteBtn: HTMLElement;
  private mutePauseBtn: HTMLElement;
  private pauseBtn: HTMLElement;
  private lastRecords: Record<VehicleId, number> | null = null;
  private goTitleEl: HTMLElement;
  private goBadge: HTMLElement;
  private goClose: HTMLElement;
  private goPointsLabel: HTMLElement;
  private goPoints: HTMLElement;
  private goDistLabel: HTMLElement;
  private goDist: HTMLElement;
  private goRecLabel: HTMLElement;
  private goRec: HTMLElement;
  private goPlatLabel: HTMLElement;
  private goPlat: HTMLElement;
  private btnAgain: HTMLElement;
  private btnMenu: HTMLElement;
  private btnShare: HTMLElement;
  private pauseTitle: HTMLElement;
  private btnResume: HTMLElement;
  private btnPauseMenu: HTMLElement;

  constructor(root: HTMLElement, cb: UICallbacks) {
    this.cb = cb;
    root.innerHTML = `
      <div id="vignette"></div>
      <div id="hud" class="hidden">
        <div id="hud-score">0</div>
        <div id="hud-combo" class="hidden"></div>
        <div id="hud-cv" class="hidden">¡EN CONTRA VÍA! ×2</div>
        <div id="hud-cab" class="hidden">¡CABALLITO! ×1.5</div>
        <div id="hud-record"></div>
        <div id="hud-left">
          <button id="hud-pause" type="button" aria-label="Pausa"><i></i><i></i></button>
          <div id="hud-platanos">${BANANA_SVG}<span id="plat-n">0</span></div>
          <div id="hud-mult" class="hidden">×2</div>
        </div>
      </div>
      <div id="popup-layer"></div>
      <div id="banner"></div>
      <div id="title" class="screen hidden">
        <button id="lang" class="chip" type="button"></button>
        <button id="mute" class="chip chip-mute" type="button" aria-label="Sonido">
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor"/><path class="snd-wave" d="M16.5 8.5c2 2 2 5 0 7" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/><line class="snd-slash" x1="4" y1="20" x2="20" y2="4" stroke="#ce1126" stroke-width="2.6" stroke-linecap="round"/></svg>
        </button>
        <div class="logo">
          <span class="logo-el">EL</span>
          <span class="logo-line">CORRE</span>
          <span class="logo-line">CORRE</span>
          <div class="flagbar">${FLAG_SVG}</div>
        </div>
        <div id="subtitle" class="subtitle"></div>
        <div id="vrow" class="vrow">${statBars()}</div>
        <div id="prompt" class="prompt"></div>
        <div id="controls" class="controls">
          <span id="ctrl-steer"></span>
          <span id="ctrl-trick"></span>
        </div>
        <div id="title-record" class="title-record"></div>
      </div>
      <div id="gameover" class="screen hidden">
        <div class="card">
          <div id="go-title" class="go-title"></div>
          <div id="go-new" class="badge hidden"></div>
          <div id="go-close" class="close-call hidden"></div>
          <div id="go-points-label" class="go-points-label"></div>
          <div id="go-points" class="go-points">0</div>
          <div class="go-rows">
            <div><span id="go-dist-label"></span><b id="go-dist"></b></div>
            <div><span id="go-rec-label"></span><b id="go-rec"></b></div>
            <div><span id="go-plat-label"></span><b id="go-plat"></b></div>
          </div>
          <button id="btn-again" class="btn-big" type="button"></button>
          <div class="btn-row">
            <button id="btn-menu" class="btn-mid" type="button"></button>
            <button id="btn-share" class="btn-mid btn-share" type="button"></button>
          </div>
        </div>
      </div>
      <div id="pause" class="screen hidden">
        <button id="mute-pause" class="chip chip-mute" type="button" aria-label="Sonido">
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor"/><path class="snd-wave" d="M16.5 8.5c2 2 2 5 0 7" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/><line class="snd-slash" x1="4" y1="20" x2="20" y2="4" stroke="#ce1126" stroke-width="2.6" stroke-linecap="round"/></svg>
        </button>
        <div id="pause-title" class="pause-title"></div>
        <div class="pause-btns">
          <button id="btn-resume" class="btn-big" type="button"></button>
          <button id="btn-pause-menu" class="btn-mid" type="button"></button>
        </div>
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
    this.cabEl = q('#hud-cab');
    this.platEl = q('#plat-n');
    this.multEl = q('#hud-mult');
    this.hudRecordEl = q('#hud-record');
    this.subtitleEl = q('#subtitle');
    this.promptEl = q('#prompt');
    this.ctrlSteerEl = q('#ctrl-steer');
    this.ctrlTrickEl = q('#ctrl-trick');
    this.titleRecordEl = q('#title-record');
    this.langBtn = q('#lang');
    this.muteBtn = q('#mute');
    this.mutePauseBtn = q('#mute-pause');
    this.pauseBtn = q('#hud-pause');
    this.goTitleEl = q('#go-title');
    this.goBadge = q('#go-new');
    this.goClose = q('#go-close');
    this.goPointsLabel = q('#go-points-label');
    this.goPoints = q('#go-points');
    this.goDistLabel = q('#go-dist-label');
    this.goDist = q('#go-dist');
    this.goRecLabel = q('#go-rec-label');
    this.goRec = q('#go-rec');
    this.goPlatLabel = q('#go-plat-label');
    this.goPlat = q('#go-plat');
    this.btnAgain = q('#btn-again');
    this.btnMenu = q('#btn-menu');
    this.btnShare = q('#btn-share');
    this.pauseTitle = q('#pause-title');
    this.btnResume = q('#btn-resume');
    this.btnPauseMenu = q('#btn-pause-menu');

    const layer = q('#popup-layer');
    for (let i = 0; i < POPUP_POOL; i++) {
      const el = document.createElement('div');
      el.className = 'popup';
      layer.appendChild(el);
      this.popups.push(el);
    }

    // Two listeners for the life of the page: keep the on-screen hints honest
    // on hybrid devices (iPad with a keyboard, touch laptops).
    window.addEventListener(
      'pointerdown',
      (e) => {
        if (e.pointerType === 'touch') this.setInputMode('touch');
      },
      { capture: true, passive: true },
    );
    window.addEventListener('keydown', () => this.setInputMode('key'), { capture: true });

    this.title.addEventListener('pointerdown', () => this.cb.onStart());
    this.langBtn.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      this.toggleLang();
    });
    this.muteBtn.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      this.cb.onToggleMute();
    });
    // Mid-run mute has to be reachable without a keyboard and without
    // throwing away the run, so it lives on the pause screen too.
    this.mutePauseBtn.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      this.cb.onToggleMute();
    });
    for (const card of root.querySelectorAll<HTMLElement>('.vcard')) {
      card.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        this.cb.onSelectVehicle(card.dataset.v as VehicleId);
      });
    }
    this.gameover.addEventListener('pointerdown', () => this.cb.onRestart());
    this.btnMenu.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      this.cb.onMenu();
    });
    this.btnShare.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      this.cb.onShare();
    });
    this.btnResume.addEventListener('pointerdown', () => this.cb.onResume());
    this.btnPauseMenu.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      this.cb.onMenu();
    });
    q('#hud-pause').addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      this.cb.onPause();
    });

    this.applyLang();
  }

  private t(): (typeof STRINGS)[Lang] {
    return STRINGS[this.lang];
  }

  private setInputMode(mode: 'touch' | 'key'): void {
    if (this.inputMode === mode) return;
    this.inputMode = mode;
    this.applyLang();
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
    this.muteBtn.setAttribute('aria-label', t.ariaSound);
    this.mutePauseBtn.setAttribute('aria-label', t.ariaSound);
    this.pauseBtn.setAttribute('aria-label', t.ariaPause);
    this.cvEl.textContent = t.cvPill;
    this.cabEl.textContent =
      this.selectedVehicle === 'civic' ? t.trickPillCar : t.trickPillBike;
    this.subtitleEl.textContent = t.subtitle;
    const touch = this.inputMode === 'touch';
    this.promptEl.textContent = touch ? t.startTouch : t.startKey;
    const trick = this.selectedVehicle === 'civic' ? t.trickCar : t.trickBike;
    this.ctrlSteerEl.textContent = touch ? t.ctrlSteerTouch : t.ctrlSteerKey;
    this.ctrlTrickEl.textContent = touch ? t.ctrlTrickTouch(trick) : t.ctrlTrickKey(trick);
    this.titleRecordEl.textContent =
      this.lastRecord > 0 ? `${t.record}: ${this.lastRecord}` : '';
    this.hudRecordEl.textContent =
      this.lastRecord > 0 ? `${t.record.toUpperCase()} ${this.lastRecord}` : '';
    this.goPointsLabel.textContent = t.points.toUpperCase();
    this.goDistLabel.textContent = `${t.distance} `;
    this.goRecLabel.textContent = `${t.record} `;
    this.goPlatLabel.textContent = `${t.platanos} `;
    this.btnAgain.textContent = t.again;
    this.btnMenu.textContent = t.menu;
    this.btnShare.textContent = t.share;
    this.goBadge.textContent = t.newRecord;
    this.pauseTitle.textContent = t.pause;
    this.btnResume.textContent = t.resumeBtn;
    this.btnPauseMenu.textContent = t.menu;
    if (this.lastResult) {
      this.goTitleEl.textContent = t.gameOverTitles[this.goTitleIdx];
    }
    // Relabel the card records directly rather than calling updateVehicles:
    // that also rewrites ctrlTrickEl, which this method has just set.
    if (this.lastRecords) {
      for (const card of document.querySelectorAll<HTMLElement>('.vcard')) {
        const id = card.dataset.v as VehicleId;
        const rec = card.querySelector<HTMLElement>(`[data-rec="${id}"]`);
        if (rec) rec.textContent = this.lastRecords[id] > 0 ? `${t.record} ${this.lastRecords[id]}` : '·';
      }
    }
  }

  updateVehicles(selected: VehicleId, records: Record<VehicleId, number>): void {
    this.selectedVehicle = selected;
    this.lastRecords = records;
    const t = this.t();
    this.cabEl.textContent = selected === 'civic' ? t.trickPillCar : t.trickPillBike;
    const trick = selected === 'civic' ? t.trickCar : t.trickBike;
    this.ctrlTrickEl.textContent =
      this.inputMode === 'touch' ? t.ctrlTrickTouch(trick) : t.ctrlTrickKey(trick);
    for (const card of document.querySelectorAll<HTMLElement>('.vcard')) {
      const id = card.dataset.v as VehicleId;
      card.classList.toggle('sel', id === selected);
      const rec = card.querySelector<HTMLElement>(`[data-rec="${id}"]`)!;
      rec.textContent = records[id] > 0 ? `${t.record} ${records[id]}` : '·';
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
    this.setCaballito(false);
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
    this.setCaballito(false);
    this.multShown = 1;
    this.multEl.classList.add('hidden');
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
    this.goClose.classList.toggle('hidden', r.closeCall === null);
    if (r.closeCall !== null) this.goClose.textContent = t.closeCall(r.closeCall);
    this.gameover.classList.remove('hidden');
    this.hud.classList.add('hidden');
    this.setContraVia(false);
    this.setCaballito(false);
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

  setCaballito(on: boolean): void {
    if (on === this.cabShown) return;
    this.cabShown = on;
    this.cabEl.classList.toggle('hidden', !on);
  }

  setMuted(m: boolean): void {
    this.muteBtn.classList.toggle('muted', m);
    this.mutePauseBtn.classList.toggle('muted', m);
  }

  setDistMult(n: number): void {
    if (n === this.multShown) return;
    this.multShown = n;
    this.multEl.classList.toggle('hidden', n < 2);
    this.multEl.textContent = `×${n}`;
    this.multEl.classList.remove('bump');
    void this.multEl.offsetWidth;
    this.multEl.classList.add('bump');
  }

  nextNearMissText(): string {
    const texts = this.t().nearMiss;
    this.nearMissIdx = (this.nearMissIdx + 1) % texts.length;
    return texts[this.nearMissIdx];
  }

  ladderHitText(combo: number): string | null {
    const idx = LADDER_STEPS.indexOf(combo as (typeof LADDER_STEPS)[number]);
    return idx >= 0 ? this.t().ladder[idx] : null;
  }

  ladderTierText(combo: number): string | null {
    let text: string | null = null;
    LADDER_STEPS.forEach((n, i) => {
      if (combo >= n) text = this.t().ladder[i];
    });
    return text;
  }

  popupTrick(pts: number, x: number, y: number): void {
    const t = this.t();
    const name = this.selectedVehicle === 'civic' ? t.trickCar : t.trickBike;
    this.popup(`${name} +${pts}`, x, y, 'pop-md pop-gold');
  }

  popupAir(pts: number, x: number, y: number): void {
    this.popup(`${this.t().air} +${pts}`, x, y, 'pop-md pop-gold');
  }

  popupObelisco(): void {
    this.popup(this.t().obelisco, 50, 28, 'pop-lg pop-gold');
  }

  popupMultUp(n: number): void {
    this.popup(this.t().multUp(n), 50, 40, 'pop-lg pop-gold');
  }

  bannerNewRecord(): void {
    this.banner(this.t().newRecord);
  }

  popup(text: string, xPct: number, yPct: number, cls: string): void {
    const now = performance.now();
    if (now - this.lastPopupAt < 220) this.popupBurst += 1;
    else this.popupBurst = 0;
    this.lastPopupAt = now;
    const el = this.popups[this.popupIdx];
    this.popupIdx = (this.popupIdx + 1) % POPUP_POOL;
    el.className = `popup ${cls}`;
    el.textContent = text;
    el.style.left = '50%';
    el.style.top = `${clampPct(yPct - this.popupBurst * 6, 10, 80)}%`;
    // This reflow already had to happen to restart the animation, so reading
    // the width here is free. A popup is centred on its x, so a wide one
    // fired near the kerb used to hang off the screen: pull it in by its own
    // half width instead of a fixed 8% guess, and leave narrow ones where the
    // event actually happened.
    void el.offsetWidth;
    const halfPct = ((el.offsetWidth / 2 + 8) / window.innerWidth) * 100;
    el.style.left = `${clampPct(xPct, Math.min(halfPct, 50), Math.max(100 - halfPct, 50))}%`;
    el.classList.add('go');
  }

  banner(text: string): void {
    this.bannerEl.textContent = text;
    this.bannerEl.classList.remove('show');
    void this.bannerEl.offsetWidth;
    this.bannerEl.classList.add('show');
  }

  // ---------------- share card ----------------

  async shareCard(r: RunResult): Promise<void> {
    const t = this.t();
    const veh = VEHICLES[this.selectedVehicle];
    // Awaited, not requested, here: the font was warmed at boot so this
    // resolves immediately and iOS still sees navigator.share as a prompt
    // response rather than a late async call.
    try {
      await this.fontsReady;
    } catch {
      // draw with whatever we have
    }
    const c = document.createElement('canvas');
    c.width = 1080;
    c.height = 1350;
    const g = c.getContext('2d')!;

    const sky = g.createLinearGradient(0, 0, 0, 1350);
    sky.addColorStop(0, '#6ec6e6');
    sky.addColorStop(0.52, '#ffd9a0');
    sky.addColorStop(0.7, '#ffe9bc');
    sky.addColorStop(1, '#17a2b8');
    g.fillStyle = sky;
    g.fillRect(0, 0, 1080, 1350);

    g.fillStyle = 'rgba(255,243,196,0.55)';
    g.beginPath();
    g.arc(830, 760, 200, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#fff3c4';
    g.beginPath();
    g.arc(830, 760, 130, 0, Math.PI * 2);
    g.fill();

    g.fillStyle = '#17a2b8';
    g.fillRect(0, 900, 1080, 450);
    g.fillStyle = 'rgba(255,255,255,0.35)';
    for (let i = 0; i < 60; i++) {
      g.fillRect(Math.random() * 1080, 910 + Math.random() * 420, 10 + Math.random() * 26, 3);
    }

    // the road wedge
    g.fillStyle = '#3e3a38';
    g.beginPath();
    g.moveTo(240, 1350);
    g.lineTo(470, 900);
    g.lineTo(610, 900);
    g.lineTo(840, 1350);
    g.closePath();
    g.fill();
    g.strokeStyle = '#f4c430';
    g.lineWidth = 10;
    g.setLineDash([46, 34]);
    g.beginPath();
    g.moveTo(540, 900);
    g.lineTo(540, 1350);
    g.stroke();
    g.setLineDash([]);

    const stroked = (
      text: string,
      x: number,
      y: number,
      size: number,
      fill: string,
      stroke: string,
      strokeW: number,
    ): void => {
      g.font = `${size}px "Lilita One", sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.lineWidth = strokeW;
      g.lineJoin = 'round';
      g.strokeStyle = stroke;
      g.strokeText(text, x, y);
      g.fillStyle = fill;
      g.fillText(text, x, y);
    };

    g.save();
    g.translate(540, 0);
    g.rotate(-0.03);
    g.fillStyle = '#002d62';
    g.beginPath();
    g.roundRect(-74, 92, 148, 66, 16);
    g.fill();
    stroked('EL', 0, 126, 48, '#ffffff', '#002d62', 0.01);
    stroked('CORRE', 0, 226, 130, '#ffffff', '#002d62', 16);
    stroked('CORRE', 0, 344, 130, '#ffffff', '#002d62', 16);
    g.restore();

    // La bandera under the logo, escudo and all. The three-band version this
    // replaced read as the French flag on a group-chat thumbnail. Sized to the
    // band between the wordmark and the ¡NUEVO RÉCORD! badge.
    const flagW = 120;
    g.save();
    g.shadowColor = 'rgba(0,45,98,0.35)';
    g.shadowBlur = 0;
    g.shadowOffsetY = 4;
    drawDominicanFlag(g, 540 - flagW / 2, 396, flagW);
    g.restore();

    if (r.isNewRecord) {
      g.save();
      g.translate(540, 520); // clears the flag above it
      g.rotate(-0.04);
      g.fillStyle = '#ce1126';
      g.beginPath();
      g.roundRect(-230, -34, 460, 68, 18);
      g.fill();
      stroked(t.newRecord, 0, 2, 44, '#ffffff', '#ce1126', 0.01);
      g.restore();
    }

    stroked(t.points.toUpperCase(), 540, 585, 44, '#002d62', '#002d62', 0.01);
    let size = 230;
    g.font = `${size}px "Lilita One", sans-serif`;
    while (g.measureText(String(r.points)).width > 900 && size > 90) {
      size -= 10;
      g.font = `${size}px "Lilita One", sans-serif`;
    }
    stroked(String(r.points), 540, 715, size, '#002d62', '#ffffff', 20);

    stroked(
      `${t.distance} ${r.distanceM} m   ·   ${t.platanos} ${r.platanos}`,
      540,
      860,
      42,
      '#ffffff',
      '#002d62',
      8,
    );
    stroked(t.inVehicle(veh.name), 540, 985, 52, '#fff3c4', '#002d62', 10);
    stroked(t.shareAsk, 540, 1160, 74, '#ffffff', '#ce1126', 12);
    stroked('EL CORRE CORRE', 540, 1300, 34, 'rgba(255,255,255,0.85)', '#0e7490', 6);

    const blob = await new Promise<Blob | null>((res) => c.toBlob(res, 'image/png'));
    if (!blob) return;
    const name = shareFileName(r);
    const file = new File([blob], name, { type: 'image/png' });
    const text = `${t.shareText(r.points)} ${t.shareAsk}`;
    let canFiles = false;
    try {
      canFiles = navigator.canShare?.({ files: [file] }) ?? false;
    } catch {
      canFiles = false; // a throwing canShare just means no file sharing here
    }
    if (canFiles) {
      try {
        await navigator.share({ files: [file], title: 'El Corre Corre', text });
        return;
      } catch (e) {
        // Dismissing the sheet is a real choice, so respect it. Anything else
        // (iOS refusing the call, no activation left) falls through to the
        // download, because COMPARTIR must never be a dead button.
        if ((e as { name?: string } | null)?.name === 'AbortError') return;
      }
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }
}
