import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';
import { extractInlineFunction } from './lib/extract-inline-function.mjs';

const root = resolve(import.meta.dirname, '..');
const html = readFileSync(resolve(root, 'pixelate_studio.html'), 'utf8');

// 1. Verify HTML Structure
assert.match(html, /id="presetSelect"/, 'presetSelect element must exist');
assert.match(html, /id="applyPresetBtn"/, 'applyPresetBtn element must exist');
assert.match(html, /id="exportSettingsBtn"/, 'exportSettingsBtn element must exist');
assert.match(html, /id="importSettingsBtn"/, 'importSettingsBtn element must exist');
assert.match(html, /id="importSettingsInput"/, 'importSettingsInput element must exist');
assert.match(html, /id="presetDiffBox"/, 'presetDiffBox element must exist');
assert.match(html, /id="settingsFeedback"/, 'settingsFeedback element must exist');
assert.match(html, /id="showExperimentalFeatures"/, 'CELL-001 experimental feature toggle must exist');
assert.match(html, /id="representativeColor"/, 'CELL-001 representative select must exist');
for (const id of ['mean-srgb', 'mean-linear', 'center', 'median', 'majority']) {
  assert.match(html, new RegExp(`value="${id}"`), `CELL-001 option ${id} must exist`);
}

// 2. Extract functions into test sandbox
const functionNames = [
  'normalizeScaleMode',
  'getSettingsSummary',
  'readUiSettings',
  'normalizeSettings',
  'validateSettingsEnvelope',
  'formatSettingValue',
  'diffSettings',
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
  String,
  document: {
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => []
  }
});

// Extract constants and functions
const extractedCode = `
const FORBIDDEN_SETTINGS_KEYS = ['__proto__', 'prototype', 'constructor'];
const FORBIDDEN_SETTINGS_PATTERN = /"(?:__proto__|prototype|constructor)"\s*:/i;

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
});

const PRESETS = Object.freeze({
  default: { ...DEFAULT_SETTINGS },
  'animation-safe': {
    shared: true,
    cleanEnabled: true,
    cleanPasses: 1,
    outline: false
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
  gridSource: '격자 입력 출처',
  gridLockedAcrossFrames: '프레임 간 격자 잠금',
  frameWidth: '프레임 너비',
  frameHeight: '프레임 높이',
  pixelBlockSize: '블록 크기',
  representativeColor: '셀 대표색',
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
  exportNearestScales: '추가 nearest 확대본',
  alphaMode: '투명도 처리 방식',
  alphaThreshold: '투명도 임계값'
});

${functionNames.map(name => extractInlineFunction(html, name)).join('\n')}
this.api = {
  DEFAULT_SETTINGS,
  PRESETS,
  normalizeScaleMode,
  getSettingsSummary,
  normalizeSettings,
  validateSettingsEnvelope,
  diffSettings
};
`;

vm.runInContext(extractedCode, context);
const {
  DEFAULT_SETTINGS,
  PRESETS,
  normalizeScaleMode,
  getSettingsSummary,
  normalizeSettings,
  validateSettingsEnvelope,
  diffSettings
} = context.api;

// 3. Test Default Settings Round Trip
const defaultEnvelope = {
  format: 'pixelate-studio-settings',
  version: 1,
  createdAt: new Date().toISOString(),
  settings: { ...DEFAULT_SETTINGS }
};
const defaultJson = JSON.stringify(defaultEnvelope, null, 2);
const validatedDefault = validateSettingsEnvelope(defaultJson);
assert.equal(validatedDefault.format, 'pixelate-studio-settings');
assert.equal(validatedDefault.version, 1);
assert.deepEqual(JSON.parse(JSON.stringify(validatedDefault.settings)), JSON.parse(JSON.stringify(DEFAULT_SETTINGS)), 'Default settings must round trip exactly');
assert.equal(validatedDefault.warnings.length, 0);

