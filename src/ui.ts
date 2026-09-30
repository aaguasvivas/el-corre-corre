// ui.ts: DOM screens, HUD, floating popups, vehicle cards, copy strings, and
// the share card. Spanish-first with an EN flip. The slang stays Dominican in
// both languages.

import { CONFIG, VEHICLES, type VehicleId } from './config';
import { LADDER_STEPS, type PinturaGoal, type RunResult } from './score';
import { barrioMultFor, mandaoPerRun, type Completion, type Mandao, type MandaoKind, type MandaosView } from './missions';
import { nextBorderIn, nextTramoAfter } from './tour';
import { drawDominicanFlag } from './flag';
import type { SetPieceKind } from './traffic';
import { AnnounceQueue, announcement, type Announcement, type AnnounceKind } from './announce';
import { Coach, type CoachId } from './coach';
import { Popups, type Band } from './popups';

type Lang = 'es' | 'en';
type Tramo = 'malecon' | 'zona' | 'campo';
const LANG_KEY = 'ecc.v1.lang';
const PEDAL_SEEN_KEY = 'ecc.v1.pedalSeen'; // '1' once the gas pedal has been pressed, ever

// reachTramo targets are tramo borders: the copy names the place.
const TRAMO_M = CONFIG.tramoLengthM;

