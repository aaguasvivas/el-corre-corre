// world.ts: sky, golden-hour light, sea, ground, and the recycling road chunks.
// World-moves architecture: the player stays near the origin, the world slides toward -z.
// Forward is +z; +x is the oncoming/sea side (renders on screen LEFT because the
// camera looks down +z).

import * as THREE from 'three';
import { CONFIG, PALETTE, ROAD } from './config';

const CHUNK_LEN = 30;
const CHUNK_COUNT = 7; // covers roughly z -45 to +165, past fog and spawn distance
const RECYCLE_Z = -35;

// Shared 3-step toon gradient plus a material cache so everything shades identically.
let gradientMap: THREE.DataTexture | null = null;
const toonCache = new Map<number, THREE.MeshToonMaterial>();

export function getGradientMap(): THREE.DataTexture {
  if (!gradientMap) {
    const data = new Uint8Array([110, 190, 255]);
    gradientMap = new THREE.DataTexture(data, 3, 1, THREE.RedFormat);
    gradientMap.minFilter = THREE.NearestFilter;
    gradientMap.magFilter = THREE.NearestFilter;
    gradientMap.generateMipmaps = false;
    gradientMap.needsUpdate = true;
  }
  return gradientMap;
}

export function toonMaterial(color: number): THREE.MeshToonMaterial {
  let m = toonCache.get(color);
  if (!m) {
    m = new THREE.MeshToonMaterial({ color, gradientMap: getGradientMap() });
    toonCache.set(color, m);
  }
  return m;
}

function hex(c: number): string {
  return '#' + c.toString(16).padStart(6, '0');
}

export class World {
  private chunks: THREE.Mesh[] = [];

  constructor(scene: THREE.Scene, renderer: THREE.WebGLRenderer) {
    this.buildSky(scene);
    this.buildLights(scene);
    this.buildGround(scene);
    this.buildRoad(scene, renderer);
  }

  private buildSky(scene: THREE.Scene): void {
    const c = document.createElement('canvas');
    c.width = 2;
    c.height = 512;
    const g = c.getContext('2d')!;
    const grad = g.createLinearGradient(0, 0, 0, 512);
    grad.addColorStop(0, hex(PALETTE.skyTop));
    grad.addColorStop(0.68, hex(PALETTE.skyHorizon));
    grad.addColorStop(1, '#ffe9bc');
    g.fillStyle = grad;
    g.fillRect(0, 0, 2, 512);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    scene.background = tex;

    scene.fog = new THREE.Fog(PALETTE.skyHorizon, CONFIG.fogNear, CONFIG.fogFar);

    // Low sun over the sea (+x side, ahead of the player). fog:false keeps it glowing.
    const sun = new THREE.Mesh(
      new THREE.CircleGeometry(14, 32),
      new THREE.MeshBasicMaterial({ color: PALETTE.sunGlow, fog: false, side: THREE.DoubleSide }),
    );
    sun.position.set(58, 11, 155);
    scene.add(sun);
    const halo = new THREE.Mesh(
      new THREE.CircleGeometry(27, 32),
      new THREE.MeshBasicMaterial({
        color: PALETTE.sunGlow,
        fog: false,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.35,
      }),
    );
    halo.position.set(58, 11, 157);
    scene.add(halo);
  }

  private buildLights(scene: THREE.Scene): void {
    const hemi = new THREE.HemisphereLight(0xbfe3ef, 0xe8c39a, 0.85);
    scene.add(hemi);

    // One warm, low directional light: long golden-hour shadows falling away from the sea.
    const sun = new THREE.DirectionalLight(0xffe3b3, 1.7);
    sun.position.set(40, 22, 90);
    sun.target.position.set(0, 0, 10);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    const sc = sun.shadow.camera;
    sc.left = -45;
    sc.right = 45;
    sc.top = 45;
    sc.bottom = -45;
    sc.near = 10;
    sc.far = 220;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.6;
    scene.add(sun, sun.target);
  }

