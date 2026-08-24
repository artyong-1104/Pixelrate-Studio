import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  encodePng,
  generateCorpus,
  sha256,
  stableStringify,
} from './lib/pixel-fixtures.mjs';
import { extractInlineFunctions } from './lib/extract-inline-function.mjs';
import vm from 'node:vm';

const root = resolve(import.meta.dirname, '..');
const html = readFileSync(resolve(root, 'pixelate_studio.html'), 'utf8');
const evidenceDir = resolve(root, 'pixelizer-codex-research/evidence/geo-001');
mkdirSync(evidenceDir, { recursive: true });

const functionNames = [
  'normalizeRepresentativeColor',
  'srgbChannelToLinear',
  'linearChannelToSrgb',
  'representativeMedian',
  'representativeColorForCell',
  'exactFactorDownscale',
  'kmeans',
  'collectOpaquePoints',
  'nearestColorIndex',
  'cleanIsolated',
  'cleanPreserveSheet',
  'outlinePreserveSheet',
  'getFactorValidationError',
];

const context = {
  Array,
  Math,
  Map,
  Number,
  Object,
  parseInt,
  Uint8ClampedArray,
  MAX_PALETTE_SAMPLES: 50000,
  getRawPixels: img => ({ data: img.data, width: img.width, height: img.height }),
};
vm.createContext(context);
const extracted = extractInlineFunctions(html, functionNames).join('\n');
vm.runInContext(`${extracted}\nglobalThis.api = { ${functionNames.join(', ')} };`, context);
const api = context.api;

function renderIndexed(grid, alpha, palette, width, height, threshold = 10) {
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < width * height; index++) {
    const paletteIndex = grid[index];
    if (paletteIndex < 0 || alpha[index] < threshold) continue;
    const color = palette[paletteIndex];
    const offset = index * 4;
    rgba[offset] = color[0];
    rgba[offset + 1] = color[1];
    rgba[offset + 2] = color[2];
    rgba[offset + 3] = 255;
  }
  return rgba;
}

function processFactor(item, settings) {
  const source = { data: item.frames[0], width: item.width, height: item.height };
  const isSheet = settings.frameMode === 'sheet';
  const down = api.exactFactorDownscale(
    source,
    settings.factor,
    isSheet ? settings.frameWidth : null,
    isSheet ? settings.frameHeight : null,
  );

  const pixelCount = down.w * down.h;
  const alpha = Array.from({ length: pixelCount }, (_, i) => down.data[i * 4 + 3]);
  const palette = api.kmeans(api.collectOpaquePoints(down.data, pixelCount), settings.paletteSize ?? 16, 10);
  let grid = Array.from({ length: pixelCount }, (_, i) => (
    alpha[i] >= (settings.alphaThreshold ?? 10)
      ? api.nearestColorIndex(down.data[i * 4], down.data[i * 4 + 1], down.data[i * 4 + 2], palette)
      : -1
  ));

  if ((settings.cleanPasses ?? 1) > 0) {
    grid = isSheet
      ? api.cleanPreserveSheet(grid, alpha, down.w, down.h, down.frameLogicalW, down.frameLogicalH, settings.cleanPasses ?? 1)
      : api.cleanIsolated(grid, alpha, down.w, down.h, settings.cleanPasses ?? 1);
  }

  let finalW = down.w;
  let finalH = down.h;
  let finalGrid = grid;
  let finalAlpha = alpha;

  const rgba = renderIndexed(finalGrid, finalAlpha, palette, finalW, finalH, settings.alphaThreshold ?? 10);
  const paletteObject = Object.fromEntries(palette.map((color, index) => [index, color]));
  const gridRows = Array.from({ length: finalH }, (_, y) => finalGrid.slice(y * finalW, (y + 1) * finalW));

  const processing = isSheet
    ? {
        mode: 'factor',
        factor: settings.factor,
        frameMode: 'sheet',
        frameWidth: settings.frameWidth,
        frameHeight: settings.frameHeight,
        frameLogicalWidth: down.frameLogicalW,
        frameLogicalHeight: down.frameLogicalH,
        logicalWidth: down.w,
        logicalHeight: down.h,
      }
    : {
        mode: 'factor',
        factor: settings.factor,
        frameMode: 'whole',
        logicalWidth: down.w,
        logicalHeight: down.h,
      };

  const json = {
    width: finalW,
    height: finalH,
    palette: paletteObject,
    grid: gridRows,
    outline: null,
    processing,
  };

  const png = encodePng(finalW, finalH, rgba);
  return {
    width: finalW,
    height: finalH,
    rgba,
    png,
    json,
    rgbaSha256: sha256(rgba),
    pngSha256: sha256(png),
    jsonSha256: sha256(Buffer.from(stableStringify(json))),
  };
}

