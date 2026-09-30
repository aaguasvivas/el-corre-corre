// main.ts: bootstrap, render loop, resize, and the game state machine.
// Fixed-timestep simulation (feel is framerate independent); the crash
// slow-mo simply scales how fast real time feeds the accumulator.

import './style.css';
import '@fontsource/lilita-one';
import * as THREE from 'three';
import { CONFIG, PINTURAS, ROAD, VEHICLES, type VehicleId } from './config';
import { World } from './world';
import { Player } from './player';
import { Traffic, type ObstacleKind, type PickupKind, type SetPieceKind, type StepCtx, type VehicleType } from './traffic';
import { Score, type RunResult } from './score';
import { tramoFor } from './tour';
import { UI } from './ui';
import { AudioEngine, type AudioUpdateCtx } from './audio';
import { haptics } from './haptics';
import { submitScore } from './leaderboard';

type GameState = 'title' | 'playing' | 'paused' | 'crashing' | 'gameover';

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
let shakeT = 0;
let shakeAmp = 0;
let baseFov: number = CONFIG.fovDesktop;
let lastRun: RunResult | null = null;
let shownMult = 1;
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

function addShake(amp: number): void {
  shakeAmp = Math.max(shakeAmp, amp);
  shakeT = 0.3;
}

const world = new World(scene, renderer);
const score = new Score();
score.setVehicle(selectedVehicle);
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
  ui.showTitle(score.record);
  audio.click();
}

// The cycler previews paints live on the bike; equipping or buying is the
// tap on the chip. previewIdx is transient: leaving the title or starting a
// run snaps the bike back to what is actually equipped.
let previewIdx = 0;

function refreshPinturaUI(): void {
  const v = selectedVehicle;
  const p = PINTURAS[v][previewIdx];
  ui.updatePinturaCycle({
    hex: p.hex,
    owned: ownedPinturas(v).has(previewIdx),
    equipped: previewIdx === equippedPintura(v),
    price: p.price,
    bank: score.bank,
  });
}

function onPinturaCycle(dir: 1 | -1): void {
  if (state !== 'title') return;
  const v = selectedVehicle;
  const n = PINTURAS[v].length;
  previewIdx = (previewIdx + dir + n) % n;
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
  score.persist();
  state = 'title';
  resetRunState();
  ui.showTitle(score.record);
  ui.updateVehicles(selectedVehicle, vehicleRecords());
  previewIdx = equippedPintura(selectedVehicle);
  player.setVehicle(selectedVehicle, equippedHex(selectedVehicle));
  refreshPinturaUI();
  audio.click();
}

function doShare(): void {
  audio.click();
  if (lastRun) void ui.shareCard(lastRun);
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
  onPinturaCycle,
  onPinturaTap,
});
ui.setMuted(audio.muted);

