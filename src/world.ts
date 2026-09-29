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
import { tramoFor, nextObeliscoAfter, type Tramo } from './tour';
import { drawDominicanFlag, FLAG_ASPECT } from './flag';

const CHUNK_LEN = 30;
const CHUNK_COUNT = 7;
const ROAD_SLICES = 5; // 30 m chunk / 6 m lane-dash period
const RECYCLE_Z = -35;
const CONFETTI_COUNT = 150;
const TAPE_POST_X = 8.7; // the arch stands on the curbs, clear of every lane

// The bundled display font (Lilita One, vendored through @fontsource) letters
// every canvas sign in the world. Canvas text drawn before the face has
// loaded silently falls back to a system font, so anything that draws text
// draws once now and again when the font is in.
export const SIGN_FONT = "'Lilita One', 'Arial Black', sans-serif";
const fontRedraws: Array<() => void> = [];
let signFontReady = false;
function whenSignFontReady(redraw: () => void): void {
  if (!signFontReady) fontRedraws.push(redraw);
}
if (typeof document !== 'undefined' && document.fonts) {
  const done = (): void => {
    signFontReady = true;
    for (const f of fontRedraws.splice(0)) f();
  };
  document.fonts.load("48px 'Lilita One'").then(done, done);
}

// La Cinta's cloth: the ribbon flutters (harder near the tape) and, once
// burst, each half swings down from its post to hang and lie on the road.
const TAPE_CLOTH_PARS = /* glsl */ `
uniform float uTapeTime;
uniform float uFlutter;
uniform float uBreak;
attribute float aWave;
attribute float aPart;
`;
const TAPE_CLOTH_CHUNK = /* glsl */ `
#include <begin_vertex>
float eccPh = uTapeTime * ( aPart > 0.5 ? 9.0 : 3.0 ) + position.x * 0.9;
transformed.z += sin( eccPh ) * 0.13 * uFlutter * aWave;
transformed.y += sin( eccPh * 0.8 + 1.3 ) * 0.035 * uFlutter * aWave;
if ( aPart > 0.5 && uBreak > 0.0 ) {
  float side = position.x >= 0.0 ? 1.0 : -1.0;
  float rel = abs( position.x ) - ${TAPE_POST_X.toFixed(2)};
  float th = uBreak * 1.45;
  transformed.x = side * ( ${TAPE_POST_X.toFixed(2)} + rel * cos( th ) );
  transformed.y = max( 0.03, transformed.y + rel * sin( th ) );
}
`;
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
// of THIS RUN's distance (tour.ts), so belts and road chunks can each ask
// "what will the world be when the player reaches me" and dress to match.
// ---------------------------------------------------------------------------

export type { Tramo } from './tour';
// What the sea becomes out in el campo: sun-dried pasture, not sea green.
const FIELD_COLOR = new THREE.Color(0x9cae54);

// Each tramo gets its own light. The buildings already change at the border;
// this makes the AIR change with them: the Malecon's peach afternoon, a
// rosier closer haze inside the colonial canyon, dusty gold out in el campo.
// All lerped in step(), so crossing a border changes the weather, never pops.
interface Atmo {
  fog: THREE.Color;
  fogFar: number;
  sun: THREE.Color;
  sunI: number;
  hemiSky: THREE.Color;
  hemiGround: THREE.Color;
  rim: THREE.Color; // premultiplied by CONFIG.rimStrength
}

// Intensities are authored in the old units and scaled by CONFIG.lightExposure
// here, so one knob moves the whole scene and the per-tramo lerp in step()
// never pulls a light back to its unscaled value. The sun colors stay close to
// white on purpose: a saturated orange key light dragged every palette hex
// toward brown (pinks went salmon, the teal shirt went olive). The golden
// hour lives in the sky, the fog and the rim instead.
function atmo(tramo: Tramo, fog: number, sun: number, sunI: number, hemiSky: number, hemiGround: number, rim: number): Atmo {
  return {
    fog: new THREE.Color(fog),
    fogFar: CONFIG.tramoFogFar[tramo],
    sun: new THREE.Color(sun),
    sunI: sunI * CONFIG.lightExposure,
    hemiSky: new THREE.Color(hemiSky),
    hemiGround: new THREE.Color(hemiGround),
    rim: new THREE.Color(rim).multiplyScalar(CONFIG.rimStrength),
  };
}

const ATMOS: Record<Tramo, Atmo> = {
  malecon: atmo('malecon', PALETTE.skyHorizon, 0xffecd0, 1.7, 0xbfe3ef, 0xe8c39a, PALETTE.skyHorizon),
  zona: atmo('zona', 0xf7c6ab, 0xffe3c6, 1.62, 0xb7d0e6, 0xe0b691, 0xffc79f),
  campo: atmo('campo', 0xeed7a4, 0xfff0d6, 1.78, 0xc9e2da, 0xdcc18c, 0xffe3ae),
};
const HEMI_I = 0.85 * CONFIG.lightExposure;

// Where the low sun sits, as a direction from the rider: a little left of
// straight ahead and a few degrees up, so it hangs over the sea inside a
// portrait frame with either camera height. Celestial, so the dome draws it
// at infinity and nothing on the road parallaxes against it.
const SUN_DIR = new THREE.Vector3(0.176, 0.07, 0.985).normalize();
// The water's reflection of that sun, on the ground plane, runs out from the
// rider along the same bearing.
const SUN_BEARING = Math.atan2(SUN_DIR.x, SUN_DIR.z);

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

// Golden-hour rim light: every toon surface catches a sliver of the low sun
// on its silhouette, which is most of what separates "colored boxes" from
// "low-poly at sunset". One uniform color, so the tramo mood can tint it.
const RIM_U = { value: new THREE.Color(PALETTE.skyHorizon).multiplyScalar(CONFIG.rimStrength) };

const RIM_CHUNK = `
vec3 eccViewDir = normalize( vViewPosition );
float eccRim = pow( 1.0 - saturate( dot( normal, eccViewDir ) ), 3.0 );
eccRim *= smoothstep( 0.0, 0.35, 1.0 - abs( normal.y ) );
vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance + uEccRim * eccRim;
`;

function rimBendPatch(shader: {
  uniforms: Record<string, unknown>;
  vertexShader: string;
  fragmentShader: string;
}): void {
  bendPatch(shader);
  shader.uniforms.uEccRim = RIM_U;
  shader.fragmentShader =
    'uniform vec3 uEccRim;\n' +
    shader.fragmentShader.replace(
      'vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;',
      RIM_CHUNK,
    );
}

// Every world-space material goes through this so the whole Malecon bends as
// one. Toon materials additionally get the rim light; unlit materials (glint,
// kites, banners) just bend. Celestial things (sky dome, clouds, the mountain
// backdrop) are NOT wrapped.
export function worldMaterial<T extends THREE.Material>(m: T): T {
  if ((m as unknown as THREE.MeshToonMaterial).isMeshToonMaterial) {
    m.onBeforeCompile = rimBendPatch as unknown as (shader: unknown) => void;
    m.customProgramCacheKey = () => 'eccbendrim';
  } else {
    m.onBeforeCompile = bendPatch as unknown as (shader: unknown) => void;
    m.customProgramCacheKey = () => 'eccbend';
  }
  return m;
}

type ShaderPatch = (shader: THREE.WebGLProgramParametersWithUniforms) => void;

// Chain one more shader edit onto a material that already went through
// worldMaterial. The key keeps each variant in its own cached program.
function extendPatch<T extends THREE.Material>(m: T, key: string, patch: ShaderPatch): T {
  const base = m.onBeforeCompile.bind(m);
  const baseKey = m.customProgramCacheKey();
  m.onBeforeCompile = (shader, renderer) => {
    base(shader, renderer);
    patch(shader);
  };
  m.customProgramCacheKey = () => `${baseKey}-${key}`;
  return m;
}

// A per-material fog reach. Some things belong to a longer view than the
// road: the open sea should stay turquoise out to the horizon, and La Cinta's
// arch should rise out of the haze instead of popping in. Same fog color and
// near distance, only the far end moves.
function farFog<T extends THREE.Material>(m: T, far: number): T {
  return extendPatch(m, `fog${far}`, (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <fog_fragment>',
      `#ifdef USE_FOG
        float fogFactor = smoothstep( fogNear, ${far.toFixed(1)}, vFogDepth );
        gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
      #endif`,
    );
  });
}

// ---------------------------------------------------------------------------
// Shared materials and texture helpers
// ---------------------------------------------------------------------------

let gradientMap: THREE.DataTexture | null = null;
const toonCache = new Map<number, THREE.MeshToonMaterial>();

export function getGradientMap(): THREE.DataTexture {
  if (!gradientMap) {
    // FEEL: the shading ramp for the whole world. A deeper first step is
    // most of the difference between flat color and sculpted form.
    const data = new Uint8Array([88, 182, 255]);
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

// A one-line text texture. Pass a font built on SIGN_FONT to letter it in the
// game's display face; it redraws itself once that face has loaded.
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
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const draw = (): void => {
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
    g.fillStyle = fg;
    g.font = font;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, w / 2, h / 2 + 1);
    tex.needsUpdate = true;
  };
  draw();
  whenSignFontReady(draw);
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

// Bake a soft vertical gradient into merged vertex colors: darker at the
// feet, full color up top. Fake ambient occlusion, and it survives instance
// tinting because tints multiply vertex colors.
function gradeAO(geo: THREE.BufferGeometry, h: number, floor = 0.78): THREE.BufferGeometry {
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const col = geo.getAttribute('color') as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const k = floor + (1 - floor) * Math.min(1, Math.max(0, pos.getY(i) / h));
    col.setXYZ(i, col.getX(i) * k, col.getY(i) * k, col.getZ(i) * k);
  }
  return geo;
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

// A flat triangle with a face on each side (separate vertices, so each face
// keeps its own flat normal), shaped to merge with the box parts (indexed,
// with normals and uvs).
function sailGeometry(a: [number, number], b: [number, number], c: [number, number]): THREE.BufferGeometry {
  const t = 0.03;
  const g = new THREE.BufferGeometry();
  g.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(
      [a[0], a[1], t, b[0], b[1], t, c[0], c[1], t, a[0], a[1], -t, b[0], b[1], -t, c[0], c[1], -t],
      3,
    ),
  );
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Array(12).fill(0), 2));
  // wind both faces outward whatever the corner order was
  const cross = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  g.setIndex(cross > 0 ? [0, 1, 2, 3, 5, 4] : [0, 2, 1, 3, 4, 5]);
  g.computeVertexNormals();
  return g;
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

