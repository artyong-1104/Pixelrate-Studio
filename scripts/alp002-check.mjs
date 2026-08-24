import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { extractInlineFunctions } from './lib/extract-inline-function.mjs';

const root = resolve(import.meta.dirname, '..');
const html = readFileSync(resolve(root, 'pixelate_studio.html'), 'utf8');

const TARGET_FUNCTIONS = Object.freeze([
  'normalizeScaleMode',
  'kmeans',
  'collectOpaquePoints',
  'uniqueColors',
  'cleanIsolated',
  'cleanPreserveSheet',
  'outlinePreserveSheet',
  'expandPreserveSheet',
  'resolveOutputAlpha',
  'buildCoverageAlphaMatrix',
  'buildAlphaPolicyArtifacts',
  'estimateCoverageAlphaMatrixJsonBytes',
  'getJsonByteLength',
  'getResultLogStorageIssue',
  'getResultPartialAlphaCount',
  'computeAlphaDiagnostics',
  'normalizeSettings',
  'diffSettings',
  'getSettingsSummary',
  'formatSettingValue'
]);

function createTestSandbox() {
  const extracted = extractInlineFunctions(html, TARGET_FUNCTIONS).join('\n');
  const context = {
    Array,
    Math,
    Map,
    Number,
    Object,
    Set,
    String,
    TextEncoder,
    parseInt,
    MAX_PALETTE_SAMPLES: 50000,
    MAX_STORED_ALPHA_MATRIX_BYTES: 16 * 1024 * 1024,
    MAX_STORED_RESULT_JSON_BYTES: 32 * 1024 * 1024,
    DEFAULT_SETTINGS: Object.freeze({
      scaleMode: 'square',
      size: 64,
      method: 'box',
      factor: 4,
      factorFrameMode: 'whole',
      gridFrameMode: 'whole',
      gridFrameWidth: 64,
      gridFrameHeight: 64,
      gridSizeX: 8,
      gridSizeY: 8,
      gridPhaseX: 0,
      gridPhaseY: 0,
      gridSource: 'manual',
      gridLockedAcrossFrames: true,
      frameWidth: 64,
      frameHeight: 64,
      pixelBlockSize: 4,
      paletteMode: 'auto',
      customPalette: [],
      paletteEnabled: true,
      colors: 16,
      shared: true,
      cleanEnabled: true,
      cleanPasses: 1,
      outline: false,
      outlineWidth: 1,
      outlineColor: '#000000',
      outlineShape: '4',
      exportNearestScales: [],
      alphaMode: 'binary',
      alphaThreshold: 10
    }),
    SETTING_LABELS: Object.freeze({
      scaleMode: '크기 처리 방식',
      alphaMode: '투명도 처리 방식',
      alphaThreshold: '투명도 임계값'
    }),
    FORBIDDEN_SETTINGS_KEYS: ['__proto__', 'prototype', 'constructor'],
    FORBIDDEN_SETTINGS_PATTERN: /"(?:__proto__|prototype|constructor)"\s*:/i,
    checkNoForbiddenKeys: function(obj) {
      if (!obj || typeof obj !== 'object') return;
      for (const k of Object.getOwnPropertyNames(obj)) {
        if (['__proto__', 'prototype', 'constructor'].includes(k)) {
          throw new Error(`보안 위험: 금지된 속성 키(${k})가 포함되어 있습니다.`);
        }
        if (typeof obj[k] === 'object' && obj[k] !== null) {
          this.checkNoForbiddenKeys(obj[k]);
        }
      }
    }
  };
  vm.createContext(context);
  const exportCode = `globalThis.__alp002Api = { ${TARGET_FUNCTIONS.join(', ')} };`;
  vm.runInContext(`${extracted}\n${exportCode}`, context, { timeout: 2000 });
  return context.__alp002Api;
}

const api = createTestSandbox();

