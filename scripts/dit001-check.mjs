import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../pixelate_studio.html', import.meta.url), 'utf8');

function extractFunction(source, name) {
  const marker = `function ${name}(`;
  const start = source.indexOf(marker);
  if (start === -1) throw new Error(`Function ${name} not found in HTML`);
  let depth = 0;
  let inString = false;
  let stringChar = '';
  let inComment = false;
  let i = start;
  while (i < source.length && source[i] !== '{') i++;
  const bodyStart = i;
  for (let j = bodyStart; j < source.length; j++) {
    const c = source[j];
    const prev = source[j - 1];
    if (inComment) {
      if (c === '\n' && inComment === 'line') inComment = false;
      else if (c === '/' && prev === '*' && inComment === 'block') inComment = false;
    } else if (inString) {
      if (c === stringChar && prev !== '\\') inString = false;
    } else {
      if (c === '/' && source[j + 1] === '/') inComment = 'line';
      else if (c === '/' && source[j + 1] === '*') inComment = 'block';
      else if (c === '"' || c === "'" || c === '`') { inString = true; stringChar = c; }
      else if (c === '{') depth++;
      else if (c === '}') {
        depth--;
        if (depth === 0) return source.substring(start, j + 1);
      }
    }
  }
  throw new Error(`Failed to parse function ${name}`);
}

const context = vm.createContext({
  console,
  Math,
  Array,
  Object,
  Number,
  String,
  Set,
  Map,
  Infinity,
  Blob: globalThis.Blob,
  MAX_PALETTE_SAMPLES: 4096,
  OKLAB_TEMPORAL_EPSILON: 0.0003
});

const functionsToExtract = [
  'srgbChannelToLinear',
  'linearChannelToSrgb',
  'srgbToOklab',
  'oklabToSrgb',
  'nearestColorIndex',
  'nearestOklabIndex',
  'getTwoNearestPaletteIndices',
  'applyOrderedDither',
  'mapPixelsToPalette',
  'normalizeScaleMode',
  'normalizeSettings',
  'validateSettingsEnvelope',
  'diffSettings',
  'getSettingsSummary'
];

