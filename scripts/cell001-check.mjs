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
  'computeGridAxisCrop',
  'computeGridCrop',
  'validateManualGrid',
  'gridRepairDownscale',
  'boxDownscale',
  'preserveSheetDownscale',
  'exactFactorDownscale'
];

function createCanvas(){
  let source = null;
  return {
    width: 0,
    height: 0,
    getContext: () => ({
      drawImage: image => { source = image; },
      getImageData: () => ({ data: source.data })
    })
  };
}

const context = {
  Array,
  Map,
  Math,
  Number,
  Uint8ClampedArray,
  document: { createElement: createCanvas },
  getRawPixels: image => image
};
vm.createContext(context);
vm.runInContext(
  `${extractInlineFunctions(html, names).join('\n')}\nglobalThis.api = { ${names.join(', ')} };`,
  context,
  { timeout: 3000 }
);
const api = context.api;
const modes = ['mean-srgb', 'mean-linear', 'center', 'median', 'majority'];

function rgba(width, height, pixels){
  assert.equal(pixels.length, width * height);
  return Uint8ClampedArray.from(pixels.flat());
}

function bytes(value){
  return Array.from(Uint8ClampedArray.from(value));
}

function sha256(value){
  return crypto.createHash('sha256').update(Buffer.from(value)).digest('hex');
}

const primary = rgba(2, 2, [
  [0, 0, 0, 255], [255, 0, 0, 255],
  [0, 255, 0, 255], [0, 0, 255, 255]
]);
assert.deepEqual(bytes(api.representativeColorForCell(primary, 2, 0, 0, 2, 2, 'mean-srgb', 10)), [64, 64, 64, 255]);
assert.deepEqual(bytes(api.representativeColorForCell(primary, 2, 0, 0, 2, 2, 'mean-linear', 10)), [137, 137, 137, 255]);
assert.deepEqual(bytes(api.representativeColorForCell(primary, 2, 0, 0, 2, 2, 'center', 10)), [0, 0, 0, 255]);
assert.deepEqual(bytes(api.representativeColorForCell(primary, 2, 0, 0, 2, 2, 'median', 10)), [0, 0, 0, 255]);
assert.deepEqual(bytes(api.representativeColorForCell(primary, 2, 0, 0, 2, 2, 'majority', 10)), [0, 0, 0, 255]);

const fallback = rgba(3, 3, [
  [0, 0, 0, 0], [0, 255, 0, 255], [0, 0, 0, 0],
  [255, 0, 0, 255], [10, 10, 10, 0], [0, 0, 0, 0],
  [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]
]);
assert.deepEqual(bytes(api.representativeColorForCell(fallback, 3, 0, 0, 3, 3, 'center', 10)), [0, 255, 0, 57], 'center fallback tie must use y/x row-major order');

const evenMedian = rgba(2, 2, [
  [0, 0, 0, 255], [1, 1, 1, 255],
  [2, 2, 2, 255], [3, 3, 3, 255]
]);
assert.deepEqual(bytes(api.representativeColorForCell(evenMedian, 2, 0, 0, 2, 2, 'median', 10)), [2, 2, 2, 255], 'even median must round half-up');

const majorityAlphaTie = rgba(2, 2, [
  [100, 0, 0, 10], [100, 0, 0, 255],
  [0, 0, 100, 200], [0, 0, 100, 200]
]);
assert.deepEqual(bytes(api.representativeColorForCell(majorityAlphaTie, 2, 0, 0, 2, 2, 'majority', 10)).slice(0, 3), [0, 0, 100], 'majority tie must prefer greater alpha sum');

const majorityFirstTie = rgba(2, 2, [
  [90, 10, 10, 100], [10, 10, 90, 100],
  [10, 10, 90, 100], [90, 10, 10, 100]
]);
assert.deepEqual(bytes(api.representativeColorForCell(majorityFirstTie, 2, 0, 0, 2, 2, 'majority', 10)).slice(0, 3), [90, 10, 10], 'final majority tie must use first row-major appearance');

