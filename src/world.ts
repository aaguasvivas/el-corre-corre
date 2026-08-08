// world.ts: sky, golden-hour light, sea with shimmer, seawall, palms, pastel
// facades, colmados, power lines, flags, mountains, the Obelisco, sidewalk
// life (domino, frutero, chichigua, pelicans, la viralata), the recycling
// road chunks, and La Cinta del Récord.
//
// World-moves architecture: the player stays near the origin, the world
// slides toward -z. Forward is +z; +x is the oncoming/sea side (renders on
// screen LEFT because the camera looks down +z).
//
// DECISION (Phase 3 S-curves): the curve is a lateral bend FIELD evaluated in
// the vertex shader as a function of distance ridden plus world z, with the
// tangent at the player subtracted out. Gameplay space stays straight, so
// collision and spawn validation remain exact; the world visibly breathes.
// The same patch adds the soft world-bend drop (distant road curls below the
// horizon). Scenery lives in three 120 m belts of InstancedMeshes that
// recycle beyond the fog and re-randomize on each pass.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CONFIG, PALETTE, ROAD } from './config';
import { drawDominicanFlag, FLAG_ASPECT } from './flag';

const CHUNK_LEN = 30;
const CHUNK_COUNT = 7;
const RECYCLE_Z = -35;
const CONFETTI_COUNT = 46;
const BELT_COUNT = 3;
// Belts start slightly behind the camera so the scenery beside the player is
// never missing. That offset also fixes their phase forever: belt starts land
// at world positions congruent to -BELT_PHASE (mod beltLen), and a tramo
// (600 m) is an exact multiple of a belt (120 m), so a border lands at the
// same spot inside a belt every single time. Dressing a belt by its START
// therefore ran every crossing 100 m late, and dressing it by exactly the
// border sat on a knife edge that always fell to the old side. Belts are
// dressed by their MIDPOINT instead: whichever tramo owns most of the belt
// wins, no tie is possible (midpoints land 40 mod 120, borders 0 mod 120),
// and a crossing shows up 20 m early rather than 100 m late.
const BELT_PHASE = 20;

// ---------------------------------------------------------------------------
// Los Tramos (Phase 7): the run tours the country. Theme is a pure function
// of distance, so belts and road chunks can each ask "what will the world be
// when the player reaches me" and recycle into the right dress.
// ---------------------------------------------------------------------------

export type Tramo = 'malecon' | 'zona' | 'campo';
const TRAMO_ORDER: Tramo[] = ['malecon', 'zona', 'campo'];
// What the sea becomes out in el campo: sun-dried pasture, not sea green.
const FIELD_COLOR = new THREE.Color(0x9cae54);

export function tramoFor(d: number): Tramo {
  const i = Math.floor(Math.max(0, d) / CONFIG.tramoLengthM) % TRAMO_ORDER.length;
  return TRAMO_ORDER[i];
}

// ---------------------------------------------------------------------------
// The bend field
// ---------------------------------------------------------------------------

const CURVE_U = {
  dist: { value: 0 },
  off: { value: 0 },
  slope: { value: 0 },
};

export function curveOffset(d: number): number {
  return (
    CONFIG.curveAmp1 * Math.sin(d / CONFIG.curveLen1) +
    CONFIG.curveAmp2 * Math.sin(d / CONFIG.curveLen2 + 1.7)
  );
}

function curveSlope(d: number): number {
  return (
    (CONFIG.curveAmp1 / CONFIG.curveLen1) * Math.cos(d / CONFIG.curveLen1) +
    (CONFIG.curveAmp2 / CONFIG.curveLen2) * Math.cos(d / CONFIG.curveLen2 + 1.7)
  );
}

const BEND_CHUNK = `
vec4 mvPosition = vec4( transformed, 1.0 );
#ifdef USE_INSTANCING
	mvPosition = instanceMatrix * mvPosition;
#endif
vec4 eccW = modelMatrix * mvPosition;
float eccAhead = uEccDist + eccW.z;
float eccOff = ${CONFIG.curveAmp1.toFixed(5)} * sin( eccAhead / ${CONFIG.curveLen1.toFixed(5)} )
             + ${CONFIG.curveAmp2.toFixed(5)} * sin( eccAhead / ${CONFIG.curveLen2.toFixed(5)} + 1.7 );
eccW.x += eccOff - uEccOff - uEccSlope * eccW.z;
eccW.y -= ${CONFIG.worldDrop.toFixed(7)} * eccW.z * eccW.z * step( 0.0, eccW.z );
mvPosition = viewMatrix * eccW;
gl_Position = projectionMatrix * mvPosition;
`;

function bendPatch(shader: { uniforms: Record<string, unknown>; vertexShader: string }): void {
  shader.uniforms.uEccDist = CURVE_U.dist;
  shader.uniforms.uEccOff = CURVE_U.off;
  shader.uniforms.uEccSlope = CURVE_U.slope;
  shader.vertexShader =
    'uniform float uEccDist;\nuniform float uEccOff;\nuniform float uEccSlope;\n' +
    shader.vertexShader.replace('#include <project_vertex>', BEND_CHUNK);
}

// Every world-space material goes through this so the whole Malecon bends as
// one. Celestial things (sun, halo, sky) must NOT be wrapped.
export function worldMaterial<T extends THREE.Material>(m: T): T {
  m.onBeforeCompile = bendPatch as unknown as (shader: unknown) => void;
  m.customProgramCacheKey = () => 'eccbend';
  return m;
}

// ---------------------------------------------------------------------------
// Shared materials and texture helpers
// ---------------------------------------------------------------------------

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
    m = worldMaterial(new THREE.MeshToonMaterial({ color, gradientMap: getGradientMap() }));
    toonCache.set(color, m);
  }
  return m;
}

export function textTexture(
  text: string,
  w: number,
  h: number,
  bg: string,
  fg: string,
  font: string,
): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  g.fillStyle = fg;
  g.font = font;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, w / 2, h / 2 + 1);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function hex(c: number): string {
  return '#' + c.toString(16).padStart(6, '0');
}

function rand(a: number, b: number): number {
  return a + Math.random() * (b - a);
}

// ---------------------------------------------------------------------------
// Vertex-colored geometry helpers (for merged, instanced scenery)
// ---------------------------------------------------------------------------

export function paint(g: THREE.BufferGeometry, color: number): THREE.BufferGeometry {
  const c = new THREE.Color(color);
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = c.r;
    arr[i * 3 + 1] = c.g;
    arr[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}

function cbox(
  parts: THREE.BufferGeometry[],
  w: number,
  h: number,
  d: number,
  x: number,
  y: number,
  z: number,
  color: number,
  rx = 0,
  ry = 0,
  rz = 0,
): void {
  const g = new THREE.BoxGeometry(w, h, d);
  if (rz) g.rotateZ(rz);
  if (rx) g.rotateX(rx);
  if (ry) g.rotateY(ry);
  g.translate(x, y, z);
  parts.push(paint(g, color));
}

function cgeo(
  parts: THREE.BufferGeometry[],
  g: THREE.BufferGeometry,
  color: number,
  x: number,
  y: number,
  z: number,
  rx = 0,
  ry = 0,
  rz = 0,
): void {
  if (rz) g.rotateZ(rz);
  if (rx) g.rotateX(rx);
  if (ry) g.rotateY(ry);
  g.translate(x, y, z);
  parts.push(paint(g, color));
}

// ---------------------------------------------------------------------------
// Scenery atlas: signs, awnings, the flag. One texture, one material.
// ---------------------------------------------------------------------------

interface AtlasRect {
  u0: number;
  v0: number;
  u1: number;
  v1: number;
}

interface Atlas {
  tex: THREE.CanvasTexture;
  rects: Record<string, AtlasRect>;
}

function buildAtlas(): Atlas {
  const S = 512;
  const c = document.createElement('canvas');
  c.width = S;
  c.height = S;
  const g = c.getContext('2d')!;
  g.clearRect(0, 0, S, S);
  const rects: Record<string, AtlasRect> = {};
  const put = (name: string, x: number, y: number, w: number, h: number): void => {
    rects[name] = { u0: x / S, v0: 1 - (y + h) / S, u1: (x + w) / S, v1: 1 - y / S };
  };

  const signNames = ['LA FE', 'EL PROGRESO', 'DOÑA TATICA'];
  signNames.forEach((name, i) => {
    const x = 8;
    const y = 8 + i * 60;
    g.fillStyle = hex(PALETTE.sunGlow);
    g.fillRect(x, y, 300, 52);
    g.strokeStyle = hex(PALETTE.colmadoRed);
    g.lineWidth = 5;
    g.strokeRect(x + 3, y + 3, 294, 46);
    g.fillStyle = hex(PALETTE.flagBlue);
    g.font = 'bold 15px sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('COLMADO', x + 150, y + 14);
    g.fillStyle = hex(PALETTE.colmadoRed);
    g.font = 'bold 25px sans-serif';
    g.fillText(name, x + 150, y + 35);
    put(`sign${i}`, x, y, 300, 52);
  });

  const stripes = (x: number, y: number, color: string): void => {
    g.fillStyle = '#ffffff';
    g.fillRect(x, y, 300, 48);
    g.fillStyle = color;
    for (let i = 0; i < 10; i += 2) g.fillRect(x + i * 30, y, 30, 48);
  };
  stripes(8, 196, '#0f7a3d'); // presidente-green, no branding
  put('awningA', 8, 196, 300, 48);
  stripes(8, 252, hex(PALETTE.colmadoRed));
  put('awningB', 8, 252, 300, 48);

  g.fillStyle = '#2e7d32';
  g.fillRect(8, 310, 300, 44);
  g.strokeStyle = '#ffffff';
  g.lineWidth = 3;
  g.strokeRect(11, 313, 294, 38);
  g.fillStyle = '#ffffff';
  g.font = 'bold 21px sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('Av. George Washington', 158, 333);
  put('street', 8, 310, 300, 44);

  // La bandera, escudo and all (see flag.ts for why the escudo is not optional)
  const fx = 340;
  const fy = 8;
  const fw = 160;
  const fh = fw / FLAG_ASPECT;
  drawDominicanFlag(g, fx, fy, fw);
  put('flag', fx, fy, fw, fh);

  g.fillStyle = '#ffffff';
  g.fillRect(430, 130, 24, 24);
  put('white', 434, 134, 16, 16);
  g.fillStyle = '#8d8d8d';
  g.fillRect(430, 170, 24, 24);
  put('gray', 434, 174, 16, 16);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return { tex, rects };
}

function quadUV(w: number, h: number, r: AtlasRect): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(w, h);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  uv.setXY(0, r.u0, r.v1);
  uv.setXY(1, r.u1, r.v1);
  uv.setXY(2, r.u0, r.v0);
  uv.setXY(3, r.u1, r.v0);
  return g;
}

