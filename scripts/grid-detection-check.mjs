import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { performance } from 'node:perf_hooks';
import { generateCorpus } from './lib/pixel-fixtures.mjs';
import { extractInlineFunction, extractInlineFunctions } from './lib/extract-inline-function.mjs';

const root = path.resolve(import.meta.dirname, '..');
const html = fs.readFileSync(path.resolve(root, 'pixelate_studio.html'), 'utf8');
const sandbox = {
  Uint8Array,
  Uint8ClampedArray,
  Float64Array,
  Array,
  Map,
  Number,
  Math,
  DOMException,
  performance,
  setTimeout
};
vm.createContext(sandbox);
const syncSource = extractInlineFunctions(html, [
  'normalizeRepresentativeColor',
  'srgbChannelToLinear',
  'linearChannelToSrgb',
  'representativeMedian',
  'representativeColorForCell',
  'gridClamp01',
  'gridMedian',
  'prepareGridProfile',
  'accumulateGridAlphaMask',
  'computeSobelGridProfiles',
  'normalizeGridProfileForAggregate',
  'detectGridAxis',
  'detectGridFromProfiles',
  'aggregateGridProfiles',
  'analyzeGridFrames',
  'computeGridAxisCrop',
  'computeGridCrop',
  'validateManualGrid',
  'sliceGridFrame',
  'gridRepairDownscale'
]);
const asyncSource = [
  'computeSobelGridProfilesAsync',
  'sliceGridFrameAsync',
  'getGridAnalysisFramesAsync',
  'analyzeGridFramesAsync'
]
  .map(name => `async ${extractInlineFunction(html, name)}`);
vm.runInContext([...syncSource, ...asyncSource].join('\n'), sandbox);

function makeGrid(width, height, periodX, periodY, phaseX, phaseY, alpha = 255) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const cellX = Math.floor((x - phaseX) / periodX);
      const cellY = Math.floor((y - phaseY) / periodY);
      const light = (cellX + cellY) % 2 === 0;
      const index = (y * width + x) * 4;
      const value = light ? 220 : 36;
      data[index] = value;
      data[index + 1] = light ? 184 : 48;
      data[index + 2] = light ? 92 : 170;
      data[index + 3] = alpha;
    }
  }
  return { data, width, height };
}

for (const candidate of [
  { period: 3, phase: 1 },
  { period: 4, phase: 2 },
  { period: 8, phase: 3 }
]) {
  const frame = makeGrid(192, 160, candidate.period, candidate.period, candidate.phase, candidate.phase);
  const result = sandbox.analyzeGridFrames([frame]);
  assert.equal(result.ok, true, `${candidate.period}px clean grid must be detected`);
  assert.equal(result.sizeX, candidate.period, `${candidate.period}px X period`);
  assert.equal(result.sizeY, candidate.period, `${candidate.period}px Y period`);
  assert.equal(result.phaseX, candidate.phase, `${candidate.period}px X phase`);
  assert.equal(result.phaseY, candidate.phase, `${candidate.period}px Y phase`);
  assert.ok(result.confidence >= 0.75, `${candidate.period}px clean grid confidence must reach apply gate`);
}

