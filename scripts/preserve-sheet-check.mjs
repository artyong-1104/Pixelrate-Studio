import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';

const root = resolve(import.meta.dirname, '..');
const html = readFileSync(resolve(root, 'pixelate_studio.html'), 'utf8');

function extractFunction(name) {
  const marker = `function ${name}(`;
  const start = html.indexOf(marker);
  assert.notEqual(start, -1, `${name} must exist in pixelate_studio.html`);
  const openBrace = html.indexOf('{', start + marker.length);
  assert.notEqual(openBrace, -1, `${name} must have a function body`);

  let depth = 0;
  let quote = '';
  let escaped = false;
  let lineComment = false;
  let blockComment = false;
  for (let i = openBrace; i < html.length; i++) {
    const char = html[i];
    const next = html[i + 1];
    if (lineComment) {
      if (char === '\n') lineComment = false;
      continue;
    }
    if (blockComment) {
      if (char === '*' && next === '/') {
        blockComment = false;
        i++;
      }
      continue;
    }
    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === quote) {
        quote = '';
      }
      continue;
    }
    if (char === '/' && next === '/') {
      lineComment = true;
      i++;
      continue;
    }
    if (char === '/' && next === '*') {
      blockComment = true;
      i++;
      continue;
    }
    if (char === '"' || char === "'" || char === '`') {
      quote = char;
      continue;
    }
    if (char === '{') depth++;
    if (char === '}') {
      depth--;
      if (depth === 0) return html.slice(start, i + 1);
    }
  }
  assert.fail(`${name} function body is incomplete`);
}

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
  'cleanIsolated',
  'cleanPreserveSheet',
  'outlinePreserveSheet',
  'expandPreserveSheet',
];
const context = vm.createContext({
  Array,
  Math,
  Number,
  Uint8ClampedArray,
  getRawPixels: image => image,
});
vm.runInContext(
  `${functionNames.map(extractFunction).join('\n')}\nthis.api = { ${functionNames.join(', ')} };`,
  context,
);
const {
  normalizeScaleMode,
  getFrameLayout,
  getPreserveSheetValidationError,
  preserveSheetDownscale,
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

console.log('Preserve-sheet regression checks passed (layout, validation, compatibility, blocks, alpha, boundaries).');
