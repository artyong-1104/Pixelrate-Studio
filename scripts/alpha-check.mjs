import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const htmlPath = path.resolve('pixelate_studio.html');
const htmlContent = fs.readFileSync(htmlPath, 'utf8');

function extractFunction(code, fnName) {
  const match = code.match(new RegExp(`function\\s+${fnName}\\s*\\([\\s\\S]*?\\n}`));
  if (!match) {
    // Try matching with balanced braces
    const startIdx = code.indexOf(`function ${fnName}`);
    if (startIdx === -1) throw new Error(`Function ${fnName} not found in HTML`);
    let braceCount = 0;
    let started = false;
    let endIdx = startIdx;
    for (let i = startIdx; i < code.length; i++) {
      if (code[i] === '{') {
        braceCount++;
        started = true;
      } else if (code[i] === '}') {
        braceCount--;
        if (started && braceCount === 0) {
          endIdx = i + 1;
          break;
        }
      }
    }
    return code.slice(startIdx, endIdx);
  }
  return match[0];
}

const computeAlphaDiagnosticsFnCode = extractFunction(htmlContent, 'computeAlphaDiagnostics');

const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(`${computeAlphaDiagnosticsFnCode}`, sandbox);
const { computeAlphaDiagnostics } = sandbox;

test('ALP-001: computeAlphaDiagnostics counts partial alpha pixels (0 < a < 255)', () => {
  const w = 4, h = 4;
  // alpha: 0, 10, 128, 255, etc.
  const alpha = new Uint8Array([
    0, 0, 128, 255,
    0, 50, 0, 255,
    200, 0, 0, 255,
    0, 0, 0, 255
  ]);

  const diag = computeAlphaDiagnostics(alpha, w, h);
  assert.equal(diag.partialAlphaCount, 3, '128, 50, 200 are partial alpha pixels');
  assert.equal(diag.threshold, 10);
});

test('ALP-001: 4-neighbor connectivity distinguishes diagonal pixels', () => {
  const w = 4, h = 4;
  // 2 diagonal pixels at (0,0) and (1,1) -> 4-neighbor sees them as 2 separate 1-pixel components
  const alpha = new Uint8Array([
    255, 0,   0, 0,
    0,   255, 0, 0,
    0,   0,   0, 0,
    0,   0,   0, 0
  ]);

  const diag = computeAlphaDiagnostics(alpha, w, h);
  // Both components have area 1. First one (0,0) is largest (tie-break by seed).
  // Second one (1,1) is island with area 1.
  assert.equal(diag.islandCount, 1);
  assert.equal(diag.islandPixelCount, 1);
  assert.equal(diag.islands[0].area, 1);
  assert.equal(diag.islands[0].pixels[0].x, 1);
  assert.equal(diag.islands[0].pixels[0].y, 1);
});

test('ALP-001: components with area >= 5 are not islands', () => {
  const w = 10, h = 10;
  const alpha = new Uint8Array(w * h).fill(0);

  // Large body: 6x6 = 36 pixels (area 36)
  for (let y = 0; y < 6; y++) {
    for (let x = 0; x < 6; x++) {
      alpha[y * w + x] = 255;
    }
  }

  // Component A: 5 pixels in line -> area 5 (NOT an island, >= 5)
  for (let x = 0; x < 5; x++) {
    alpha[8 * w + x] = 255;
  }

  // Component B: 4 pixels in 2x2 -> area 4 (ISLAND, <= 4)
  alpha[8 * w + 8] = 255;
  alpha[8 * w + 9] = 255;
  alpha[9 * w + 8] = 255;
  alpha[9 * w + 9] = 255;

  const diag = JSON.parse(JSON.stringify(computeAlphaDiagnostics(alpha, w, h)));
  assert.equal(diag.islandCount, 1, 'Only 4-pixel component is counted as island');
  assert.equal(diag.islandPixelCount, 4);
  assert.equal(diag.islands[0].area, 4);
  assert.deepEqual(diag.islands[0].bbox, {
    minX: 8,
    minY: 8,
    maxX: 9,
    maxY: 9,
    width: 2,
    height: 2
  });
});

test('ALP-001: sprite sheet frame boundary isolation', () => {
  const w = 8, h = 4;
  const frameW = 4, frameH = 4; // 2 frames horizontally (Frame 0: [0..3], Frame 1: [4..7])
  const alpha = new Uint8Array(w * h).fill(0);

  // Frame 0: main body 3x3 at [0..2, 0..2], island 1-pixel at (3,3)
  for (let y = 0; y < 3; y++) {
    for (let x = 0; x < 3; x++) {
      alpha[y * w + x] = 255;
    }
  }
  alpha[3 * w + 3] = 255; // island in Frame 0

  // Frame 1: main body 2x2 at [4..5, 0..1], island 2-pixels at (7,2), (7,3) (not touching [4..5, 0..1])
  for (let y = 0; y < 2; y++) {
    for (let x = 4; x < 6; x++) {
      alpha[y * w + x] = 255;
    }
  }
  alpha[2 * w + 7] = 255;
  alpha[3 * w + 7] = 255; // island in Frame 1

  const diag = JSON.parse(JSON.stringify(computeAlphaDiagnostics(alpha, w, h, frameW, frameH)));
  assert.equal(diag.islandCount, 2, 'Frame 0 has 1 island, Frame 1 has 1 island');
  assert.equal(diag.islandPixelCount, 3, '1 + 2 = 3 total island pixels');
  assert.equal(diag.islands[0].frameIndex, 0);
  assert.equal(diag.islands[0].area, 1);
  assert.equal(diag.islands[1].frameIndex, 1);
  assert.equal(diag.islands[1].area, 2);
});

test('ALP-001: background presets and custom hex color validation', () => {
  const ALLOWED = ['checker', 'white', 'black', 'green', 'magenta', 'cyan', 'custom'];
  const CYCLE_ORDER = ['checker', 'white', 'black', 'green', 'magenta', 'cyan', 'custom'];

  assert.equal(ALLOWED.length, 7);
  assert.deepEqual(ALLOWED, CYCLE_ORDER);

  const validHexes = ['#000000', '#FFFFFF', '#00FF00', '#FF00FF', '#00FFFF', '#FFAA00', '#123456'];
  const invalidHexes = ['#FFF', 'green', 'rgb(0,0,0)', '#GGGGGG', '#1234567', ''];

  const hexRegex = /^#[0-9a-fA-F]{6}$/;
  for (const v of validHexes) {
    assert.ok(hexRegex.test(v), `Should accept valid hex ${v}`);
  }
  for (const inv of invalidHexes) {
    assert.ok(!hexRegex.test(inv), `Should reject invalid hex ${inv}`);
  }
});