// In-world signage is hand-painted Dominican street lettering: it stays
// Spanish in EN mode, like the colmado names. Every business is fictional.
const COLMADO_NAMES = ['LA FE', 'EL PROGRESO', 'DOÑA TATICA'];
const STOREFRONTS: Array<{ top: string; name: string; bg: string; ink: string; big: string; edge: string; cross?: boolean }> = [
  { top: 'BANCA DE LOTERÍA', name: 'LA SUERTE', bg: '#f4c430', ink: '#002d62', big: '#ce1126', edge: '#002d62' },
  { top: 'SE VENDE', name: 'EMPANADA', bg: '#fffaf0', ink: '#ce1126', big: '#002d62', edge: '#e63946' },
  { top: 'FARMACIA', name: 'SAN JOSÉ', bg: '#ffffff', ink: '#1b7a3a', big: '#1b7a3a', edge: '#1b7a3a', cross: true },
  { top: 'REPUESTOS', name: 'EL PRIMO', bg: '#1e3a66', ink: '#ffffff', big: '#f4c430', edge: '#f4c430' },
];
// Awnings in the colmado and shop colors; blue, white and red never touch.
const AWNINGS = ['#0f7a3d', hex(PALETTE.colmadoRed), '#2b7bb9', '#f4c430'];
// Flat swatches for anything painted from the atlas without its own art:
// poles, pennants, laundry.
const SWATCHES: Record<string, string> = {
  white: '#ffffff',
  gray: '#8d8d8d',
  red: '#e63946',
  yellow: '#f4c430',
  teal: '#2a9d8f',
  lilac: '#cdb4db',
  peach: '#ffd3b6',
  sky: '#b3d9ff',
  wood: '#6e5d4e',
  wire: '#1f1b19',
};
// Pasacalles: the cloth banners strung across Dominican streets. Fictional,
// no brands, no politicians.
const PASACALLES = [
  '¡FELICIDADES, PROMOCIÓN 2026!',
  'SE VENDE ESTE SOLAR',
  'FIESTAS PATRONALES: ¡TODOS INVITADOS!',
  '¡DALE, QUE VAMO’ TARDE!',
];