function uvFill(g: THREE.BufferGeometry, r: AtlasRect): THREE.BufferGeometry {
  const uv = g.attributes.uv as THREE.BufferAttribute;
  const u = (r.u0 + r.u1) / 2;
  const v = (r.v0 + r.v1) / 2;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, u, v);
  return g;
}

// ---------------------------------------------------------------------------
// Belt scenery variants
// ---------------------------------------------------------------------------

const TRIM = 0xd8d2c6;
const WINDOW = 0x22333d;

interface Sized {
  geo: THREE.BufferGeometry;
  width: number;
}

function makeFacade(width: number, floors: number, cols: number, balcony: boolean): Sized {
  const parts: THREE.BufferGeometry[] = [];
  const depth = 7;
  const H = floors === 1 ? 4.4 : 7.8;
  cbox(parts, depth, H, width, 0, H / 2, 0, 0xffffff);
  cbox(parts, depth + 0.35, 0.4, width + 0.35, 0, H + 0.15, 0, TRIM);
  const fx = depth / 2 + 0.05;
  const span = width - 2.2;
  for (let f = 0; f < floors; f++) {
    const wy = f === 0 ? 1.9 : 5.6;
    for (let i = 0; i < cols; i++) {
      const wz = -span / 2 + (span / (cols - 1)) * i;
      if (f === 0 && i === Math.floor(cols / 2)) {
        cbox(parts, 0.14, 2.3, 1.15, fx, 1.15, wz, 0x53616b); // la puerta
        cbox(parts, 0.2, 0.16, 1.45, fx, 2.4, wz, TRIM);
      } else {
        cbox(parts, 0.12, 1.5, 0.95, fx, wy, wz, WINDOW);
        cbox(parts, 0.18, 0.12, 1.15, fx, wy + 0.85, wz, TRIM);
      }
    }
    if (f === 1 && balcony) {
      cbox(parts, 0.8, 0.09, span + 1.1, fx + 0.35, 4.75, 0, TRIM);
      cbox(parts, 0.06, 0.75, span + 1.1, fx + 0.72, 5.15, 0, TRIM);
      for (let b = 0; b <= 4; b++) {
        cbox(parts, 0.06, 0.75, 0.06, fx + 0.72, 5.15, -(span + 1) / 2 + ((span + 1) / 4) * b, TRIM);
      }
    }
  }
  return { geo: mergeGeometries(parts)!, width };
}

function makeColmadoBody(width: number): Sized {
  const parts: THREE.BufferGeometry[] = [];
  const depth = 6.5;
  const H = 4.2;
  cbox(parts, depth, H, width, 0, H / 2, 0, 0xffffff);
  cbox(parts, depth + 0.35, 0.4, width + 0.35, 0, H + 0.15, 0, TRIM);
  const fx = depth / 2;
  const openW = width * 0.55;
  cbox(parts, 0.6, 2.5, openW, fx - 0.25, 1.35, 0, 0x241f1e); // shaded interior
  cbox(parts, 0.34, 1.0, openW * 0.8, fx + 0.05, 0.62, 0, 0xf2e9dc); // counter
  cbox(parts, 0.3, 0.4, 0.5, fx - 0.3, 2.2, -openW * 0.24, 0xffd3b6); // goods on the shelf
  cbox(parts, 0.3, 0.35, 0.45, fx - 0.3, 2.2, openW * 0.2, 0x7cb342);
  cbox(parts, 0.14, 1.6, 0.6, fx + 0.02, 0.9, -(openW / 2 + 0.55), WINDOW);
  return { geo: mergeGeometries(parts)!, width };
}

// La Zona Colonial: taller openings, wooden shutters, a wrought-iron balcony
// running the full front, heavier cornice. Body stays white for instance tint.
function makeZonaFacade(width: number, cols: number): Sized {
  const parts: THREE.BufferGeometry[] = [];
  const depth = 7;
  const H = 7.2;
  const IRON = 0x241f1d;
  const SHUTTER = 0x2f5d3a;
  cbox(parts, depth, H, width, 0, H / 2, 0, 0xffffff);
  cbox(parts, depth + 0.4, 0.5, width + 0.4, 0, H + 0.2, 0, 0xf2ead8); // cornice
  cbox(parts, depth + 0.2, 0.25, width + 0.2, 0, 3.62, 0, 0xf2ead8); // string course
  const fx = depth / 2 + 0.05;
  const span = width - 2.0;
  for (let i = 0; i < cols; i++) {
    const wz = -span / 2 + (span / Math.max(1, cols - 1)) * i;
    // ground floor: tall arched doors (a box with a small header reads arched enough)
    cbox(parts, 0.14, 2.7, 1.05, fx, 1.35, wz, 0x3a2c22);
    cbox(parts, 0.2, 0.18, 1.3, fx, 2.85, wz, 0xf2ead8);
    // upper floor: shuttered French windows onto the balcony
    cbox(parts, 0.12, 2.0, 0.5, fx, 5.1, wz - 0.29, SHUTTER);
    cbox(parts, 0.12, 2.0, 0.5, fx, 5.1, wz + 0.29, SHUTTER);
  }
  // the balcony: slab, top rail, and iron pickets across the whole front
  cbox(parts, 0.9, 0.1, width - 0.6, fx + 0.4, 4.1, 0, 0xf2ead8);
  cbox(parts, 0.05, 0.06, width - 0.7, fx + 0.82, 5.0, 0, IRON);
  const pickets = Math.max(6, Math.round(width * 1.4));
  for (let b = 0; b <= pickets; b++) {
    cbox(parts, 0.045, 0.9, 0.045, fx + 0.82, 4.6, -(width - 0.8) / 2 + ((width - 0.8) / pickets) * b, IRON);
  }
  // farolito: a little iron lantern beside the center door
  cbox(parts, 0.3, 0.05, 0.05, fx + 0.15, 3.2, 0.85, IRON);
  cbox(parts, 0.16, 0.24, 0.16, fx + 0.32, 3.05, 0.85, 0xffe9a8);
  return { geo: mergeGeometries(parts)!, width };
}

// Wrought-iron street lamp: the Zona swaps its power poles for these.
function makeIronLamp(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const IRON = 0x241f1d;
  cbox(parts, 0.5, 0.22, 0.5, 0, 0.11, 0, IRON);
  cgeo(parts, new THREE.CylinderGeometry(0.06, 0.1, 3.4, 6), IRON, 0, 1.8, 0);
  cbox(parts, 0.55, 0.06, 0.06, 0.22, 3.5, 0, IRON);
  cbox(parts, 0.2, 0.32, 0.2, 0.44, 3.3, 0, 0xffe9a8); // the glass
  cbox(parts, 0.26, 0.06, 0.26, 0.44, 3.5, 0, IRON); // its little roof
  return mergeGeometries(parts)!;
}

// El Campo: a small wooden house, colors baked per variant because the zinc
// roof must stay zinc (instance tint would wash it).
function makeCampoHouse(width: number, body: number, trim: number): Sized {
  const parts: THREE.BufferGeometry[] = [];
  const depth = 5;
  const H = 2.7;
  cbox(parts, depth, H, width, 0, H / 2 + 0.25, 0, body);
  // stilts and the little porch
  for (const sz of [-width / 2 + 0.3, width / 2 - 0.3]) {
    cbox(parts, 0.22, 0.3, 0.22, -depth / 2 + 0.3, 0.12, sz, 0x6b5645);
    cbox(parts, 0.22, 0.3, 0.22, depth / 2 - 0.3, 0.12, sz, 0x6b5645);
  }
  // vertical plank lines
  const planks = Math.round(width * 1.6);
  for (let p = 0; p <= planks; p++) {
    cbox(parts, 0.06, H - 0.2, 0.05, depth / 2 + 0.02, H / 2 + 0.25, -width / 2 + (width / planks) * p, trim);
  }
  // door and shuttered window, painted trim
  cbox(parts, 0.14, 1.7, 0.85, depth / 2 + 0.06, 1.12, -width * 0.22, 0x3a2c22);
  cbox(parts, 0.2, 0.14, 1.0, depth / 2 + 0.06, 2.05, -width * 0.22, trim);
  cbox(parts, 0.12, 0.9, 0.9, depth / 2 + 0.06, 1.5, width * 0.24, trim);
  // zinc roof, one shallow slope with a lip
  const roof = new THREE.BoxGeometry(depth + 1.0, 0.1, width + 0.9);
  roof.rotateZ(0.16);
  roof.translate(0, H + 0.55, 0);
  parts.push(paint(roof, 0xb8b2a8));
  return { geo: mergeGeometries(parts)!, width };
}

// One platano plant; instanced by the dozen into field rows.
function makePlatanoPlant(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  cgeo(parts, new THREE.CylinderGeometry(0.14, 0.2, 1.5, 6), 0x8bc34a, 0, 0.75, 0);
  for (let k = 0; k < 5; k++) {
    const leaf = new THREE.BoxGeometry(1.7, 0.05, 0.5);
    leaf.translate(0.8, 0, 0);
    leaf.rotateZ(0.45 - (k % 3) * 0.3);
    leaf.rotateY((k / 5) * Math.PI * 2 + 0.6);
    leaf.translate(0, 1.5, 0);
    parts.push(paint(leaf, k % 2 ? 0x7cb342 : 0x66a83b));
  }
  return mergeGeometries(parts)!;
}

// Roadside fritura stand: counter, tarp roof, the pot of oil doing its work.
function makeFritura(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  cbox(parts, 1.1, 0.9, 2.4, 0, 0.45, 0, 0x8a6f52); // counter
  cbox(parts, 1.2, 0.06, 2.5, 0, 0.94, 0, 0xd9c7a7);
  for (const sz of [-1.1, 1.1]) {
    cbox(parts, 0.08, 2.1, 0.08, -0.45, 1.05, sz, 0x6b5645);
    cbox(parts, 0.08, 2.1, 0.08, 0.45, 1.05, sz, 0x6b5645);
  }
  const tarp = new THREE.BoxGeometry(1.7, 0.06, 2.9);
  tarp.rotateZ(0.12);
  tarp.translate(0, 2.2, 0);
  parts.push(paint(tarp, 0xe63946));
  cgeo(parts, new THREE.CylinderGeometry(0.24, 0.24, 0.3, 8), 0x2a2624, 0.2, 1.09, -0.5); // el caldero
  cbox(parts, 0.5, 0.35, 0.4, 0.1, 1.15, 0.7, 0xf4c430); // platanos waiting their turn
  return mergeGeometries(parts)!;
}

