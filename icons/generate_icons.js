/**
 * generate_icons.js
 * Generates icon16.png, icon48.png, icon128.png for the PDF Translator extension.
 *
 * Zero external dependencies — uses only Node.js built-ins (zlib, fs, path).
 *
 * Run:  node generate_icons.js
 *
 * Design: vivid blue circular background, white document silhouette with a red
 * accent bar, and the letter "T" (proxy for 翻) centred in blue.
 * (Full CJK glyph rendering requires a canvas lib; for that use generate_icons.py)
 */

"use strict";
const zlib = require("zlib");
const fs   = require("fs");
const path = require("path");

// ─── tiny PNG encoder ────────────────────────────────────────────────────────

function crc32(buf) {
  const table = crc32.table || (crc32.table = (() => {
    const t = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[i] = c;
    }
    return t;
  })());
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function chunk(type, data) {
  const typeBytes = Buffer.from(type, "ascii");
  const body      = Buffer.concat([typeBytes, data]);
  const crc       = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  return Buffer.concat([len, typeBytes, data, crc]);
}

function encodePNG(pixels, w, h) {
  // pixels: Uint8Array of length w*h*4  (RGBA, row-major)
  const IHDR_data = Buffer.alloc(13);
  IHDR_data.writeUInt32BE(w, 0);
  IHDR_data.writeUInt32BE(h, 4);
  IHDR_data[8] = 8;  // bit depth
  IHDR_data[9] = 2;  // colour type: RGB  (we pre-flatten alpha)
  // bytes 10-12 = 0 (deflate, default filter, no interlace)

  // Build raw scanlines: filter byte (0) + RGB data
  // We flatten RGBA → RGB (ignore alpha — bg is opaque anyway)
  const raw = Buffer.alloc(h * (1 + w * 3));
  for (let y = 0; y < h; y++) {
    raw[y * (1 + w * 3)] = 0;  // filter type None
    for (let x = 0; x < w; x++) {
      const src = (y * w + x) * 4;
      const dst = y * (1 + w * 3) + 1 + x * 3;
      raw[dst]     = pixels[src];
      raw[dst + 1] = pixels[src + 1];
      raw[dst + 2] = pixels[src + 2];
      // pixels[src+3] is alpha — blended onto white bg before this call
    }
  }

  const compressed = zlib.deflateSync(raw, { level: 9 });
  const SIG = Buffer.from([137,80,78,71,13,10,26,10]);
  return Buffer.concat([
    SIG,
    chunk("IHDR", IHDR_data),
    chunk("IDAT", compressed),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ─── pixel helpers ───────────────────────────────────────────────────────────

// RGBA colour arrays
const BLUE   = [41,  98, 255, 255];
const WHITE  = [255, 255, 255, 255];
const SHADOW = [200, 215, 255, 255];
const RED    = [220,  50,  50, 255];
const CLEAR  = [  0,   0,   0,   0];

function setPixel(buf, w, x, y, rgba) {
  if (x < 0 || y < 0 || x >= w || y >= w) return;
  const i = (y * w + x) * 4;
  buf[i]     = rgba[0];
  buf[i + 1] = rgba[1];
  buf[i + 2] = rgba[2];
  buf[i + 3] = rgba[3];
}

function blend(src, dst) {
  // alpha-composite src over dst (all 0-255)
  const a = src[3] / 255;
  return [
    Math.round(src[0] * a + dst[0] * (1 - a)),
    Math.round(src[1] * a + dst[1] * (1 - a)),
    Math.round(src[2] * a + dst[2] * (1 - a)),
    255,
  ];
}

function getPixel(buf, w, x, y) {
  const i = (y * w + x) * 4;
  return [buf[i], buf[i+1], buf[i+2], buf[i+3]];
}

function drawRect(buf, w, x0, y0, x1, y1, rgba) {
  for (let y = Math.floor(y0); y <= Math.ceil(y1); y++)
    for (let x = Math.floor(x0); x <= Math.ceil(x1); x++) {
      const cur = getPixel(buf, w, x, y);
      setPixel(buf, w, x, y, blend(rgba, cur));
    }
}

/** Anti-aliased circle fill */
function drawCircle(buf, w, cx, cy, r, rgba) {
  const r2 = r * r;
  for (let y = 0; y < w; y++) {
    for (let x = 0; x < w; x++) {
      const dx = x - cx + 0.5, dy = y - cy + 0.5;
      const d2 = dx*dx + dy*dy;
      if (d2 <= r2) {
        // smooth edge with 1px AA
        const edge = r - Math.sqrt(d2);
        const alpha = Math.min(1, Math.max(0, edge));
        const c = [rgba[0], rgba[1], rgba[2], Math.round(rgba[3] * alpha)];
        const cur = getPixel(buf, w, x, y);
        setPixel(buf, w, x, y, blend(c, cur));
      }
    }
  }
}

/** Rasterise a convex polygon */
function drawPolygon(buf, w, pts, rgba) {
  // find bounding box
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const [px, py] of pts) {
    minX = Math.min(minX, px); maxX = Math.max(maxX, px);
    minY = Math.min(minY, py); maxY = Math.max(maxY, py);
  }
  // scanline fill
  for (let y = Math.floor(minY); y <= Math.ceil(maxY); y++) {
    const xs = [];
    const n = pts.length;
    for (let i = 0; i < n; i++) {
      const [ax, ay] = pts[i];
      const [bx, by] = pts[(i+1) % n];
      if ((ay <= y && by > y) || (by <= y && ay > y)) {
        xs.push(ax + (y - ay) / (by - ay) * (bx - ax));
      }
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      for (let x = Math.floor(xs[k]); x <= Math.ceil(xs[k+1]); x++) {
        const cur = getPixel(buf, w, x, y);
        setPixel(buf, w, x, y, blend(rgba, cur));
      }
    }
  }
}

// ─── icon renderer ───────────────────────────────────────────────────────────

/**
 * Render a simple icon at `size` x `size` pixels.
 * Returns a Uint8Array of RGBA pixels (row-major).
 */
function renderIcon(size) {
  const buf = new Uint8Array(size * size * 4); // all transparent

  const cx = size / 2, cy = size / 2, r = size / 2 - 0.5;

  // 1. Blue circle background
  drawCircle(buf, size, cx, cy, r, BLUE);

  // 2. White document body (polygon with folded top-right corner)
  const pad  = size * 0.18;
  const fold = size * 0.20;
  const dl = pad, dt = pad, dr = size - pad, db = size - pad;

  const bodyPts = [
    [dl,       dt + fold],
    [dl,       db],
    [dr,       db],
    [dr,       dt + fold],
    [dr - fold, dt],
    [dl,       dt],
  ];
  drawPolygon(buf, size, bodyPts, WHITE);

  // 3. Fold triangle (shadow)
  const foldPts = [
    [dr - fold, dt],
    [dr,        dt + fold],
    [dr - fold, dt + fold],
  ];
  drawPolygon(buf, size, foldPts, SHADOW);

  // 4. Red accent bar near bottom of document
  const barH = Math.max(2, Math.round(size * 0.10));
  const barT = db - barH - size * 0.06;
  drawRect(buf, size, dl, barT, dr, barT + barH, RED);

  // 5. Letter "T" centred in the document body
  //    (Full CJK glyph not possible without a font lib — use Python script for 翻)
  const docH    = barT - dt - fold * 0.5;   // usable height above accent bar
  const docMidX = (dl + dr) / 2;
  const docMidY = dt + fold * 0.5 + docH / 2;
  drawT(buf, size, docMidX, docMidY, Math.min(dr - dl, docH) * 0.55, BLUE);

  return buf;
}

/**
 * Draw a blocky "T" glyph centred at (cx, cy) with approximate height `h`.
 */
function drawT(buf, w, cx, cy, h, rgba) {
  const thick = Math.max(1, Math.round(h * 0.18));
  const hHalf = h / 2;
  const wHalf = hHalf * 0.65;

  // Horizontal bar (top)
  drawRect(buf, w,
    cx - wHalf, cy - hHalf,
    cx + wHalf, cy - hHalf + thick, rgba);

  // Vertical stem
  drawRect(buf, w,
    cx - thick / 2, cy - hHalf,
    cx + thick / 2, cy + hHalf, rgba);
}

// ─── main ────────────────────────────────────────────────────────────────────

const OUT_DIR = path.join(__dirname);
const SIZES   = [16, 48, 128];

for (const size of SIZES) {
  const pixels = renderIcon(size);

  // Flatten alpha over white background before encoding as RGB PNG
  const flat = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    const a = pixels[i * 4 + 3] / 255;
    flat[i * 4]     = Math.round(pixels[i * 4]     * a + 255 * (1 - a));
    flat[i * 4 + 1] = Math.round(pixels[i * 4 + 1] * a + 255 * (1 - a));
    flat[i * 4 + 2] = Math.round(pixels[i * 4 + 2] * a + 255 * (1 - a));
    flat[i * 4 + 3] = 255;
  }

  const png  = encodePNG(flat, size, size);
  const dest = path.join(OUT_DIR, `icon${size}.png`);
  fs.writeFileSync(dest, png);
  console.log(`Saved ${dest}  (${size}x${size})`);
}
