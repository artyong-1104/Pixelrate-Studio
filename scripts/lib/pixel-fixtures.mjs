import { createHash } from 'node:crypto';

export const FIXTURE_SEED = 20260814;
export const GENERATOR_VERSION = 1;
export const FIXTURE_IDS = Object.freeze([
  'gradient-gray',
  'hard-edge-phase',
  'thin-lines',
  'alpha-edge',
  'low-contrast',
  'texture-checker',
  'clean-pixel-art',
  'ai-grid-wobble',
  'photo-like',
  'sprite-sheet',
  'animation-16',
  'non-square-factor',
]);

const PNG_SIGNATURE = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);
const CRC_TABLE = new Uint32Array(256);
for (let value = 0; value < 256; value++) {
  let crc = value;
  for (let bit = 0; bit < 8; bit++) crc = (crc & 1) ? (0xedb88320 ^ (crc >>> 1)) : (crc >>> 1);
  CRC_TABLE[value] = crc >>> 0;
}

function fnv1a(text) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function createPrng(seed) {
  let state = seed >>> 0 || 0x6d2b79f5;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x100000000;
  };
}

function makeFrame(width, height, rgba = [0, 0, 0, 0]) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < width * height; index++) data.set(rgba, index * 4);
  return data;
}

function setPixel(data, width, height, x, y, rgba) {
  if (x < 0 || y < 0 || x >= width || y >= height) return;
  data.set(rgba, (y * width + x) * 4);
}

function fillRect(data, width, height, x, y, rectWidth, rectHeight, rgba) {
  const x0 = Math.max(0, x);
  const y0 = Math.max(0, y);
  const x1 = Math.min(width, x + rectWidth);
  const y1 = Math.min(height, y + rectHeight);
  for (let py = y0; py < y1; py++) {
    for (let px = x0; px < x1; px++) setPixel(data, width, height, px, py, rgba);
  }
}

function fixture(id, width, height, frames, metadata) {
  return { id, width, height, frames, ...metadata };
}

function generateGradient() {
  const width = 256, height = 64;
  const data = makeFrame(width, height, [0, 0, 0, 255]);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const value = Math.round((x / (width - 1)) * 255);
      setPixel(data, width, height, x, y, [value, value, value, 255]);
    }
  }
  return fixture('gradient-gray', width, height, [data], {
    alphaKind: 'opaque', knownGrid: null,
    knownFeatures: { gradientAxis: 'x', endpoints: [0, 255] }, expectedFailure: [],
  });
}

function generateHardEdge() {
  const width = 192, height = 128;
  const periods = [3, 4, 8];
  const phase = 1;
  const data = makeFrame(width, height, [20, 24, 32, 255]);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const section = Math.min(2, Math.floor(x / 64));
      const localX = x - section * 64;
      const period = periods[section];
      const cellX = Math.floor((localX + phase) / period);
      const cellY = Math.floor((y + phase) / period);
      const light = (cellX + cellY) % 2 === 0;
      const base = 52 + section * 44;
      const value = light ? base + 70 : base;
      setPixel(data, width, height, x, y, [value, 50 + section * 50, 200 - section * 45, 255]);
    }
  }
  return fixture('hard-edge-phase', width, height, [data], {
    alphaKind: 'opaque', knownGrid: { periods, phaseX: phase, phaseY: phase },
    knownFeatures: { sections: 3 }, expectedFailure: [],
  });
}

function generateThinLines() {
  const width = 192, height = 192;
  const data = makeFrame(width, height);
  fillRect(data, width, height, 8, 20, 176, 1, [245, 245, 245, 255]);
  fillRect(data, width, height, 8, 40, 176, 2, [245, 210, 90, 255]);
  fillRect(data, width, height, 50, 8, 1, 176, [100, 220, 255, 255]);
  fillRect(data, width, height, 70, 8, 2, 176, [255, 130, 180, 255]);
  for (let x = 8; x < 184; x++) {
    setPixel(data, width, height, x, x, [190, 255, 120, 255]);
    setPixel(data, width, height, x, 100 + Math.round(Math.sin(x / 13) * 20), [255, 90, 90, 255]);
  }
  const thinFeaturePixels = countForeground(data, 10);
  return fixture('thin-lines', width, height, [data], {
    alphaKind: 'binary', knownGrid: null,
    knownFeatures: { thinFeaturePixels }, expectedFailure: [],
  });
}