const hiddenRgb = rgba(2, 1, [[255, 0, 255, 9], [0, 100, 0, 255]]);
assert.deepEqual(bytes(api.representativeColorForCell(hiddenRgb, 2, 0, 0, 2, 1, 'mean-srgb', 10)), [0, 100, 0, 132], 'below-threshold hidden RGB must not affect representative color');
const empty = rgba(2, 1, [[255, 0, 0, 0], [0, 0, 255, 9]]);
for(const mode of modes){
  assert.deepEqual(bytes(api.representativeColorForCell(empty, 2, 0, 0, 2, 1, mode, 10)), [0, 0, 0, 0]);
  const pixel = rgba(1, 1, [[23, 117, 201, 255]]);
  assert.deepEqual(bytes(api.representativeColorForCell(pixel, 1, 0, 0, 1, 1, mode, 10)), [23, 117, 201, 255], `1x1 ${mode} must equal input`);
}

const feature = new Uint8ClampedArray(8 * 8 * 4);
for(let i=0; i<64; i++) feature.set([40, 50, 60, 255], i * 4);
for(let cellY=0; cellY<2; cellY++){
  for(let cellX=0; cellX<2; cellX++){
    feature.set([250, 250, 250, 255], (((cellY * 4 + 1) * 8 + cellX * 4 + 1) * 4));
  }
}
const source = { data: feature, width: 8, height: 8 };
const routeHashes = {};
for(const mode of modes){
  const factor = api.exactFactorDownscale(source, 4, null, null, mode, 10);
  const preserve = api.preserveSheetDownscale(source, 8, 8, 4, mode, 10);
  const grid = api.gridRepairDownscale(source, { sizeX: 4, sizeY: 4, phaseX: 0, phaseY: 0 }, null, null, mode, 10);
  const square = api.boxDownscale(source, 2, 'box', mode, 10);
  assert.equal(factor.w, 2); assert.equal(factor.h, 2);
  assert.deepEqual(Array.from(factor.data), Array.from(preserve.data), `${mode} factor/preserve must share cell result`);
  assert.deepEqual(Array.from(factor.data), Array.from(grid.data), `${mode} factor/grid must share cell result`);
  assert.deepEqual(Array.from(factor.data), Array.from(square), `${mode} factor/square must share cell result`);
  routeHashes[mode] = sha256(factor.data);
}
assert.deepEqual(Array.from(api.exactFactorDownscale(source, 4).data.slice(0, 4)), [53, 62, 72, 255], 'mean-srgb default must retain legacy alpha-weighted mean bytes');
assert.deepEqual(Array.from(api.exactFactorDownscale(source, 4, null, null, 'center', 10).data.slice(0, 4)), [250, 250, 250, 255]);
assert.deepEqual(Array.from(api.exactFactorDownscale(source, 4, null, null, 'median', 10).data.slice(0, 4)), [40, 50, 60, 255]);
assert.deepEqual(Array.from(api.exactFactorDownscale(source, 4, null, null, 'majority', 10).data.slice(0, 4)), [40, 50, 60, 255]);

const performanceSource = new Uint8ClampedArray(256 * 256 * 4);
for(let i=0; i<256*256; i++){
  performanceSource[i*4] = i % 251;
  performanceSource[i*4+1] = (i * 7) % 253;
  performanceSource[i*4+2] = (i * 13) % 255;
  performanceSource[i*4+3] = i % 19 === 0 ? 9 : 255;
}
const timingsMs = {};
for(const mode of modes){
  const started = performance.now();
  const first = api.exactFactorDownscale({ data: performanceSource, width: 256, height: 256 }, 4, null, null, mode, 10);
  timingsMs[mode] = Number((performance.now() - started).toFixed(3));
  const second = api.exactFactorDownscale({ data: performanceSource, width: 256, height: 256 }, 4, null, null, mode, 10);
  assert.equal(sha256(first.data), sha256(second.data), `${mode} must be deterministic`);
  assert.ok(timingsMs[mode] < 1000, `${mode} 256x256 factor4 runtime must stay below 1000ms`);
}

console.log(`CELL-001 exact, route, threshold, determinism, and runtime checks passed. hashes=${JSON.stringify(routeHashes)} timingsMs=${JSON.stringify(timingsMs)}`);
