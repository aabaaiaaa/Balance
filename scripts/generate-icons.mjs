import { writeFileSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const require = createRequire(import.meta.url);

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Generate a simple PNG icon programmatically
// Creates a minimal valid PNG with a solid indigo background
function createPNG(size) {
  const r = 79,
    g = 70,
    b = 229; // #4f46e5 (indigo-600)

  // PNG signature
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR chunk
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(size, 0); // width
  ihdrData.writeUInt32BE(size, 4); // height
  ihdrData.writeUInt8(8, 8); // bit depth
  ihdrData.writeUInt8(2, 9); // color type (RGB)
  ihdrData.writeUInt8(0, 10); // compression
  ihdrData.writeUInt8(0, 11); // filter
  ihdrData.writeUInt8(0, 12); // interlace
  const ihdrChunk = createChunk("IHDR", ihdrData);

  // IDAT chunk - raw pixel data with zlib
  const rawRows = [];
  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * 3);
    row[0] = 0; // no filter
    for (let x = 0; x < size; x++) {
      const offset = 1 + x * 3;
      row[offset] = r;
      row[offset + 1] = g;
      row[offset + 2] = b;
    }
    rawRows.push(row);
  }
  const rawData = Buffer.concat(rawRows);

  const { deflateSync } = require("zlib");
  const compressed = deflateSync(rawData);
  const idatChunk = createChunk("IDAT", compressed);

  // IEND chunk
  const iendChunk = createChunk("IEND", Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

function createChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);

  const typeBuffer = Buffer.from(type, "ascii");
  const crcData = Buffer.concat([typeBuffer, data]);
  const crc = crc32(crcData);
  const crcBuffer = Buffer.alloc(4);
  crcBuffer.writeUInt32BE(crc, 0);

  return Buffer.concat([length, typeBuffer, data, crcBuffer]);
}

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      if (crc & 1) {
        crc = (crc >>> 1) ^ 0xedb88320;
      } else {
        crc >>>= 1;
      }
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

const iconsDir = resolve(__dirname, "../public/icons");
mkdirSync(iconsDir, { recursive: true });

// Standard icon sizes for PWA
const sizes = [72, 96, 128, 144, 152, 192, 384, 512];
for (const size of sizes) {
  const png = createPNG(size);
  const outPath = resolve(iconsDir, `icon-${size}x${size}.png`);
  writeFileSync(outPath, png);
  console.log(`Generated ${outPath} (${png.length} bytes)`);
}

// Maskable icons (separate files for manifest purpose separation)
const maskableSizes = [192, 512];
for (const size of maskableSizes) {
  const png = createPNG(size);
  const outPath = resolve(iconsDir, `maskable-${size}x${size}.png`);
  writeFileSync(outPath, png);
  console.log(`Generated maskable ${outPath} (${png.length} bytes)`);
}
