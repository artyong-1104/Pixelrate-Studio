import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { extractInlineFunctions } from './lib/extract-inline-function.mjs';

const root = path.resolve(import.meta.dirname, '..');
const html = fs.readFileSync(path.resolve(root, 'pixelate_studio.html'), 'utf8');
const sandbox = {
  Array,
  Math,
  Number,
  MAX_RAW_PROCESS_PIXELS: 4_194_304
};
vm.createContext(sandbox);
vm.runInContext(extractInlineFunctions(html, [
  'getGridAnalysisPresentation',
  'cancelGridAnalysisState',
  'getGridFrameValidationError',
  'createGridProcessingMetadata'
]).join('\n'), sandbox);

for (const id of [
  'gridRepairOptions', 'gridAnalyzeBtn', 'gridCancelBtn', 'gridAnalysisResult',
  'gridSizeX', 'gridSizeY', 'gridPhaseX', 'gridPhaseY', 'gridManualLock',
  'gridApplyBtn', 'gridCropResult', 'gridAnalysisCanvas'
]) {
  assert.match(html, new RegExp(`id=["']${id}["']`), `${id} must exist`);
}

assert.match(html, /<option value="grid-repair">AI 픽셀 격자 복구 \(실험\)<\/option>/);
assert.match(html, /MAX_RAW_PROCESS_PIXELS/);
assert.match(html, /lockedAcrossFrames: true/);
assert.match(html, /input\[name="gridFrameMode"\]/);
assert.match(html, /전체 이미지·다중 파일/);
assert.match(html, /스프라이트 시트 프레임별/);
assert.match(html, /자홍 실선/);
assert.match(html, /하늘 점선/);
assert.match(html, /gridCancelBtn\.addEventListener\('click'/);
assert.match(html, /gridAnalyzeBtn\.addEventListener\('click', runGridAnalysis\)/);
assert.match(html, /gridApplyBtn\.addEventListener\('click', applyGridFromControls\)/);
assert.match(html, /cancelGridAnalysisState\(gridAnalysisState\)/);
assert.match(html, /processing = createGridProcessingMetadata\(/);
assert.match(html, /gridAnalysisState\.applied\?\.source \|\| \(gridManualLock\?\.checked \? 'manual' : 'auto'\)/);

const belowPreview = sandbox.getGridAnalysisPresentation({ ok: true, confidence: 0.499, maxChunkMs: 1 });
assert.equal(belowPreview.autoReady, false);
assert.equal(belowPreview.className, 'error');
assert.match(belowPreview.suffix, /안정적으로 찾지 못했습니다/);

for (const confidence of [0.5, 0.749999]) {
  const previewOnly = sandbox.getGridAnalysisPresentation({ ok: true, confidence, maxChunkMs: 1 });
  assert.equal(previewOnly.autoReady, false, `${confidence} must remain preview-only`);
  assert.equal(previewOnly.className, 'warning');
  assert.match(previewOnly.suffix, /확신이 낮습니다/);
}

const autoReady = sandbox.getGridAnalysisPresentation({ ok: true, confidence: 0.75, maxChunkMs: 100 });
assert.equal(autoReady.autoReady, true, 'confidence 0.75 and max chunk 100ms must be accepted');
assert.equal(autoReady.className, 'valid');
const slow = sandbox.getGridAnalysisPresentation({ ok: true, confidence: 1, maxChunkMs: 100.001 });
assert.equal(slow.autoReady, false, 'a chunk over 100ms must block auto apply');
assert.match(slow.suffix, /100ms 초과/);

const cancellationState = {
  token: 7,
  busy: true,
  result: { ok: true },
  applied: { sizeX: 4 },
  elapsedMs: 18
};
sandbox.cancelGridAnalysisState(cancellationState);
assert.deepEqual(JSON.parse(JSON.stringify(cancellationState)), {
  token: 8,
  busy: false,
  result: null,
  applied: null,
  elapsedMs: 0
});

const exact4M = [{ name: 'exact.png', img: { width: 2048, height: 2048 } }];
assert.equal(sandbox.getGridFrameValidationError(exact4M, 'whole', 0, 0, true), '');
const over4M = [{ name: 'over.png', img: { width: 2049, height: 2048 } }];
assert.match(sandbox.getGridFrameValidationError(over4M, 'whole', 0, 0, true), /4M 픽셀 이하/);

const downscaled = {
  w: 16,
  h: 8,
  frameLogicalW: 8,
  frameLogicalH: 8,
  gridCrop: {
    x: { marginBefore: 1, marginAfter: 2 },
    y: { marginBefore: 3, marginAfter: 4 }
  }
};
const autoMetadata = sandbox.createGridProcessingMetadata(
  { sizeX: 4, sizeY: 4, phaseX: 1, phaseY: 2, source: 'auto', confidence: 0.82 },
  'whole',
  0,
  0,
  downscaled
);
assert.deepEqual(JSON.parse(JSON.stringify(autoMetadata)), {
  mode: 'grid-repair',
  frameMode: 'whole',
  grid: {
    sizeX: 4,
    sizeY: 4,
    phaseX: 1,
    phaseY: 2,
    source: 'auto',
    lockedAcrossFrames: true,
    margins: { left: 1, right: 2, top: 3, bottom: 4 },
    confidence: 0.82
  },
  logicalWidth: 16,
  logicalHeight: 8
});
const sheetMetadata = sandbox.createGridProcessingMetadata(
  { sizeX: 4, sizeY: 4, phaseX: 0, phaseY: 0, source: 'manual' },
  'sheet',
  32,
  32,
  downscaled
);
assert.equal(sheetMetadata.grid.lockedAcrossFrames, true);
assert.equal('confidence' in sheetMetadata.grid, false, 'manual metadata must not invent confidence');
assert.equal(sheetMetadata.frameWidth, 32);
assert.equal(sheetMetadata.frameHeight, 32);
assert.equal(sheetMetadata.frameLogicalWidth, 8);
assert.equal(sheetMetadata.frameLogicalHeight, 8);

console.log('GRID-001 executable confidence, cancellation, 4M limit, metadata, and UI wiring checks passed.');
