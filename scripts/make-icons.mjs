/**
 * Generates the PWA icon set with no image dependencies.
 *
 * The mark: three rising bars (the business getting better) on a warm amber
 * gradient, with a plate-ring behind them to say "restaurant". Everything is
 * drawn analytically and 4x supersampled, so it stays crisp at 48px and at
 * 512px from the same code.
 *
 * Run: node scripts/make-icons.mjs
 */
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const OUT = "public/icons";
mkdirSync(OUT, { recursive: true });

/* ------------------------------------------------------------ PNG encoding */

function crc32(buf) {
  let c;
  const table = (crc32.table ??= (() => {
    const t = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c;
    }
    return t;
  })());
  let crc = -1;
  for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff];
  return (crc ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** RGBA pixel buffer -> PNG file buffer. */
function encodePNG(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // truecolour + alpha
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  // One filter byte (0 = none) per scanline.
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/* -------------------------------------------------------------- drawing kit */

const mix = (a, b, t) => a + (b - a) * t;
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Signed distance to a rounded rectangle, in unit (0..1) space. */
function sdRoundRect(px, py, cx, cy, hw, hh, r) {
  const qx = Math.abs(px - cx) - (hw - r);
  const qy = Math.abs(py - cy) - (hh - r);
  const ax = Math.max(qx, 0);
  const ay = Math.max(qy, 0);
  return Math.hypot(ax, ay) + Math.min(Math.max(qx, qy), 0) - r;
}

const sdCircle = (px, py, cx, cy, r) => Math.hypot(px - cx, py - cy) - r;

const AMBER = [245, 158, 11];
const ORANGE = [217, 90, 12];
const CREAM = [255, 251, 240];
const INK = [26, 22, 17];

/**
 * @param {number} size output pixel size
 * @param {"any"|"maskable"|"badge"} purpose
 */
function drawIcon(size, purpose) {
  const SS = 4; // supersample factor
  const rgba = Buffer.alloc(size * size * 4);

  // Maskable icons must survive an aggressive circular crop, so the artwork
  // shrinks into the 80%-safe zone and the background bleeds to the edges.
  const contentScale = purpose === "maskable" ? 0.68 : 0.8;
  const bgRadius = purpose === "maskable" ? 0.5 : 0.235;
  const monochrome = purpose === "badge";

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;

      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const u = (x + (sx + 0.5) / SS) / size;
          const v = (y + (sy + 0.5) / SS) / size;
          const px = sample(u, v);
          r += px[0] * px[3];
          g += px[1] * px[3];
          b += px[2] * px[3];
          a += px[3];
        }
      }

      const n = SS * SS;
      const alpha = a / n;
      const i = (y * size + x) * 4;
      rgba[i] = alpha > 0 ? Math.round(r / a) : 0;
      rgba[i + 1] = alpha > 0 ? Math.round(g / a) : 0;
      rgba[i + 2] = alpha > 0 ? Math.round(b / a) : 0;
      rgba[i + 3] = Math.round(clamp01(alpha) * 255);
    }
  }

  /** Colour + coverage at a point in unit space. */
  function sample(u, v) {
    // Edge softness scaled to output size keeps small icons from looking fuzzy.
    const aa = 0.9 / size;
    const cover = (d) => clamp01(0.5 - d / aa);

    let out = [0, 0, 0, 0];

    if (!monochrome) {
      const bg = cover(sdRoundRect(u, v, 0.5, 0.5, 0.5, 0.5, bgRadius));
      if (bg > 0) {
        // Diagonal warm gradient.
        const t = clamp01((u * 0.45 + v * 0.85) / 1.3);
        out = [
          mix(AMBER[0], ORANGE[0], t),
          mix(AMBER[1], ORANGE[1], t),
          mix(AMBER[2], ORANGE[2], t),
          bg,
        ];
      }
    }

    // Artwork lives in a centred box of side `contentScale`.
    const s = contentScale;
    const o = (1 - s) / 2;
    const cu = (u - o) / s;
    const cv = (v - o) / s;
    const fg = monochrome ? CREAM : CREAM;

    if (cu >= -0.35 && cu <= 1.35 && cv >= -0.35 && cv <= 1.35) {
      // Plate ring behind the bars.
      const ringOuter = sdCircle(cu, cv, 0.5, 0.5, 0.485);
      const ringInner = sdCircle(cu, cv, 0.5, 0.5, 0.4);
      const ring = Math.min(cover(ringOuter), 1) - Math.min(cover(ringInner), 1);
      if (ring > 0.001) out = over(out, [...fg, ring * (monochrome ? 1 : 0.42)]);

      // Three rising bars, rounded, sitting on a common baseline.
      const baseline = 0.76;
      const bars = [
        { cx: 0.295, h: 0.20 },
        { cx: 0.5, h: 0.325 },
        { cx: 0.705, h: 0.45 },
      ];
      const hw = 0.058;
      for (const bar of bars) {
        const top = baseline - bar.h;
        const d = sdRoundRect(
          cu, cv,
          bar.cx, (top + baseline) / 2,
          hw, (baseline - top) / 2,
          hw * 0.92,
        );
        const c = cover(d);
        if (c > 0.001) out = over(out, [...fg, c]);
      }

      // Baseline rule.
      const rule = cover(sdRoundRect(cu, cv, 0.5, baseline + 0.052, 0.30, 0.021, 0.021));
      if (rule > 0.001) out = over(out, [...fg, rule * (monochrome ? 1 : 0.9)]);

      // Accent dot above the tallest bar - the "up and to the right".
      const dot = cover(sdCircle(cu, cv, 0.705, 0.205, 0.055));
      if (dot > 0.001) out = over(out, monochrome ? [...fg, dot] : [...INK, dot * 0.92]);
    }

    return out;
  }

  /** Source-over compositing on premultiplied-ish tuples. */
  function over(dst, src) {
    const sa = src[3];
    if (sa <= 0) return dst;
    const da = dst[3];
    const oa = sa + da * (1 - sa);
    if (oa <= 0) return [0, 0, 0, 0];
    return [
      (src[0] * sa + dst[0] * da * (1 - sa)) / oa,
      (src[1] * sa + dst[1] * da * (1 - sa)) / oa,
      (src[2] * sa + dst[2] * da * (1 - sa)) / oa,
      oa,
    ];
  }

  return encodePNG(size, size, rgba);
}