function makeSignSet(rects: Record<string, AtlasRect>, nameIdx: number): THREE.BufferGeometry {
  const depth = 6.5;
  const sign = quadUV(3.5, 0.75, rects[`sign${nameIdx}`]);
  sign.rotateY(Math.PI / 2);
  sign.translate(depth / 2 + 0.08, 3.82, 0);
  const awning = quadUV(4.6, 1.25, rects[nameIdx % 2 === 0 ? 'awningA' : 'awningB']);
  awning.rotateY(Math.PI / 2);
  awning.rotateZ(0.55);
  awning.translate(depth / 2 + 0.6, 2.62, 0);
  return mergeGeometries([sign, awning])!;
}

// A real palm reads as one smooth lean, not a staircase: the trunk is a chain
// of short segments whose angle grows a little each step, every segment
// starting exactly where the last one ended. Fronds are two boxes each, an
// inner piece that rises and an outer piece that droops from its tip, which
// is what gives the crown its arc.
function makePalm(lean: number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const SEGS = 6;
  const segLen = 0.8;
  let px = 0;
  let py = 0;
  for (let i = 0; i < SEGS; i++) {
    const w = 0.32 - i * 0.03; // taper toward the crown
    const a = lean * (0.12 + i * 0.11); // the curve: each segment tilts a bit more
    const g = new THREE.BoxGeometry(w, segLen + 0.14, w); // slight overlap hides seams
    g.translate(0, (segLen + 0.14) / 2 - 0.07, 0); // pivot at the segment base
    g.rotateZ(-a); // positive lean bends toward +x (the sea)
    g.translate(px, py, 0);
    parts.push(paint(g, i % 2 ? PALETTE.palmTrunk : 0x84675a)); // subtle ring banding
    px += Math.sin(a) * segLen;
    py += Math.cos(a) * segLen;
  }
  const cx = px;
  const cy = py + 0.18;
  const greens = [0x43a047, 0x3a8f3f, 0x4caf50];
  for (let k = 0; k < 8; k++) {
    const droop = 0.55 + (k % 3) * 0.14;
    const len = 1.9 + (k % 2) * 0.35;
    const rise = 0.34 - (k % 3) * 0.1;
    // inner half rises away from the crown
    const inner = new THREE.BoxGeometry(len * 0.52, 0.06, 0.42);
    inner.translate(len * 0.26, 0, 0);
    inner.rotateZ(rise);
    // outer half hangs off the inner tip and droops
    const tipX = Math.cos(rise) * len * 0.52;
    const tipY = Math.sin(rise) * len * 0.52;
    const outer = new THREE.BoxGeometry(len * 0.55, 0.05, 0.3);
    outer.translate(len * 0.27, 0, 0);
    outer.rotateZ(-droop);
    outer.translate(tipX, tipY, 0);
    for (const half of [inner, outer]) {
      half.rotateY((k / 8) * Math.PI * 2 + 0.35);
      half.translate(cx, cy, 0);
      parts.push(paint(half, greens[k % 3]));
    }
  }
  for (let n = 0; n < 3; n++) {
    cgeo(
      parts,
      new THREE.SphereGeometry(0.12, 6, 5),
      0x6d4c41,
      cx + Math.cos(n * 2.1) * 0.22,
      cy + 0.05,
      Math.sin(n * 2.1) * 0.22,
    );
  }
  return mergeGeometries(parts)!;
}

function makeSeawallPost(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  cbox(parts, 0.2, 0.7, 0.2, 0, 0.85, 0, 0xf6efdf);
  cbox(parts, 0.3, 0.1, 0.3, 0, 1.24, 0, 0xf6efdf);
  return mergeGeometries(parts)!;
}

function makePowerPole(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  cbox(parts, 0.24, 7, 0.24, 0, 3.5, 0, PALETTE.poleWood);
  cbox(parts, 1.7, 0.13, 0.13, 0, 6.45, 0, PALETTE.poleWood);
  cbox(parts, 1.4, 0.11, 0.11, 0, 6.0, 0, PALETTE.poleWood, 0, 0.1, 0);
  // three wires sagging back 24 m to the previous pole, in two segments each
  for (const wx of [-0.6, 0, 0.6]) {
    for (const seg of [0, 1]) {
      const wire = new THREE.BoxGeometry(0.035, 0.035, 12.15);
      wire.translate(0, 0, -6.05);
      wire.rotateX(seg === 0 ? -0.029 : 0.029);
      wire.translate(wx, seg === 0 ? 6.42 : 6.07, seg === 0 ? 0 : -12);
      parts.push(paint(wire, PALETTE.wire));
    }
  }
  // one loose service wire dropping toward the buildings
  const drop = new THREE.BoxGeometry(0.03, 0.03, 9);
  drop.translate(0, 0, -4.5);
  drop.rotateX(-0.12);
  drop.rotateY(0.35);
  drop.translate(0, 5.9, 0);
  parts.push(paint(drop, PALETTE.wire));
  return mergeGeometries(parts)!;
}

function makeFlagpole(rects: Record<string, AtlasRect>): THREE.BufferGeometry {
  const pole = uvFill(new THREE.CylinderGeometry(0.05, 0.07, 5, 6), rects.white);
  pole.translate(0, 2.5, 0);
  const ball = uvFill(new THREE.SphereGeometry(0.09, 6, 5), rects.white);
  ball.translate(0, 5.05, 0);
  const flag = quadUV(1.52, 0.95, rects.flag); // 8:5, la bandera's real ratio
  flag.translate(0.78, 4.45, 0);
  flag.rotateY(0.5);
  return mergeGeometries([pole, ball, flag])!;
}

function makeDominoSet(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  cgeo(parts, new THREE.CylinderGeometry(0.8, 0.8, 0.07, 10), 0xfdfdf8, 0, 0.78, 0);
  cgeo(parts, new THREE.CylinderGeometry(0.07, 0.07, 0.78, 6), PALETTE.darkParts, 0, 0.39, 0);
  const shirts = [PALETTE.colmadoTeal, 0xffd3b6, PALETTE.colmadoRed, 0xb3d9ff];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    const sx = Math.cos(a) * 1.15;
    const sz = Math.sin(a) * 1.15;
    cbox(parts, 0.4, 0.42, 0.4, sx, 0.22, sz, 0xffffff);
    cbox(parts, 0.42, 0.55, 0.32, sx * 0.92, 0.85, sz * 0.92, shirts[i], 0, -a, 0);
    cgeo(parts, new THREE.SphereGeometry(0.15, 8, 6), PALETTE.skin, sx * 0.9, 1.32, sz * 0.9);
  }
  for (let d = 0; d < 5; d++) {
    cbox(parts, 0.16, 0.03, 0.09, rand(-0.4, 0.4), 0.83, rand(-0.4, 0.4), 0xffffff, 0, rand(0, 3), 0);
  }
  return mergeGeometries(parts)!;
}

function makeFruitStand(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  cbox(parts, 1.7, 0.1, 1.15, 0, 0.85, 0, PALETTE.palmTrunk);
  for (const sx of [-0.7, 0.7]) {
    for (const sz of [-0.45, 0.45]) cbox(parts, 0.09, 0.85, 0.09, sx, 0.42, sz, PALETTE.palmTrunk);
  }
  cbox(parts, 0.5, 0.32, 0.5, -0.45, 1.06, 0.15, 0xffeaa7);
  cbox(parts, 0.5, 0.28, 0.5, 0.15, 1.04, -0.25, 0x7cb342);
  cbox(parts, 0.5, 0.3, 0.5, 0.5, 1.05, 0.3, 0xff8b94);
  cgeo(parts, new THREE.CylinderGeometry(0.04, 0.04, 2.6, 6), 0xd9d9d9, -0.7, 1.3, -0.4);
  cgeo(parts, new THREE.ConeGeometry(1.35, 0.6, 8), PALETTE.colmadoRed, -0.7, 2.75, -0.4);
  cbox(parts, 0.42, 0.55, 0.3, 0.2, 1.6, -0.85, 0xffd3b6);
  cgeo(parts, new THREE.SphereGeometry(0.15, 8, 6), PALETTE.skin, 0.2, 2.05, -0.85);
  return mergeGeometries(parts)!;
}

function makeChair(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const white = 0xf6f6f2;
  cbox(parts, 0.44, 0.06, 0.42, 0, 0.45, 0, white);
  cbox(parts, 0.44, 0.52, 0.06, 0, 0.72, -0.2, white, -0.12, 0, 0);
  for (const sx of [-0.18, 0.18]) {
    for (const sz of [-0.16, 0.16]) cbox(parts, 0.05, 0.45, 0.05, sx, 0.22, sz, white);
  }
  return mergeGeometries(parts)!;
}

function makeStreetSign(rects: Record<string, AtlasRect>): THREE.BufferGeometry {
  const pole = uvFill(new THREE.CylinderGeometry(0.04, 0.04, 2.6, 6), rects.gray);
  pole.translate(0, 1.3, 0);
  const plaque = quadUV(1.6, 0.34, rects.street);
  plaque.rotateY(Math.PI); // face approaching traffic
  plaque.translate(0, 2.4, 0);
  return mergeGeometries([pole, plaque])!;
}

// ---------------------------------------------------------------------------
// A belt: one 120 m stretch of instanced scenery, refilled on recycle
// ---------------------------------------------------------------------------

interface BeltAssets {
  vcMat: THREE.MeshToonMaterial;
  atlasMat: THREE.MeshBasicMaterial;
  facades: Sized[];
  colmados: Sized[];
  signSets: THREE.BufferGeometry[];
  palms: THREE.BufferGeometry[];
  post: THREE.BufferGeometry;
  pole: THREE.BufferGeometry;
  flag: THREE.BufferGeometry;
  domino: THREE.BufferGeometry;
  fruit: THREE.BufferGeometry;
  chair: THREE.BufferGeometry;
  street: THREE.BufferGeometry;
  // Los Tramos
  zonaFacades: Sized[];
  ironLamp: THREE.BufferGeometry;
  campoHouses: Sized[];
  platanoPlant: THREE.BufferGeometry;
  fritura: THREE.BufferGeometry;
}

function buildBeltAssets(atlas: Atlas): BeltAssets {
  const vcMat = worldMaterial(
    new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: getGradientMap() }),
  );
  const atlasMat = worldMaterial(
    new THREE.MeshBasicMaterial({ map: atlas.tex, side: THREE.DoubleSide }),
  );
  return {
    vcMat,
    atlasMat,
    facades: [
      makeFacade(9, 1, 3, false),
      makeFacade(12, 2, 4, true),
      makeFacade(10, 2, 3, false),
      makeFacade(13, 1, 4, false),
      makeFacade(11, 2, 3, true),
    ],
    colmados: [makeColmadoBody(8), makeColmadoBody(10)],
    signSets: [0, 1, 2].map((i) => makeSignSet(atlas.rects, i)),
    palms: [makePalm(0.55), makePalm(-0.3)],
    post: makeSeawallPost(),
    pole: makePowerPole(),
    flag: makeFlagpole(atlas.rects),
    domino: makeDominoSet(),
    fruit: makeFruitStand(),
    chair: makeChair(),
    street: makeStreetSign(atlas.rects),
    zonaFacades: [makeZonaFacade(9, 3), makeZonaFacade(12, 4), makeZonaFacade(7.5, 2)],
    ironLamp: makeIronLamp(),
    campoHouses: [
      makeCampoHouse(4.2, 0x6fc7be, 0xffffff),
      makeCampoHouse(3.6, 0xf4c430, 0x2a9d8f),
      makeCampoHouse(4.6, 0xff8b94, 0xffffff),
    ],
    platanoPlant: makePlatanoPlant(),
    fritura: makeFritura(),
  };
}

