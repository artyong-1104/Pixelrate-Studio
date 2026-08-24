import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { extractInlineFunctions } from './lib/extract-inline-function.mjs';

const html = fs.readFileSync('pixelate_studio.html', 'utf8');
const functions = [
  'compareAnimationFrameOrder',
  'getMultiFileAnimationFrames',
  'getSheetAnimationFrames',
  'getAvailableAnimationSources',
  'getAnimSourceWarningText',
  'findAnimSourceResult',
  'getAnimDitherStatus',
  'evaluateAnimPolicy'
];
const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(extractInlineFunctions(html, functions).join('\n'), sandbox);

const canvases = {
  a0: { width: 16, height: 24 },
  a1: { width: 16, height: 24 },
  b: { width: 32, height: 32 },
  c: { width: 48, height: 48 }
};
const unordered = [
  { name: 'walk_02.png', addedIndex: 2, canvas: canvases.b, jsonData: { processing: { mode: 'factor' } } },
  { name: 'walk_01.png', addedIndex: 7, canvas: canvases.a1, jsonData: { processing: { mode: 'factor' } } },
  { name: 'walk_10.png', addedIndex: 3, canvas: canvases.c, jsonData: { processing: { mode: 'factor' } } },
  { name: 'walk_01.png', addedIndex: 1, canvas: canvases.a0, jsonData: { processing: { mode: 'factor' } } }
];
const ordered = unordered.slice().sort(sandbox.compareAnimationFrameOrder);
assert.deepEqual(
  ordered.map(result => `${result.name}:${result.addedIndex}`),
  ['walk_01.png:1', 'walk_01.png:7', 'walk_02.png:2', 'walk_10.png:3'],
  'actual comparator must use natural filename order and addedIndex for identical names'
);

const multi = sandbox.getMultiFileAnimationFrames(unordered);
assert.equal(multi.viewportW, 48);
assert.equal(multi.viewportH, 48);
assert.deepEqual(
  Array.from(multi.frames, frame => ({ name: frame.name, offsetX: frame.offsetX, offsetY: frame.offsetY })),
  [
    { name: 'walk_01.png', offsetX: 16, offsetY: 12 },
    { name: 'walk_01.png', offsetX: 16, offsetY: 12 },
    { name: 'walk_02.png', offsetX: 8, offsetY: 8 },
    { name: 'walk_10.png', offsetX: 0, offsetY: 0 }
  ],
  'actual multi-file extractor must center every frame in the largest viewport'
);

const sheet = {
  name: 'hero_sheet.png',
  addedIndex: 0,
  canvas: { width: 64, height: 96 },
  jsonData: { processing: { mode: 'preserve-sheet', frameWidth: 32, frameHeight: 32 } }
};
const sheetSource = sandbox.getSheetAnimationFrames(sheet);
assert.equal(sheetSource.frames.length, 6);
assert.equal(sheetSource.addedIndex, 0, 'sheet source must retain its stable result identity');
assert.deepEqual(
  Array.from(sheetSource.frames, frame => [frame.index, frame.srcX, frame.srcY]),
  [[0, 0, 0], [1, 32, 0], [2, 0, 32], [3, 32, 32], [4, 0, 64], [5, 32, 64]],
  'actual sheet extractor must cut frames in row-major order'
);
assert.equal(sandbox.getSheetAnimationFrames({ ...sheet, canvas: { width: 65, height: 96 } }), null);
const oversized = sandbox.getSheetAnimationFrames({ ...sheet, canvas: { width: 640, height: 480 } });
assert.match(oversized.error, /256개/);
assert.equal(oversized.addedIndex, 0, 'oversized sheet source must retain its stable result identity');
assert.equal(sandbox.getAvailableAnimationSources([unordered[0]]).length, 0);
assert.equal(sandbox.getAvailableAnimationSources([unordered[0], unordered[1], sheet]).length, 2);

