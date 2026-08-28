import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { performance } from 'node:perf_hooks';
import { encodePng, generateCorpus } from './lib/pixel-fixtures.mjs';
import { extractInlineFunctions } from './lib/extract-inline-function.mjs';

const root = path.resolve(import.meta.dirname, '..');
const evidenceDir = path.resolve(root, 'pixelizer-codex-research', 'evidence', 'edge-001');
const html = fs.readFileSync(path.resolve(root, 'pixelate_studio.html'), 'utf8');
fs.mkdirSync(evidenceDir, { recursive: true });

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

function sha256(data){
  return crypto.createHash('sha256').update(Buffer.from(data)).digest('hex');
}

function makeRgba(width, height, color = [0, 0, 0, 0]){
  const data = new Uint8ClampedArray(width * height * 4);
  for(let index=0; index<width*height; index++) data.set(color, index * 4);
  return data;
}

function setPixel(data, width, x, y, color){
  data.set(color, (y * width + x) * 4);
}

function fillRect(data, width, x, y, rectWidth, rectHeight, color){
  for(let py=y; py<y+rectHeight; py++){
    for(let px=x; px<x+rectWidth; px++) setPixel(data, width, px, py, color);
  }
}

function smallFaceFixture(){
  const width = 64, height = 64;
  const skin = [220, 176, 142, 255];
  const line = [28, 32, 40, 255];
  const data = makeRgba(width, height, skin);
  fillRect(data, width, 8, 7, 48, 11, [48, 38, 38, 255]);
  const markers = [
    { x: 21, y: 29, kind: 'eye' },
    { x: 41, y: 29, kind: 'eye' },
    { x: 30, y: 43, kind: 'mouth' },
    { x: 31, y: 43, kind: 'mouth' },
    { x: 32, y: 43, kind: 'mouth' },
    { x: 33, y: 43, kind: 'mouth' }
  ];
  for(const marker of markers) setPixel(data, width, marker.x, marker.y, line);
  return { id: 'small-face', width, height, data, markers, background: skin, feature: line };
}

function darkClothingFixture(){
  const width = 64, height = 64;
  const data = makeRgba(width, height, [205, 195, 185, 255]);
  fillRect(data, width, 10, 18, 44, 40, [48, 54, 66, 255]);
  fillRect(data, width, 31, 22, 2, 32, [28, 32, 40, 255]);
  return { id: 'dark-clothing', width, height, data, flatRoi: { x: 14, y: 24, width: 12, height: 26 } };
}

function shadowFixture(){
  const width = 64, height = 64;
  const data = makeRgba(width, height, [188, 172, 152, 255]);
  fillRect(data, width, 10, 32, 44, 20, [132, 122, 116, 255]);
  return { id: 'shadow', width, height, data, flatRoi: { x: 14, y: 36, width: 36, height: 12 } };
}

function transparentSheetFixture(){
  const width = 64, height = 32;
  const data = makeRgba(width, height);
  fillRect(data, width, 4, 4, 24, 24, [210, 120, 80, 255]);
  fillRect(data, width, 36, 4, 24, 24, [80, 160, 220, 255]);
  return { id: 'transparent-sheet', width, height, data, frameWidth: 32, frameHeight: 32 };
}

function alphaHash(data){
  const alpha = Buffer.alloc(data.length / 4);
  for(let index=0; index<alpha.length; index++) alpha[index] = data[index * 4 + 3];
  return sha256(alpha);
}

function lumaAt(data, width, x, y){
  const index = (y * width + x) * 4;
  return api.edgeLuma(data[index], data[index + 1], data[index + 2]);
}

function markerContrast(output, fixture){
  const backgroundLuma = api.edgeLuma(...fixture.background.slice(0, 3));
  let contrast = 0;
  for(const marker of fixture.markers){
    const x = Math.floor(marker.x / 4), y = Math.floor(marker.y / 4);
    contrast += Math.max(0, backgroundLuma - lumaAt(output.data, output.w, x, y));
  }
  return contrast / fixture.markers.length;
}

function featureColorError(output, fixture){
  const target = fixture.feature;
  let total = 0;
  for(const marker of fixture.markers){
    const x = Math.floor(marker.x / 4), y = Math.floor(marker.y / 4);
    const index = (y * output.w + x) * 4;
    total += Math.hypot(
      output.data[index] - target[0],
      output.data[index + 1] - target[1],
      output.data[index + 2] - target[2]
    );
  }
  return total / fixture.markers.length;
}

