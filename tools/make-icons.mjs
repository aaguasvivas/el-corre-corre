// Draws the app icon straight from the game's locked palette, with no image
// dependencies and no browser: a raw RGBA buffer plus a minimal PNG encoder
// (zlib is built into Node). Deterministic, so re-running always produces the
// same bytes.
//
//   node tools/make-icons.mjs
//
// Writes public/icon-1024.png (App Store / Capacitor source) and
// public/icon-180.png (apple-touch-icon for the web build).

import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// ---------------------------------------------------------------------------
// Tiny raster surface
// ---------------------------------------------------------------------------

function surface(size) {
  const px = new Uint8Array(size * size * 4);
  const put = (x, y, [r, g, b]) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const i = (y * size + x) * 4;
    px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = 255;
  };
  const u = size / 1024; // author everything at 1024
  return {
    size,
    px,
    rect(x, y, w, h, col) {
      const x0 = Math.round(x * u), y0 = Math.round(y * u);
      const x1 = Math.round((x + w) * u), y1 = Math.round((y + h) * u);
      for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) put(xx, yy, col);
    },
    circle(cx, cy, r, col) {
      const c = [cx * u, cy * u], rr = r * u;
      for (let yy = Math.floor(c[1] - rr); yy <= Math.ceil(c[1] + rr); yy++) {
        for (let xx = Math.floor(c[0] - rr); xx <= Math.ceil(c[0] + rr); xx++) {
          const dx = xx - c[0], dy = yy - c[1];
          if (dx * dx + dy * dy <= rr * rr) put(xx, yy, col);
        }
      }
    },
    // vertical gradient over stops [[t, color], ...]
    vgrad(stops) {
      for (let yy = 0; yy < size; yy++) {
        const t = yy / (size - 1);
        let a = stops[0], b = stops[stops.length - 1];
        for (let i = 0; i < stops.length - 1; i++) {
          if (t >= stops[i][0] && t <= stops[i + 1][0]) { a = stops[i]; b = stops[i + 1]; break; }
        }
        const span = b[0] - a[0] || 1;
        const k = (t - a[0]) / span;
        const col = [0, 1, 2].map((c) => Math.round(a[1][c] + (b[1][c] - a[1][c]) * k));
        for (let xx = 0; xx < size; xx++) put(xx, yy, col);
      }
    },
    // trapezoid road wedge: (xTopL,yTop)-(xTopR,yTop) down to (xBotL,yBot)-(xBotR,yBot)
    wedge(xTopL, xTopR, yTop, xBotL, xBotR, yBot, col) {
      const y0 = Math.round(yTop * u), y1 = Math.round(yBot * u);
      for (let yy = y0; yy < y1; yy++) {
        const k = (yy - y0) / Math.max(1, y1 - y0);
        const l = Math.round((xTopL + (xBotL - xTopL) * k) * u);
        const r = Math.round((xTopR + (xBotR - xTopR) * k) * u);
        for (let xx = l; xx < r; xx++) put(xx, yy, col);
      }
    },
    // filled convex polygon, even-odd scanline. Used for el escudo's shield.
    poly(pts, col) {
      const ys = pts.map((p) => p[1] * u);
      const y0 = Math.floor(Math.min(...ys)), y1 = Math.ceil(Math.max(...ys));
      for (let yy = y0; yy <= y1; yy++) {
        const xs = [];
        for (let i = 0; i < pts.length; i++) {
          const a = [pts[i][0] * u, pts[i][1] * u];
          const b = [pts[(i + 1) % pts.length][0] * u, pts[(i + 1) % pts.length][1] * u];
          if ((a[1] <= yy && b[1] > yy) || (b[1] <= yy && a[1] > yy)) {
            xs.push(a[0] + ((yy - a[1]) / (b[1] - a[1])) * (b[0] - a[0]));
          }
        }
        xs.sort((p, q) => p - q);
        for (let i = 0; i + 1 < xs.length; i += 2) {
          for (let xx = Math.round(xs[i]); xx <= Math.round(xs[i + 1]); xx++) put(xx, yy, col);
        }
      }
    },
    // thick arc, for the escudo's laurel and palm
    arc(cx, cy, r, a0, a1, thick, col) {
      const steps = Math.max(24, Math.ceil((a1 - a0) * r * u));
      const half = (thick * u) / 2;
      for (let i = 0; i <= steps; i++) {
        const a = a0 + ((a1 - a0) * i) / steps;
        const px0 = (cx + Math.cos(a) * r) * u;
        const py0 = (cy + Math.sin(a) * r) * u;
        for (let yy = Math.floor(py0 - half); yy <= Math.ceil(py0 + half); yy++) {
          for (let xx = Math.floor(px0 - half); xx <= Math.ceil(px0 + half); xx++) {
            const dx = xx - px0, dy = yy - py0;
            if (dx * dx + dy * dy <= half * half) put(xx, yy, col);
          }
        }
      }
    },
  };
}

// ---------------------------------------------------------------------------
// La bandera dominicana, matching src/flag.ts. Authored in the same 80 x 50
// space, then placed. Without el escudo it reads as the French flag.
// ---------------------------------------------------------------------------

