// ui.ts: DOM screens, HUD, floating popups, vehicle cards, copy strings, and
// the share card. Spanish-first with an EN flip. The slang stays Dominican in
// both languages.

import { CONFIG, PINTURAS, VEHICLES, type VehicleId } from './config';
import { LADDER_STEPS, type PinturaGoal, type RunResult } from './score';
import { barrioMultFor, mandaoPerRun, type Completion, type Mandao, type MandaoKind, type MandaosView } from './missions';
import { drawDominicanFlag } from './flag';
import type { SetPieceKind } from './traffic';
import { shareImage, type ShareResult } from './share';
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
    startTouch: 'TOCA PA’ EMPEZAR',
    startKey: 'DALE A ESPACIO',
    // One hint line under the ride picker; the pedals label themselves.
    hintTouch: (trick: string) => `Arrastra pa’ esquivar · Desliza arriba: ${trick}`,
    hintKey: (trick: string) => `A / D pa’ esquivar · W: ${trick} · Flechas: pedales`,
    record: 'Récord',
    points: 'Puntos',
    again: 'OTRA VEZ',
    menu: 'MENÚ',
    share: 'COMPARTIR',
    resumeBtn: 'SEGUIR',
    newRecord: '¡NUEVO RÉCORD!',
    tapeRecord: 'TU RÉCORD',
    pause: 'PAUSA',
    // The ride picker: stat bars, the ride's own récord, the paints.
    statVel: 'Velocidad',
    statMan: 'Manejo',
    statAgu: 'Aguante',
    rideRecord: (n: number) => `Récord ${fmtN(n)}`,
    rideNoRecord: 'Sin récord todavía',
    paintWearing: (name: string) => `Llevas ${name}`,
    paintUse: (name: string) => `Toca otra vez pa’ poner ${name}`,
    paintBuy: (name: string) => `Toca otra vez pa’ comprar ${name}`,
    paintNeed: (n: number) => (n === 1 ? 'Te falta 1 plátano' : `Te faltan ${fmtN(n)} plátanos`),
    paintLocked: (name: string, price: number) => `${name}, cuesta ${fmtN(price)} plátanos`,
    paintOwned: (name: string) => `${name}, ya es tuya`,
    paintAfford: '¡Ya te alcanza pa’ una pintura nueva!',
    ariaClose: 'Cerrar',
    // The game-over card
    bestLine: (n: number) => `Récord ${fmtN(n)}`,
    overBest: (n: number) => `¡${fmtN(n)} más que tu récord!`,
    closeCall: (n: number) => `¡Te quedaste a ${fmtN(n)} m!`,
    pastRecord: (n: number) => `¡${fmtN(n)} m más lejos que tu récord!`,
    distEnd: (label: string, m: number) => `${label} ${fmtN(m)} m`,
    bdCombo: 'mejor combo',
    bdNear: (n: number) => (n === 1 ? 'cerquita' : 'cerquitas'),
    bdCv: 'en contra vía',
    stamp: '¡HECHO!',
    pinturaAll: '¡Tienes todas las pinturas!',
    inVehicle: (v: string) => `en ${v} por el Malecón`,
    inVehicleReached: (v: string, place: string) => `en ${v} hasta ${place}`,
    shareText: (n: number) => `${fmtN(n)} puntos por el Malecón.`,
    shareAsk: '¿Me puedes ganar?',
    shareLevel: (name: string, mult: string) => `Nivel ${name} ${mult}`,
    shareStats: (m: number, p: number) => `${fmtN(m)} m · ${p === 1 ? '1 plátano' : `${fmtN(p)} plátanos`}`,
    ariaSound: 'Sonido',
    ariaPause: 'Pausa',
    gameOverTitles: ['¡Te dieron, loco!', '¡Diache!', '¡Eso tuvo feo!'],
    cvPill: '¡EN CONTRA VÍA! ×2',
    trickPillBike: '¡CABALLITO! ×1.5',
    trickPillCar: '¡DERRAPE! ×1.5',
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
    nearMiss: '¡Cerquita!',
    razorMiss: '¡Por un pelito!',
    ladder: ['¡Eso!', '¡Duro!', '¡Diache!', '¡Tú ta’ loco!', '¡ETE E’ UN LOCO!', '¡LEYENDA DEL MALECÓN!'],
    // Records: ¡NUEVO RÉCORD! is points, La Cinta is distance.
    farRecord: '¡MÁS LEJOS QUE NUNCA!',
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
    levelHead: (level: number, name: string) => `NIVEL ${level} · ${name.toUpperCase()}`,
    multPill: (mult: string) => `${mult} en puntos`,
    levelNames: ['Novato', 'Pasajero', 'Motoconchista', 'Tíguere', 'Tíguere de Verdad', 'Jefe del Malecón', 'Leyenda del Malecón'],
    mandaoDone: '¡MANDAO HECHO!',
    dailyDone: '¡MANDAO DEL DÍA!',
    levelUp: (name: string, mult: string) => `¡SUBISTE A ${name.toUpperCase()}! ${mult}`,
    levelUpKicker: '¡SUBISTE DE NIVEL!',
    dailyTitle: 'EL MANDAO DEL DÍA',
    dailyTag: 'HOY',
    streak: (n: number) => (n === 1 ? 'Racha: 1 día' : `Racha: ${n} días`),
    reward: (n: number) => `+${fmtN(n)} plátanos`,
    perRun: ' en una corrida',
    earned: (n: number) => (n === 1 ? '+1 plátano' : `+${fmtN(n)} plátanos`),
    pinturaNeed: (n: number, name: string) =>
      n === 1 ? `Te falta 1 plátano pa’ ${name}` : `Te faltan ${fmtN(n)} plátanos pa’ ${name}`,
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
    subtitle: 'Let’s go, we’re late!',
    startTouch: 'TAP TO START',
    startKey: 'PRESS SPACE',
    hintTouch: (trick: string) => `Drag to weave · Swipe up: ${trick}`,
    hintKey: (trick: string) => `A / D to weave · W: ${trick} · Arrows: pedals`,
    record: 'Best',
    points: 'Points',
    again: 'AGAIN',
    menu: 'MENU',
    share: 'SHARE',
    resumeBtn: 'RESUME',
    newRecord: 'NEW RECORD!',
    tapeRecord: 'YOUR RECORD',
    pause: 'PAUSED',
    statVel: 'Speed',
    statMan: 'Handling',
    statAgu: 'Toughness',
    rideRecord: (n: number) => `Best ${fmtN(n)}`,
    rideNoRecord: 'No best yet',
    paintWearing: (name: string) => `Riding in ${name}`,
    paintUse: (name: string) => `Tap again to use ${name}`,
    paintBuy: (name: string) => `Tap again to buy ${name}`,
    paintNeed: (n: number) => (n === 1 ? '1 more plantain' : `${fmtN(n)} more plantains`),
    paintLocked: (name: string, price: number) => `${name}, costs ${fmtN(price)} plantains`,
    paintOwned: (name: string) => `${name}, owned`,
    paintAfford: 'You can afford a new paint!',
    ariaClose: 'Close',
    bestLine: (n: number) => `Best ${fmtN(n)}`,
    overBest: (n: number) => `${fmtN(n)} over your old best!`,
    closeCall: (n: number) => `Only ${fmtN(n)} m short!`,
    pastRecord: (n: number) => `${fmtN(n)} m past your best!`,
    distEnd: (label: string, m: number) => `${label} ${fmtN(m)} m`,
    bdCombo: 'best combo',
    bdNear: (n: number) => (n === 1 ? 'near-miss' : 'near-misses'),
    bdCv: 'wrong way',
    stamp: 'DONE!',
    pinturaAll: 'You own every paint!',
    inVehicle: (v: string) => `on ${v} down the Malecón`,
    inVehicleReached: (v: string, place: string) => `on ${v} all the way to ${place}`,
    shareText: (n: number) => `${fmtN(n)} points down the Malecón.`,
    shareAsk: 'Can you beat me?',
    shareLevel: (name: string, mult: string) => `Level ${name} ${mult}`,
    shareStats: (m: number, p: number) => `${fmtN(m)} m · ${p === 1 ? '1 plantain' : `${fmtN(p)} plantains`}`,
    ariaSound: 'Sound',
    ariaPause: 'Pause',
    gameOverTitles: ['They got you!', 'Wipeout!', 'That was ugly!'],
    cvPill: 'WRONG WAY! ×2',
    trickPillBike: 'WHEELIE! ×1.5',
    trickPillCar: 'DRIFT! ×1.5',
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
    nearMiss: 'So close!',
    razorMiss: 'By a hair!',
    ladder: ['That’s it!', 'Sick!', 'Dang!', 'You’re crazy!', 'THIS GUY’S A MANIAC!', 'LEGEND OF THE MALECÓN!'],
    farRecord: 'FARTHEST EVER!',
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
    levelHead: (level: number, name: string) => `LEVEL ${level} · ${name.toUpperCase()}`,
    multPill: (mult: string) => `${mult} on points`,
    levelNames: ['Rookie', 'Passenger', 'Moto-taxi Rider', 'Tíguere', 'Real Tíguere', 'Boss of the Malecón', 'Legend of the Malecón'],
    mandaoDone: 'MISSION DONE!',
    dailyDone: 'DAILY DONE!',
    levelUp: (name: string, mult: string) => `LEVEL UP: ${name.toUpperCase()}! ${mult}`,
    levelUpKicker: 'LEVEL UP!',
    dailyTitle: 'TODAY’S MISSION',
    dailyTag: 'TODAY',
    streak: (n: number) => (n === 1 ? 'Streak: 1 day' : `Streak: ${n} days`),
    reward: (n: number) => `+${fmtN(n)} plantains`,
    perRun: ' in one run',
    earned: (n: number) => (n === 1 ? '+1 plantain' : `+${fmtN(n)} plantains`),
    pinturaNeed: (n: number, name: string) =>
      n === 1 ? `1 more plantain for ${name}` : `${fmtN(n)} more plantains for ${name}`,
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
  // A swatch was tapped: preview it on the ride, or, when it is already the
  // one previewed, equip it (owned) or buy it (locked).
  onPinturaPick(index: number): void;
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

