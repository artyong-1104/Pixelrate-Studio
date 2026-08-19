import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';
import { extractInlineFunction } from './lib/extract-inline-function.mjs';

const root = resolve(import.meta.dirname, '..');
const html = readFileSync(resolve(root, 'pixelate_studio.html'), 'utf8');
const evidenceDir = resolve(root, 'pixelizer-codex-research/evidence/cfg-001');
mkdirSync(evidenceDir, { recursive: true });

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
  frameWidth: 64,
  frameHeight: 64,
  pixelBlockSize: 4,
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
  frameWidth: '프레임 너비',
  frameHeight: '프레임 높이',
  pixelBlockSize: '블록 크기',
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
  normalizeSettings,
  validateSettingsEnvelope,
  diffSettings
} = context.api;

// 1. Generate v1 sample envelopes
const sampleEnvelope = {
  format: 'pixelate-studio-settings',
  version: 1,
  createdAt: '2026-08-14T00:00:00.000Z',
  settings: {
    scaleMode: 'factor',
    size: 64,
    method: 'box',
    factor: 4,
    factorFrameMode: 'sheet',
    frameWidth: 64,
    frameHeight: 64,
    pixelBlockSize: 4,
    paletteEnabled: true,
    colors: 16,
    shared: true,
    cleanEnabled: true,
    cleanPasses: 1,
    outline: false,
    outlineWidth: 1,
    outlineColor: '#000000',
    outlineShape: '4',
    exportNearestScales: [2, 4]
  }
};
writeFileSync(resolve(evidenceDir, 'sample-v1-settings.json'), JSON.stringify(sampleEnvelope, null, 2) + '\n');

// 2. Test legacy migration
const legacySample = {
  downscaleEnabled: false,
  colorsNum: 32,
  cleanNum: 2,
  outlineWidthNum: 3
};
const migrated = normalizeSettings(legacySample, 'legacy-log');

// 3. Test invalid envelope errors
const invalidCases = [
  { name: 'version-2-rejection', payload: '{"format":"pixelate-studio-settings","version":2,"settings":{}}' },
  { name: 'prototype-pollution-rejection', payload: '{"format":"pixelate-studio-settings","version":1,"settings":{"__proto__":{"polluted":true}}}' },
  { name: 'out-of-range-size', payload: '{"format":"pixelate-studio-settings","version":1,"settings":{"size":1000}}' },
  { name: 'invalid-scale-mode', payload: '{"format":"pixelate-studio-settings","version":1,"settings":{"scaleMode":"invalid"}}' }
];

const rejectionResults = invalidCases.map(c => {
  try {
    validateSettingsEnvelope(c.payload);
    return { name: c.name, rejected: false };
  } catch (err) {
    return { name: c.name, rejected: true, error: err.message };
  }
});

// 4. Test presets diff results
const diffPresetSheet = diffSettings(DEFAULT_SETTINGS, PRESETS['preserve-sheet']);
const diffPresetAnim = diffSettings({ ...DEFAULT_SETTINGS, shared: false, outline: true }, PRESETS['animation-safe']);

const evidenceSummary = {
  item: 'CFG-001',
  title: 'Versioned settings JSON and presets evidence report',
  generatedAt: new Date().toISOString(),
  schemaVersion: 1,
  sampleValidation: validateSettingsEnvelope(JSON.stringify(sampleEnvelope)),
  legacyMigration: {
    input: legacySample,
    output: migrated.settings,
    warnings: migrated.warnings
  },
  rejectionResults,
  presetDiffs: {
    preserveSheetFromDefault: diffPresetSheet,
    animationSafeFromCustom: diffPresetAnim
  }
};

const summaryJson = JSON.stringify(evidenceSummary, null, 2) + '\n';
writeFileSync(resolve(evidenceDir, 'summary.json'), summaryJson);

const sha256 = createHash('sha256').update(summaryJson).digest('hex');
console.log('CFG-001 evidence generated successfully. SHA-256:', sha256);