const ZONA_TINTS = [0xf5e6c8, 0xe8b04b, 0xd77a61, 0xffffff, 0xa8c6a1, 0xf2d0a4];

const PASTELS = PALETTE.buildingPastels;
const COLMADO_TINTS = [PALETTE.colmadoTeal, PALETTE.colmadoRed, 0xf4c430, 0xffffff];

const _dummy = new THREE.Object3D();
const _color = new THREE.Color();

class Belt {
  group = new THREE.Group();
  tramo: Tramo = 'malecon'; // what this belt was last dressed as (test probe)
  private facadeIMs: THREE.InstancedMesh[] = [];
  private colmadoIMs: THREE.InstancedMesh[] = [];
  private signIMs: THREE.InstancedMesh[] = [];
  private palmIMs: THREE.InstancedMesh[] = [];
  private postIM: THREE.InstancedMesh;
  private poleIM: THREE.InstancedMesh;
  private flagIM: THREE.InstancedMesh;
  private dominoIM: THREE.InstancedMesh;
  private fruitIM: THREE.InstancedMesh;
  private chairIM: THREE.InstancedMesh;
  private streetIM: THREE.InstancedMesh;
  private zonaFacadeIMs: THREE.InstancedMesh[] = [];
  private lampIM: THREE.InstancedMesh;
  private campoHouseIMs: THREE.InstancedMesh[] = [];
  private platanoIM: THREE.InstancedMesh;
  private frituraIM: THREE.InstancedMesh;
  private assets: BeltAssets;
  private signCursor: number;

  constructor(scene: THREE.Scene, assets: BeltAssets, signStart: number) {
    this.assets = assets;
    this.signCursor = signStart;
    const im = (
      geo: THREE.BufferGeometry,
      mat: THREE.Material,
      cap: number,
      shadow = false,
    ): THREE.InstancedMesh => {
      const m = new THREE.InstancedMesh(geo, mat, cap);
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.frustumCulled = false;
      m.castShadow = shadow;
      m.count = 0;
      this.group.add(m);
      return m;
    };
    for (const f of assets.facades) this.facadeIMs.push(im(f.geo, assets.vcMat, 4));
    for (const cB of assets.colmados) this.colmadoIMs.push(im(cB.geo, assets.vcMat, 2));
    for (const s of assets.signSets) this.signIMs.push(im(s, assets.atlasMat, 2));
    for (const p of assets.palms) this.palmIMs.push(im(p, assets.vcMat, 8, true));
    this.postIM = im(assets.post, assets.vcMat, 21);
    this.poleIM = im(assets.pole, assets.vcMat, 5);
    this.flagIM = im(assets.flag, assets.atlasMat, 3, true);
    this.dominoIM = im(assets.domino, assets.vcMat, 2);
    this.fruitIM = im(assets.fruit, assets.vcMat, 2);
    this.chairIM = im(assets.chair, assets.vcMat, 4);
    this.streetIM = im(assets.street, assets.atlasMat, 2);
    for (const zf of assets.zonaFacades) this.zonaFacadeIMs.push(im(zf.geo, assets.vcMat, 14));
    this.lampIM = im(assets.ironLamp, assets.vcMat, 12);
    for (const ch of assets.campoHouses) this.campoHouseIMs.push(im(ch.geo, assets.vcMat, 12));
    this.platanoIM = im(assets.platanoPlant, assets.vcMat, 200);
    this.frituraIM = im(assets.fritura, assets.vcMat, 2);
    scene.add(this.group);
  }

  fill(tramo: Tramo): void {
    this.tramo = tramo;
    const L = CONFIG.beltLen;
    const counts = new Map<THREE.InstancedMesh, number>();
    const place = (
      mesh: THREE.InstancedMesh,
      x: number,
      y: number,
      z: number,
      ry = 0,
      scale = 1,
      tint?: number,
    ): void => {
      const i = counts.get(mesh) ?? 0;
      if (i >= (mesh.instanceMatrix.count as number)) return;
      _dummy.position.set(x, y, z);
      _dummy.rotation.set(0, ry, 0);
      _dummy.scale.setScalar(scale);
      _dummy.updateMatrix();
      mesh.setMatrixAt(i, _dummy.matrix);
      if (tint !== undefined) mesh.setColorAt(i, _color.set(tint));
      else if (mesh.instanceColor) mesh.setColorAt(i, _color.set(0xffffff));
      counts.set(mesh, i + 1);
    };

    // Buildings along the far side, fronts flush at x = -12.3. Which buildings
    // depends on the tramo this belt is dressing itself as.
    let cursor = rand(2, 6);
    if (tramo === 'malecon') {
      let colmadosUsed = 0;
      let pastelIdx = Math.floor(Math.random() * PASTELS.length);
      while (cursor < L - 4) {
        const wantColmado = colmadosUsed < 2 && Math.random() < 0.3;
        if (wantColmado) {
          const vi = Math.floor(Math.random() * this.assets.colmados.length);
          const v = this.assets.colmados[vi];
          if (cursor + v.width > L - 2) break;
          const z = cursor + v.width / 2;
          const tint = COLMADO_TINTS[Math.floor(Math.random() * COLMADO_TINTS.length)];
          place(this.colmadoIMs[vi], -12.3 - 3.25, 0, z, 0, 1, tint);
          place(this.signIMs[this.signCursor % 3], -12.3 - 3.25, 0, z);
          this.signCursor++;
          colmadosUsed++;
          cursor += v.width + rand(0.4, 2.4);
        } else {
          const vi = Math.floor(Math.random() * this.assets.facades.length);
          const v = this.assets.facades[vi];
          if (cursor + v.width > L - 2) break;
          const z = cursor + v.width / 2;
          place(this.facadeIMs[vi], -12.3 - 3.5, 0, z, 0, 1, PASTELS[pastelIdx % PASTELS.length]);
          pastelIdx++;
          cursor += v.width + rand(0, 2.2);
        }
      }
    } else if (tramo === 'zona') {
      // Colonial fronts packed tight, one colmado allowed (the Zona has them too)
      let colmadosUsed = 0;
      let tintIdx = Math.floor(Math.random() * ZONA_TINTS.length);
      while (cursor < L - 4) {
        if (colmadosUsed < 1 && Math.random() < 0.14) {
          const vi = Math.floor(Math.random() * this.assets.colmados.length);
          const v = this.assets.colmados[vi];
          if (cursor + v.width > L - 2) break;
          place(this.colmadoIMs[vi], -12.3 - 3.25, 0, cursor + v.width / 2, 0, 1, 0xffffff);
          place(this.signIMs[this.signCursor % 3], -12.3 - 3.25, 0, cursor + v.width / 2);
          this.signCursor++;
          colmadosUsed++;
          cursor += v.width + rand(0.2, 0.9);
        } else {
          const vi = Math.floor(Math.random() * this.assets.zonaFacades.length);
          const v = this.assets.zonaFacades[vi];
          if (cursor + v.width > L - 2) break;
          place(this.zonaFacadeIMs[vi], -12.3 - 3.5, 0, cursor + v.width / 2, 0, 1, ZONA_TINTS[tintIdx % ZONA_TINTS.length]);
          tintIdx++;
          cursor += v.width + rand(0, 0.8); // wall-to-wall, the colonial block
        }
      }
    } else {
      // El campo: houses breathe, and the platanal fills the land behind them
      while (cursor < L - 6) {
        const vi = Math.floor(Math.random() * this.assets.campoHouses.length);
        const v = this.assets.campoHouses[vi];
        if (cursor + v.width > L - 4) break;
        place(this.campoHouseIMs[vi], -12.3 - 2.5, 0, cursor + v.width / 2, rand(-0.08, 0.08));
        cursor += v.width + rand(7, 15);
      }
      if (Math.random() < 0.6) {
        place(this.frituraIM, -10.6, 0, rand(8, L - 8), rand(-0.4, 0.4) + Math.PI / 2);
      }
      // field rows, jittered so they read planted, not printed
      for (let row = 0; row < 3; row++) {
        const rx = -15.5 - row * 3.1;
        for (let z = rand(1, 3); z < L - 1; z += rand(3.4, 4.6)) {
          place(this.platanoIM, rx + rand(-0.7, 0.7), 0, z, rand(0, 6.3), rand(0.8, 1.25));
        }
      }
    }

    // Palms: the Malecon promenade is thick with them, the Zona keeps a few,
    // el campo scatters them on both sides like the carretera does
    const palmStep: [number, number] =
      tramo === 'malecon' ? [12, 21] : tramo === 'zona' ? [24, 40] : [16, 30];
    for (let z = rand(3, 10); z < L - 3; z += rand(palmStep[0], palmStep[1])) {
      place(
        this.palmIMs[Math.random() < 0.6 ? 0 : 1],
        9.9 + rand(-0.4, 0.5),
        0,
        z,
        rand(-0.5, 0.5),
        rand(0.85, 1.2),
      );
    }
    const farPalms = tramo === 'campo' ? 4 : 2;
    for (let i = 0; i < farPalms; i++) {
      if (Math.random() < (tramo === 'campo' ? 0.9 : 0.7)) {
        place(this.palmIMs[1], -10.6 + rand(-0.3, 0.3), 0, rand(6, L - 6), rand(0, 6.3), rand(0.8, 1.05));
      }
    }

    // The sea side. This is half the screen, so it carries the tramo as much
    // as the buildings do: the seawall belongs to the Malecon, La Zona walls
    // you into a colonial canyon, and el campo opens into plantain rows.
    if (tramo === 'malecon') {
      for (let i = 0; i <= 20; i++) place(this.postIM, 11.85, 0, i * 6);
    } else if (tramo === 'zona') {
      // facades face the road, so they need turning around over here
      let sx = rand(1, 5);
      let tintIdx = Math.floor(Math.random() * ZONA_TINTS.length);
      while (sx < L - 4) {
        const vi = Math.floor(Math.random() * this.assets.zonaFacades.length);
        const v = this.assets.zonaFacades[vi];
        if (sx + v.width > L - 2) break;
        place(
          this.zonaFacadeIMs[vi],
          12.3 + 3.5,
          0,
          sx + v.width / 2,
          Math.PI,
          1,
          ZONA_TINTS[tintIdx % ZONA_TINTS.length],
        );
        tintIdx++;
        sx += v.width + rand(0, 0.8);
      }
    } else {
      // el platanal on both shoulders, and the fence that keeps it there
      for (let i = 0; i <= 20; i++) place(this.postIM, 11.85, 0, i * 6, 0, 0.85, 0x9a7b52);
      for (let row = 0; row < 3; row++) {
        const rx = 13.2 + row * 3.1; // close enough to read at phone FOV
        for (let z = rand(1, 3); z < L - 1; z += rand(3.4, 4.6)) {
          place(this.platanoIM, rx + rand(-0.7, 0.7), 0, z, rand(0, 6.3), rand(0.8, 1.25));
        }
      }
      if (Math.random() < 0.5) {
        const vi = Math.floor(Math.random() * this.assets.campoHouses.length);
        place(this.campoHouseIMs[vi], 12.3 + 2.5, 0, rand(8, L - 8), Math.PI + rand(-0.08, 0.08));
      }
    }
    if (tramo === 'zona') {
      for (let i = 0; i < 9; i++) place(this.lampIM, -11.5, 0, 4 + i * 13.5);
      for (let i = 0; i < 4; i++) place(this.lampIM, 10.4, 0, 10 + i * 30, Math.PI);
    } else if (tramo === 'malecon') {
      for (let i = 0; i < 5; i++) place(this.poleIM, -11.7, 0, i * 24);
    } else {
      for (let i = 0; i < 3; i++) place(this.poleIM, -11.7, 0, 8 + i * 44);
    }

    const flagChance = tramo === 'malecon' ? 0.55 : tramo === 'zona' ? 0.35 : 0.15;
    for (let i = 0; i < 3; i++) {
      if (Math.random() < flagChance) place(this.flagIM, 10.55, 0, rand(6, L - 6), rand(0, 6.3));
    }
    if (tramo !== 'campo' && Math.random() < 0.65) {
      place(this.dominoIM, -10.2, 0, rand(8, L - 8), rand(0, 6.3));
    }
    if (Math.random() < 0.55) {
      place(this.fruitIM, Math.random() < 0.7 ? -10.4 : 10.3, 0, rand(8, L - 8), rand(0, 6.3));
    }
    const chairTries = tramo === 'campo' ? 2 : 4;
    for (let i = 0; i < chairTries; i++) {
      if (Math.random() < 0.75) {
        place(this.chairIM, rand(-10.9, -9.4), 0, rand(4, L - 4), rand(0, 6.3));
      }
    }
    if (tramo !== 'campo' && Math.random() < 0.7) place(this.streetIM, -11.3, 0, rand(10, L - 10));

    for (const m of this.group.children) {
      const imMesh = m as THREE.InstancedMesh;
      imMesh.count = counts.get(imMesh) ?? 0;
      imMesh.instanceMatrix.needsUpdate = true;
      if (imMesh.instanceColor) imMesh.instanceColor.needsUpdate = true;
    }
  }
}

