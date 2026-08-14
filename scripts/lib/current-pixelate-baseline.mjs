import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { encodePng, sha256, stableStringify } from './pixel-fixtures.mjs';
import { extractInlineFunctions } from './extract-inline-function.mjs';

const BASELINE_FUNCTIONS = Object.freeze([
  'boxDownscale',
  'preserveSheetDownscale',
  'kmeans',
  'collectOpaquePoints',
  'nearestColorIndex',
  'cleanIsolated',
  'cleanPreserveSheet',
  'expandPreserveSheet',
]);

export const CURRENT_BASELINE_CASES = Object.freeze([
  {
    id: 'current-square-default',
    fixtureId: 'photo-like',
    settings: {
      mode: 'square', size: 64, method: 'box', paletteSize: 16,
      cleanPasses: 1, alphaThreshold: 10, outline: false,
    },
  },
  {
    id: 'current-preserve-sheet-4x',
    fixtureId: 'sprite-sheet',
    settings: {
      mode: 'preserve-sheet', frameWidth: 64, frameHeight: 64, pixelBlockSize: 4,
      paletteSize: 16, cleanPasses: 1, alphaThreshold: 10, outline: false,
    },
  },
]);

function createCanvasStub() {
  let drawnImage = null;
  return {
    width: 0,
    height: 0,
    getContext() {
      return {
        drawImage(image) { drawnImage = image; },
        getImageData() {
          if (!drawnImage?.data) throw new Error('Baseline canvas has no RGBA source');
          return { data: drawnImage.data };
        },
      };
    },
  };
}

export function loadCurrentPixelateFunctions(htmlPath = resolve(import.meta.dirname, '../../pixelate_studio.html')) {
  const source = readFileSync(htmlPath, 'utf8');
  const extracted = extractInlineFunctions(source, BASELINE_FUNCTIONS).join('\n');
  const context = {
    Array,
    Math,
    Map,
    Number,
    Object,
    Uint8ClampedArray,
    MAX_PALETTE_SAMPLES: 50000,
    document: { createElement: () => createCanvasStub() },
    getRawPixels(image) {
      if (!image?.data || !Number.isInteger(image.width) || !Number.isInteger(image.height)) {
        throw new TypeError('Baseline image must provide width, height, and RGBA data');
      }
      return { data: image.data, width: image.width, height: image.height };
    },
  };
  vm.createContext(context);
  const exportsSource = `globalThis.__qltBaseline = { ${BASELINE_FUNCTIONS.join(', ')} };`;
  vm.runInContext(`${extracted}\n${exportsSource}`, context, { timeout: 2000 });
  return context.__qltBaseline;
}

function renderIndexed(grid, alpha, palette, width, height, threshold) {
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

function processCurrentBaseline(api, item, settings) {
  const source = { data: item.frames[0], width: item.width, height: item.height };
  let down;
  if (settings.mode === 'square') {
    down = {
      data: api.boxDownscale(source, settings.size, settings.method),
      w: settings.size,
      h: settings.size,
      mode: settings.mode,
    };
  } else {
    down = {
      ...api.preserveSheetDownscale(source, settings.frameWidth, settings.frameHeight, settings.pixelBlockSize),
      mode: settings.mode,
    };
  }

  const pixelCount = down.w * down.h;
  const alpha = Array.from({ length: pixelCount }, (_, index) => down.data[index * 4 + 3]);
  const palette = api.kmeans(api.collectOpaquePoints(down.data, pixelCount), settings.paletteSize, 10);
  let grid = Array.from({ length: pixelCount }, (_, index) => (
    alpha[index] >= settings.alphaThreshold
      ? api.nearestColorIndex(down.data[index * 4], down.data[index * 4 + 1], down.data[index * 4 + 2], palette)
      : -1
  ));

  if (settings.cleanPasses > 0) {
    grid = settings.mode === 'preserve-sheet'
      ? api.cleanPreserveSheet(grid, alpha, down.w, down.h, down.frameLogicalW, down.frameLogicalH, settings.cleanPasses)
      : api.cleanIsolated(grid, alpha, down.w, down.h, settings.cleanPasses);
  }

  let finalWidth = down.w;
  let finalHeight = down.h;
  let finalGrid = grid;
  let finalAlpha = alpha;
  if (settings.mode === 'preserve-sheet') {
    const expanded = api.expandPreserveSheet(
      grid, alpha, down.w, down.h, down.blockSize, down.sourceW, down.sourceH,
    );
    finalGrid = Array.from(expanded.grid);
    finalAlpha = Array.from(expanded.alpha);
    finalWidth = expanded.w;
    finalHeight = expanded.h;
  }

  const rgba = renderIndexed(finalGrid, finalAlpha, palette, finalWidth, finalHeight, settings.alphaThreshold);
  const paletteObject = Object.fromEntries(palette.map((color, index) => [index, color]));
  const gridRows = Array.from({ length: finalHeight }, (_, y) => finalGrid.slice(y * finalWidth, (y + 1) * finalWidth));
  const processing = settings.mode === 'square'
    ? { mode: 'square', size: settings.size, method: settings.method }
    : {
      mode: 'preserve-sheet', frameWidth: settings.frameWidth,
      frameHeight: settings.frameHeight, pixelBlockSize: settings.pixelBlockSize,
    };
  const json = {
    width: finalWidth,
    height: finalHeight,
    palette: paletteObject,
    grid: gridRows,
    outline: null,
    processing,
  };
  const jsonBytes = Buffer.from(stableStringify(json));
  const png = encodePng(finalWidth, finalHeight, rgba);
  return {
    width: finalWidth,
    height: finalHeight,
    paletteSize: palette.length,
    rgba,
    json,
    expected: {
      rgbaSha256: sha256(rgba),
      jsonSha256: sha256(jsonBytes),
      pngSha256: sha256(png),
    },
  };
}

export function computeCurrentBaselines(corpus, htmlPath) {
  const byId = new Map(corpus.map(item => [item.id, item]));
  const api = loadCurrentPixelateFunctions(htmlPath);
  return CURRENT_BASELINE_CASES.map(testCase => {
    const item = byId.get(testCase.fixtureId);
    if (!item) throw new Error(`Missing baseline fixture: ${testCase.fixtureId}`);
    return {
      id: testCase.id,
      fixtureId: testCase.fixtureId,
      settings: testCase.settings,
      ...processCurrentBaseline(api, item, testCase.settings),
    };
  });
}

export function baselineManifestEntries(baselines) {
  return baselines.map(({ id, fixtureId, settings, width, height, paletteSize, expected }) => ({
    id, fixtureId, settings, width, height, paletteSize, expected,
  }));
}