// ox, oy, w are all in the same 1024 authoring space the surface uses.
function drawFlag(s, ox, oy, w) {
  const k = w / 80;                 // flag-space unit -> authoring space
  const L = (n) => n * k;
  const X = (n) => ox + n * k;
  const Y = (n) => oy + n * k;
  const C = {
    white: [0xff, 0xff, 0xff], blue: [0x00, 0x2d, 0x62], red: [0xce, 0x11, 0x26],
    green: [0x2f, 0x7d, 0x32], cream: [0xf7, 0xf3, 0xe8], gold: [0xf4, 0xc4, 0x30],
  };
  s.rect(X(0), Y(0), L(80), L(50), C.white);
  s.rect(X(0), Y(0), L(36), L(21), C.blue);
  s.rect(X(44), Y(29), L(36), L(21), C.blue);
  s.rect(X(44), Y(0), L(36), L(21), C.red);
  s.rect(X(0), Y(29), L(36), L(21), C.red);
  // laurel and palm: two arcs hugging the shield, left and right
  s.arc(X(40), Y(25.5), L(8.4), Math.PI * 0.55, Math.PI * 1.12, L(1.9), C.green);
  s.arc(X(40), Y(25.5), L(8.4), Math.PI * -0.12, Math.PI * 0.45, L(1.9), C.green);
  // DIOS PATRIA LIBERTAD above, REPUBLICA DOMINICANA below
  s.rect(X(33.2), Y(13.1), L(13.6), L(2.2), C.blue);
  s.rect(X(33.8), Y(33.4), L(12.4), L(2.2), C.red);
  // el escudo, with the gold cross
  s.poly(
    [[X(35), Y(16.9)], [X(45), Y(16.9)], [X(45), Y(25)], [X(40), Y(30.4)], [X(35), Y(25)]],
    C.cream,
  );
  s.rect(X(39.3), Y(18.5), L(1.4), L(8), C.gold);
  s.rect(X(37.1), Y(20.8), L(5.8), L(1.4), C.gold);
}

// ---------------------------------------------------------------------------
// Minimal PNG encoder
// ---------------------------------------------------------------------------

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(size, px) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter: none
    Buffer.from(px.buffer, y * size * 4, size * 4).copy(raw, y * (size * 4 + 1) + 1);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------------------
// The icon: el motoconcho on the Malecón at golden hour, flag bar at the base.
// Deliberately no wordmark: three lines of text is illegible at 40 px.
// ---------------------------------------------------------------------------

const C = {
  skyTop: [0x6e, 0xc6, 0xe6],
  skyMid: [0xff, 0xd9, 0xa0],
  skyWarm: [0xff, 0xe9, 0xbc],
  skyLow: [0xf3, 0xcf, 0x90],
  sunHalo: [0xff, 0xec, 0xbe],
  sun: [0xff, 0xf3, 0xc4],
  asphalt: [0x3e, 0x3a, 0x38],
  centerLine: [0xf4, 0xc4, 0x30],
  dark: [0x2a, 0x26, 0x24],
  red: [0xce, 0x11, 0x26],
  teal: [0x2a, 0x9d, 0x8f],
  skin: [0x8d, 0x55, 0x24],
  blue: [0x00, 0x2d, 0x62],
  white: [0xff, 0xff, 0xff],
  chrome: [0xd9, 0xd9, 0xd9],
};

function drawIcon(size) {
  const s = surface(size);
  s.vgrad([[0, C.skyTop], [0.5, C.skyMid], [0.74, C.skyWarm], [1, C.skyLow]]);
  s.circle(512, 410, 320, C.sunHalo);
  s.circle(512, 410, 224, C.sun);
  s.wedge(400, 624, 500, 20, 1004, 1024, C.asphalt);
  // dashed center line
  for (let y = 500; y < 1024; y += 120) s.rect(501, y, 22, 70, C.centerLine);

  // El motoconcho, lifted to leave the base clear for la bandera
  const cx = 512;
  const dy = -74;
  s.rect(cx - 46, 742 + dy, 92, 168, C.dark);      // rear wheel
  s.rect(cx - 104, 660 + dy, 208, 100, C.red);     // body
  s.rect(cx - 78, 618 + dy, 156, 52, C.dark);      // seat
  s.rect(cx - 168, 596 + dy, 336, 26, C.chrome);   // handlebar
  s.rect(cx - 154, 590 + dy, 40, 40, C.dark);      // grips
  s.rect(cx + 114, 590 + dy, 40, 40, C.dark);
  s.rect(cx - 128, 606 + dy, 62, 96, C.teal);      // arms
  s.rect(cx + 66, 606 + dy, 62, 96, C.teal);
  s.rect(cx - 70, 470 + dy, 140, 150, C.teal);     // torso
  s.rect(cx - 54, 356 + dy, 108, 112, C.skin);     // head
  s.rect(cx - 68, 322 + dy, 136, 50, C.blue);      // gorra
  s.rect(cx - 68, 360 + dy, 136, 18, C.blue);      // brim

  // La bandera at the base, not a three-band strip: with the escudo it reads
  // Dominican, without it it reads French.
  const fw = 232;
  drawFlag(s, (1024 - fw) / 2, 846, fw);
  return s;
}

mkdirSync(resolve(ROOT, 'public'), { recursive: true });
for (const size of [1024, 180]) {
  const s = drawIcon(size);
  const out = resolve(ROOT, `public/icon-${size}.png`);
  writeFileSync(out, encodePng(size, s.px));
  console.log(`wrote public/icon-${size}.png`);
}