function roiCandidateRatio(mask, width, roi){
  let candidates = 0, samples = 0;
  for(let y=roi.y; y<roi.y+roi.height; y++){
    for(let x=roi.x; x<roi.x+roi.width; x++){
      candidates += mask[y * width + x] ? 1 : 0;
      samples++;
    }
  }
  return samples > 0 ? candidates / samples : 0;
}

function outputDelta(candidate, baseline){
  let changedPixels = 0, l1 = 0;
  for(let index=0; index<candidate.length; index+=4){
    const delta = Math.abs(candidate[index] - baseline[index]) +
      Math.abs(candidate[index + 1] - baseline[index + 1]) +
      Math.abs(candidate[index + 2] - baseline[index + 2]);
    if(delta > 0) changedPixels++;
    l1 += delta;
  }
  return {
    changedPixels,
    changedRatio: changedPixels / (candidate.length / 4),
    meanRgbAbsoluteDelta: l1 / (candidate.length / 4 * 3)
  };
}

function runStages(fixture){
  const source = { data: fixture.data, width: fixture.width, height: fixture.height };
  const frameWidth = fixture.frameWidth || null;
  const frameHeight = fixture.frameHeight || null;
  const baseline = api.exactFactorDownscale(source, 4, frameWidth, frameHeight, 'mean-srgb', 10);
  const line = api.exactFactorDownscale(
    source, 4, frameWidth, frameHeight, 'mean-srgb', 10,
    { enabled: true, threshold: 0.2, strength: 0.6 }
  );
  const logicalFrameWidth = frameWidth ? frameWidth / 4 : baseline.w;
  const logicalFrameHeight = frameHeight ? frameHeight / 4 : baseline.h;
  const selout = api.applySeloutRgb(
    baseline.data, baseline.w, baseline.h,
    { enabled: true, darken: 0.2, alphaThreshold: 10 },
    logicalFrameWidth, logicalFrameHeight
  );
  const combined = api.applySeloutRgb(
    line.data, line.w, line.h,
    { enabled: true, darken: 0.2, alphaThreshold: 10 },
    logicalFrameWidth, logicalFrameHeight
  );
  const outputs = {
    baseline: { ...baseline, data: baseline.data },
    line: { ...line, data: line.data },
    selout: { ...baseline, data: selout.data, selout },
    combined: { ...line, data: combined.data, selout: combined }
  };
  const baselineAlpha = alphaHash(baseline.data);
  for(const [stage, output] of Object.entries(outputs)){
    assert.equal(alphaHash(output.data), baselineAlpha, `${fixture.id}/${stage} changed alpha topology`);
    const again = stage === 'baseline'
      ? api.exactFactorDownscale(source, 4, frameWidth, frameHeight, 'mean-srgb', 10)
      : stage === 'line'
        ? api.exactFactorDownscale(source, 4, frameWidth, frameHeight, 'mean-srgb', 10, { enabled: true, threshold: 0.2, strength: 0.6 })
        : stage === 'selout'
          ? api.applySeloutRgb(baseline.data, baseline.w, baseline.h, { enabled: true, darken: 0.2, alphaThreshold: 10 }, logicalFrameWidth, logicalFrameHeight)
          : api.applySeloutRgb(line.data, line.w, line.h, { enabled: true, darken: 0.2, alphaThreshold: 10 }, logicalFrameWidth, logicalFrameHeight);
    assert.equal(sha256(output.data), sha256(again.data), `${fixture.id}/${stage} is not deterministic`);
  }
  return outputs;
}