function generateAlphaEdge() {
  const width = 128, height = 128;
  const data = makeFrame(width, height);
  const cx = 64, cy = 64;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const distance = Math.hypot(x - cx, y - cy);
      let alpha = 0;
      if (distance <= 32) alpha = 255;
      else if (distance < 48) alpha = Math.max(1, Math.round(((48 - distance) / 16) * 255));
      if (alpha > 0) setPixel(data, width, height, x, y, [235, 245, 255, alpha]);
    }
  }
  setPixel(data, width, height, 10, 10, [255, 255, 255, 255]);
  fillRect(data, width, height, 108, 14, 2, 1, [255, 255, 255, 255]);
  fillRect(data, width, height, 14, 109, 3, 1, [255, 255, 255, 255]);
  return fixture('alpha-edge', width, height, [data], {
    alphaKind: 'mixed', knownGrid: null,
    knownFeatures: { componentsAtThreshold10: 4, softEdgeLevels: 16, islandAreas: [1, 2, 3] },
    expectedFailure: [],
  });
}

function generateLowContrast() {
  const width = 160, height = 120;
  const data = makeFrame(width, height, [120, 122, 124, 255]);
  fillRect(data, width, height, 12, 12, 60, 44, [124, 126, 128, 255]);
  fillRect(data, width, height, 84, 18, 58, 32, [132, 134, 136, 255]);
  fillRect(data, width, height, 20, 75, 120, 2, [140, 142, 144, 255]);
  for (let x = 20; x < 140; x++) setPixel(data, width, height, x, 95 + Math.round(Math.sin(x / 9) * 4), [128, 130, 132, 255]);
  return fixture('low-contrast', width, height, [data], {
    alphaKind: 'opaque', knownGrid: null,
    knownFeatures: { rgbDeltas: [4, 8, 20] }, expectedFailure: ['low-edge-support'],
  });
}

function generateTexture(seed) {
  const width = 192, height = 128;
  const data = makeFrame(width, height, [0, 0, 0, 255]);
  const random = createPrng(seed ^ fnv1a('texture-checker'));
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const checker = (Math.floor(x / 4) + Math.floor(y / 4)) % 2;
      const ordered = ((x % 2) ^ (y % 2)) * 18;
      const noise = Math.floor(random() * 13) - 6;
      const base = checker ? 168 : 76;
      setPixel(data, width, height, x, y, [base + ordered + noise, 90 + ordered, 145 - ordered + noise, 255]);
    }
  }
  return fixture('texture-checker', width, height, [data], {
    alphaKind: 'opaque', knownGrid: { periods: [2, 4], phaseX: 0, phaseY: 0 },
    knownFeatures: { checkerSize: 4, ditherSize: 2 }, expectedFailure: [],
  });
}

function generateCleanPixelArt() {
  const width = 128, height = 128;
  const data = makeFrame(width, height);
  const block = 4;
  for (let ly = 8; ly < 24; ly++) {
    for (let lx = 8; lx < 24; lx++) {
      const dx = lx - 16;
      const dy = ly - 16;
      if ((dx * dx) / 52 + (dy * dy) / 72 > 1) continue;
      let color = [88, 168, 230, 255];
      if (ly < 12) color = [42, 54, 76, 255];
      if ((lx === 13 || lx === 19) && ly === 15) color = [250, 245, 210, 255];
      if (ly > 20) color = [55, 95, 160, 255];
      fillRect(data, width, height, lx * block, ly * block, block, block, color);
    }
  }
  return fixture('clean-pixel-art', width, height, [data], {
    alphaKind: 'binary', knownGrid: { periods: [4], phaseX: 0, phaseY: 0 },
    knownFeatures: { logicalBlockSize: 4 }, expectedFailure: [],
  });
}

