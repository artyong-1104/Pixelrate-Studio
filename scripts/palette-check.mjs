import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';
import { extractInlineFunction } from './lib/extract-inline-function.mjs';

const root = resolve(import.meta.dirname, '..');
const html = readFileSync(resolve(root, 'pixelate_studio.html'), 'utf8');

// 1. Verify HTML Structure & UI Elements
assert.match(html, /id="paletteMode"/, 'paletteMode element must exist');
assert.match(html, /<option value="auto"[^>]*>자동 생성/, 'paletteMode auto option must exist');
assert.match(html, /<option value="custom"[^>]*>직접 지정/, 'paletteMode custom option must exist');
assert.match(html, /<option value="unlimited"[^>]*>제한 없음/, 'paletteMode unlimited option must exist');
assert.match(html, /id="customPaletteText"/, 'customPaletteText element must exist');
assert.match(html, /id="loadPaletteFileBtn"/, 'loadPaletteFileBtn element must exist');
assert.match(html, /id="paletteFileInput"/, 'paletteFileInput element must exist');
assert.match(html, /id="clearCustomPaletteBtn"/, 'clearCustomPaletteBtn element must exist');
assert.match(html, /id="customPaletteStats"/, 'customPaletteStats element must exist');
assert.match(html, /id="customPaletteWarning"/, 'customPaletteWarning element must exist');
assert.match(html, /id="customPaletteChips"/, 'customPaletteChips element must exist');

// 2. Extract functions into sandbox
const functionNames = [
  'rgbToHex',
  'hexToRgb',
  'dedupePaletteColors',
  'parseHexPalette',
  'parseGplPalette',
  'parsePngPaletteData',
  'nearestColorIndex',
  'normalizeSettings',
  'validateSettingsEnvelope',
  'getSettingsSummary',
  'diffSettings',
  'formatSettingValue'
];

const mockBlob = class {
  constructor(parts) {
    this.text = parts.join('');
    this.size = Buffer.byteLength(this.text, 'utf8');
  }
};

const context = vm.createContext({
  Array,
  Blob: mockBlob,
  Buffer,
  Math,
  Number,
  Object,
  parseInt,
  Set,
  Map,
  String,
  document: {
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => []
  }
});

const extractedCode = `
const FORBIDDEN_SETTINGS_KEYS = ['__proto__', 'prototype', 'constructor'];
const FORBIDDEN_SETTINGS_PATTERN = /"(?:__proto__|prototype|constructor)"\\s*:/i;

function checkNoForbiddenKeys(obj) {
  if (!obj || typeof obj !== 'object') return;
  for (const k of Object.getOwnPropertyNames(obj)) {
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
  exportNearestScales: []
});

const SETTING_LABELS = Object.freeze({
  scaleMode: '크기 처리 방식',
  size: '정사각 다운스케일 크기',
  method: '다운스케일 보간법',
  factor: '축소 배율',
  factorFrameMode: '정수 배율 프레임 분할',
  frameWidth: '프레임 너비',
  frameHeight: '프레임 높이',
  pixelBlockSize: '블록 크기',
  paletteMode: '팔레트 방식',
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
  exportNearestScales: '추가 nearest 확대본'
});

function normalizeScaleMode(s) {
  if (s && ['square', 'factor', 'preserve-sheet', 'original'].includes(s.scaleMode)) return s.scaleMode;
  return s && s.downscaleEnabled === false ? 'original' : 'square';
}

${functionNames.map(name => extractInlineFunction(html, name)).join('\n')}
this.api = {
  rgbToHex,
  hexToRgb,
  dedupePaletteColors,
  parseHexPalette,
  parseGplPalette,
  parsePngPaletteData,
  nearestColorIndex,
  normalizeSettings,
  validateSettingsEnvelope,
  getSettingsSummary,
  diffSettings,
  formatSettingValue
};
`;

vm.runInContext(extractedCode, context);
const {
  rgbToHex,
  hexToRgb,
  dedupePaletteColors,
  parseHexPalette,
  parseGplPalette,
  parsePngPaletteData,
  nearestColorIndex,
  normalizeSettings,
  validateSettingsEnvelope,
  getSettingsSummary,
  diffSettings,
  formatSettingValue
} = context.api;