// 12,000: grouped in the language's own locale. es-DO groups every number
// from 1,000 up (plain 'es' leaves 4567 bare), and both read 12,000.
let numLocale = readLang() === 'en' ? 'en-US' : 'es-DO';
function fmtN(n: number): string {
  return Math.floor(n).toLocaleString(numLocale);
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

// The ride picker's tabs: one per ride, the selected one filled.
function rideTabsHtml(): string {
  return VEHICLE_IDS.map(
    (id) => `<button class="vtab" type="button" role="tab" data-v="${id}" aria-selected="false">${VEHICLES[id].name}</button>`,
  ).join('');
}

// Five pips per stat (stats run 1..5): chunky, readable at a glance.
const PIPS = '<i></i><i></i><i></i><i></i><i></i>';

// Lilita One has no check, lock or cross glyph, so these are drawn.
const CHECK_SVG =
  '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M3 8.6l3.1 3.1L13 4.6" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const LOCK_SVG =
  '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M5.2 7.2V5.4a2.8 2.8 0 0 1 5.6 0v1.8" fill="none" stroke="currentColor" stroke-width="1.9"/><rect x="3.2" y="7" width="9.6" height="7.2" rx="1.8" fill="currentColor"/></svg>';
const CLOSE_SVG =
  '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg>';

// OWNER DECISION: where the share card sends people (App Store or the
// site). Empty until Adelson picks one; the card omits its footer line and
// the share text stays URL-free while it is empty.
export const SHARE_URL = '';

// The share photo, 3:2: wide enough for the rider, the ride and what hit them.
const SNAP_W = 900;
const SNAP_H = 600;

function hexCss(hex: number): string {
  return `#${hex.toString(16).padStart(6, '0')}`;
}

// Honours the OS setting live: the count-up, the bars and the stamps
// all land in their final state when it is on. Read at use, not at import,
// so the module also loads outside a browser (the tests import STRINGS).
function reducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function easeOutCubic(t: number): number {
  const u = 1 - t;
  return 1 - u * u * u;
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
  private platEl: HTMLElement;
  private multEl: HTMLElement;
  private hudRecordEl: HTMLElement;
  private subtitleEl: HTMLElement;
  private promptEl: HTMLElement;
  private hintEl: HTMLElement;
  private readonly fontsReady: Promise<unknown> = document.fonts
    ? document.fonts.ready
    : Promise.resolve();
  // Which controls to advertise. Seeded from the device, then corrected by
  // whatever the player actually touches first: a phone has no space bar.
  private inputMode: 'touch' | 'key' = window.matchMedia('(pointer: coarse)').matches
    ? 'touch'
    : 'key';
  private langBtn: HTMLElement;
  private muteBtn: HTMLElement;
  private mutePauseBtn: HTMLElement;
  private pauseBtn: HTMLElement;
  private lastRecords: Record<VehicleId, number> | null = null;
  // Las Pinturas on the title: the selected ride's row, as main last sent it.
  private paintState: { preview: number; equipped: number; owned: ReadonlySet<number>; bank: number } | null = null;
  private paintsFor: VehicleId | null = null; // which ride the swatch buttons were built for
  private paintsEl: HTMLElement;
  private paintStateEl: HTMLElement;
  private goTitleEl: HTMLElement;
  private goStampEl: HTMLElement;
  private goPointsLabel: HTMLElement;
  private goPoints: HTMLElement;
  private goBestEl: HTMLElement;
  private gdCaptionEl: HTMLElement;
  private gdRunEl: HTMLElement;
  private gdGoalEl: HTMLElement;
  private gdFillEl: HTMLElement;
  private goBreakEl: HTMLElement;
  private goMandaosEl: HTMLElement;
  private gpSwatchEl: HTMLElement;
  private gpEarnedEl: HTMLElement;
  private gpTextEl: HTMLElement;
  private gpFillEl: HTMLElement;
  private btnAgain: HTMLElement;
  private btnMenu: HTMLElement;
  private btnShare: HTMLElement;
  private pauseTitle: HTMLElement;
  private pauseLevelEl: HTMLElement;
  private btnResume: HTMLElement;
  private btnPauseMenu: HTMLElement;
  private mandaoChipEl: HTMLElement;
  private mandaoSheetEl: HTMLElement;
  private pauseMandaosEl: HTMLElement;
  // The share card's photo: the game frame at the crash, cropped around
  // the rider. Taken by captureScene; cleared when a new run starts.
  private snap: HTMLCanvasElement | null = null;
  private snapReady = false;
  // The barrio level that multiplied the run on the card (a level won this
  // run pays from the next one), for the share card's honest level line.
  private shareLevel = { idx: 0, mult: 1 };

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
            <div id="an-card" class="an-card" role="status" aria-live="polite"><span class="an-kicker"></span><span class="an-text"></span></div>
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
        <div id="coach" class="off" role="status" aria-live="polite">${ARROW_SVG}<span id="coach-text"></span></div>
        <div id="pedals" class="hidden">
          <div id="pedal-speed" class="pedal-speed"><b id="pedal-kmh">0</b><span>km/h</span></div>
          <div class="pedal-mult pedal-mult-brake"><span>${multTag(CONFIG.brakeScoreMult)}</span></div>
          <div class="pedal-mult pedal-hot-tag"><span id="pedal-hot-text"></span></div>
          <div class="pedal-mult pedal-mult-gas"><span>${multTag(CONFIG.gasScoreMult)}</span></div>
          <button id="pedal-brake" class="pedal pedal-brake" type="button"><i class="pedal-heat"></i><i class="pedal-tread"></i>${FLAME_SVG}<span class="pedal-label"></span></button>
          <button id="pedal-gas" class="pedal pedal-gas" type="button"><i class="pedal-ring"></i><i class="pedal-tread"></i><span class="pedal-label"></span></button>
        </div>
      </div>
      <div id="popup-layer" aria-hidden="true"></div>
      <div id="countdown" class="hidden"></div>
      <div id="flash"></div>
      <div id="title" class="screen hidden">
        <button id="lang" class="chip" type="button"></button>
        <button id="mute" class="chip chip-mute" type="button" aria-label="Sonido">
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor"/><path class="snd-wave" d="M16.5 8.5c2 2 2 5 0 7" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/><line class="snd-slash" x1="4" y1="20" x2="20" y2="4" stroke="#ce1126" stroke-width="2.6" stroke-linecap="round"/></svg>
        </button>
        <div class="t-top">
          <div class="logo">
            <span class="logo-el">EL</span>
            <span class="logo-line">CORRE</span>
            <span class="logo-line">CORRE</span>
            <div class="flagbar">${FLAG_SVG}</div>
          </div>
          <div id="subtitle" class="subtitle"></div>
        </div>
        <div id="vpick" class="vpick">
          <div class="vtabs" role="tablist">${rideTabsHtml()}</div>
          <div id="vdetail" class="vdetail" role="tabpanel">
            <div class="vd-stats">
              <div class="vd-stat"><span class="vd-label" data-stat="vel"></span><span class="vd-pips" data-pips="vel">${PIPS}</span></div>
              <div class="vd-stat"><span class="vd-label" data-stat="man"></span><span class="vd-pips" data-pips="man">${PIPS}</span></div>
              <div class="vd-stat"><span class="vd-label" data-stat="agu"></span><span class="vd-pips" data-pips="agu">${PIPS}</span></div>
            </div>
            <div class="vd-foot"><span id="vd-tag" class="vd-tag"></span><span id="vd-rec" class="vd-rec"></span></div>
          </div>
          <div id="hint" class="hint"></div>
        </div>
        <div id="t-paints" class="t-paints">
          <div id="paints" class="paints"></div>
          <div id="paint-state" class="paint-state" aria-live="polite"></div>
        </div>
        <div class="t-cta">
          <div id="prompt" class="prompt"></div>
        </div>
        <div class="title-chips">
          <div id="title-bank" class="title-bank">${BANANA_SVG}<span id="bank-n">0</span></div>
          <button id="mandao-chip" class="mandao-chip" type="button" aria-haspopup="dialog"></button>
        </div>
        <div id="mandao-sheet" class="mandao-sheet hidden" role="dialog" aria-modal="true" aria-labelledby="md-title">
          <div class="md-card">
            <button id="md-close" class="md-x" type="button">${CLOSE_SVG}</button>
            <div id="md-title" class="md-kicker"></div>
            <div id="md-level" class="md-level"></div>
            <div id="md-mult" class="md-mult"></div>
            <ul id="md-list" class="md-list md-sheet-rows"></ul>
          </div>
        </div>
      </div>
      <div id="gameover" class="screen hidden">
        <div class="go-card card">
          <div id="go-stamp" class="go-stamp hidden"></div>
          <div id="go-title" class="go-title"></div>
          <div class="go-score">
            <b id="go-points" class="go-points">0</b>
            <span class="go-sub"><span id="go-points-label" class="go-points-label"></span><span id="go-best" class="go-best"></span></span>
          </div>
          <div id="go-dist" class="go-dist">
            <div id="gd-caption" class="gd-caption"></div>
            <div class="gd-row">
              <span id="gd-run" class="gd-run"></span>
              <span class="gd-bar"><b id="gd-fill"></b></span>
              <span id="gd-goal" class="gd-goal"></span>
            </div>
          </div>
          <div id="go-break" class="go-break"></div>
          <ul id="go-mandaos" class="md-list md-card-rows"></ul>
          <div id="go-plat" class="go-plat">
            <i id="gp-swatch" class="gp-swatch"></i>
            <div class="gp-body">
              <div class="gp-top"><b id="gp-earned" class="gp-earned"></b><span class="gp-bar"><b id="gp-fill"></b></span></div>
              <span id="gp-text" class="gp-text"></span>
            </div>
          </div>
        </div>
        <div class="go-actions">
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
        <div class="pause-card">
          <div id="pause-level" class="pause-level"></div>
          <ul id="pause-mandaos" class="md-list md-card-rows"></ul>
        </div>
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
    this.platEl = q('#plat-n');
    this.multEl = q('#hud-mult');
    this.hudRecordEl = q('#hud-record');
    this.subtitleEl = q('#subtitle');
    this.promptEl = q('#prompt');
    this.hintEl = q('#hint');
    this.langBtn = q('#lang');
    this.muteBtn = q('#mute');
    this.mutePauseBtn = q('#mute-pause');
    this.pauseBtn = q('#hud-pause');
    this.paintsEl = q('#paints');
    this.paintStateEl = q('#paint-state');
    this.goTitleEl = q('#go-title');
    this.goStampEl = q('#go-stamp');
    this.goPointsLabel = q('#go-points-label');
    this.goPoints = q('#go-points');
    this.goBestEl = q('#go-best');
    this.gdCaptionEl = q('#gd-caption');
    this.gdRunEl = q('#gd-run');
    this.gdGoalEl = q('#gd-goal');
    this.gdFillEl = q('#gd-fill');
    this.goBreakEl = q('#go-break');
    this.goMandaosEl = q('#go-mandaos');
    this.gpSwatchEl = q('#gp-swatch');
    this.gpEarnedEl = q('#gp-earned');
    this.gpTextEl = q('#gp-text');
    this.gpFillEl = q('#gp-fill');
    this.btnAgain = q('#btn-again');
    this.btnMenu = q('#btn-menu');
    this.btnShare = q('#btn-share');
    this.pauseTitle = q('#pause-title');
    this.pauseLevelEl = q('#pause-level');
    this.btnResume = q('#btn-resume');
    this.btnPauseMenu = q('#btn-pause-menu');
    this.mandaoChipEl = q('#mandao-chip');
    this.mandaoSheetEl = q('#mandao-sheet');
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
    // The ride picker, the paint row and the footer swallow every tap, even
    // one that misses a control by a hair: a near miss never starts a run.
    for (const zone of root.querySelectorAll<HTMLElement>('#vpick, #t-paints, .title-chips')) {
      zone.addEventListener('pointerdown', (e) => e.stopPropagation());
    }
    for (const tab of root.querySelectorAll<HTMLElement>('.vtab')) {
      tab.addEventListener('pointerdown', () => {
        if (tab.dataset.v !== this.selectedVehicle) this.cb.onSelectVehicle(tab.dataset.v as VehicleId);
      });
    }
    // One listener for the swatches, which are rebuilt per ride.
    this.paintsEl.addEventListener('pointerdown', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLElement>('.paint');
      if (btn) this.cb.onPinturaPick(Number(btn.dataset.i));
    });
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
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape') this.mandaoSheetEl.classList.add('hidden');
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
    numLocale = this.lang === 'en' ? 'en-US' : 'es-DO';
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
    this.promptEl.textContent = this.inputMode === 'touch' ? t.startTouch : t.startKey;
    this.hudRecordEl.textContent =
      this.lastRecord > 0 ? `${t.record.toUpperCase()} ${fmtN(this.lastRecord)}` : '';
    this.recordKey = Number.NaN; // the run's countdown rewrites it on its next tick
    if (this.coachShown) this.coachTextEl.textContent = this.coachText(this.coachShown);
    if (this.mandaoView) this.setMandaos(this.mandaoView);
    for (const el of this.title.querySelectorAll<HTMLElement>('.vd-label')) {
      const k = el.dataset.stat;
      el.textContent = k === 'vel' ? t.statVel : k === 'man' ? t.statMan : t.statAgu;
    }
    this.renderRide();
    if (this.paintState) this.renderPaints();
    this.mandaoSheetEl.querySelector('#md-close')!.setAttribute('aria-label', t.ariaClose);
    this.goPointsLabel.textContent = t.points.toUpperCase();
    this.btnAgain.textContent = t.again;
    this.btnMenu.textContent = t.menu;
    this.btnShare.textContent = t.share;
    this.pauseTitle.textContent = t.pause;
    this.btnResume.textContent = t.resumeBtn;
    this.btnPauseMenu.textContent = t.menu;
    if (this.lastResult) {
      this.goTitleEl.textContent = t.gameOverTitles[this.goTitleIdx];
    }
  }

  // Las Pinturas: one row of swatches for the selected ride. Tap one to
  // preview it on the bike; tap the previewed one again to wear it (owned)
  // or buy it (locked). The line under the row speaks for the previewed one.
  updatePinturas(state: { preview: number; equipped: number; owned: ReadonlySet<number>; bank: number }): void {
    this.paintState = state;
    this.renderPaints();
  }

  private renderPaints(): void {
    const st = this.paintState;
    if (!st) return;
    const t = this.t();
    const v = this.selectedVehicle;
    const list = PINTURAS[v];
    if (this.paintsFor !== v || this.paintsEl.children.length !== list.length) {
      this.paintsFor = v;
      this.paintsEl.innerHTML = list
        .map((_, i) => `<button class="paint" type="button" data-i="${i}"><i class="paint-chip"><span class="paint-badge"></span></i><span class="paint-price"></span></button>`)
        .join('');
    }
    list.forEach((p, i) => {
      const b = this.paintsEl.children[i] as HTMLElement;
      const owned = st.owned.has(i);
      const chip = b.querySelector<HTMLElement>('.paint-chip')!;
      chip.style.background = hexCss(p.hex);
      b.querySelector<HTMLElement>('.paint-badge')!.innerHTML = !owned ? LOCK_SVG : i === st.equipped ? CHECK_SVG : '';
      b.classList.toggle('locked', !owned);
      b.classList.toggle('afford', !owned && st.bank >= p.price);
      b.classList.toggle('equipped', i === st.equipped);
      b.classList.toggle('preview', i === st.preview);
      b.setAttribute('aria-pressed', String(i === st.preview));
      b.setAttribute('aria-label', owned ? t.paintOwned(p.name) : t.paintLocked(p.name, p.price));
      b.querySelector<HTMLElement>('.paint-price')!.innerHTML = owned ? '' : `${fmtN(p.price)}${BANANA_SVG}`;
    });
    const p = list[st.preview];
    const owned = st.owned.has(st.preview);
    let text: string;
    let cls = '';
    // Wearing the equipped paint while the wallet already covers another:
    // say so, since that is the reason to look at the row at all.
    const afford = list.some((q, i) => !st.owned.has(i) && st.bank >= q.price);
    if (st.preview === st.equipped && afford) {
      text = t.paintAfford;
      cls = 'act';
    } else if (st.preview === st.equipped) {
      text = t.paintWearing(p.name);
    } else if (owned) {
      text = t.paintUse(p.name);
      cls = 'act';
    } else if (st.bank >= p.price) {
      text = t.paintBuy(p.name);
      cls = 'act';
    } else {
      text = `${p.name} · ${t.paintNeed(p.price - st.bank)}`;
      cls = 'poor';
    }
    this.paintStateEl.textContent = text;
    this.paintStateEl.className = `paint-state ${cls}`;
    this.setBank(st.bank);
  }

  setBank(n: number): void {
    const el = document.getElementById('bank-n');
    if (el) el.textContent = fmtN(n);
  }

  // A buy the bank cannot cover: the reason is already on the line under the
  // swatches, so that line and the wallet shake together.
  flashBank(): void {
    for (const el of [document.getElementById('title-bank'), this.paintStateEl]) {
      if (!el) continue;
      el.classList.remove('deny');
      void el.offsetWidth; // restart the animation
      el.classList.add('deny');
    }
  }

  popupPintura(): void {
    this.popup(this.t().pinturaNew, 50, 40, 'pop-lg pop-gold');
  }

  updateVehicles(selected: VehicleId, records: Record<VehicleId, number>): void {
    this.selectedVehicle = selected;
    this.lastRecords = records;
    const t = this.t();
    this.cabEl.textContent = selected === 'civic' ? t.trickPillCar : t.trickPillBike;
    this.renderRide();
  }

  // The selected ride: its tab filled, its stats, tagline, own récord, and
  // the hint line (caballito or derrape).
  private renderRide(): void {
    const t = this.t();
    const id = this.selectedVehicle;
    const v = VEHICLES[id];
    for (const tab of this.title.querySelectorAll<HTMLElement>('.vtab')) {
      const on = tab.dataset.v === id;
      tab.classList.toggle('sel', on);
      tab.setAttribute('aria-selected', String(on));
    }
    for (const pips of this.title.querySelectorAll<HTMLElement>('.vd-pips')) {
      const k = pips.dataset.pips as keyof typeof v.stats;
      const n = v.stats[k];
      pips.querySelectorAll('i').forEach((el, i) => el.classList.toggle('on', i < n));
      pips.setAttribute('role', 'img');
      pips.setAttribute('aria-label', `${n} / 5`);
    }
    this.title.querySelector('#vd-tag')!.textContent = v.tagline;
    const rec = this.lastRecords?.[id] ?? 0;
    this.title.querySelector('#vd-rec')!.textContent = rec > 0 ? t.rideRecord(rec) : t.rideNoRecord;
    const trick = id === 'civic' ? t.trickCar : t.trickBike;
    this.hintEl.textContent = this.inputMode === 'touch' ? t.hintTouch(trick) : t.hintKey(trick);
  }

  showTitle(record: number): void {
    this.lastRecord = record;
    this.stopCountUp();
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
    this.stopCountUp();
    this.snapReady = false; // the share photo belongs to the run that just ended
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

  // The game-over card, top of the screen so the tumble below it stays in
  // view, with OTRA VEZ on its own in the thumb zone. Top to bottom: the
  // title, the points (counting up), the record stamp, the distance bar
  // toward La Cinta (or LA META), what paid, the mandaos (stamped when this
  // run finished them), and the plátanos toward the next pintura.
  showGameOver(r: RunResult, mandaos: MandaosView, pintura: PinturaGoal | null): void {
    const t = this.t();
    this.stopCountUp();
    this.lastResult = r;
    this.lastRecord = r.record;
    this.goTitleIdx = Math.floor(Math.random() * t.gameOverTitles.length);
    this.goTitleEl.textContent = t.gameOverTitles[this.goTitleIdx];

    // ¡NUEVO RÉCORD! is points; ¡MÁS LEJOS QUE NUNCA! is La Cinta alone.
    const far = r.isNewDistRecord && !r.isNewRecord;
    this.goStampEl.classList.toggle('hidden', !r.isNewRecord && !far);
    this.goStampEl.classList.toggle('far', far);
    this.goStampEl.textContent = r.isNewRecord ? t.newRecord : far ? t.farRecord : '';
    this.goBestEl.textContent =
      r.isNewRecord ? (r.prevRecord > 0 ? t.overBest(r.points - r.prevRecord) : '') : t.bestLine(r.record);
    this.countUp(r.points);
    const runLevel = mandaos.lastSet ? Math.max(0, mandaos.level - 1) : mandaos.level;
    this.shareLevel = { idx: Math.min(runLevel, t.levelNames.length - 1), mult: barrioMultFor(runLevel) };

    // The distance bar, in meters, toward the tape this run chased.
    const goalM = r.prevRecordDist > 0 ? r.prevRecordDist : CONFIG.goalTapeM;
    const reached = r.distanceM >= goalM;
    const short = goalM - r.distanceM;
    const close = !reached && short <= Math.max(CONFIG.soCloseMinM, goalM * CONFIG.soCloseShare);
    this.gdRunEl.textContent = `${fmtN(r.distanceM)} m`;
    this.gdGoalEl.textContent = t.distEnd(r.prevRecordDist > 0 ? t.tapeRecord : t.goalTape, goalM);
    this.gdCaptionEl.textContent = reached
      ? r.prevRecordDist > 0
        ? t.pastRecord(r.distanceM - goalM)
        : t.goalReached
      : close
        ? t.closeCall(short)
        : '';
    this.gdCaptionEl.className = `gd-caption${reached ? ' won' : close ? ' close' : ''}`;
    const dist = this.gdFillEl.parentElement!.parentElement!.parentElement!;
    dist.classList.toggle('reached', reached);
    dist.classList.toggle('near', !reached && r.distanceM >= goalM * 0.95);
    this.animateBar(this.gdFillEl, 0, Math.min(1, r.distanceM / goalM));

    // What paid: the brave play, in one row.
    this.goBreakEl.innerHTML =
      `<span><b>×${fmtN(r.bestCombo)}</b> ${t.bdCombo}</span>` +
      `<span><b>${fmtN(r.nearMisses)}</b> ${t.bdNear(r.nearMisses)}</span>` +
      `<span><b>${fmtN(r.cvMeters)} m</b> ${t.bdCv}</span>`;

    // Los Mandaos: bars fill from where the run found them; the ones this
    // run finished get the stamp.
    this.goMandaosEl.innerHTML = this.mandaoRowsHtml(mandaos, 'card');
    this.goMandaosEl.classList.toggle('leveled', mandaos.lastSet !== null);
    this.goBreakEl.classList.toggle('hidden', mandaos.lastSet !== null); // the level-up line takes its row
    this.kickBars(this.goMandaosEl);

    // Plátanos: what this run put in the bank, and how far that is toward
    // the next pintura for this ride.
    this.gpEarnedEl.textContent = t.earned(r.platanosEarned);
    this.gpSwatchEl.parentElement!.classList.toggle('all', !pintura);
    this.gpSwatchEl.classList.toggle('hidden', !pintura);
    if (pintura) {
      // need is what the bank still lacks, so the bank is price - need
      // (or the full price and more once it is 0: the bar is full then).
      const bank = pintura.price - pintura.need;
      this.gpSwatchEl.style.background = hexCss(PINTURAS[this.selectedVehicle][pintura.index].hex);
      this.gpTextEl.textContent = pintura.need > 0 ? t.pinturaNeed(pintura.need, pintura.name) : t.pinturaReady(pintura.name);
      this.animateBar(this.gpFillEl, (bank - r.platanosEarned) / pintura.price, bank / pintura.price);
    } else {
      this.gpTextEl.textContent = t.pinturaAll;
      this.animateBar(this.gpFillEl, 1, 1);
    }
    // A paint is waiting on the title: MENÚ glows.
    this.btnMenu.classList.toggle('glow', pintura !== null && pintura.need === 0);

    this.gameover.classList.remove('hidden');
    this.hud.classList.add('hidden');
    this.setContraVia(false);
    this.setCaballito(false);
    this.setGas(false);
    this.setBrake(false);
    this.setPedalLive(false);
  }

  // 0 to the run's points over countUpMs, eased out. A timer rather than
  // requestAnimationFrame: it must land even where frames are held (a
  // backgrounded tab, the screenshot rig). Reduced motion shows the total.
  private countTimer = 0;

  private countUp(to: number): void {
    const el = this.goPoints;
    if (reducedMotion() || to <= 0) {
      el.textContent = fmtN(to);
      return;
    }
    const t0 = performance.now();
    const step = (): void => {
      const k = Math.min(1, (performance.now() - t0) / CONFIG.countUpMs);
      el.textContent = fmtN(Math.round(to * easeOutCubic(k)));
      this.countTimer = k < 1 ? window.setTimeout(step, 16) : 0;
    };
    step();
  }

  private stopCountUp(): void {
    if (this.countTimer) window.clearTimeout(this.countTimer);
    this.countTimer = 0;
  }

  // A fill bar from one fraction to another; the CSS transition eases it.
  private animateBar(el: HTMLElement, from: number, to: number): void {
    const f = Math.max(0, Math.min(1, from));
    el.style.transition = 'none';
    el.style.transform = `scaleX(${f})`;
    void el.offsetWidth;
    el.style.transition = '';
    el.style.transform = `scaleX(${Math.max(0, Math.min(1, to))})`;
  }

  // Every bar in a freshly written list, from its data-from to its data-to.
  private kickBars(list: HTMLElement): void {
    for (const b of list.querySelectorAll<HTMLElement>('.md-bar b')) {
      this.animateBar(b, Number(b.dataset.from), Number(b.dataset.to));
    }
  }

  showPause(mandaos: MandaosView): void {
    const t = this.t();
    this.pauseLevelEl.textContent = `${t.levelHead(mandaos.level, t.levelNames[mandaos.levelNameIdx])} · ${fmtBarrio(mandaos.mult)}`;
    this.pauseMandaosEl.innerHTML = this.mandaoRowsHtml(mandaos, 'pause');
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

  // "7/10" while open. Meters and seconds count down to whole units; a done
  // row shows a drawn check instead (the font has no check glyph).
  private mandaoProgressHtml(m: Mandao): string {
    return m.done ? CHECK_SVG : `${fmtN(m.progress)}/${fmtN(m.target)}`;
  }

  // One row: the goal, its count and a bar. Where the bar starts depends on
  // the screen: the card fills it from where this run found it (0 for a
  // per-run goal, the banked base for a lifetime one) and stamps a row this
  // run finished; the sheet adds the reward.
  private mandaoRowHtml(m: Mandao, tag: string, mode: 'card' | 'pause' | 'sheet', stampIdx: number): string {
    const t = this.t();
    const to = m.done ? 1 : Math.min(1, m.progress / Math.max(1, m.target));
    const settled = mode !== 'card' || (m.done && !m.justDone);
    const from = settled ? to : mandaoPerRun(m.kind) ? 0 : Math.min(1, m.base / Math.max(1, m.target));
    const just = mode === 'card' && m.justDone;
    const cls = `md-row${m.done ? ' done' : ''}${just ? ' just' : ''}${tag ? ' md-daily' : ''}`;
    const tagHtml = tag ? `<span class="md-tag">${tag}</span>` : '';
    const reward = mode === 'sheet' ? `<span class="md-reward">+${fmtN(m.reward)}${BANANA_SVG}</span>` : '';
    const stamp = just ? `<span class="md-stamp" style="--i:${stampIdx}">${t.stamp}</span>` : '';
    return (
      `<li class="${cls}">${tagHtml}<span class="md-text">${this.mandaoText(m)}</span>` +
      `<b class="md-prog">${this.mandaoProgressHtml(m)}</b>` +
      `<span class="md-track"><span class="md-bar"><b data-from="${from}" data-to="${to}" style="transform:scaleX(${to})"></b></span>${reward}</span>` +
      `${stamp}</li>`
    );
  }

  // The three mandaos (the finished set, if this run leveled up) plus the
  // daily, as list items. The card adds the level-up line.
  private mandaoRowsHtml(v: MandaosView, mode: 'card' | 'pause'): string {
    const t = this.t();
    const rows = v.lastSet ?? v.set;
    let html = '';
    let stampIdx = 0;
    for (const m of rows) html += this.mandaoRowHtml(m, '', mode, m.justDone ? stampIdx++ : 0);
    html += this.mandaoRowHtml(v.daily, t.dailyTag, mode, stampIdx);
    if (mode === 'card' && v.lastSet) {
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

  // The sheet: the level and its multiplier up top, the three mandaos with
  // bars and rewards, then the daily with its streak.
  private openMandaos(): void {
    const v = this.mandaoView;
    if (!v) return;
    const t = this.t();
    const q = (sel: string): HTMLElement => this.mandaoSheetEl.querySelector(sel)!;
    q('#md-title').textContent = t.mandaos;
    q('#md-level').textContent = t.levelHead(v.level, t.levelNames[v.levelNameIdx]);
    q('#md-mult').textContent = t.multPill(fmtBarrio(v.mult));
    let html = '';
    for (const m of v.set) html += this.mandaoRowHtml(m, '', 'sheet', 0);
    const streak = v.streak > 0 ? `<span class="md-streak">${t.streak(v.streak)}</span>` : '';
    html += `<li class="md-head"><span>${t.dailyTitle}</span>${streak}</li>`;
    html += this.mandaoRowHtml(v.daily, t.dailyTag, 'sheet', 0);
    q('#md-list').innerHTML = html;
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

  // The share card's photo: the game frame, cropped to the band around the
  // rider. main calls this right after a render, in the same task, while the
  // WebGL drawing buffer is still intact (no preserveDrawingBuffer needed).
  captureScene(src: HTMLCanvasElement): void {
    const W = src.width;
    const H = src.height;
    if (!W || !H) return;
    const c = this.snap ?? document.createElement('canvas');
    this.snap = c;
    c.width = SNAP_W;
    c.height = SNAP_H;
    const g = c.getContext('2d');
    if (!g) return;
    const aspect = SNAP_W / SNAP_H;
    const ch = Math.min(H * 0.62, W / aspect);
    const cw = ch * aspect;
    // The rider sits a little below the middle in every framing.
    const cy = Math.min(H - ch / 2, Math.max(ch / 2, H * 0.64));
    g.drawImage(src, (W - cw) / 2, cy - ch / 2, cw, ch, 0, 0, SNAP_W, SNAP_H);
    this.snapReady = true;
  }

  // The card itself, 1080 x 1350 (4:5, what a chat thumbnail shows whole):
  // the logo and the flag, the crash in a framed photo, the points over its
  // lower edge, then the run, the ride and its barrio level, and the ask.
  private drawShareCard(r: RunResult): HTMLCanvasElement {
    const t = this.t();
    const veh = VEHICLES[this.selectedVehicle];
    const c = document.createElement('canvas');
    c.width = 1080;
    c.height = 1350;
    const g = c.getContext('2d')!;
    const FONT = '"Lilita One", sans-serif';

    const bg = g.createLinearGradient(0, 0, 0, 1350);
    bg.addColorStop(0, '#6ec6e6');
    bg.addColorStop(0.42, '#ffd9a0');
    bg.addColorStop(1, '#fff3c4');
    g.fillStyle = bg;
    g.fillRect(0, 0, 1080, 1350);
    // a low sun behind the logo, like the title screen at golden hour
    g.fillStyle = 'rgba(255,243,196,0.45)';
    g.beginPath();
    g.arc(880, 236, 150, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#fff3c4';
    g.beginPath();
    g.arc(880, 236, 96, 0, Math.PI * 2);
    g.fill();

    const stroked = (text: string, x: number, y: number, size: number, fill: string, stroke: string, strokeW: number, maxW = 1000): void => {
      g.font = `${size}px ${FONT}`;
      let s = size;
      while (g.measureText(text).width > maxW && s > 20) {
        s -= 2;
        g.font = `${s}px ${FONT}`;
      }
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.lineJoin = 'round';
      if (strokeW > 0) {
        g.lineWidth = strokeW;
        g.strokeStyle = stroke;
        g.strokeText(text, x, y);
      }
      g.fillStyle = fill;
      g.fillText(text, x, y);
    };
    const plate = (text: string, cx: number, cy: number, size: number, fill: string, ink: string, rot: number): void => {
      g.save();
      g.translate(cx, cy);
      g.rotate(rot);
      g.font = `${size}px ${FONT}`;
      const w = g.measureText(text).width + size * 1.1;
      const h = size * 1.55;
      g.fillStyle = 'rgba(0,45,98,0.35)';
      g.beginPath();
      g.roundRect(-w / 2, -h / 2 + 8, w, h, h * 0.3);
      g.fill();
      g.fillStyle = fill;
      g.beginPath();
      g.roundRect(-w / 2, -h / 2, w, h, h * 0.3);
      g.fill();
      stroked(text, 0, 2, size, ink, ink, 0);
      g.restore();
    };

    // The logo, stacked and leaning like the title's, and la bandera.
    g.save();
    g.translate(540, 0);
    g.rotate(-0.03);
    g.fillStyle = '#002d62';
    g.beginPath();
    g.roundRect(-64, 44, 128, 58, 14);
    g.fill();
    stroked('EL', 0, 75, 42, '#ffffff', '#002d62', 0);
    stroked('CORRE', 0, 168, 116, '#ffffff', '#002d62', 16);
    stroked('CORRE', 0, 274, 116, '#ffffff', '#002d62', 16);
    g.restore();
    const flagW = 104;
    g.save();
    g.shadowColor = 'rgba(0,45,98,0.35)';
    g.shadowOffsetY = 4;
    drawDominicanFlag(g, 540 - flagW / 2, 334, flagW);
    g.restore();

    // The photo: the crash itself, or the golden-hour Malecón when no frame
    // was caught. Framed like the in-game cards: blue border, hard shadow.
    const fx = 80;
    const fy = 428;
    const fw = 920;
    const fh = 560;
    g.fillStyle = 'rgba(0,45,98,0.35)';
    g.beginPath();
    g.roundRect(fx - 10, fy - 10 + 14, fw + 20, fh + 20, 42);
    g.fill();
    g.fillStyle = '#002d62';
    g.beginPath();
    g.roundRect(fx - 10, fy - 10, fw + 20, fh + 20, 42);
    g.fill();
    g.save();
    g.beginPath();
    g.roundRect(fx, fy, fw, fh, 32);
    g.clip();
    if (this.snap && this.snapReady) g.drawImage(this.snap, fx, fy, fw, fh);
    else this.drawMalecon(g, fx, fy, fw, fh);
    // a soft shade at the bottom, so the points read over any frame
    const shade = g.createLinearGradient(0, fy + fh * 0.6, 0, fy + fh);
    shade.addColorStop(0, 'rgba(0,45,98,0)');
    shade.addColorStop(1, 'rgba(0,45,98,0.45)');
    g.fillStyle = shade;
    g.fillRect(fx, fy + fh * 0.6, fw, fh * 0.4);
    g.restore();

    // ¡NUEVO RÉCORD! is the points record; La Cinta alone earns the blue
    // ¡MÁS LEJOS QUE NUNCA!. Stuck on the photo's corner like a sticker.
    if (r.isNewRecord) plate(t.newRecord, 770, fy + 8, 46, '#ce1126', '#ffffff', -0.07);
    else if (r.isNewDistRecord) plate(t.farRecord, 700, fy + 8, 42, '#002d62', '#ffffff', -0.07);

    // The points, big, over the photo's lower edge. Its baseline sits high
    // enough that a comma's tail clears the PUNTOS label.
    const pts = fmtN(r.points);
    let size = 196;
    g.font = `${size}px ${FONT}`;
    while (g.measureText(pts).width > 900 && size > 90) {
      size -= 10;
      g.font = `${size}px ${FONT}`;
    }
    const py = fy + fh - 12;
    g.save();
    g.translate(0, 10);
    stroked(pts, 540, py, size, 'rgba(0,45,98,0.35)', 'rgba(0,45,98,0.35)', 26);
    g.restore();
    stroked(pts, 540, py, size, '#ffffff', '#002d62', 26);
    stroked(t.points.toUpperCase(), 540, 1106, 32, '#002d62', '#002d62', 0);

    // The ride and where it got, the run, and the barrio level that
    // multiplied it: honest numbers for the group chat.
    const where = r.tramo !== 'malecon' ? t.inVehicleReached(veh.name, t.tramoNames[r.tramo]) : t.inVehicle(veh.name);
    stroked(where, 540, 1160, 46, '#002d62', '#002d62', 0, 980);
    stroked(t.shareStats(r.distanceM, r.platanos), 540, 1212, 38, '#0e7490', '#0e7490', 0);
    const lv = this.shareLevel;
    plate(t.shareLevel(t.levelNames[lv.idx], fmtBarrio(lv.mult)), 540, 1264, 28, '#f4c430', '#002d62', 0);
    // The ask stays small: the score does the talking.
    const askY = SHARE_URL ? 1306 : 1314;
    stroked(t.shareAsk, 540, askY, 30, '#0e7490', '#0e7490', 0);
    if (SHARE_URL) stroked(SHARE_URL, 540, 1338, 22, '#002d62', '#002d62', 0);
    return c;
  }

  // The fallback photo: the Malecón at golden hour from behind the rider.
  // Sea on the left behind its seawall, the road down the middle, the
  // sidewalk and pastel fronts on the right. The road never meets the sea.
  private drawMalecon(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
    const hy = y + h * 0.44; // horizon
    const vx = x + w * 0.5; // vanishing point
    const sky = g.createLinearGradient(0, y, 0, hy);
    sky.addColorStop(0, '#6ec6e6');
    sky.addColorStop(1, '#ffd9a0');
    g.fillStyle = sky;
    g.fillRect(x, y, w, hy - y);
    g.fillStyle = '#fff3c4';
    g.beginPath();
    g.arc(x + w * 0.24, hy - h * 0.08, h * 0.1, 0, Math.PI * 2);
    g.fill();
    const tri = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number, dx: number, dy: number, fill: string): void => {
      g.fillStyle = fill;
      g.beginPath();
      g.moveTo(ax, ay);
      g.lineTo(bx, by);
      g.lineTo(cx, cy);
      g.lineTo(dx, dy);
      g.closePath();
      g.fill();
    };
    const by = y + h; // bottom
    // sea, then the seawall walk, then the road, then the far sidewalk
    tri(x, hy, vx - 6, hy, x - w * 0.9, by, x, by, '#17a2b8');
    tri(vx - 6, hy, vx - 3, hy, x + w * 0.02, by, x - w * 0.9, by, '#d9c7a7');
    tri(vx - 3, hy, vx + 3, hy, x + w * 0.98, by, x + w * 0.02, by, '#3e3a38');
    tri(vx + 3, hy, x + w, hy, x + w, by, x + w * 0.98, by, '#d9c7a7');
    // pastel fronts on the right, shrinking toward the horizon
    const pastels = ['#ffd3b6', '#a8e6cf', '#ff8b94', '#ffeaa7', '#b3d9ff', '#cdb4db'];
    for (let i = 0; i < 6; i++) {
      const k = 1 - i / 6.5;
      const bx0 = vx + 8 + (w * 0.5 - 8) * k;
      const bw = w * 0.1 * k;
      const bh = h * 0.3 * k;
      g.fillStyle = pastels[i];
      g.fillRect(bx0 - bw, hy - bh, bw, bh + h * 0.02);
    }
    // the double yellow line and the white dashes
    g.strokeStyle = '#f4c430';
    g.lineWidth = 6;
    for (const dx of [-7, 7]) {
      g.beginPath();
      g.moveTo(vx, hy);
      g.lineTo(x + w * 0.5 + dx, by);
      g.stroke();
    }
    g.strokeStyle = '#f2e9dc';
    g.lineWidth = 5;
    g.setLineDash([26, 30]);
    for (const k of [0.25, 0.75]) {
      g.beginPath();
      g.moveTo(vx, hy);
      g.lineTo(x + w * 0.02 + w * 0.96 * k, by);
      g.stroke();
    }
    g.setLineDash([]);
  }

  // Draws the card and hands it to share.ts (the native sheet in the app,
  // Web Share or a download on the web).
  async shareCard(r: RunResult): Promise<ShareResult> {
    const t = this.t();
    // Awaited, not requested, here: the font was warmed at boot so this
    // resolves immediately and iOS still sees navigator.share as a prompt
    // response rather than a late async call.
    try {
      await this.fontsReady;
    } catch {
      // draw with whatever we have
    }
    const c = this.drawShareCard(r);

    const blob = await new Promise<Blob | null>((res) => c.toBlob(res, 'image/png'));
    if (!blob) return 'failed';
    return shareImage(blob, shareFileName(r), `${t.shareText(r.points)} ${t.shareAsk}`);
  }
}