function composite(rows, scale){
  const stageNames = ['baseline', 'line', 'selout', 'combined'];
  const gap = 4, header = 4;
  const tileWidth = Math.max(...rows.map(row => row.outputs.baseline.w)) * scale + gap * 2;
  const tileHeight = Math.max(...rows.map(row => row.outputs.baseline.h)) * scale + gap * 2 + header;
  const width = stageNames.length * tileWidth;
  const height = rows.length * tileHeight;
  const data = makeRgba(width, height, [34, 38, 48, 255]);
  const colors = [[90,90,95,255], [55,130,210,255], [180,110,55,255], [125,75,180,255]];
  rows.forEach((row, rowIndex) => {
    stageNames.forEach((stage, stageIndex) => {
      const output = row.outputs[stage];
      const originX = stageIndex * tileWidth + gap;
      const originY = rowIndex * tileHeight + gap + header;
      fillRect(data, width, stageIndex * tileWidth, rowIndex * tileHeight, tileWidth, header, colors[stageIndex]);
      for(let y=0; y<output.h; y++){
        for(let x=0; x<output.w; x++){
          const sourceIndex = (y * output.w + x) * 4;
          for(let dy=0; dy<scale; dy++){
            for(let dx=0; dx<scale; dx++){
              const targetIndex = ((originY + y * scale + dy) * width + originX + x * scale + dx) * 4;
              const alpha = output.data[sourceIndex + 3] / 255;
              for(let channel=0; channel<3; channel++){
                data[targetIndex + channel] = Math.round(output.data[sourceIndex + channel] * alpha + data[targetIndex + channel] * (1 - alpha));
              }
              data[targetIndex + 3] = 255;
            }
          }
        }
      }
    });
  });
  return { width, height, data };
}

const corpus = generateCorpus();
const face = smallFaceFixture();
const clothing = darkClothingFixture();
const shadow = shadowFixture();
const sheet = transparentSheetFixture();
const fixtureMap = new Map(corpus.map(item => [item.id, {
  id: item.id,
  width: item.width,
  height: item.height,
  data: item.frames[0]
}]));
const fixtures = [
  face,
  clothing,
  shadow,
  fixtureMap.get('low-contrast'),
  fixtureMap.get('texture-checker'),
  fixtureMap.get('photo-like'),
  fixtureMap.get('clean-pixel-art'),
  sheet
];
const rows = fixtures.map(fixture => ({ fixture, outputs: runStages(fixture) }));

const faceRow = rows.find(row => row.fixture.id === 'small-face');
const baselineContrast = markerContrast(faceRow.outputs.baseline, face);
const lineContrast = markerContrast(faceRow.outputs.line, face);
const thinFeatureImprovement = baselineContrast > 0 ? (lineContrast - baselineContrast) / baselineContrast : 0;
const baselineFeatureError = featureColorError(faceRow.outputs.baseline, face);
const lineFeatureError = featureColorError(faceRow.outputs.line, face);

const flatEvaluations = [clothing, shadow].map(fixture => {
  const lineContext = api.createLineAwareContext(
    fixture.data, fixture.width, fixture.height,
    { enabled: true, threshold: 0.2, strength: 0.6, alphaThreshold: 10 },
    fixture.width, fixture.height
  );
  return {
    fixtureId: fixture.id,
    candidates: lineContext.sourceCandidatePixels,
    flatRegionFalseLineRatio: roiCandidateRatio(lineContext.mask, fixture.width, fixture.flatRoi)
  };
});
const maxFlatFalseLineRatio = Math.max(...flatEvaluations.map(item => item.flatRegionFalseLineRatio));

const safetyEvaluations = ['low-contrast', 'texture-checker', 'photo-like'].map(id => {
  const row = rows.find(item => item.fixture.id === id);
  return { fixtureId: id, ...outputDelta(row.outputs.line.data, row.outputs.baseline.data) };
});
const fatalSafetyDistortion = safetyEvaluations.some(item => item.changedRatio >= 0.01 || item.meanRgbAbsoluteDelta >= 2);
const sheetRow = rows.find(row => row.fixture.id === 'transparent-sheet');
assert.equal(sheetRow.outputs.line.lineAware.sourceCandidatePixels, 0, 'transparent sheet must not create cross-frame line candidates');
assert.equal(sheetRow.outputs.selout.selout.pixelCount, 40, 'two 6x6 logical silhouettes must each darken a 20-pixel perimeter');

const stageSheetNative = composite(rows, 1);
const stageSheet8x = composite(rows, 8);
fs.writeFileSync(path.resolve(evidenceDir, 'stage-ablation-native.png'), encodePng(stageSheetNative.width, stageSheetNative.height, stageSheetNative.data));
fs.writeFileSync(path.resolve(evidenceDir, 'stage-ablation-8x.png'), encodePng(stageSheet8x.width, stageSheet8x.height, stageSheet8x.data));
for(const fixture of fixtures){
  fs.writeFileSync(path.resolve(evidenceDir, `fixture-${fixture.id}.png`), encodePng(fixture.width, fixture.height, fixture.data));
}