function buildAtlas(): Atlas {
  const W = 1024;
  const H = 512;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  const rects: Record<string, AtlasRect> = {};
  const put = (name: string, x: number, y: number, w: number, h: number): void => {
    rects[name] = { u0: x / W, v0: 1 - (y + h) / H, u1: (x + w) / W, v1: 1 - y / H };
  };
  const two = (x: number, y: number, top: string, name: string, ink: string, big: string): void => {
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = ink;
    g.font = `15px ${SIGN_FONT}`;
    g.fillText(top, x + 150, y + 14);
    g.fillStyle = big;
    g.font = `26px ${SIGN_FONT}`;
    g.fillText(name, x + 150, y + 35);
  };

  const draw = (): void => {
    g.clearRect(0, 0, W, H);
    COLMADO_NAMES.forEach((name, i) => {
      const x = 8;
      const y = 8 + i * 60;
      g.fillStyle = hex(PALETTE.sunGlow);
      g.fillRect(x, y, 300, 52);
      g.strokeStyle = hex(PALETTE.colmadoRed);
      g.lineWidth = 5;
      g.strokeRect(x + 3, y + 3, 294, 46);
      two(x, y, 'COLMADO', name, hex(PALETTE.flagBlue), hex(PALETTE.colmadoRed));
      put(`sign${i}`, x, y, 300, 52);
    });
    STOREFRONTS.forEach((s, i) => {
      const x = 320;
      const y = 8 + i * 60;
      g.fillStyle = s.bg;
      g.fillRect(x, y, 300, 52);
      g.strokeStyle = s.edge;
      g.lineWidth = 4;
      g.strokeRect(x + 3, y + 3, 294, 46);
      if (s.cross) {
        g.fillStyle = s.big;
        g.fillRect(x + 22, y + 14, 8, 24);
        g.fillRect(x + 14, y + 22, 24, 8);
        g.fillRect(x + 262, y + 14, 8, 24);
        g.fillRect(x + 254, y + 22, 24, 8);
      }
      two(x, y, s.top, s.name, s.ink, s.big);
      put(`sign${COLMADO_NAMES.length + i}`, x, y, 300, 52);
    });

    AWNINGS.forEach((color, i) => {
      const x = i < 2 ? 8 : 320;
      const y = i < 2 ? 196 + i * 56 : 256 + (i - 2) * 56;
      g.fillStyle = '#ffffff';
      g.fillRect(x, y, 300, 48);
      g.fillStyle = color;
      for (let k = 0; k < 10; k += 2) g.fillRect(x + k * 30, y, 30, 48);
      put(`awning${i}`, x, y, 300, 48);
    });

    g.fillStyle = '#2e7d32';
    g.fillRect(8, 310, 300, 44);
    g.strokeStyle = '#ffffff';
    g.lineWidth = 3;
    g.strokeRect(11, 313, 294, 38);
    g.fillStyle = '#ffffff';
    g.font = `22px ${SIGN_FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('Av. George Washington', 158, 333);
    put('street', 8, 310, 300, 44);

    // La bandera, escudo and all (see flag.ts for why the escudo is not optional)
    const fw = 160;
    drawDominicanFlag(g, 640, 8, fw);
    put('flag', 640, 8, fw, fw / FLAG_ASPECT);

    Object.entries(SWATCHES).forEach(([name, color], i) => {
      const x = 820 + (i % 8) * 24;
      const y = 8 + Math.floor(i / 8) * 24;
      g.fillStyle = color;
      g.fillRect(x, y, 24, 24);
      put(name, x + 4, y + 4, 16, 16);
    });

    PASACALLES.forEach((text, i) => {
      const x = 640;
      const y = 120 + i * 54;
      g.fillStyle = i % 2 ? '#fffaf0' : '#f4c430';
      g.fillRect(x, y, 376, 48);
      g.fillStyle = i % 2 ? '#e63946' : '#2a9d8f';
      g.fillRect(x, y, 376, 5);
      g.fillRect(x, y + 43, 376, 5);
      g.fillStyle = i % 2 ? '#002d62' : '#ce1126';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      let size = 28;
      g.font = `${size}px ${SIGN_FONT}`;
      const tw = g.measureText(text).width;
      if (tw > 350) {
        size = Math.floor((size * 350) / tw);
        g.font = `${size}px ${SIGN_FONT}`;
      }
      g.fillText(text, x + 188, y + 25);
      put(`pasacalle${i}`, x, y, 376, 48);
    });
  };
  draw();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  whenSignFontReady(() => {
    draw();
    tex.needsUpdate = true;
  });
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
  shopZ?: number; // one-storey fronts: where the door is, for a shop sign above it
}

function makeFacade(width: number, floors: number, cols: number, balcony: boolean): Sized {
  const parts: THREE.BufferGeometry[] = [];
  const depth = 7;
  const H = floors === 1 ? 4.4 : 7.8;
  cbox(parts, depth, H, width, 0, H / 2, 0, 0xffffff);
  cbox(parts, depth + 0.35, 0.4, width + 0.35, 0, H + 0.15, 0, TRIM);
  const fx = depth / 2 + 0.05;
  const span = width - 2.2;
  let doorZ = 0;
  for (let f = 0; f < floors; f++) {
    const wy = f === 0 ? 1.9 : 5.6;
    for (let i = 0; i < cols; i++) {
      const wz = -span / 2 + (span / (cols - 1)) * i;
      if (f === 0 && i === Math.floor(cols / 2)) {
        doorZ = wz;
        cbox(parts, 0.14, 2.3, 1.15, fx, 1.15, wz, 0x53616b); // la puerta
        cbox(parts, 0.2, 0.16, 1.45, fx, 2.4, wz, TRIM);
      } else {
        // Golden hour: a third of the windows are lit warm from inside
        cbox(parts, 0.12, 1.5, 0.95, fx, wy, wz, Math.random() < 0.33 ? 0xffc46b : WINDOW);
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
  // La azotea: every Santo Domingo roof has a tinaco, and half have an
  // antenna leaning at the sky. Small, cheap, and the most Dominican thing a
  // skyline can wear.
  const roofY = H + 0.35;
  const tz = (Math.random() - 0.5) * (width - 2.4);
  cgeo(parts, new THREE.CylinderGeometry(0.42, 0.42, 0.8, 10), 0x1e3a66, -1.2, roofY + 0.4, tz);
  cgeo(parts, new THREE.CylinderGeometry(0.46, 0.46, 0.08, 10), 0x2a2624, -1.2, roofY + 0.82, tz);
  if (Math.random() < 0.55) {
    const az = -(width / 2) + 1 + Math.random() * (width - 2);
    cbox(parts, 0.05, 2.2, 0.05, 1.4, roofY + 1.1, az, 0x2a2624); // mast
    cbox(parts, 1.1, 0.04, 0.04, 1.4, roofY + 2.05, az, 0x2a2624); // boom
    cbox(parts, 0.04, 0.04, 0.7, 1.4, roofY + 2.05, az, 0x2a2624);
    cbox(parts, 0.04, 0.04, 0.5, 1.75, roofY + 1.7, az, 0x2a2624);
  }
  return { geo: gradeAO(mergeGeometries(parts)!, H * 0.6), width, shopZ: floors === 1 ? doorZ : undefined };
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
  return { geo: gradeAO(mergeGeometries(parts)!, H * 0.6), width };
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
  return { geo: gradeAO(mergeGeometries(parts)!, H * 0.6), width };
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
  return { geo: gradeAO(mergeGeometries(parts)!, H * 0.7), width };
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

// Every shop front in a belt (colmados and storefronts alike) is one
// instanced sign + awning. The geometry is mapped to the first sign and
// awning in the atlas; each instance carries its own offsets to the sign and
// awning it shows (aSignOff, aAwnOff), and aSel says which part a vertex
// belongs to. One draw per belt for every sign on the street.
function makeSignSet(rects: Record<string, AtlasRect>): THREE.BufferGeometry {
  const depth = 6.5;
  const sign = quadUV(3.5, 0.75, rects.sign0);
  sign.rotateY(Math.PI / 2);
  sign.translate(depth / 2 + 0.08, 3.82, 0);
  const awning = quadUV(4.6, 1.25, rects.awning0);
  awning.rotateY(Math.PI / 2);
  awning.rotateZ(0.55);
  awning.translate(depth / 2 + 0.6, 2.62, 0);
  const sel = (g: THREE.BufferGeometry, s: number, a: number): THREE.BufferGeometry => {
    const n = g.getAttribute('position').count;
    const arr = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) {
      arr[i * 2] = s;
      arr[i * 2 + 1] = a;
    }
    g.setAttribute('aSel', new THREE.BufferAttribute(arr, 2));
    return g;
  };
  return mergeGeometries([sel(sign, 1, 0), sel(awning, 0, 1)])!;
}

const SIGN_VERT_PARS = /* glsl */ `
attribute vec2 aSel;
attribute vec2 aSignOff;
attribute vec2 aAwnOff;
`;

function signMaterial(tex: THREE.Texture): THREE.MeshBasicMaterial {
  return extendPatch(
    worldMaterial(new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide })),
    'signs',
    (shader) => {
      shader.vertexShader =
        SIGN_VERT_PARS +
        shader.vertexShader.replace(
          '#include <uv_vertex>',
          '#include <uv_vertex>\nvMapUv += aSel.x * aSignOff + aSel.y * aAwnOff;',
        );
    },
  );
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
  cbox(parts, 0.18, 0.46, 0.18, 0, 0.6, 0, 0xf6efdf);
  cbox(parts, 0.27, 0.08, 0.27, 0, 0.84, 0, 0xf6efdf);
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
  signSet: THREE.BufferGeometry;
  signMat: THREE.MeshBasicMaterial;
  rects: Record<string, AtlasRect>;
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
    signSet: makeSignSet(atlas.rects),
    signMat: signMaterial(atlas.tex),
    rects: atlas.rects,
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

// The dark gradient at the foot of a wall is what glues it to the street.
// One shared texture; each belt owns two strips and shows them per tramo.
let _stripMat: THREE.MeshBasicMaterial | null = null;
function stripMaterial(): THREE.MeshBasicMaterial {
  if (!_stripMat) {
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 8;
    const g = c.getContext('2d')!;
    const grad = g.createLinearGradient(0, 0, 64, 0);
    grad.addColorStop(0, 'rgba(30,20,14,0.34)');
    grad.addColorStop(1, 'rgba(30,20,14,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 8);
    const tex = new THREE.CanvasTexture(c);
    _stripMat = worldMaterial(
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }),
    );
  }
  return _stripMat;
}

const ZONA_TINTS = [0xf5e6c8, 0xe8b04b, 0xd77a61, 0xffffff, 0xa8c6a1, 0xf2d0a4];

const PASTELS = PALETTE.buildingPastels;
const COLMADO_TINTS = [PALETTE.colmadoTeal, PALETTE.colmadoRed, 0xf4c430, 0xffffff];
const SIGN_CAP = 8; // shop fronts per belt: two colmados and the storefronts
// banca: yellow, empanadas: red, farmacia: blue, repuestos: green
const STOREFRONT_AWNING = [3, 1, 2, 0];

const _dummy = new THREE.Object3D();
const _color = new THREE.Color();

class Belt {
  group = new THREE.Group();
  tramo: Tramo = 'malecon'; // what this belt was last dressed as (test probe)
  private facadeIMs: THREE.InstancedMesh[] = [];
  private colmadoIMs: THREE.InstancedMesh[] = [];
  private signIM: THREE.InstancedMesh;
  private signOff: THREE.InstancedBufferAttribute;
  private awnOff: THREE.InstancedBufferAttribute;
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
  private stripFar: THREE.Mesh;
  private stripSea: THREE.Mesh;
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
    const signGeo = assets.signSet.clone();
    this.signOff = new THREE.InstancedBufferAttribute(new Float32Array(SIGN_CAP * 2), 2);
    this.awnOff = new THREE.InstancedBufferAttribute(new Float32Array(SIGN_CAP * 2), 2);
    this.signOff.setUsage(THREE.DynamicDrawUsage);
    this.awnOff.setUsage(THREE.DynamicDrawUsage);
    signGeo.setAttribute('aSignOff', this.signOff);
    signGeo.setAttribute('aAwnOff', this.awnOff);
    this.signIM = im(signGeo, assets.signMat, SIGN_CAP);
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
    // Ground-contact shading at the foot of each side's wall: the texture is
    // dark at u=0, so the dark edge lands on whichever x the wall stands at.
    const mkStrip = (xWall: number, xRoad: number): THREE.Mesh => {
      const w = Math.abs(xRoad - xWall);
      const g = new THREE.PlaneGeometry(w, CONFIG.beltLen, 1, 1);
      g.rotateX(-Math.PI / 2);
      if (xWall > xRoad) {
        // mirror U so the dark edge sits at the wall on the sea side too
        const uv = g.getAttribute('uv') as THREE.BufferAttribute;
        for (let i = 0; i < uv.count; i++) uv.setX(i, 1 - uv.getX(i));
      }
      g.translate((xWall + xRoad) / 2, 0.035, CONFIG.beltLen / 2);
      const m = new THREE.Mesh(g, stripMaterial());
      this.group.add(m);
      return m;
    };
    this.stripFar = mkStrip(-12.3, -10.8);
    this.stripSea = mkStrip(11.85, 10.35);
    scene.add(this.group);
  }

  fill(tramo: Tramo): void {
    this.tramo = tramo;
    this.stripFar.visible = tramo !== 'campo';
    this.stripSea.visible = tramo !== 'campo';
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
    ): number => {
      const i = counts.get(mesh) ?? 0;
      if (i >= (mesh.instanceMatrix.count as number)) return -1;
      _dummy.position.set(x, y, z);
      _dummy.rotation.set(0, ry, 0);
      _dummy.scale.setScalar(scale);
      _dummy.updateMatrix();
      mesh.setMatrixAt(i, _dummy.matrix);
      if (tint !== undefined) mesh.setColorAt(i, _color.set(tint));
      else if (mesh.instanceColor) mesh.setColorAt(i, _color.set(0xffffff));
      counts.set(mesh, i + 1);
      return i;
    };
    // A shop front: which sign and which awning this instance shows
    const rects = this.assets.rects;
    const shopSign = (z: number, sign: number, awning: number): void => {
      const i = place(this.signIM, -12.3 - 3.25, 0, z);
      if (i < 0) return;
      const r = rects[`sign${sign}`];
      const a = rects[`awning${awning}`];
      this.signOff.setXY(i, r.u0 - rects.sign0.u0, r.v0 - rects.sign0.v0);
      this.awnOff.setXY(i, a.u0 - rects.awning0.u0, a.v0 - rects.awning0.v0);
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
          const name = this.signCursor % 3;
          shopSign(z, name, name % 2);
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
          // most one-storey fronts are a business: la banca, the empanada
          // window, the farmacia, the repuestos
          if (v.shopZ !== undefined && Math.random() < 0.6) {
            const shop = Math.floor(Math.random() * STOREFRONTS.length);
            shopSign(z + v.shopZ, COLMADO_NAMES.length + shop, STOREFRONT_AWNING[shop]);
          }
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
          const name = this.signCursor % 3;
          shopSign(cursor + v.width / 2, name, name % 2);
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
      if (!imMesh.isInstancedMesh) continue; // the ground strips are plain meshes
      imMesh.count = counts.get(imMesh) ?? 0;
      imMesh.instanceMatrix.needsUpdate = true;
      if (imMesh.instanceColor) imMesh.instanceColor.needsUpdate = true;
    }
    this.signOff.needsUpdate = true;
    this.awnOff.needsUpdate = true;
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
// Sky, clouds and the mountain backdrop: celestial, never bent, never fogged
// by the scene fog (the dome and backdrop fade to the fog color themselves).
// ---------------------------------------------------------------------------

const DEG = Math.PI / 180;

const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  // centered on the camera, so the sky never parallaxes and never clips
  gl_Position = projectionMatrix * viewMatrix * vec4( cameraPosition + position, 1.0 );
}
`;

const SKY_FRAG = /* glsl */ `
uniform vec3 uTop;
uniform vec3 uMid;
uniform vec3 uCream;
uniform vec3 uHorizon;
uniform vec3 uSunDir;
uniform vec3 uSun;
uniform vec3 uGlow;
varying vec3 vDir;
void main() {
  vec3 d = normalize( vDir );
  float e = d.y;
  // peach on the horizon (the fog color), a cream band, then blue overhead
  vec3 c = mix( uHorizon, uCream, smoothstep( 0.0, 0.07, e ) );
  c = mix( c, uMid, smoothstep( 0.05, 0.24, e ) );
  c = mix( c, uTop, smoothstep( 0.22, 0.46, e ) );
  float s = max( dot( d, uSunDir ), 0.0 );
  // bloom: a warm peach ring hugging the disc and a wide soft wash, kept
  // below the disc's own brightness so the sun still reads as a shape
  c = mix( c, uGlow, pow( s, 260.0 ) * 0.75 + pow( s, 14.0 ) * 0.28 );
  // the flare lying along the horizon under the sun
  vec2 hz = normalize( d.xz + vec2( 1e-5 ) );
  vec2 sz = normalize( uSunDir.xz );
  c = mix( c, uGlow, exp( -abs( e - 0.012 ) * 36.0 ) * pow( max( dot( hz, sz ), 0.0 ), 50.0 ) * 0.4 );
  // the disc: crisp, with a hairline of softness so it never shimmers
  c = mix( c, uSun, smoothstep( 0.99881, 0.99894, s ) );
  gl_FragColor = vec4( c, 1.0 );
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

// Cel clouds: overlapping solid circles, cream underneath and white on top
// with the white nudged toward the sun (screen left), a flat-cut base and a
// thin peach rim along it. No gradients: they have to sit with the toon world.
function cloudAtlas(): { tex: THREE.CanvasTexture; big: AtlasRect; small: AtlasRect } {
  const W = 512;
  const H = 256;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  const cloud = (ox: number, oy: number, w: number, h: number, blobs: Array<[number, number, number]>): void => {
    const base = oy + h * 0.86;
    const circle = (cx: number, cy: number, r: number): void => {
      g.beginPath();
      g.arc(cx, cy, r, 0, Math.PI * 2);
      g.fill();
    };
    g.save();
    g.beginPath();
    g.rect(ox, oy, w, base - oy);
    g.clip();
    g.fillStyle = '#ffe3c0';
    for (const [x, y, r] of blobs) circle(ox + x * w, oy + y * h, r * h);
    g.fillStyle = '#ffffff';
    for (const [x, y, r] of blobs) circle(ox + x * w - r * h * 0.08, oy + y * h - r * h * 0.16, r * h * 0.86);
    g.restore();
    // the flat base's rim, only where the cloud actually touches the cut
    g.fillStyle = '#ffd3b6';
    for (const [x, y, r] of blobs) {
      const dy = base - (oy + y * h);
      const rr = r * h;
      if (Math.abs(dy) < rr) {
        const half = Math.sqrt(rr * rr - dy * dy);
        g.fillRect(ox + x * w - half, base - 3, half * 2, 3);
      }
    }
  };
  // big cumulus: 512 x 150
  cloud(4, 4, 504, 146, [
    [0.06, 0.8, 0.12],
    [0.16, 0.7, 0.22],
    [0.3, 0.6, 0.32],
    [0.41, 0.46, 0.26],
    [0.52, 0.5, 0.44],
    [0.62, 0.42, 0.25],
    [0.7, 0.6, 0.34],
    [0.84, 0.7, 0.24],
    [0.94, 0.8, 0.12],
  ]);
  // small puff: 256 x 96
  cloud(4, 156, 248, 96, [
    [0.12, 0.76, 0.16],
    [0.28, 0.62, 0.28],
    [0.48, 0.52, 0.4],
    [0.68, 0.6, 0.3],
    [0.86, 0.72, 0.18],
  ]);
  const rect = (x: number, y: number, w: number, h: number): AtlasRect => ({
    u0: x / W,
    v0: 1 - (y + h) / H,
    u1: (x + w) / W,
    v1: 1 - y / H,
  });
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return { tex, big: rect(4, 4, 504, 146), small: rect(4, 156, 248, 96) };
}

const BACKDROP_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}
`;

// Three rows of 128 px in a 384 px canvas: row 0 on top (v 2/3..1).
const BACKDROP_FRAG = /* glsl */ `
uniform sampler2D uMap;
uniform float uRowA;
uniform float uRowB;
uniform float uMix;
uniform vec3 uHaze;
varying vec2 vUv;
void main() {
  vec4 a = texture2D( uMap, vec2( vUv.x, ( vUv.y + 2.0 - uRowA ) / 3.0 ) );
  vec4 b = texture2D( uMap, vec2( vUv.x, ( vUv.y + 2.0 - uRowB ) / 3.0 ) );
  vec4 c = mix( a, b, uMix );
  if ( c.a < 0.004 ) discard;
  // the same air as the road: lean toward the live fog color
  c.rgb = mix( c.rgb, uHaze, 0.32 );
  gl_FragColor = c;
  #include <colorspace_fragment>
}
`;

const BACKDROP_ROWS: Record<Tramo, number> = { malecon: 0, zona: 1, campo: 2 };

// Low-poly ridges painted flat: each ridge is a jagged polyline filled in its
// haze color, then split into facets from every peak down to the base, with
// the sun side (screen left) a shade lighter. Everything sits on the land
// side of the canvas; the sea half stays clear so the water meets the sky.
function backdropCanvas(): HTMLCanvasElement {
  const W = 1024;
  const ROW = 128;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = ROW * 3;
  const g = c.getContext('2d')!;
  const ridge = (
    row: number,
    x0: number,
    x1: number,
    base: number,
    peakMin: number,
    peakMax: number,
    step: number,
    lit: string,
    shade: string,
  ): void => {
    const top = row * ROW;
    const yb = top + ROW - 4;
    const pts: Array<[number, number]> = [[x0, yb - base]];
    for (let x = x0 + step * 0.5; x < x1; x += step * (0.6 + Math.random() * 0.8)) {
      const peak = peakMin + Math.random() * (peakMax - peakMin);
      // taper toward both ends so a range rises and falls instead of stopping
      const t = Math.min(1, (x - x0) / 120, (x1 - x) / 90);
      pts.push([x, yb - base - peak * t]);
    }
    pts.push([x1, yb - base]);
    g.fillStyle = shade;
    g.beginPath();
    g.moveTo(x0, yb);
    for (const [x, y] of pts) g.lineTo(x, y);
    g.lineTo(x1, yb);
    g.closePath();
    g.fill();
    // sun-side facets: from each peak down-left to the base
    g.fillStyle = lit;
    for (let i = 1; i < pts.length; i++) {
      const [px, py] = pts[i];
      const [qx, qy] = pts[i - 1];
      g.beginPath();
      g.moveTo(qx, qy);
      g.lineTo(px, py);
      g.lineTo(px - (yb - py) * 0.35, yb);
      g.lineTo(qx, yb);
      g.closePath();
      g.fill();
    }
  };
  // Row 0, el Malecon: two hazy ridges far inland and the city's towers.
  ridge(0, 520, 1024, 0, 30, 52, 76, '#ecd3b8', '#dfc0a4');
  g.fillStyle = '#dcbc9f';
  for (let x = 548; x < 760; x += 12 + Math.random() * 16) {
    const w = 7 + Math.random() * 10;
    const h = 16 + Math.random() * 26;
    g.fillRect(x, ROW - 4 - h, w, h);
  }
  ridge(0, 640, 1024, 0, 16, 30, 58, '#e3c4a6', '#d4ae92');
  // Row 1, la Zona: the ridges alone; the colonial walls hide the low city.
  ridge(1, 520, 1024, 0, 32, 54, 76, '#efcdb8', '#e2b9a3');
  ridge(1, 610, 1024, 0, 18, 32, 58, '#e5bca4', '#d7a78f');
  // Row 2, el campo: the Cordillera Central, taller and green, with a nearer
  // line of lomas in front.
  ridge(2, 500, 1024, 0, 44, 70, 84, '#bfd197', '#a8c085');
  ridge(2, 540, 1024, 0, 20, 36, 54, '#a3c276', '#8fb064');
  return c;
}

// ---------------------------------------------------------------------------
// Wind motes: thin warm streaks in a tube around the rider that only show at
// real speed and stretch with it, so a fondo reads as fast in the part of
// the frame the road texture cannot fill. One instanced draw, only when on.
// ---------------------------------------------------------------------------

const MOTE_COUNT = 40;
const MOTE_FROM_MPS = 28; // start showing above this speed...
const MOTE_FULL_MPS = 44; // ...fully visible here

class WindMotes {
  private im: THREE.InstancedMesh;
  private mat: THREE.MeshBasicMaterial;
  private px = new Float32Array(MOTE_COUNT);
  private py = new Float32Array(MOTE_COUNT);
  private pz = new Float32Array(MOTE_COUNT);

  constructor(scene: THREE.Scene) {
    this.mat = worldMaterial(
      new THREE.MeshBasicMaterial({ color: PALETTE.sunGlow, transparent: true, opacity: 0, depthWrite: false }),
    );
    this.im = new THREE.InstancedMesh(new THREE.BoxGeometry(0.03, 0.03, 1.2), this.mat, MOTE_COUNT);
    this.im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.im.frustumCulled = false;
    this.im.visible = false;
    for (let i = 0; i < MOTE_COUNT; i++) this.respawn(i, Math.random() * 42 - 1.5);
    scene.add(this.im);
  }

  // A ring around the camera's line of sight, never in the rider's face
  private respawn(i: number, z: number): void {
    const a = Math.random() * Math.PI * 2;
    const r = 1.8 + Math.random() * 4.5;
    this.px[i] = Math.cos(a) * r;
    this.py[i] = Math.max(0.25, 2.6 + Math.sin(a) * r * 0.6);
    this.pz[i] = z;
  }

  update(ds: number, speed: number, live: boolean): void {
    const k = live ? Math.min(1, Math.max(0, (speed - MOTE_FROM_MPS) / (MOTE_FULL_MPS - MOTE_FROM_MPS))) : 0;
    this.mat.opacity += (k * 0.55 - this.mat.opacity) * 0.08;
    this.im.visible = this.mat.opacity > 0.01;
    if (!this.im.visible) return;
    const stretch = 1 + speed * 0.05;
    for (let i = 0; i < MOTE_COUNT; i++) {
      this.pz[i] -= ds;
      if (this.pz[i] < -1.5) this.respawn(i, 34 + Math.random() * 10); // gone before it fills the lens
      _dummy.position.set(this.px[i], this.py[i], this.pz[i]);
      _dummy.rotation.set(0, 0, 0);
      _dummy.scale.set(1, 1, stretch);
      _dummy.updateMatrix();
      this.im.setMatrixAt(i, _dummy.matrix);
    }
    this.im.instanceMatrix.needsUpdate = true;
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
  private tapeCanvas!: HTMLCanvasElement;
  private tapeTex!: THREE.CanvasTexture;
  private tapeLabel = '';
  private tapeAt = 0; // meters into the run; 0 = no tape this run
  private tapeBroken = false;
  private tapeU = { time: { value: 0 }, flutter: { value: 1 }, brk: { value: 0 } };
  private lastSpeed: number = CONFIG.baseSpeed;
  private confetti: Confetto[] = [];
  private confettiMeshes: THREE.InstancedMesh[] = [];
  private belts: Belt[] = [];
  private viralata!: Viralata;
  private motes!: WindMotes;
  private chichiguas: Chichigua[] = [];
  private pelicans: Pelican[] = [];
  private obelisco!: THREE.Group;
  private nextObeliscoAt: number = CONFIG.obeliscoOffsetM;
  // Where the current run started on the lifetime odometer. Everything the
  // tour does is measured from here, so every run begins at home on the
  // Malecon and a crossing is an achievement of THIS run.
  private runOrigin = 0;
  private obeliscoPassed = false;
  onObeliscoPass: (() => void) | null = null;
  private shimmerA!: THREE.CanvasTexture;
  private shimmerB!: THREE.CanvasTexture;
  private glintMat!: THREE.MeshBasicMaterial;
  private roadMats!: Record<Tramo, THREE.MeshToonMaterial[]>;
  private crosswalkMat!: THREE.MeshToonMaterial;
  // The water, and everything that sparkles on it, so el campo can turn it
  // into farmland instead of leaving the Caribbean parked next to a
  // plantain field.
  private seaMats: Array<{ mat: THREE.MeshToonMaterial; sea: THREE.Color }> = [];
  private waterFx: Array<{ mat: THREE.Material & { opacity: number }; base: number }> = [];
  private landBlend = 0; // 0 = open water, 1 = fields all the way out
  private fogRef!: THREE.Fog;
  private hemi!: THREE.HemisphereLight;
  private sunLight!: THREE.DirectionalLight;
  private cloudLayer!: THREE.Mesh;
  private cloudPeriod = 600;
  private boats!: THREE.Mesh;
  private backdropU!: {
    uMap: { value: THREE.Texture };
    uRowA: { value: number };
    uRowB: { value: number };
    uMix: { value: number };
    uHaze: { value: THREE.Color };
  };
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

  get runDistance(): number {
    return this.D - this.runOrigin;
  }

  // A new run: the tour restarts from the Malecon without the world popping.
  // Belts still inside the fog keep whatever they wore (they scroll out in a
  // few seconds); belts beyond it are re-dressed for the fresh tour, so the
  // player rides out of wherever they died and into home. The announcement
  // is deliberately not fired: you did not "arrive" at the start line.
  // La Cinta stands tapeAtM into the run (0 = no tape) and reads tapeLabel,
  // for example "TU RÉCORD · 1,234 m" or "LA META".
  startRun(tapeAtM: number, tapeLabel: string): void {
    this.setTape(tapeAtM, tapeLabel);
    this.runOrigin = this.D;
    this.tramoNow = 'malecon';
    for (const belt of this.belts) {
      if (belt.group.position.z > CONFIG.fogFar) {
        belt.fill(tramoFor(this.runDistance + belt.group.position.z + CONFIG.beltLen / 2));
      }
    }
    this.obelisco.visible = false;
    this.scheduleObelisco();
  }

  constructor(scene: THREE.Scene, renderer: THREE.WebGLRenderer) {
    this.buildSky(scene);
    this.buildLights(scene);
    this.buildGround(scene);
    this.buildSea(scene);
    this.buildBackdrop(scene);
    this.buildRoad(scene, renderer);
    this.buildTape(scene);
    this.buildConfetti(scene);

    const atlas = buildAtlas();
    const assets = buildBeltAssets(atlas);
    for (let i = 0; i < BELT_COUNT; i++) {
      const belt = new Belt(scene, assets, i);
      belt.group.position.z = -BELT_PHASE + i * CONFIG.beltLen;
      belt.fill(tramoFor(this.runDistance + belt.group.position.z + CONFIG.beltLen / 2));
      this.belts.push(belt);
    }

    this.viralata = new Viralata(scene);
    this.motes = new WindMotes(scene);
    this.chichiguas.push(new Chichigua(scene, PALETTE.flagRed), new Chichigua(scene, 0xf4c430));
    for (let i = 0; i < 3; i++) this.pelicans.push(new Pelican(scene));
    for (let i = 0; i < 3; i++) this.gallinas.push(new Gallina(scene, i));
    this.buildObelisco(scene, atlas);
  }

  private buildSky(scene: THREE.Scene): void {
    scene.fog = new THREE.Fog(PALETTE.skyHorizon, CONFIG.fogNear, CONFIG.fogFar);
    this.fogRef = scene.fog as THREE.Fog;

    // The sky is a dome that rides with the camera, colored by elevation, so
    // the peach band sits exactly on the real horizon at any aspect ratio.
    // Its horizon uniform IS the fog color object: every tramo mood the fog
    // glides into, the sky glides into with it, and fogged scenery melts into
    // the sky instead of standing in front of it as a cutout. The sun, its
    // bloom and the flare along the horizon are drawn in the same pass.
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(385, 32, 16),
      new THREE.ShaderMaterial({
        uniforms: {
          uTop: { value: new THREE.Color(PALETTE.skyTop) },
          uMid: { value: new THREE.Color(0xa9dcea) },
          uCream: { value: new THREE.Color(PALETTE.sunGlow) },
          uHorizon: { value: this.fogRef.color },
          uSunDir: { value: SUN_DIR },
          uSun: { value: new THREE.Color(0xfffaea) },
          uGlow: { value: new THREE.Color(0xffc987) },
        },
        vertexShader: SKY_VERT,
        fragmentShader: SKY_FRAG,
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
      }),
    );
    dome.renderOrder = -10; // first in the opaque pass; everything paints over it
    dome.frustumCulled = false;
    scene.add(dome);

    // Clouds: flat cel cumulus, two big ones low over the horizon and a few
    // small ones higher up, all in one merged geometry drawn once. Two copies
    // of the set sit one period apart, so the whole layer drifts as a single
    // group and wraps without a seam. Not bend-patched and not fogged: they
    // belong to the sky, not the road.
    const { tex: cloudTex, big, small } = cloudAtlas();
    const PERIOD = 600;
    const parts: THREE.BufferGeometry[] = [];
    for (const copy of [0, -PERIOD]) {
      const layout: Array<[number, number, number, AtlasRect]> = [
        // [x, elevation deg, width, shape]
        [-150, 5.2, 104, big],
        [95, 6.4, 92, big],
        [-60, 11.5, 44, small],
        [30, 15.5, 36, small],
        [170, 12.5, 40, small],
        [-230, 16.5, 34, small],
        [250, 9.5, 50, small],
        [-10, 14, 30, small],
      ];
      for (const [x, el, w, r] of layout) {
        const z = 300 + ((x * 7) % 40 + 40) % 40; // a little depth jitter, deterministic
        const h = w * ((r.v1 - r.v0) / (r.u1 - r.u0)) * 0.5; // atlas is 2:1
        const q = quadUV(w, h, r);
        q.rotateY(Math.PI); // face the camera; the texture's left stays screen left
        q.translate(x + copy, 3 + Math.tan(el * DEG) * z + h / 2, z);
        parts.push(q);
      }
    }
    this.cloudLayer = new THREE.Mesh(
      mergeGeometries(parts)!,
      new THREE.MeshBasicMaterial({ map: cloudTex, transparent: true, fog: false, depthWrite: false }),
    );
    this.cloudLayer.frustumCulled = false;
    this.cloudLayer.renderOrder = -6; // behind the mountain backdrop, drawn first
    this.cloudPeriod = PERIOD;
    scene.add(this.cloudLayer);
  }

  private buildLights(scene: THREE.Scene): void {
    const hemi = new THREE.HemisphereLight(0xbfe3ef, 0xe8c39a, HEMI_I);
    this.hemi = hemi;
    scene.add(hemi);

    // The key light comes from the sea side, a little behind the rider and
    // about 28 degrees up, so the faces the camera actually sees (the rider's
    // back, car rears, oncoming fronts) land on the middle toon step and the
    // tops and sea-facing sides go full: the classic three-tone read. The
    // visible sun hangs ahead in the dome; nobody can see that it lies.
    const sun = new THREE.DirectionalLight(ATMOS.malecon.sun, ATMOS.malecon.sunI);
    this.sunLight = sun;
    sun.position.set(55, 30, 2);
    sun.target.position.set(0, 0, 10);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    // The light looks across the road now, so the shadow box's width runs
    // along the road: about 15 m behind the rider to 80 m ahead, and from
    // the sea wall up over the rooftops on the far side.
    const sc = sun.shadow.camera;
    sc.left = -78;
    sc.right = 26;
    sc.top = 28;
    sc.bottom = -12;
    sc.near = 10;
    sc.far = 220;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.6;
    scene.add(sun, sun.target);

    // Shadowless fill from over the camera's shoulder: lifts what the key
    // light leaves on the dark step without flattening the form.
    const fill = new THREE.DirectionalLight(0xffeedd, CONFIG.fillLight * CONFIG.lightExposure);
    fill.position.set(-15, 12, -30);
    fill.target.position.set(0, 0, 10);
    scene.add(fill, fill.target);
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

    // El malecon: base wall and rail; the balusters are instanced in the belts.
    // Kept low (the rail tops out under a metre) so a phone-height camera sees
    // open water over it instead of a cream wall.
    const baseGeo = new THREE.BoxGeometry(0.5, 0.4, 420, 1, 1, 24);
    const base = new THREE.Mesh(baseGeo, toonMaterial(PALETTE.seawallCream));
    base.position.set(11.85, 0.2, 120);
    scene.add(base);
    const railGeo = new THREE.BoxGeometry(0.42, 0.12, 420, 1, 1, 24);
    const rail = new THREE.Mesh(railGeo, toonMaterial(0xf6efdf));
    rail.position.set(11.85, 0.88, 120);
    scene.add(rail);
  }

  private buildSea(scene: THREE.Scene): void {
    const flat = (w: number, l: number, color: number, x: number, y: number): void => {
      const geo = new THREE.PlaneGeometry(w, l, 1, 24);
      geo.rotateX(-Math.PI / 2);
      // Its own material, not the shared toon cache: the water keeps its
      // turquoise far past the road's haze, out to the horizon.
      const mat = farFog(
        worldMaterial(new THREE.MeshToonMaterial({ color, gradientMap: getGradientMap() })),
        CONFIG.seaFogFar,
      );
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, 120);
      scene.add(m);
      // Kept so the water can turn to land: el campo is inland, and the sea
      // sitting there unchanged was why crossing a border never read as
      // leaving the Malecon.
      this.seaMats.push({ mat, sea: new THREE.Color(color) });
    };
    // Just under the promenade, so the water shows over the low rail.
    flat(33, 420, PALETTE.seaNear, 12 + 16.5, -0.15);
    flat(195, 420, PALETTE.seaDeep, 45 + 97.5, -0.2);

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
    mkShimmer(this.shimmerA, 0.22, -0.08);
    mkShimmer(this.shimmerB, 0.15, -0.06);

    // The sun's glint road on the water: a tapering strip laid along the
    // sun's bearing from the rider, so it points straight at the disc in the
    // dome. Its near end starts behind the rail; the far end fades into the
    // horizon. Additive and unfogged, so it glows through the haze.
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
    for (let i = 0; i < 52; i++) {
      gg.clearRect(0, Math.random() * 256, 128, 1 + Math.random() * 3);
    }
    // fade both ends (canvas top is the far end)
    gg.globalCompositeOperation = 'destination-in';
    const along = gg.createLinearGradient(0, 0, 0, 256);
    along.addColorStop(0, 'rgba(0,0,0,0)');
    along.addColorStop(0.35, 'rgba(0,0,0,1)');
    along.addColorStop(0.85, 'rgba(0,0,0,1)');
    along.addColorStop(1, 'rgba(0,0,0,0)');
    gg.fillStyle = along;
    gg.fillRect(0, 0, 128, 256);
    const glintTex = new THREE.CanvasTexture(gc);
    this.glintMat = worldMaterial(
      new THREE.MeshBasicMaterial({
        map: glintTex,
        transparent: true,
        opacity: 0.42,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: false,
      }),
    );
    const R0 = 70; // meters from the rider along the bearing
    const R1 = 330;
    const glintGeo = new THREE.BufferGeometry();
    glintGeo.setAttribute(
      'position',
      new THREE.Float32BufferAttribute([-2.5, 0, R0, 2.5, 0, R0, -16, 0, R1, 16, 0, R1], 3),
    );
    glintGeo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 1, 1], 2));
    glintGeo.setIndex([0, 2, 1, 1, 2, 3]);
    glintGeo.rotateY(SUN_BEARING);
    const glint = new THREE.Mesh(glintGeo, this.glintMat);
    glint.position.set(0, -0.04, -6);
    glint.frustumCulled = false;
    scene.add(glint);
    this.waterFx.push({ mat: this.glintMat, base: 0.42 });

    // Veleros: three small sails out on the sun's road, one merged mesh that
    // bobs as a whole. They vanish with the water when el campo takes over.
    const boatParts: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 3; i++) {
      const parts: THREE.BufferGeometry[] = [];
      cbox(parts, 2.2, 0.5, 0.8, 0, 0.25, 0, i === 1 ? 0xce1126 : 0xf2e9dc); // hull
      cgeo(parts, new THREE.CylinderGeometry(0.05, 0.05, 3.2, 6), 0x6b5645, 0.2, 1.85, 0);
      // A mainsail and a jib: triangles are what make a sail read as a sail
      // at 150 m; rectangles read as billboards.
      parts.push(paint(sailGeometry([0.25, 0.6], [0.25, 3.35], [1.7, 0.6]), i === 2 ? 0xffd3b6 : 0xffffff));
      parts.push(paint(sailGeometry([0.15, 3.1], [0.15, 0.6], [-0.95, 0.6]), 0xffffff));
      const boat = mergeGeometries(parts)!;
      boat.scale(1.6, 1.6, 1.6);
      boat.rotateY(0.5 + i * 0.4);
      boat.translate(18 + i * 8, 0, 90 + i * 45);
      boatParts.push(boat);
    }
    this.boats = new THREE.Mesh(
      mergeGeometries(boatParts)!,
      farFog(
        worldMaterial(new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: getGradientMap() })),
        CONFIG.seaFogFar,
      ),
    );
    scene.add(this.boats);
  }

  // Distant lomas inland: one backdrop plane holding a row per tramo (the
  // Malecon's ridges with the city's towers, the Zona's, and the taller green
  // Cordillera for el campo). Unfogged but pre-hazed, and pulled toward the
  // live fog color in the shader, so it sits in the same air as the road.
  // Crossing a border crossfades one row into the next.
  private buildBackdrop(scene: THREE.Scene): void {
    const tex = new THREE.CanvasTexture(backdropCanvas());
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.generateMipmaps = false; // rows share one canvas; mips would bleed them together
    tex.minFilter = THREE.LinearFilter;
    this.backdropU = {
      uMap: { value: tex },
      uRowA: { value: 0 },
      uRowB: { value: 0 },
      uMix: { value: 0 },
      uHaze: { value: this.fogRef.color },
    };
    const geo = new THREE.PlaneGeometry(520, 60);
    geo.rotateY(Math.PI); // face the camera; the canvas's left stays screen left (the sea)
    const m = new THREE.Mesh(
      geo,
      new THREE.ShaderMaterial({
        uniforms: this.backdropU,
        vertexShader: BACKDROP_VERT,
        fragmentShader: BACKDROP_FRAG,
        transparent: true,
        depthWrite: false,
        fog: false,
      }),
    );
    m.position.set(0, 22, 250); // bottom edge at y -8, under the horizon
    m.renderOrder = -4; // after the clouds (-6), which sit behind it
    m.frustumCulled = false;
    scene.add(m);
  }

  // One road texture per tramo, all built at boot: warm asphalt on the
  // Malecon, cobble-toned stone in the Zona, faded patchy blacktop with red
  // dirt shoulders out in el campo, plus one Malecon variant with a zebra
  // crossing. The textures tile along the road, so every chunk can show its
  // own slice of one (see buildRoad) and the features never march past in
  // lockstep. The features are sized to read at phone scale: manholes, patch
  // outlines, cracks and tar seams streaming under the rider are most of
  // what makes 40 m/s look like 40 m/s.
  private roadTexture(
    renderer: THREE.WebGLRenderer,
    base: number,
    shoulder: number,
    tramo: Tramo,
    crosswalk = false,
  ): THREE.CanvasTexture {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 1024;
    const H = c.height;
    const g = c.getContext('2d')!;
    const pmx = c.width / ROAD.fullWidth;
    const pmy = H / CHUNK_LEN;
    const laneX = (lane: number): number => CONFIG.shoulderWidth + CONFIG.laneWidth * (lane + 0.5);
    // Anything that may cross the top or bottom edge is drawn again one tile
    // over, so the texture wraps without a seam.
    const wrapped = (yPx: number, reachPx: number, draw: (dy: number) => void): void => {
      draw(0);
      if (yPx - reachPx < 0) draw(H);
      if (yPx + reachPx > H) draw(-H);
    };
    // An irregular patch: a jittered hexagon with a darker hairline outline,
    // so it reads as a repair in the road rather than a tiling glitch.
    const patch = (xM: number, zM: number, wM: number, hM: number, fill: string, edge: string): void => {
      const pts: Array<[number, number]> = [];
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2 + Math.random() * 0.5;
        const rx = (wM / 2) * (0.75 + Math.random() * 0.25);
        const ry = (hM / 2) * (0.75 + Math.random() * 0.25);
        pts.push([(xM + Math.cos(a) * rx) * pmx, (zM + Math.sin(a) * ry) * pmy]);
      }
      wrapped(zM * pmy, (hM / 2) * pmy, (dy) => {
        g.beginPath();
        for (const [px, py] of pts) g.lineTo(px, py + dy);
        g.closePath();
        g.fillStyle = fill;
        g.fill();
        g.strokeStyle = edge;
        g.lineWidth = 1.2;
        g.stroke();
      });
    };
    const crack = (xM: number, zM: number, alpha: number): void => {
      const pts: Array<[number, number]> = [[xM * pmx, zM * pmy]];
      let a = Math.random() * Math.PI * 2;
      for (let k = 0; k < 7; k++) {
        a += (Math.random() - 0.5) * 1.3;
        const [px, py] = pts[pts.length - 1];
        pts.push([px + Math.cos(a) * 0.35 * pmx, py + Math.sin(a) * 0.35 * pmy]);
      }
      wrapped(zM * pmy, 3 * pmy, (dy) => {
        g.beginPath();
        for (const [px, py] of pts) g.lineTo(px, py + dy);
        g.strokeStyle = `rgba(0,0,0,${alpha})`;
        g.lineWidth = 1.5;
        g.stroke();
      });
    };
    const manhole = (xM: number, zM: number): void => {
      const cx = xM * pmx;
      const cy = zM * pmy;
      wrapped(cy, 0.5 * pmy, (dy) => {
        g.beginPath();
        g.ellipse(cx, cy + dy, 0.47 * pmx, 0.47 * pmy, 0, 0, Math.PI * 2);
        g.fillStyle = '#55504c';
        g.fill();
        g.beginPath();
        g.ellipse(cx, cy + dy, 0.4 * pmx, 0.4 * pmy, 0, 0, Math.PI * 2);
        g.fillStyle = '#2a2624';
        g.fill();
        g.strokeStyle = 'rgba(120,112,104,0.55)';
        g.lineWidth = 1.5;
        for (const k of [-0.2, 0, 0.2]) {
          g.beginPath();
          g.moveTo(cx - 0.3 * pmx, cy + dy + k * pmy);
          g.lineTo(cx + 0.3 * pmx, cy + dy + k * pmy);
          g.stroke();
        }
      });
    };

    g.fillStyle = hex(base);
    g.fillRect(0, 0, c.width, H);
    g.fillStyle = hex(shoulder);
    g.fillRect(0, 0, CONFIG.shoulderWidth * pmx, H);
    g.fillRect(c.width - CONFIG.shoulderWidth * pmx, 0, CONFIG.shoulderWidth * pmx, H);

    for (let i = 0; i < 900; i++) {
      g.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.045)' : 'rgba(0,0,0,0.06)';
      const s = 1 + Math.random() * 2.2;
      g.fillRect(Math.random() * c.width, Math.random() * H, s, s);
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
      manhole(laneX(Math.floor(Math.random() * 4)), 4 + Math.random() * 22);
    } else if (tramo === 'campo') {
      // red dirt creeping onto the shoulders
      g.fillStyle = 'rgba(215,122,97,0.35)';
      g.fillRect(0, 0, CONFIG.shoulderWidth * pmx * 1.15, H);
      g.fillRect(c.width - CONFIG.shoulderWidth * pmx * 1.15, 0, CONFIG.shoulderWidth * pmx * 1.15, H);
      // patched blacktop: faded repairs with ragged edges, hairline cracks
      for (let i = 0; i < 10; i++) {
        const lighter = Math.random() < 0.5;
        patch(
          CONFIG.shoulderWidth + Math.random() * (ROAD.fullWidth - 2 * CONFIG.shoulderWidth),
          Math.random() * CHUNK_LEN,
          1.2 + Math.random() * 2.4,
          1.6 + Math.random() * 3.6,
          lighter ? 'rgba(217,199,167,0.1)' : 'rgba(0,0,0,0.13)',
          'rgba(0,0,0,0.22)',
        );
      }
      for (let i = 0; i < 7; i++) crack(2 + Math.random() * 12.8, Math.random() * CHUNK_LEN, 0.3);
    } else {
      // El Malecon: utility patches, cracks, one manhole, and transverse tar
      // seams every 7.5 m, the small things that stream past the rider.
      for (let i = 0; i < 4; i++) {
        patch(laneX(Math.floor(Math.random() * 4)) + (Math.random() - 0.5) * 1.2, Math.random() * CHUNK_LEN,
          1.4 + Math.random() * 1.6, 1.5 + Math.random() * 1.5, 'rgba(44,40,38,0.95)', 'rgba(0,0,0,0.38)');
      }
      for (let i = 0; i < 5; i++) crack(2 + Math.random() * 12.8, Math.random() * CHUNK_LEN, 0.25);
      manhole(laneX(Math.floor(Math.random() * 4)), 4 + Math.random() * 22);
      g.strokeStyle = 'rgba(0,0,0,0.25)';
      g.lineWidth = 1.2;
      for (let zM = 3.75; zM < CHUNK_LEN; zM += 7.5) {
        const skew = (Math.random() - 0.5) * 6;
        g.beginPath();
        g.moveTo(CONFIG.shoulderWidth * pmx, zM * pmy - skew);
        g.lineTo(c.width - CONFIG.shoulderWidth * pmx, zM * pmy + skew);
        g.stroke();
      }
    }

    // Tire wear: two soft dark tracks in every lane. Reads as a road that
    // gets driven, which is most of what "professional" road texture means.
    for (let lane = 0; lane < 4; lane++) {
      const cxM = CONFIG.shoulderWidth + CONFIG.laneWidth * (lane + 0.5);
      for (const off of [-0.62, 0.62]) {
        for (let w = 0.5; w > 0.15; w -= 0.11) {
          g.fillStyle = 'rgba(0,0,0,0.045)';
          g.fillRect((cxM + off - w / 2) * pmx, 0, Math.max(2, w * pmx), c.height);
        }
      }
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

    if (crosswalk) {
      // el paso de peatones: six bars per direction, painted over the lines
      g.fillStyle = hex(PALETTE.laneDash);
      for (const half of [0, 1]) {
        const x0 = CONFIG.shoulderWidth + half * ROAD.halfRoad + 0.4;
        for (let k = 0; k < 6; k++) {
          g.fillRect((x0 + k * 1.1) * pmx, 13 * pmy, 0.5 * pmx, 4 * pmy);
        }
      }
    }

    if (tramo !== 'campo') {
      // the painted curb: 1 m red, 1 m white along both edges. At speed it
      // strobes past, which sells the speed as much as anything on screen.
      const w = 0.3 * pmx;
      for (let zM = 0; zM < CHUNK_LEN; zM += 2) {
        g.fillStyle = hex(PALETTE.colmadoRed);
        g.fillRect(0, zM * pmy, w, pmy);
        g.fillRect(c.width - w, zM * pmy, w, pmy);
        g.fillStyle = '#f6f1e7';
        g.fillRect(0, (zM + 1) * pmy, w, pmy);
        g.fillRect(c.width - w, (zM + 1) * pmy, w, pmy);
      }
    }

    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapT = THREE.RepeatWrapping; // chunks show different slices of it
    tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    return tex;
  }

  // Each tramo's texture is shown through ROAD_SLICES materials, each looking
  // at the tile from a different 6 m step (a lane-dash period, so the dashes
  // never break). A recycled chunk picks one at random, so the manhole and
  // the patches do not come round every 30 m like a metronome. The clones
  // share their image, so this costs materials, not texture memory.
  private buildRoad(scene: THREE.Scene, renderer: THREE.WebGLRenderer): void {
    const slices = (tex: THREE.CanvasTexture): THREE.MeshToonMaterial[] => {
      const out: THREE.MeshToonMaterial[] = [];
      for (let k = 0; k < ROAD_SLICES; k++) {
        const t = k === 0 ? tex : tex.clone();
        t.offset.y = k / ROAD_SLICES;
        out.push(worldMaterial(new THREE.MeshToonMaterial({ map: t, gradientMap: getGradientMap() })));
      }
      return out;
    };
    this.roadMats = {
      malecon: slices(this.roadTexture(renderer, PALETTE.asphalt, PALETTE.asphaltShoulder, 'malecon')),
      zona: slices(this.roadTexture(renderer, 0x45414a, 0x4f4a50, 'zona')),
      campo: slices(this.roadTexture(renderer, 0x4a443c, 0x5a4f42, 'campo')),
    };
    this.crosswalkMat = worldMaterial(
      new THREE.MeshToonMaterial({
        map: this.roadTexture(renderer, PALETTE.asphalt, PALETTE.asphaltShoulder, 'malecon', true),
        gradientMap: getGradientMap(),
      }),
    );
    const geo = new THREE.PlaneGeometry(ROAD.fullWidth, CHUNK_LEN, 1, 8);
    geo.rotateX(-Math.PI / 2);
    for (let i = 0; i < CHUNK_COUNT; i++) {
      const chunk = new THREE.Mesh(geo, this.roadMats.malecon[i % ROAD_SLICES]);
      chunk.position.z = -CHUNK_LEN + i * CHUNK_LEN;
      chunk.receiveShadow = true;
      scene.add(chunk);
      this.chunks.push(chunk);
    }
  }

  // La Cinta del Récord: a finish arch over the road (red posts with white
  // bands, a gold beam, the banner hanging from it) and the breakable ribbon
  // across the lanes. Readable from afar, which is the whole point: the
  // record is a place on the road you can see coming. The banner and the
  // ribbon share one canvas and one draw; the ribbon flutters, harder in the
  // last 60 m, and on the burst its halves swing down from the posts while
  // the arch stays standing for you to ride under.
  private buildTape(scene: THREE.Scene): void {
    this.tape = new THREE.Group();
    const parts: THREE.BufferGeometry[] = [];
    for (const sx of [-1, 1]) {
      const x = sx * TAPE_POST_X;
      cgeo(parts, new THREE.CylinderGeometry(0.14, 0.17, 5.2, 10), PALETTE.colmadoRed, x, 2.6, 0);
      for (const y of [1.3, 3.2]) cgeo(parts, new THREE.CylinderGeometry(0.175, 0.175, 0.28, 10), 0xffffff, x, y, 0);
      cgeo(parts, new THREE.SphereGeometry(0.26, 10, 8), PALETTE.gold, x, 5.4, 0);
      cbox(parts, 0.05, 0.42, 0.05, sx * 6.1, 4.93, 0, 0xf2e9dc); // the banner's cords
    }
    cbox(parts, TAPE_POST_X * 2, 0.24, 0.24, 0, 5.16, 0, PALETTE.gold); // beam
    const arch = new THREE.Mesh(
      mergeGeometries(parts)!,
      farFog(
        worldMaterial(new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: getGradientMap() })),
        CONFIG.cintaShowM * 1.3,
      ),
    );
    arch.castShadow = true;
    this.tape.add(arch);

    this.tapeCanvas = document.createElement('canvas');
    this.tapeCanvas.width = 1024;
    this.tapeCanvas.height = 256;
    this.tapeTex = new THREE.CanvasTexture(this.tapeCanvas);
    this.tapeTex.colorSpace = THREE.SRGBColorSpace;
    this.tapeTex.anisotropy = 4;

    // part 0 = banner, 1 = ribbon; wave = how far each vertex may move
    const cloth = (w: number, h: number, segs: number, y: number, v0: number, v1: number, part: number): THREE.BufferGeometry => {
      const g = new THREE.PlaneGeometry(w, h, segs, 1);
      const uv = g.getAttribute('uv') as THREE.BufferAttribute;
      const pos = g.getAttribute('position') as THREE.BufferAttribute;
      const wave = new Float32Array(pos.count);
      const partA = new Float32Array(pos.count).fill(part);
      for (let i = 0; i < pos.count; i++) {
        uv.setY(i, v0 + uv.getY(i) * (v1 - v0));
        wave[i] = part === 0 ? 0.25 : Math.sin((Math.PI * (pos.getX(i) + w / 2)) / w);
      }
      g.setAttribute('aWave', new THREE.BufferAttribute(wave, 1));
      g.setAttribute('aPart', new THREE.BufferAttribute(partA, 1));
      g.rotateY(Math.PI); // face the approaching rider; the canvas's left stays screen left
      g.translate(0, y, 0);
      return g;
    };
    const clothGeo = mergeGeometries([
      cloth(12.4, 1.45, 16, 4.05, 1 - 120 / 256, 1, 0),
      cloth(TAPE_POST_X * 2, 0.46, 32, 1.1, 1 - 184 / 256, 1 - 136 / 256, 1),
    ])!;
    const tapeU = this.tapeU;
    const clothMat = extendPatch(
      farFog(
        worldMaterial(new THREE.MeshBasicMaterial({ map: this.tapeTex, side: THREE.DoubleSide })),
        CONFIG.cintaShowM * 1.3,
      ),
      'cloth',
      (shader) => {
        shader.uniforms.uTapeTime = tapeU.time;
        shader.uniforms.uFlutter = tapeU.flutter;
        shader.uniforms.uBreak = tapeU.brk;
        shader.vertexShader =
          TAPE_CLOTH_PARS + shader.vertexShader.replace('#include <begin_vertex>', TAPE_CLOTH_CHUNK);
      },
    );
    const clothMesh = new THREE.Mesh(clothGeo, clothMat);
    clothMesh.frustumCulled = false;
    this.tape.add(clothMesh);
    this.tape.visible = false;
    scene.add(this.tape);
    this.drawTape();
    whenSignFontReady(() => this.drawTape());
  }

  // The banner reads the full label (TU RÉCORD · 1,234 m, or LA META); the
  // ribbon repeats its first part. Flags flank the banner text.
  private drawTape(): void {
    const g = this.tapeCanvas.getContext('2d')!;
    const label = this.tapeLabel;
    g.clearRect(0, 0, 1024, 256);
    // banner
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, 1024, 120);
    g.fillStyle = hex(PALETTE.centerLine);
    g.fillRect(0, 0, 1024, 10);
    g.fillRect(0, 110, 1024, 10);
    const fw = 84;
    drawDominicanFlag(g, 22, 60 - fw / FLAG_ASPECT / 2, fw);
    drawDominicanFlag(g, 1024 - 22 - fw, 60 - fw / FLAG_ASPECT / 2, fw);
    g.fillStyle = hex(PALETTE.flagRed);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    let size = 80;
    g.font = `${size}px ${SIGN_FONT}`;
    const room = 1024 - 2 * (fw + 44);
    const wText = g.measureText(label).width;
    if (wText > room) {
      size = Math.floor((size * room) / wText);
      g.font = `${size}px ${SIGN_FONT}`;
    }
    g.fillText(label, 512, 64);
    // ribbon: white with gold edges (not a flag: blue over red at speed read
    // as a tricolor), the short label stretched to undo the strip's squash
    g.fillStyle = '#ffffff';
    g.fillRect(0, 136, 1024, 48);
    g.fillStyle = hex(PALETTE.centerLine);
    g.fillRect(0, 136, 1024, 7);
    g.fillRect(0, 177, 1024, 7);
    const short = label.split(' · ')[0];
    g.fillStyle = hex(PALETTE.flagRed);
    g.font = `26px ${SIGN_FONT}`;
    for (const x of [170, 512, 854]) {
      g.save();
      g.translate(x, 161);
      g.scale(1.75, 1);
      g.fillText(short, 0, 0);
      g.restore();
    }
    this.tapeTex.needsUpdate = true;
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

  // Where this run's tape stands (meters into the run; 0 or less = no tape)
  // and what it says. startRun sets it; the test rig moves it mid-run.
  setTape(atM: number, label: string): void {
    this.tapeAt = atM;
    this.tapeBroken = false;
    this.tapeU.brk.value = 0;
    if (label !== this.tapeLabel) {
      this.tapeLabel = label;
      this.drawTape();
    }
  }

  // The rider burst through: the ribbon's halves swing down from the posts,
  // the arch stays, and flag-color confetti fills the air ahead of the rider
  // and rides along with them, so it hangs in the frame instead of whipping
  // past the camera.
  burstTape(): void {
    this.tapeBroken = true;
    const v = this.lastSpeed;
    for (const f of this.confetti) {
      f.life = 2.2 + Math.random() * 0.6;
      f.x = (Math.random() - 0.5) * 14;
      f.y = 1.5 + Math.random() * 3.5;
      f.z = 4 + Math.random() * 14;
      f.vx = (Math.random() - 0.5) * 2.4;
      f.vy = 1 + Math.random() * 2;
      f.vz = v * (0.8 + Math.random() * 0.2);
      f.rx = (Math.random() < 0.5 ? -1 : 1) * (8 + Math.random() * 6);
      f.ry = (Math.random() - 0.5) * 6;
      f.rotX = Math.random() * 3;
      f.rotY = Math.random() * 3;
    }
    for (const im of this.confettiMeshes) im.visible = true;
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
    this.nextObeliscoAt = nextObeliscoAfter(this.runDistance);
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

  // attract: the title screen keeps the Malecon scrolling for ambience, but
  // the tour must not drift while nobody is riding, so the run origin moves
  // with the odometer and runDistance holds still.
  step(ds: number, dt: number, attract = false): void {
    this.D += ds;
    if (attract) this.runOrigin += ds;
    this.t += dt;
    if (dt > 0) this.lastSpeed = ds / dt;
    CURVE_U.dist.value = this.D;
    CURVE_U.off.value = curveOffset(this.D);
    CURVE_U.slope.value = curveSlope(this.D);

    // Which tramo is under the wheels; announce the border crossings
    const tHere = tramoFor(this.runDistance);
    if (tHere !== this.tramoNow) {
      this.tramoNow = tHere;
      this.onTramoChange?.(tHere);
    }

    // The air follows the tramo: fog, sun, ambient and the rim tint all glide
    // toward the current stretch's mood. Exponential lerp, allocation-free.
    const a = ATMOS[this.tramoNow];
    const ak = 1 - Math.exp(-dt * 1.3);
    this.fogRef.color.lerp(a.fog, ak);
    this.fogRef.far += (a.fogFar - this.fogRef.far) * ak;
    this.sunLight.color.lerp(a.sun, ak);
    this.sunLight.intensity += (a.sunI - this.sunLight.intensity) * ak;
    this.hemi.color.lerp(a.hemiSky, ak);
    this.hemi.groundColor.lerp(a.hemiGround, ak);
    RIM_U.value.lerp(a.rim, ak);

    // Clouds drift on their own time, indifferent to the corre corre below
    this.cloudLayer.position.x = (this.t * 0.5) % this.cloudPeriod;
    // Sailboats bob; gone once the sea is fields
    this.boats.visible = this.landBlend < 0.35;
    this.boats.position.y = -0.3 + Math.sin(this.t * 0.9) * 0.12;
    // The mountains crossfade to the new tramo's row after a border
    const row = BACKDROP_ROWS[this.tramoNow];
    const bu = this.backdropU;
    if (bu.uRowB.value !== row) {
      if (bu.uMix.value > 0.5) bu.uRowA.value = bu.uRowB.value;
      bu.uRowB.value = row;
      bu.uMix.value = 0;
    }
    if (bu.uMix.value < 1) {
      bu.uMix.value = Math.min(1, bu.uMix.value + dt * 0.5);
      if (bu.uMix.value >= 1) bu.uRowA.value = row;
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
        // dress the recycled chunk for the tramo it will sit in, with a
        // random slice of that tramo's road; one Malecon chunk in five gets
        // the zebra crossing
        const tr = tramoFor(this.runDistance + chunk.position.z);
        chunk.material =
          tr === 'malecon' && Math.random() < 0.2
            ? this.crosswalkMat
            : this.roadMats[tr][Math.floor(Math.random() * ROAD_SLICES)];
      }
    }

    for (const belt of this.belts) {
      belt.group.position.z -= ds;
      if (belt.group.position.z < -(CONFIG.beltLen + 20)) {
        belt.group.position.z += CONFIG.beltLen * BELT_COUNT;
        belt.fill(tramoFor(this.runDistance + belt.group.position.z + CONFIG.beltLen / 2));
      }
      // The belts keep frustumCulled off, because a manual bounding sphere
      // would have to be inflated for the bend field. One cheap z test still
      // drops the whole belt that is already behind the camera: the bend
      // never displaces forward, only laterally, so this cannot pop.
      belt.group.visible = belt.group.position.z + CONFIG.beltLen > -12;
    }

    // El Obelisco, every ~800 m, but it is a Malecon landmark: skip the
    // milestones that would land it in the Zona or out in el campo
    if (!this.obelisco.visible && this.nextObeliscoAt - this.runDistance < 190) {
      this.obelisco.visible = true;
      this.obeliscoPassed = false;
      this.obelisco.position.z = this.nextObeliscoAt - this.runDistance;
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
    this.motes.update(ds, this.lastSpeed, !attract);
    for (const k of this.chichiguas) k.update(ds, dt);
    for (const p of this.pelicans) p.update(ds, dt);
    const campoNow = this.tramoNow === 'campo';
    for (const gal of this.gallinas) gal.update(ds, dt, campoNow);

    // Sea life
    this.shimmerA.offset.y = (this.shimmerA.offset.y + dt * 0.05) % 1;
    this.shimmerB.offset.y = (this.shimmerB.offset.y - dt * 0.033 + 1) % 1;
    this.shimmerA.offset.x = (this.shimmerA.offset.x + dt * 0.01) % 1;
    this.glintMat.opacity = 0.38 + Math.sin(this.t * 1.9) * 0.1;

    // La Cinta: stands where this run's record is, rises out of the haze from
    // cintaShowM away, stays up (broken ribbon and all) until it is behind
    // the camera. Hidden on the title screen.
    const tz = this.tapeAt - this.runDistance;
    this.tape.visible = !attract && this.tapeAt > 0 && tz < CONFIG.cintaShowM && tz > -25;
    if (this.tape.visible) {
      this.tape.position.z = tz;
      this.tapeU.time.value = this.t;
      const flutter = tz < 60 ? 2 : 1; // the last stretch: the tape is shaking
      this.tapeU.flutter.value += (flutter - this.tapeU.flutter.value) * Math.min(1, dt * 3);
      if (this.tapeBroken) this.tapeU.brk.value = Math.min(1, this.tapeU.brk.value + dt * 2.2);
    }

    let anyConfetti = false;
    for (const f of this.confetti) {
      if (f.life <= 0) continue;
      f.life -= dt;
      f.vy = Math.max(-1.4, f.vy - 3.5 * dt); // paper flutters down, it never plummets
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
