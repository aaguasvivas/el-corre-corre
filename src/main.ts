// main.ts: bootstrap, render loop, resize, and the game state machine.
// Every rendered frame advances the sim by exactly its real dt, split into
// equal substeps of at most CONFIG.fixedDt (framerate independent, no fixed
// accumulator judder). The crash slow-mo, the impact frame and the micro
// time-dips only scale how much sim time a frame feeds in.

import './style.css';
import './hud.css';
import '@fontsource/lilita-one';
import * as THREE from 'three';
import { CONFIG, PINTURAS, ROAD, VEHICLES, type VehicleId } from './config';
import { World } from './world';
import { Player } from './player';
import {
  Traffic,
  type ObstacleKind,
  type PickupKind,
  type SetPieceKind,
  type StepCtx,
  type VehicleHit,
  type VehicleType,
} from './traffic';
import { Score, nextPintura, type RunResult } from './score';
import { Missions, type Completion } from './missions';
import { tramoFor } from './tour';
import { UI } from './ui';
import { AudioEngine, type AudioUpdateCtx } from './audio';
import { haptics } from './haptics';
import { BrakeHeat } from './brakeHeat';
import { submitScore } from './leaderboard';
import { backupSaves, restoreSaves } from './storage';

// A save the OS wiped from the web view comes back from the native mirror
// before anything below reads localStorage. The web has no mirror and does
// not wait.
const restoring = restoreSaves();
if (restoring) await restoring;

// countdown: the 3, 2, 1 after SEGUIR, world frozen (resumeCountdownSec).
type GameState = 'title' | 'playing' | 'paused' | 'countdown' | 'crashing' | 'gameover';

const DEG = Math.PI / 180;
const VEH_KEY = 'ecc.v1.vehicle';
const VEHICLE_ORDER: VehicleId[] = ['pasola', 'motor', 'civic'];

function readVehicle(): VehicleId {
  try {
    const v = localStorage.getItem(VEH_KEY);
    return v === 'pasola' || v === 'civic' ? v : 'motor';
  } catch {
    return 'motor';
  }
}

// Las Pinturas: ownership and the equipped paint per vehicle. Index 0 (the
// factory paint) is always owned.
const pintOwnedKey = (v: VehicleId): string => `ecc.v1.pinturas.${v}`;
const pintEquipKey = (v: VehicleId): string => `ecc.v1.pintura.${v}`;

function ownedPinturas(v: VehicleId): Set<number> {
  const owned = new Set<number>([0]);
  try {
    for (const part of (localStorage.getItem(pintOwnedKey(v)) ?? '').split(',')) {
      const i = Number(part);
      if (Number.isInteger(i) && i > 0 && i < PINTURAS[v].length) owned.add(i);
    }
  } catch {
    // fine
  }
  return owned;
}

function equippedPintura(v: VehicleId): number {
  try {
    const i = Number(localStorage.getItem(pintEquipKey(v)) ?? 0);
    if (Number.isInteger(i) && i >= 0 && i < PINTURAS[v].length && ownedPinturas(v).has(i)) return i;
  } catch {
    // fine
  }
  return 0;
}

function equippedHex(v: VehicleId): number {
  return PINTURAS[v][equippedPintura(v)].hex;
}

const canvas = document.getElementById('game') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: 'high-performance',
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(CONFIG.fovDesktop, 1, 0.3, 400);

let state: GameState = 'title';
let selectedVehicle: VehicleId = readVehicle();
let speed: number = CONFIG.baseSpeed;
let currentEff: number = CONFIG.baseSpeed;
let currentNorm = 0;
let elapsed = 0;

// Reused every fixed step so the 120 Hz loop allocates nothing.
const stepCtx: StepCtx = {
  ds: 0, dt: 0, elapsed: 0, speed: 0, playerX: 0, playerY: 0, playerR: 0,
  playerCv: false, live: false, airborne: false, wheelie: false, magnet: false,
  runDist: 0, shielded: false, cafecito: false,
};
const scoreOpts = { airborne: false, wheelie: false };
let scrapeTimer = 0;
let hoyoTimer = 0;
let crashRealT = 0;
let gameOverAt = 0;
let cafecitoT = 0;
let cafGraceT = 0; // ghosted, blinking second after the cafecito ends
let cafMult = 1; // eased cafecito speed factor: entry and exit glide instead of snapping
let imanT = 0;
let invincibleT = 0;
let tapeBurst = false;
let baseFov: number = CONFIG.fovDesktop;
let lastRun: RunResult | null = null;
let shownMult = 1;
// Records and mandaos, per run (see runMoments). The tape stands at the
// distance record the run started with, or at LA META on a ride's first runs.
let tapeAt = 0;
let tapeGoal = false;
let recordFired = false; // ¡NUEVO RÉCORD! fires once per run
let recordNudged = false; // ¡Ya casi el récord! fires once per run
let momentT = 0; // sim seconds since the last 4 Hz record/mandao read
let throttleMult = 1; // eased speed factor from the pedal, brakeSpeedMult .. gas ratio
// El pedal's feel channels, 0..1: how far into the gas or the brake the FELT
// speed is (not the raw press). FOV, camera, speed lines and engine read
// these, so they work the same at the speed cap as at the start.
let gasK = 0;
let brakeK = 0;
let gasOn = false; // a fondo and paying (felt speed gate)
let brakeOn = false; // braking and paying less
let gasInPrev = false; // raw press edges, for the instant cues
let brakeInPrev = false;
// El freno caliente: the pads' heat, shared with the traffic lab's bots.
const brakeHeat = new BrakeHeat();
let brakeHotPrev = false;

// Real seconds since boot, advanced by every frame (and by __ecc.tick), so
// the juice timers below run on the same clock in the game and in tests.
let realClock = 0;

// Trauma camera shake (0..1). Events add trauma, it decays linearly on real
// time, and the shake is trauma squared: see updateCamera.
let trauma = 0;
function addTrauma(amount: number): void {
  trauma = Math.min(1, trauma + amount);
}

// Reduced motion: shake, FOV kicks and the steering roll shrink to
// CONFIG.reducedMotionScale. Followed live if the setting changes.
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
let motionScale: number = reducedMotion.matches ? CONFIG.reducedMotionScale : 1;
reducedMotion.addEventListener('change', (e) => {
  motionScale = e.matches ? CONFIG.reducedMotionScale : 1;
});

// Micro time-dip: a soft hit-stop on skill peaks. dipT counts real seconds
// into the current dip (<0 = none); dipScaleNow() eases the sim rate.
let dipT = -1;
let dipHold = 0;
let lastDipAt = -Infinity;

