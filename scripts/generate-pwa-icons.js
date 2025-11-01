const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const SOURCE_ICON = path.resolve(__dirname, '../assets/icons/app-icon-source.png');
const OUTPUT_DIR = path.resolve(__dirname, '../frontend/public/icons');

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const STANDARD_SIZES = [64, 128, 192, 256, 384, 512, 1024];
const MASKABLE_SIZES = [192, 512, 1024];

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0 ^ -1;
  for (let i = 0; i < buffer.length; i += 1) {
    crc = (crc >>> 8) ^ crcTable[(crc ^ buffer[i]) & 0xff];
  }
  return (crc ^ -1) >>> 0;
}

function chunk(type, data) {
  const typeBuffer = Buffer.from(type, 'ascii');
  const lengthBuffer = Buffer.alloc(4);
  lengthBuffer.writeUInt32BE(data.length, 0);
  const crcBuffer = Buffer.alloc(4);
  const crcValue = crc32(Buffer.concat([typeBuffer, data]));
  crcBuffer.writeUInt32BE(crcValue >>> 0, 0);
  return Buffer.concat([lengthBuffer, typeBuffer, data, crcBuffer]);
}

function paethPredictor(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) {
    return a;
  }
  if (pb <= pc) {
    return b;
  }
  return c;
}

function decodePng(filePath) {
  const buffer = fs.readFileSync(filePath);
  if (!buffer.slice(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error(`${filePath} is not a PNG file`);
  }

  let offset = 8;
  let width;
  let height;
  let bitDepth;
  let colorType;
  let interlaceMethod;
  const idatChunks = [];

  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    offset += 4;
    const type = buffer.toString('ascii', offset, offset + 4);
    offset += 4;
    const data = buffer.slice(offset, offset + length);
    offset += length;
    offset += 4; // skip CRC

    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data.readUInt8(8);
      colorType = data.readUInt8(9);
      interlaceMethod = data.readUInt8(12);
    } else if (type === 'IDAT') {
      idatChunks.push(data);
    } else if (type === 'IEND') {
      break;
    }
  }

  if (bitDepth !== 8 || colorType !== 6) {
    throw new Error('Only 8-bit RGBA PNGs are supported for decoding');
  }
  if (interlaceMethod !== 0) {
    throw new Error('Interlaced PNGs are not supported');
  }

  const compressed = Buffer.concat(idatChunks);
  const decompressed = zlib.inflateSync(compressed);
  const bytesPerPixel = 4;
  const bytesPerLine = width * bytesPerPixel;

  const data = new Uint8Array(width * height * bytesPerPixel);
  const prevLine = new Uint8Array(bytesPerLine);
  const currLine = new Uint8Array(bytesPerLine);
  let srcOffset = 0;

  for (let y = 0; y < height; y += 1) {
    const filterType = decompressed[srcOffset];
    srcOffset += 1;
    const raw = decompressed.subarray(srcOffset, srcOffset + bytesPerLine);
    srcOffset += bytesPerLine;

    unfilterLine(filterType, raw, currLine, prevLine, bytesPerPixel);
    data.set(currLine, y * bytesPerLine);
    prevLine.set(currLine);
  }

  return { width, height, data };
}

function unfilterLine(filterType, raw, output, prevLine, bytesPerPixel) {
  switch (filterType) {
    case 0:
      output.set(raw);
      break;
    case 1:
      for (let i = 0; i < raw.length; i += 1) {
        const left = i >= bytesPerPixel ? output[i - bytesPerPixel] : 0;
        output[i] = (raw[i] + left) & 0xff;
      }
      break;
    case 2:
      for (let i = 0; i < raw.length; i += 1) {
        const up = prevLine[i];
        output[i] = (raw[i] + up) & 0xff;
      }
      break;
    case 3:
      for (let i = 0; i < raw.length; i += 1) {
        const left = i >= bytesPerPixel ? output[i - bytesPerPixel] : 0;
        const up = prevLine[i];
        output[i] = (raw[i] + Math.floor((left + up) / 2)) & 0xff;
      }
      break;
    case 4:
      for (let i = 0; i < raw.length; i += 1) {
        const left = i >= bytesPerPixel ? output[i - bytesPerPixel] : 0;
        const up = prevLine[i];
        const upLeft = i >= bytesPerPixel ? prevLine[i - bytesPerPixel] : 0;
        const predictor = paethPredictor(left, up, upLeft);
        output[i] = (raw[i] + predictor) & 0xff;
      }
      break;
    default:
      throw new Error(`Unsupported PNG filter type: ${filterType}`);
  }
}