const scriptCode = `
const BAYER_MATRICES = Object.freeze({
  bayer2: Object.freeze([
    [0, 2],
    [3, 1]
  ]),
  bayer4: Object.freeze([
    [0, 8, 2, 10],
    [12, 4, 14, 6],
    [3, 11, 1, 9],
    [15, 7, 13, 5]
  ])
});

const FORBIDDEN_SETTINGS_PATTERN = /"(?:__proto__|prototype|constructor)"\\s*:/;
const FORBIDDEN_SETTINGS_KEYS = ['__proto__', 'prototype', 'constructor'];
function checkNoForbiddenKeys(obj) {
  if (!obj || typeof obj !== 'object') return;
  for (const k of Object.keys(obj)) {
    if (FORBIDDEN_SETTINGS_KEYS.includes(k)) {
      throw new Error(\`보안 위험: 금지된 속성 키(\${k})가 포함되어 있습니다.\`);
    }
    if (typeof obj[k] === 'object' && obj[k] !== null) {
      checkNoForbiddenKeys(obj[k]);
    }
  }
}

const DEFAULT_SETTINGS = Object.freeze({
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
  representativeColor: 'mean-srgb',
  paletteMode: 'auto',
  paletteAlgorithm: 'kmeans-srgb',
  paletteSampling: 'pixel',
  paletteReference: null,
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
  alphaThreshold: 10,
  ditherMode: 'off',
  ditherStrength: 50
});

const PRESETS = Object.freeze({
  default: { ...DEFAULT_SETTINGS },
  'animation-safe': {
    shared: true,
    cleanEnabled: true,
    cleanPasses: 1,
    outline: false,
    ditherMode: 'off'
  },
  'oklab-animation-stable': {
    paletteMode: 'auto',
    paletteAlgorithm: 'kmeans-oklab',
    paletteSampling: 'pixel',
    paletteReference: null,
    colors: 16,
    shared: true,
    cleanEnabled: true,
    cleanPasses: 1,
    outline: false,
    ditherMode: 'off'
  },
  'preserve-sheet': {
    scaleMode: 'preserve-sheet',
    frameWidth: 64,
    frameHeight: 64,
    pixelBlockSize: 4
  }
});

const SETTING_LABELS = Object.freeze({
  scaleMode: '크기 처리 방식',
  size: '정사각 다운스케일 크기',
  method: '다운스케일 보간법',
  factor: '축소 배율',
  factorFrameMode: '정수 배율 프레임 분할',
  gridFrameMode: '격자 분석 단위',
  gridFrameWidth: '격자 시트 프레임 너비',
  gridFrameHeight: '격자 시트 프레임 높이',
  gridSizeX: '격자 픽셀 크기 X',
  gridSizeY: '격자 픽셀 크기 Y',
  gridPhaseX: '격자 offset X',
  gridPhaseY: '격자 offset Y',
  gridSource: '격자 출처',
  gridLockedAcrossFrames: '프레임 간 격자 잠금',
  frameWidth: '프레임 너비',
  frameHeight: '프레임 높이',
  pixelBlockSize: '블록 크기',
  representativeColor: '셀 대표색',
  paletteMode: '팔레트 방식',
  paletteAlgorithm: '팔레트 생성 알고리즘',
  paletteSampling: '팔레트 샘플 가중',
  paletteReference: '팔레트 참조 이미지',
  customPalette: '직접 지정 팔레트',
  paletteEnabled: '팔레트 제한 사용',
  colors: '팔레트 색상 수',
  shared: '공유 팔레트',
  cleanEnabled: '노이즈 필터 사용',
  cleanPasses: '노이즈 필터 반복 횟수',
  outline: '외곽선 효과 사용',
  outlineWidth: '외곽선 굵기',
  outlineColor: '외곽선 색상',
  outlineShape: '외곽선 형태',
  exportNearestScales: '추가 nearest 확대본',
  alphaMode: '투명도 처리 방식',
  alphaThreshold: '투명도 임계값',
  ditherMode: '디더링',
  ditherStrength: '디더링 강도'
});

function formatSettingValue(key, val) {
  if (val === undefined || val === null) return '기본값';
  if (typeof val === 'boolean') return val ? '켜짐' : '꺼짐';
  if (key === 'ditherMode') {
    const map = { off: '사용 안 함 (기본)', bayer2: 'Bayer 2×2', bayer4: 'Bayer 4×4' };
    return map[val] || val;
  }
  if (key === 'ditherStrength') return val + '%';
  return String(val);
}

${functionsToExtract.map(fn => extractFunction(html, fn)).join('\n\n')}

this.api = {
  BAYER_MATRICES,
  DEFAULT_SETTINGS,
  PRESETS,
  SETTING_LABELS,
  srgbToOklab,
  nearestColorIndex,
  nearestOklabIndex,
  getTwoNearestPaletteIndices,
  applyOrderedDither,
  mapPixelsToPalette,
  normalizeSettings,
  validateSettingsEnvelope,
  diffSettings,
  getSettingsSummary
};
`;

vm.runInContext(scriptCode, context);
const {
  BAYER_MATRICES,
  DEFAULT_SETTINGS,
  PRESETS,
  getTwoNearestPaletteIndices,
  applyOrderedDither,
  mapPixelsToPalette,
  normalizeSettings,
  validateSettingsEnvelope,
  diffSettings,
  getSettingsSummary
} = context.api;

test('DIT-001: Bayer matrix structure and threshold formulas', () => {
  // Bayer 2x2
  assert.deepEqual(JSON.parse(JSON.stringify(BAYER_MATRICES.bayer2)), [
    [0, 2],
    [3, 1]
  ]);
  // Bayer 4x4
  assert.deepEqual(JSON.parse(JSON.stringify(BAYER_MATRICES.bayer4)), [
    [0, 8, 2, 10],
    [12, 4, 14, 6],
    [3, 11, 1, 9],
    [15, 7, 13, 5]
  ]);

  // Matrix values range 0 to N*N-1
  const b2Values = Array.from(BAYER_MATRICES.bayer2).flat().sort((a, b) => a - b);
  assert.deepEqual(b2Values, [0, 1, 2, 3]);

  const b4Values = Array.from(BAYER_MATRICES.bayer4).flat().sort((a, b) => a - b);
  assert.deepEqual(b4Values, Array.from({ length: 16 }, (_, i) => i));
});