// Generate 768x1344 hero fixture
function generateHero768() {
  const width = 768, height = 1344;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const lx = Math.floor(x / 8), ly = Math.floor(y / 8);
      const dx = (lx - 48) / 36;
      const dy = (ly - 84) / 60;
      if (dx * dx + dy * dy > 1) continue;
      const idx = (y * width + x) * 4;
      data[idx] = 180 + ((lx % 4) * 15);
      data[idx + 1] = 90 + ((ly % 4) * 20);
      data[idx + 2] = 60;
      data[idx + 3] = 255;
    }
  }
  return { id: 'hero-factor-768', width, height, frames: [data] };
}

const corpus = generateCorpus();
const byId = new Map(corpus.map(item => [item.id, item]));

const cases = [
  {
    id: 'non-square-factor-3x',
    item: byId.get('non-square-factor'),
    settings: { mode: 'factor', factor: 3, frameMode: 'whole', paletteSize: 16, cleanPasses: 1 },
  },
  {
    id: 'hero-factor-8x',
    item: generateHero768(),
    settings: { mode: 'factor', factor: 8, frameMode: 'whole', paletteSize: 16, cleanPasses: 1 },
  },
  {
    id: 'sprite-sheet-factor-4x',
    item: byId.get('sprite-sheet'),
    settings: { mode: 'factor', factor: 4, frameMode: 'sheet', frameWidth: 64, frameHeight: 64, paletteSize: 16, cleanPasses: 1 },
  },
];

const results = [];
for (const testCase of cases) {
  const outA = processFactor(testCase.item, testCase.settings);
  const outB = processFactor(testCase.item, testCase.settings);
  assert.equal(outA.rgbaSha256, outB.rgbaSha256, `Determinism check failed for ${testCase.id}`);
  assert.equal(outA.pngSha256, outB.pngSha256, `PNG Determinism check failed for ${testCase.id}`);
  assert.equal(outA.jsonSha256, outB.jsonSha256, `JSON Determinism check failed for ${testCase.id}`);

  writeFileSync(resolve(evidenceDir, `${testCase.id}.png`), outA.png);
  writeFileSync(resolve(evidenceDir, `${testCase.id}.json`), stableStringify(outA.json));

  results.push({
    id: testCase.id,
    inputDimensions: `${testCase.item.width}×${testCase.item.height}`,
    outputDimensions: `${outA.width}×${outA.height}`,
    factor: testCase.settings.factor,
    frameMode: testCase.settings.frameMode,
    rgbaSha256: outA.rgbaSha256,
    pngSha256: outA.pngSha256,
    jsonSha256: outA.jsonSha256,
  });
}

const summary = {
  implementationId: 'GEO-001',
  generatedAt: new Date().toISOString(),
  deterministic: true,
  deterministicSha256: sha256(Buffer.from(stableStringify(results))),
  cases: results,
};

writeFileSync(resolve(evidenceDir, 'summary.json'), stableStringify(summary));
console.log('GEO-001 evidence generated successfully:');
console.log(stableStringify(summary));