/* ----------------------------------------------------------------- ICO wrap */

function encodeICO(pngBuffers) {
  const count = pngBuffers.length;
  const header = Buffer.alloc(6 + 16 * count);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(count, 4);

  let offset = header.length;
  pngBuffers.forEach((png, i) => {
    const size = png.size >= 256 ? 0 : png.size;
    const e = 6 + 16 * i;
    header[e] = size;
    header[e + 1] = size;
    header[e + 2] = 0;
    header[e + 3] = 0;
    header.writeUInt16LE(1, e + 4);
    header.writeUInt16LE(32, e + 6);
    header.writeUInt32BE(0, e + 8);
    header.writeUInt32LE(png.buf.length, e + 8);
    header.writeUInt32LE(offset, e + 12);
    offset += png.buf.length;
  });

  return Buffer.concat([header, ...pngBuffers.map((p) => p.buf)]);
}

/* -------------------------------------------------------------------- build */

const plain = [16, 32, 48, 72, 96, 128, 144, 152, 192, 256, 384, 512];
for (const size of plain) {
  writeFileSync(join(OUT, `icon-${size}.png`), drawIcon(size, "any"));
}
for (const size of [192, 512]) {
  writeFileSync(join(OUT, `maskable-${size}.png`), drawIcon(size, "maskable"));
}
writeFileSync(join(OUT, "badge-72.png"), drawIcon(72, "badge"));
writeFileSync("public/apple-touch-icon.png", drawIcon(180, "any"));
writeFileSync(
  "public/favicon.ico",
  encodeICO([
    { size: 16, buf: drawIcon(16, "any") },
    { size: 32, buf: drawIcon(32, "any") },
    { size: 48, buf: drawIcon(48, "any") },
  ]),
);
writeFileSync("src/app/favicon.ico", encodeICO([{ size: 32, buf: drawIcon(32, "any") }]));

console.log(`icons written: ${plain.length + 3} png + favicon.ico + apple-touch-icon`);