test('DIT-001: Two-nearest palette colors and tie-breaking', () => {
  const palette = [
    [0, 0, 0],       // 0: Black
    [255, 255, 255], // 1: White
    [128, 128, 128], // 2: Gray
  ];

  // Near black: closest is 0, second closest is 2
  const nearBlack = getTwoNearestPaletteIndices(10, 10, 10, palette);
  assert.deepEqual(Array.from(nearBlack), [0, 2]);

  // Equidistant palette colors:
  // Palette has Black at 0, and Black copy at 1. Target (0, 0, 0) has distance 0 to both.
  // Tie-breaking must select 0 as first, and 1 as second.
  const equidistantPalette = [
    [0, 0, 0], // 0
    [0, 0, 0], // 1
    [255, 255, 255] // 2
  ];
  const tieRes = getTwoNearestPaletteIndices(0, 0, 0, equidistantPalette);
  assert.equal(tieRes[0], 0);
  assert.equal(tieRes[1], 1);

  // Single color palette
  const single = getTwoNearestPaletteIndices(50, 50, 50, [[100, 100, 100]]);
  assert.deepEqual(Array.from(single), [0, 0]);

  // Empty palette
  const empty = getTwoNearestPaletteIndices(50, 50, 50, []);
  assert.deepEqual(Array.from(empty), [-1, -1]);
});

test('DIT-001: Ordered dithering behavior across strength and modes', () => {
  const palette = [
    [0, 0, 0],       // 0: Black
    [255, 255, 255]  // 1: White
  ];

  // When ditherMode === 'off', always nearest color
  // Mid-gray (120) is closer to Black (0)
  const offResult = applyOrderedDither(120, 120, 120, 0, 0, palette, 'off', 50);
  assert.equal(offResult, 0);

  // When ditherStrength === 0, acts as nearest color
  const zeroStrength = applyOrderedDither(120, 120, 120, 0, 0, palette, 'bayer2', 0);
  assert.equal(zeroStrength, 0);

  // Bayer 2x2 with dark gray (64):
  // c0 = Black (0), c1 = White (1)
  // t = 64 / 255 ≈ 0.25098
  // (0,0): M=0, T = (0 + 0.5)/4 = 0.125. t >= 0.125 -> White (1)
  // (1,0): M=2, T = (2 + 0.5)/4 = 0.625. t < 0.625 -> Black (0)
  // (0,1): M=3, T = (3 + 0.5)/4 = 0.875. t < 0.875 -> Black (0)
  // (1,1): M=1, T = (1 + 0.5)/4 = 0.375. t < 0.375 -> Black (0)
  const p00 = applyOrderedDither(64, 64, 64, 0, 0, palette, 'bayer2', 100);
  const p10 = applyOrderedDither(64, 64, 64, 1, 0, palette, 'bayer2', 100);
  const p01 = applyOrderedDither(64, 64, 64, 0, 1, palette, 'bayer2', 100);
  const p11 = applyOrderedDither(64, 64, 64, 1, 1, palette, 'bayer2', 100);

  assert.equal(p00, 1, 'Top-left of 2x2 with brightness 64 should dither to white (1/4 density)');
  assert.equal(p10, 0, 'Top-right of 2x2 with brightness 64 should remain black');
  assert.equal(p01, 0, 'Bottom-left of 2x2 with brightness 64 should remain black');
  assert.equal(p11, 0, 'Bottom-right of 2x2 with brightness 64 should remain black');

  // Bayer 2x2 with light gray (191):
  // c0 = White (1), c1 = Black (0)
  // t (towards Black) = (255 - 191) / 255 = 64 / 255 ≈ 0.25098
  // (0,0): M=0, T = 0.125. t >= 0.125 -> Black (0)
  // (1,0): M=2, T = 0.625. t < 0.625 -> White (1)
  // (0,1): M=3, T = 0.875. t < 0.875 -> White (1)
  // (1,1): M=1, T = 0.375. t < 0.375 -> White (1)
  const lp00 = applyOrderedDither(191, 191, 191, 0, 0, palette, 'bayer2', 100);
  const lp10 = applyOrderedDither(191, 191, 191, 1, 0, palette, 'bayer2', 100);
  const lp01 = applyOrderedDither(191, 191, 191, 0, 1, palette, 'bayer2', 100);
  const lp11 = applyOrderedDither(191, 191, 191, 1, 1, palette, 'bayer2', 100);

  assert.equal(lp00, 0, 'Top-left of 2x2 with brightness 191 should dither to black (3/4 white density)');
  assert.equal(lp10, 1, 'Top-right of 2x2 with brightness 191 should remain white');
  assert.equal(lp01, 1, 'Bottom-left of 2x2 with brightness 191 should remain white');
  assert.equal(lp11, 1, 'Bottom-right of 2x2 with brightness 191 should remain white');
});