const traffic = new Traffic(scene, {
  onNearMiss: (x, z) => {
    const r = score.nearMiss();
    const s = w2s(x, 1.3, Math.max(z, 1.5));
    ui.popup(`${ui.nextNearMissText()} +${r.pts}`, s.x, s.y, r.combo >= 5 ? 'pop-md' : 'pop-sm');
    const hit = ui.ladderHitText(r.combo);
    if (hit) ui.popup(hit, 50, 34, r.combo >= 7 ? 'pop-xl' : 'pop-lg');
    ui.setCombo(r.combo, ui.ladderTierText(r.combo));
    audio.nearMiss(panOf(x));
    if (Math.random() < 0.25) audio.horn(panOf(x), 0.95 + Math.random() * 0.12);
    haptics.light();
  },
  onPlatano: (x, y, z) => {
    const pts = score.collectPlatano();
    ui.setPlatanos(score.platanos);
    player.setRackCount(score.platanos);
    const s = w2s(x, y + 0.5, Math.max(z, 1));
    ui.popup(`+${pts}`, s.x, s.y, 'pop-sm pop-gold');
    audio.platano();
    haptics.medium();
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
    score.resetCombo();
    ui.setCombo(0, null);
    addShake(CONFIG.shakeHoyo);
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
  isSteeringActive: () => state === 'playing',
  isReservedPointer: (id) => ui.isPedalPointer(id),
  onScrape: () => {
    scrapeTimer = CONFIG.scrapeSlowSec;
    score.resetCombo();
    ui.setCombo(0, null);
    audio.scrape();
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
  },
});
player.setVehicle(selectedVehicle, equippedHex(selectedVehicle));

world.onObeliscoPass = () => {
  if (state !== 'playing') return;
  ui.popupObelisco();
  audio.bell();
};

// Los Tramos: the world announces border crossings; traffic changes its mix,
// the player gets the place name. The world keeps touring on the title screen
// too, so traffic always follows, but the popup is for live runs only.
world.onTramoChange = (t) => {
  traffic.setTramo(t);
  if (state === 'playing') {
    ui.popupTramo(t);
    audio.bell();
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
  shakeT = 0;
  shakeAmp = 0;
  shownMult = 1;
  throttleMult = 1;
  gasK = 0;
  brakeK = 0;
  gasOn = false;
  brakeOn = false;
  gasInPrev = false;
  brakeInPrev = false;
  acc = 0;
}

function startRun(): void {
  if (state !== 'title' && state !== 'gameover') return;
  // Drop any unpurchased pintura preview: you ride what you own.
  previewIdx = equippedPintura(selectedVehicle);
  player.setVehicle(selectedVehicle, equippedHex(selectedVehicle));
  score.reset();
  resetRunState();
  // The tour restarts from the Malecon; traffic's mix follows it explicitly
  // because the world does not announce the start line.
  world.startRun(score.recordDist, ui.tapeLabel(score.recordDist));
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

function resume(): void {
  if (state !== 'paused') return;
  state = 'playing';
  ui.hidePause();
  audio.startRun();
  audio.click();
}

function pauseGame(): void {
  if (state !== 'playing') return;
  state = 'paused';
  score.persist();
  ui.showPause();
  audio.stopRun(false);
  audio.click();
}

function doCrash(): void {
  state = 'crashing';
  crashRealT = 0;
  ui.setPedalLive(false);
  player.crash();
  score.setContraVia(false);
  ui.setContraVia(false);
  ui.setCaballito(false);
  addShake(CONFIG.shakeCrash);
  audio.stopRun(true);
  haptics.heavy();
}

window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyM') {
    toggleMute();
    return;
  }
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
  if (document.hidden && state === 'playing') pauseGame();
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
  // faster than the gas rises. The cafecito overrides the pedal (they never
  // stack) and obeys the same ceiling: while it burns the pedal reads as
  // released, so throttleMult settles at 1 and the boost hands back to the
  // pedal without a jump when it ends.
  const th = state === 'playing' && cafecitoT <= 0 ? player.throttle : 0;
  const ceiling = Math.max(speed, CONFIG.gasMaxMps) / speed;
  const gasRatio = Math.min(CONFIG.gasSpeedMult, ceiling);
  const thTarget = th >= 0 ? 1 + th * (gasRatio - 1) : 1 - -th * (1 - CONFIG.brakeSpeedMult);
  const rate = thTarget < throttleMult ? CONFIG.brakeResponse : CONFIG.gasResponse;
  throttleMult += (thTarget - throttleMult) * Math.min(1, rate * h);
  if (scrapeTimer > 0) scrapeTimer = Math.max(0, scrapeTimer - h);
  if (hoyoTimer > 0) hoyoTimer = Math.max(0, hoyoTimer - h);
  if (invincibleT > 0) invincibleT = Math.max(0, invincibleT - h);
  if (cafecitoT > 0) {
    cafecitoT = Math.max(0, cafecitoT - h);
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
  if (imanT > 0) imanT = Math.max(0, imanT - h);

  const slow = Math.max(
    scrapeTimer > 0 ? CONFIG.scrapeSpeedLoss * (scrapeTimer / CONFIG.scrapeSlowSec) : 0,
    hoyoTimer > 0 ? CONFIG.potholeSpeedLoss * (hoyoTimer / CONFIG.hoyoRecoverSec) : 0,
  );
  // The pedal sets the speed factor; the cafecito's eased boost (cafMult,
  // capped by the same sacred ceiling) only adds what sits above it. So gas
  // and the cafecito never stack, and the brake still bites whenever no
  // cafecito boost is left (a plain max() with cafMult = 1 would swallow it).
  const cafCap = Math.min(cafMult, ceiling);
  const effSpeed = speed * (1 - slow) * (throttleMult + Math.max(0, cafCap - Math.max(throttleMult, 1)));
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
  brakeOn = brakeIn && !cafe && throttleMult < 1;
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
  if (brakeIn && !brakeInPrev) {
    audio.brake();
    haptics.tick();
  }
  gasInPrev = gasIn;
  brakeInPrev = brakeIn;

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
      ui.setDistMult(shownMult);
      if (shownMult > 1) {
        ui.popupMultUp(shownMult);
        audio.powerup('cafecito');
        haptics.medium();
      }
    }

    if (!testGod && traffic.checkCollision(player.x, 0, player.radius)) {
      if (cafecitoT > 0 || cafGraceT > 0 || invincibleT > 0) {
        // el cafecito: plow right through
      } else if (player.hasShield) {
        player.useShield();
        invincibleT = CONFIG.shieldGraceSec;
        addShake(CONFIG.shakeShield);
        audio.bell();
        haptics.medium();
      } else {
        doCrash();
      }
    }

    // La Cinta del Récord (the world places it; this is the burst)
    if (!tapeBurst && score.recordDist > 0 && score.distance >= score.recordDist) {
      tapeBurst = true;
      world.burstTape();
      ui.bannerNewRecord();
      audio.recordBreak();
      haptics.heavy();
    }
  } else {
    player.updateTumble(h);
  }
}

