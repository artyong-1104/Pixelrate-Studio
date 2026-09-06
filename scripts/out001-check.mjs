import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';
import { extractInlineFunction } from './lib/extract-inline-function.mjs';

const root = resolve(import.meta.dirname, '..');
const html = readFileSync(resolve(root, 'pixelate_studio.html'), 'utf8');

// 1. Verify HTML Structure
assert.match(html, /id="accordionExport"/, 'accordionExport must exist');
assert.match(html, /id="exportScale2x"\s+value="2"/, 'exportScale2x checkbox must exist');
assert.match(html, /id="exportScale4x"\s+value="4"/, 'exportScale4x checkbox must exist');
assert.match(html, /id="exportScale8x"\s+value="8"/, 'exportScale8x checkbox must exist');
assert.match(html, /id="exportScaleWarning"/, 'exportScaleWarning element must exist');

// 2. Extract createNearestCanvas and dependencies into test context
const functionNames = [
  'createNearestCanvas',
  'nearestScaleExceedsLimit',
  'getNearestScaleAvailability',
  'getSettingsSummary',
  'normalizeScaleMode',
];

class MockCanvasContext {
  constructor(canvas) {
    this.canvas = canvas;
    this.imageSmoothingEnabled = true;
  }
  drawImage(sourceCanvas, sx, sy, sw, sh) {
    this.drawnSource = sourceCanvas;
    this.targetWidth = sw;
    this.targetHeight = sh;
    // Simulate nearest-neighbor pixel expansion
    const srcCtx = sourceCanvas.getContext('2d');
    const srcData = srcCtx.imageData;
    const scaleX = sw / sourceCanvas.width;
    const scaleY = sh / sourceCanvas.height;
    const outData = new Uint8ClampedArray(sw * sh * 4);

    for (let y = 0; y < sh; y++) {
      const srcY = Math.floor(y / scaleY);
      for (let x = 0; x < sw; x++) {
        const srcX = Math.floor(x / scaleX);
        const srcIdx = (srcY * sourceCanvas.width + srcX) * 4;
        const outIdx = (y * sw + x) * 4;
        outData[outIdx] = srcData[srcIdx];
        outData[outIdx + 1] = srcData[srcIdx + 1];
        outData[outIdx + 2] = srcData[srcIdx + 2];
        outData[outIdx + 3] = srcData[srcIdx + 3];
      }
    }
    this.imageData = outData;
  }
  getImageData() {
    return { data: this.imageData };
  }
}

class MockCanvas {
  constructor() {
    this.width = 0;
    this.height = 0;
    this._ctx = new MockCanvasContext(this);
  }
  getContext(type) {
    return this._ctx;
  }
}

const context = vm.createContext({
  Array,
  Math,
  Number,
  parseInt,
  Uint8ClampedArray,
  MAX_RAW_PROCESS_PIXELS: 4194304,
  document: {
    createElement(tag) {
      if (tag === 'canvas') return new MockCanvas();
      return {};
    }
  }
});

vm.runInContext(
  `${functionNames.map(name => extractInlineFunction(html, name)).join('\n')}\nthis.api = { ${functionNames.join(', ')} };`,
  context
);

const {
  createNearestCanvas,
  nearestScaleExceedsLimit,
  getNearestScaleAvailability,
  getSettingsSummary
} = context.api;

// 3. Test 3x2 RGBA Source Scaled by 2x, 4x, 8x - Exact N×N Uniform RGBA Block Verification
const srcW = 3;
const srcH = 2;
const srcCanvas = new MockCanvas();
srcCanvas.width = srcW;
srcCanvas.height = srcH;
const srcData = new Uint8ClampedArray([
  255, 0, 0, 255,     // Pixel (0,0): Red
  0, 255, 0, 255,     // Pixel (1,0): Green
  0, 0, 255, 255,     // Pixel (2,0): Blue
  255, 255, 0, 255,   // Pixel (0,1): Yellow
  255, 0, 255, 255,   // Pixel (1,1): Magenta
  0, 255, 255, 255,   // Pixel (2,1): Cyan
]);
srcCanvas.getContext('2d').imageData = srcData;