// 4. Test Factor and Preserve Sheet Settings Round Trip
const customSettings = {
  scaleMode: 'factor',
  size: 128,
  method: 'nearest',
  factor: 8,
  factorFrameMode: 'sheet',
  gridFrameMode: 'whole',
  gridFrameWidth: 64,
  gridFrameHeight: 64,
  gridSizeX: 8,
  gridSizeY: 8,
  gridPhaseX: 0,
  gridPhaseY: 0,
  gridSource: 'manual',
  gridLockedAcrossFrames: true,
  frameWidth: 128,
  frameHeight: 128,
  pixelBlockSize: 8,
  representativeColor: 'majority',
  paletteMode: 'auto',
  customPalette: [],
  paletteEnabled: true,
  colors: 32,
  shared: false,
  cleanEnabled: true,
  cleanPasses: 3,
  outline: true,
  outlineWidth: 2,
  outlineColor: '#ff0000',
  outlineShape: '8',
  exportNearestScales: [2, 8],
  alphaMode: 'coverage',
  alphaThreshold: 128
};
const customEnvelope = {
  format: 'pixelate-studio-settings',
  version: 1,
  createdAt: '2026-08-14T12:00:00.000Z',
  settings: customSettings
};
const validatedCustom = validateSettingsEnvelope(JSON.stringify(customEnvelope));
assert.deepEqual(JSON.parse(JSON.stringify(validatedCustom.settings)), customSettings, 'Custom factor settings must round trip exactly');

const gridSettings = {
  ...DEFAULT_SETTINGS,
  scaleMode: 'grid-repair',
  gridFrameMode: 'sheet',
  gridFrameWidth: 96,
  gridFrameHeight: 80,
  gridSizeX: 8,
  gridSizeY: 4,
  gridPhaseX: 3,
  gridPhaseY: 1,
  gridSource: 'auto',
  gridLockedAcrossFrames: true
};
const validatedGrid = validateSettingsEnvelope(JSON.stringify({
  format: 'pixelate-studio-settings',
  version: 1,
  settings: gridSettings
}));
assert.deepEqual(
  JSON.parse(JSON.stringify(validatedGrid.settings)),
  JSON.parse(JSON.stringify(gridSettings)),
  'GRID-001 settings must round trip exactly'
);

// 5. Test Legacy Settings Migration (from old IndexedDB logs)
const legacyLog1 = {
  downscaleEnabled: false,
  colorsNum: '32',
  cleanNum: 2,
  outlineWidthNum: '3'
};
const migrated1 = normalizeSettings(legacyLog1, 'legacy-log');
assert.equal(migrated1.settings.scaleMode, 'original', 'Legacy downscaleEnabled:false must map to original');
assert.equal(migrated1.settings.colors, 32);
assert.equal(migrated1.settings.cleanPasses, 2);
assert.equal(migrated1.settings.outlineWidth, 3);
assert.equal(migrated1.settings.size, 64, 'Missing fields must default');

const legacyLog2 = {
  downscaleEnabled: true,
  size: '128',
  clean: 1
};
const migrated2 = normalizeSettings(legacyLog2, 'legacy-log');
assert.equal(migrated2.settings.scaleMode, 'square', 'Legacy downscaleEnabled:true must map to square');
assert.equal(migrated2.settings.size, 128);
assert.equal(migrated2.settings.cleanPasses, 1);

// 6. Test Rejection of Invalid Envelopes & Security Rules
// 6.1 Unsupported version
assert.throws(
  () => validateSettingsEnvelope(JSON.stringify({ format: 'pixelate-studio-settings', version: 2, settings: {} })),
  /지원하지 않는 설정 버전/,
  'Version 2 must be rejected'
);
assert.throws(
  () => validateSettingsEnvelope(JSON.stringify({ format: 'pixelate-studio-settings', version: 0, settings: {} })),
  /지원하지 않는 설정 버전/,
  'Version 0 must be rejected'
);

// 6.2 Invalid format
assert.throws(
  () => validateSettingsEnvelope(JSON.stringify({ format: 'other-app-settings', version: 1, settings: {} })),
  /유효하지 않은 설정 포맷/,
  'Invalid format name must be rejected'
);