test('DIT-001: Monotonic block density response across uniform brightness levels', () => {
  const palette = [
    [0, 0, 0],
    [255, 255, 255]
  ];
  let prevWhiteCount = 0;
  // Test across increasing brightness 0..255 in Bayer 4x4 (16-pixel block)
  for (let v = 0; v <= 255; v += 8) {
    let whiteCount = 0;
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 4; x++) {
        const idx = applyOrderedDither(v, v, v, x, y, palette, 'bayer4', 100);
        if (idx === 1) whiteCount++;
      }
    }
    assert.ok(whiteCount >= prevWhiteCount, `White count at brightness ${v} (${whiteCount}) must be >= previous (${prevWhiteCount})`);
    prevWhiteCount = whiteCount;
  }
  assert.equal(prevWhiteCount, 16, 'Full white input must produce 16 white pixels');
});

test('DIT-001: Alpha and transparency invariance', () => {
  const palette = [[0, 0, 0], [255, 255, 255]];
  const width = 4;
  const height = 4;
  const pixelCount = 16;
  const data = new Uint8ClampedArray(pixelCount * 4).fill(128);
  const alpha = new Array(pixelCount).fill(0); // All transparent

  alpha[0] = 255; // Only pixel 0 is opaque

  const res = mapPixelsToPalette(data, alpha, pixelCount, palette, 'kmeans-srgb', 10, null, 0, 'bayer4', 100, width);
  assert.notEqual(res.grid[0], -1, 'Opaque pixel must be mapped');
  for (let i = 1; i < pixelCount; i++) {
    assert.equal(res.grid[i], -1, `Transparent pixel ${i} must remain -1`);
  }
});

test('DIT-001: Global coordinate pattern origin consistency across frames/sheets', () => {
  const palette = [[0, 0, 0], [255, 255, 255]];
  // Frame A at (0, 0) of size 4x4
  // Frame B at (4, 0) in sheet coordinate
  const pA_1_1 = applyOrderedDither(128, 128, 128, 1, 1, palette, 'bayer4', 100);
  const pB_5_1 = applyOrderedDither(128, 128, 128, 5, 1, palette, 'bayer4', 100);
  // In Bayer 4x4, (5 % 4) = 1, so (5, 1) has the same pattern matrix entry as (1, 1)
  assert.equal(pA_1_1, pB_5_1, 'Bayer pattern must maintain 4-periodic spatial invariance');
});

test('DIT-001: Settings normalization, defaults, presets, and validation', () => {
  // Default settings check
  assert.equal(DEFAULT_SETTINGS.ditherMode, 'off');
  assert.equal(DEFAULT_SETTINGS.ditherStrength, 50);

  // Presets check
  assert.equal(PRESETS['animation-safe'].ditherMode, 'off');
  assert.equal(PRESETS['oklab-animation-stable'].ditherMode, 'off');

  // Valid normalization
  const norm1 = normalizeSettings({ ditherMode: 'bayer2', ditherStrength: 70 });
  assert.equal(norm1.settings.ditherMode, 'bayer2');
  assert.equal(norm1.settings.ditherStrength, 70);

  // Invalid mode rejection
  assert.throws(
    () => normalizeSettings({ ditherMode: 'error-diffusion' }),
    /유효하지 않은 ditherMode 값/
  );

  // Invalid strength rejection
  assert.throws(
    () => normalizeSettings({ ditherStrength: -5 }),
    /ditherStrength는 0~100 범위의 정수/
  );
  assert.throws(
    () => normalizeSettings({ ditherStrength: 105 }),
    /ditherStrength는 0~100 범위의 정수/
  );
  assert.throws(
    () => normalizeSettings({ ditherStrength: 'fifty' }),
    /ditherStrength는 0~100 범위의 정수/
  );

  // Envelope roundtrip
  const envelope = {
    format: 'pixelate-studio-settings',
    version: 1,
    settings: {
      ...DEFAULT_SETTINGS,
      ditherMode: 'bayer4',
      ditherStrength: 90
    }
  };
  const validated = validateSettingsEnvelope(JSON.stringify(envelope));
  assert.equal(validated.settings.ditherMode, 'bayer4');
  assert.equal(validated.settings.ditherStrength, 90);

  // Diff calculation
  const diffs = diffSettings(DEFAULT_SETTINGS, { ditherMode: 'bayer2', ditherStrength: 40 });
  assert.equal(diffs.length, 2);
  assert.equal(diffs[0].key, 'ditherMode');
  assert.equal(diffs[0].toText, 'Bayer 2×2');
  assert.equal(diffs[1].key, 'ditherStrength');
  assert.equal(diffs[1].toText, '40%');

  // Summary
  const summary = getSettingsSummary({ scaleMode: 'square', size: 64, ditherMode: 'bayer2', ditherStrength: 40 });
  assert.match(summary, /디더링:bayer2\(40%\)/);
});
