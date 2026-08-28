import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { performance } from 'node:perf_hooks';
import { extractInlineFunctions } from './lib/extract-inline-function.mjs';

const root = path.resolve(import.meta.dirname, '..');
const html = fs.readFileSync(path.resolve(root, 'pixelate_studio.html'), 'utf8');
const names = [
  'normalizeRepresentativeColor',
  'srgbChannelToLinear',
  'linearChannelToSrgb',
  'representativeMedian',
  'representativeColorForCell',
  'edgeLuma',
  'createLineAwareContext',
  'blendLineAwareCell',
  'getLineAwareMetadata',
  'applyLineAwareIdentity',
  'applySeloutRgb',
  'exactFactorDownscale'
];
const context = {
  Array,
  Map,
  Math,
  Number,
  Float32Array,
  Uint8Array,
  Uint8ClampedArray,
  getRawPixels: image => image
};
vm.createContext(context);
vm.runInContext(
  `${extractInlineFunctions(html, names).join('\n')}\nglobalThis.api = { ${names.join(', ')} };`,
  context,
  { timeout: 5000 }
);
const api = context.api;

for(const id of [
  'edgeExperimentField', 'lineAwareEnabled', 'lineThresholdRange', 'lineThresholdNum',
  'lineStrengthRange', 'lineStrengthNum', 'seloutEnabled', 'seloutDarkenRange',
  'seloutDarkenNum', 'edgeOutlineWarning', 'edgeExperimentStatus'
]){
  assert.match(html, new RegExp(`id=["']${id}["']`), `EDGE-001 UI element #${id} is missing`);
}
assert.match(html, /id="lineAwareEnabled"[^>]*disabled/, 'line-aware must be disabled while experimental controls are hidden');
assert.match(html, /id="lineThresholdRange" min="5" max="50" value="20"/, 'line threshold bounds/default changed');
assert.match(html, /id="lineStrengthRange" min="0" max="100" value="60"/, 'line strength bounds/default changed');
assert.match(html, /id="seloutDarkenRange" min="5" max="50" value="20"/, 'selout darken bounds/default changed');
assert.ok(html.includes('서로 다른 두 외곽선 효과가 중첩됩니다.'), 'the exact outline overlap warning is missing');
assert.match(html, /lineAware: Object\.freeze\(\{ enabled: false, threshold: 0\.2, strength: 0\.6 \}\)/, 'line-aware settings default changed');
assert.match(html, /selout: Object\.freeze\(\{ enabled: false, darken: 0\.2 \}\)/, 'selout settings default changed');
const processStart = html.indexOf('async function processAll()');
const seloutStage = html.indexOf('const seloutResult = applySeloutRgb(', processStart);
const paletteStage = html.indexOf('sharedPaletteBuild = await buildAutoPaletteChunked(', processStart);
const outlineStage = html.indexOf('if(outlineCheck.checked){', processStart);
assert.ok(processStart >= 0 && seloutStage > processStart && paletteStage > seloutStage && outlineStage > paletteStage,
  'pipeline must remain line blend/downscale, selout RGB, palette mapping, then outline');

function makeRgba(width, height, fill = [200, 200, 200, 255]){
  const data = new Uint8ClampedArray(width * height * 4);
  for(let index=0; index<width*height; index++) data.set(fill, index * 4);
  return data;
}

function setPixel(data, width, x, y, rgba){
  data.set(rgba, (y * width + x) * 4);
}

function sha256(data){
  return crypto.createHash('sha256').update(Buffer.from(data)).digest('hex');
}

const source = makeRgba(3, 3);
setPixel(source, 3, 1, 1, [20, 20, 20, 255]);
const detected = api.createLineAwareContext(
  source, 3, 3,
  { enabled: true, threshold: 0.2, strength: 0.6, alphaThreshold: 10 },
  3, 3
);
assert.equal(detected.sourceCandidatePixels, 1, 'the locally dark center must be the only line candidate');
assert.equal(detected.mask[4], 1, 'the dark center must be marked');

const tooFewNeighbors = makeRgba(3, 3, [0, 0, 0, 0]);
setPixel(tooFewNeighbors, 3, 1, 1, [20, 20, 20, 255]);
setPixel(tooFewNeighbors, 3, 0, 1, [200, 200, 200, 255]);
setPixel(tooFewNeighbors, 3, 2, 1, [200, 200, 200, 255]);
const sparseDetected = api.createLineAwareContext(
  tooFewNeighbors, 3, 3,
  { enabled: true, threshold: 0.2, strength: 0.6, alphaThreshold: 10 },
  3, 3
);
assert.equal(sparseDetected.sourceCandidatePixels, 0, 'fewer than three same-alpha neighbors must not create a line candidate');