function generateWobble(seed) {
  const width = 256, height = 256;
  const data = makeFrame(width, height, [25, 30, 42, 255]);
  const random = createPrng(seed ^ fnv1a('ai-grid-wobble'));
  const offsets = [-1, 0, 1];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const row = Math.floor(y / 8);
      const col = Math.floor(x / 8);
      const warpedX = x + offsets[row % 3];
      const warpedY = y + offsets[(col + 1) % 3];
      const cellX = Math.floor(warpedX / 8);
      const cellY = Math.floor(warpedY / 8);
      const edgeMix = Math.min(warpedX & 7, warpedY & 7) === 0 ? 18 : 0;
      const jitter = Math.floor(random() * 5);
      setPixel(data, width, height, x, y, [
        45 + ((cellX * 29 + cellY * 7) % 150) + edgeMix,
        40 + ((cellY * 31) % 145) + jitter,
        65 + ((cellX * 13) % 120),
        255,
      ]);
    }
  }
  return fixture('ai-grid-wobble', width, height, [data], {
    alphaKind: 'opaque', knownGrid: { periods: [8], phaseX: 0, phaseY: 0, wobble: 1 },
    knownFeatures: { maxBoundaryWobble: 1 }, expectedFailure: [],
  });
}

function generatePhotoLike(seed) {
  const width = 256, height = 192;
  const data = makeFrame(width, height, [0, 0, 0, 255]);
  const random = createPrng(seed ^ fnv1a('photo-like'));
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const nx = x / (width - 1), ny = y / (height - 1);
      const glow = Math.max(0, 1 - Math.hypot(nx - 0.62, ny - 0.38) * 2.2);
      const wave = Math.sin(x / 17) * Math.cos(y / 23) * 18;
      const noise = (random() - 0.5) * 12;
      setPixel(data, width, height, x, y, [
        38 + nx * 120 + glow * 62 + wave + noise,
        48 + ny * 110 + glow * 48 - wave * 0.3 + noise,
        72 + (1 - nx) * 90 + glow * 32 + noise,
        255,
      ]);
    }
  }
  return fixture('photo-like', width, height, [data], {
    alphaKind: 'opaque', knownGrid: null,
    knownFeatures: { expectedGrid: false }, expectedFailure: ['grid-not-present'],
  });
}

function generateSpriteSheet() {
  const width = 256, height = 128;
  const frameWidth = 64, frameHeight = 64;
  const data = makeFrame(width, height);
  for (let frameIndex = 0; frameIndex < 8; frameIndex++) {
    const frameX = (frameIndex % 4) * frameWidth;
    const frameY = Math.floor(frameIndex / 4) * frameHeight;
    fillRect(data, width, height, frameX + 2, frameY + 2, 60, 60, [20, 24, 36, 70]);
    fillRect(data, width, height, frameX + 8 + frameIndex * 3, frameY + 25, 12, 12, [80, 190, 250, 255]);
    fillRect(data, width, height, frameX + 28, frameY + 16 + (frameIndex % 3) * 4, 14, 22, [250, 130, 90, 255]);
    setPixel(data, width, height, frameX + 63, frameY + 32, [255, 255, 255, 255]);
  }
  return fixture('sprite-sheet', width, height, [data], {
    alphaKind: 'mixed', knownGrid: { periods: [4], phaseX: 0, phaseY: 0 },
    knownFeatures: { frameWidth, frameHeight, columns: 4, rows: 2, frameCount: 8 },
    expectedFailure: [],
  });
}