function encodePng(width, height, data) {
  const bytesPerPixel = 4;
  const bytesPerLine = width * bytesPerPixel;
  const filtered = Buffer.alloc((bytesPerLine + 1) * height);

  for (let y = 0; y < height; y += 1) {
    const srcOffset = y * bytesPerLine;
    const destOffset = y * (bytesPerLine + 1);
    filtered[destOffset] = 0;
    filtered.set(data.subarray(srcOffset, srcOffset + bytesPerLine), destOffset + 1);
  }

  const compressed = zlib.deflateSync(filtered, { level: 9 });
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.writeUInt8(8, 8); // bit depth
  ihdr.writeUInt8(6, 9); // color type RGBA
  ihdr.writeUInt8(0, 10); // compression
  ihdr.writeUInt8(0, 11); // filter
  ihdr.writeUInt8(0, 12); // interlace

  return Buffer.concat([
    PNG_SIGNATURE,
    chunk('IHDR', ihdr),
    chunk('IDAT', compressed),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

function resizeBilinear(srcData, srcWidth, srcHeight, destSize) {
  if (srcWidth === destSize && srcHeight === destSize) {
    return srcData;
  }

  const destWidth = destSize;
  const destHeight = destSize;
  const destData = new Uint8Array(destWidth * destHeight * 4);
  const xRatio = srcWidth / destWidth;
  const yRatio = srcHeight / destHeight;

  for (let y = 0; y < destHeight; y += 1) {
    const sy = (y + 0.5) * yRatio - 0.5;
    const y0 = Math.max(Math.floor(sy), 0);
    const y1 = Math.min(y0 + 1, srcHeight - 1);
    const wy = sy - y0;

    for (let x = 0; x < destWidth; x += 1) {
      const sx = (x + 0.5) * xRatio - 0.5;
      const x0 = Math.max(Math.floor(sx), 0);
      const x1 = Math.min(x0 + 1, srcWidth - 1);
      const wx = sx - x0;

      const idx = (y * destWidth + x) * 4;
      const i00 = (y0 * srcWidth + x0) * 4;
      const i10 = (y0 * srcWidth + x1) * 4;
      const i01 = (y1 * srcWidth + x0) * 4;
      const i11 = (y1 * srcWidth + x1) * 4;

      if (x0 === x1 && y0 === y1) {
        destData.set(srcData.subarray(i00, i00 + 4), idx);
        continue;
      }

      const w00 = (1 - wx) * (1 - wy);
      const w10 = wx * (1 - wy);
      const w01 = (1 - wx) * wy;
      const w11 = wx * wy;

      for (let channel = 0; channel < 4; channel += 1) {
        const value =
          srcData[i00 + channel] * w00 +
          srcData[i10 + channel] * w10 +
          srcData[i01 + channel] * w01 +
          srcData[i11 + channel] * w11;
        destData[idx + channel] = Math.round(value);
      }
    }
  }

  return destData;
}

function ensureOutputDir() {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }
}

function main() {
  if (!fs.existsSync(SOURCE_ICON)) {
    throw new Error(`Source icon not found: ${SOURCE_ICON}`);
  }

  ensureOutputDir();
  const source = decodePng(SOURCE_ICON);

  if (source.width !== source.height) {
    console.warn(`Warning: source icon is not square (${source.width}x${source.height}). Output icons may be distorted.`);
  }

  const cache = new Map();
  cache.set(source.width, source.data);

  const writeIcon = (filename, size) => {
    if (!cache.has(size)) {
      cache.set(size, resizeBilinear(source.data, source.width, source.height, size));
    }
    const pixels = cache.get(size);
    const png = encodePng(size, size, pixels);
    const outputPath = path.join(OUTPUT_DIR, filename);
    fs.writeFileSync(outputPath, png);
    console.log(`Generated ${filename} (${size}x${size})`);
  };

  for (const size of STANDARD_SIZES) {
    writeIcon(`pwa-icon-${size}.png`, size);
  }

  for (const size of MASKABLE_SIZES) {
    writeIcon(`pwa-icon-maskable-${size}.png`, size);
  }
}

main();