for (const scale of [2, 4, 8]) {
  const scaledCanvas = createNearestCanvas(srcCanvas, scale);
  const targetW = srcW * scale;
  const targetH = srcH * scale;

  assert.equal(scaledCanvas.width, targetW, `${scale}× scaled canvas width mismatch`);
  assert.equal(scaledCanvas.height, targetH, `${scale}× scaled canvas height mismatch`);
  assert.equal(scaledCanvas.getContext('2d').imageSmoothingEnabled, false, `${scale}× imageSmoothingEnabled must be false`);

  const outPixels = scaledCanvas.getContext('2d').imageData;

  // Verify that each source pixel expands into exactly scale × scale identical RGBA block
  for (let sy = 0; sy < srcH; sy++) {
    for (let sx = 0; sx < srcW; sx++) {
      const srcIdx = (sy * srcW + sx) * 4;
      const expectedR = srcData[srcIdx];
      const expectedG = srcData[srcIdx + 1];
      const expectedB = srcData[srcIdx + 2];
      const expectedA = srcData[srcIdx + 3];

      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          const outY = sy * scale + dy;
          const outX = sx * scale + dx;
          const outIdx = (outY * targetW + outX) * 4;

          assert.equal(outPixels[outIdx], expectedR, `Mismatch R at (${outX},${outY}) for scale ${scale}`);
          assert.equal(outPixels[outIdx + 1], expectedG, `Mismatch G at (${outX},${outY}) for scale ${scale}`);
          assert.equal(outPixels[outIdx + 2], expectedB, `Mismatch B at (${outX},${outY}) for scale ${scale}`);
          assert.equal(outPixels[outIdx + 3], expectedA, `Mismatch A at (${outX},${outY}) for scale ${scale}`);
        }
      }
    }
  }
}

// 4. Test Scale Rejection (1, 3, 16, NaN)
for (const badScale of [1, 3, 5, 16, NaN, -2, 'abc']) {
  assert.throws(
    () => createNearestCanvas(srcCanvas, badScale),
    /지원하지 않는 확대 배율/,
    `Invalid scale ${badScale} must be rejected`
  );
}

// 5. Test Oversized Pixel / Dimension Rejection
const hugeCanvas = new MockCanvas();
hugeCanvas.width = 2048;
hugeCanvas.height = 2048;
assert.throws(
  () => createNearestCanvas(hugeCanvas, 4),
  /확대 크기 초과/,
  'Oversized canvas scaling must be rejected'
);

const wideCanvas = new MockCanvas();
wideCanvas.width = 3000;
wideCanvas.height = 100;
assert.throws(
  () => createNearestCanvas(wideCanvas, 2),
  /확대 크기 초과/,
  'Canvas dimension > 4096 must be rejected'
);

// 6. Test Settings Summary with Nearest Scales
const settingsWithExport = {
  scaleMode: 'square',
  size: 64,
  method: 'box',
  colorsNum: 16,
  paletteEnabled: true,
  cleanNum: 1,
  cleanEnabled: true,
  exportNearestScales: [2, 8]
};
const summary = getSettingsSummary(settingsWithExport);
assert.match(summary, /확대출력:2×,8×/, 'getSettingsSummary must include exportNearestScales');

// 7. Test fail-closed scale availability for single and mixed result sets.
const resultAt = (width, height) => ({ canvas: { width, height } });
assert.equal(nearestScaleExceedsLimit(resultAt(64, 64), 8), false, '64×64 at 8× must remain available');
assert.equal(nearestScaleExceedsLimit(resultAt(1024, 1024), 8), true, '1024×1024 at 8× must exceed limits');
assert.equal(nearestScaleExceedsLimit(resultAt(64, 64), 3), true, 'unsupported scales must fail closed');
const allBlocked = getNearestScaleAvailability([resultAt(1024, 1024)], 8);
assert.equal(allBlocked.blockedCount, 1, 'the single oversized result must be counted as blocked');
assert.equal(allBlocked.allBlocked, true, 'a scale checkbox must be disabled when every current result is blocked');
const mixedAvailability = getNearestScaleAvailability([resultAt(64, 64), resultAt(1024, 1024)], 8);
assert.equal(mixedAvailability.blockedCount, 1, 'the mixed batch must count only its oversized result');
assert.equal(mixedAvailability.allBlocked, false, 'a mixed batch must keep the scale selectable for its valid result');
const emptyAvailability = getNearestScaleAvailability([], 8);
assert.equal(emptyAvailability.blockedCount, 0, 'an empty result set must not report blocked results');
assert.equal(emptyAvailability.allBlocked, false, 'a scale checkbox must be enabled before results exist');

// 8. Keyboard activation must be explicit because OUT-001 requires a real Space toggle.
assert.match(
  html,
  /\[exportScale2x, exportScale4x, exportScale8x\][\s\S]*?addEventListener\('keydown',[\s\S]*?event\.preventDefault\(\)[\s\S]*?cb\.checked = !cb\.checked[\s\S]*?dispatchEvent\(new Event\('change', \{ bubbles: true \}\)\)/,
  'nearest-scale checkboxes must implement deterministic Space activation'
);

console.log('OUT-001 regression checks passed (N×N blocks, smoothing=false, limits, scale availability, keyboard activation, settings summary).');