  private buildGround(scene: THREE.Scene): void {
    const flat = (w: number, l: number, color: number, x: number, y: number): THREE.Mesh => {
      const geo = new THREE.PlaneGeometry(w, l);
      geo.rotateX(-Math.PI / 2);
      const m = new THREE.Mesh(geo, toonMaterial(color));
      m.position.set(x, y, 120);
      scene.add(m);
      return m;
    };

    // The Caribbean on the +x side: a near band and the deep beyond it.
    flat(33, 420, PALETTE.seaNear, 12 + 16.5, -0.5);
    flat(195, 420, PALETTE.seaDeep, 45 + 97.5, -0.55);
    // Warm ground on the far side until Phase 3 brings the facades.
    flat(228, 420, PALETTE.groundFar, -(12 + 114), -0.05);

    // Sidewalk curbs flanking the shoulders.
    const walkGeo = new THREE.BoxGeometry(3.6, 0.16, 420);
    for (const side of [1, -1]) {
      const walk = new THREE.Mesh(walkGeo, toonMaterial(PALETTE.sidewalk));
      walk.position.set(side * (ROAD.edgeX + 1.8), 0.08, 120);
      walk.receiveShadow = true;
      scene.add(walk);
    }
  }

  private buildRoad(scene: THREE.Scene, renderer: THREE.WebGLRenderer): void {
    // Canvas-drawn road: asphalt, shoulders, cream edge lines, double yellow center
    // (DR roads), and dashed lane separators. One texture shared by every chunk;
    // the 6 m dash cycle divides the 30 m chunk so tiling is seamless.
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 1024;
    const g = c.getContext('2d')!;
    const pmx = c.width / ROAD.fullWidth;
    const pmy = c.height / CHUNK_LEN;

    g.fillStyle = hex(PALETTE.asphalt);
    g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = hex(PALETTE.asphaltShoulder);
    g.fillRect(0, 0, CONFIG.shoulderWidth * pmx, c.height);
    g.fillRect(c.width - CONFIG.shoulderWidth * pmx, 0, CONFIG.shoulderWidth * pmx, c.height);

    for (let i = 0; i < 900; i++) {
      g.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.045)' : 'rgba(0,0,0,0.06)';
      const s = 1 + Math.random() * 2.2;
      g.fillRect(Math.random() * c.width, Math.random() * c.height, s, s);
    }

    const vline = (xM: number, wM: number, color: string): void => {
      g.fillStyle = color;
      g.fillRect((xM - wM / 2) * pmx, 0, Math.max(2, wM * pmx), c.height);
    };
    vline(CONFIG.shoulderWidth, 0.12, hex(PALETTE.laneDash));
    vline(ROAD.fullWidth - CONFIG.shoulderWidth, 0.12, hex(PALETTE.laneDash));
    vline(ROAD.fullWidth / 2 - 0.16, 0.12, hex(PALETTE.centerLine));
    vline(ROAD.fullWidth / 2 + 0.16, 0.12, hex(PALETTE.centerLine));

    g.fillStyle = hex(PALETTE.laneDash);
    for (const xM of [ROAD.fullWidth / 2 - CONFIG.laneWidth, ROAD.fullWidth / 2 + CONFIG.laneWidth]) {
      for (let zM = 0; zM < CHUNK_LEN; zM += 6) {
        g.fillRect((xM - 0.06) * pmx, zM * pmy, Math.max(2, 0.12 * pmx), 3 * pmy);
      }
    }

    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());

    const mat = new THREE.MeshToonMaterial({ map: tex, gradientMap: getGradientMap() });
    const geo = new THREE.PlaneGeometry(ROAD.fullWidth, CHUNK_LEN);
    geo.rotateX(-Math.PI / 2);
    for (let i = 0; i < CHUNK_COUNT; i++) {
      const chunk = new THREE.Mesh(geo, mat);
      chunk.position.z = -CHUNK_LEN + i * CHUNK_LEN;
      chunk.receiveShadow = true;
      scene.add(chunk);
      this.chunks.push(chunk);
    }
  }

  step(ds: number): void {
    for (let i = 0; i < this.chunks.length; i++) {
      const chunk = this.chunks[i];
      chunk.position.z -= ds;
      if (chunk.position.z < RECYCLE_Z) chunk.position.z += CHUNK_COUNT * CHUNK_LEN;
    }
  }
}
