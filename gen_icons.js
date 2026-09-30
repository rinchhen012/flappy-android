// Self-contained PNG generator (no external deps) for launcher icons.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}
function encodePNG(width, height, rgba) {
  // rgba: Uint8Array length width*height*4
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // color type RGBA
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  // Add filter byte (0) per scanline
  const raw = Buffer.alloc((width * 4 + 1) * height);
  let o = 0;
  for (let y = 0; y < height; y++) {
    raw[o++] = 0;
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      raw[o++] = rgba[i];
      raw[o++] = rgba[i + 1];
      raw[o++] = rgba[i + 2];
      raw[o++] = rgba[i + 3];
    }
  }
  const idat = zlib.deflateSync(raw, 9);
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

function drawIcon(size) {
  const px = new Uint8Array(size * size * 4);
  const cx = size / 2, cy = size / 2;
  const r = size * 0.42; // bird body radius
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      // Sky gradient background
      const t = y / size;
      const bgR = Math.round(78 + (0 - 78) * t);   // #4ec0ca -> #00c2cf-ish
      const bgG = Math.round(192 + (194 - 192) * t);
      const bgB = Math.round(202 + (255 - 202) * t);
      let R = bgR, G = bgG, B = bgB, A = 255;
      const dx = x - cx, dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist <= r) {
        // Yellow bird body
        R = 247; G = 213; B = 29;
        // Wing (offset ellipse)
        const wx = (x - (cx - r * 0.25)) / (r * 0.5);
        const wy = (y - (cy + r * 0.15)) / (r * 0.32);
        if (wx * wx + wy * wy <= 1) { R = 232; G = 164; B = 35; }
        // Eye white
        const ex = x - (cx + r * 0.35), ey = y - (cy - r * 0.35);
        if (Math.sqrt(ex * ex + ey * ey) <= r * 0.22) { R = 255; G = 255; B = 255; }
        // Pupil
        const pxp = x - (cx + r * 0.42), pyp = y - (cy - r * 0.35);
        if (Math.sqrt(pxp * pxp + pyp * pyp) <= r * 0.11) { R = 0; G = 0; B = 0; }
        // Beak (triangle to the right)
        if (x > cx + r * 0.55 && x < cx + r * 0.92 &&
            y > cy - r * 0.18 && y < cy + r * 0.18) {
          R = 245; G = 127; B = 23;
        }
      } else {
        // Outside bird: keep sky gradient
      }
      px[i] = R; px[i + 1] = G; px[i + 2] = B; px[i + 3] = A;
    }
  }
  return px;
}

const sizes = { 'mipmap-mdpi': 48, 'mipmap-hdpi': 72, 'mipmap-xhdpi': 96, 'mipmap-xxhdpi': 144, 'mipmap-xxxhdpi': 192 };
const outRoot = path.join(__dirname, 'app', 'src', 'main', 'res');
for (const [dir, sz] of Object.entries(sizes)) {
  const dirPath = path.join(outRoot, dir);
  fs.mkdirSync(dirPath, { recursive: true });
  const px = drawIcon(sz);
  fs.writeFileSync(path.join(dirPath, 'ic_launcher.png'), encodePNG(sz, sz, px));
  console.log('wrote', dir, sz + 'x' + sz);
}

// Also generate a 512x512 hi-res for reference / Play Store listing
fs.mkdirSync(path.join(__dirname, 'listing'), { recursive: true });
fs.writeFileSync(path.join(__dirname, 'listing', 'icon-512.png'), encodePNG(512, 512, drawIcon(512)));
console.log('wrote listing/icon-512.png (for Play Store console, uploaded separately)');