// Exposed for WP-D's razor pass too. Never in the first dipMinRunSec of a
// run, never closer than dipMinGapMs to the last one, only while playing.
function triggerDip(holdMs: number = CONFIG.dipHoldMs): void {
  if (state !== 'playing' || elapsed < CONFIG.dipMinRunSec) return;
  if (realClock - lastDipAt < CONFIG.dipMinGapMs / 1000) return;
  lastDipAt = realClock;
  dipT = 0;
  dipHold = holdMs / 1000;
}

function dipScaleNow(dt: number): number {
  if (dipT < 0) return 1;
  const t = dipT;
  dipT += dt;
  if (t < dipHold) return CONFIG.dipScale;
  const u = (t - dipHold) / (CONFIG.dipReturnMs / 1000);
  if (u >= 1) {
    dipT = -1;
    return 1;
  }
  const ease = 1 - (1 - u) * (1 - u); // easeOutQuad
  return CONFIG.dipScale + (1 - CONFIG.dipScale) * ease;
}

// The resume countdown, in real seconds left, and the beat on screen.
let countdownT = 0;
let countdownBeat = 0;

// The crash: what hit you (the camera looks toward it), and how far into
// that look the camera is.
let killer: VehicleHit | null = null;
let killerLook = 0;

const world = new World(scene, renderer);
const score = new Score();
score.setVehicle(selectedVehicle);
const missions = new Missions();
missions.onComplete = onMandaoDone;
const audio = new AudioEngine();

// World-to-screen projection for popup placement (percent coordinates).
const projV = new THREE.Vector3();
function w2s(x: number, y: number, z: number): { x: number; y: number } {
  projV.set(x, y, z).project(camera);
  return { x: (projV.x * 0.5 + 0.5) * 100, y: (-projV.y * 0.5 + 0.5) * 100 };
}

// Pan by where it happened: world +x renders on screen LEFT, so it flips.
function panOf(x: number): number {
  return Math.max(-1, Math.min(1, -(x - player.x) / 8));
}

function toggleMute(): void {
  audio.setMuted(!audio.muted);
  ui.setMuted(audio.muted);
  audio.click();
}

function vehicleRecords(): Record<VehicleId, number> {
  return {
    pasola: score.recordFor('pasola'),
    motor: score.recordFor('motor'),
    civic: score.recordFor('civic'),
  };
}

function selectVehicle(id: VehicleId): void {
  if (state !== 'title') return;
  selectedVehicle = id;
  try {
    localStorage.setItem(VEH_KEY, id);
  } catch {
    // fine
  }
  score.setVehicle(id);
  player.setVehicle(id, equippedHex(id));
  player.reset();
  ui.updateVehicles(id, vehicleRecords());
  previewIdx = equippedPintura(id);
  refreshPinturaUI();
  refreshTitleMeta(); // caballito or derrape in the copy
  ui.showTitle(score.record);
  audio.click();
}

// A tapped swatch previews live on the bike; tapping the previewed swatch
// again equips or buys it. previewIdx is transient: leaving the title or
// starting a run snaps the bike back to what is actually equipped.
let previewIdx = 0;

function refreshPinturaUI(): void {
  const v = selectedVehicle;
  ui.updatePinturas({
    preview: previewIdx,
    equipped: equippedPintura(v),
    owned: ownedPinturas(v),
    bank: score.bank,
  });
}

// The title's mandao chip and list, after anything that can change them.
function refreshTitleMeta(): void {
  ui.setMandaos(missions.view());
}

function onPinturaPick(i: number): void {
  if (state !== 'title') return;
  const v = selectedVehicle;
  if (!Number.isInteger(i) || i < 0 || i >= PINTURAS[v].length) return;
  if (i === previewIdx) {
    onPinturaTap();
    return;
  }
  previewIdx = i;
  player.setVehicle(v, PINTURAS[v][previewIdx].hex); // live preview on the bike
  refreshPinturaUI();
  audio.click();
}

function onPinturaTap(): void {
  if (state !== 'title') return;
  const v = selectedVehicle;
  const owned = ownedPinturas(v);
  if (!owned.has(previewIdx)) {
    if (!score.spend(PINTURAS[v][previewIdx].price)) {
      ui.flashBank();
      audio.click();
      return;
    }
    owned.add(previewIdx);
    try {
      localStorage.setItem(pintOwnedKey(v), [...owned].filter((i) => i > 0).join(','));
    } catch {
      // fine
    }
    ui.popupPintura();
    audio.platano();
    haptics.medium();
  } else if (previewIdx === equippedPintura(v)) {
    return; // already wearing it
  } else {
    audio.click();
  }
  try {
    localStorage.setItem(pintEquipKey(v), String(previewIdx));
  } catch {
    // fine
  }
  refreshPinturaUI();
}

function goToMenu(): void {
  if (state !== 'gameover' && state !== 'paused') return;
  // Quitting from PAUSE abandons a live run, so bank it before wiping it.
  if (state === 'paused') missions.finishRun(score);
  score.persist();
  backupSaves();
  state = 'title';
  resetRunState();
  ui.showTitle(score.record);
  ui.updateVehicles(selectedVehicle, vehicleRecords());
  previewIdx = equippedPintura(selectedVehicle);
  player.setVehicle(selectedVehicle, equippedHex(selectedVehicle));
  refreshPinturaUI();
  refreshTitleMeta();
  audio.click();
}

// One share at a time: a second tap while the native sheet is still up
// fails in the plugin, and that must not read as a failure to the player.
let sharing = false;

function doShare(): void {
  audio.click();
  if (!lastRun || sharing) return;
  sharing = true;
  // The card's photo: a fresh frame of the crash, read back in this task.
  renderer.render(scene, camera);
  ui.captureScene(canvas);
  ui.shareCard(lastRun)
    .then((r) => {
      if (r === 'failed') ui.shareFailed();
    })
    .catch(() => ui.shareFailed())
    .finally(() => {
      sharing = false;
    });
}

const ui = new UI(document.getElementById('ui')!, {
  onPedal: (v) => player.setPedal(v),
  onStart: startRun,
  onRestart: tryRestart,
  onResume: resume,
  onPause: pauseGame,
  onToggleMute: toggleMute,
  onSelectVehicle: selectVehicle,
  onMenu: goToMenu,
  onShare: doShare,
  onPinturaPick,
});
ui.setMuted(audio.muted);