function generateAnimation() {
  const width = 64, height = 64;
  const frames = [];
  for (let frameIndex = 0; frameIndex < 16; frameIndex++) {
    const data = makeFrame(width, height);
    fillRect(data, width, height, 2, 2, 8, 8, [70, 140, 255, 255]);
    fillRect(data, width, height, 8 + frameIndex * 2, 28 + Math.round(Math.sin(frameIndex / 2) * 5), 8, 8, [245, 90, 90, 255]);
    fillRect(data, width, height, 40, 16, 6, 6, [60 + frameIndex * 8, 220 - frameIndex * 5, 100, frameIndex % 2 ? 255 : 180]);
    frames.push(data);
  }
  return fixture('animation-16', width, height, frames, {
    alphaKind: 'mixed', knownGrid: { periods: [1], phaseX: 0, phaseY: 0 },
    knownFeatures: { frameCount: 16, staticRect: [2, 2, 8, 8] }, expectedFailure: [],
  });
}

function generateNonSquare() {
  const width = 480, height = 702;
  const data = makeFrame(width, height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const lx = Math.floor(x / 3), ly = Math.floor(y / 3);
      const dx = (lx - 80) / 58;
      const dy = (ly - 117) / 96;
      if (dx * dx + dy * dy > 1) continue;
      let color = [68 + ((ly / 8) % 4) * 8, 120 + ((lx / 12) % 4) * 12, 190, 255];
      if (ly < 55) color = [52, 62, 82, 255];
      if (ly > 176) color = [38, 72, 125, 255];
      if ((lx === 65 || lx === 95) && ly >= 96 && ly <= 99) color = [250, 240, 190, 255];
      setPixel(data, width, height, x, y, color);
    }
  }
  return fixture('non-square-factor', width, height, [data], {
    alphaKind: 'binary', knownGrid: { periods: [3], phaseX: 0, phaseY: 0 },
    knownFeatures: { factor: 3, logicalWidth: 160, logicalHeight: 234 }, expectedFailure: [],
  });
}

export function generateCorpus({ seed = FIXTURE_SEED, generatorVersion = GENERATOR_VERSION } = {}) {
  if (!Number.isInteger(seed)) throw new TypeError('seed must be an integer');
  if (!Number.isInteger(generatorVersion) || generatorVersion < 1) throw new TypeError('generatorVersion must be a positive integer');
  const saltedSeed = (seed ^ Math.imul(generatorVersion, 0x9e3779b1)) >>> 0;
  return [
    generateGradient(), generateHardEdge(), generateThinLines(), generateAlphaEdge(),
    generateLowContrast(), generateTexture(saltedSeed), generateCleanPixelArt(),
    generateWobble(saltedSeed), generatePhotoLike(saltedSeed), generateSpriteSheet(),
    generateAnimation(), generateNonSquare(),
  ].sort((left, right) => left.id.localeCompare(right.id));
}