const baseline = api.exactFactorDownscale({ data: source, width: 3, height: 3 }, 3, null, null, 'mean-srgb', 10);
const candidate = api.exactFactorDownscale(
  { data: source, width: 3, height: 3 },
  3, null, null, 'mean-srgb', 10,
  { enabled: true, threshold: 0.2, strength: 0.6 }
);
assert.deepEqual(Array.from(baseline.data), [180, 180, 180, 255], 'baseline cell average must remain exact');
assert.deepEqual(Array.from(candidate.data), [169, 169, 169, 255], 'coverage times strength must blend the candidate line color into the cell');
assert.equal(candidate.lineAware.candidatePixels, 1);
assert.equal(candidate.lineAware.coveredCells, 1);
assert.equal(candidate.lineAware.totalCells, 1);
assert.equal((200 - candidate.data[0]) / (200 - baseline.data[0]), 1.55, 'line contrast must improve by 55% in the exact fixture');

const flat = makeRgba(16, 16, [120, 120, 120, 255]);
const flatContext = api.createLineAwareContext(
  flat, 16, 16,
  { enabled: true, threshold: 0.2, strength: 0.6, alphaThreshold: 10 },
  16, 16
);
assert.equal(flatContext.sourceCandidatePixels, 0, 'flat color must have a 0% false-line ratio');

const frameSource = makeRgba(4, 2, [20, 20, 20, 255]);
for(let y=0; y<2; y++) for(let x=2; x<4; x++) setPixel(frameSource, 4, x, y, [240, 240, 240, 255]);
const frameContext = api.createLineAwareContext(
  frameSource, 4, 2,
  { enabled: true, threshold: 0.2, strength: 0.6, alphaThreshold: 10 },
  2, 2
);
assert.equal(frameContext.sourceCandidatePixels, 0, 'line detection must never sample across sheet frame boundaries');

const seloutSheet = makeRgba(4, 2, [160, 100, 60, 255]);
for(let y=0; y<2; y++) for(let x=2; x<4; x++) setPixel(seloutSheet, 4, x, y, [0, 0, 0, 0]);
const frameSafeSelout = api.applySeloutRgb(
  seloutSheet, 4, 2,
  { enabled: true, darken: 0.2, alphaThreshold: 10 },
  2, 2
);
assert.equal(frameSafeSelout.pixelCount, 0, 'the adjacent frame must not count as an in-frame transparent neighbor');
assert.deepEqual(Array.from(frameSafeSelout.data.slice(4, 8)), [160, 100, 60, 255], 'frame-edge RGB and alpha must stay unchanged');

const seloutIsland = makeRgba(3, 3, [160, 100, 60, 255]);
setPixel(seloutIsland, 3, 1, 1, [0, 0, 0, 0]);
const selout = api.applySeloutRgb(
  seloutIsland, 3, 3,
  { enabled: true, darken: 0.2, alphaThreshold: 10 },
  3, 3
);
assert.equal(selout.pixelCount, 4, 'only 4-neighbor logical outline pixels must be darkened');
assert.deepEqual(Array.from(selout.data.slice(4, 8)), [128, 80, 48, 255]);
for(let index=0; index<selout.data.length; index+=4){
  assert.equal(selout.data[index + 3], seloutIsland[index + 3], 'selout must preserve alpha topology');
}

const lineThenSelout = api.applySeloutRgb(
  candidate.data, 1, 1,
  { enabled: true, darken: 0.2, alphaThreshold: 10 },
  1, 1
);
assert.deepEqual(Array.from(lineThenSelout.data), Array.from(candidate.data), 'a frame edge without an in-frame transparent neighbor must not be darkened');

const baselineAgain = api.exactFactorDownscale({ data: source, width: 3, height: 3 }, 3, null, null, 'mean-srgb', 10);
assert.equal(sha256(baseline.data), sha256(baselineAgain.data), 'off-path output must retain its deterministic baseline hash');
const candidateAgain = api.exactFactorDownscale(
  { data: source, width: 3, height: 3 },
  3, null, null, 'mean-srgb', 10,
  { enabled: true, threshold: 0.2, strength: 0.6 }
);
assert.equal(sha256(candidate.data), sha256(candidateAgain.data), 'line-aware output must be deterministic');

const largeWidth = 2048, largeHeight = 2048;
const large = makeRgba(largeWidth, largeHeight, [128, 128, 128, 255]);
const started = performance.now();
const largeContext = api.createLineAwareContext(
  large, largeWidth, largeHeight,
  { enabled: true, threshold: 0.2, strength: 0.6, alphaThreshold: 10 },
  largeWidth, largeHeight
);
const elapsedMs = performance.now() - started;
assert.equal(largeContext.sourceCandidatePixels, 0);
assert.equal(largeContext.memoryBytes, largeWidth * largeHeight * 6, 'temporary line mask memory must be reported exactly');
assert.ok(elapsedMs < 8000, `4M line mask runtime must stay below 8s (actual ${elapsedMs.toFixed(1)}ms)`);

console.log(`EDGE-001 exact, boundary, ordering, determinism, 4M runtime checks passed. baseline=${sha256(baseline.data)} candidate=${sha256(candidate.data)} elapsedMs=${elapsedMs.toFixed(1)} memoryBytes=${largeContext.memoryBytes}`);
