// main.ts: bootstrap, render loop, resize, and the game state machine.
// Fixed-timestep simulation (feel is framerate independent); the crash
// slow-mo simply scales how fast real time feeds the accumulator.

import './style.css';
import '@fontsource/lilita-one';
import * as THREE from 'three';
import { CONFIG } from './config';
import { World } from './world';
import { Player } from './player';
import { Traffic } from './traffic';
import { Score } from './score';
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
let elapsed = 0;
let scrapeTimer = 0;
let crashRealT = 0;
let gameOverAt = 0;

const world = new World(scene, renderer);
const score = new Score();
const traffic = new Traffic(scene);
const player = new Player(scene, {
  isSteeringActive: () => state === 'playing',
  onScrape: () => {
    scrapeTimer = CONFIG.scrapeSlowSec;
  },
});
const ui = new UI(document.getElementById('ui')!, {
  onStart: startRun,
  onRestart: tryRestart,
  onResume: resume,
});

function startRun(): void {
  if (state !== 'title' && state !== 'gameover') return;
  score.reset();
  traffic.reset();
  player.reset();
  speed = CONFIG.baseSpeed;
  elapsed = 0;
  scrapeTimer = 0;
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

function doCrash(): void {
  state = 'crashing';
  crashRealT = 0;
  player.crash();
}

window.addEventListener('keydown', (e) => {
  if (e.code !== 'Space' && e.code !== 'Enter') return;
  if (state === 'title') startRun();
  else if (state === 'gameover') tryRestart();
  else if (state === 'paused') resume();
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden && state === 'playing') {
    state = 'paused';
    score.persist();
    ui.showPause();
  }
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
    world.step(CONFIG.baseSpeed * 0.45 * h); // attract mode: the Malecon keeps moving
    return;
  }
  if (state !== 'playing' && state !== 'crashing') return;

  elapsed += h;
  speed = Math.min(CONFIG.maxSpeed, CONFIG.baseSpeed + CONFIG.speedRampPerSec * elapsed);
  if (scrapeTimer > 0) scrapeTimer = Math.max(0, scrapeTimer - h);
  const penalty = 1 - CONFIG.scrapeSpeedLoss * (scrapeTimer / CONFIG.scrapeSlowSec);
  const effSpeed = speed * penalty;
  const ds = effSpeed * h;

  world.step(ds);
  traffic.step(ds, h, elapsed);

  if (state === 'playing') {
    player.step(h, effSpeed);
    score.step(ds);
    if (traffic.checkCollision(player.x, 0, CONFIG.playerRadius)) doCrash();
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
  player.updateSparks(dt);
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
  speed: () => speed,
  cars: () => traffic.activeCars,
  start: () => {
    if (state === 'title' || state === 'gameover') startRun();
  },
  crash: () => {
    if (state === 'playing') doCrash();
  },
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