const largeWidth = 2048, largeHeight = 2048;
const large = makeRgba(largeWidth, largeHeight, [128, 128, 128, 255]);
const runtimeStarted = performance.now();
const largeContext = api.createLineAwareContext(
  large, largeWidth, largeHeight,
  { enabled: true, threshold: 0.2, strength: 0.6, alphaThreshold: 10 },
  largeWidth, largeHeight
);
const runtimeMs4M = performance.now() - runtimeStarted;

const baselineHash = sha256(faceRow.outputs.baseline.data);
const baselineAgain = runStages(face).baseline;
assert.equal(baselineHash, sha256(baselineAgain.data), 'off baseline hash changed between runs');
const adoption = {
  status: thinFeatureImprovement >= 0.1 && maxFlatFalseLineRatio < 0.01 && !fatalSafetyDistortion ? 'PASS' : 'FAIL',
  thresholds: {
    thinFeatureImprovementMinimum: 0.1,
    flatRegionFalseLineRatioMaximumExclusive: 0.01,
    fatalPainterlyOrPhotoDistortionAllowed: false
  },
  measured: {
    baselineFeatureContrast: Number(baselineContrast.toFixed(4)),
    lineFeatureContrast: Number(lineContrast.toFixed(4)),
    thinFeatureImprovement: Number(thinFeatureImprovement.toFixed(4)),
    baselineFeatureColorError: Number(baselineFeatureError.toFixed(4)),
    lineFeatureColorError: Number(lineFeatureError.toFixed(4)),
    maxFlatRegionFalseLineRatio: Number(maxFlatFalseLineRatio.toFixed(6)),
    fatalPainterlyOrPhotoDistortion: fatalSafetyDistortion
  }
};
assert.equal(adoption.status, 'PASS', `EDGE-001 adoption gate failed: ${JSON.stringify(adoption.measured)}`);

const browserQaPath = path.resolve(evidenceDir, 'browser-qa.json');
let browserQa = null;
let browserQaPass = false;
if(fs.existsSync(browserQaPath)){
  browserQa = JSON.parse(fs.readFileSync(browserQaPath, 'utf8'));
  const semanticPass = browserQa.itemId === 'EDGE-001' &&
    browserQa.overallStatus === 'PASS' &&
    browserQa.baseline?.detailMetadataAbsentWhenDisabled === true &&
    browserQa.combined?.lineAndSeloutCountsVisibleTogether === true &&
    browserQa.outlineOverlap?.warning === '서로 다른 두 외곽선 효과가 중첩됩니다.' &&
    browserQa.sheetBoundary?.crossFrameLineCandidates === 0 &&
    browserQa.sheetBoundary?.seloutPixels === 40 &&
    browserQa.mobile?.horizontalOverflow === false &&
    browserQa.keyboard?.spaceOffTransition === true &&
    browserQa.keyboard?.spaceOnTransition === true &&
    browserQa.console?.mainErrorsOrWarnings === 0 &&
    browserQa.console?.sheetErrorsOrWarnings === 0;
  const captureEntries = Object.entries(browserQa.captures || {});
  const capturesPass = captureEntries.length >= 9 && captureEntries.every(([name, expectedHash]) => {
    if(path.basename(name) !== name || !name.endsWith('.jpg')) return false;
    const capturePath = path.resolve(evidenceDir, name);
    if(!fs.existsSync(capturePath)) return false;
    const bytes = fs.readFileSync(capturePath);
    return bytes.length > 5000 && bytes[0] === 0xff && bytes[1] === 0xd8 && sha256(bytes) === expectedHash;
  });
  browserQaPass = semanticPass && capturesPass;
}