test('ALP-002: Alpha threshold boundary testing (values 0, 9, 10, 127, 255)', () => {
  // Test uniqueColors with threshold 10
  // 5 pixels:
  // p0: RGBA(255, 0, 0, 0)
  // p1: RGBA(0, 255, 0, 9)
  // p2: RGBA(0, 0, 255, 10)
  // p3: RGBA(255, 255, 0, 127)
  // p4: RGBA(255, 255, 255, 255)
  const data = new Uint8ClampedArray([
    255, 0, 0, 0,
    0, 255, 0, 9,
    0, 0, 255, 10,
    255, 255, 0, 127,
    255, 255, 255, 255
  ]);
  const alpha = [0, 9, 10, 127, 255];

  const colorsThresh10 = api.uniqueColors(data, alpha, 5, 10);
  assert.equal(colorsThresh10.length, 3, 'Threshold 10 should accept alpha >= 10 (10, 127, 255)');
  assert.deepEqual(Array.from(colorsThresh10[0]), [0, 0, 255]);
  assert.deepEqual(Array.from(colorsThresh10[1]), [255, 255, 0]);
  assert.deepEqual(Array.from(colorsThresh10[2]), [255, 255, 255]);

  // Test with custom threshold 128
  const colorsThresh128 = api.uniqueColors(data, alpha, 5, 128);
  assert.equal(colorsThresh128.length, 1, 'Threshold 128 should only accept alpha 255');
  assert.deepEqual(Array.from(colorsThresh128[0]), [255, 255, 255]);

  // Test collectOpaquePoints excludes hidden RGB
  const points = api.collectOpaquePoints(data, 5, 10, 10);
  assert.equal(points.length, 3);
  assert.deepEqual(Array.from(points[0]), [0, 0, 255]);
  assert.deepEqual(Array.from(points[1]), [255, 255, 0]);
  assert.deepEqual(Array.from(points[2]), [255, 255, 255]);
});

test('ALP-002: Coverage auto palette applies alpha/255 weighting without changing binary samples', () => {
  const data = new Uint8ClampedArray([
    255, 0, 0, 10,
    0, 0, 255, 255
  ]);
  const binaryPoints = api.collectOpaquePoints(data, 2, 10, 10, false);
  const coveragePoints = api.collectOpaquePoints(data, 2, 10, 10, true);

  assert.deepEqual(Array.from(binaryPoints[0]), [255, 0, 0]);
  assert.deepEqual(Array.from(coveragePoints[0]), [255, 0, 0, 10 / 255]);
  assert.deepEqual(Array.from(coveragePoints[1]), [0, 0, 255, 1]);

  const binaryCenter = api.kmeans(binaryPoints, 1, 1)[0];
  const coverageCenter = api.kmeans(coveragePoints, 1, 1)[0];
  assert.deepEqual(Array.from(binaryCenter), [128, 0, 128], 'Binary mode retains the legacy equal-weight palette baseline');
  assert.deepEqual(Array.from(coverageCenter), [10, 0, 245], 'Coverage mode weights RGB contribution by alpha/255');
});

test('ALP-002: Noise cleanup preserves alpha values unchanged', () => {
  // 3x3 grid where center pixel is noise
  // Grid colors: [0, 0, 0, 0, 1, 0, 0, 0, 0]
  // Alpha values: [200, 150, 120, 180, 50, 170, 190, 160, 140]
  const grid = [0, 0, 0, 0, 1, 0, 0, 0, 0];
  const alpha = [200, 150, 120, 180, 50, 170, 190, 160, 140];
  const cleaned = api.cleanIsolated(grid, alpha, 3, 3, 1, 10);

  // Center pixel index was replaced from 1 to 0
  assert.equal(cleaned[4], 0, 'Isolated center pixel color index should be replaced by neighbor majority');
  // Original alpha array is unchanged
  assert.equal(alpha[4], 50, 'Original alpha values must remain strictly unchanged');

  // Preserve sheet clean test
  const cleanedSheet = api.cleanPreserveSheet(grid, alpha, 3, 3, 3, 3, 1, 10);
  assert.equal(cleanedSheet[4], 0, 'Preserve sheet isolated pixel should be cleaned');
  assert.equal(alpha[4], 50, 'Preserve sheet alpha must not be mutated');
});

test('ALP-002: Outline assigns alpha 255 to newly created pixels and preserves existing alpha', () => {
  // 3x3 frame with 1 pixel at center having partial alpha 120
  const grid = [-1, -1, -1, -1, 0, -1, -1, -1, -1];
  const alpha = [0, 0, 0, 0, 120, 0, 0, 0, 0];

  const outlined = api.outlinePreserveSheet(grid, alpha, 3, 3, 3, 3, 1, '4', 2, 10);
  // Center pixel should preserve alpha 120
  assert.equal(outlined.alpha[4], 120, 'Existing foreground pixel must preserve its original alpha (120)');
  assert.equal(outlined.grid[4], 0, 'Existing foreground pixel keeps its palette index');

  // Neighboring 4-direction outline pixels (1, 3, 5, 7) must have alpha 255
  assert.equal(outlined.alpha[1], 255, 'Top outline pixel receives alpha 255');
  assert.equal(outlined.grid[1], 2, 'Top outline pixel receives outline color index');
  assert.equal(outlined.alpha[3], 255, 'Left outline pixel receives alpha 255');
  assert.equal(outlined.alpha[5], 255, 'Right outline pixel receives alpha 255');
  assert.equal(outlined.alpha[7], 255, 'Bottom outline pixel receives alpha 255');

  // Diagonal corner pixels (0, 2, 6, 8) remain transparent
  assert.equal(outlined.alpha[0], 0);
  assert.equal(outlined.alpha[2], 0);
  assert.equal(outlined.alpha[6], 0);
  assert.equal(outlined.alpha[8], 0);
});

