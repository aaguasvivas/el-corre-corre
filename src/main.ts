// main.ts: bootstrap, render loop, resize, and the game state machine.
// Phase 0: a colored golden-hour world with the road scrolling under the camera.

import './style.css';
import '@fontsource/lilita-one';
import * as THREE from 'three';
import { CONFIG } from './config';
import { World } from './world';

type GameState = 'title' | 'playing' | 'paused' | 'crashing' | 'gameover';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: 'high-performance',
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(CONFIG.fovDesktop, 1, 0.3, 400);
camera.position.set(0, CONFIG.camUp, -CONFIG.camBack);
camera.lookAt(0, 1.1, CONFIG.camLookAhead);

const world = new World(scene, renderer);

let state: GameState = 'playing'; // Phase 0: nothing but the world scroll

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

document.addEventListener('visibilitychange', () => {
  if (document.hidden && state === 'playing') state = 'paused';
  else if (!document.hidden && state === 'paused') state = 'playing';
});

let last = performance.now();
let acc = 0;
let fpsAvg = 60;

function frame(now: number): void {
  requestAnimationFrame(frame);
  const raw = (now - last) / 1000;
  last = now;
  if (raw > 0) fpsAvg += (1 / Math.max(raw, 1e-4) - fpsAvg) * 0.05;
  const dt = Math.min(raw, CONFIG.maxFrameDt);

  if (state === 'playing') {
    acc += dt;
    while (acc >= CONFIG.fixedDt) {
      world.step(CONFIG.baseSpeed * CONFIG.fixedDt);
      acc -= CONFIG.fixedDt;
    }
  }

  renderer.render(scene, camera);
}
requestAnimationFrame(frame);

// Test hook for automated checks; the game itself never reads this.
(window as unknown as Record<string, unknown>).__ecc = {
  fps: () => Math.round(fpsAvg),
  state: () => state,
};
