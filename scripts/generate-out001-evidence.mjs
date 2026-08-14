import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { encodePng, sha256, stableStringify } from './lib/pixel-fixtures.mjs';

const root = resolve(import.meta.dirname, '..');
const evidenceDir = resolve(root, 'pixelizer-codex-research/evidence/out-001');
mkdirSync(evidenceDir, { recursive: true });

// Load hero-factor-8x native PNG from geo-001 evidence
const heroNativeJsonPath = resolve(root, 'pixelizer-codex-research/evidence/geo-001/hero-factor-8x.json');
const heroNativeJson = JSON.parse(readFileSync(heroNativeJsonPath, 'utf8'));
const nativeW = heroNativeJson.width; // 96
const nativeH = heroNativeJson.height; // 168
const palette = heroNativeJson.palette;

// Reconstruct native RGBA from grid & palette
const nativeRgba = new Uint8ClampedArray(nativeW * nativeH * 4);
for (let y = 0; y < nativeH; y++) {
  for (let x = 0; x < nativeW; x++) {
    const idx = (y * nativeW + x) * 4;
    const colorIdx = heroNativeJson.grid[y][x];
    if (colorIdx >= 0 && palette[colorIdx]) {
      const col = palette[colorIdx];
      nativeRgba[idx] = col[0];
      nativeRgba[idx + 1] = col[1];
      nativeRgba[idx + 2] = col[2];
      nativeRgba[idx + 3] = 255;
    }
  }
}

function scaleRgbaNearest(srcRgba, sw, sh, scale) {
  const tw = sw * scale;
  const th = sh * scale;
  const out = new Uint8ClampedArray(tw * th * 4);
  for (let y = 0; y < th; y++) {
    const sy = Math.floor(y / scale);
    for (let x = 0; x < tw; x++) {
      const sx = Math.floor(x / scale);
      const srcIdx = (sy * sw + sx) * 4;
      const outIdx = (y * tw + x) * 4;
      out[outIdx] = srcRgba[srcIdx];
      out[outIdx + 1] = srcRgba[srcIdx + 1];
      out[outIdx + 2] = srcRgba[srcIdx + 2];
      out[outIdx + 3] = srcRgba[srcIdx + 3];
    }
  }
  return { width: tw, height: th, data: out };
}

function verifyBlockUniformity(srcRgba, sw, sh, scaledRgba, scale) {
  const tw = sw * scale;
  for (let sy = 0; sy < sh; sy++) {
    for (let sx = 0; sx < sw; sx++) {
      const srcIdx = (sy * sw + sx) * 4;
      const r = srcRgba[srcIdx];
      const g = srcRgba[srcIdx + 1];
      const b = srcRgba[srcIdx + 2];
      const a = srcRgba[srcIdx + 3];

      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          const outIdx = ((sy * scale + dy) * tw + (sx * scale + dx)) * 4;
          if (
            scaledRgba[outIdx] !== r ||
            scaledRgba[outIdx + 1] !== g ||
            scaledRgba[outIdx + 2] !== b ||
            scaledRgba[outIdx + 3] !== a
          ) {
            return false;
          }
        }
      }
    }
  }
  return true;
}

// Generate native, 2x, 4x, 8x outputs
const nativePng = encodePng(nativeW, nativeH, nativeRgba);
const scale2 = scaleRgbaNearest(nativeRgba, nativeW, nativeH, 2);
const scale4 = scaleRgbaNearest(nativeRgba, nativeW, nativeH, 4);
const scale8 = scaleRgbaNearest(nativeRgba, nativeW, nativeH, 8);

assert(verifyBlockUniformity(nativeRgba, nativeW, nativeH, scale2.data, 2), '2× block uniformity failed');
assert(verifyBlockUniformity(nativeRgba, nativeW, nativeH, scale4.data, 4), '4× block uniformity failed');
assert(verifyBlockUniformity(nativeRgba, nativeW, nativeH, scale8.data, 8), '8× block uniformity failed');

const png2x = encodePng(scale2.width, scale2.height, scale2.data);
const png4x = encodePng(scale4.width, scale4.height, scale4.data);
const png8x = encodePng(scale8.width, scale8.height, scale8.data);

const exportJson = {
  ...heroNativeJson,
  exports: {
    native: true,
    nearestScales: [2, 4, 8]
  }
};

writeFileSync(resolve(evidenceDir, 'hero_96x168.png'), nativePng);
writeFileSync(resolve(evidenceDir, 'hero_96x168_2x.png'), png2x);
writeFileSync(resolve(evidenceDir, 'hero_96x168_4x.png'), png4x);
writeFileSync(resolve(evidenceDir, 'hero_96x168_8x.png'), png8x);
writeFileSync(resolve(evidenceDir, 'hero_96x168.json'), stableStringify(exportJson));

const zipEntries = [
  { name: 'hero_96x168.png', size: nativePng.length, sha256: sha256(nativePng) },
  { name: 'hero_96x168_2x.png', size: png2x.length, sha256: sha256(png2x) },
  { name: 'hero_96x168_4x.png', size: png4x.length, sha256: sha256(png4x) },
  { name: 'hero_96x168_8x.png', size: png8x.length, sha256: sha256(png8x) },
  { name: 'hero_96x168.json', size: Buffer.byteLength(stableStringify(exportJson)), sha256: sha256(Buffer.from(stableStringify(exportJson))) },
];

const summary = {
  implementationId: 'OUT-001',
  generatedAt: new Date().toISOString(),
  blockUniformityPassed: true,
  deterministic: true,
  zipEntries,
  deterministicSha256: sha256(Buffer.from(stableStringify(zipEntries))),
};

writeFileSync(resolve(evidenceDir, 'summary.json'), stableStringify(summary));
console.log('OUT-001 evidence generated successfully:');
console.log(stableStringify(summary));