test('ALP-002: computeAlphaDiagnostics accurately reflects custom threshold', () => {
  // 2x2 image:
  // p0: alpha 5
  // p1: alpha 20
  // p2: alpha 150
  // p3: alpha 255
  const alpha = [5, 20, 150, 255];

  // With threshold = 10: partialAlphaCount = 3 (5, 20, 150), islands computed from alpha >= 10 (20, 150, 255)
  const diag10 = api.computeAlphaDiagnostics(alpha, 2, 2, 2, 2, 10);
  assert.equal(diag10.partialAlphaCount, 3);
  assert.equal(diag10.threshold, 10);

  // With threshold = 50: partialAlphaCount = 3 (0 < a < 255 is invariant), threshold recorded as 50
  const diag50 = api.computeAlphaDiagnostics(alpha, 2, 2, 2, 2, 50);
  assert.equal(diag50.partialAlphaCount, 3);
  assert.equal(diag50.threshold, 50);
});

test('ALP-002: Settings validation and normalization for alphaMode and alphaThreshold', () => {
  // Valid defaults
  const normDefault = api.normalizeSettings({});
  assert.equal(normDefault.settings.alphaMode, 'binary');
  assert.equal(normDefault.settings.alphaThreshold, 10);

  // Valid coverage mode with custom threshold
  const normCustom = api.normalizeSettings({ alphaMode: 'coverage', alphaThreshold: 128 });
  assert.equal(normCustom.settings.alphaMode, 'coverage');
  assert.equal(normCustom.settings.alphaThreshold, 128);

  // Valid threshold boundaries (1 and 254)
  assert.equal(api.normalizeSettings({ alphaThreshold: 1 }).settings.alphaThreshold, 1);
  assert.equal(api.normalizeSettings({ alphaThreshold: 254 }).settings.alphaThreshold, 254);

  // Invalid alphaMode rejection
  assert.throws(() => api.normalizeSettings({ alphaMode: 'invalid' }), /유효하지 않은 alphaMode 값/);
  assert.throws(() => api.normalizeSettings({ alphaMode: 123 }), /유효하지 않은 alphaMode 값/);

  // Invalid alphaThreshold rejection
  assert.throws(() => api.normalizeSettings({ alphaThreshold: 0 }), /alphaThreshold는 1~254 범위의 정수/);
  assert.throws(() => api.normalizeSettings({ alphaThreshold: 255 }), /alphaThreshold는 1~254 범위의 정수/);
  assert.throws(() => api.normalizeSettings({ alphaThreshold: -5 }), /alphaThreshold는 1~254 범위의 정수/);
  assert.throws(() => api.normalizeSettings({ alphaThreshold: 12.5 }), /alphaThreshold는 1~254 범위의 정수/);
  assert.throws(() => api.normalizeSettings({ alphaThreshold: 'abc' }), /alphaThreshold는 1~254 범위의 정수/);

  // Settings summary
  const summaryBinary = api.getSettingsSummary({ scaleMode: 'square', alphaMode: 'binary', alphaThreshold: 10 });
  assert.match(summaryBinary, /크기:64px/);
  assert.equal(summaryBinary.includes('알파:'), false, 'Default binary alpha threshold 10 should not clutter summary');

  const summaryCoverage = api.getSettingsSummary({ scaleMode: 'square', alphaMode: 'coverage', alphaThreshold: 45 });
  assert.match(summaryCoverage, /알파:coverage\(45\)/);

  // Diff settings
  const diffs = api.diffSettings(
    { alphaMode: 'binary', alphaThreshold: 10 },
    { alphaMode: 'coverage', alphaThreshold: 50 }
  );
  assert.equal(diffs.length, 2);
  assert.equal(diffs[0].key, 'alphaMode');
  assert.equal(diffs[0].to, 'coverage');
  assert.equal(diffs[1].key, 'alphaThreshold');
  assert.equal(diffs[1].to, 50);
});