// 6.3 Missing settings object
assert.throws(
  () => validateSettingsEnvelope(JSON.stringify({ format: 'pixelate-studio-settings', version: 1 })),
  /설정 데이터\(settings\) 객체가 누락/,
  'Missing settings object must be rejected'
);

// 6.4 Invalid enums / ranges
assert.throws(
  () => normalizeSettings({ scaleMode: 'bicubic' }),
  /유효하지 않은 scaleMode 값/,
  'Invalid scaleMode must be rejected'
);
assert.throws(
  () => normalizeSettings({ size: 10 }),
  /size는 16~512 범위의 정수/,
  'Size < 16 must be rejected'
);
assert.throws(
  () => normalizeSettings({ size: 1024 }),
  /size는 16~512 범위의 정수/,
  'Size > 512 must be rejected'
);
assert.throws(
  () => normalizeSettings({ factor: 1 }),
  /factor는 2~16 범위의 정수/,
  'Factor 1 must be rejected'
);
assert.throws(
  () => normalizeSettings({ factor: 17 }),
  /factor는 2~16 범위의 정수/,
  'Factor 17 must be rejected'
);
assert.throws(
  () => normalizeSettings({ gridSizeX: 1 }),
  /gridSizeX는 2~32 범위의 정수/,
  'Grid size below 2 must be rejected'
);
assert.throws(
  () => normalizeSettings({ gridSizeX: 8, gridPhaseX: 8 }),
  /gridPhaseX는 0~7 범위의 정수/,
  'Grid phase equal to its period must be rejected'
);
assert.throws(
  () => normalizeSettings({ gridLockedAcrossFrames: false }),
  /gridLockedAcrossFrames는 프레임 간 격자 흔들림을 막기 위해 true/,
  'Per-frame grid drift must be rejected'
);
assert.throws(
  () => normalizeSettings({ colors: 1 }),
  /colors는 2~256 범위의 정수/,
  'Colors < 2 must be rejected'
);
assert.throws(
  () => normalizeSettings({ colors: 300 }),
  /colors는 2~256 범위의 정수/,
  'Colors > 256 must be rejected'
);
assert.throws(
  () => normalizeSettings({ cleanPasses: 15 }),
  /cleanPasses는 0~10 범위의 정수/,
  'CleanPasses > 10 must be rejected'
);
assert.throws(
  () => normalizeSettings({ outlineColor: 'red' }),
  /outlineColor는 올바른 16진수 색상 코드/,
  'Invalid hex color must be rejected'
);
assert.throws(
  () => normalizeSettings({ exportNearestScales: [3, 5] }),
  /exportNearestScales 항목은 2, 4, 8/,
  'Invalid nearest scale must be rejected'
);
assert.throws(
  () => normalizeSettings({ alphaMode: 'linear' }),
  /유효하지 않은 alphaMode 값/,
  'Invalid alphaMode must be rejected'
);
assert.throws(
  () => normalizeSettings({ alphaThreshold: 0 }),
  /alphaThreshold는 1~254 범위의 정수/,
  'alphaThreshold 0 must be rejected'
);
assert.throws(
  () => normalizeSettings({ alphaThreshold: 255 }),
  /alphaThreshold는 1~254 범위의 정수/,
  'alphaThreshold 255 must be rejected'
);
assert.throws(
  () => normalizeSettings({ alphaThreshold: 'not-a-number' }),
  /alphaThreshold는 1~254 범위의 정수/,
  'alphaThreshold NaN must be rejected'
);
assert.throws(
  () => normalizeSettings({ representativeColor: 'automatic-best' }),
  /유효하지 않은 representativeColor 값/,
  'Unknown representativeColor must be rejected'
);
const normalizedLegacyRepresentative = normalizeSettings({ scaleMode: 'factor', factor: 4 });
assert.equal(normalizedLegacyRepresentative.settings.representativeColor, 'mean-srgb', 'Legacy settings must default to mean-srgb');