const traffic = new Traffic(scene, {
  onNearMiss,
  onPlatano: (x, y, z) => {
    const pts = score.collectPlatano();
    ui.setPlatanos(score.platanos);
    player.setRackCount(score.platanos);
    const s = w2s(x, y + 0.5, Math.max(z, 1));
    ui.popupPlatano(pts, s.x, s.y); // a string reads as one growing "+N"
    audio.platano();
    haptics.platano(score.platanos);
    missions.sample(score);
  },
  onPowerup: (kind, x, z) => {
    const s = w2s(x, 1.4, Math.max(z, 1));
    if (kind === 'cafecito') {
      cafecitoT = CONFIG.cafecitoSec;
      player.setGlow(true);
      ui.popup('¡CAFECITO!', s.x, s.y, 'pop-lg pop-gold');
      audio.powerup('cafecito');
    } else if (kind === 'bendicion') {
      player.setShield(true);
      ui.popup('¡BENDICIÓN!', s.x, s.y, 'pop-lg pop-gold');
      audio.bell();
    } else {
      imanT = CONFIG.imanSec;
      ui.popup('¡IMÁN!', s.x, s.y, 'pop-lg pop-gold');
      audio.powerup('iman');
    }
    haptics.medium();
  },
  onHoyo: () => {
    hoyoTimer = CONFIG.hoyoRecoverSec;
    score.hitHoyo();
    ui.setCombo(0, null);
    addTrauma(CONFIG.traumaHoyo);
    audio.hoyo();
    haptics.medium();
  },
  onPolicia: () => {
    const vy = Math.max(3.2, currentEff * CONFIG.policiaLaunchVy);
    player.launch(vy);
    // the plátano arc follows the jump the rider is actually taking
    traffic.spawnJumpArc(player.x, currentEff, vy);
    audio.launch();
  },
  onCharco: () => {
    player.applyCharco();
    audio.splash();
  },
  // El rebase telegraphs itself: the driver leans on the horn as it swings out.
  onRebase: (x) => audio.horn(panOf(x), 1.0),
  // A car stuck behind a slower rider honks instead of rear-ending them.
  onHornBehind: (x) => audio.horn(panOf(x), 0.9),
  onSetPiece: (kind) => ui.popupSetPiece(kind),
  onEscalate: () => ui.popupEscalation(),
});

const player = new Player(scene, {
  // During the resume countdown the steering finger is adopted and may
  // pre-aim; the ride only moves once the world does.
  isSteeringActive: () => state === 'playing' || state === 'countdown',
  isReservedPointer: (id) => ui.isPedalPointer(id),
  onScrape: () => {
    scrapeTimer = CONFIG.scrapeSlowSec;
    score.resetCombo();
    ui.setCombo(0, null);
    audio.scrape();
    addTrauma(CONFIG.traumaScrape);
    // DECISION: medium. The scrape costs the combo and speed; a light tick
    // would read like a reward.
    haptics.medium();
  },
  onTrickReady: () => {
    if (state !== 'playing') return;
    player.readySpark();
    audio.click();
  },
  onWheelieEnd: () => {
    if (state !== 'playing') return;
    const pts = score.endWheelie();
    if (pts >= 2) {
      const s = w2s(player.x, 1.6, 2);
      ui.popupTrick(pts, s.x, s.y);
    }
  },
  onLand: () => {
    if (state !== 'playing') return;
    audio.land();
    const pts = score.endAir();
    if (pts >= 3) {
      const s = w2s(player.x, 1.4, 2);
      ui.popupAir(pts, s.x, s.y);
    }
    missions.sample(score);
  },
});
player.setVehicle(selectedVehicle, equippedHex(selectedVehicle));

world.onObeliscoPass = () => {
  if (state !== 'playing') return;
  ui.popupObelisco();
  audio.obelisco();
};

// Los Tramos: the world announces border crossings; traffic changes its mix,
// the player gets the place name. The world keeps touring on the title screen
// too, so traffic always follows, but the popup is for live runs only.
world.onTramoChange = (t) => {
  traffic.setTramo(t);
  audio.setTramo(t); // the band changes color at the next bar
  if (state === 'playing') {
    ui.popupTramo(t);
    audio.tramo();
  }
};

// Everything scoped to a single run. Both starting a run and abandoning one
// back to the title go through here, otherwise the dead run's cars, hoyos and
// plátanos sit frozen on the scrolling title screen.
function resetRunState(): void {
  traffic.reset();
  player.reset();
  speed = CONFIG.baseSpeed;
  currentEff = CONFIG.baseSpeed;
  currentNorm = 0;
  elapsed = 0;
  scrapeTimer = 0;
  hoyoTimer = 0;
  cafecitoT = 0;
  cafGraceT = 0;
  cafMult = 1;
  imanT = 0;
  invincibleT = 0;
  tapeBurst = false;
  recordFired = false;
  recordNudged = false;
  momentT = 0;
  trauma = 0;
  dipT = -1;
  killer = null;
  killerLook = 0;
  brakeHeat.reset();
  brakeHotPrev = false;
  ui.setBrakeHeat(0, false);
  shownMult = 1;
  throttleMult = 1;
  gasK = 0;
  brakeK = 0;
  gasOn = false;
  brakeOn = false;
  gasInPrev = false;
  brakeInPrev = false;
}

function startRun(): void {
  if (state !== 'title' && state !== 'gameover') return;
  // Drop any unpurchased pintura preview: you ride what you own.
  previewIdx = equippedPintura(selectedVehicle);
  player.setVehicle(selectedVehicle, equippedHex(selectedVehicle));
  score.setBarrioMult(missions.barrioMult);
  score.reset(); // freezes the records this run chases
  resetRunState();
  missions.startRun(selectedVehicle);
  // La Cinta: the distance record the run started with, or LA META.
  tapeGoal = score.prevRecordDist <= 0;
  tapeAt = tapeGoal ? CONFIG.goalTapeM : score.prevRecordDist;
  // The tour restarts from the Malecon; traffic's mix follows it explicitly
  // because the world does not announce the start line.
  world.startRun(tapeAt, tapeGoal ? ui.goalTapeLabel() : ui.tapeLabel(tapeAt));
  traffic.setTramo('malecon');
  traffic.startRun(); // the opening: slow cars to pass and a plátano weave
  state = 'playing';
  ui.showPlaying(score.record);
  audio.startRun();
  audio.click();
}

function tryRestart(): void {
  if (state !== 'gameover') return;
  if (performance.now() - gameOverAt < CONFIG.restartDebounceSec * 1000) return;
  startRun();
}

// SEGUIR (or the key) never drops you straight into live traffic: the world
// stays frozen through a 3, 2, 1 first. The pedals stay hidden until GO,
// and a finger still resting on one needs a fresh press (ui.releasePedal).
function resume(): void {
  if (state !== 'paused') return;
  state = 'countdown';
  countdownT = CONFIG.resumeCountdownSec;
  countdownBeat = 0;
  ui.hidePause();
  audio.click();
  stepCountdown(0);
}