test('ALP-002: Production alpha helpers generate matching binary/coverage output and improve MAE', () => {
  // Exercise the same helpers used by processAll for a 4x4 alpha gradient:
  // [  0,  20,  50,  80 ]
  // [100, 130, 160, 190 ]
  // [210, 230, 245, 255 ]
  // [  0,   5,   9,  10 ]
  const originalAlpha = [
    0, 20, 50, 80,
    100, 130, 160, 190,
    210, 230, 245, 255,
    0, 5, 9, 10
  ];
  const grid = [
    -1, 0, 0, 0,
     0, 0, 0, 0,
     0, 0, 0, 0,
    -1, -1, -1, 0
  ];
  const threshold = 10;

  const binaryOutputAlpha = originalAlpha.map((a, i) => api.resolveOutputAlpha(grid[i], a, 'binary', threshold));
  const coverageOutputAlpha = originalAlpha.map((a, i) => api.resolveOutputAlpha(grid[i], a, 'coverage', threshold));
  const binary2d = api.buildCoverageAlphaMatrix(grid, originalAlpha, 4, 4, 'binary', threshold);
  const coverage2d = api.buildCoverageAlphaMatrix(grid, originalAlpha, 4, 4, 'coverage', threshold);

  assert.equal(binary2d, null, 'Binary JSON must omit the root alpha matrix');
  assert.equal(coverage2d.length, 4);
  assert.equal(coverage2d[0].length, 4);
  assert.deepEqual(coverage2d[3], [0, 0, 0, 10]);

  // Calculate Mean Absolute Error (MAE) against original foreground partial alpha (alpha >= threshold)
  let binaryErrorSum = 0;
  let coverageErrorSum = 0;
  let foregroundCount = 0;

  for (let i = 0; i < 16; i++) {
    if (originalAlpha[i] >= threshold) {
      foregroundCount++;
      binaryErrorSum += Math.abs(originalAlpha[i] - binaryOutputAlpha[i]);
      coverageErrorSum += Math.abs(originalAlpha[i] - coverageOutputAlpha[i]);
    }
  }

  const binaryMae = binaryErrorSum / foregroundCount;
  const coverageMae = coverageErrorSum / foregroundCount;

  assert.equal(coverageMae, 0, 'Coverage mode should perfectly preserve foreground alpha without loss');
  assert.ok(binaryMae > 50, `Binary mode quantizes alpha causing substantial error (${binaryMae.toFixed(2)})`);
  assert.ok(coverageMae < binaryMae, 'Coverage mode MAE must be strictly less than binary mode MAE');
});