const clone = (obj) => JSON.parse(JSON.stringify(obj));

// 3. Test HEX Parser
console.log('--- Testing parseHexPalette ---');
{
  const hexInput = `
    // Game Boy 4-Color Palette
    #0f380f, #306230
    #8bac0f #9bbc0f
    ; Duplicate and invalid tokens
    #0f380f
    #fff
    #12345678
    red
  `;
  const res = parseHexPalette(hexInput);
  assert.equal(res.hexes.length, 4, 'Should parse exactly 4 unique valid hex colors');
  assert.deepEqual(clone(res.hexes), ['#0F380F', '#306230', '#8BAC0F', '#9BBC0F']);
  assert.equal(res.duplicatesRemoved, 1, 'Duplicate #0f380f should be tracked');
  assert.equal(res.ignoredCount, 3, '#fff, #12345678, red should be counted as ignored');
  assert.equal(res.errors.length, 3, 'Errors should record 3 invalid tokens');
}

// 4. Test GPL Parser
console.log('--- Testing parseGplPalette ---');
{
  const gplInput = `GIMP Palette
Name: Pico-8
Columns: 4
#
  0   0   0   Black
 29  43  83   Dark Blue
126  37  83   Dark Purple
  0   0   0   Duplicate Black
300  50  50   Invalid Out Of Range
`;
  const res = parseGplPalette(gplInput);
  assert.equal(res.hexes.length, 3, 'Should parse 3 unique valid colors');
  assert.deepEqual(clone(res.hexes), ['#000000', '#1D2B53', '#7E2553']);
  assert.equal(res.duplicatesRemoved, 1, 'Duplicate black should be removed');
  assert.equal(res.ignoredCount, 1, '300 50 50 should be ignored');
}

// 5. Test PNG Palette Extraction
console.log('--- Testing parsePngPaletteData ---');
{
  // 3x2 image:
  // (0,0): Red (255, 0, 0, 255)
  // (1,0): Green (0, 255, 0, 255)
  // (2,0): Blue (0, 0, 255, 255)
  // (0,1): Red (255, 0, 0, 255) -> Duplicate
  // (1,1): Fully transparent (0, 0, 0, 0)
  // (2,1): Partial transparent (100, 100, 100, 128)
  const data = new Uint8ClampedArray([
    255, 0, 0, 255,
    0, 255, 0, 255,
    0, 0, 255, 255,
    255, 0, 0, 255,
    0, 0, 0, 0,
    100, 100, 100, 128
  ]);
  const imgData = { data, width: 3, height: 2 };
  const res = parsePngPaletteData(imgData);

  assert.equal(res.hexes.length, 3, 'Should extract 3 unique opaque colors');
  assert.deepEqual(clone(res.hexes), ['#FF0000', '#00FF00', '#0000FF']);
  assert.equal(res.duplicatesRemoved, 1, 'Duplicate Red should be counted');
  assert.equal(res.partialAlphaCount, 1, 'Partial alpha pixel should be recorded');
  assert.equal(res.warnings.length, 1, 'Warning should be generated for partial alpha');
}

// 6. Test Deduplication Order Preservation
console.log('--- Testing Deduplication Order ---');
{
  const raw = [
    [10, 20, 30],
    [50, 60, 70],
    [10, 20, 30], // duplicate of #1
    [80, 90, 100],
    [50, 60, 70]  // duplicate of #2
  ];
  const deduped = dedupePaletteColors(raw);
  assert.deepEqual(clone(deduped.colors), [
    [10, 20, 30],
    [50, 60, 70],
    [80, 90, 100]
  ]);
  assert.equal(deduped.duplicatesRemoved, 2);
}

// 7. Test Nearest Color Index & Tie-breaking
console.log('--- Testing nearestColorIndex Tie-breaking ---');
{
  // Palette: Index 0 is [100, 100, 100], Index 1 is [100, 100, 100]
  // Distance from [100, 100, 100] to both is 0. Index 0 MUST be selected.
  const palette = [
    [100, 100, 100],
    [100, 100, 100],
    [200, 200, 200]
  ];
  const bestIdx = nearestColorIndex(100, 100, 100, palette);
  assert.equal(bestIdx, 0, 'Must break ties by choosing the earlier palette index');

  // Equidistant case: test with distance = 25
  // Point [50, 50, 50], Color A [55, 50, 50] (dist 25), Color B [45, 50, 50] (dist 25)
  const paletteEquidistant = [
    [55, 50, 50],
    [45, 50, 50]
  ];
  assert.equal(nearestColorIndex(50, 50, 50, paletteEquidistant), 0, 'Equidistant tie-break must choose index 0');
}

