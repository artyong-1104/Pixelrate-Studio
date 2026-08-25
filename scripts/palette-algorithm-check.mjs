import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { extractInlineFunction } from './lib/extract-inline-function.mjs';
import {
  candidateEligible,
  regressionWithinLimit,
  relativeChangePercent,
  samplingCorpusValid
} from './lib/pal002-evaluation.mjs';

const root = path.resolve(import.meta.dirname, '..');
const html = fs.readFileSync(path.resolve(root, 'pixelate_studio.html'), 'utf8');
const names = [
  'kmeans',
  'palettePointWeight',
  'limitPalettePoints',
  'srgbChannelToLinear',
  'linearChannelToSrgb',
  'srgbToOklab',
  'oklabToSrgb',
  'dedupeAndBackfillPalette',
  'kmeansOklab',
  'getMedianCutBoxInfo',
  'medianCut',
  'generatePaletteFromPoints',
  'collectPaletteSamples',
  'getPaletteReferenceValidation',
  'nearestOklabIndex',
  'nearestColorIndex',
  'mapPixelsToPalette'
];
const context = vm.createContext({
  Array,
  Date,
  Infinity,
  Map,
  Math,
  Number,
  Object,
  Set,
  String,
  MAX_PALETTE_SAMPLES: 50000
});
vm.runInContext(
  `${names.map(name => extractInlineFunction(html, name)).join('\n')}\n` +
  `globalThis.__api = { ${names.join(',')} };`,
  context,
  { timeout: 5000 }
);
const api = context.__api;
const clone = value => JSON.parse(JSON.stringify(value));
const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');