function stepCountdown(dt: number): void {
  countdownT -= dt;
  if (countdownT <= 0) {
    state = 'playing';
    ui.countdownGo();
    ui.setPedalLive(true); // the pedals come back only at GO
    audio.resumeRun(); // same run, same tramo: the groove keeps its place
    audio.click();
    haptics.light();
    return;
  }
  const beat = Math.ceil(countdownT / (CONFIG.resumeCountdownSec / 3));
  if (beat !== countdownBeat) {
    countdownBeat = beat;
    ui.showCountdown(beat);
    if (dt > 0) audio.click();
    haptics.tick();
  }
}

function pauseGame(): void {
  if (state !== 'playing' && state !== 'countdown') return;
  const wasRunning = state === 'playing';
  state = 'paused';
  score.persist();
  missions.persist(score); // a pause may be the last thing a killed app does
  backupSaves();
  ui.showPause(missions.view());
  if (wasRunning) audio.stopRun(false);
  audio.click();
}

// hit: the vehicle that did it (null for a test crash).
function doCrash(hit: VehicleHit | null): void {
  state = 'crashing';
  crashRealT = 0;
  killer = hit;
  killerLook = 0;
  ui.setPedalLive(false);
  ui.setBrakeHeat(0, false);
  player.setBrakeHot(false);
  // The harder the hit, the harder the shake: closing speed maps onto
  // traumaCrashMin..Max.
  const closing = hit ? Math.abs(currentEff - hit.dir * hit.speed) : currentEff;
  const [lo, hi] = CONFIG.traumaCrashSpeed;
  const k = Math.max(0, Math.min(1, (closing - lo) / (hi - lo)));
  addTrauma(CONFIG.traumaCrashMin + (CONFIG.traumaCrashMax - CONFIG.traumaCrashMin) * k);
  if (hit) traffic.stopVehicle(hit);
  const side = hit ? (player.x >= hit.x ? 1 : -1) : Math.random() < 0.5 ? 1 : -1;
  player.crash(side, hit ? hit.group : null);
  score.setContraVia(false);
  ui.setContraVia(false);
  ui.setCaballito(false);
  ui.flash('#ffffff', CONFIG.crashFlashAlpha, CONFIG.crashFlashMs);
  audio.stopRun(true);
  haptics.heavy();
}

window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyM') {
    if (!e.repeat) toggleMute();
    return;
  }
  // Escape and P pause and resume, for a desktop player without a mouse.
  if (e.code === 'Escape' || e.code === 'KeyP') {
    if (e.repeat) return;
    if (state === 'playing' || state === 'countdown') pauseGame();
    else if (state === 'paused') resume();
    return;
  }
  // Every key below acts on a fresh press only: a Space held through a
  // crash must not auto-repeat through the card into the next run, and a
  // held arrow must not spin through the rides.
  if (e.repeat) return;
  if (state === 'title' && (e.code === 'ArrowLeft' || e.code === 'ArrowRight')) {
    const dir = e.code === 'ArrowRight' ? 1 : -1;
    const idx = VEHICLE_ORDER.indexOf(selectedVehicle);
    selectVehicle(VEHICLE_ORDER[(idx + dir + VEHICLE_ORDER.length) % VEHICLE_ORDER.length]);
    return;
  }
  if (e.code !== 'Space' && e.code !== 'Enter') return;
  if (state === 'title') startRun();
  else if (state === 'gameover') tryRestart();
  else if (state === 'paused') resume();
});

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) return;
  if (state === 'playing' || state === 'countdown') pauseGame(); // it backs up the saves
  else backupSaves(); // a pintura bought or a language switched on a menu
});

// Portrait framing: a tall frame gets a higher, steeper camera and follows
// the rider further toward the kerbs.
let camFollow: number = CONFIG.camXFollow;
let camUp: number = CONFIG.camUp;
let camLookY: number = CONFIG.camLookY;