function uint32be(value) {
  return Uint8Array.from([(value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255]);
}

function uint16le(value) {
  return Uint8Array.from([value & 255, (value >>> 8) & 255]);
}

function concatBytes(parts) {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function adler32(bytes) {
  let a = 1, b = 0;
  for (const byte of bytes) {
    a = (a + byte) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

function zlibStored(bytes) {
  const blocks = [Uint8Array.from([0x78, 0x01])];
  for (let offset = 0; offset < bytes.length;) {
    const length = Math.min(65535, bytes.length - offset);
    const final = offset + length === bytes.length;
    blocks.push(Uint8Array.from([final ? 1 : 0]));
    blocks.push(uint16le(length));
    blocks.push(uint16le((~length) & 0xffff));
    blocks.push(bytes.subarray(offset, offset + length));
    offset += length;
  }
  blocks.push(uint32be(adler32(bytes)));
  return concatBytes(blocks);
}

function pngChunk(type, data) {
  const typeBytes = new TextEncoder().encode(type);
  const body = concatBytes([typeBytes, data]);
  return concatBytes([uint32be(data.length), body, uint32be(crc32(body))]);
}

export function encodePng(width, height, rgba) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new RangeError('PNG dimensions must be positive integers');
  }
  if (!(rgba instanceof Uint8Array || rgba instanceof Uint8ClampedArray) || rgba.length !== width * height * 4) {
    throw new TypeError('RGBA byte length does not match PNG dimensions');
  }
  const scanlines = new Uint8Array(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    const target = y * (1 + width * 4);
    scanlines[target] = 0;
    scanlines.set(rgba.subarray(y * width * 4, (y + 1) * width * 4), target + 1);
  }
  const ihdr = concatBytes([uint32be(width), uint32be(height), Uint8Array.from([8, 6, 0, 0, 0])]);
  return concatBytes([
    PNG_SIGNATURE,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlibStored(scanlines)),
    pngChunk('IEND', new Uint8Array()),
  ]);
}

export function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function hashParts(parts) {
  const hash = createHash('sha256');
  for (const part of parts) {
    hash.update(uint32be(part.length));
    hash.update(part);
  }
  return hash.digest('hex');
}

export function encodeFixtureFrames(item) {
  return item.frames.map(frame => encodePng(item.width, item.height, frame));
}

export function fixtureHashes(item) {
  const pngs = encodeFixtureFrames(item);
  return {
    rgbaSha256: hashParts(item.frames),
    pngSha256: hashParts(pngs),
    framePngSha256: pngs.map(sha256),
    pngBytes: pngs.reduce((sum, png) => sum + png.length, 0),
  };
}

export function countForeground(data, threshold = 10) {
  let count = 0;
  for (let index = 3; index < data.length; index += 4) if (data[index] >= threshold) count++;
  return count;
}

export function countComponents(data, width, height, threshold = 10) {
  const visited = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  let components = 0;
  for (let start = 0; start < width * height; start++) {
    if (visited[start] || data[start * 4 + 3] < threshold) continue;
    components++;
    let head = 0, tail = 0;
    queue[tail++] = start;
    visited[start] = 1;
    while (head < tail) {
      const index = queue[head++];
      const x = index % width, y = Math.floor(index / width);
      const neighbors = [index - width, index + width, index - 1, index + 1];
      for (let n = 0; n < neighbors.length; n++) {
        const next = neighbors[n];
        if (next < 0 || next >= width * height) continue;
        if (n === 2 && x === 0) continue;
        if (n === 3 && x === width - 1) continue;
        if (visited[next] || data[next * 4 + 3] < threshold) continue;
        visited[next] = 1;
        queue[tail++] = next;
      }
    }
  }
  return components;
}

function countPartialAlpha(data) {
  let count = 0;
  for (let index = 3; index < data.length; index += 4) if (data[index] > 0 && data[index] < 255) count++;
  return count;
}

function uniqueForegroundColors(data, threshold = 10) {
  const colors = new Set();
  for (let index = 0; index < data.length; index += 4) {
    if (data[index + 3] < threshold) continue;
    colors.add(`${data[index]},${data[index + 1]},${data[index + 2]}`);
  }
  return colors.size;
}

function temporalChangedRatio(item, rect = null) {
  if (item.frames.length < 2) return null;
  let changed = 0, compared = 0;
  const [rx, ry, rw, rh] = rect ?? [0, 0, item.width, item.height];
  for (let frameIndex = 1; frameIndex < item.frames.length; frameIndex++) {
    const previous = item.frames[frameIndex - 1];
    const current = item.frames[frameIndex];
    for (let y = ry; y < ry + rh; y++) {
      for (let x = rx; x < rx + rw; x++) {
        const index = (y * item.width + x) * 4;
        compared++;
        if (
          previous[index] !== current[index] || previous[index + 1] !== current[index + 1] ||
          previous[index + 2] !== current[index + 2] || previous[index + 3] !== current[index + 3]
        ) changed++;
      }
    }
  }
  return compared === 0 ? null : Number((changed / compared).toFixed(6));
}

export function computeFixtureMetrics(item) {
  const first = item.frames[0];
  const knownGrid = item.knownGrid;
  const staticRect = item.knownFeatures?.staticRect ?? null;
  return {
    periodError: knownGrid ? 0 : null,
    phaseError: knownGrid ? 0 : null,
    thinFeatureSurvival: item.id === 'thin-lines' ? 1 : null,
    connectedComponents: countComponents(first, item.width, item.height, 10),
    fringeCount: 0,
    partialAlphaCount: countPartialAlpha(first),
    paletteUniqueColors: uniqueForegroundColors(first),
    temporalChangedPixelRatio: temporalChangedRatio(item),
    staticTemporalChangedPixelRatio: staticRect ? temporalChangedRatio(item, staticRect) : null,
  };
}

export function createContactSheet(corpus, { tileWidth = 200, tileHeight = 200, columns = 4 } = {}) {
  const rows = Math.ceil(corpus.length / columns);
  const width = columns * tileWidth;
  const height = rows * tileHeight;
  const data = makeFrame(width, height, [28, 31, 40, 255]);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if ((Math.floor(x / 8) + Math.floor(y / 8)) % 2 === 0) setPixel(data, width, height, x, y, [38, 42, 54, 255]);
    }
  }
  for (let index = 0; index < corpus.length; index++) {
    const item = corpus[index];
    const tileX = (index % columns) * tileWidth;
    const tileY = Math.floor(index / columns) * tileHeight;
    fillRect(data, width, height, tileX, tileY, tileWidth, 6, [70 + index * 11, 220 - index * 8, 120 + index * 5, 255]);
    const maxWidth = tileWidth - 20, maxHeight = tileHeight - 20;
    const scale = Math.min(maxWidth / item.width, maxHeight / item.height);
    const drawWidth = Math.max(1, Math.floor(item.width * scale));
    const drawHeight = Math.max(1, Math.floor(item.height * scale));
    const offsetX = tileX + Math.floor((tileWidth - drawWidth) / 2);
    const offsetY = tileY + 10 + Math.floor((tileHeight - 10 - drawHeight) / 2);
    const source = item.frames[Math.min(item.frames.length - 1, Math.floor(item.frames.length / 2))];
    for (let y = 0; y < drawHeight; y++) {
      const sy = Math.min(item.height - 1, Math.floor(y / scale));
      for (let x = 0; x < drawWidth; x++) {
        const sx = Math.min(item.width - 1, Math.floor(x / scale));
        const sourceIndex = (sy * item.width + sx) * 4;
        const alpha = source[sourceIndex + 3] / 255;
        const targetX = offsetX + x, targetY = offsetY + y;
        const targetIndex = (targetY * width + targetX) * 4;
        for (let channel = 0; channel < 3; channel++) {
          data[targetIndex + channel] = Math.round(source[sourceIndex + channel] * alpha + data[targetIndex + channel] * (1 - alpha));
        }
        data[targetIndex + 3] = 255;
      }
    }
  }
  return { width, height, data };
}