// ---------------------------------------------------------------------------
// Critters: never collidable, pure ambience
// ---------------------------------------------------------------------------

// One shared vertex-colored toon material for everything that bakes its colors
// into merged geometry: critters, traffic, the player rigs. Colors live in the
// vertices, so a whole vehicle is one draw call instead of three to six.
let _vcToonMat: THREE.MeshToonMaterial | null = null;
export function vcToonMaterial(): THREE.MeshToonMaterial {
  if (!_vcToonMat) {
    _vcToonMat = worldMaterial(
      new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: getGradientMap() }),
    );
  }
  return _vcToonMat;
}

// Unlit + double-sided: kite sails and bows read as flat paper against the sky.
let _kiteMat: THREE.MeshBasicMaterial | null = null;
function kiteMaterial(): THREE.MeshBasicMaterial {
  if (!_kiteMat) {
    _kiteMat = worldMaterial(new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }));
  }
  return _kiteMat;
}

let _dogGeo: THREE.BufferGeometry | null = null;
function dogGeometry(): THREE.BufferGeometry {
  if (_dogGeo) return _dogGeo;
  const parts: THREE.BufferGeometry[] = [];
  const tan = PALETTE.dogTan;
  cbox(parts, 0.26, 0.26, 0.62, 0, 0.42, 0, tan); // body
  cbox(parts, 0.22, 0.2, 0.24, 0, 0.62, 0.38, tan); // head
  cbox(parts, 0.1, 0.09, 0.16, 0, 0.56, 0.54, PALETTE.darkParts); // snout
  cbox(parts, 0.05, 0.12, 0.08, -0.07, 0.75, 0.38, tan);
  cbox(parts, 0.05, 0.12, 0.08, 0.07, 0.75, 0.38, tan);
  for (const sx of [-0.09, 0.09]) {
    for (const sz of [-0.22, 0.22]) cbox(parts, 0.07, 0.3, 0.07, sx, 0.15, sz, tan);
  }
  _dogGeo = mergeGeometries(parts)!;
  return _dogGeo;
}

let _dogTailGeo: THREE.BufferGeometry | null = null;
function dogTailGeometry(): THREE.BufferGeometry {
  if (!_dogTailGeo) _dogTailGeo = paint(new THREE.BoxGeometry(0.05, 0.05, 0.3), PALETTE.dogTan);
  return _dogTailGeo;
}

let _pelicanGeo: THREE.BufferGeometry | null = null;
function pelicanGeometry(): THREE.BufferGeometry {
  if (_pelicanGeo) return _pelicanGeo;
  const parts: THREE.BufferGeometry[] = [];
  const cream = 0xf4ede0;
  cbox(parts, 0.3, 0.22, 0.6, 0, 0, 0, cream); // body
  cbox(parts, 0.18, 0.18, 0.2, 0, 0.14, 0.32, cream); // head
  cbox(parts, 0.07, 0.07, 0.42, 0, 0.08, 0.55, 0xe8b04b); // beak
  cbox(parts, 1.05, 0.04, 0.34, -0.6, 0.12, 0, cream, 0, 0, 0.22);
  cbox(parts, 1.05, 0.04, 0.34, 0.6, 0.12, 0, cream, 0, 0, -0.22);
  cbox(parts, 0.3, 0.04, 0.34, -1.2, 0.26, 0, PALETTE.darkParts, 0, 0, 0.32);
  cbox(parts, 0.3, 0.04, 0.34, 1.2, 0.26, 0, PALETTE.darkParts, 0, 0, -0.32);
  _pelicanGeo = mergeGeometries(parts)!;
  return _pelicanGeo;
}

let _kidsGeo: THREE.BufferGeometry | null = null;
function kidsGeometry(): THREE.BufferGeometry {
  if (_kidsGeo) return _kidsGeo;
  const parts: THREE.BufferGeometry[] = [];
  const kid = (h: number, shirt: number, x: number, z: number): void => {
    cbox(parts, 0.26, h, 0.2, x, h / 2 + 0.3, z, shirt);
    cgeo(parts, new THREE.SphereGeometry(0.12, 8, 6), PALETTE.skin, x, h + 0.45, z);
  };
  kid(0.5, 0xffd3b6, 0, 0);
  kid(0.4, 0xb3d9ff, 0.45, 0.2);
  _kidsGeo = mergeGeometries(parts)!;
  return _kidsGeo;
}

// The kite carries its owner's color, so it is the one critter geometry that is
// built per instance (there are exactly two).
function kiteGeometry(kiteColor: number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const sail = new THREE.PlaneGeometry(0.95, 0.95);
  sail.rotateZ(Math.PI / 4);
  parts.push(paint(sail, kiteColor));
  cbox(parts, 1.3, 0.03, 0.03, 0, 0, 0, PALETTE.darkParts); // spar
  for (let i = 0; i < 3; i++) {
    cgeo(
      parts,
      new THREE.PlaneGeometry(0.16, 0.1),
      i % 2 ? PALETTE.flagWhite : PALETTE.flagBlue,
      0.18 * (i % 2 ? 1 : -1) * 0.4,
      -0.75 - i * 0.28,
      0,
    );
  }
  return mergeGeometries(parts)!;
}

class Viralata {
  group = new THREE.Group();
  private tail: THREE.Mesh;
  private state: 'hidden' | 'waiting' | 'dart' | 'bark' | 'retreat' | 'leaving' = 'hidden';
  private t = 0;
  private nextAt = rand(10, 18);

  constructor(scene: THREE.Scene) {
    const mat = vcToonMaterial();
    const body = new THREE.Mesh(dogGeometry(), mat);
    body.castShadow = true;
    this.tail = new THREE.Mesh(dogTailGeometry(), mat);
    this.tail.position.set(0, 0.52, -0.42);
    this.group.add(body, this.tail);
    this.group.visible = false;
    // faces the road: rotated so +z of the group points toward +x (the road)
    this.group.rotation.y = -Math.PI / 2;
    scene.add(this.group);
  }

  trigger(): void {
    if (this.state !== 'hidden') return;
    this.state = 'waiting';
    this.t = 0;
    this.group.visible = true;
    this.group.position.set(-10.8, 0, rand(120, 160));
  }

  update(ds: number, dt: number): void {
    if (this.state === 'hidden') {
      this.nextAt -= dt;
      if (this.nextAt <= 0) this.trigger();
      return;
    }
    this.t += dt;
    const p = this.group.position;
    p.z -= ds;
    if (p.z < -25) {
      this.state = 'hidden';
      this.group.visible = false;
      this.nextAt = rand(CONFIG.viralataEvery[0], CONFIG.viralataEvery[1]);
      return;
    }
    switch (this.state) {
      case 'waiting':
        this.group.position.y = 0;
        this.tail.rotation.x = Math.sin(this.t * 6) * 0.3;
        if (p.z < 55) this.state = 'dart';
        break;
      case 'dart':
        // darts toward the road and ALWAYS stops short: max x is -8.95, and the
        // player physically cannot reach past -8.45. Never collidable.
        p.x = Math.min(-8.95, p.x + 4.6 * dt);
        p.y = Math.abs(Math.sin(this.t * 13)) * 0.09;
        if (p.x >= -8.95) {
          this.state = 'bark';
          this.t = 0;
        }
        break;
      case 'bark':
        p.y = Math.abs(Math.sin(this.t * 14)) * 0.07;
        this.tail.rotation.x = Math.sin(this.t * 22) * 0.5;
        this.group.rotation.y = -Math.PI / 2 + Math.sin(this.t * 9) * 0.08;
        if (this.t > 0.8) this.state = 'retreat';
        break;
      case 'retreat':
        p.x -= 2.7 * dt;
        p.y = Math.abs(Math.sin(this.t * 9)) * 0.06;
        if (p.x <= -10.7) this.state = 'leaving';
        break;
      case 'leaving':
        this.tail.rotation.x = Math.sin(this.t * 5) * 0.25;
        break;
    }
  }
}

