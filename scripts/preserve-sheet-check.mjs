import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';
import { extractInlineFunction } from './lib/extract-inline-function.mjs';

const root = resolve(import.meta.dirname, '..');
const html = readFileSync(resolve(root, 'pixelate_studio.html'), 'utf8');

assert.doesNotMatch(html, /\blegacyProcessAll\b/, 'The removed legacy transform pipeline must not return');
assert.equal(
  (html.match(/async function processAll\s*\(/g) ?? []).length,
  1,
  'Exactly one live processAll pipeline is expected',
);

const functionNames = [
  'normalizeScaleMode',
  'getFrameLayout',
  'getPreserveSheetValidationError',
  'preserveSheetDownscale',
  'getFactorValidationError',
  'exactFactorDownscale',
  'cleanIsolated',
  'cleanPreserveSheet',
  'outlinePreserveSheet',
  'expandPreserveSheet',
];
const context = vm.createContext({
  Array,
  Math,
  Number,
  parseInt,
  Uint8ClampedArray,
  getRawPixels: image => image,
});
vm.runInContext(
  `${functionNames.map(name => extractInlineFunction(html, name)).join('\n')}\nthis.api = { ${functionNames.join(', ')} };`,
  context,
);
const {
  normalizeScaleMode,
  getFrameLayout,
  getPreserveSheetValidationError,
  preserveSheetDownscale,
  getFactorValidationError,
  exactFactorDownscale,
  cleanPreserveSheet,
  outlinePreserveSheet,
  expandPreserveSheet,
} = context.api;

const sheet = { name: 'sheet.png', img: { width: 384, height: 256 } };
assert.deepEqual(
  { ...getFrameLayout(sheet, 64, 64) },
  { columns: 6, rows: 4, totalFrames: 24 },
  '384×256 with 64×64 frames must report a 6×4, 24-frame layout',
);
assert.equal(getFrameLayout(sheet, 70, 64), null, 'Non-divisible frame geometry must be rejected');
assert.equal(
  getPreserveSheetValidationError([sheet], 64, 64, 4),
  '',
  'Valid preserve-sheet settings must pass validation',
);
assert.match(
  getPreserveSheetValidationError([sheet], 70, 64, 2),
  /sheet\.png: 384×256 .+ 70×64/,
  'Validation must identify the file with invalid frame geometry',
);
assert.match(
  getPreserveSheetValidationError([{ name: 'block.png', img: { width: 132, height: 132 } }], 66, 66, 4),
  /프레임 66×66이 블록 4/,
  'Validation must reject frame dimensions that are not divisible by the block size',
);
assert.match(
  getPreserveSheetValidationError([sheet], 64, 64, 3),
  /블록 크기는 1·2·4·8/,
  'Validation must reject unsupported block sizes',
);
assert.match(
  getPreserveSheetValidationError([
    sheet,
    { name: 'invalid.png', img: { width: 385, height: 256 } },
  ], 64, 64, 4),
  /invalid\.png/,
  'Multi-file validation must report the first invalid file',
);
assert.equal(normalizeScaleMode({ downscaleEnabled: false }), 'original');
assert.equal(normalizeScaleMode({ downscaleEnabled: true }), 'square');
assert.equal(normalizeScaleMode({ scaleMode: 'preserve-sheet' }), 'preserve-sheet');

const rawWidth = 128;
const rawHeight = 64;
const rawData = new Uint8ClampedArray(rawWidth * rawHeight * 4);
for (let y = 0; y < rawHeight; y++) {
  for (let x = 0; x < rawWidth; x++) {
    const index = (y * rawWidth + x) * 4;
    const frameColumn = Math.floor(x / 64);
    rawData[index] = frameColumn * 100 + Math.floor((x % 64) / 4);
    rawData[index + 1] = Math.floor(y / 4);
    rawData[index + 2] = 7;
    rawData[index + 3] = 255;
  }
}
const downscaled = preserveSheetDownscale(
  { data: rawData, width: rawWidth, height: rawHeight },
  64,
  64,
  4,
);
assert.equal(downscaled.w, 32);
assert.equal(downscaled.h, 16);
assert.equal(downscaled.sourceW, rawWidth);
assert.equal(downscaled.sourceH, rawHeight);
assert.equal(downscaled.frameLogicalW, 16);
assert.equal(downscaled.frameLogicalH, 16);
assert.deepEqual(
  Array.from(downscaled.data.slice((15 * 4), (15 * 4) + 4)),
  [15, 0, 7, 255],
  'The last logical pixel of frame 1 must use frame-local block coordinates',
);
assert.deepEqual(
  Array.from(downscaled.data.slice((16 * 4), (16 * 4) + 4)),
  [100, 0, 7, 255],
  'Block alignment must restart at the next frame boundary',
);

const alphaRaw = new Uint8ClampedArray(4 * 4 * 4);
alphaRaw.set([255, 0, 0, 255], 0);
const alphaWeighted = preserveSheetDownscale(
  { data: alphaRaw, width: 4, height: 4 },
  4,
  4,
  4,
);
assert.deepEqual(
  Array.from(alphaWeighted.data),
  [255, 0, 0, 16],
  'Block averaging must use alpha-weighted RGB and average alpha',
);

const logicalGrid = Array.from({ length: downscaled.w * downscaled.h }, (_, index) => index);
const logicalAlpha = new Array(logicalGrid.length).fill(255);
const expanded = expandPreserveSheet(
  logicalGrid,
  logicalAlpha,
  downscaled.w,
  downscaled.h,
  4,
  rawWidth,
  rawHeight,
);
assert.equal(expanded.w, rawWidth);
assert.equal(expanded.h, rawHeight);
for (let logicalY = 0; logicalY < downscaled.h; logicalY++) {
  for (let logicalX = 0; logicalX < downscaled.w; logicalX++) {
    const expected = logicalGrid[logicalY * downscaled.w + logicalX];
    for (let dy = 0; dy < 4; dy++) {
      for (let dx = 0; dx < 4; dx++) {
        const outputIndex = (logicalY * 4 + dy) * rawWidth + logicalX * 4 + dx;
        assert.equal(expanded.grid[outputIndex], expected, 'Every expanded 4×4 block must be uniform');
        assert.equal(expanded.alpha[outputIndex], 255, 'Expanded alpha must remain uniform');
      }
    }
  }
}

const boundaryWidth = 32;
const boundaryHeight = 16;
const boundaryGrid = new Array(boundaryWidth * boundaryHeight).fill(-1);
const boundaryAlpha = new Array(boundaryGrid.length).fill(0);
const boundaryPixel = 8 * boundaryWidth + 15;
boundaryGrid[boundaryPixel] = 1;
boundaryAlpha[boundaryPixel] = 255;
const framedOutline = outlinePreserveSheet(
  boundaryGrid,
  boundaryAlpha,
  boundaryWidth,
  boundaryHeight,
  16,
  16,
  1,
  '4',
  9,
);
const unframedOutline = outlinePreserveSheet(
  boundaryGrid,
  boundaryAlpha,
  boundaryWidth,
  boundaryHeight,
  32,
  16,
  1,
  '4',
  9,
);
assert.equal(framedOutline.alpha[boundaryPixel + 1], 0, 'Outline must not cross a frame boundary');
assert.equal(unframedOutline.alpha[boundaryPixel + 1], 255, 'The fixture must detect an unsegmented outline');

const cleanGrid = new Array(boundaryWidth * boundaryHeight).fill(-1);
const cleanAlpha = new Array(cleanGrid.length).fill(0);
cleanGrid[boundaryPixel] = 1;
cleanAlpha[boundaryPixel] = 255;
for (const y of [7, 8, 9]) {
  const index = y * boundaryWidth + 16;
  cleanGrid[index] = 2;
  cleanAlpha[index] = 255;
}
const framedClean = cleanPreserveSheet(
  cleanGrid,
  cleanAlpha,
  boundaryWidth,
  boundaryHeight,
  16,
  16,
  1,
);
const unframedClean = cleanPreserveSheet(
  cleanGrid,
  cleanAlpha,
  boundaryWidth,
  boundaryHeight,
  32,
  16,
  1,
);
assert.equal(framedClean[boundaryPixel], 1, 'Cleanup must not read neighboring frames');
assert.equal(unframedClean[boundaryPixel], 2, 'The fixture must detect unsegmented cleanup');

// ---------- GEO-001 Factor Mode Checks ----------
assert.equal(normalizeScaleMode({ scaleMode: 'factor' }), 'factor');

const nonSquare1 = { name: 'hero.png', img: { width: 768, height: 1344 } };
const nonSquare2 = { name: 'portrait.png', img: { width: 480, height: 702 } };
assert.equal(getFactorValidationError([nonSquare1], 8, 'whole', 64, 64), '', '768×1344 / 8 must pass whole factor validation');
assert.equal(getFactorValidationError([nonSquare2], 3, 'whole', 64, 64), '', '480×702 / 3 must pass whole factor validation');
assert.match(getFactorValidationError([nonSquare1], 1, 'whole', 64, 64), /축소 배율은 2~16 정수/, 'Factor 1 must be rejected');
assert.match(getFactorValidationError([nonSquare1], 17, 'whole', 64, 64), /축소 배율은 2~16 정수/, 'Factor 17 must be rejected');
assert.match(getFactorValidationError([nonSquare1], NaN, 'whole', 64, 64), /축소 배율은 2~16 정수/, 'NaN factor must be rejected');
assert.match(
  getFactorValidationError([{ name: 'test.png', img: { width: 768, height: 1345 } }], 8, 'whole', 64, 64),
  /test\.png: 768×1345는 배율 8로 정확히 나눌 수 없습니다/,
  '768×1345 / 8 must report division error with filename and dimensions',
);
assert.match(
  getFactorValidationError([{ name: 'odd.png', img: { width: 101, height: 100 } }], 4, 'whole', 64, 64),
  /odd\.png: 101×100는 배율 4로 정확히 나눌 수 없습니다/,
  '101×100 / 4 must be rejected',
);
assert.match(
  getFactorValidationError([
    nonSquare1,
    { name: 'bad.png', img: { width: 768, height: 1345 } },
  ], 8, 'whole', 64, 64),
  /bad\.png/,
  'Multi-file validation must identify the first failing file in factor mode',
);

assert.equal(getFactorValidationError([{ name: 'sheet.png', img: { width: 128, height: 64 } }], 4, 'sheet', 64, 64), '', '128×64 sheet with 64×64 frames / 4 must pass');
assert.match(
  getFactorValidationError([{ name: 'sheet.png', img: { width: 132, height: 132 } }], 4, 'sheet', 66, 66),
  /프레임 66×66이 배율 4로 나누어지지 않습니다/,
  'Sheet mode must reject frame dimensions not divisible by factor',
);
assert.match(
  getFactorValidationError([{ name: 'sheet.png', img: { width: 130, height: 64 } }], 2, 'sheet', 64, 64),
  /sheet\.png: 130×64 이미지가 프레임 64×64로 나누어지지 않습니다/,
  'Sheet mode must reject image not divisible by frame dimensions',
);

const dummy768 = { data: new Uint8ClampedArray(768 * 1344 * 4), width: 768, height: 1344 };
const down768 = exactFactorDownscale(dummy768, 8);
assert.equal(down768.w, 96);
assert.equal(down768.h, 168);
assert.equal(down768.sourceW, 768);
assert.equal(down768.sourceH, 1344);
assert.equal(down768.factor, 8);

const dummy480 = { data: new Uint8ClampedArray(480 * 702 * 4), width: 480, height: 702 };
const down480 = exactFactorDownscale(dummy480, 3);
assert.equal(down480.w, 160);
assert.equal(down480.h, 234);
assert.equal(down480.sourceW, 480);
assert.equal(down480.sourceH, 702);
assert.equal(down480.factor, 3);

const factorSheetDown = exactFactorDownscale(
  { data: rawData, width: rawWidth, height: rawHeight },
  4,
  64,
  64,
);
assert.equal(factorSheetDown.w, 32);
assert.equal(factorSheetDown.h, 16);
assert.equal(factorSheetDown.sourceW, rawWidth);
assert.equal(factorSheetDown.sourceH, rawHeight);
assert.equal(factorSheetDown.frameLogicalW, 16);
assert.equal(factorSheetDown.frameLogicalH, 16);
assert.equal(factorSheetDown.factor, 4);
assert.deepEqual(
  Array.from(factorSheetDown.data.slice((15 * 4), (15 * 4) + 4)),
  [15, 0, 7, 255],
  'Factor sheet downscale last logical pixel of frame 1 must align frame-locally',
);
assert.deepEqual(
  Array.from(factorSheetDown.data.slice((16 * 4), (16 * 4) + 4)),
  [100, 0, 7, 255],
  'Factor sheet downscale alignment must restart at frame boundary',
);

const factorAlphaWeighted = exactFactorDownscale(
  { data: alphaRaw, width: 4, height: 4 },
  4,
);
assert.deepEqual(
  Array.from(factorAlphaWeighted.data),
  [255, 0, 0, 16],
  'Factor cell downscale must use alpha-weighted RGB and average alpha',
);

console.log('Preserve-sheet and exact-factor regression checks passed (layout, validation, compatibility, blocks, alpha, boundaries).');