export function stableStringify(value, indentation = 2) {
  const normalize = input => {
    if (Array.isArray(input)) return input.map(normalize);
    if (input && typeof input === 'object') {
      return Object.fromEntries(Object.keys(input).sort().map(key => [key, normalize(input[key])]));
    }
    return input;
  };
  return `${JSON.stringify(normalize(value), null, indentation)}\n`;
}

export function validateManifest(manifest) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) throw new TypeError('manifest must be an object');
  if (manifest.schemaVersion !== 1) throw new Error('manifest.schemaVersion must be 1');
  if (!Number.isInteger(manifest.generatorVersion) || manifest.generatorVersion < 1) throw new Error('manifest.generatorVersion must be a positive integer');
  if (!Number.isInteger(manifest.seed)) throw new Error('manifest.seed must be an integer');
  if (!Array.isArray(manifest.baselines) || manifest.baselines.length !== 2) {
    throw new Error('manifest.baselines must contain the two current app baselines');
  }
  const baselineIds = new Set();
  for (const baseline of manifest.baselines) {
    if (!baseline || typeof baseline !== 'object' || typeof baseline.id !== 'string') throw new Error('baseline entry is invalid');
    if (baselineIds.has(baseline.id)) throw new Error(`Duplicate baseline id: ${baseline.id}`);
    baselineIds.add(baseline.id);
    if (!FIXTURE_IDS.includes(baseline.fixtureId)) throw new Error(`${baseline.id} fixtureId is invalid`);
    if (!baseline.settings || typeof baseline.settings !== 'object') throw new Error(`${baseline.id} settings are required`);
    if (!Number.isInteger(baseline.width) || !Number.isInteger(baseline.height) || baseline.width <= 0 || baseline.height <= 0) {
      throw new Error(`${baseline.id} dimensions must be positive integers`);
    }
    if (!Number.isInteger(baseline.paletteSize) || baseline.paletteSize < 1) throw new Error(`${baseline.id} paletteSize is invalid`);
    for (const hash of ['rgbaSha256', 'jsonSha256', 'pngSha256']) {
      if (!/^[a-f0-9]{64}$/.test(baseline.expected?.[hash] ?? '')) throw new Error(`${baseline.id} ${hash} is invalid`);
    }
  }
  if (!Array.isArray(manifest.fixtures) || manifest.fixtures.length !== FIXTURE_IDS.length) {
    throw new Error(`manifest.fixtures must contain ${FIXTURE_IDS.length} entries`);
  }
  const orderedIds = manifest.fixtures.map(entry => entry.id);
  const sortedIds = [...orderedIds].sort((left, right) => left.localeCompare(right));
  if (orderedIds.some((id, index) => id !== sortedIds[index])) throw new Error('manifest fixture ids must be in ascending order');
  const ids = new Set();
  for (const entry of manifest.fixtures) {
    if (!entry || typeof entry !== 'object') throw new Error('fixture entry must be an object');
    if (!FIXTURE_IDS.includes(entry.id)) throw new Error(`Unknown fixture id: ${String(entry.id)}`);
    if (ids.has(entry.id)) throw new Error(`Duplicate fixture id: ${entry.id}`);
    ids.add(entry.id);
    if (!Number.isInteger(entry.width) || !Number.isInteger(entry.height) || entry.width <= 0 || entry.height <= 0) {
      throw new Error(`${entry.id} dimensions must be positive integers`);
    }
    if (!['opaque', 'binary', 'mixed'].includes(entry.alphaKind)) throw new Error(`${entry.id} alphaKind is invalid`);
    if (!('knownGrid' in entry) || !entry.knownFeatures || typeof entry.knownFeatures !== 'object') {
      throw new Error(`${entry.id} knownGrid and knownFeatures are required`);
    }
    if (!Array.isArray(entry.expectedFailure)) throw new Error(`${entry.id} expectedFailure must be an array`);
    if (!entry.expected || !/^[a-f0-9]{64}$/.test(entry.expected.rgbaSha256 ?? '') || !/^[a-f0-9]{64}$/.test(entry.expected.pngSha256 ?? '')) {
      throw new Error(`${entry.id} expected hashes are invalid`);
    }
  }
  if (ids.size !== FIXTURE_IDS.length) throw new Error('manifest fixture ids are incomplete');
  return manifest;
}

export function manifestFromCorpus(corpus, { seed = FIXTURE_SEED, generatorVersion = GENERATOR_VERSION } = {}) {
  return {
    schemaVersion: 1,
    generatorVersion,
    seed,
    fixtures: corpus.map(item => {
      const hashes = fixtureHashes(item);
      return {
        id: item.id,
        generatorVersion,
        width: item.width,
        height: item.height,
        frameCount: item.frames.length,
        alphaKind: item.alphaKind,
        knownGrid: item.knownGrid,
        knownFeatures: item.knownFeatures,
        expectedFailure: item.expectedFailure,
        expected: { rgbaSha256: hashes.rgbaSha256, pngSha256: hashes.pngSha256 },
      };
    }),
  };
}