class Chichigua {
  group = new THREE.Group();
  private kite: THREE.Mesh;
  private line: THREE.Line;
  private linePos: THREE.BufferAttribute;
  private phase = Math.random() * 7;
  private t = 0;

  constructor(scene: THREE.Scene, kiteColor: number) {
    this.group.add(new THREE.Mesh(kidsGeometry(), vcToonMaterial()));
    this.kite = new THREE.Mesh(kiteGeometry(kiteColor), kiteMaterial());
    this.group.add(this.kite);

    const lineGeo = new THREE.BufferGeometry();
    this.linePos = new THREE.BufferAttribute(new Float32Array(6), 3);
    lineGeo.setAttribute('position', this.linePos);
    this.line = new THREE.Line(
      lineGeo,
      worldMaterial(new THREE.LineBasicMaterial({ color: PALETTE.darkParts })),
    );
    this.line.frustumCulled = false;
    this.group.add(this.line);

    this.group.position.set(10.4, 0, rand(60, 200));
    scene.add(this.group);
  }

  update(ds: number, dt: number): void {
    this.t += dt;
    const p = this.group.position;
    p.z -= ds;
    if (p.z < -25) {
      p.z = rand(150, 280);
    }
    this.kite.position.set(
      0.8 + Math.sin(this.t * 0.6 + this.phase) * 0.7,
      6.4 + Math.sin(this.t * 0.83 + this.phase) * 0.6,
      0.5 + Math.sin(this.t * 0.5) * 0.5,
    );
    this.kite.rotation.z = Math.sin(this.t * 0.9 + this.phase) * 0.18;
    this.linePos.setXYZ(0, 0.05, 0.85, 0);
    this.linePos.setXYZ(1, this.kite.position.x, this.kite.position.y - 0.4, this.kite.position.z);
    this.linePos.needsUpdate = true;
  }
}

class Pelican {
  group = new THREE.Group();
  private phase = Math.random() * 7;
  private t = 0;

  constructor(scene: THREE.Scene) {
    this.group.add(new THREE.Mesh(pelicanGeometry(), vcToonMaterial()));
    this.respawn();
    scene.add(this.group);
  }

  private respawn(): void {
    this.group.position.set(rand(13, 34), rand(4.5, 8), rand(150, 260));
  }

  update(ds: number, dt: number): void {
    this.t += dt;
    const p = this.group.position;
    p.z -= ds - 7 * dt; // glides forward, so it drifts past slower than traffic
    p.y += Math.sin(this.t * 0.7 + this.phase) * 0.25 * dt * 3;
    p.x += Math.sin(this.t * 0.3 + this.phase) * 0.5 * dt;
    this.group.rotation.z = Math.sin(this.t * 0.5 + this.phase) * 0.12;
    this.group.rotation.y = Math.PI + Math.sin(this.t * 0.24) * 0.3;
    if (p.z < -25) this.respawn();
  }
}

// Las gallinas del campo. Peck by the far sidewalk, and when the player gets
// close they scatter AWAY from the road, never toward it, same law as the
// viralata: ambience can never be hit.
let _henGeos: THREE.BufferGeometry[] | null = null;
function henGeometries(): THREE.BufferGeometry[] {
  if (_henGeos) return _henGeos;
  const build = (body: number): THREE.BufferGeometry => {
    const parts: THREE.BufferGeometry[] = [];
    cbox(parts, 0.3, 0.26, 0.42, 0, 0.3, 0, body);
    cbox(parts, 0.2, 0.2, 0.16, 0, 0.44, -0.26, body); // tail up
    cbox(parts, 0.12, 0.2, 0.12, 0, 0.5, 0.24, body); // neck
    cbox(parts, 0.14, 0.14, 0.16, 0, 0.62, 0.28, body); // head
    cbox(parts, 0.04, 0.09, 0.1, 0, 0.73, 0.28, 0xce1126); // comb
    cbox(parts, 0.05, 0.05, 0.1, 0, 0.6, 0.4, 0xf4a261); // beak
    cbox(parts, 0.04, 0.18, 0.04, -0.07, 0.09, 0, 0xf4a261);
    cbox(parts, 0.04, 0.18, 0.04, 0.07, 0.09, 0, 0xf4a261);
    return mergeGeometries(parts)!;
  };
  _henGeos = [build(0xf2e9dc), build(0x8a5a3b), build(0xffffff)];
  return _henGeos;
}

class Gallina {
  group = new THREE.Group();
  private state: 'hidden' | 'pecking' | 'scatter' = 'hidden';
  private t = 0;
  private nextAt = rand(3, 9);

  constructor(scene: THREE.Scene, geoIdx: number) {
    const m = new THREE.Mesh(henGeometries()[geoIdx % 3], vcToonMaterial());
    m.castShadow = true;
    this.group.add(m);
    this.group.visible = false;
    scene.add(this.group);
  }

  update(ds: number, dt: number, campo: boolean): void {
    if (this.state === 'hidden') {
      if (!campo) return;
      this.nextAt -= dt;
      if (this.nextAt <= 0) {
        this.state = 'pecking';
        this.t = 0;
        this.group.visible = true;
        // far sidewalk; the player physically cannot reach past -8.45
        this.group.position.set(-9.5 - Math.random() * 1.1, 0, 60 + Math.random() * 110);
        this.group.rotation.set(0, rand(0, 6.3), 0);
      }
      return;
    }
    this.t += dt;
    const p = this.group.position;
    p.z -= ds;
    if (p.z < -25 || p.x < -13) {
      this.state = 'hidden';
      this.group.visible = false;
      this.group.rotation.set(0, 0, 0);
      this.nextAt = rand(5, 12);
      return;
    }
    if (this.state === 'pecking') {
      this.group.rotation.x = Math.max(0, Math.sin(this.t * 6)) * 0.28; // head-down pecks
      if (p.z < 26) {
        this.state = 'scatter';
        this.t = 0;
        this.group.rotation.x = 0;
        this.group.rotation.y = -Math.PI / 2; // face away from the road
      }
    } else {
      p.x -= 3.4 * dt; // away, always away
      p.y = Math.abs(Math.sin(this.t * 16)) * 0.12;
      this.group.rotation.z = Math.sin(this.t * 22) * 0.14; // flapping panic
    }
  }
}

// ---------------------------------------------------------------------------

interface Confetto {
  im: THREE.InstancedMesh;
  idx: number;
  x: number;
  y: number;
  z: number;
  rotX: number;
  rotY: number;
  vx: number;
  vy: number;
  vz: number;
  rx: number;
  ry: number;
  life: number;
}

export class World {
  private chunks: THREE.Mesh[] = [];
  private tape!: THREE.Group;
  private confetti: Confetto[] = [];
  private confettiMeshes: THREE.InstancedMesh[] = [];
  private belts: Belt[] = [];
  private viralata!: Viralata;
  private chichiguas: Chichigua[] = [];
  private pelicans: Pelican[] = [];
  private obelisco!: THREE.Group;
  private nextObeliscoAt: number = CONFIG.obeliscoOffsetM;
  private obeliscoPassed = false;
  onObeliscoPass: (() => void) | null = null;
  private shimmerA!: THREE.CanvasTexture;
  private shimmerB!: THREE.CanvasTexture;
  private glintMat!: THREE.MeshBasicMaterial;
  private roadMats!: Record<Tramo, THREE.MeshToonMaterial>;
  // The water, and everything that sparkles on it, so el campo can turn it
  // into farmland instead of leaving the Caribbean parked next to a
  // plantain field.
  private seaMats: Array<{ mat: THREE.MeshToonMaterial; sea: THREE.Color }> = [];
  private waterFx: Array<{ mat: THREE.Material & { opacity: number }; base: number }> = [];
  private landBlend = 0; // 0 = open water, 1 = fields all the way out
  private tramoNow: Tramo = 'malecon';
  onTramoChange: ((t: Tramo) => void) | null = null;
  private gallinas: Gallina[] = [];
  private D = 0;
  private t = 0;

  get distance(): number {
    return this.D;
  }

  get tramo(): Tramo {
    return this.tramoNow;
  }

  constructor(scene: THREE.Scene, renderer: THREE.WebGLRenderer) {
    this.buildSky(scene);
    this.buildLights(scene);
    this.buildGround(scene);
    this.buildSea(scene);
    this.buildMountains(scene);
    this.buildRoad(scene, renderer);
    this.buildTape(scene);
    this.buildConfetti(scene);

    const atlas = buildAtlas();
    const assets = buildBeltAssets(atlas);
    for (let i = 0; i < BELT_COUNT; i++) {
      const belt = new Belt(scene, assets, i);
      belt.group.position.z = -BELT_PHASE + i * CONFIG.beltLen;
      belt.fill(tramoFor(this.D + belt.group.position.z + CONFIG.beltLen / 2));
      this.belts.push(belt);
    }

    this.viralata = new Viralata(scene);
    this.chichiguas.push(new Chichigua(scene, PALETTE.flagRed), new Chichigua(scene, 0xf4c430));
    for (let i = 0; i < 3; i++) this.pelicans.push(new Pelican(scene));
    for (let i = 0; i < 3; i++) this.gallinas.push(new Gallina(scene, i));
    this.buildObelisco(scene, atlas);
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

    // Celestial: deliberately NOT bend-patched.
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
        // A flat camera-facing disc has no front/back ordering to resolve, so
        // skip the two-pass transparency three.js would otherwise do here.
        forceSinglePass: true,
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
    const flat = (
      w: number,
      l: number,
      color: number,
      x: number,
      y: number,
    ): THREE.Mesh => {
      const geo = new THREE.PlaneGeometry(w, l, 1, 24);
      geo.rotateX(-Math.PI / 2);
      const m = new THREE.Mesh(geo, toonMaterial(color));
      m.position.set(x, y, 120);
      scene.add(m);
      return m;
    };

    // Warm ground under the facades until the horizon
    flat(228, 420, PALETTE.groundFar, -(12 + 114), -0.05);

    // Sidewalks flanking the shoulders
    const walkGeo = new THREE.BoxGeometry(3.6, 0.16, 420, 1, 1, 24);
    for (const side of [1, -1]) {
      const walk = new THREE.Mesh(walkGeo, toonMaterial(PALETTE.sidewalk));
      walk.position.set(side * (ROAD.edgeX + 1.8), 0.08, 120);
      walk.receiveShadow = true;
      scene.add(walk);
    }

    // El malecon: base wall and rail; the balusters are instanced in the belts
    const baseGeo = new THREE.BoxGeometry(0.5, 0.6, 420, 1, 1, 24);
    const base = new THREE.Mesh(baseGeo, toonMaterial(PALETTE.seawallCream));
    base.position.set(11.85, 0.3, 120);
    scene.add(base);
    const railGeo = new THREE.BoxGeometry(0.42, 0.14, 420, 1, 1, 24);
    const rail = new THREE.Mesh(railGeo, toonMaterial(0xf6efdf));
    rail.position.set(11.85, 1.28, 120);
    scene.add(rail);
  }