function resize(): void {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  const portrait = h > w;
  baseFov = portrait ? CONFIG.fovMobile : CONFIG.fovDesktop;
  camFollow = portrait ? CONFIG.camXFollowPortrait : CONFIG.camXFollow;
  camUp = portrait ? CONFIG.camUpPortrait : CONFIG.camUp;
  camLookY = portrait ? CONFIG.camLookYPortrait : CONFIG.camLookY;
  camera.fov = baseFov;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', resize);
resize();

function stepSim(h: number): void {
  if (state === 'title') {
    world.step(CONFIG.baseSpeed * 0.45 * h, h, true); // attract mode: scenery moves, the tour holds still
    return;
  }
  if (state !== 'playing' && state !== 'crashing') return;

  const veh = VEHICLES[selectedVehicle];
  elapsed += h;
  const raw = CONFIG.baseSpeed + CONFIG.speedRampPerSec * elapsed;
  speed = Math.min(veh.speedCap, raw) * veh.speedMult;
  const topSpeed = veh.speedCap * veh.speedMult;

  // El pedal: speed chases the throttle. Gas is a target SPEED under the
  // sacred ceiling (gasMaxMps, or the ride's own cruise if that is higher),
  // so the telegraph rule holds a fondo at the speed cap. The brake bites
  // faster than the gas rises. The cafecito overrides the brake and never
  // stacks with the gas (see effSpeed below), and obeys the same ceiling.
  // While it burns the brake reads as released but a held gas stays primed,
  // so the speed hands back to the pedal without a dip when it ends.
  const th = state === 'playing' ? (cafecitoT > 0 ? Math.max(0, player.throttle) : player.throttle) : 0;
  // El freno caliente: the brake bites only as much as the pads allow.
  const brakeAuth = brakeHeat.step(h, th < 0 ? -th : 0);
  const ceiling = Math.max(speed, CONFIG.gasMaxMps) / speed;
  const gasRatio = Math.min(CONFIG.gasSpeedMult, ceiling);
  const thTarget = th >= 0 ? 1 + th * (gasRatio - 1) : 1 - -th * brakeAuth * (1 - CONFIG.brakeSpeedMult);
  const rate = thTarget < throttleMult ? CONFIG.brakeResponse : CONFIG.gasResponse;
  throttleMult += (thTarget - throttleMult) * Math.min(1, rate * h);
  if (scrapeTimer > 0) scrapeTimer = Math.max(0, scrapeTimer - h);
  if (hoyoTimer > 0) hoyoTimer = Math.max(0, hoyoTimer - h);
  if (invincibleT > 0) invincibleT = Math.max(0, invincibleT - h);
  if (cafecitoT > 0) {
    const cafBefore = cafecitoT;
    cafecitoT = Math.max(0, cafecitoT - h);
    // The last second ticks cafecitoTicks times, so the end never surprises.
    const n = CONFIG.cafecitoTicks;
    const tickLeft = Math.ceil(cafecitoT * n);
    if (state === 'playing' && tickLeft >= 1 && tickLeft <= n && tickLeft !== Math.ceil(cafBefore * n)) {
      audio.cafecitoTick(tickLeft);
    }
    if (cafecitoT === 0) {
      // The cafecito ends ghosted: a blinking grace second to get out of
      // whatever you were plowing through, never a death on the last tick.
      player.setGlow(false);
      cafGraceT = CONFIG.cafecitoGraceSec;
      player.setGraceBlink(true);
    }
  }
  if (cafGraceT > 0) {
    cafGraceT = Math.max(0, cafGraceT - h);
    if (cafGraceT === 0) player.setGraceBlink(false);
  }
  cafMult += ((cafecitoT > 0 ? CONFIG.cafecitoBoost : 1) - cafMult) * Math.min(1, (3 / CONFIG.cafecitoEaseSec) * h);
  if (imanT > 0) {
    imanT = Math.max(0, imanT - h);
    if (imanT === 0 && state === 'playing') audio.imanEnd();
  }

  const slow = Math.max(
    scrapeTimer > 0 ? CONFIG.scrapeSpeedLoss * (scrapeTimer / CONFIG.scrapeSlowSec) : 0,
    hoyoTimer > 0 ? CONFIG.potholeSpeedLoss * (hoyoTimer / CONFIG.hoyoRecoverSec) : 0,
  );
  // The pedal sets the speed factor; the cafecito's eased boost (cafMult,
  // capped by the same sacred ceiling) only adds what sits above it. So gas
  // and the cafecito never stack, and the brake still bites whenever no
  // cafecito boost is left (a plain max() with cafMult = 1 would swallow it).
  const cafCap = Math.min(cafMult, ceiling);
  // Down is down: once you crash the road scroll stops fast (real time), so
  // the car that hit you stays in frame instead of rolling over the tumble.
  const crashScroll = state === 'crashing' ? Math.exp(-crashRealT / CONFIG.crashScrollTau) : 1;
  const effSpeed =
    speed * (1 - slow) * (throttleMult + Math.max(0, cafCap - Math.max(throttleMult, 1))) * crashScroll;
  currentEff = effSpeed;
  // Felt speed drives the FOV kick and the engine: a fondo pushes past 1.
  currentNorm = Math.max(0, Math.min(1.25, (effSpeed - CONFIG.baseSpeed) / (topSpeed - CONFIG.baseSpeed)));
  const ds = effSpeed * h;

  world.step(ds, h);

  const live = state === 'playing';
  const cv = live && player.x > CONFIG.contraViaMinX && player.x < ROAD.halfRoad;
  score.setContraVia(cv);
  ui.setContraVia(cv);
  score.setWheelie(live && player.isWheelie);
  ui.setCaballito(live && player.isWheelie);
  // The pedal's feel channels follow the eased speed, not the press.
  const cafe = cafecitoT > 0;
  gasK = cafe ? 0 : Math.max(0, Math.min(1, (throttleMult - 1) / Math.max(gasRatio - 1, 1e-3)));
  brakeK = cafe ? 0 : Math.max(0, Math.min(1, (1 - throttleMult) / (1 - CONFIG.brakeSpeedMult)));
  // The rewards follow the speed you actually feel: ×1.5 only once the
  // surge is at least halfway in (a tap cannot farm it), ×0.5 while the
  // brake holds you under cruise. The cafecito pays neither.
  const gasIn = live && th >= CONFIG.gasEngageAt;
  const brakeIn = live && th <= -CONFIG.gasEngageAt;
  gasOn = gasIn && !cafe && throttleMult >= 1 + 0.5 * (gasRatio - 1) - 1e-4;
  // DECISION: the x0.5 needs a brake you can feel (1% under cruise). Once
  // cooked pads let the ride run back up to cruise, FRENO says ¡CALIENTE!
  // and stops charging, instead of lighting x0.5 on a pedal that does nothing.
  brakeOn = brakeIn && !cafe && throttleMult < 0.99;
  score.setGas(gasOn);
  score.setBrake(brakeOn);
  ui.setGas(gasOn);
  ui.setBrake(brakeOn);
  // The press itself answers at once, ahead of the eased speed.
  if (gasIn && !gasInPrev) {
    audio.turbo();
    haptics.tick();
    player.gasPuff();
  }
  if (brakeIn && !brakeInPrev && !brakeHeat.hot) {
    audio.brake();
    haptics.tick();
  }
  gasInPrev = gasIn;
  brakeInPrev = brakeIn;
  // First-time hints: each shows until its move has been done once, ever.
  if (live) ui.coachStep(elapsed, player.x, cv, player.isWheelie, gasIn);
  // The pads cook: ¡CALIENTE! on FRENO, smoke off the rear wheel, a sizzle.
  if (brakeHeat.hot !== brakeHotPrev) {
    brakeHotPrev = brakeHeat.hot;
    player.setBrakeHot(brakeHeat.hot);
    if (brakeHeat.hot) {
      // DECISION: the splash's hiss stands in for a sizzle until audio.ts
      // (WP-F) has a dedicated one.
      audio.splash();
      haptics.medium();
    }
  }
  if (live) ui.setBrakeHeat(brakeHeat.heat, brakeHeat.hot);

  // Mutated in place: this runs at 120 Hz, and the brief's rule is zero
  // allocations in hot loops.
  stepCtx.ds = ds;
  stepCtx.dt = h;
  stepCtx.elapsed = elapsed;
  stepCtx.speed = effSpeed;
  stepCtx.playerX = player.x;
  stepCtx.playerY = player.y;
  stepCtx.playerR = player.radius;
  stepCtx.playerCv = cv;
  stepCtx.live = live;
  stepCtx.airborne = player.isAirborne;
  stepCtx.wheelie = player.clearsGroundHazards;
  stepCtx.magnet = imanT > 0;
  stepCtx.runDist = score.distance + ds; // this tick's distance, so escalation lands with the multiplier
  stepCtx.shielded = player.hasShield;
  stepCtx.cafecito = cafecitoT > 0;
  traffic.step(stepCtx);

  if (live) {
    player.step(h, effSpeed);
    scoreOpts.airborne = player.isAirborne;
    scoreOpts.wheelie = player.isWheelie;
    score.step(ds, h, scoreOpts);

    // Score momentum: the run pays more the deeper you get
    if (score.distMult !== shownMult) {
      shownMult = score.distMult;
      if (shownMult > 1) {
        ui.popupMultUp(shownMult);
        audio.multUp(shownMult);
        haptics.medium();
      }
    }

    const hit = testGod ? null : traffic.hitVehicle(player.x, 0, player.radius);
    if (hit) {
      if (cafecitoT > 0 || cafGraceT > 0 || invincibleT > 0) {
        // el cafecito: plow right through
      } else if (player.hasShield) {
        // La Bendición takes the hit, and like a hoverboard save it clears
        // the way: the car spins off your line with a bocinazo, and anything
        // else on your line just ahead slides aside, so the save never
        // turns into a second crash.
        player.useShield();
        invincibleT = CONFIG.shieldGraceSec;
        traffic.shove(hit, player.x, player.radius);
        addTrauma(CONFIG.traumaShield);
        ui.flash(GOLD_FLASH, CONFIG.crashFlashAlpha, 220);
        ui.popupShieldSaved();
        audio.shieldBreak();
        audio.horn(panOf(hit.x), 0.9);
        haptics.medium();
      } else {
        doCrash(hit);
        return;
      }
    }

    runMoments(h);
  }
}

const GOLD_FLASH = '#ffd54f';

// ---------------- records and mandaos ----------------

// The run's record and mandao moments, every live step. Records compare
// against the values the run started with (score.prevRecord and
// prevRecordDist), never the live ones a pause may have banked.
function runMoments(h: number): void {
  // La Cinta del Récord: the distance record, or LA META on a first run.
  // Its last meters get a snare roll.
  const toTape = tapeAt - score.distance;
  audio.tapeRiser(!tapeBurst && tapeAt > 0 && toTape > 0 && toTape <= CONFIG.tapeRiserM);
  ui.setTapeApproach(!tapeBurst && tapeAt > 0 ? toTape : -1);
  if (!tapeBurst && tapeAt > 0 && score.distance >= tapeAt) {
    tapeBurst = true;
    world.burstTape();
    if (tapeGoal) ui.bannerGoal();
    else ui.bannerFarthest();
    audio.farthest();
    haptics.success();
    triggerDip(CONFIG.dipRecordHoldMs);
  }
  // ¡NUEVO RÉCORD! always means points, once, the moment they pass.
  const rec = score.prevRecord;
  if (!recordFired && rec > 0 && score.points > rec) {
    recordFired = true;
    ui.bannerNewRecord();
    world.confettiBurst();
    audio.recordStinger();
    haptics.success();
    triggerDip(CONFIG.dipRecordHoldMs);
  }
  momentT += h;
  if (momentT < CONFIG.mandaoSampleSec) return;
  momentT -= CONFIG.mandaoSampleSec;
  missions.sample(score);
  if (!recordNudged && !recordFired && rec > 0 && score.points >= rec * CONFIG.recordNudgeAt) {
    recordNudged = true;
    ui.popupRecordNear();
  }
  ui.setRecordLabel(rec, score.points);
}

// A near-miss: clearance is the gap (m) between the rider's circle and the
// vehicle's hitbox at the pass; razorMissM or tighter is ¡Por un pelito!.
function onNearMiss(x: number, z: number, clearance: number): void {
  const r = score.nearMiss(clearance);
  const s = w2s(x, 1.3, Math.max(z, 1.5));
  ui.popupNearMiss(r.razor, r.pts, s.x, s.y, r.combo);
  const hit = ui.ladderHitText(r.combo);
  if (hit) audio.ladder(r.combo); // the HUD's combo slams the new tier in (setCombo)
  ui.setCombo(r.combo, ui.ladderTierText(r.combo));
  audio.nearMiss(panOf(x), r.combo, r.razor);
  if (Math.random() < 0.25) audio.horn(panOf(x), 0.95 + Math.random() * 0.12);
  if (hit) {
    haptics.ladder(r.combo);
    if (r.combo >= 5) triggerDip(); // the big tiers land with a blink of hit-stop
  }
  if (r.razor) razorPass();
  else if (!hit) haptics.light();
  missions.sample(score);
}

// A razor pass (¡Por un pelito!): a blink of hit-stop and a firmer tap.
function razorPass(): void {
  triggerDip();
  haptics.medium();
}

// A mandao got done. The reward lands in the wallet at once; mid-run it
// also toasts, sounds and buzzes (one found at the finish shows on the
// game-over card instead).
function onMandaoDone(c: Completion): void {
  score.addToBank(c.reward + c.setBonus);
  if (state !== 'playing') return;
  ui.toastMandao(c);
  // DECISION: the mandao that finishes a set plays only the level-up
  // fanfare (it opens with the same rising marimba), so two stingers never
  // pile up on one frame.
  if (c.levelUp) audio.levelUp();
  else audio.mandao();
  haptics.medium();
}

// The run is over: mandaos take their last read (and pay) first, so the
// card's earned plátanos include them; then the records are banked.
function finishRunRecords(): RunResult {
  missions.finishRun(score);
  return score.finishRun(tramoFor(score.distance));
}

// Camera chase state; vectors reused every frame, no per-frame allocations.
let camX = 0;
let camRoll = 0;
let camGas = 0; // gasK, smoothed: the cafecito zeroes gasK in one step
let shakeClock = 0; // real seconds; the shake noise is sampled on it
const lookTarget = new THREE.Vector3();

// Smooth noise in -1..1 for one shake axis: two sines at incommensurate
// frequencies, phased per axis. Smooth, never white, so it reads as a
// camera being knocked, and it keeps its rate through the slow-mo.
function shakeNoise(t: number, axis: number): number {
  return 0.6 * Math.sin(t * 17.3 + axis * 1.7) + 0.4 * Math.sin(t * 23.9 + axis * 4.1);
}

function updateCamera(dt: number): void {
  const k = 1 - Math.exp(-CONFIG.camDamping * dt);
  camX += (player.x * camFollow - camX) * k;
  camRoll += (-player.velXNorm * CONFIG.cameraRollMaxDeg * DEG * motionScale - camRoll) * k;
  camera.up.set(Math.sin(camRoll), Math.cos(camRoll), 0);
  // A fondo the bike surges away from the lens.
  camGas += (gasK - camGas) * Math.min(1, 6 * dt);
  camera.position.set(camX, camUp, -(CONFIG.camBack + CONFIG.camGasPullBack * camGas));
  // FOV speed kick: velocity you can feel in your stomach. The pedal adds
  // its own kick (or a small dip on the brake) on top, at any speed.
  const kickNorm = state === 'playing' || state === 'crashing' ? currentNorm : 0;
  const targetFov =
    baseFov +
    motionScale *
      (CONFIG.fovSpeedKick * kickNorm +
        CONFIG.fovGasKick * camGas -
        CONFIG.fovBrakeDip * brakeK +
        (cafecitoT > 0 ? CONFIG.fovCafecito : 0));
  camera.fov += (targetFov - camera.fov) * Math.min(1, 4 * dt);
  camera.updateProjectionMatrix();
  lookTarget.set((camX + player.x) / 2, camLookY, CONFIG.camLookAhead);
  // Show what hit you: the aim eases part of the way toward it.
  if (killer && (state === 'crashing' || state === 'gameover')) {
    killerLook = Math.min(1, killerLook + dt / CONFIG.crashCamEaseSec);
    const w = CONFIG.crashCamToKiller * (1 - (1 - killerLook) * (1 - killerLook));
    lookTarget.x += (killer.x - lookTarget.x) * w;
    lookTarget.y += (0.9 - lookTarget.y) * w;
    lookTarget.z += (killer.z - lookTarget.z) * w;
  }
  camera.lookAt(lookTarget);
  // Trauma shake, on top of the aim: rotation (reads well in 3D) plus a
  // hair of translation, scaled by trauma squared.
  shakeClock += dt;
  if (trauma > 0) {
    const sh = trauma * trauma * motionScale;
    camera.position.x += sh * CONFIG.shakeMoveM * shakeNoise(shakeClock, 3);
    camera.position.y += sh * CONFIG.shakeMoveM * shakeNoise(shakeClock, 4);
    camera.rotateY(sh * CONFIG.shakeYawDeg * DEG * shakeNoise(shakeClock, 0));
    camera.rotateX(sh * CONFIG.shakePitchDeg * DEG * shakeNoise(shakeClock, 1));
    camera.rotateZ(sh * CONFIG.shakeRollDeg * DEG * shakeNoise(shakeClock, 2));
    trauma = Math.max(0, trauma - CONFIG.traumaDecayPerSec * dt);
  }
}

// Everything the HUD derives from live state, once per rendered frame. The
// combo pill used to be pushed only on events, so a chain that simply timed
// out stayed on screen until the next near-miss; syncing from the score
// every frame (setCombo dedups on the count) makes the decay bar honest.
function syncHud(): void {
  ui.setScore(score.points);
  ui.setCombo(score.combo, ui.ladderTierText(score.combo));
  ui.setComboFraction(score.comboFraction);
  // Streaks from felt speed, or from the gas at any speed: floored is full.
  ui.setSpeedLines(state === 'playing' ? Math.max(currentNorm, 0.6 + 0.6 * gasK * CONFIG.gasSpeedLines) : 0);
  ui.showPedal(player.throttle > 0 ? 1 : player.throttle < 0 ? -1 : 0);
  ui.setSpeedKmh(Math.round(currentEff * 3.6));
  ui.setLiveMult(score.liveMult);
  ui.setCafecito(state === 'playing' ? cafecitoT / CONFIG.cafecitoSec : 0);
}

let last = performance.now();
let fpsAvg = 60;

// One rendered frame of real time dt. The sim gets simDt: all of it while
// playing (less inside a micro time-dip), none on the impact frame, a crawl
// in the crash slow-mo. It runs as equal substeps of at most fixedDt, so a
// frame always moves the world by exactly what its real time says: no
// fixed-step beat against the display, no judder.
function advance(dt: number, now: number): void {
  realClock += dt;
  let simDt = 0;
  if (state === 'playing') {
    simDt = dt * dipScaleNow(dt);
  } else if (state === 'title') {
    simDt = dt;
  } else if (state === 'countdown') {
    stepCountdown(dt);
  } else if (state === 'crashing') {
    crashRealT += dt;
    // the impact frame holds the world still, then the slow-mo crawls
    if (crashRealT > CONFIG.crashImpactSec) {
      simDt = dt * CONFIG.crashTimeScale;
      player.updateTumble(dt); // the tumble itself runs on real time
    }
  }
  if (simDt > 0) {
    const n = Math.max(1, Math.ceil(simDt / CONFIG.fixedDt - 1e-6));
    const h = simDt / n;
    const from = state;
    // a crash ends the frame's sim right there: the impact frame holds
    for (let i = 0; i < n && state === from; i++) stepSim(h);
  }
  if (state === 'crashing' && crashRealT >= CONFIG.crashSlowmoSec) {
    state = 'gameover';
    gameOverAt = now;
    lastRun = finishRunRecords();
    backupSaves();
    submitScore(lastRun.points, selectedVehicle);
    ui.showGameOver(lastRun, missions.view(), nextPintura(selectedVehicle, ownedPinturas(selectedVehicle), score.bank));
  } else if (state === 'gameover') {
    player.updateTumble(dt); // finish the flop in real time
  }
  player.updateFx(dt);
}

// Reused every frame: the audio update allocates nothing.
const audioCtx: AudioUpdateCtx = {
  running: false, speedNorm: 0, combo: 0, contraVia: false, wheelie: false, gas: 0, brake: 0,
};

function audioCtxNow(): AudioUpdateCtx {
  audioCtx.running = state === 'playing';
  audioCtx.speedNorm = Math.min(1, currentNorm);
  audioCtx.combo = score.combo;
  audioCtx.contraVia = score.isContraVia;
  audioCtx.wheelie = player.isWheelie;
  audioCtx.gas = gasK;
  audioCtx.brake = brakeK;
  return audioCtx;
}

function frame(now: number): void {
  requestAnimationFrame(frame);
  const raw = (now - last) / 1000;
  last = now;
  if (raw > 0) fpsAvg += (1 / Math.max(raw, 1e-4) - fpsAvg) * 0.05;
  const dt = Math.min(raw, CONFIG.maxFrameDt);

  advance(dt, now);
  updateCamera(dt);
  audio.update(dt, audioCtxNow());
  if (state === 'playing' || state === 'crashing') syncHud();
  hudUpdate(dt);
  renderer.render(scene, camera);
}

// The HUD's own clock (score roll, popups, the announcement lane), frozen
// with the world while paused or counting back in.
function hudUpdate(dt: number): void {
  ui.update(dt, state === 'playing' || state === 'crashing', state === 'paused' || state === 'countdown');
}

ui.showTitle(score.record);
ui.updateVehicles(selectedVehicle, vehicleRecords());
previewIdx = equippedPintura(selectedVehicle);
refreshPinturaUI();
refreshTitleMeta();
// Compile every shader while the title is up. renderer.compile walks the whole
// scene, not just the visible parts, so the pooled traffic, obstacles and the
// 46 confetti get their programs built here instead of hitching mid-run, worst
// of all at the ¡NUEVO RÉCORD! burst.
renderer.compile(scene, camera);
requestAnimationFrame(frame);

// Test rig only: lets a screenshot run ride for minutes (to reach La Zona and
// El Campo) straight through traffic. Only __ecc.god() sets it.
let testGod = false;

// Test hook for automated checks; the game itself never reads this.
(window as unknown as Record<string, unknown>).__ecc = {
  fps: () => Math.round(fpsAvg),
  state: () => state,
  score: () => score.points,
  record: () => score.record,
  x: () => player.x,
  y: () => player.y,
  speed: () => speed,
  effSpeed: () => +currentEff.toFixed(2),
  throttle: () => player.throttle,
  // El pedal: hold (-1 FRENO, 0 release, 1 ¡DALE!) without touch events,
  // and read back what the pedal is doing to speed, feel and score.
  pedal: (v: -1 | 0 | 1) => player.setPedal(v),
  gas: () => ({
    gasOn,
    brakeOn,
    gasK: +gasK.toFixed(3),
    brakeK: +brakeK.toFixed(3),
    throttleMult: +throttleMult.toFixed(3),
    kmh: Math.round(currentEff * 3.6),
  }),
  cars: () => traffic.activeCars,
  combo: () => score.combo,
  platanos: () => score.platanos,
  cv: () => score.isContraVia,
  wheelie: () => player.isWheelie,
  airborne: () => player.isAirborne,
  powerups: () => ({ cafecitoT, cafGraceT, imanT, shielded: player.hasShield, invincibleT }),
  worldDist: () => Math.round(world.distance),
  runDist: () => Math.round(world.runDistance),
  info: () => ({ calls: renderer.info.render.calls, tris: renderer.info.render.triangles }),
  dog: () => world.debugViralata(),
  overhead: (z: number, kind: 'pasacalle' | 'banderitas' | 'laundry') => world.debugOverhead(z, kind),
  confetti: () => world.confettiState,
  burstTape: () => world.burstTape(),
  audio: () => ({
    unlocked: audio.unlocked,
    muted: audio.muted,
    ctx: audio.ctxState,
    layers: audio.layerGains,
    music: audio.musicState,
  }),
  vehicle: () => selectedVehicle,
  selectVehicle: (id: VehicleId) => selectVehicle(id),
  share: () => doShare(),
  fov: () => Math.round(camera.fov * 10) / 10,
  radius: () => +player.radius.toFixed(3),
  distMult: () => score.distMult,
  tramo: () => world.tramo,
  obelisco: () => world.obeliscoState,
  belts: () => world.beltState,
  overlaps: () => traffic.overlapCount,
  bank: () => score.bank,
  start: () => {
    if (state === 'title' || state === 'gameover') startRun();
  },
  crash: () => {
    if (state === 'playing') doCrash(null);
  },
  // WP-G probes: el freno caliente, the time-dip, the shake, the crash.
  brakeHeat: () => ({ heat: +brakeHeat.heat.toFixed(3), hot: brakeHeat.hot, auth: +brakeHeat.auth.toFixed(3) }),
  dip: () => ({ active: dipT >= 0, t: dipT }),
  triggerDip: (holdMs?: number) => triggerDip(holdMs),
  trauma: () => +trauma.toFixed(3),
  countdown: () => (state === 'countdown' ? +countdownT.toFixed(3) : -1),
  crashT: () => +crashRealT.toFixed(3),
  // Sim seconds into the run (unrounded): a frame's share of it shows the
  // impact frame, the slow-mo, a dip, and that no frame judders.
  simT: () => elapsed,
  motion: () => motionScale,
  killer: () => (killer ? { x: +killer.x.toFixed(2), z: +killer.z.toFixed(2), speed: killer.speed } : null),
  // The resume path without tapping SEGUIR (P and Escape do the same).
  pause: () => pauseGame(),
  resume: () => resume(),
  god: (on: boolean) => {
    testGod = on;
  },
  // Is any vehicle's hitbox within `margin` m of the rider's circle? Lets a
  // god-mode screenshot wait out a car it is currently riding through.
  touching: (margin: number) => traffic.checkCollision(player.x, 0, player.radius + margin),
  wheelieNow: () => {
    // hold-based now; tests should dispatch keydown Space instead
  },
  // Moves this run's tape (a distance record of m) for scenes and probes.
  setRecordDist: (m: number) => {
    score.recordDist = m;
    tapeAt = m;
    tapeGoal = false;
    world.setTape(m, ui.tapeLabel(m));
  },
  // Records and mandaos, for probes.
  records: () => ({
    record: score.record,
    prevRecord: score.prevRecord,
    prevRecordDist: score.prevRecordDist,
    tapeAt,
    tapeGoal,
    recordFired,
    recordNudged,
  }),
  liveMult: () => +score.liveMult.toFixed(3),
  // A near-miss through the real handler, at a chosen clearance (m).
  nearMiss: (clearance: number) => {
    if (state === 'playing') onNearMiss(player.x + 1.8, 4, clearance);
  },
  runStats: () => ({
    nearMisses: score.nearMisses,
    razorMisses: score.razorMisses,
    bestCombo: score.bestCombo,
    cvMeters: Math.floor(score.cvMeters),
    airs: score.airs,
    points: score.points,
  }),
  lastRun: () => lastRun,
  mandaos: () => missions.view(),
  menu: () => goToMenu(),
  setDistance: (m: number) => {
    score.distance = m;
  },
  spawnPickup: (kind: PickupKind, x: number, z: number, y?: number) =>
    traffic.debugSpawnPickup(kind, x, z, y),
  spawnObstacle: (kind: ObstacleKind, x: number, z: number) =>
    traffic.debugSpawnObstacle(kind, x, z),
  spawnVehicle: (type: VehicleType, lane: number, z: number, dir: 1 | -1, exactX?: number, speed?: number) =>
    traffic.debugSpawnVehicle(type, lane, z, dir, exactX, speed),
  // Empty the road mid-run, so a scene can stage its own traffic.
  clearTraffic: () => traffic.reset(),
  // Run one set piece now (announced ones pop their name).
  setPiece: (kind: SetPieceKind) => traffic.debugRunSetPiece(kind),
  // The next vehicle the rider will meet: its x and seconds until it arrives.
  ahead: () => {
    let best: { x: number; t: number } | null = null;
    for (const v of traffic.vehicleViews) {
      if (!v.active || v.z <= 0) continue;
      const closing = currentEff - v.dir * v.speed;
      if (closing <= 0.5) continue;
      const t = v.z / closing;
      if (!best || t < best.t) best = { x: v.x, t };
    }
    return best;
  },
  // Advances the sim deterministically (used by automated checks when the
  // pane is hidden and requestAnimationFrame is frozen). The camera chases
  // every 1/60 s step like frame() does, so a long tick frames the rider the
  // way a real run would instead of leaving the chase camera behind. The HUD
  // runs every step too, so its clock (the score roll, the announcement
  // lane, the plátano "+N") follows the sim, not the wall clock.
  tick: (sec: number) => {
    let remaining = sec;
    while (remaining > 0) {
      const step = Math.min(1 / 60, remaining);
      remaining -= step;
      advance(step, performance.now());
      updateCamera(step);
      if (state === 'playing' || state === 'crashing') syncHud();
      hudUpdate(step);
    }
    audio.update(1 / 60, audioCtxNow());
    renderer.render(scene, camera);
  },
  // HUD probes: the announcement lane, the coach chip and what is learned;
  // and any announcement, to measure the lane with the longest copy.
  hud: () => ui.hudState(),
  announce: (kind: Parameters<UI['announce']>[0], text: string, kicker?: string) => ui.announce(kind, text, kicker),
};