// Camera chase state; vectors reused every frame, no per-frame allocations.
let camX = 0;
let camRoll = 0;
let camGas = 0; // gasK, smoothed: the cafecito zeroes gasK in one step
const lookTarget = new THREE.Vector3();

function updateCamera(dt: number): void {
  const k = 1 - Math.exp(-CONFIG.camDamping * dt);
  camX += (player.x * camFollow - camX) * k;
  camRoll += (-player.velXNorm * CONFIG.cameraRollMaxDeg * DEG - camRoll) * k;
  camera.up.set(Math.sin(camRoll), Math.cos(camRoll), 0);
  // A fondo the bike surges away from the lens.
  camGas += (gasK - camGas) * Math.min(1, 6 * dt);
  camera.position.set(camX, camUp, -(CONFIG.camBack + CONFIG.camGasPullBack * camGas));
  if (shakeT > 0) {
    shakeT -= dt;
    const kk = shakeAmp * Math.max(0, shakeT / 0.3);
    camera.position.x += (Math.random() - 0.5) * 2 * kk;
    camera.position.y += (Math.random() - 0.5) * 1.2 * kk;
    if (shakeT <= 0) shakeAmp = 0;
  }
  // FOV speed kick: velocity you can feel in your stomach. The pedal adds
  // its own kick (or a small dip on the brake) on top, at any speed.
  const kickNorm = state === 'playing' || state === 'crashing' ? currentNorm : 0;
  const targetFov =
    baseFov +
    CONFIG.fovSpeedKick * kickNorm +
    CONFIG.fovGasKick * camGas -
    CONFIG.fovBrakeDip * brakeK +
    (cafecitoT > 0 ? CONFIG.fovCafecito : 0);
  camera.fov += (targetFov - camera.fov) * Math.min(1, 4 * dt);
  camera.updateProjectionMatrix();
  lookTarget.set((camX + player.x) / 2, camLookY, CONFIG.camLookAhead);
  camera.lookAt(lookTarget);
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
}

let last = performance.now();
let acc = 0;
let fpsAvg = 60;

function advance(dt: number, now: number): void {
  if (state === 'crashing') {
    acc += dt * CONFIG.crashTimeScale;
    crashRealT += dt;
    if (crashRealT >= CONFIG.crashSlowmoSec) {
      state = 'gameover';
      gameOverAt = now;
      lastRun = score.finishRun(tramoFor(score.distance));
      submitScore(lastRun.points, selectedVehicle);
      ui.showGameOver(lastRun);
    }
  } else if (state !== 'paused' && state !== 'gameover') {
    acc += dt;
  }
  while (acc >= CONFIG.fixedDt) {
    stepSim(CONFIG.fixedDt);
    acc -= CONFIG.fixedDt;
  }
  if (state === 'gameover') player.updateTumble(dt); // finish the flop in real time
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
  renderer.render(scene, camera);
}

ui.showTitle(score.record);
ui.updateVehicles(selectedVehicle, vehicleRecords());
previewIdx = equippedPintura(selectedVehicle);
refreshPinturaUI();
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
  confetti: () => world.confettiState,
  burstTape: () => world.burstTape(),
  audio: () => ({
    unlocked: audio.unlocked,
    muted: audio.muted,
    ctx: audio.ctxState,
    layers: audio.layerGains,
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
    if (state === 'playing') doCrash();
  },
  god: (on: boolean) => {
    testGod = on;
  },
  // Is any vehicle's hitbox within `margin` m of the rider's circle? Lets a
  // god-mode screenshot wait out a car it is currently riding through.
  touching: (margin: number) => traffic.checkCollision(player.x, 0, player.radius + margin),
  wheelieNow: () => {
    // hold-based now; tests should dispatch keydown Space instead
  },
  setRecordDist: (m: number) => {
    score.recordDist = m;
    world.setTape(m, ui.tapeLabel(m));
  },
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
  // way a real run would instead of leaving the chase camera behind.
  tick: (sec: number) => {
    let remaining = sec;
    while (remaining > 0) {
      const step = Math.min(1 / 60, remaining);
      remaining -= step;
      advance(step, performance.now());
      updateCamera(step);
    }
    audio.update(1 / 60, audioCtxNow());
    if (state === 'playing' || state === 'crashing') syncHud();
    renderer.render(scene, camera);
  },
};