const corpus = generateCorpus();
const cleanPixelArt = corpus.find(item => item.id === 'clean-pixel-art');
const cleanPixelArtResult = sandbox.analyzeGridFrames([{ data: cleanPixelArt.frames[0], width: cleanPixelArt.width, height: cleanPixelArt.height }]);
assert.equal(cleanPixelArtResult.ok, true, 'QLT clean-pixel-art must produce a grid result');
assert.equal(cleanPixelArtResult.sizeX, 4, 'QLT clean-pixel-art X period must match ground truth');
assert.equal(cleanPixelArtResult.sizeY, 4, 'QLT clean-pixel-art Y period must match ground truth');
assert.equal(cleanPixelArtResult.phaseX, 0, 'QLT clean-pixel-art X phase must match ground truth');
assert.equal(cleanPixelArtResult.phaseY, 0, 'QLT clean-pixel-art Y phase must match ground truth');
const asyncCleanPixelArtResult = await sandbox.analyzeGridFramesAsync([
  { data: cleanPixelArt.frames[0], width: cleanPixelArt.width, height: cleanPixelArt.height }
], () => false, 12.5);
assert.equal(asyncCleanPixelArtResult.sizeX, 4, 'async QLT clean X period');
assert.equal(asyncCleanPixelArtResult.sizeY, 4, 'async QLT clean Y period');
assert.equal(asyncCleanPixelArtResult.phaseX, 0, 'async QLT clean X phase');
assert.equal(asyncCleanPixelArtResult.phaseY, 0, 'async QLT clean Y phase');
assert.equal(asyncCleanPixelArtResult.preprocessMaxChunkMs, 12.5, 'preprocess timing must be preserved');
assert.ok(asyncCleanPixelArtResult.maxChunkMs >= 12.5, 'end-to-end max chunk must include preprocessing');
const forcedSlowPreprocess = await sandbox.analyzeGridFramesAsync([
  makeGrid(32, 32, 4, 4, 0, 0)
], () => false, 101);
assert.equal(forcedSlowPreprocess.maxChunkMs, 101, 'slow preprocessing must trip the shared max chunk measurement');

sandbox.getRawPixels = image => {
  const started = performance.now();
  while(performance.now() - started < 2) { /* deterministic synthetic getImageData cost */ }
  return image.raw;
};
const wholeRaw = makeGrid(64, 64, 4, 4, 0, 0);
const wholePrepared = await sandbox.getGridAnalysisFramesAsync(
  [{ name: 'whole.png', img: { raw: wholeRaw } }],
  'whole',
  0,
  0,
  () => false
);
assert.equal(wholePrepared.frames.length, 1);
assert.ok(wholePrepared.maxChunkMs >= 1, 'getRawPixels must be included in preprocessing max chunk');
const endToEndPrepared = await sandbox.analyzeGridFramesAsync(
  wholePrepared.frames,
  () => false,
  wholePrepared.maxChunkMs
);
assert.ok(endToEndPrepared.maxChunkMs >= wholePrepared.maxChunkMs, 'end-to-end max must include raw extraction');

const sheetRaw = makeGrid(64, 32, 4, 4, 0, 0);
const sheetPrepared = await sandbox.getGridAnalysisFramesAsync(
  [{ name: 'sheet.png', img: { raw: sheetRaw } }],
  'sheet',
  32,
  32,
  () => false
);
assert.equal(sheetPrepared.frames.length, 2, 'sheet preprocessing must slice every frame');
assert.equal(sheetPrepared.frames[0].width, 32);
assert.equal(sheetPrepared.frames[0].height, 32);
assert.equal(sheetPrepared.frames[0].data.length, 32 * 32 * 4);
await assert.rejects(
  sandbox.getGridAnalysisFramesAsync(
    [{ name: 'cancel.png', img: { raw: wholeRaw } }],
    'whole',
    0,
    0,
    () => true
  ),
  error => error?.name === 'AbortError',
  'preprocessing cancellation must reject with AbortError'
);
const wobble = corpus.find(item => item.id === 'ai-grid-wobble');
const wobbleResult = sandbox.analyzeGridFrames([{ data: wobble.frames[0], width: wobble.width, height: wobble.height }]);
assert.equal(wobbleResult.ok, true, 'wobble grid must produce a preview result');
assert.ok(Math.abs(wobbleResult.sizeX - 8) <= 1, 'wobble X period error must be <= 1px');
assert.ok(Math.abs(wobbleResult.sizeY - 8) <= 1, 'wobble Y period error must be <= 1px');

const photo = corpus.find(item => item.id === 'photo-like');
const photoResult = sandbox.analyzeGridFrames([{ data: photo.frames[0], width: photo.width, height: photo.height }]);
assert.ok(!photoResult.ok || photoResult.confidence < 0.5, 'photo-like fixture must never reach the preview confidence threshold');
for (const fixtureId of ['alpha-edge', 'thin-lines']) {
  const fixture = corpus.find(item => item.id === fixtureId);
  const result = sandbox.analyzeGridFrames([{ data: fixture.frames[0], width: fixture.width, height: fixture.height }]);
  assert.ok(!result.ok || result.confidence < 0.5, `${fixtureId} must not auto-apply an alpha-mask false positive`);
}