  private buildSea(scene: THREE.Scene): void {
    const flat = (w: number, l: number, color: number, x: number, y: number): void => {
      const geo = new THREE.PlaneGeometry(w, l, 1, 24);
      geo.rotateX(-Math.PI / 2);
      const mat = toonMaterial(color);
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, 120);
      scene.add(m);
      // Kept so the water can turn to land: el campo is inland, and the sea
      // sitting there unchanged was why crossing a border never read as
      // leaving the Malecon.
      this.seaMats.push({ mat, sea: new THREE.Color(color) });
    };
    flat(33, 420, PALETTE.seaNear, 12 + 16.5, -0.5);
    flat(195, 420, PALETTE.seaDeep, 45 + 97.5, -0.55);

    // Shimmer: two drifting fleck layers
    const fleckCanvas = (count: number, alpha: number): THREE.CanvasTexture => {
      const c = document.createElement('canvas');
      c.width = c.height = 256;
      const g = c.getContext('2d')!;
      g.clearRect(0, 0, 256, 256);
      for (let i = 0; i < count; i++) {
        g.fillStyle = `rgba(255,255,255,${(0.35 + Math.random() * 0.65) * alpha})`;
        g.fillRect(Math.random() * 256, Math.random() * 256, 5 + Math.random() * 11, 1.6);
      }
      const t = new THREE.CanvasTexture(c);
      t.wrapS = THREE.RepeatWrapping;
      t.wrapT = THREE.RepeatWrapping;
      return t;
    };
    this.shimmerA = fleckCanvas(150, 1);
    this.shimmerA.repeat.set(5, 9);
    this.shimmerB = fleckCanvas(110, 0.8);
    this.shimmerB.repeat.set(3.2, 6.5);
    const mkShimmer = (tex: THREE.CanvasTexture, opacity: number, y: number): void => {
      const geo = new THREE.PlaneGeometry(38, 420, 1, 16);
      geo.rotateX(-Math.PI / 2);
      const mat = worldMaterial(
        new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity, depthWrite: false }),
      );
      const m = new THREE.Mesh(geo, mat);
      m.position.set(30, y, 120);
      scene.add(m);
      this.waterFx.push({ mat, base: opacity }); // fades out when the water does
    };
    mkShimmer(this.shimmerA, 0.22, -0.42);
    mkShimmer(this.shimmerB, 0.15, -0.4);

    // The sun's glint road on the water
    const gc = document.createElement('canvas');
    gc.width = 128;
    gc.height = 256;
    const gg = gc.getContext('2d')!;
    const grad = gg.createLinearGradient(0, 0, 128, 0);
    grad.addColorStop(0, 'rgba(255,243,196,0)');
    grad.addColorStop(0.5, 'rgba(255,243,196,0.9)');
    grad.addColorStop(1, 'rgba(255,243,196,0)');
    gg.fillStyle = grad;
    gg.fillRect(0, 0, 128, 256);
    for (let i = 0; i < 46; i++) {
      gg.clearRect(0, Math.random() * 256, 128, 1 + Math.random() * 3);
    }
    const glintTex = new THREE.CanvasTexture(gc);
    this.glintMat = worldMaterial(
      new THREE.MeshBasicMaterial({
        map: glintTex,
        transparent: true,
        opacity: 0.42,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    const glintGeo = new THREE.PlaneGeometry(13, 150, 1, 16);
    glintGeo.rotateX(-Math.PI / 2);
    const glint = new THREE.Mesh(glintGeo, this.glintMat);
    glint.position.set(56, -0.38, 100);
    scene.add(glint);
    this.waterFx.push({ mat: this.glintMat, base: 0.42 });
  }

  private buildMountains(scene: THREE.Scene): void {
    // Distant loma silhouettes inland. Static: they read as infinitely far.
    const mat = toonMaterial(PALETTE.mountainHaze);
    const ridge = (x: number, z: number, w: number, h: number, ry: number): void => {
      const m = new THREE.Mesh(new THREE.ConeGeometry(w, h, 4), mat);
      m.position.set(x, h / 2 - 1, z);
      m.rotation.y = ry;
      m.scale.z = 0.55;
      scene.add(m);
    };
    ridge(-62, 40, 42, 15, 0.4);
    ridge(-58, 95, 55, 21, 0.9);
    ridge(-70, 150, 48, 17, 0.2);
    ridge(-85, 215, 70, 26, 0.7);
    ridge(-95, 300, 80, 24, 0.5);
  }

  // One road texture per tramo, all built at boot: warm asphalt on the
  // Malecon, cobble-toned stone in the Zona, faded patchy blacktop with dirt
  // shoulders out in el campo. Chunks swap materials as they recycle, and all
  // three share one shader program, so the swap costs nothing.
  private roadTexture(
    renderer: THREE.WebGLRenderer,
    base: number,
    shoulder: number,
    tramo: Tramo,
  ): THREE.CanvasTexture {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 1024;
    const g = c.getContext('2d')!;
    const pmx = c.width / ROAD.fullWidth;
    const pmy = c.height / CHUNK_LEN;

    g.fillStyle = hex(base);
    g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = hex(shoulder);
    g.fillRect(0, 0, CONFIG.shoulderWidth * pmx, c.height);
    g.fillRect(c.width - CONFIG.shoulderWidth * pmx, 0, CONFIG.shoulderWidth * pmx, c.height);

    for (let i = 0; i < 900; i++) {
      g.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.045)' : 'rgba(0,0,0,0.06)';
      const s = 1 + Math.random() * 2.2;
      g.fillRect(Math.random() * c.width, Math.random() * c.height, s, s);
    }

    if (tramo === 'zona') {
      // cobbles: offset courses of faintly lighter and darker sets
      const cw = 0.62 * pmx;
      const ch = 0.5 * pmy;
      for (let row = 0; row < CHUNK_LEN / 0.5; row++) {
        const off = row % 2 ? cw / 2 : 0;
        for (let col = -1; col < ROAD.fullWidth / 0.62 + 1; col++) {
          g.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.08)';
          g.fillRect(col * cw + off + 1, row * ch + 1, cw - 2, ch - 2);
        }
      }
    } else if (tramo === 'campo') {
      // patched blacktop: big faded blotches and a dusting near the shoulders
      for (let i = 0; i < 26; i++) {
        g.fillStyle = Math.random() < 0.5 ? 'rgba(217,199,167,0.08)' : 'rgba(0,0,0,0.1)';
        const w = (1 + Math.random() * 3) * pmx;
        const h = (1.5 + Math.random() * 4) * pmy;
        g.fillRect(Math.random() * c.width, Math.random() * c.height, w, h);
      }
      g.fillStyle = 'rgba(217,199,167,0.22)';
      g.fillRect(0, 0, CONFIG.shoulderWidth * pmx * 1.25, c.height);
      g.fillRect(c.width - CONFIG.shoulderWidth * pmx * 1.25, 0, CONFIG.shoulderWidth * pmx * 1.25, c.height);
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
    return tex;
  }

  private buildRoad(scene: THREE.Scene, renderer: THREE.WebGLRenderer): void {
    this.roadMats = {
      malecon: worldMaterial(
        new THREE.MeshToonMaterial({
          map: this.roadTexture(renderer, PALETTE.asphalt, PALETTE.asphaltShoulder, 'malecon'),
          gradientMap: getGradientMap(),
        }),
      ),
      zona: worldMaterial(
        new THREE.MeshToonMaterial({
          map: this.roadTexture(renderer, 0x45414a, 0x4f4a50, 'zona'),
          gradientMap: getGradientMap(),
        }),
      ),
      campo: worldMaterial(
        new THREE.MeshToonMaterial({
          map: this.roadTexture(renderer, 0x4a443c, 0x5a4f42, 'campo'),
          gradientMap: getGradientMap(),
        }),
      ),
    };
    const geo = new THREE.PlaneGeometry(ROAD.fullWidth, CHUNK_LEN, 1, 8);
    geo.rotateX(-Math.PI / 2);
    for (let i = 0; i < CHUNK_COUNT; i++) {
      const chunk = new THREE.Mesh(geo, this.roadMats.malecon);
      chunk.position.z = -CHUNK_LEN + i * CHUNK_LEN;
      chunk.receiveShadow = true;
      scene.add(chunk);
      this.chunks.push(chunk);
    }
  }

  private buildTape(scene: THREE.Scene): void {
    this.tape = new THREE.Group();
    const postGeo = new THREE.CylinderGeometry(0.07, 0.07, 1.5, 8);
    for (const sx of [-1, 1]) {
      const post = new THREE.Mesh(postGeo, toonMaterial(PALETTE.colmadoRed));
      post.position.set(sx * 7.3, 0.75, 0);
      this.tape.add(post);
    }
    const c = document.createElement('canvas');
    c.width = 1024;
    c.height = 48;
    const g = c.getContext('2d')!;
    // Finish-line tape, not a flag: white with gold edges (blue top + red
    // bottom made it a horizontal tricolor at speed).
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, 1024, 48);
    g.fillStyle = hex(PALETTE.centerLine);
    g.fillRect(0, 0, 1024, 7);
    g.fillRect(0, 41, 1024, 7);
    g.fillStyle = hex(PALETTE.flagRed);
    g.font = 'bold 30px sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (const x of [170, 512, 854]) g.fillText('TU RÉCORD', x, 26);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const ribbon = new THREE.Mesh(
      new THREE.PlaneGeometry(14.6, 0.46),
      worldMaterial(new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide })),
    );
    ribbon.position.y = 1.12;
    ribbon.rotation.y = Math.PI; // face the approaching player
    this.tape.add(ribbon);
    this.tape.visible = false;
    scene.add(this.tape);
  }

  // One InstancedMesh per flag color: three draw calls instead of 46, and the
  // burst lands exactly when the ¡NUEVO RÉCORD! banner does, so this is the
  // worst possible moment to spike.
  private buildConfetti(scene: THREE.Scene): void {
    const geo = new THREE.PlaneGeometry(0.09, 0.14);
    const colors = [PALETTE.flagBlue, PALETTE.flagRed, PALETTE.flagWhite];
    const per = Math.ceil(CONFETTI_COUNT / colors.length);
    for (const color of colors) {
      const im = new THREE.InstancedMesh(
        geo,
        worldMaterial(new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide })),
        per,
      );
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.frustumCulled = false;
      im.visible = false;
      scene.add(im);
      this.confettiMeshes.push(im);
    }
    for (let i = 0; i < CONFETTI_COUNT; i++) {
      this.confetti.push({
        im: this.confettiMeshes[i % colors.length],
        idx: Math.floor(i / colors.length),
        x: 0, y: 0, z: 0, rotX: 0, rotY: 0,
        vx: 0, vy: 0, vz: 0, rx: 0, ry: 0, life: 0,
      });
    }
  }

  private buildObelisco(scene: THREE.Scene, atlas: Atlas): void {
    this.obelisco = new THREE.Group();
    const cream = toonMaterial(PALETTE.obeliscoCream);
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, y: number, ry = 0): THREE.Mesh => {
      const m = new THREE.Mesh(geo, mat);
      m.position.y = y;
      m.rotation.y = ry;
      this.obelisco.add(m);
      return m;
    };
    add(new THREE.BoxGeometry(3.6, 0.6, 3.6), cream, 0.3);
    add(new THREE.BoxGeometry(2.7, 0.7, 2.7), cream, 0.9);
    const shaft = add(new THREE.CylinderGeometry(0.52, 1.05, 15, 4), cream, 8.6, Math.PI / 4);
    shaft.castShadow = true;
    add(new THREE.ConeGeometry(0.74, 1.3, 4), cream, 16.7, Math.PI / 4);
    // Mural-colored bands, deliberately NOT blue/white/red: three stacked
    // flag stripes wrapped around a shaft read as the French flag, which is
    // the one thing this game must never do. The real Obelisco wears the
    // Mirabal mural, so the bands borrow its warm palette instead.
    const bandColors = [PALETTE.colmadoTeal, 0xf4c430, 0xd77a61];
    bandColors.forEach((color, i) => {
      add(new THREE.BoxGeometry(2.0 - i * 0.06, 0.55, 2.0 - i * 0.06), toonMaterial(color), 3.4 + i * 0.62, Math.PI / 4);
    });
    // And la bandera itself, correct with el escudo, as a banner facing the
    // road the player rides on.
    const banner = new THREE.Mesh(
      new THREE.PlaneGeometry(1.76, 1.1),
      worldMaterial(new THREE.MeshBasicMaterial({ map: atlas.tex, side: THREE.DoubleSide })),
    );
    const fr = atlas.rects.flag;
    const uv = banner.geometry.attributes.uv as THREE.BufferAttribute;
    uv.setXY(0, fr.u0, fr.v1);
    uv.setXY(1, fr.u1, fr.v1);
    uv.setXY(2, fr.u0, fr.v0);
    uv.setXY(3, fr.u1, fr.v0);
    banner.position.set(-1.15, 5.2, 0);
    banner.rotation.y = -Math.PI / 2; // face the road
    this.obelisco.add(banner);
    this.obelisco.position.set(10.4, 0, 0);
    this.obelisco.visible = false;
    scene.add(this.obelisco);
  }

  updateTape(remain: number | null): void {
    if (remain === null || remain > 165) {
      this.tape.visible = false;
      return;
    }
    this.tape.visible = true;
    this.tape.position.z = remain;
  }

  burstTape(): void {
    const z = this.tape.visible ? this.tape.position.z : 2;
    for (const f of this.confetti) {
      f.life = 1.5 + Math.random() * 0.6;
      f.x = (Math.random() - 0.5) * 14;
      f.y = 1 + Math.random() * 1.6;
      f.z = z;
      f.vx = (Math.random() - 0.5) * 3;
      f.vy = 2.5 + Math.random() * 3.5;
      f.vz = -(1 + Math.random() * 3);
      f.rx = (Math.random() - 0.5) * 12;
      f.ry = (Math.random() - 0.5) * 12;
      f.rotX = Math.random() * 3;
      f.rotY = Math.random() * 3;
    }
    for (const im of this.confettiMeshes) im.visible = true;
    this.tape.visible = false;
  }

  // Test probe: confetti is instanced, so "is it on screen" is not something a
  // draw-call count can answer any more.
  get confettiState(): {
    visible: boolean;
    live: number;
    sampleScale: number;
    samplePos: number[];
    logicPos: number[];
  } {
    let live = 0;
    for (const f of this.confetti) if (f.life > 0) live++;
    const m = new THREE.Matrix4();
    this.confettiMeshes[0].getMatrixAt(0, m);
    const p = new THREE.Vector3().setFromMatrixPosition(m);
    const f0 = this.confetti[0];
    return {
      visible: this.confettiMeshes[0].visible,
      live,
      sampleScale: +new THREE.Vector3().setFromMatrixScale(m).x.toFixed(2),
      samplePos: [+p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2)],
      logicPos: [+f0.x.toFixed(2), +f0.y.toFixed(2), +f0.z.toFixed(2)],
    };
  }

  debugViralata(): void {
    this.viralata.trigger();
  }

  // One Obelisco per national lap, always the same distance into the Malecon
  // stretch. Computed from the odometer rather than stepped forward, so it
  // cannot drift, double up inside one Malecon, or be left behind when the
  // world has already run past it.
  private scheduleObelisco(): void {
    const lap = CONFIG.tramoLengthM * TRAMO_ORDER.length;
    const at = Math.floor(this.D / lap) * lap + CONFIG.obeliscoOffsetM;
    this.nextObeliscoAt = at > this.D ? at : at + lap;
  }

  // Test probe: which stretch of world each scenery belt covers and what it
  // was dressed as, so a border crossing can be measured instead of eyeballed.
  get beltState(): Array<{ from: number; to: number; tramo: Tramo }> {
    return this.belts
      .map((b) => ({
        from: +(this.D + b.group.position.z).toFixed(0),
        to: +(this.D + b.group.position.z + CONFIG.beltLen).toFixed(0),
        tramo: b.tramo,
      }))
      .sort((a, b) => a.from - b.from);
  }

  // Test probe: where the obelisco is, so screenshots can frame it.
  get obeliscoState(): { visible: boolean; z: number } {
    return { visible: this.obelisco.visible, z: +this.obelisco.position.z.toFixed(1) };
  }

  step(ds: number, dt: number): void {
    this.D += ds;
    this.t += dt;
    CURVE_U.dist.value = this.D;
    CURVE_U.off.value = curveOffset(this.D);
    CURVE_U.slope.value = curveSlope(this.D);

    // Which tramo is under the wheels; announce the border crossings
    const tHere = tramoFor(this.D);
    if (tHere !== this.tramoNow) {
      this.tramoNow = tHere;
      this.onTramoChange?.(tHere);
    }

    // El campo is inland: the sea drains to farmland over about a second and
    // a half, and every sparkle on the water goes with it. This is the half
    // of the screen the player is actually looking at, so it is what makes a
    // border crossing register at all.
    const wantLand = tHere === 'campo' ? 1 : 0;
    if (this.landBlend !== wantLand) {
      const k = Math.min(1, dt / 1.5);
      this.landBlend += (wantLand - this.landBlend) * (k * 6);
      if (Math.abs(this.landBlend - wantLand) < 0.004) this.landBlend = wantLand;
      for (const s of this.seaMats) {
        s.mat.color.copy(s.sea).lerp(FIELD_COLOR, this.landBlend);
      }
      for (const w of this.waterFx) {
        w.mat.opacity = w.base * (1 - this.landBlend);
        w.mat.visible = w.mat.opacity > 0.01;
      }
    }

    for (let i = 0; i < this.chunks.length; i++) {
      const chunk = this.chunks[i];
      chunk.position.z -= ds;
      if (chunk.position.z < RECYCLE_Z) {
        chunk.position.z += CHUNK_COUNT * CHUNK_LEN;
        // dress the recycled chunk for the tramo it will sit in
        chunk.material = this.roadMats[tramoFor(this.D + chunk.position.z)];
      }
    }

    for (const belt of this.belts) {
      belt.group.position.z -= ds;
      if (belt.group.position.z < -(CONFIG.beltLen + 20)) {
        belt.group.position.z += CONFIG.beltLen * BELT_COUNT;
        belt.fill(tramoFor(this.D + belt.group.position.z + CONFIG.beltLen / 2));
      }
      // The belts keep frustumCulled off, because a manual bounding sphere
      // would have to be inflated for the bend field. One cheap z test still
      // drops the whole belt that is already behind the camera: the bend
      // never displaces forward, only laterally, so this cannot pop.
      belt.group.visible = belt.group.position.z + CONFIG.beltLen > -12;
    }

    // El Obelisco, every ~800 m, but it is a Malecon landmark: skip the
    // milestones that would land it in the Zona or out in el campo
    if (!this.obelisco.visible && this.nextObeliscoAt - this.D < 190) {
      this.obelisco.visible = true;
      this.obeliscoPassed = false;
      this.obelisco.position.z = this.nextObeliscoAt - this.D;
    }
    if (this.obelisco.visible) {
      this.obelisco.position.z -= ds;
      if (!this.obeliscoPassed && this.obelisco.position.z < 2) {
        this.obeliscoPassed = true;
        this.onObeliscoPass?.();
      }
      if (this.obelisco.position.z < -35) {
        this.obelisco.visible = false;
        this.scheduleObelisco();
      }
    }

    this.viralata.update(ds, dt);
    for (const k of this.chichiguas) k.update(ds, dt);
    for (const p of this.pelicans) p.update(ds, dt);
    const campoNow = this.tramoNow === 'campo';
    for (const gal of this.gallinas) gal.update(ds, dt, campoNow);

    // Sea life
    this.shimmerA.offset.y = (this.shimmerA.offset.y + dt * 0.05) % 1;
    this.shimmerB.offset.y = (this.shimmerB.offset.y - dt * 0.033 + 1) % 1;
    this.shimmerA.offset.x = (this.shimmerA.offset.x + dt * 0.01) % 1;
    this.glintMat.opacity = 0.38 + Math.sin(this.t * 1.9) * 0.1;

    let anyConfetti = false;
    for (const f of this.confetti) {
      if (f.life <= 0) continue;
      f.life -= dt;
      f.vy -= 6 * dt;
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      f.z += f.vz * dt - ds;
      f.rotX += f.rx * dt;
      f.rotY += f.ry * dt;
      if (f.life <= 0 || f.y < -0.2) {
        f.life = 0;
        _dummy.position.set(0, -999, 0); // parked far below, scale 0 is enough
        _dummy.rotation.set(0, 0, 0);
        _dummy.scale.set(0, 0, 0);
      } else {
        anyConfetti = true;
        _dummy.position.set(f.x, f.y, f.z);
        _dummy.rotation.set(f.rotX, f.rotY, 0);
        _dummy.scale.set(1, 1, 1);
      }
      _dummy.updateMatrix();
      f.im.setMatrixAt(f.idx, _dummy.matrix);
      f.im.instanceMatrix.needsUpdate = true;
    }
    if (!anyConfetti && this.confettiMeshes[0].visible) {
      for (const im of this.confettiMeshes) im.visible = false;
    }
  }
}
