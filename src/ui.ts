// ui.ts: DOM screens, HUD, floating popups, vehicle cards, copy strings, and
// the share card. Spanish-first with an EN flip. The slang stays Dominican in
// both languages.

import { CONFIG, VEHICLES, type VehicleId } from './config';
import { LADDER_STEPS, type PinturaGoal, type RunResult } from './score';
import { barrioMultFor, mandaoPerRun, type Completion, type Mandao, type MandaoKind, type MandaosView } from './missions';
import { nextBorderIn, nextTramoAfter } from './tour';
import { drawDominicanFlag } from './flag';
import type { SetPieceKind } from './traffic';

type Lang = 'es' | 'en';
const LANG_KEY = 'ecc.v1.lang';
const PEDAL_SEEN_KEY = 'ecc.v1.pedalSeen'; // '1' once the gas pedal has been pressed, ever
const POPUP_POOL = 12;

// reachTramo targets are tramo borders: the copy names the place.
const TRAMO_M = CONFIG.tramoLengthM;

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
    tapeRecord: 'TU RÉCORD',
    pause: 'PAUSA',
    resume: 'Toca pa’ seguir',
    closeCall: (n: number) => `¡Te quedaste a ${n}!`,
    inVehicle: (v: string) => `en ${v} por el Malecón`,
    inVehicleReached: (v: string, place: string) => `en ${v} hasta ${place}`,
    reachedTramo: (place: string) => `Llegaste hasta ${place}`,
    nextTramoIn: (place: string, m: number) => `${place} a ${m} m`,
    shareText: (n: number) => `${n} puntos por el Malecón.`,
    shareAsk: '¿Me puedes ganar?',
    ariaSound: 'Sonido',
    ariaPause: 'Pausa',
    gameOverTitles: ['¡Te dieron, loco!', '¡Diache!', '¡Eso tuvo feo!'],
    cvPill: '¡EN CONTRA VÍA! ×2',
    trickPillBike: '¡CABALLITO! ×1.5',
    trickPillCar: '¡DERRAPE! ×1.5',
    ctrlThrottleTouch: 'Aguanta ¡DALE! pa’ acelerar · FRENO pa’ frenar',
    ctrlThrottleKey: '↑ acelera · ↓ frena',
    pedalGas: '¡DALE!',
    pedalBrake: 'FRENO',
    pedalBrakeHot: '¡CALIENTE!', // el freno caliente: overheated pads, no brake
    countdownGo: '¡DALE!', // the resume countdown's last beat
    shieldSaved: '¡TE SALVÓ LA BENDICIÓN!',
    ariaGas: 'Acelerar',
    ariaBrake: 'Frenar',
    trickBike: '¡CABALLITO!',
    trickCar: '¡DERRAPE!',
    air: '¡AIRE!',
    obelisco: '¡El Obelisco!',
    multUp: (n: number) => `¡MULTIPLICADOR ×${n}!`,
    // Set pieces call their name; escalation says the street got harder.
    setPieces: {
      guaguaLenta: '¡GUAGUA LENTA!',
      tapon: '¡TAPÓN!',
      parada: '¡SE PARÓ LA GUAGUA!',
      caravana: '¡CARAVANA!',
      camionPlatanos: '¡SE LE CAEN LOS PLÁTANOS!',
      calleEstrecha: '¡CALLE ESTRECHA!',
      horaPico: '¡HORA PICO!',
    } satisfies Record<SetPieceKind, string>,
    streetWild: '¡La calle se puso brava!',
    tramoNames: { malecon: 'EL MALECÓN', zona: 'LA ZONA COLONIAL', campo: 'EL CAMPO' },
    pinturaNew: '¡Pintura nueva!',
    tramoKicker: 'LLEGASTE A',
    pinturaEquip: 'PONER',
    nearMiss: '¡Cerquita!',
    razorMiss: '¡Por un pelito!',
    ladder: ['¡Eso!', '¡Duro!', '¡Diache!', "¡Tú ta' loco!", "¡ETE E' UN LOCO!", '¡LEYENDA DEL MALECÓN!'],
    // Records: ¡NUEVO RÉCORD! is points, La Cinta is distance.
    farRecord: '¡MÁS LEJOS QUE NUNCA!',
    farLine: (m: number) => `¡Más lejos que nunca! ${fmtN(m)} m`,
    goalTape: 'LA META',
    goalReached: '¡LLEGASTE A LA META!',
    recordNear: '¡Ya casi el récord!',
    toGo: (n: number) => `FALTAN ${n}`, // raw digits, like the score and RÉCORD n beside it
    // Los Mandaos
    mandaos: 'LOS MANDAOS',
    mandaoChip: (done: number, level: number, mult: string, name: string) =>
      level > 0 ? `MANDAOS ${done}/3 · NIVEL ${level} ${mult}` : `MANDAOS ${done}/3 · ${name.toUpperCase()}`,
    levelLine: (level: number, name: string, mult: string) => `Nivel ${level} · ${name} · ${mult} en puntos`,
    levelNames: ['Novato', 'Pasajero', 'Motoconchista', 'Tíguere', 'Tíguere de Verdad', 'Jefe del Malecón', 'Leyenda del Malecón'],
    mandaoDone: '¡MANDAO HECHO!',
    dailyDone: '¡MANDAO DEL DÍA!',
    levelUp: (name: string, mult: string) => `¡SUBISTE A ${name.toUpperCase()}! ${mult}`,
    levelUpKicker: '¡SUBISTE DE NIVEL!',
    dailyTitle: 'EL MANDAO DEL DÍA',
    dailyTag: 'HOY',
    streak: (n: number) => (n === 1 ? 'Racha: 1 día' : `Racha: ${n} días`),
    reward: (n: number) => `+${fmtN(n)} plátanos`,
    closeHint: 'Toca pa’ cerrar',
    perRun: ' en una corrida',
    earned: (n: number) => `+${fmtN(n)} plátanos`,
    pinturaNeed: (n: number, name: string) => `Te faltan ${fmtN(n)} plátanos pa’ ${name}`,
    pinturaReady: (name: string) => `¡Ya te alcanza pa’ ${name}!`,
    mandao: {
      platanosRun: (n: number) => `Recoge ${fmtN(n)} plátanos`,
      nearMissRun: (n: number) => (n === 1 ? 'Haz una cerquita' : `Haz ${n} cerquitas`),
      razorRun: (n: number) => (n === 1 ? 'Pasa una vez por un pelito' : `Pasa ${n} veces por un pelito`),
      comboReach: (n: number) => `Llega a combo ×${n}`,
      cvMetersRun: (n: number) => `Corre ${fmtN(n)} m en contra vía`,
      cvNearMissRun: (n: number) => (n === 1 ? 'Haz una cerquita en contra vía' : `Haz ${n} cerquitas en contra vía`),
      trickSecRun: (n: number, trick: string) => `Aguanta ${n} s de ${trick}`,
      trickHold: (n: number, trick: string) => `Echa un ${trick} de ${n} s`,
      gasSecRun: (n: number) => `Ve a fondo ${n} s`,
      airRun: (n: number) => (n === 1 ? 'Vuela un policía acostao' : `Vuela ${n} policías acostaos`),
      distRun: (n: number) => `Llega a ${fmtN(n)} m`,
      reachTramo: (n: number) =>
        n === TRAMO_M ? 'Llega a La Zona Colonial' : n === 2 * TRAMO_M ? 'Llega a El Campo' : n === 3 * TRAMO_M ? 'Dale la vuelta al país' : `Llega a ${fmtN(n)} m`,
      pointsRun: (n: number) => `Haz ${fmtN(n)} puntos`,
      cleanMeters: (n: number) => `Corre ${fmtN(n)} m seguidos sin caer en un hoyo`,
      pasolaMeters: (n: number) => `Corre ${fmtN(n)} m en LA PASOLA`,
      civicMeters: (n: number) => `Corre ${fmtN(n)} m en EL CIVIC TUNEAO`,
      platanosTotal: (n: number) => `Recoge ${fmtN(n)} plátanos en total`,
    } satisfies Record<MandaoKind, (n: number, trick: string) => string>,
    trickNounBike: 'caballito',
    trickNounCar: 'derrape',
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
    tapeRecord: 'YOUR RECORD',
    pause: 'PAUSED',
    resume: 'Tap to resume',
    closeCall: (n: number) => `Only ${n} short!`,
    inVehicle: (v: string) => `on ${v} down the Malecón`,
    inVehicleReached: (v: string, place: string) => `on ${v} all the way to ${place}`,
    reachedTramo: (place: string) => `You reached ${place}`,
    nextTramoIn: (place: string, m: number) => `${place} ${m} m away`,
    shareText: (n: number) => `${n} points down the Malecón.`,
    shareAsk: 'Can you beat me?',
    ariaSound: 'Sound',
    ariaPause: 'Pause',
    gameOverTitles: ['They got you!', 'Wipeout!', 'That was ugly!'],
    cvPill: 'WRONG WAY! ×2',
    trickPillBike: 'WHEELIE! ×1.5',
    trickPillCar: 'DRIFT! ×1.5',
    ctrlThrottleTouch: 'Hold GAS to speed up · BRAKE to slow down',
    ctrlThrottleKey: '↑ gas · ↓ brake',
    pedalGas: 'GAS',
    pedalBrake: 'BRAKE',
    pedalBrakeHot: 'HOT!',
    countdownGo: 'GO!',
    // DECISION: the power-up keeps its name in EN, as its pickup popup does
    shieldSaved: 'LA BENDICIÓN SAVED YOU!',
    ariaGas: 'Gas',
    ariaBrake: 'Brake',
    trickBike: 'WHEELIE!',
    trickCar: 'DRIFT!',
    air: 'AIR!',
    obelisco: 'The Obelisco!',
    multUp: (n: number) => `MULTIPLIER ×${n}!`,
    setPieces: {
      guaguaLenta: 'SLOW BUS!',
      tapon: 'TRAFFIC JAM!',
      parada: 'BUS STOP!',
      caravana: 'CONVOY!',
      camionPlatanos: 'SPILLED PLANTAINS!',
      calleEstrecha: 'NARROW STREET!',
      horaPico: 'RUSH HOUR!',
    } satisfies Record<SetPieceKind, string>,
    streetWild: 'The street got wild!',
    // Places keep their names in both languages
    tramoNames: { malecon: 'EL MALECÓN', zona: 'LA ZONA COLONIAL', campo: 'EL CAMPO' },
    pinturaNew: 'New paint!',
    tramoKicker: 'YOU REACHED',
    pinturaEquip: 'USE',
    nearMiss: 'So close!',
    razorMiss: 'By a hair!',
    ladder: ["Let's go!", 'Hard!', 'Insane!', "You're crazy!", 'CERTIFIED MADMAN!', 'LEGEND OF THE MALECÓN!'],
    farRecord: 'FARTHEST EVER!',
    farLine: (m: number) => `Farthest ever! ${fmtN(m)} m`,
    goalTape: 'GOAL',
    goalReached: 'GOAL REACHED!',
    recordNear: 'Record in reach!',
    toGo: (n: number) => `${n} TO GO`,
    mandaos: 'MISSIONS',
    mandaoChip: (done: number, level: number, mult: string, name: string) =>
      level > 0 ? `MISSIONS ${done}/3 · LEVEL ${level} ${mult}` : `MISSIONS ${done}/3 · ${name.toUpperCase()}`,
    levelLine: (level: number, name: string, mult: string) => `Level ${level} · ${name} · ${mult} on points`,
    levelNames: ['Rookie', 'Passenger', 'Moto-taxi Rider', 'Tíguere', 'Real Tíguere', 'Boss of the Malecón', 'Legend of the Malecón'],
    mandaoDone: 'MISSION DONE!',
    dailyDone: 'DAILY DONE!',
    levelUp: (name: string, mult: string) => `LEVEL UP: ${name.toUpperCase()}! ${mult}`,
    levelUpKicker: 'LEVEL UP!',
    dailyTitle: 'TODAY’S MISSION',
    dailyTag: 'TODAY',
    streak: (n: number) => (n === 1 ? 'Streak: 1 day' : `Streak: ${n} days`),
    reward: (n: number) => `+${fmtN(n)} plantains`,
    closeHint: 'Tap to close',
    perRun: ' in one run',
    earned: (n: number) => `+${fmtN(n)} plantains`,
    pinturaNeed: (n: number, name: string) => `${fmtN(n)} more plantains for ${name}`,
    pinturaReady: (name: string) => `You can afford ${name}!`,
    mandao: {
      platanosRun: (n: number) => `Grab ${fmtN(n)} plantains`,
      nearMissRun: (n: number) => (n === 1 ? 'Pull a near-miss' : `Pull ${n} near-misses`),
      razorRun: (n: number) => (n === 1 ? 'Squeeze by a hair once' : `Squeeze by a hair ${n} times`),
      comboReach: (n: number) => `Hit a ×${n} combo`,
      cvMetersRun: (n: number) => `Ride ${fmtN(n)} m on the wrong side`,
      cvNearMissRun: (n: number) => (n === 1 ? 'Pull a wrong-way near-miss' : `Pull ${n} wrong-way near-misses`),
      trickSecRun: (n: number, trick: string) => `${trick} for ${n} s`,
      trickHold: (n: number, trick: string) => `Hold a ${n} s ${trick.toLowerCase()}`,
      gasSecRun: (n: number) => `Floor it for ${n} s`,
      airRun: (n: number) => (n === 1 ? 'Launch off a speed bump' : `Launch off ${n} speed bumps`),
      distRun: (n: number) => `Reach ${fmtN(n)} m`,
      reachTramo: (n: number) =>
        n === TRAMO_M ? 'Reach La Zona Colonial' : n === 2 * TRAMO_M ? 'Reach El Campo' : n === 3 * TRAMO_M ? 'Ride the whole country' : `Reach ${fmtN(n)} m`,
      pointsRun: (n: number) => `Score ${fmtN(n)} points`,
      cleanMeters: (n: number) => `Ride ${fmtN(n)} m straight without a pothole`,
      pasolaMeters: (n: number) => `Ride ${fmtN(n)} m on LA PASOLA`,
      civicMeters: (n: number) => `Drive ${fmtN(n)} m in EL CIVIC TUNEAO`,
      platanosTotal: (n: number) => `Collect ${fmtN(n)} plantains in total`,
    } satisfies Record<MandaoKind, (n: number, trick: string) => string>,
    trickNounBike: 'Wheelie',
    trickNounCar: 'Drift',
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
    <clipPath id="ecc-shield"><path d="M35 16.9h10v8.1L40 30.4 35 25z"/></clipPath>
    <path d="M35 16.9h10v8.1L40 30.4 35 25z" fill="#ffffff"/>
    <g clip-path="url(#ecc-shield)">
      <rect x="35" y="16.9" width="4.2" height="4.8" fill="#002d62"/>
      <rect x="40.8" y="16.9" width="4.2" height="4.8" fill="#ce1126"/>
      <rect x="35" y="23.3" width="4.2" height="7.2" fill="#ce1126"/>
      <rect x="40.8" y="23.3" width="4.2" height="7.2" fill="#002d62"/>
    </g>
    <path d="M35 16.9h10v8.1L40 30.4 35 25z" fill="none" stroke="#002d62" stroke-width="0.8"/>
    <path d="M40 23.2 37.4 22.5v2.1L40 25.4l2.6-.8v-2.1z" fill="#f7f3e8" stroke="#002d62" stroke-width="0.5"/>
    <path d="M40 23.2v2.2" stroke="#002d62" stroke-width="0.5"/>
    <rect x="39.6" y="18.2" width="0.8" height="3.6" fill="#f4c430"/>
    <rect x="38.4" y="19.2" width="3.2" height="0.8" fill="#f4c430"/>
  </g>