function assertClose(actual, expected, tolerance, label){
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: expected ${expected}, got ${actual}`);
}

{
  assert.deepEqual(clone(api.srgbToOklab(0, 0, 0)), [0, 0, 0]);
  const white = api.srgbToOklab(255, 255, 255);
  assertClose(white[0], 1, 0.000001, 'white L');
  assertClose(white[1], 0, 0.000001, 'white a');
  assertClose(white[2], 0, 0.000001, 'white b');
  const red = api.srgbToOklab(255, 0, 0);
  assertClose(red[0], 0.62795536, 0.000001, 'red L');
  assertClose(red[1], 0.22486306, 0.000001, 'red a');
  assertClose(red[2], 0.12584630, 0.000001, 'red b');
  for(const color of [[0,0,0], [255,255,255], [255,0,0], [12,128,240], [73,41,199]]){
    const roundTrip = api.oklabToSrgb(...api.srgbToOklab(...color));
    color.forEach((channel, index) => assert.ok(Math.abs(channel - roundTrip[index]) <= 1));
  }
}

const points = [
  [255, 0, 0], [255, 0, 0], [255, 0, 0],
  [0, 255, 0], [0, 255, 0], [0, 0, 255],
  [240, 20, 20], [20, 240, 20], [20, 20, 240]
];
{
  const first = api.kmeansOklab(points, 3, 10);
  const second = api.kmeansOklab(points, 3, 10);
  assert.deepEqual(clone(first), clone(second), 'OKLab K-means must be deterministic');
  assert.equal(new Set(first.map(color => color.join(','))).size, 3, 'duplicate centers must be backfilled');
  assert.equal(first.length, 3);
}

{
  assert.deepEqual(clone(api.medianCut([], 8)), []);
  const weighted = api.medianCut([[0,0,0,0.1], [100,0,0,0.9]], 1);
  assert.deepEqual(clone(weighted), [[90,0,0]], 'MedianCut representative must use alpha weight');
  const tied = [[0,0,0], [255,255,0], [0,0,255], [255,255,255]];
  const first = api.medianCut(tied, 4);
  const second = api.medianCut(tied, 4);
  assert.deepEqual(clone(first), clone(second), 'MedianCut range/tie selection must be deterministic');
  assert.equal(first.length, 4);
}

function makeDown(name, addedIndex, colors){
  const data = new Uint8ClampedArray(colors.length * 4);
  colors.forEach((color, index) => data.set([...color, 255], index*4));
  return { name, addedIndex, data, w: colors.length, h: 1 };
}
const downs = [
  makeDown('z-large.png', 0, [[200,0,0], [201,0,0], [202,0,0], [203,0,0], [204,0,0], [205,0,0]]),
  makeDown('a-small.png', 1, [[0,200,0], [0,201,0], [0,202,0], [0,203,0], [0,204,0], [0,205,0]])
];
{
  const balanced = api.collectPaletteSamples(downs, 'image-balanced', null, 5, 10, false);
  assert.equal(balanced.length, 5);
  assert.equal(balanced.filter(point => point[1] > 0).length, 3, 'filename-first remainder goes to a-small.png');
  assert.equal(balanced.filter(point => point[0] > 0).length, 2);
  const reference = api.collectPaletteSamples(downs, 'reference', 'z-large.png', 4, 10, false);
  assert.equal(reference.length, 3, 'reference uses input-position stride without borrowing samples');
  assert.ok(reference.every(point => point[0] > 0));
}

{
  assert.equal(api.getPaletteReferenceValidation(downs, 'reference', null).ok, false);
  assert.equal(api.getPaletteReferenceValidation(downs, 'reference', 'missing.png').ok, false);
  assert.equal(api.getPaletteReferenceValidation(downs, 'reference', 'z-large.png').ok, true);
  const duplicate = [...downs, makeDown('z-large.png', 2, [[1,2,3]])];
  assert.match(api.getPaletteReferenceValidation(duplicate, 'reference', 'z-large.png').error, /같은 파일명/);
}

{
  const baselinePoints = api.collectPaletteSamples(downs, 'pixel', null, 50000, 10, false);
  const baselinePalette = api.generatePaletteFromPoints(baselinePoints, 4, 'kmeans-srgb', 10);
  const baselineHash = hash(baselinePalette);
  assert.equal(baselineHash, '8fc99dd6e6e2dffde8dec057af66e2868cfe0ddbc50bd1035bfe73681781602d');
  assert.deepEqual(
    clone(baselinePalette),
    clone(api.kmeans(baselinePoints, 4, 10)),
    'kmeans-srgb/pixel must route through the unchanged baseline'
  );
  for(const algorithm of ['kmeans-srgb', 'kmeans-oklab', 'median-cut']){
    const first = api.generatePaletteFromPoints(baselinePoints, 4, algorithm, 10);
    const second = api.generatePaletteFromPoints(baselinePoints, 4, algorithm, 10);
    assert.equal(hash(first), hash(second), `${algorithm} must be deterministic`);
  }
}

{
  const palette = [[255,0,0], [0,0,255]];
  const data = new Uint8ClampedArray([250,0,0,255, 0,0,245,255, 127,0,127,255]);
  const mapped = api.mapPixelsToPalette(data, [255,255,255], 3, palette, 'kmeans-oklab', 10);
  assert.equal(mapped.grid.length, 3);
  assert.equal(mapped.slotUsage, 2);
  assert.ok(mapped.error.mean >= 0 && mapped.error.p95 >= mapped.error.mean && mapped.error.max >= mapped.error.p95);
}

{
  const palette = [[100,100,100], [104,104,104]];
  const data = new Uint8ClampedArray([103,103,103,255]);
  const withoutStability = api.mapPixelsToPalette(data, [255], 1, palette, 'kmeans-oklab', 10);
  const withStability = api.mapPixelsToPalette(data, [255], 1, palette, 'kmeans-oklab', 10, [0], 0.00025);
  assert.deepEqual(clone(withoutStability.grid), [1], 'OKLab mapping must select the nearest slot without temporal context');
  assert.deepEqual(clone(withStability.grid), [0], 'near-boundary OKLab mapping must retain the prior frame slot');
  assert.equal(withStability.temporalStabilityApplied, true);
  assert.equal(withStability.temporalHeldCount, 1);
  assert.equal(withStability.temporalEpsilon, 0.00025);
}

{
  assert.equal(relativeChangePercent(0, 0), 0);
  assert.equal(relativeChangePercent(0.01, 0), null, 'zero baseline regression must not be reported as 0%');
  assert.equal(regressionWithinLimit(0.01, 0, 10), false, 'any positive error must fail a zero baseline');
  assert.equal(candidateEligible({
    improvementPercent: 25,
    runtimeRatio: 1,
    featureRegressionPass: false,
    temporalRegressionPass: true,
    deterministic: true
  }), false, 'quality improvement must not override a feature regression');
  const samplingEvidence = {
    backgroundPixels: 512 * 256,
    characterPixels: 128 * 128,
    pixelSampleCount: 44726,
    imageBalancedSampleCount: 24950,
    pixelPaletteSha256: 'a'.repeat(64),
    imageBalancedPaletteSha256: 'b'.repeat(64)
  };
  assert.equal(samplingCorpusValid(samplingEvidence), true);
  assert.equal(samplingCorpusValid({
    ...samplingEvidence,
    backgroundPixels: 256 * 64
  }), false, 'equal-sized background and character fixtures must fail the sampling evidence gate');
  assert.equal(samplingCorpusValid({
    ...samplingEvidence,
    imageBalancedPaletteSha256: samplingEvidence.pixelPaletteSha256
  }), false, 'identical pixel/image-balanced palettes must fail the sampling evidence gate');
}

console.log('PAL-002 conversion, deterministic algorithms, sampling, reference, baseline, and error checks passed.');