test('ALP-002: Production alpha artifacts preserve hole topology, coverage matrix, legacy hash, and determinism', () => {
  const width = 7;
  const height = 7;
  const palette = [[40, 160, 220]];
  const grid = [];
  const alpha = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const ring = x >= 1 && x <= 5 && y >= 1 && y <= 5 && (x === 1 || x === 5 || y === 1 || y === 5);
      grid.push(ring ? 0 : -1);
      alpha.push(ring ? ((x + y) % 3 === 0 ? 10 : (x + y) % 3 === 1 ? 127 : 255) : 0);
    }
  }

  const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
  const topology = renderedAlpha => {
    const foreground = renderedAlpha.map(value => value >= 10);
    const visitedForeground = new Uint8Array(width * height);
    const visitedBackground = new Uint8Array(width * height);
    const offsets = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    const countRegions = (target, visited, holesOnly) => {
      let count = 0;
      for (let start = 0; start < target.length; start++) {
        if (!target[start] || visited[start]) continue;
        const queue = [start];
        visited[start] = 1;
        let touchesEdge = false;
        while (queue.length) {
          const index = queue.pop();
          const x = index % width;
          const y = Math.floor(index / width);
          if (x === 0 || y === 0 || x === width - 1 || y === height - 1) touchesEdge = true;
          for (const [dx, dy] of offsets) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
            const next = ny * width + nx;
            if (target[next] && !visited[next]) {
              visited[next] = 1;
              queue.push(next);
            }
          }
        }
        if (!holesOnly || !touchesEdge) count++;
      }
      return count;
    };
    return {
      components: countRegions(foreground, visitedForeground, false),
      holes: countRegions(foreground.map(value => !value), visitedBackground, true)
    };
  };

  const binary = api.buildAlphaPolicyArtifacts(grid, alpha, width, height, 'binary', 10);
  const binaryAgain = api.buildAlphaPolicyArtifacts(grid, alpha, width, height, 'binary', 10);
  const coverage = api.buildAlphaPolicyArtifacts(grid, alpha, width, height, 'coverage', 10);
  const binaryRgba = [];
  for (let index = 0; index < grid.length; index++) {
    const outputAlpha = binary.renderedAlpha[index];
    const color = grid[index] >= 0 ? palette[grid[index]] : [0, 0, 0];
    binaryRgba.push(
      outputAlpha ? color[0] : 0,
      outputAlpha ? color[1] : 0,
      outputAlpha ? color[2] : 0,
      outputAlpha
    );
  }
  const legacyProjection = {
    width,
    height,
    palette: Object.fromEntries(palette.map((value, index) => [index, value])),
    grid: Array.from({ length: height }, (_, y) => grid.slice(y * width, (y + 1) * width))
  };

  assert.equal(binary.alphaMatrix, null, 'Binary JSON must continue to omit the root alpha matrix');
  assert.equal(hash(binary.renderedAlpha), hash(binaryAgain.renderedAlpha), 'Identical binary input must be deterministic');
  assert.deepEqual(coverage.alphaMatrix.flat(), coverage.renderedAlpha, 'Coverage JSON matrix must equal PNG alpha bytes');
  assert.deepEqual(topology(binary.renderedAlpha), { components: 1, holes: 1 });
  assert.deepEqual(topology(coverage.renderedAlpha), { components: 1, holes: 1 });
  assert.equal(hash(binaryRgba), '73407d8cf02ba3d07102a8b47a134bf3ee693768a48f5a6d7f7ecf754636c8d8');
  assert.equal(hash(legacyProjection), '21990b6ae732f343b6dca56b97435a7f2ebca4f21daae420284f164450cb3667');
});

test('ALP-002: Coverage JSON/log size gate is fail-closed while small results remain storable', () => {
  const smallJson = {
    width: 4,
    height: 4,
    grid: [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]],
    alpha: [[0, 10, 127, 255], [0, 10, 127, 255], [0, 10, 127, 255], [0, 10, 127, 255]]
  };
  assert.equal(api.getResultLogStorageIssue([{ name: 'small.png', jsonData: smallJson }]), null);
  assert.ok(api.getJsonByteLength(smallJson) > 0);

  const over4mEstimate = api.estimateCoverageAlphaMatrixJsonBytes(2048, 2048);
  assert.ok(over4mEstimate > 16 * 1024 * 1024, '4M coverage matrix must exceed the dedicated log alpha limit');
  const oversizedIssue = api.getResultLogStorageIssue([{
    name: '4m.png',
    coverageAlphaEstimatedBytes: over4mEstimate,
    jsonData: { width: 2048, height: 2048, alpha: [[]] }
  }]);
  assert.equal(oversizedIssue.kind, 'alpha-matrix');
  assert.equal(oversizedIssue.name, '4m.png');
  assert.equal(oversizedIssue.limit, 16 * 1024 * 1024);

  const aggregateIssue = api.getResultLogStorageIssue([
    { name: 'aggregate-a.png', jsonData: { payload: 'x'.repeat(17 * 1024 * 1024) } },
    { name: 'aggregate-b.png', jsonData: { payload: 'x'.repeat(17 * 1024 * 1024) } }
  ]);
  assert.equal(aggregateIssue.kind, 'result-json-total');
  assert.equal(aggregateIssue.name, '전체');
  assert.ok(aggregateIssue.bytes > 32 * 1024 * 1024, 'Combined result JSON must be measured against the 32MiB limit');
});

test('ALP-002: Restored logs retain the final partial-alpha summary', () => {
  assert.equal(api.getResultPartialAlphaCount({
    alphaDiagnostics: { partialAlphaCount: 3816 },
    jsonData: { diagnostics: { alpha: { partialAlphaCount: 1 } } }
  }), 3816, 'Live results must prefer their executable diagnostics');

  assert.equal(api.getResultPartialAlphaCount({
    jsonData: { diagnostics: { alpha: { partialAlphaCount: 272 } } }
  }), 272, 'Restored results must fall back to persisted JSON diagnostics');

  assert.equal(api.getResultPartialAlphaCount({
    jsonData: { diagnostics: { alpha: { partialAlphaCount: '272' } } }
  }), 0, 'Tampered non-integer IndexedDB values must fail closed');
  assert.equal(api.getResultPartialAlphaCount(null), 0);
});