</svg>`;

export interface UICallbacks {
  onPedal(v: -1 | 0 | 1): void; // el pedal: -1 FRENO held, 0 released, 1 ¡DALE! held
  onStart(): void;
  onRestart(): void;
  onResume(): void;
  onPause(): void;
  onToggleMute(): void;
  onSelectVehicle(v: VehicleId): void;
  onMenu(): void;
  onShare(): void;
  onPinturaCycle(dir: 1 | -1): void; // flip through paints; the bike previews live
  onPinturaTap(): void; // equip the previewed paint, or buy it if locked
}

function readLang(): Lang {
  try {
    return localStorage.getItem(LANG_KEY) === 'en' ? 'en' : 'es';
  } catch {
    return 'es';
  }
}

function readPedalSeen(): boolean {
  try {
    return localStorage.getItem(PEDAL_SEEN_KEY) === '1';
  } catch {
    return false;
  }
}

// "×1.5" from 1.5: the pedal tags read the real multipliers, never a copy.
function multTag(m: number): string {
  return `×${m}`;
}

// 12,000: the same grouping in both languages, like the tape label.
function fmtN(n: number): string {
  return Math.floor(n).toLocaleString('en-US');
}

// ×2, ×3.8, ×15: one decimal under ten, whole numbers above.
function fmtMult(m: number): string {
  return `×${m >= 10 ? Math.round(m) : Math.round(m * 10) / 10}`;
}

// The barrio multiplier moves in quarters: ×1.25, ×1.5, ×3.
function fmtBarrio(m: number): string {
  return `×${Math.round(m * 100) / 100}`;
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
        <div class="vc-pcycle">
          <button class="pc-arrow pc-prev" type="button" aria-label="anterior">&#8249;</button>
          <button class="pc-swatch" type="button" aria-label="pintura"></button>
          <button class="pc-arrow pc-next" type="button" aria-label="siguiente">&#8250;</button>
        </div>
        <div class="pc-state"><span class="pc-label"></span></div>
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
  private comboBarShown = -1;
  private platShown = -1;
  private cvShown = false;
  private cabShown = false;
  private multQ = 10; // the live multiplier as shown, x10 (10 = ×1, hidden)
  private recordKey = Number.NaN; // what the HUD record label says now (see setRecordLabel)
  private mandaoView: MandaosView | null = null;
  private toastQueue: Array<[string, string]> = [];
  private toastBusy = false;
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
  private countdownEl: HTMLElement;
  private flashEl: HTMLElement;
  private popups: HTMLElement[] = [];
  private scoreEl: HTMLElement;
  private comboEl: HTMLElement;
  private cvEl: HTMLElement;
  private cabEl: HTMLElement;
  private gasShown = false;
  private brakeShown = false;
  private brakeHeatShown = -1; // heat fill, in 5% steps
  private brakeHotShown = false;
  private speedLinesShown = -1;
  // El pedal. One pointer owns the cluster; every finger that ever landed on
  // it stays reserved (never steers, never swipes) until it lifts, even
  // after a pause or a crash released the pedal under it.
  private pedalsEl: HTMLElement;
  private pedalGasEl: HTMLElement;
  private pedalBrakeEl: HTMLElement;
  private pedalSpeedEl: HTMLElement;
  private pedalKmhEl: HTMLElement;
  private pedalLive = false;
  private pedalOwner: number | null = null;
  private pedalReserved = new Set<number>();
  private pedalValue: -1 | 0 | 1 = 0;
  private pedalSplit = 0;
  private pedalShown: -1 | 0 | 1 = 0;
  private kmhShown = -1;
  private pedalSeen = readPedalSeen();
  private ctrlThrottleEl: HTMLElement;
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
  private mandaoChipEl: HTMLElement;
  private mandaoSheetEl: HTMLElement;
  private goFarEl: HTMLElement;
  private goMandaosEl: HTMLElement;
  private goEarnedEl: HTMLElement;
  private pauseMandaosEl: HTMLElement;
  private toastEl: HTMLElement;
  private toastKickerEl: HTMLElement;
  private toastTextEl: HTMLElement;

  constructor(root: HTMLElement, cb: UICallbacks) {
    this.cb = cb;
    root.innerHTML = `
      <div id="vignette"></div>
      <div id="hud" class="hidden">
        <div id="speedlines"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>
        <div id="hud-score">0</div>
        <div id="hud-combo" class="hidden"><span id="combo-text"></span><i id="combo-bar"></i></div>
        <div id="hud-cv" class="hidden">¡EN CONTRA VÍA! ×2</div>
        <div id="hud-cab" class="hidden">¡CABALLITO! ×1.5</div>
        <div id="hud-record"></div>
        <div id="hud-left">
          <button id="hud-pause" type="button" aria-label="Pausa"><i></i><i></i></button>
          <div id="hud-platanos">${BANANA_SVG}<span id="plat-n">0</span></div>
          <div id="hud-mult" class="hidden">×2</div>
        </div>
        <div id="pedals" class="hidden">
          <div id="pedal-speed" class="pedal-speed"><b id="pedal-kmh">0</b><span>km/h</span></div>
          <b class="pedal-mult pedal-mult-brake">${multTag(CONFIG.brakeScoreMult)}</b>
          <b class="pedal-mult pedal-mult-gas">${multTag(CONFIG.gasScoreMult)}</b>
          <button id="pedal-brake" class="pedal pedal-brake" type="button"><i class="pedal-heat"></i><i class="pedal-tread"></i><span class="pedal-label"></span></button>
          <button id="pedal-gas" class="pedal pedal-gas" type="button"><i class="pedal-tread"></i><span class="pedal-label"></span></button>
        </div>
      </div>
      <div id="popup-layer"></div>
      <div id="banner"></div>
      <div id="countdown" class="hidden"></div>
      <div id="flash"></div>
      <div id="tramo-card"><span id="tramo-kicker"></span><span id="tramo-name"></span></div>
      <div id="mandao-toast"><span id="mandao-toast-kicker"></span><span id="mandao-toast-text"></span></div>
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
          <span id="ctrl-throttle"></span>
        </div>
        <div id="title-record" class="title-record"></div>
        <div class="title-chips">
          <div id="title-bank" class="title-bank">${BANANA_SVG}<span id="bank-n">0</span></div>
          <button id="mandao-chip" class="mandao-chip" type="button"></button>
        </div>
        <div id="mandao-sheet" class="mandao-sheet hidden">
          <div class="md-card">
            <div id="md-title" class="md-title"></div>
            <div id="md-level" class="md-level"></div>
            <ul id="md-list" class="md-list"></ul>
            <div id="md-close" class="md-close"></div>
          </div>
        </div>
      </div>
      <div id="gameover" class="screen hidden">
        <div class="card">
          <div id="go-title" class="go-title"></div>
          <div id="go-new" class="badge hidden"></div>
          <div id="go-close" class="close-call hidden"></div>
          <div id="go-tour" class="go-tour"></div>
          <div id="go-points-label" class="go-points-label"></div>
          <div id="go-points" class="go-points">0</div>
          <div id="go-far" class="go-far hidden"></div>
          <div class="go-rows">
            <div><span id="go-dist-label"></span><b id="go-dist"></b></div>
            <div><span id="go-rec-label"></span><b id="go-rec"></b></div>
            <div><span id="go-plat-label"></span><b id="go-plat"></b></div>
          </div>
          <ul id="go-mandaos" class="md-list md-compact"></ul>
          <div id="go-earned" class="go-earned"></div>
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
        <ul id="pause-mandaos" class="md-list md-pause"></ul>
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
    this.countdownEl = q('#countdown');
    this.flashEl = q('#flash');
    this.scoreEl = q('#hud-score');
    this.comboEl = q('#hud-combo');
    this.cvEl = q('#hud-cv');
    this.cabEl = q('#hud-cab');
    this.pedalsEl = q('#pedals');
    this.pedalGasEl = q('#pedal-gas');
    this.pedalBrakeEl = q('#pedal-brake');
    this.pedalSpeedEl = q('#pedal-speed');
    this.pedalKmhEl = q('#pedal-kmh');
    this.pedalGasEl.classList.toggle('hint', !this.pedalSeen);
    this.ctrlThrottleEl = q('#ctrl-throttle');
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
    this.mandaoChipEl = q('#mandao-chip');
    this.mandaoSheetEl = q('#mandao-sheet');
    this.goFarEl = q('#go-far');
    this.goMandaosEl = q('#go-mandaos');
    this.goEarnedEl = q('#go-earned');
    this.pauseMandaosEl = q('#pause-mandaos');
    this.toastEl = q('#mandao-toast');
    this.toastKickerEl = q('#mandao-toast-kicker');
    this.toastTextEl = q('#mandao-toast-text');

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
      // The pintura cycler lives inside the card but must not re-select the
      // vehicle. On an unselected card any tap just selects that vehicle.
      const guard = (e: Event, fn: () => void): void => {
        e.stopPropagation();
        if (card.dataset.v !== this.selectedVehicle) {
          this.cb.onSelectVehicle(card.dataset.v as VehicleId);
          return;
        }
        fn();
      };
      card.querySelector('.pc-prev')?.addEventListener('pointerdown', (e) => guard(e, () => this.cb.onPinturaCycle(-1)));
      card.querySelector('.pc-next')?.addEventListener('pointerdown', (e) => guard(e, () => this.cb.onPinturaCycle(1)));
      card.querySelector('.pc-swatch')?.addEventListener('pointerdown', (e) => guard(e, () => this.cb.onPinturaTap()));
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
    // Los Mandaos on the title: the chip opens the list, any tap closes it,
    // and neither starts a run.
    this.mandaoChipEl.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      this.openMandaos();
    });
    this.mandaoSheetEl.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      this.mandaoSheetEl.classList.add('hidden');
    });
    this.toastEl.addEventListener('animationend', () => {
      this.toastBusy = false;
      this.nextToast();
    });
    this.bindPedals();

    this.applyLang();
  }

  // ---------------- el pedal ----------------

  // The whole cluster is one hit zone, larger than the art. The buttons have
  // pointer-events: none, so every event targets the cluster itself. Both
  // pointerdown AND pointermove stop here: the window handlers in player.ts
  // adopt any pressed finger that moves, and a pedal thumb that reached them
  // would steer the bike the moment the steering thumb lifted.
  private bindPedals(): void {
    const el = this.pedalsEl;
    el.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      e.preventDefault();
      this.pedalReserved.add(e.pointerId);
      if (!this.pedalLive || this.pedalOwner !== null) return;
      this.pedalOwner = e.pointerId;
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        // a pointer that is already gone; the window lift below still ends it
      }
      const b = this.pedalBrakeEl.getBoundingClientRect();
      const g = this.pedalGasEl.getBoundingClientRect();
      this.pedalSplit = (b.right + g.left) / 2;
      this.setPedalValue(this.pedalZone(e.clientX));
    });
    el.addEventListener('pointermove', (e) => {
      if (!this.pedalReserved.has(e.pointerId)) return;
      e.stopPropagation();
      // Rocking the thumb between FRENO and GAS re-zones without lifting.
      if (e.pointerId === this.pedalOwner) this.setPedalValue(this.pedalZone(e.clientX));
    });
    el.addEventListener('lostpointercapture', (e) => {
      if (e.pointerId === this.pedalOwner) this.releasePedal();
    });
    // A lift anywhere ends that finger's claim. Capture phase, so it runs
    // before anything else can see the event.
    const lift = (e: PointerEvent): void => {
      if (e.pointerId === this.pedalOwner) this.releasePedal();
      this.pedalReserved.delete(e.pointerId);
    };
    window.addEventListener('pointerup', lift, { capture: true });
    window.addEventListener('pointercancel', lift, { capture: true });
    window.addEventListener('blur', () => {
      this.releasePedal();
      this.pedalReserved.clear();
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.releasePedal();
    });
  }

  // Which pedal is under the owning thumb: left of the gap is FRENO, right of
  // it is GAS, all the way to the screen edge, so a thumb that slides off
  // the art keeps what it was holding. 6 px of hysteresis at the gap.
  private pedalZone(x: number): -1 | 1 {
    if (this.pedalValue === 1) return x < this.pedalSplit - 6 ? -1 : 1;
    if (this.pedalValue === -1) return x > this.pedalSplit + 6 ? 1 : -1;
    return x < this.pedalSplit ? -1 : 1;
  }

  private setPedalValue(v: -1 | 0 | 1): void {
    if (v === this.pedalValue) return;
    this.pedalValue = v;
    this.showPedal(v); // the press shows in this frame, before the sim moves
    this.cb.onPedal(v);
  }

  // Lets go of the pedal. The finger stays reserved until it lifts, so
  // resuming a pause or starting the next run needs a fresh press.
  releasePedal(): void {
    if (this.pedalOwner !== null) {
      const id = this.pedalOwner;
      this.pedalOwner = null;
      try {
        if (this.pedalsEl.hasPointerCapture(id)) this.pedalsEl.releasePointerCapture(id);
      } catch {
        // already released
      }
    }
    this.setPedalValue(0);
  }

  // Shown and pressable only during a live run.
  setPedalLive(on: boolean): void {
    this.pedalLive = on;
    if (!on) this.releasePedal();
    this.pedalsEl.classList.toggle('hidden', !on);
  }

  // Player's hook: a finger that landed on the pedal never steers.
  isPedalPointer(id: number): boolean {
    return this.pedalReserved.has(id);
  }

  // The pressed look. Called by the pedal itself and every frame from the
  // live throttle, so the arrow keys press the pedals too.
  showPedal(v: -1 | 0 | 1): void {
    if (v === this.pedalShown) return;
    this.pedalShown = v;
    this.pedalGasEl.classList.toggle('down', v === 1);
    this.pedalBrakeEl.classList.toggle('down', v === -1);
    if (v === 1 && !this.pedalSeen) {
      this.pedalSeen = true;
      this.pedalGasEl.classList.remove('hint');
      try {
        localStorage.setItem(PEDAL_SEEN_KEY, '1');
      } catch {
        // fine, it breathes again next launch
      }
    }
  }

  // Braking pays ×0.5: the tag rides above FRENO while it applies.
  setBrake(on: boolean): void {
    if (on === this.brakeShown) return;
    this.brakeShown = on;
    this.pedalsEl.classList.toggle('brake-on', on);
  }

  // El freno caliente: FRENO fills with heat while it bites, and once the
  // pads overheat it turns into a pulsing ¡CALIENTE! until they cool.
  // Written only when the fill moves a 5% step or the state flips.
  setBrakeHeat(heat: number, hot: boolean): void {
    const q = Math.round(heat * 20);
    if (q !== this.brakeHeatShown) {
      this.brakeHeatShown = q;
      this.pedalBrakeEl.style.setProperty('--heat', String(q / 20));
    }
    if (hot === this.brakeHotShown) return;
    this.brakeHotShown = hot;
    this.pedalBrakeEl.classList.toggle('hot', hot);
    const t = this.t();
    this.pedalBrakeEl.querySelector('.pedal-label')!.textContent = hot ? t.pedalBrakeHot : t.pedalBrake;
  }

  // The speedometer above the pedals, in km/h. Written only when the
  // rounded number changes.
  setSpeedKmh(kmh: number): void {
    if (kmh === this.kmhShown) return;
    this.kmhShown = kmh;
    this.pedalKmhEl.textContent = String(kmh);
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
    this.pedalGasEl.setAttribute('aria-label', t.ariaGas);
    this.pedalBrakeEl.setAttribute('aria-label', t.ariaBrake);
    this.pedalGasEl.querySelector('.pedal-label')!.textContent = t.pedalGas;
    this.pedalBrakeEl.querySelector('.pedal-label')!.textContent = this.brakeHotShown ? t.pedalBrakeHot : t.pedalBrake;
    this.subtitleEl.textContent = t.subtitle;
    const touch = this.inputMode === 'touch';
    this.ctrlThrottleEl.textContent = touch ? t.ctrlThrottleTouch : t.ctrlThrottleKey;
    this.promptEl.textContent = touch ? t.startTouch : t.startKey;
    const trick = this.selectedVehicle === 'civic' ? t.trickCar : t.trickBike;
    this.ctrlSteerEl.textContent = touch ? t.ctrlSteerTouch : t.ctrlSteerKey;
    this.ctrlTrickEl.textContent = touch ? t.ctrlTrickTouch(trick) : t.ctrlTrickKey(trick);
    this.titleRecordEl.textContent =
      this.lastRecord > 0 ? `${t.record}: ${this.lastRecord}` : '';
    this.hudRecordEl.textContent =
      this.lastRecord > 0 ? `${t.record.toUpperCase()} ${this.lastRecord}` : '';
    this.recordKey = Number.NaN; // the run's countdown rewrites it on its next tick
    if (this.mandaoView) this.setMandaos(this.mandaoView);
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
        if (rec) rec.textContent = this.lastRecords[id] > 0 ? `${t.record} ${this.lastRecords[id]}` : '';
      }
    }
  }

  // Las Pinturas: the cycler on the selected card shows one paint at a
  // time. The chip's label carries the state: nothing (equipped), PONER
  // (owned, tap to wear it), or the price (locked, tap to buy).
  updatePinturaCycle(state: { hex: number; owned: boolean; equipped: boolean; price: number; bank: number }): void {
    this.setBank(state.bank);
    const t = this.t();
    for (const card of document.querySelectorAll<HTMLElement>('.vcard')) {
      const mine = card.dataset.v === this.selectedVehicle;
      card.classList.toggle('show-paints', mine);
      if (!mine) continue;
      const swatch = card.querySelector<HTMLElement>('.pc-swatch');
      const label = card.querySelector<HTMLElement>('.pc-label');
      if (!swatch || !label) continue;
      swatch.style.background = `#${state.hex.toString(16).padStart(6, '0')}`;
      swatch.classList.toggle('equip', state.equipped);
      swatch.classList.toggle('locked', !state.owned);
      label.classList.toggle('poor', !state.owned && state.bank < state.price);
      if (state.equipped) label.textContent = '';
      else if (state.owned) label.textContent = t.pinturaEquip;
      else label.innerHTML = `${state.price} ${BANANA_SVG}`;
    }
  }

  setBank(n: number): void {
    const el = document.getElementById('bank-n');
    if (el) el.textContent = String(n);
  }

  flashBank(): void {
    const chip = document.getElementById('title-bank');
    if (!chip) return;
    chip.classList.remove('deny');
    void chip.offsetWidth; // restart the animation
    chip.classList.add('deny');
  }

  popupPintura(): void {
    this.popup(this.t().pinturaNew, 50, 40, 'pop-lg pop-gold');
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
      // empty when no record yet; .vc-rec min-height keeps the card from shifting
      rec.textContent = records[id] > 0 ? `${t.record} ${records[id]}` : '';
    }
  }

  showTitle(record: number): void {
    this.lastRecord = record;
    this.mandaoSheetEl.classList.add('hidden');
    this.hideCountdown();
    this.applyLang();
    this.title.classList.remove('hidden');
    this.hud.classList.add('hidden');
    this.gameover.classList.add('hidden');
    this.pause.classList.add('hidden');
    this.setContraVia(false);
    this.setCaballito(false);
    this.setGas(false);
    this.setBrake(false);
    this.setPedalLive(false);
  }

  showPlaying(record: number): void {
    this.lastRecord = record;
    this.setBrakeHeat(0, false);
    this.hideCountdown();
    this.applyLang();
    this.lastScore = -1;
    this.setScore(0);
    this.comboShown = 0;
    this.comboEl.classList.add('hidden');
    this.platShown = -1;
    this.setPlatanos(0);
    this.setContraVia(false);
    this.setCaballito(false);
    this.setGas(false);
    this.setBrake(false);
    this.showPedal(0);
    this.setPedalLive(true);
    this.multQ = 10;
    this.multEl.classList.add('hidden');
    this.recordKey = Number.NaN;
    this.toastQueue.length = 0;
    this.toastBusy = false;
    this.toastEl.classList.remove('show');
    for (const p of this.popups) p.classList.remove('go');
    this.hud.classList.remove('hidden');
    this.title.classList.add('hidden');
    this.gameover.classList.add('hidden');
    this.pause.classList.add('hidden');
  }

  // The card: the run, the records it chased, the mandaos it moved and the
  // plátanos it earned toward the next pintura. Every line is plain text a
  // restyle can move around; the data comes in whole.
  showGameOver(r: RunResult, mandaos: MandaosView, pintura: PinturaGoal | null): void {
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
    // La Cinta fell but the points record did not: say so, in meters.
    const far = r.isNewDistRecord && !r.isNewRecord;
    this.goFarEl.classList.toggle('hidden', !far);
    if (far) this.goFarEl.textContent = t.farLine(r.distanceM);
    this.goMandaosEl.innerHTML = this.mandaoRowsHtml(mandaos, true);
    this.goEarnedEl.innerHTML =
      `<b>${t.earned(r.platanosEarned)}</b>` +
      (pintura ? `<span>${pintura.need > 0 ? t.pinturaNeed(pintura.need, pintura.name) : t.pinturaReady(pintura.name)}</span>` : '');
    // The tour's own close-call: how far you got, or how close the next
    // stretch was. Runs that stayed home get a target, not a shrug.
    const tour = document.getElementById('go-tour');
    if (tour) {
      tour.textContent =
        r.tramo !== 'malecon'
          ? t.reachedTramo(t.tramoNames[r.tramo])
          : t.nextTramoIn(t.tramoNames[nextTramoAfter(r.distanceM)], Math.round(nextBorderIn(r.distanceM)));
    }
    this.gameover.classList.remove('hidden');
    this.hud.classList.add('hidden');
    this.setContraVia(false);
    this.setCaballito(false);
    this.setGas(false);
    this.setBrake(false);
    this.setPedalLive(false);
  }

  showPause(mandaos: MandaosView): void {
    this.pauseMandaosEl.innerHTML = this.mandaoRowsHtml(mandaos, false);
    this.hideCountdown();
    this.pause.classList.remove('hidden');
    this.setPedalLive(false);
  }

  hidePause(): void {
    this.pause.classList.add('hidden');
    this.setPedalLive(true);
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
    const txt = this.comboEl.querySelector<HTMLElement>('#combo-text');
    if (txt) txt.textContent = tier ? `×${n} ${tier}` : `×${n}`;
    this.comboEl.classList.remove('hidden', 'bump');
    void this.comboEl.offsetWidth;
    this.comboEl.classList.add('bump');
  }

  // The combo's remaining life as a shrinking bar under the pill. Written
  // only when it moves a visible amount, so it costs nothing at 60 fps.
  setComboFraction(f: number): void {
    const q = Math.round(f * 40); // 2.5% steps
    if (q === this.comboBarShown) return;
    this.comboBarShown = q;
    const bar = this.comboEl.querySelector<HTMLElement>('#combo-bar');
    if (bar) bar.style.transform = `scaleX(${q / 40})`;
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

  // Wind streaks at the edges of the frame, fading in past ~60% of top
  // speed and saturating a fondo. Pure CSS animation; only the container's
  // opacity is written, and only when it moves a step.
  setSpeedLines(norm: number): void {
    const q = Math.round(Math.max(0, Math.min(1, (norm - 0.6) / 0.6)) * 20);
    if (q === this.speedLinesShown) return;
    this.speedLinesShown = q;
    const el = document.getElementById('speedlines');
    if (el) el.style.opacity = String(q / 20);
  }

  // A fondo pays ×1.5: the GAS pedal glows, its tag shows, and the
  // speedometer turns gold, all only once the surge is really felt.
  setGas(on: boolean): void {
    if (on === this.gasShown) return;
    this.gasShown = on;
    this.pedalsEl.classList.toggle('gas-on', on);
    this.pedalGasEl.classList.toggle('on', on);
    this.pedalSpeedEl.classList.toggle('fast', on);
  }

  setMuted(m: boolean): void {
    this.muteBtn.classList.toggle('muted', m);
    this.mutePauseBtn.classList.toggle('muted', m);
  }

  // Every multiplier stacked into one number (Score.liveMult): ×2, ×3.8,
  // ×15. Hidden at ×1. Called every frame; it writes only when the shown
  // value changes, and bumps when it climbs.
  setLiveMult(m: number): void {
    const q = m >= 10 ? Math.round(m) * 10 : Math.round(m * 10);
    if (q === this.multQ) return;
    const up = q > this.multQ;
    this.multQ = q;
    this.multEl.classList.toggle('hidden', q === 10);
    if (q === 10) return;
    this.multEl.textContent = fmtMult(q / 10);
    if (up) {
      this.multEl.classList.remove('bump');
      void this.multEl.offsetWidth;
      this.multEl.classList.add('bump');
    }
  }

  // The HUD record label against the record the run started with: RÉCORD n,
  // then FALTAN n from recordNudgeFrom on, then ¡NUEVO RÉCORD! once passed.
  // The caller runs it at 4 Hz; it writes only when the text changes.
  setRecordLabel(record: number, points: number): void {
    const key =
      record <= 0 ? -1 : points > record ? -2 : points >= record * CONFIG.recordNudgeFrom ? record - points : -3;
    if (key === this.recordKey) return;
    this.recordKey = key;
    const t = this.t();
    this.hudRecordEl.textContent =
      key === -1 ? '' : key === -2 ? t.newRecord : key === -3 ? `${t.record.toUpperCase()} ${record}` : t.toGo(key);
    this.hudRecordEl.classList.toggle('near', key >= 0);
  }

  // La Cinta's banner text for a record distance: TU RÉCORD · 1,234 m.
  tapeLabel(m: number): string {
    return `${this.t().tapeRecord} · ${Math.round(m).toLocaleString('en-US')} m`;
  }

  // La Cinta on a ride with no distance record yet.
  goalTapeLabel(): string {
    return this.t().goalTape;
  }

  // ¡Cerquita! for the band, ¡Por un pelito! for a razor pass (bigger, gold).
  popupNearMiss(razor: boolean, pts: number, x: number, y: number, combo: number): void {
    const t = this.t();
    const cls = razor ? 'pop-md pop-gold' : combo >= 5 ? 'pop-md' : 'pop-sm';
    this.popup(`${razor ? t.razorMiss : t.nearMiss} +${pts}`, x, y, cls);
  }

  popupRecordNear(): void {
    this.popup(this.t().recordNear, 50, 30, 'pop-lg pop-gold');
  }

  bannerFarthest(): void {
    this.banner(this.t().farRecord);
  }

  bannerGoal(): void {
    this.banner(this.t().goalReached);
  }

  // ---------------- Los Mandaos ----------------

  private trickNoun(): string {
    const t = this.t();
    return this.selectedVehicle === 'civic' ? t.trickNounCar : t.trickNounBike;
  }

  // One mandao as a sentence, in the current language and for the current
  // ride (caballito or derrape). Tutorial goals skip the "in one run" tail.
  mandaoText(m: Mandao): string {
    const t = this.t();
    const base = t.mandao[m.kind](m.target, this.trickNoun());
    return m.tutorial || !mandaoPerRun(m.kind) ? base : base + t.perRun;
  }

  // "7/10", or a check once done. Meters and seconds count down to whole units.
  mandaoProgress(m: Mandao): string {
    return m.done ? '✓' : `${fmtN(m.progress)}/${fmtN(m.target)}`;
  }

  private mandaoRowHtml(m: Mandao, tag: string): string {
    const cls = `md-row${m.done ? ' done' : ''}${m.justDone ? ' just' : ''}${tag ? ' md-daily' : ''}`;
    const tagHtml = tag ? `<span class="md-tag">${tag}</span>` : '';
    return `<li class="${cls}">${tagHtml}<span class="md-text">${this.mandaoText(m)}</span><b class="md-prog">${this.mandaoProgress(m)}</b></li>`;
  }

  // The three mandaos (the finished set, if this run leveled up) plus the
  // daily, as list items. The card adds the level-up line.
  private mandaoRowsHtml(v: MandaosView, card: boolean): string {
    const t = this.t();
    const rows = v.lastSet ?? v.set;
    let html = '';
    for (const m of rows) html += this.mandaoRowHtml(m, '');
    html += this.mandaoRowHtml(v.daily, t.dailyTag);
    if (card && v.lastSet) {
      html += `<li class="md-levelup">${t.levelUp(t.levelNames[v.levelNameIdx], fmtBarrio(v.mult))}</li>`;
    }
    return html;
  }

  // The title chip: MANDAOS 1/3 · NIVEL 2 ×1.5. Keeps the view for the list.
  setMandaos(v: MandaosView): void {
    this.mandaoView = v;
    const t = this.t();
    this.mandaoChipEl.textContent = t.mandaoChip(v.doneCount, v.level, fmtBarrio(v.mult), t.levelNames[v.levelNameIdx]);
    if (!this.mandaoSheetEl.classList.contains('hidden')) this.openMandaos();
  }

  private openMandaos(): void {
    const v = this.mandaoView;
    if (!v) return;
    const t = this.t();
    const q = (sel: string): HTMLElement => this.mandaoSheetEl.querySelector(sel)!;
    q('#md-title').textContent = t.mandaos;
    q('#md-level').textContent = t.levelLine(v.level, t.levelNames[v.levelNameIdx], fmtBarrio(v.mult));
    let html = '';
    for (const m of v.set) html += this.mandaoRowHtml(m, '');
    html += `<li class="md-head">${t.dailyTitle}</li>`;
    html += this.mandaoRowHtml(v.daily, t.dailyTag);
    if (v.streak > 0) html += `<li class="md-streak">${t.streak(v.streak)}</li>`;
    q('#md-list').innerHTML = html;
    q('#md-close').textContent = t.closeHint;
    this.mandaoSheetEl.classList.remove('hidden');
  }

  // Mid-run: a mandao got done. Toasts queue, so a set finished on one
  // plátano still reads one line at a time, then the level up.
  toastMandao(c: Completion): void {
    const t = this.t();
    this.toastQueue.push([c.daily ? t.dailyDone : t.mandaoDone, `${this.mandaoText(c.mandao)} · ${t.reward(c.reward)}`]);
    if (c.levelUp) {
      const name = t.levelNames[Math.min(c.level, t.levelNames.length - 1)];
      this.toastQueue.push([t.levelUpKicker, `${name} ${fmtBarrio(barrioMultFor(c.level))} · ${t.reward(c.setBonus)}`]);
    }
    this.nextToast();
  }

  private nextToast(): void {
    if (this.toastBusy) return;
    const next = this.toastQueue.shift();
    if (!next) return;
    this.toastBusy = true;
    this.toastKickerEl.textContent = next[0];
    this.toastTextEl.textContent = next[1];
    this.toastEl.classList.remove('show');
    void this.toastEl.offsetWidth;
    this.toastEl.classList.add('show');
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

  // A set piece announces itself where the combo ladder lands.
  popupSetPiece(kind: SetPieceKind): void {
    this.popup(this.t().setPieces[kind], 50, 34, 'pop-lg');
  }

  // Escalation fires on the same tick as the multiplier popup, just before
  // it, so it sits below it instead of stacking on top.
  popupEscalation(): void {
    this.popup(this.t().streetWild, 50, 48, 'pop-md');
  }

  popupMultUp(n: number): void {
    this.popup(this.t().multUp(n), 50, 40, 'pop-lg pop-gold');
  }

  // Arriving somewhere new is the payoff for a long run, so it gets its own
  // announcement rather than sharing the near-miss popup pool.
  popupTramo(t: 'malecon' | 'zona' | 'campo'): void {
    const card = document.getElementById('tramo-card');
    const kicker = document.getElementById('tramo-kicker');
    const name = document.getElementById('tramo-name');
    if (!card || !kicker || !name) return;
    kicker.textContent = this.t().tramoKicker;
    name.textContent = this.t().tramoNames[t];
    card.classList.remove('show');
    void card.offsetWidth; // restart the animation on back-to-back crossings
    card.classList.add('show');
  }

  bannerNewRecord(): void {
    this.banner(this.t().newRecord);
  }

  // The Bendición took the hit for you.
  popupShieldSaved(): void {
    this.popup(this.t().shieldSaved, 50, 40, 'pop-lg pop-gold');
  }

  // The resume countdown: 3, 2, 1, then ¡DALE! as the world moves again.
  // Minimal markup; the look is WP-E's.
  showCountdown(n: number): void {
    this.countdownEl.textContent = String(n);
    this.countdownEl.classList.remove('hidden', 'go', 'beat');
    void this.countdownEl.offsetWidth; // restart the beat animation
    this.countdownEl.classList.add('beat');
  }

  countdownGo(): void {
    this.countdownEl.textContent = this.t().countdownGo;
    this.countdownEl.classList.remove('hidden', 'beat', 'go');
    void this.countdownEl.offsetWidth;
    this.countdownEl.classList.add('go');
  }

  hideCountdown(): void {
    this.countdownEl.classList.add('hidden');
    this.countdownEl.classList.remove('beat', 'go');
  }

  // A full-screen flash: white at the crash's impact frame, gold when the
  // Bendición takes a hit. alpha is the peak, ms the fade.
  flash(color: string, alpha: number, ms: number): void {
    const el = this.flashEl;
    el.style.background = color;
    el.style.setProperty('--flash-a', String(alpha));
    el.style.animationDuration = `${ms}ms`;
    el.classList.remove('go');
    void el.offsetWidth;
    el.classList.add('go');
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
    const where = r.tramo !== 'malecon' ? t.inVehicleReached(veh.name, t.tramoNames[r.tramo]) : t.inVehicle(veh.name);
    stroked(where, 540, 985, 52, '#fff3c4', '#002d62', 10);
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
