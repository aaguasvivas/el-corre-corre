// main.ts: bootstrap, render loop, resize, and the game state machine.
// Fixed-timestep simulation (feel is framerate independent); the crash
// slow-mo simply scales how fast real time feeds the accumulator.

import './style.css';
import '@fontsource/lilita-one';
import * as THREE from 'three';
import { CONFIG, ROAD, VEHICLES, type VehicleId } from './config';
import { World } from './world';
import { Player } from './player';
import { Traffic, type ObstacleKind, type PickupKind, type VehicleType } from './traffic';
import { Score, type RunResult } from './score';
import { UI } from './ui';
import { AudioEngine } from './audio';
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
let scrapeTimer = 0;
let hoyoTimer = 0;
let crashRealT = 0;
let gameOverAt = 0;
let cafecitoT = 0;
let imanT = 0;
let invincibleT = 0;
let tapeBurst = false;
let shakeT = 0;
let shakeAmp = 0;
let baseFov: number = CONFIG.fovDesktop;
let lastRun: RunResult | null = null;
let shownMult = 1;

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
  player.setVehicle(id);
  player.reset();
  ui.updateVehicles(id, vehicleRecords());
  ui.showTitle(score.record);
  audio.click();
}

function goToMenu(): void {
  if (state !== 'gameover' && state !== 'paused') return;
  // Quitting from PAUSE abandons a live run, so bank it before wiping it.
  score.persist();
  state = 'title';
  resetRunState();
  ui.showTitle(score.record);
  ui.updateVehicles(selectedVehicle, vehicleRecords());
  audio.click();
}

function doShare(): void {
  audio.click();
  if (lastRun) void ui.shareCard(lastRun);
}

const ui = new UI(document.getElementById('ui')!, {
  onStart: startRun,
  onRestart: tryRestart,
  onResume: resume,
  onPause: pauseGame,
  onToggleMute: toggleMute,
  onSelectVehicle: selectVehicle,
  onMenu: goToMenu,
  onShare: doShare,
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
    player.launch(Math.max(3.2, currentEff * CONFIG.policiaLaunchVy));
    audio.launch();
  },
  onCharco: () => {
    player.applyCharco();
    audio.splash();
  },
});

