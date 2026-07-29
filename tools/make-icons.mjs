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
  };
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

  const cx = 512;
  s.rect(cx - 46, 742, 92, 168, C.dark);      // rear wheel
  s.rect(cx - 104, 660, 208, 100, C.red);     // body
  s.rect(cx - 78, 618, 156, 52, C.dark);      // seat
  s.rect(cx - 168, 596, 336, 26, C.chrome);   // handlebar
  s.rect(cx - 154, 590, 40, 40, C.dark);      // grips
  s.rect(cx + 114, 590, 40, 40, C.dark);
  s.rect(cx - 128, 606, 62, 96, C.teal);      // arms
  s.rect(cx + 66, 606, 62, 96, C.teal);
  s.rect(cx - 70, 470, 140, 150, C.teal);     // torso
  s.rect(cx - 54, 356, 108, 112, C.skin);     // head
  s.rect(cx - 68, 322, 136, 50, C.blue);      // gorra
  s.rect(cx - 68, 360, 136, 18, C.blue);      // brim

  const bw = 780, bx = (1024 - bw) / 2;
  s.rect(bx, 934, bw / 3, 56, C.blue);
  s.rect(bx + bw / 3, 934, bw / 3, 56, C.white);
  s.rect(bx + (2 * bw) / 3, 934, bw / 3, 56, C.red);
  return s;
}

mkdirSync(resolve(ROOT, 'public'), { recursive: true });
for (const size of [1024, 180]) {
  const s = drawIcon(size);
  const out = resolve(ROOT, `public/icon-${size}.png`);
  writeFileSync(out, encodePng(size, s.px));
  console.log(`wrote public/icon-${size}.png`);
}
