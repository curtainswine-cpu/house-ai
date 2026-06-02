/* Generates JARVIS app icons (arc-reactor on navy) as PNGs — no deps.
   Run with: node scripts/make-icons.js  */
const fs = require("fs");
const zlib = require("zlib");
const path = require("path");

function crc32(buf) {
  const table = crc32.t || (crc32.t = (() => {
    const t = [];
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })());
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}

function encodePNG(size, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit, RGBA
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))]);
}

function makeIcon(size) {
  const rgba = Buffer.alloc(size * size * 4);
  const cx = size / 2, cy = size / 2;
  const rCore = size * 0.14, gap = size * 0.045, rRing = size * 0.30, ringW = size * 0.05;
  const navy = [10, 14, 22], cyan = [70, 214, 245], white = [216, 247, 255];
  const mix = (a, b, t) => [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - cx, dy = y - cy, d = Math.sqrt(dx * dx + dy * dy);
      let col = navy;
      if (d < rCore) {
        col = mix(white, cyan, d / rCore);             // glowing core
      } else if (d < rCore + gap) {
        col = navy;                                     // gap
      } else if (Math.abs(d - rRing) < ringW) {
        col = cyan;                                     // outer ring
      } else if (d > rCore && d < rRing + size * 0.13) {
        const g = Math.max(0, 1 - Math.abs(d - rRing) / (size * 0.13));
        col = mix(navy, cyan, 0.16 * g);                // soft glow
      }
      const i = (y * size + x) * 4;
      rgba[i] = col[0]; rgba[i + 1] = col[1]; rgba[i + 2] = col[2]; rgba[i + 3] = 255;
    }
  }
  return encodePNG(size, rgba);
}

const outDir = path.join(__dirname, "..", "icons");
fs.mkdirSync(outDir, { recursive: true });
[[192, "icon-192.png"], [512, "icon-512.png"], [180, "icon-180.png"], [32, "favicon.png"]]
  .forEach(([s, name]) => { fs.writeFileSync(path.join(outDir, name), makeIcon(s)); console.log("wrote", name); });