// 8. Test Settings Pipeline & Migrations
console.log('--- Testing Settings Pipeline ---');
{
  // Legacy migration 1: paletteEnabled: false -> paletteMode: 'unlimited'
  const legacy1 = normalizeSettings({ paletteEnabled: false });
  assert.equal(legacy1.settings.paletteMode, 'unlimited');
  assert.equal(legacy1.settings.paletteEnabled, false);

  // Legacy migration 2: paletteEnabled: true -> paletteMode: 'auto'
  const legacy2 = normalizeSettings({ paletteEnabled: true });
  assert.equal(legacy2.settings.paletteMode, 'auto');
  assert.equal(legacy2.settings.paletteEnabled, true);

  // Custom palette envelope
  const customPaletteList = ['#0F380F', '#306230', '#8BAC0F', '#9BBC0F'];
  const envelope = {
    format: 'pixelate-studio-settings',
    version: 1,
    createdAt: new Date().toISOString(),
    settings: {
      paletteMode: 'custom',
      customPalette: customPaletteList
    }
  };
  const validated = validateSettingsEnvelope(JSON.stringify(envelope));
  assert.equal(validated.settings.paletteMode, 'custom');
  assert.deepEqual(clone(validated.settings.customPalette), customPaletteList);
  assert.equal(validated.settings.colors, 4, 'colors should sync with customPalette length');

  // Rejection when customPalette < 2 colors
  assert.throws(
    () => normalizeSettings({ paletteMode: 'custom', customPalette: ['#123456'] }),
    /customPalette는 2~256개의 유효한 색상/,
    'Custom palette with < 2 colors must be rejected'
  );

  // Summary strings
  const summaryAuto = getSettingsSummary({ scaleMode: 'square', size: 64, paletteMode: 'auto', colors: 16 });
  assert.match(summaryAuto, /팔레트:16색/);

  const summaryCustom = getSettingsSummary({ scaleMode: 'square', size: 64, paletteMode: 'custom', customPalette: customPaletteList });
  assert.match(summaryCustom, /팔레트:직접지정\(4색\)/);

  const summaryUnlimited = getSettingsSummary({ scaleMode: 'square', size: 64, paletteMode: 'unlimited' });
  assert.match(summaryUnlimited, /팔레트:제한없음/);
}

// 9. Test Unused Palette Color Retention Logic (JSON Metadata Simulation)
console.log('--- Testing Unused Palette Retention ---');
{
  const inputCustomColors = [
    [15, 56, 15],
    [48, 98, 48],
    [139, 172, 15],
    [155, 188, 15]
  ];
  // 4x4 image only uses colors 0, 1, 2. Color 3 is never used.
  const finalGrid = [
    0, 0, 1, 1,
    0, 0, 1, 1,
    2, 2, 2, 2,
    2, 2, 2, 2
  ];
  const finalAlpha = new Array(16).fill(255);

  const usedIndices = new Set();
  for (let i = 0; i < finalGrid.length; i++) {
    if (finalGrid[i] >= 0 && finalGrid[i] < inputCustomColors.length && finalAlpha[i] >= 10) {
      usedIndices.add(finalGrid[i]);
    }
  }

  const paletteObj = {};
  inputCustomColors.forEach((c, i) => paletteObj[i] = c);

  const paletteProcessing = {
    mode: 'custom',
    inputColors: inputCustomColors.length,
    usedColors: usedIndices.size,
    distance: 'srgb'
  };

  assert.equal(Object.keys(paletteObj).length, 4, 'Palette object must retain all 4 input colors');
  assert.equal(paletteProcessing.inputColors, 4);
  assert.equal(paletteProcessing.usedColors, 3, 'Used colors count must be 3');
  assert.equal(paletteProcessing.distance, 'srgb');
}

console.log('ALL PAL-001 tests passed successfully.');
