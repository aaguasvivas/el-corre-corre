// main.ts: bootstrap, render loop, resize, and the game state machine.
// Fixed-timestep simulation (feel is framerate independent); the crash
// slow-mo simply scales how fast real time feeds the accumulator.

import './style.css';
import '@fontsource/lilita-one';
import * as THREE from 'three';
import { CONFIG, ROAD } from './config';
import { World } from './world';
import { Player } from './player';
import { Traffic, type ObstacleKind, type PickupKind, type VehicleType } from './traffic';
import { Score, ladderTier } from './score';
import { UI } from './ui';

type GameState = 'title' | 'playing' | 'paused' | 'crashing' | 'gameover';

const DEG = Math.PI / 180;

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
let speed: number = CONFIG.baseSpeed;
let currentEff: number = CONFIG.baseSpeed;
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

function addShake(amp: number): void {
  shakeAmp = Math.max(shakeAmp, amp);
  shakeT = 0.3;
}

const world = new World(scene, renderer);
const score = new Score();

// World-to-screen projection for popup placement (percent coordinates).
const projV = new THREE.Vector3();
function w2s(x: number, y: number, z: number): { x: number; y: number } {
  projV.set(x, y, z).project(camera);
  return { x: (projV.x * 0.5 + 0.5) * 100, y: (-projV.y * 0.5 + 0.5) * 100 };
}

const ui = new UI(document.getElementById('ui')!, {
  onStart: startRun,
  onRestart: tryRestart,
  onResume: resume,
  onPause: pauseGame,
});

const traffic = new Traffic(scene, {
  onNearMiss: (x, z) => {
    const r = score.nearMiss();
    const s = w2s(x, 1.3, Math.max(z, 1.5));
    ui.popup(`${ui.nextNearMissText()} +${r.pts}`, s.x, s.y, r.combo >= 5 ? 'pop-md' : 'pop-sm');
    if (r.ladderText) ui.popup(r.ladderText, 50, 34, r.combo >= 7 ? 'pop-xl' : 'pop-lg');
    ui.setCombo(r.combo, ladderTier(r.combo));
  },
  onPlatano: (x, y, z) => {
    const pts = score.collectPlatano();
    ui.setPlatanos(score.platanos);
    const s = w2s(x, y + 0.5, Math.max(z, 1));
    ui.popup(`+${pts}`, s.x, s.y, 'pop-sm pop-gold');
  },
  onPowerup: (kind, x, z) => {
    const s = w2s(x, 1.4, Math.max(z, 1));
    if (kind === 'cafecito') {
      cafecitoT = CONFIG.cafecitoSec;
      player.setGlow(true);
      ui.popup('¡CAFECITO!', s.x, s.y, 'pop-lg pop-gold');
    } else if (kind === 'bendicion') {
      player.setShield(true);
      ui.popup('¡BENDICIÓN!', s.x, s.y, 'pop-lg pop-gold');
    } else {
      imanT = CONFIG.imanSec;
      ui.popup('¡IMÁN!', s.x, s.y, 'pop-lg pop-gold');
    }
  },
  onHoyo: () => {
    hoyoTimer = CONFIG.hoyoRecoverSec;
    score.resetCombo();
    ui.setCombo(0, null);
    addShake(CONFIG.shakeHoyo);
  },
  onPolicia: () => {
    player.launch(Math.max(3.2, currentEff * CONFIG.policiaLaunchVy));
  },
  onCharco: () => player.applyCharco(),
});

const player = new Player(scene, {
  isSteeringActive: () => state === 'playing',
  onScrape: () => {
    scrapeTimer = CONFIG.scrapeSlowSec;
    score.resetCombo();
    ui.setCombo(0, null);
  },
  onWheelieEnd: () => {
    if (state !== 'playing') return;
    const pts = score.endWheelie();
    if (pts >= 2) {
      const s = w2s(player.x, 1.6, 2);
      ui.popup(`¡CABALLITO! +${pts}`, s.x, s.y, 'pop-md pop-gold');
    }
  },
  onLand: () => {
    if (state !== 'playing') return;
    const pts = score.endAir();
    if (pts >= 3) {
      const s = w2s(player.x, 1.4, 2);
      ui.popup(`¡AIRE! +${pts}`, s.x, s.y, 'pop-md pop-gold');
    }
  },
});

function startRun(): void {
  if (state !== 'title' && state !== 'gameover') return;
  score.reset();
  traffic.reset();
  player.reset();
  speed = CONFIG.baseSpeed;
  currentEff = CONFIG.baseSpeed;
  elapsed = 0;
  scrapeTimer = 0;
  hoyoTimer = 0;
  cafecitoT = 0;
  imanT = 0;
  invincibleT = 0;
  tapeBurst = false;
  shakeT = 0;
  shakeAmp = 0;
  acc = 0;
  state = 'playing';
  ui.showPlaying(score.record);
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
}

function pauseGame(): void {
  if (state !== 'playing') return;
  state = 'paused';
  score.persist();
  ui.showPause();
}

function doCrash(): void {
  state = 'crashing';
  crashRealT = 0;
  player.crash();
  score.setContraVia(false);
  ui.setContraVia(false);
}

window.addEventListener('keydown', (e) => {
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
  camera.fov = h > w ? CONFIG.fovMobile : CONFIG.fovDesktop;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', resize);
resize();

function stepSim(h: number): void {
  if (state === 'title') {
    world.step(CONFIG.baseSpeed * 0.45 * h, h); // attract mode: the Malecon keeps moving
    return;
  }
  if (state !== 'playing' && state !== 'crashing') return;

  elapsed += h;
  speed = Math.min(CONFIG.maxSpeed, CONFIG.baseSpeed + CONFIG.speedRampPerSec * elapsed);
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

  traffic.step({
    ds,
    dt: h,
    elapsed,
    speed: effSpeed,
    playerX: player.x,
    playerY: player.y,
    live,
    airborne: player.isAirborne,
    wheelie: player.isWheelie,
    magnet: imanT > 0,
  });

  if (live) {
    player.step(h, effSpeed);
    score.step(ds, h, { airborne: player.isAirborne, wheelie: player.isWheelie });

    if (traffic.checkCollision(player.x, 0, CONFIG.playerRadius)) {
      if (cafecitoT > 0 || invincibleT > 0) {
        // el cafecito: plow right through
      } else if (player.hasShield) {
        player.useShield();
        invincibleT = CONFIG.shieldGraceSec;
        addShake(CONFIG.shakeShield);
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
        ui.banner('¡NUEVO RÉCORD!');
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
      ui.showGameOver(score.finishRun());
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

function frame(now: number): void {
  requestAnimationFrame(frame);
  const raw = (now - last) / 1000;
  last = now;
  if (raw > 0) fpsAvg += (1 / Math.max(raw, 1e-4) - fpsAvg) * 0.05;
  const dt = Math.min(raw, CONFIG.maxFrameDt);

  advance(dt, now);
  updateCamera(dt);
  if (state === 'playing' || state === 'crashing') ui.setScore(score.points);
  renderer.render(scene, camera);
}

ui.showTitle(score.record);
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
  start: () => {
    if (state === 'title' || state === 'gameover') startRun();
  },
  crash: () => {
    if (state === 'playing') doCrash();
  },
  wheelieNow: () => player.tryWheelie(),
  setRecordDist: (m: number) => {
    score.recordDist = m;
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
    if (state === 'playing' || state === 'crashing') ui.setScore(score.points);
    renderer.render(scene, camera);
  },
};