const player = new Player(scene, {
  isSteeringActive: () => state === 'playing',
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
player.setVehicle(selectedVehicle);

world.onObeliscoPass = () => {
  if (state !== 'playing') return;
  ui.popupObelisco();
  audio.bell();
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
  imanT = 0;
  invincibleT = 0;
  tapeBurst = false;
  shakeT = 0;
  shakeAmp = 0;
  shownMult = 1;
  acc = 0;
}

function startRun(): void {
  if (state !== 'title' && state !== 'gameover') return;
  score.reset();
  resetRunState();
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

function resize(): void {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  baseFov = h > w ? CONFIG.fovMobile : CONFIG.fovDesktop;
  camera.fov = baseFov;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', resize);
resize();

function stepSim(h: number): void {
  if (state === 'title') {
    world.step(CONFIG.baseSpeed * 0.45 * h, h); // attract mode: the Malecon keeps moving
    world.updateTape(null);
    return;
  }
  if (state !== 'playing' && state !== 'crashing') return;

  const veh = VEHICLES[selectedVehicle];
  elapsed += h;
  const raw = CONFIG.baseSpeed + CONFIG.speedRampPerSec * elapsed;
  speed = Math.min(veh.speedCap, raw) * veh.speedMult;
  const topSpeed = veh.speedCap * veh.speedMult;
  currentNorm = Math.max(0, Math.min(1, (speed - CONFIG.baseSpeed) / (topSpeed - CONFIG.baseSpeed)));
  if (scrapeTimer > 0) scrapeTimer = Math.max(0, scrapeTimer - h);
  if (hoyoTimer > 0) hoyoTimer = Math.max(0, hoyoTimer - h);
  if (invincibleT > 0) invincibleT = Math.max(0, invincibleT - h);
  if (cafecitoT > 0) {
    cafecitoT = Math.max(0, cafecitoT - h);
    if (cafecitoT === 0) player.setGlow(false);
  }
  if (imanT > 0) imanT = Math.max(0, imanT - h);

  const slow = Math.max(
    scrapeTimer > 0 ? CONFIG.scrapeSpeedLoss * (scrapeTimer / CONFIG.scrapeSlowSec) : 0,
    hoyoTimer > 0 ? CONFIG.potholeSpeedLoss * (hoyoTimer / CONFIG.hoyoRecoverSec) : 0,
  );
  const effSpeed = speed * (1 - slow) * (cafecitoT > 0 ? CONFIG.cafecitoBoost : 1);
  currentEff = effSpeed;
  const ds = effSpeed * h;

  world.step(ds, h);

  const live = state === 'playing';
  const cv = live && player.x > CONFIG.contraViaMinX && player.x < ROAD.halfRoad;
  score.setContraVia(cv);
  ui.setContraVia(cv);
  score.setWheelie(live && player.isWheelie);
  ui.setCaballito(live && player.isWheelie);

  traffic.step({
    ds,
    dt: h,
    elapsed,
    speed: effSpeed,
    playerX: player.x,
    playerY: player.y,
    playerR: player.radius,
    playerCv: cv,
    live,
    airborne: player.isAirborne,
    wheelie: player.clearsGroundHazards,
    magnet: imanT > 0,
  });

  if (live) {
    player.step(h, effSpeed);
    score.step(ds, h, { airborne: player.isAirborne, wheelie: player.isWheelie });

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

    if (traffic.checkCollision(player.x, 0, player.radius)) {
      if (cafecitoT > 0 || invincibleT > 0) {
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

    // La Cinta del Récord
    let remain: number | null = null;
    if (!tapeBurst && score.recordDist > 0) {
      const r = score.recordDist - score.distance;
      if (r <= 0) {
        tapeBurst = true;
        world.burstTape();
        ui.bannerNewRecord();
        audio.recordBreak();
        haptics.heavy();
      } else {
        remain = r;
      }
    }
    world.updateTape(remain);
  } else {
    player.updateTumble(h);
  }
}

// Camera chase state; vectors reused every frame, no per-frame allocations.
let camX = 0;
let camRoll = 0;
const lookTarget = new THREE.Vector3();

function updateCamera(dt: number): void {
  const k = 1 - Math.exp(-CONFIG.camDamping * dt);
  camX += (player.x * CONFIG.camXFollow - camX) * k;
  camRoll += (-player.velXNorm * CONFIG.cameraRollMaxDeg * DEG - camRoll) * k;
  camera.up.set(Math.sin(camRoll), Math.cos(camRoll), 0);
  camera.position.set(camX, CONFIG.camUp, -CONFIG.camBack);
  if (shakeT > 0) {
    shakeT -= dt;
    const kk = shakeAmp * Math.max(0, shakeT / 0.3);
    camera.position.x += (Math.random() - 0.5) * 2 * kk;
    camera.position.y += (Math.random() - 0.5) * 1.2 * kk;
    if (shakeT <= 0) shakeAmp = 0;
  }
  // FOV speed kick: velocity you can feel in your stomach
  const kickNorm = state === 'playing' || state === 'crashing' ? currentNorm : 0;
  const targetFov = baseFov + CONFIG.fovSpeedKick * kickNorm + (cafecitoT > 0 ? CONFIG.fovCafecito : 0);
  camera.fov += (targetFov - camera.fov) * Math.min(1, 4 * dt);
  camera.updateProjectionMatrix();
  lookTarget.set((camX + player.x) / 2, 1.1, CONFIG.camLookAhead);
  camera.lookAt(lookTarget);
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
      lastRun = score.finishRun();
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

function audioCtxNow(): { running: boolean; speedNorm: number; combo: number; contraVia: boolean; wheelie: boolean } {
  return {
    running: state === 'playing',
    speedNorm: currentNorm,
    combo: score.combo,
    contraVia: score.isContraVia,
    wheelie: player.isWheelie,
  };
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
  if (state === 'playing' || state === 'crashing') ui.setScore(score.points);
  renderer.render(scene, camera);
}

ui.showTitle(score.record);
ui.updateVehicles(selectedVehicle, vehicleRecords());
requestAnimationFrame(frame);

// Test hook for automated checks; the game itself never reads this.
(window as unknown as Record<string, unknown>).__ecc = {
  fps: () => Math.round(fpsAvg),
  state: () => state,
  score: () => score.points,
  record: () => score.record,
  x: () => player.x,
  y: () => player.y,
  speed: () => speed,
  cars: () => traffic.activeCars,
  combo: () => score.combo,
  platanos: () => score.platanos,
  cv: () => score.isContraVia,
  wheelie: () => player.isWheelie,
  airborne: () => player.isAirborne,
  powerups: () => ({ cafecitoT, imanT, shielded: player.hasShield, invincibleT }),
  worldDist: () => Math.round(world.distance),
  info: () => ({ calls: renderer.info.render.calls, tris: renderer.info.render.triangles }),
  dog: () => world.debugViralata(),
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
  start: () => {
    if (state === 'title' || state === 'gameover') startRun();
  },
  crash: () => {
    if (state === 'playing') doCrash();
  },
  wheelieNow: () => {
    // hold-based now; tests should dispatch keydown Space instead
  },
  setRecordDist: (m: number) => {
    score.recordDist = m;
  },
  setDistance: (m: number) => {
    score.distance = m;
  },
  spawnPickup: (kind: PickupKind, x: number, z: number, y?: number) =>
    traffic.debugSpawnPickup(kind, x, z, y),
  spawnObstacle: (kind: ObstacleKind, x: number, z: number) =>
    traffic.debugSpawnObstacle(kind, x, z),
  spawnVehicle: (type: VehicleType, lane: number, z: number, dir: 1 | -1, exactX?: number) =>
    traffic.debugSpawnVehicle(type, lane, z, dir, exactX),
  // Advances the sim deterministically (used by automated checks when the
  // pane is hidden and requestAnimationFrame is frozen).
  tick: (sec: number) => {
    let remaining = sec;
    while (remaining > 0) {
      const step = Math.min(1 / 60, remaining);
      remaining -= step;
      advance(step, performance.now());
    }
    updateCamera(1 / 60);
    audio.update(1 / 60, audioCtxNow());
    if (state === 'playing' || state === 'crashing') ui.setScore(score.points);
    renderer.render(scene, camera);
  },
};