export const STRINGS = {
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
    closeCall: (n: number) => `¡Te quedaste a ${fmtN(n)} del récord!`,
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
    // Per place, so the article reads right: DE VUELTA EN EL MALECÓN,
    // LLEGASTE A LA ZONA COLONIAL, YA ESTÁS EN EL CAMPO (never "A EL").
    tramoKicker: { malecon: 'DE VUELTA EN', zona: 'LLEGASTE A', campo: 'YA ESTÁS EN' } satisfies Record<Tramo, string>,
    pinturaEquip: 'PONER',
    nearMiss: '¡Cerquita!',
    razorMiss: '¡Por un pelito!',
    ladder: ['¡Eso!', '¡Duro!', '¡Diache!', '¡Tú ta’ loco!', '¡ETE E’ UN LOCO!', '¡LEYENDA DEL MALECÓN!'],
    // Records: ¡NUEVO RÉCORD! is points, La Cinta is distance.
    farRecord: '¡MÁS LEJOS QUE NUNCA!',
    farLine: (m: number) => `¡Más lejos que nunca! ${fmtN(m)} m`,
    goalTape: 'LA META',
    goalReached: '¡LLEGASTE A LA META!',
    recordNear: '¡Ya casi el récord!',
    toGo: (n: number) => `FALTAN ${fmtN(n)}`,
    tapeToGo: (m: number) => `Faltan ${fmtN(m)} m`, // La Cinta ahead
    // Coach chips: first-time hints, touch and keyboard
    coachSteer: 'Arrastra el dedo pa’ esquivar',
    coachSteerKey: 'A / D pa’ esquivar',
    coachCv: (m: string) => `Métete en contra vía: ¡todo paga ${m}!`, // the chip draws the ← arrow
    coachTrick: (trick: string) => `Desliza arriba y aguanta: ${trick}`,
    coachTrickKey: (trick: string) => `Aguanta W: ${trick}`,
    coachGas: (m: string) => `Aguanta ¡DALE! pa’ acelerar: ${m}`,
    coachGasKey: (m: string) => `Aguanta ↑ pa’ acelerar: ${m}`,
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
    closeCall: (n: number) => `Only ${fmtN(n)} short of your best!`,
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
    tramoKicker: { malecon: 'BACK ON', zona: 'YOU REACHED', campo: 'YOU REACHED' } satisfies Record<Tramo, string>,
    pinturaEquip: 'USE',
    nearMiss: 'So close!',
    razorMiss: 'By a hair!',
    ladder: ['That’s it!', 'Sick!', 'Dang!', 'You’re crazy!', 'THIS GUY’S A MANIAC!', 'LEGEND OF THE MALECÓN!'],
    farRecord: 'FARTHEST EVER!',
    farLine: (m: number) => `Farthest ever! ${fmtN(m)} m`,
    goalTape: 'GOAL',
    goalReached: 'GOAL REACHED!',
    recordNear: 'Record in reach!',
    toGo: (n: number) => `${fmtN(n)} TO GO`,
    tapeToGo: (m: number) => `${fmtN(m)} m to go`,
    coachSteer: 'Drag your finger to weave',
    coachSteerKey: 'A / D to weave',
    coachCv: (m: string) => `Ride the wrong way: everything pays ${m}!`,
    coachTrick: (trick: string) => `Swipe up and hold: ${trick}`,
    coachTrickKey: (trick: string) => `Hold W: ${trick}`,
    coachGas: (m: string) => `Hold GAS to speed up: ${m}`,
    coachGasKey: (m: string) => `Hold ↑ to speed up: ${m}`,
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

// HUD glyphs. Lilita One has no arrows, so they are drawn, not typed.
// La Cinta: a red tape between two posts.
const TAPE_SVG =
  '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M4 3v18M20 3v18" stroke="#002d62" stroke-width="2.6" stroke-linecap="round"/><path d="M4 8c4 3 12-3 16 0v5c-4-3-12 3-16 0z" fill="#ce1126" stroke="#002d62" stroke-width="1.2" stroke-linejoin="round"/></svg>';
// The contra vía hint points left: oncoming lanes are on screen left.
const ARROW_SVG =
  '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M20 12H5M11 5l-7 7 7 7" fill="none" stroke="#f4c430" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
// El freno caliente's label.
const FLAME_SVG =
  '<svg class="pedal-flame" viewBox="0 0 24 28" aria-hidden="true"><path d="M12 1c1 5 7 8 7 15a7 7 0 0 1-14 0c0-4 2-6 3-8 0 3 1 5 3 5 0-4-1-8 1-12z" fill="#fff3c4" stroke="#002d62" stroke-width="1.6" stroke-linejoin="round"/><path d="M12 14c.5 2 3 3 3 6a3 3 0 0 1-6 0c0-2 1.5-3 3-6z" fill="#f4c430"/></svg>';

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

// The widest side column in the top band (the plátano pill), which the
// score must stay clear of.
const HUD_SIDE_PX = 92;

// The smallest a lane card's big line may shrink to (px) to fit.
const LANE_MIN_PX = 12.5;

// Restart a CSS animation class (the reflow is what restarts it).
function restart(el: HTMLElement, cls: string): void {
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
}

const plusLabel = (n: number): string => `+${fmtN(n)}`;

// The score is rewritten nearly every frame: one formatter, built once
// (the same 12,345 grouping as fmtN).
const SCORE_FMT = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

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
  private lastRecord = 0;
  private lastResult: RunResult | null = null;
  private mandaoView: MandaosView | null = null;
  private selectedVehicle: VehicleId = 'motor';
  // ---- the in-run HUD's state; every setter writes the DOM only on change
  private clock = 0; // real seconds, advanced by update(): rolls, the lane, popups
  private scoreTarget = 0;
  private scoreShown = -1; // the number on screen (rolls up toward scoreTarget)
  private scoreFrom = 0;
  private scoreRollT = -1; // clock time the current roll started; <0 = none
  private scoreLen = 0; // characters in the shown score, to refit it
  private lastPunchAt = -1;
  private comboShown = 0;
  private comboTierShown = 0; // ladder index + 1, 0 = none
  private comboBarShown = -1;
  private comboLow = false;
  private platShown = -1;
  private cvShown = false;
  private cabShown = false;
  private multQ = 10; // the live multiplier as shown, x10 (10 = ×1, hidden)
  private multHeat = 0; // 0 cream, 1 hot (×3+), 2 fire (×6+)
  private recordKey = Number.NaN; // what the HUD record label says now (see setRecordLabel)
  private tapeStep = -1; // La Cinta's countdown as shown, in tapeApproachStepM steps; -1 = off
  private cafeShown = -1; // the cafecito ring, in 2.5% steps; -1 = off
  private readonly lane = new AnnounceQueue();
  private laneShown: Announcement | null = null;
  private streetWildAt = -1; // an escalation waiting for its multiplier (same step)
  private readonly coach = new Coach();
  private coachShown: CoachId | null = null;
  private frozen = false;
  private bandDirty = true;
  private readonly bandBox: Band = { left: 0, right: 0, top: 0, bottom: 0 };
  private readonly bandNow: Band = { left: 0, right: 0, top: 0, bottom: 0 };

  private hud: HTMLElement;
  private title: HTMLElement;
  private gameover: HTMLElement;
  private pause: HTMLElement;
  private cvVignette: HTMLElement;
  private countdownEl: HTMLElement;
  private flashEl: HTMLElement;
  private popups: Popups;
  private scoreBox: HTMLElement;
  private scoreEl: HTMLElement;
  private comboEl: HTMLElement;
  private comboNEl: HTMLElement;
  private comboTierEl: HTMLElement;
  private comboBarEl: HTMLElement;
  private cvEl: HTMLElement;
  private cabEl: HTMLElement;
  private pillsEl: HTMLElement;
  private anCard: HTMLElement;
  private anKicker: HTMLElement;
  private anText: HTMLElement;
  private tapeEl: HTMLElement;
  private tapeNEl: HTMLElement;
  private coachEl: HTMLElement;
  private coachTextEl: HTMLElement;
  private speedLinesEl: HTMLElement;
  private pedalHotTextEl: HTMLElement;
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

  constructor(root: HTMLElement, cb: UICallbacks) {
    this.cb = cb;
    root.innerHTML = `
      <div id="cv-vignette"></div>
      <div id="hud" class="hidden">
        <div id="speedlines"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>
        <div id="hud-scrim"></div>
        <div id="hud-top">
          <div id="hud-score"><span id="score-n">0</span></div>
          <div id="hud-combo" class="off"><b id="combo-n"></b><span id="combo-tier"></span><i id="combo-bar"></i></div>
          <div id="hud-pills"><div id="hud-cv" class="hud-pill"></div><div id="hud-cab" class="hud-pill"></div></div>
          <div id="announce">
            <div id="an-card" class="an-card"><span class="an-kicker"></span><span class="an-text"></span></div>
            <div id="hud-tape" class="off">${TAPE_SVG}<span id="tape-n"></span></div>
          </div>
        </div>
        <div id="hud-left">
          <button id="hud-pause" type="button" aria-label="Pausa"><i></i><i></i></button>
        </div>
        <div id="hud-right">
          <div id="hud-platanos">${BANANA_SVG}<span id="plat-n">0</span></div>
          <div id="hud-mult" class="off"></div>
        </div>
        <div id="hud-record"></div>
        <div id="coach" class="off">${ARROW_SVG}<span id="coach-text"></span></div>
        <div id="pedals" class="hidden">
          <div id="pedal-speed" class="pedal-speed"><b id="pedal-kmh">0</b><span>km/h</span></div>
          <div class="pedal-mult pedal-mult-brake"><span>${multTag(CONFIG.brakeScoreMult)}</span></div>
          <div class="pedal-mult pedal-hot-tag"><span id="pedal-hot-text"></span></div>
          <div class="pedal-mult pedal-mult-gas"><span>${multTag(CONFIG.gasScoreMult)}</span></div>
          <button id="pedal-brake" class="pedal pedal-brake" type="button"><i class="pedal-heat"></i><i class="pedal-tread"></i>${FLAME_SVG}<span class="pedal-label"></span></button>
          <button id="pedal-gas" class="pedal pedal-gas" type="button"><i class="pedal-ring"></i><i class="pedal-tread"></i><span class="pedal-label"></span></button>
        </div>
      </div>
      <div id="popup-layer"></div>
      <div id="countdown" class="hidden"></div>
      <div id="flash"></div>
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
    this.cvVignette = q('#cv-vignette');
    this.countdownEl = q('#countdown');
    this.flashEl = q('#flash');
    this.scoreBox = q('#hud-score');
    this.scoreEl = q('#score-n');
    this.comboEl = q('#hud-combo');
    this.comboNEl = q('#combo-n');
    this.comboTierEl = q('#combo-tier');
    this.comboBarEl = q('#combo-bar');
    this.cvEl = q('#hud-cv');
    this.cabEl = q('#hud-cab');
    this.pillsEl = q('#hud-pills');
    this.anCard = q('#an-card');
    this.anKicker = q('#an-card .an-kicker');
    this.anText = q('#an-card .an-text');
    this.tapeEl = q('#hud-tape');
    this.tapeNEl = q('#tape-n');
    this.coachEl = q('#coach');
    this.coachTextEl = q('#coach-text');
    this.speedLinesEl = q('#speedlines');
    this.pedalHotTextEl = q('#pedal-hot-text');
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
    this.popups = new Popups(q('#popup-layer'), () => this.popupBand());
    // The band popups live in moves only on a resize (or rotation).
    window.addEventListener('resize', () => {
      this.bandDirty = true;
      this.scoreLen = 0; // refit the score to the new width
    });

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
    this.pedalsEl.classList.toggle('brake-hot', hot);
  }

  // El cafecito on the pedals: frac is the time left (1..0, 0 = none). The
  // gas wears a gold ring that drains, reads CAFECITO (the power-up keeps
  // its name in EN), and FRENO dims: the cafecito pays neither.
  setCafecito(frac: number): void {
    const q = frac > 0 ? Math.ceil(frac * 40) : -1;
    if (q === this.cafeShown) return;
    const was = this.cafeShown;
    this.cafeShown = q;
    if (q >= 0 !== was >= 0) {
      this.pedalsEl.classList.toggle('cafe', q >= 0);
      this.pedalGasEl.querySelector('.pedal-label')!.textContent = q >= 0 ? 'CAFECITO' : this.t().pedalGas;
    }
    if (q >= 0) this.pedalsEl.style.setProperty('--cafe', String(q / 40));
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
    this.pedalGasEl.querySelector('.pedal-label')!.textContent = this.cafeShown >= 0 ? 'CAFECITO' : t.pedalGas;
    this.pedalBrakeEl.querySelector('.pedal-label')!.textContent = t.pedalBrake;
    this.pedalHotTextEl.textContent = t.pedalBrakeHot;
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
      this.lastRecord > 0 ? `${t.record.toUpperCase()} ${fmtN(this.lastRecord)}` : '';
    this.recordKey = Number.NaN; // the run's countdown rewrites it on its next tick
    if (this.coachShown) this.coachTextEl.textContent = this.coachText(this.coachShown);
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
    this.bandDirty = true;
    this.setContraVia(false);
    this.setCaballito(false);
    this.setGas(false);
    this.setBrake(false);
    this.setPedalLive(false);
  }

  showPlaying(record: number): void {
    this.lastRecord = record;
    this.hideCountdown();
    this.applyLang();
    this.resetRunHud();
    this.showPedal(0);
    this.setPedalLive(true);
    this.hud.classList.remove('hidden');
    this.title.classList.add('hidden');
    this.gameover.classList.add('hidden');
    this.pause.classList.add('hidden');
  }

  // A clean HUD for a new run.
  private resetRunHud(): void {
    this.scoreTarget = 0;
    this.scoreShown = -1;
    this.scoreRollT = -1;
    this.scoreLen = 0;
    this.writeScore(0);
    this.setCombo(0, null);
    this.comboBarShown = -1;
    this.platShown = -1;
    this.setPlatanos(0);
    this.setContraVia(false);
    this.setCaballito(false);
    this.setGas(false);
    this.setBrake(false);
    this.setBrakeHeat(0, false);
    this.setCafecito(0);
    this.multQ = 10;
    this.multEl.classList.add('off');
    this.recordKey = Number.NaN;
    this.lane.clear();
    this.laneShown = null;
    this.anCard.className = 'an-card';
    this.streetWildAt = -1;
    this.setTapeApproach(-1);
    this.coach.startRun();
    this.showCoach(null);
    this.popups.clear();
    this.setFrozen(false);
    this.bandDirty = true;
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

  // The pedals stay hidden through the resume countdown; main shows them
  // at GO, so a thumb resting on the pedal area never acts on a frozen world.
  hidePause(): void {
    this.pause.classList.add('hidden');
  }

  // ---------------- the HUD ----------------

  // One HUD tick, every rendered frame (and every __ecc.tick step): the score
  // roll, the popups' clock, the announcement lane and the freeze. running:
  // a run is on screen (playing or crashing). frozen: paused or counting
  // down, so the HUD holds still with the world.
  update(dt: number, running: boolean, frozen: boolean): void {
    this.clock += dt;
    if (frozen !== this.frozen) this.setFrozen(frozen);
    if (!running || frozen) return;
    this.popups.update(dt);
    this.stepScore();
    // An escalation no multiplier came to claim this step speaks alone.
    if (this.streetWildAt >= 0) {
      this.streetWildAt = -1;
      this.announce('streetWild', this.t().streetWild);
    }
    if (this.lane.step(dt)) this.renderLane();
    else if (!this.laneShown && this.lane.now >= this.lane.freeAt && this.anCard.classList.contains('out')) {
      this.anCard.className = 'an-card'; // a cut card's exit is over and nothing followed
    }
  }

  // For probes (__ecc.hud): what the lane, the coach and the score show.
  hudState(): { lane: string | null; kicker: string | null; kind: string | null; queued: number; coach: CoachId | null; learned: number; tape: number; score: number; frozen: boolean } {
    const a = this.lane.current;
    return {
      lane: a ? a.text : null,
      kicker: a ? a.kicker : null,
      kind: a ? a.kind : null,
      queued: this.lane.queued,
      coach: this.coachShown,
      learned: this.coach.learned,
      tape: this.tapeStep < 0 ? -1 : this.tapeStep * CONFIG.tapeApproachStepM,
      score: this.scoreShown,
      frozen: this.frozen,
    };
  }

  private setFrozen(on: boolean): void {
    this.frozen = on;
    this.hud.classList.toggle('frozen', on);
    this.popups.freeze(on);
  }

  // The score rolls up to a gain (easeOutQuad over scoreRollSec) and a big
  // one punches it; the meters just tick.
  setScore(n: number): void {
    if (n === this.scoreTarget) return;
    const gain = n - this.scoreTarget;
    this.scoreTarget = n;
    if (gain >= CONFIG.scorePunchAt && this.scoreShown >= 0) {
      this.scoreFrom = this.scoreShown;
      this.scoreRollT = this.clock;
      if (this.clock - this.lastPunchAt > 0.15) {
        this.lastPunchAt = this.clock;
        restart(this.scoreEl, 'punch');
      }
    } else if (this.scoreRollT < 0) {
      this.writeScore(n);
    }
  }

  private stepScore(): void {
    if (this.scoreRollT < 0) return;
    const u = (this.clock - this.scoreRollT) / CONFIG.scoreRollSec;
    if (u >= 1) {
      this.scoreRollT = -1;
      this.writeScore(this.scoreTarget);
      return;
    }
    const e = 1 - (1 - u) * (1 - u);
    this.writeScore(Math.round(this.scoreFrom + (this.scoreTarget - this.scoreFrom) * e));
  }

  private writeScore(n: number): void {
    if (n === this.scoreShown) return;
    this.scoreShown = n;
    const s = SCORE_FMT.format(n);
    this.scoreEl.textContent = s;
    if (s.length !== this.scoreLen) {
      this.scoreLen = s.length;
      this.fitScore(s);
    }
  }

  // A long score shrinks to fit between the side columns (pause on the left,
  // plátanos and the multiplier on the right). Widest digits assumed.
  private fitScore(s: string): void {
    const base = this.scoreBox.offsetHeight || 46;
    let em = 0.12; // the stroke
    for (const ch of s) em += ch === ',' ? 0.3 : 0.6;
    const room = window.innerWidth - 2 * (12 + HUD_SIDE_PX + 8);
    const fit = Math.min(1, room / (em * base));
    this.scoreBox.style.setProperty('--score-fit', fit.toFixed(3));
  }

  // The combo: ×n over the slang tier. A new tier slams in; any other step
  // up bumps the count (never both at once: the slam is the celebration).
  setCombo(n: number, tier: string | null): void {
    if (n === this.comboShown) return;
    const up = n > this.comboShown;
    this.comboShown = n;
    if (n < 2) {
      this.comboEl.classList.add('off');
      this.comboTierShown = 0;
      this.setComboLow(false);
      return;
    }
    this.comboNEl.textContent = `×${n}`;
    let ti = 0;
    for (const step of LADDER_STEPS) if (n >= step) ti++;
    let slam = false;
    if (ti !== this.comboTierShown) {
      this.comboTierShown = ti;
      this.comboTierEl.textContent = tier ?? '';
      this.comboTierEl.dataset.tier = String(ti);
      this.fitTier();
      slam = up;
      if (slam) restart(this.comboTierEl, 'slam');
    }
    this.comboEl.classList.remove('off');
    if (up && !slam) restart(this.comboNEl, 'bump');
  }

  // The tier shrinks only if its slam (1.16x at the peak) would leave the
  // centre column: "LEGEND OF THE MALECÓN!" on a narrow phone.
  private fitTier(): void {
    const el = this.comboTierEl;
    el.style.setProperty('--tier-fit', '1');
    const room = this.comboEl.parentElement!.clientWidth - 8;
    const w = el.scrollWidth * 1.16;
    el.style.setProperty('--tier-fit', w > room ? (room / w).toFixed(3) : '1');
  }

  // The combo's remaining life as a shrinking fuse under it. Written only
  // when it moves a visible amount; its last second burns red and ticks.
  setComboFraction(f: number): void {
    const q = Math.round(f * 40); // 2.5% steps
    if (q !== this.comboBarShown) {
      this.comboBarShown = q;
      this.comboBarEl.style.transform = `scaleX(${q / 40})`;
    }
    this.setComboLow(this.comboShown >= 2 && f > 0 && f * CONFIG.comboDecaySec <= 1);
  }

  private setComboLow(on: boolean): void {
    if (on === this.comboLow) return;
    this.comboLow = on;
    this.comboEl.classList.toggle('low', on);
  }

  setPlatanos(n: number): void {
    if (n === this.platShown) return;
    this.platShown = n;
    this.platEl.textContent = fmtN(n);
    if (n > 0) restart(this.platEl.parentElement!, 'bump');
  }

  setContraVia(on: boolean): void {
    if (on === this.cvShown) return;
    this.cvShown = on;
    this.cvEl.classList.toggle('on', on);
    this.cvVignette.classList.toggle('on', on);
  }

  setCaballito(on: boolean): void {
    if (on === this.cabShown) return;
    this.cabShown = on;
    this.cabEl.classList.toggle('on', on);
  }

  // Wind streaks at the edges of the frame, fading in past ~60% of top
  // speed and saturating a fondo. Pure CSS animation; only the container's
  // opacity is written, and only when it moves a step.
  setSpeedLines(norm: number): void {
    const q = Math.round(Math.max(0, Math.min(1, (norm - 0.6) / 0.6)) * 20);
    if (q === this.speedLinesShown) return;
    this.speedLinesShown = q;
    this.speedLinesEl.style.opacity = String(q / 20);
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
  // ×15. Hidden at ×1; gold from ×3, on fire from ×6. Called every frame;
  // it writes only when the shown value changes, and bumps when it climbs.
  setLiveMult(m: number): void {
    const q = m >= 10 ? Math.round(m) * 10 : Math.round(m * 10);
    if (q === this.multQ) return;
    const up = q > this.multQ;
    this.multQ = q;
    this.multEl.classList.toggle('off', q === 10);
    const heat = q >= 60 ? 2 : q >= 30 ? 1 : 0;
    if (heat !== this.multHeat) {
      this.multHeat = heat;
      this.multEl.classList.toggle('hot', heat === 1);
      this.multEl.classList.toggle('fire', heat === 2);
    }
    if (q === 10) return;
    this.multEl.textContent = fmtMult(q / 10);
    if (up) restart(this.multEl, 'bump');
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
      key === -1 ? '' : key === -2 ? t.newRecord : key === -3 ? `${t.record.toUpperCase()} ${fmtN(record)}` : t.toGo(key);
    this.hudRecordEl.classList.toggle('near', key >= 0);
  }

  // La Cinta ahead (m to the tape, <= 0 for none): inside tapeApproachM a
  // chip in the lane counts down "Faltan 180 m" in tapeApproachStepM steps,
  // punching on each. It steps aside while an announcement is up.
  setTapeApproach(toTape: number): void {
    const on = toTape > 0 && toTape <= CONFIG.tapeApproachM;
    const step = on ? Math.ceil(toTape / CONFIG.tapeApproachStepM) : -1;
    if (step === this.tapeStep) return;
    const was = this.tapeStep;
    this.tapeStep = step;
    this.tapeEl.classList.toggle('off', step < 0);
    if (step < 0) return;
    this.tapeNEl.textContent = this.t().tapeToGo(step * CONFIG.tapeApproachStepM);
    if (was >= 0) restart(this.tapeEl, 'punch');
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
    this.popups.show(`${razor ? t.razorMiss : t.nearMiss} +${fmtN(pts)}`, x, y, cls);
  }

  // A plátano: pickups close together read as one growing "+N".
  popupPlatano(pts: number, x: number, y: number): void {
    this.popups.platano(pts, x, y, plusLabel);
  }

  popupRecordNear(): void {
    this.announce('nudge', this.t().recordNear);
  }

  bannerFarthest(): void {
    this.announce('record', this.t().farRecord);
  }

  bannerGoal(): void {
    this.announce('record', this.t().goalReached);
  }

  // ---------------- coach chips ----------------

  // One live sim step: what the player did, t seconds into the run.
  coachStep(t: number, x: number, cv: boolean, trick: boolean, gas: boolean): void {
    const id = this.coach.step(t, x, cv, trick, gas);
    if (id !== this.coachShown) this.showCoach(id);
  }

  private showCoach(id: CoachId | null): void {
    this.coachShown = id;
    this.bandDirty = true; // popups keep clear of the chip
    if (!id) {
      this.coachEl.classList.add('off');
      this.coachEl.classList.remove('show');
      return;
    }
    this.coachEl.dataset.cue = id;
    this.coachTextEl.textContent = this.coachText(id);
    this.coachEl.classList.remove('off');
    restart(this.coachEl, 'show');
  }

  private coachText(id: CoachId): string {
    const t = this.t();
    const key = this.inputMode === 'key';
    const trick = this.selectedVehicle === 'civic' ? t.trickCar : t.trickBike;
    const gas = multTag(CONFIG.gasScoreMult);
    switch (id) {
      case 'steer':
        return key ? t.coachSteerKey : t.coachSteer;
      case 'cv':
        return t.coachCv(multTag(CONFIG.contraViaMultiplier));
      case 'trick':
        return key ? t.coachTrickKey(trick) : t.coachTrick(trick);
      case 'gas':
        return key ? t.coachGasKey(gas) : t.coachGas(gas);
    }
  }

  // ---------------- the announcement lane ----------------

  // Public for probes (__ecc.announce); the game calls the named methods.
  announce(kind: AnnounceKind, text: string, kicker = ''): void {
    this.lane.push(announcement(kind, text, kicker));
    if (this.lane.step(0)) this.renderLane(); // a free lane shows it this frame
  }

  private renderLane(): void {
    const a = this.lane.current;
    const c = this.anCard;
    if (!a) {
      // Cut short by a bigger one: fade out now. Run out on its own: its
      // exit already played (an-out at --an-out-at), so just clear it.
      if (this.laneShown && this.lane.lastCut) {
        c.classList.remove('show');
        c.classList.add('out');
      } else {
        c.className = 'an-card';
      }
      this.laneShown = null;
      return;
    }
    this.laneShown = a;
    // Laid out (shown) before it is measured; restart() then replays the entry.
    c.className = `an-card an-${a.style}${a.kind === 'mandao' || a.kind === 'levelUp' ? ' sentence' : ''} show`;
    c.style.removeProperty('--an-max');
    c.style.setProperty('--an-out-at', `${Math.max(0, a.showSec - CONFIG.announceOutSec)}s`);
    this.anKicker.textContent = a.kicker;
    this.anText.textContent = a.text;
    this.fitLane();
    restart(c, 'show');
  }

  // Auto-fit: the big line shrinks to fit one line, down to 72% (86% for a
  // sentence); past that it wraps, balanced, onto two lines at most
  // (shrinking more if it must, never under LANE_MIN_PX).
  // Sized so the card still fits at the peak of its pop-in (1.08x), and so
  // it ends above the horizon, where traffic first shows (laneHorizonShare).
  private fitLane(): void {
    const c = this.anCard;
    const text = this.anText;
    c.style.setProperty('--an-fit', '1');
    const cs = getComputedStyle(c);
    const chrome =
      parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight) + parseFloat(cs.borderLeftWidth) + parseFloat(cs.borderRightWidth);
    const avail = c.parentElement!.clientWidth / 1.12 - chrome - 6;
    const natural = text.scrollWidth;
    const oneLine = text.offsetHeight;
    const minFit = LANE_MIN_PX / parseFloat(getComputedStyle(text).fontSize);
    let fit = 1;
    // A shout shrinks to stay on one line; a sentence would rather wrap.
    const oneLineFloor = c.classList.contains('sentence') ? 0.86 : 0.72;
    if (natural > avail && natural * oneLineFloor <= avail) {
      fit = avail / natural;
    } else if (natural > avail) {
      c.classList.add('wrap');
      c.style.setProperty('--an-max', `${Math.floor(avail)}px`);
      fit = Math.min(1, Math.max(minFit, (2 * avail * 0.9) / natural));
      for (let i = 0; i < 5 && fit > minFit; i++) {
        c.style.setProperty('--an-fit', fit.toFixed(3));
        if (text.offsetHeight <= oneLine * fit * 2.3) break;
        fit = Math.max(minFit, fit * 0.9);
      }
    }
    c.style.setProperty('--an-fit', fit.toFixed(3));
    // (the lane's own top: the card itself is mid-transform at this point)
    const maxBottom = window.innerHeight * CONFIG.laneHorizonShare - c.parentElement!.getBoundingClientRect().top;
    for (let i = 0; i < 6 && fit > minFit && c.offsetHeight > maxBottom; i++) {
      fit = Math.max(minFit, fit * 0.94);
      c.style.setProperty('--an-fit', fit.toFixed(3));
    }
  }

  // The band popups live in: under the top band's pills, above the pedals
  // (and the coach chip), inside the safe area. Measured only when the
  // layout may have moved; on the title (no HUD) it is most of the screen.
  private popupBand(): Band {
    const b = this.layoutBand();
    // Clear of whatever the lane is showing right now (read per popup).
    const now = this.bandNow;
    now.left = b.left;
    now.right = b.right;
    now.bottom = b.bottom;
    now.top = b.top;
    const lane = this.laneShown ? this.anCard : this.tapeStep >= 0 ? this.tapeEl : null;
    if (lane && !this.hud.classList.contains('hidden')) now.top = Math.max(b.top, lane.getBoundingClientRect().bottom + 4);
    return now;
  }

  // The part of popupBand that only moves with the layout.
  private layoutBand(): Band {
    const b = this.bandBox;
    if (!this.bandDirty) return b;
    const W = window.innerWidth;
    const H = window.innerHeight;
    const pills = this.pillsEl.getBoundingClientRect();
    if (pills.height === 0) {
      b.left = 0;
      b.right = W;
      b.top = H * 0.12;
      b.bottom = H * 0.88;
      return b; // not cached: the HUD is hidden
    }
    const top = document.getElementById('hud-top')!.getBoundingClientRect();
    b.left = top.left - 16;
    b.right = top.right + 16;
    b.top = pills.bottom + 4;
    let bottom = this.pedalsEl.getBoundingClientRect().top;
    if (bottom <= 0) bottom = H - 16;
    if (this.coachShown) bottom = Math.min(bottom, this.coachEl.getBoundingClientRect().top);
    // and out from under the steering thumb, which rests low on the screen
    b.bottom = Math.min(bottom - 6, H * CONFIG.popupFloorShare);
    this.bandDirty = false;
    return b;
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

  // Mid-run: a mandao got done. It goes through the announcement lane, so a
  // set finished on one plátano still reads one line at a time, then the
  // level up, and never on top of a tramo sign or a record.
  toastMandao(c: Completion): void {
    const t = this.t();
    // (no "en una corrida" tail here: the run it happened in is this one)
    const what = t.mandao[c.mandao.kind](c.mandao.target, this.trickNoun());
    this.announce('mandao', `${what} · ${t.reward(c.reward)}`, c.daily ? t.dailyDone : t.mandaoDone);
    if (c.levelUp) {
      const name = t.levelNames[Math.min(c.level, t.levelNames.length - 1)];
      this.announce('levelUp', `${name} ${fmtBarrio(barrioMultFor(c.level))} · ${t.reward(c.setBonus)}`, t.levelUpKicker);
    }
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
    this.popups.show(`${name} +${fmtN(pts)}`, x, y, 'pop-md pop-gold', true);
  }

  popupAir(pts: number, x: number, y: number): void {
    this.popups.show(`${this.t().air} +${fmtN(pts)}`, x, y, 'pop-md pop-gold', true);
  }

  popupObelisco(): void {
    this.announce('landmark', this.t().obelisco);
  }

  // A set piece calls its name, on a red street-warning plate.
  popupSetPiece(kind: SetPieceKind): void {
    this.announce('setPiece', this.t().setPieces[kind]);
  }

  // Escalation fires on the same step as the multiplier tier, just before
  // it: it waits for it and rides on the multiplier's card as the kicker.
  popupEscalation(): void {
    this.streetWildAt = this.clock;
  }

  popupMultUp(n: number): void {
    const t = this.t();
    const kicker = this.streetWildAt >= 0 ? t.streetWild : '';
    this.streetWildAt = -1;
    this.announce('mult', t.multUp(n), kicker);
  }

  // Arriving somewhere new is the payoff for a long run: a green road sign,
  // DE VUELTA EN EL MALECÓN / LLEGASTE A LA ZONA COLONIAL / YA ESTÁS EN EL CAMPO.
  popupTramo(tr: Tramo): void {
    const t = this.t();
    this.announce('tramo', t.tramoNames[tr], t.tramoKicker[tr]);
  }

  bannerNewRecord(): void {
    this.announce('record', this.t().newRecord);
  }

  // The Bendición took the hit for you.
  popupShieldSaved(): void {
    this.announce('shield', this.t().shieldSaved);
  }

  // The resume countdown: 3, 2, 1, then ¡DALE! as the world moves again.
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

  // A popup at a screen point in percent (power-up names come through
  // here). pop-lg ones live a little longer.
  popup(text: string, xPct: number, yPct: number, cls: string): void {
    this.popups.show(text, xPct, yPct, cls, cls.includes('pop-lg'));
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