const mixedSheetResults = [
  {
    name: 'normal-2.png',
    addedIndex: 20,
    canvas: { width: 2, height: 1 },
    jsonData: { processing: { mode: 'preserve-sheet', frameWidth: 1, frameHeight: 1 } }
  },
  {
    name: 'oversized-257.png',
    addedIndex: 21,
    canvas: { width: 257, height: 1 },
    jsonData: { processing: { mode: 'preserve-sheet', frameWidth: 1, frameHeight: 1 } }
  }
];
const mixedSources = sandbox.getAvailableAnimationSources(mixedSheetResults);
const mixedWarning = sandbox.getAnimSourceWarningText(mixedSources, mixedSources[0]);
assert.equal(mixedSources[0].type, 'multi-file');
assert.equal(mixedSources.some(source => source.error), true);
assert.match(mixedWarning, /oversized-257\.png/,
  'valid mixed source must expose the name of every excluded oversized sheet');
assert.match(mixedWarning, /257개.*256개/,
  'valid mixed source must expose the full oversized-sheet limit reason');

const baseSource = { type: 'multi-file' };
const policyResult = value => ({
  name: 'frame.png',
  jsonData: { processing: { mode: 'factor', palette: { mode: 'auto', shared: true }, ...value } }
});
assert.equal(sandbox.evaluateAnimPolicy(baseSource, [policyResult({ dithering: false })]).ditherStatus.label, '디더링: 꺼짐');
assert.equal(sandbox.evaluateAnimPolicy(baseSource, [policyResult({ dithering: 'bayer-4x4' })]).ditherStatus.label, '디더링: 켜짐');
assert.equal(sandbox.evaluateAnimPolicy(baseSource, [policyResult({})]).ditherStatus.label, '디더링: 확인 불가');
assert.equal(
  sandbox.evaluateAnimPolicy(baseSource, [policyResult({ dithering: false }), policyResult({})]).ditherStatus.label,
  '디더링: 확인 불가',
  'mixed known and missing metadata must never be reported as disabled'
);

const duplicateSheetResults = [
  {
    name: 'same-sheet.png',
    addedIndex: 4,
    canvas: { width: 64, height: 32 },
    jsonData: { processing: { mode: 'preserve-sheet', frameWidth: 32, frameHeight: 32, dithering: false, palette: { mode: 'custom' } } }
  },
  {
    name: 'same-sheet.png',
    addedIndex: 9,
    canvas: { width: 64, height: 32 },
    jsonData: { processing: { mode: 'preserve-sheet', frameWidth: 32, frameHeight: 32, dithering: 'bayer-4x4', palette: { mode: 'unlimited' } } }
  }
];
const duplicateSecondSource = sandbox.getSheetAnimationFrames(duplicateSheetResults[1]);
const duplicateSecondPolicy = sandbox.evaluateAnimPolicy(duplicateSecondSource, duplicateSheetResults);
assert.equal(duplicateSecondSource.addedIndex, 9);
assert.equal(duplicateSecondPolicy.ditherStatus.label, '디더링: 켜짐',
  'same-name sheet must use addedIndex to read its own dithering metadata');
assert.equal(duplicateSecondPolicy.paletteStatus.label, '팔레트: 제한 없음',
  'same-name sheet must use addedIndex to read its own palette metadata');