// 6.5 Prototype Pollution Prevention
assert.throws(
  () => validateSettingsEnvelope('{"format":"pixelate-studio-settings","version":1,"settings":{"__proto__":{"polluted":true}}}'),
  /보안 위험: 금지된 속성 키/,
  '__proto__ key in JSON must be rejected'
);
assert.throws(
  () => validateSettingsEnvelope('{"format":"pixelate-studio-settings","version":1,"settings":{"constructor":{"prototype":{}}}}'),
  /보안 위험: 금지된 속성 키/,
  'constructor key in JSON must be rejected'
);
assert.throws(
  () => validateSettingsEnvelope('{"format":"pixelate-studio-settings","version":1,"settings":{"prototype":{"polluted":true}}}'),
  /보안 위험: 금지된 속성 키/,
  'prototype key in JSON must be rejected'
);
assert.throws(
  () => {
    const dangerousObj = {};
    Object.defineProperty(dangerousObj, '__proto__', { value: { polluted: true }, enumerable: true });
    normalizeSettings(dangerousObj);
  },
  /보안 위험: 금지된 속성 키/,
  '__proto__ own property in normalizeSettings must be rejected'
);

// 6.6 64KB size limit
const largePayload = 'a'.repeat(70000);
assert.throws(
  () => validateSettingsEnvelope(largePayload),
  /64KB/,
  'Payload > 64KB must be rejected'
);

// 7. Unknown fields ignored with warning
const envelopeWithUnknown = {
  format: 'pixelate-studio-settings',
  version: 1,
  settings: {
    ...DEFAULT_SETTINGS,
    futureField: 'experimental',
    customPresetName: 'my-preset'
  }
};
const validatedUnknown = validateSettingsEnvelope(JSON.stringify(envelopeWithUnknown));
assert.equal(validatedUnknown.warnings.length, 2, 'Should have 2 warnings for unknown fields');
assert.equal('futureField' in validatedUnknown.settings, false, 'Unknown field must not be in output settings');
assert.equal(validatedUnknown.settings.scaleMode, 'square');

// 8. Test Presets and Diff Calculation
const diffAnim = diffSettings(DEFAULT_SETTINGS, PRESETS['animation-safe']);
// Animation safe sets shared:true, cleanEnabled:true, cleanPasses:1, outline:false.
// Since DEFAULT_SETTINGS already has shared:true, cleanEnabled:true, cleanPasses:1, outline:false, diff is 0.
assert.equal(diffAnim.length, 0);

const currentCustom = {
  ...DEFAULT_SETTINGS,
  shared: false,
  outline: true,
  scaleMode: 'factor'
};
const diffAnimFromCustom = diffSettings(currentCustom, PRESETS['animation-safe']);
assert.equal(diffAnimFromCustom.length, 2, 'Should detect 2 changed keys (shared, outline)');
assert.equal(diffAnimFromCustom[0].key, 'shared');
assert.equal(diffAnimFromCustom[1].key, 'outline');

const diffSheet = diffSettings(DEFAULT_SETTINGS, PRESETS['preserve-sheet']);
assert.equal(diffSheet.length, 1);
assert.equal(diffSheet[0].key, 'scaleMode');
assert.equal(diffSheet[0].fromText, '정사각 다운스케일');
assert.equal(diffSheet[0].toText, '원본 규격 유지');

const representativeDiff = diffSettings(DEFAULT_SETTINGS, { representativeColor: 'mean-linear' });
assert.equal(representativeDiff.length, 1);
assert.equal(representativeDiff[0].label, '셀 대표색');
assert.equal(representativeDiff[0].toText, '선형광 평균');
assert.match(getSettingsSummary({ scaleMode: 'factor', factor: 4, representativeColor: 'majority' }), /대표색:majority/);

// 9. Export contains no image data or filenames
const exportedKeys = Object.keys(validatedCustom.settings);
assert.equal(exportedKeys.includes('dataUrl'), false);
assert.equal(exportedKeys.includes('canvas'), false);
assert.equal(exportedKeys.includes('name'), false);
assert.equal(exportedKeys.includes('files'), false);

console.log('CFG-001 regression checks passed (envelope schema, GRID-001 round trip, legacy migration, strict validation, prototype safety, presets diff, 64KB limit).');