const flat = new Uint8ClampedArray(64 * 64 * 4);
for (let index = 0; index < flat.length; index += 4) {
  flat[index] = 80; flat[index + 1] = 80; flat[index + 2] = 80; flat[index + 3] = 255;
}
assert.equal(sandbox.analyzeGridFrames([{ data: flat, width: 64, height: 64 }]).ok, false, 'flat input must fail');

const lowAlpha = makeGrid(16, 16, 4, 4, 0, 0, 0);
for (let i = 0; i < 63; i++) lowAlpha.data[i * 4 + 3] = 255;
assert.equal(sandbox.analyzeGridFrames([lowAlpha]).ok, false, 'fewer than 64 valid alpha pixels must fail');

const aggregateFrames = [0, 1, 2, 3].map(index => makeGrid(64, 64, 4, 4, 1, 1 + (index % 2 ? 0 : 0)));
const aggregate = sandbox.analyzeGridFrames(aggregateFrames);
assert.equal(aggregate.sizeX, 4, 'frame-normalized aggregate must select cell spacing, not sheet spacing');
assert.equal(aggregate.sizeY, 4, 'aggregate Y period');
assert.equal(aggregate.phaseX, 1, 'aggregate X phase is locked');
assert.equal(aggregate.phaseY, 1, 'aggregate Y phase is locked');

const crop = sandbox.computeGridCrop(65, 50, { sizeX: 8, sizeY: 6, phaseX: 1, phaseY: 2 });
assert.deepEqual(JSON.parse(JSON.stringify(crop)), {
  x: { length: 65, period: 8, phase: 1, start: 1, end: 65, cells: 8, marginBefore: 1, marginAfter: 0 },
  y: { length: 50, period: 6, phase: 2, start: 2, end: 50, cells: 8, marginBefore: 2, marginAfter: 0 },
  outputWidth: 8,
  outputHeight: 8
});

assert.equal(sandbox.validateManualGrid({ sizeX: 2, sizeY: 32, phaseX: 1, phaseY: 31 }).ok, true);
assert.equal(sandbox.validateManualGrid({ sizeX: 8, sizeY: 8, phaseX: 8, phaseY: 0 }).ok, false);
assert.equal(sandbox.validateManualGrid({ sizeX: 1, sizeY: 8, phaseX: 0, phaseY: 0 }).ok, false);

const manualInput = makeGrid(18, 18, 4, 4, 1, 1);
const manualOutput = sandbox.gridRepairDownscale(manualInput, { sizeX: 4, sizeY: 4, phaseX: 1, phaseY: 1 });
assert.equal(manualOutput.w, 4);
assert.equal(manualOutput.h, 4);
assert.equal(manualOutput.gridCrop.x.marginBefore, 1);
assert.equal(manualOutput.gridCrop.x.marginAfter, 1);
assert.equal(manualOutput.gridCrop.y.marginBefore, 1);
assert.equal(manualOutput.gridCrop.y.marginAfter, 1);

const sheetInput = makeGrid(64, 32, 4, 4, 0, 0);
const sheetOutput = sandbox.gridRepairDownscale(sheetInput, { sizeX: 4, sizeY: 4, phaseX: 0, phaseY: 0 }, 32, 32);
assert.equal(sheetOutput.w, 16);
assert.equal(sheetOutput.h, 8);
assert.equal(sheetOutput.frameLogicalW, 8);
assert.equal(sheetOutput.frameLogicalH, 8);

const deterministicA = sandbox.analyzeGridFrames([makeGrid(128, 128, 8, 8, 0, 0)]);
const deterministicB = sandbox.analyzeGridFrames([makeGrid(128, 128, 8, 8, 0, 0)]);
const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
assert.equal(hash(deterministicA), hash(deterministicB), 'identical analysis must be deterministic');

console.log(`GRID-001 detector checks passed. wobble=${wobbleResult.sizeX}/${wobbleResult.sizeY} confidence=${wobbleResult.confidence.toFixed(4)} photo=${photoResult.confidence.toFixed(4)} hash=${hash(deterministicA)}`);