const makeControl = () => ({
  disabled: false,
  attributes: {},
  textContent: '',
  setAttribute(name, value) { this.attributes[name] = String(value); }
});
const errorControlNames = [
  'animPlayPauseBtn', 'animPrevBtn', 'animNextBtn', 'animLoopBtn', 'animFpsRange', 'animFpsNumber',
  'animZoom1x', 'animZoom2x', 'animZoom8x', 'animGridToggle', 'animBgCycleBtn', 'animExpandToggle'
];
const errorSandbox = {
  animSources: [oversized],
  activeAnimSource: null,
  animCurrentFrameIdx: 8,
  animAccumulator: 100,
  animLastTimestamp: 0,
  performance: { now: () => 250 },
  animNotice: { textContent: '', style: { display: 'none' } },
  animFrameLabel: makeControl(),
  animIsPlaying: true,
  animRafId: 73,
  cancelAnimationFrame(id) { errorSandbox.cancelledRaf = id; },
  requestAnimationFrame() { throw new Error('error source must not request an animation frame'); },
  animLoop() {},
  animCanvas: {
    width: 64,
    height: 64,
    getContext() {
      return { clearRect: () => { errorSandbox.canvasCleared = true; } };
    }
  }
};
for (const name of errorControlNames) errorSandbox[name] = makeControl();
vm.createContext(errorSandbox);
vm.runInContext(extractInlineFunctions(html, ['getAnimSourceWarningText', 'setAnimPlaying', 'setAnimControlsDisabled', 'selectAnimSource']).join('\n'), errorSandbox);
const errorSourceReady = errorSandbox.selectAnimSource(0);
assert.equal(errorSourceReady, false, 'oversized source must not be ready for playback');
assert.equal(errorSandbox.animIsPlaying, false);
assert.equal(errorSandbox.animRafId, null);
assert.equal(errorSandbox.cancelledRaf, 73);
assert.equal(errorSandbox.animPlayPauseBtn.attributes['aria-pressed'], 'false');
assert.equal(errorSandbox.animPlayPauseBtn.textContent, '▶ 재생');
assert.equal(errorSandbox.animFrameLabel.textContent, '—', 'error source must clear the stale frame count');
assert.match(errorSandbox.animNotice.textContent, /256개/);
assert.equal(errorSandbox.animNotice.style.display, 'block');
assert.equal(errorSandbox.canvasCleared, true);
for (const name of errorControlNames) {
  assert.equal(errorSandbox[name].disabled, true, `${name} must be disabled for an oversized source`);
}

function runActualLoop({ fps, durationMs, loop = true, frameCount = 5 }) {
  let rendered = 0;
  let rafRequests = 0;
  const timingSandbox = {
    animIsPlaying: true,
    activeAnimSource: { frames: Array.from({ length: frameCount }, () => ({})) },
    animRafId: null,
    animLastTimestamp: 0,
    animAccumulator: 0,
    animFps: fps,
    animCurrentFrameIdx: 0,
    animIsLoop: loop,
    renderAnimFrame: () => { rendered++; },
    requestAnimationFrame: () => ++rafRequests,
    setAnimPlaying: playing => { timingSandbox.animIsPlaying = playing; }
  };
  vm.createContext(timingSandbox);
  vm.runInContext(extractInlineFunctions(html, ['animLoop']).join('\n'), timingSandbox);
  const frameStep = 1000 / 60;
  for (let now = frameStep; now <= durationMs + 0.01 && timingSandbox.animIsPlaying; now += frameStep) {
    timingSandbox.animLoop(now);
  }
  return { rendered, rafRequests, current: timingSandbox.animCurrentFrameIdx, playing: timingSandbox.animIsPlaying };
}

for (const fps of [1, 8, 30]) {
  const actual = runActualLoop({ fps, durationMs: 1000 });
  assert(Math.abs(actual.rendered - fps) <= 1, `actual animLoop should advance about ${fps} times in one second; got ${actual.rendered}`);
}
const noLoop = runActualLoop({ fps: 30, durationMs: 1000, loop: false, frameCount: 4 });
assert.equal(noLoop.playing, false);
assert.equal(noLoop.current, 3);

const cleanupSandbox = {
  animIsPlaying: true,
  animPlayPauseBtn: { setAttribute() {}, textContent: '' },
  animFrameLabel: { setAttribute() {} },
  animRafId: 91,
  cancelAnimationFrame: id => { cleanupSandbox.cancelled = id; },
  requestAnimationFrame: () => 92,
  performance: { now: () => 100 },
  animLoop() {},
  animModal: { classList: { remove() {} } },
  setAnimExpanded() {},
  setAnimGridVisible() {},
  animCanvasWrap: { classList: { remove() {} } },
  animPanState: {},
  activeAnimSource: {},
  animSources: [{}],
  animReturnFocus: null
};
vm.createContext(cleanupSandbox);
vm.runInContext(extractInlineFunctions(html, ['setAnimPlaying', 'closeAnimModal']).join('\n'), cleanupSandbox);
cleanupSandbox.closeAnimModal(false);
assert.equal(cleanupSandbox.cancelled, 91, 'actual close path must cancel the pending animation frame');
assert.equal(cleanupSandbox.animRafId, null);
assert.equal(cleanupSandbox.activeAnimSource, null);
assert.equal(cleanupSandbox.animSources.length, 0);

console.log('ANI-001 animation implementation checks passed.');