const summary = {
  itemId: 'EDGE-001',
  generatedAt: new Date().toISOString(),
  status: browserQaPass ? 'PASS' : 'AUTOMATED_PASS_BROWSER_PENDING',
  settings: {
    lineAware: { enabled: true, threshold: 0.2, strength: 0.6 },
    selout: { enabled: true, darken: 0.2 },
    palette: 'unlimited',
    alpha: { mode: 'binary', threshold: 10 },
    cleanup: false,
    dither: false,
    outline: false
  },
  adoption,
  browserQa: {
    pass: browserQaPass,
    file: browserQa ? 'browser-qa.json' : null,
    captureCount: browserQa ? Object.keys(browserQa.captures || {}).length : 0
  },
  flatEvaluations,
  safetyEvaluations,
  sheetBoundary: {
    crossFrameLineCandidates: sheetRow.outputs.line.lineAware.sourceCandidatePixels,
    seloutPixels: sheetRow.outputs.selout.selout.pixelCount,
    alphaHashStable: alphaHash(sheetRow.outputs.baseline.data) === alphaHash(sheetRow.outputs.combined.data)
  },
  performance: {
    pixels: largeWidth * largeHeight,
    runtimeMs: Number(runtimeMs4M.toFixed(3)),
    typedArrayPeakBytes: largeContext.memoryBytes,
    implementation: 'naive 3x3 bounded-neighbor scan; O(N) with at most 8 neighbor reads per foreground pixel'
  },
  determinism: {
    baselineSha256: baselineHash,
    lineSha256: sha256(faceRow.outputs.line.data),
    combinedSha256: sha256(faceRow.outputs.combined.data),
    repeated: true
  },
  fixtures: rows.map(row => ({
    id: row.fixture.id,
    input: [row.fixture.width, row.fixture.height],
    output: [row.outputs.baseline.w, row.outputs.baseline.h],
    stages: Object.fromEntries(Object.entries(row.outputs).map(([stage, output]) => [stage, {
      rgbaSha256: sha256(output.data),
      deltaFromBaseline: outputDelta(output.data, row.outputs.baseline.data),
      lineCandidates: output.lineAware?.candidatePixels || 0,
      coveredCells: output.lineAware?.coveredCells || 0,
      seloutPixels: output.selout?.pixelCount || 0
    }]))
  })),
  artifacts: [
    'stage-ablation-native.png',
    'stage-ablation-8x.png',
    'fixture-small-face.png',
    'fixture-dark-clothing.png',
    'fixture-shadow.png',
    'fixture-transparent-sheet.png',
    'fixture-low-contrast.png',
    'fixture-texture-checker.png',
    'fixture-photo-like.png',
    'fixture-clean-pixel-art.png'
  ]
};
fs.writeFileSync(path.resolve(evidenceDir, 'automated-results.json'), `${JSON.stringify(summary, null, 2)}\n`);

const report = `# EDGE-001 automated evidence\n\n` +
  `Status: **${summary.status}**\n\n` +
  `- Thin-feature contrast improvement: ${(thinFeatureImprovement * 100).toFixed(2)}% (required: at least 10%)\n` +
  `- Maximum flat-region false-line ratio: ${(maxFlatFalseLineRatio * 100).toFixed(3)}% (required: under 1%)\n` +
  `- Painterly/photo fatal distortion: ${fatalSafetyDistortion ? 'YES' : 'NO'}\n` +
  `- Sheet cross-frame line candidates: ${summary.sheetBoundary.crossFrameLineCandidates}\n` +
  `- 4M line-mask runtime: ${runtimeMs4M.toFixed(1)}ms\n` +
  `- Typed-array peak: ${largeContext.memoryBytes} bytes\n` +
  `- Off baseline SHA-256: \`${baselineHash}\`\n` +
  `- Browser QA: ${browserQaPass ? `PASS (${Object.keys(browserQa.captures).length} integrity-checked captures)` : 'PENDING'}\n\n` +
  `${browserQaPass ? 'Actual-size, mobile, keyboard, outline-overlap, metadata, sheet-boundary, and console checks passed.' : 'Browser actual-size, mobile, keyboard, outline-overlap, and metadata evidence remain fail-closed.'}\n`;
fs.writeFileSync(path.resolve(evidenceDir, 'README.md'), report);

console.log(`EDGE-001 automated evidence PASS. thin=${(thinFeatureImprovement * 100).toFixed(2)}% falseLine=${(maxFlatFalseLineRatio * 100).toFixed(3)}% runtime4M=${runtimeMs4M.toFixed(1)}ms`);
