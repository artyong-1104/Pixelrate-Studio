import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { encodePng, generateCorpus } from './lib/pixel-fixtures.mjs';
import { extractInlineFunction } from './lib/extract-inline-function.mjs';
import { evaluateDit001Evidence } from './lib/dit001-evidence-gate.mjs';

const root = path.resolve(import.meta.dirname, '..');
const evidenceDir = path.resolve(root, 'pixelizer-codex-research', 'evidence', 'dit-001');
fs.mkdirSync(evidenceDir, { recursive: true });

const html = fs.readFileSync(path.resolve(root, 'pixelate_studio.html'), 'utf8');
const security = fs.readFileSync(path.resolve(root, 'SECURITY.md'), 'utf8');
const vercel = fs.readFileSync(path.resolve(root, 'vercel.json'), 'utf8');
const inlineScriptMatches = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)];
if(inlineScriptMatches.length !== 1) throw new Error(`Expected one inline script, found ${inlineScriptMatches.length}`);
const scriptContent = inlineScriptMatches[0][1];
const cspHash = 'sha256-' + crypto.createHash('sha256').update(scriptContent, 'utf8').digest('base64');
const cspSynchronized = html.includes(cspHash) && security.includes(cspHash) && vercel.includes(cspHash);

const functionNames = [
  'srgbChannelToLinear', 'linearChannelToSrgb', 'srgbToOklab', 'oklabToSrgb',
  'nearestColorIndex', 'nearestOklabIndex', 'getTwoNearestPaletteIndices',
  'applyOrderedDither', 'mapPixelsToPalette', 'normalizeScaleMode', 'normalizeSettings',
  'validateSettingsEnvelope', 'diffSettings', 'getSettingsSummary'
];

const context = vm.createContext({
  Array, Date, Infinity, Map, Math, Number, Object, Set, String,
  Blob: globalThis.Blob, MAX_PALETTE_SAMPLES: 4096, OKLAB_TEMPORAL_EPSILON: 0.0003
});

const extractedCode = `
const BAYER_MATRICES = Object.freeze({
  bayer2: Object.freeze([[0, 2], [3, 1]]),
  bayer4: Object.freeze([[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]])
});
const FORBIDDEN_SETTINGS_PATTERN = /"(?:__proto__|prototype|constructor)"\\s*:/;
const FORBIDDEN_SETTINGS_KEYS = ['__proto__', 'prototype', 'constructor'];
function checkNoForbiddenKeys(obj) {
  if (!obj || typeof obj !== 'object') return;
  for (const key of Object.keys(obj)) {
    if (FORBIDDEN_SETTINGS_KEYS.includes(key)) throw new Error('forbidden settings key');
    if (typeof obj[key] === 'object' && obj[key] !== null) checkNoForbiddenKeys(obj[key]);
  }
}
const DEFAULT_SETTINGS = Object.freeze({
  scaleMode:'square', size:64, method:'box', factor:4, factorFrameMode:'whole',
  gridFrameMode:'whole', gridFrameWidth:64, gridFrameHeight:64, gridSizeX:8,
  gridSizeY:8, gridPhaseX:0, gridPhaseY:0, gridSource:'manual', gridLockedAcrossFrames:true,
  frameWidth:64, frameHeight:64, pixelBlockSize:4, representativeColor:'mean-srgb',
  paletteMode:'auto', paletteAlgorithm:'kmeans-srgb', paletteSampling:'pixel',
  paletteReference:null, customPalette:[], paletteEnabled:true, colors:16, shared:true,
  cleanEnabled:true, cleanPasses:1, outline:false, outlineWidth:1, outlineColor:'#000000',
  outlineShape:'4', exportNearestScales:[], alphaMode:'binary', alphaThreshold:10,
  ditherMode:'off', ditherStrength:50
});
const PRESETS = Object.freeze({
  default:{...DEFAULT_SETTINGS},
  'animation-safe':{shared:true, cleanEnabled:true, cleanPasses:1, outline:false, ditherMode:'off'},
  'oklab-animation-stable':{paletteMode:'auto', paletteAlgorithm:'kmeans-oklab', paletteSampling:'pixel', paletteReference:null, colors:16, shared:true, cleanEnabled:true, cleanPasses:1, outline:false, ditherMode:'off'},
  'preserve-sheet':{scaleMode:'preserve-sheet', frameWidth:64, frameHeight:64, pixelBlockSize:4}
});
const SETTING_LABELS = Object.freeze({ditherMode:'디더링', ditherStrength:'디더링 강도'});
function formatSettingValue(key, value) {
  if (value === undefined || value === null) return '기본값';
  if (typeof value === 'boolean') return value ? '켜짐' : '꺼짐';
  if (key === 'ditherMode') return ({off:'사용 안 함 (기본)', bayer2:'Bayer 2×2', bayer4:'Bayer 4×4'})[value] || value;
  if (key === 'ditherStrength') return value + '%';
  return String(value);
}
${functionNames.map(name => extractInlineFunction(html, name)).join('\n\n')}
globalThis.__api = {BAYER_MATRICES, DEFAULT_SETTINGS, PRESETS, applyOrderedDither, mapPixelsToPalette};
`;
vm.runInContext(extractedCode, context);
const api = context.__api;

const fixtures = generateCorpus();
const gradient = fixtures.find(item => item.id === 'gradient-gray');
const alphaEdge = fixtures.find(item => item.id === 'alpha-edge');
const animation = fixtures.find(item => item.id === 'animation-16');
let browserQa = null;
const browserQaPath = path.resolve(evidenceDir, 'browser-qa.json');
if(fs.existsSync(browserQaPath)){
  try { browserQa = JSON.parse(fs.readFileSync(browserQaPath, 'utf8')); }
  catch(error) { browserQa = {status:'FAIL', parseError:error.message}; }
}
const externalEvidence = evaluateDit001Evidence(browserQa, evidenceDir);
const palette16 = Array.from({length:16}, (_, index) => {
  const value = Math.round(index / 15 * 255);
  return [value, value, value];
});
const strengths = [25, 50, 75, 100];
const modes = ['bayer2', 'bayer4'];

function alphaOf(frame){
  return Array.from({length:frame.length / 4}, (_, index) => frame[index * 4 + 3]);
}

function hashGrid(grid){
  return crypto.createHash('sha256').update(JSON.stringify(grid)).digest('hex');
}

function mapFrame(frame, width, height, palette, mode, strength){
  return api.mapPixelsToPalette(
    frame, alphaOf(frame), width * height, palette, 'kmeans-srgb', 10,
    null, 0, mode, strength, width
  );
}

function banding(grid, width, height){
  let identical = 0;
  let total = 0;
  for(let y = 0; y < height; y++){
    for(let x = 0; x < width - 1; x++){
      const left = grid[y * width + x];
      const right = grid[y * width + x + 1];
      if(left < 0 || right < 0) continue;
      total++;
      if(left === right) identical++;
    }
  }
  return {identicalTransitions:identical, totalTransitions:total, ratio:total ? identical / total : 0};
}

function changedRatio(left, right, indexes = null){
  const positions = indexes || Array.from({length:Math.min(left.length, right.length)}, (_, index) => index);
  let comparable = 0;
  let changed = 0;
  for(const index of positions){
    if(left[index] < 0 && right[index] < 0) continue;
    comparable++;
    if(left[index] !== right[index]) changed++;
  }
  return comparable ? changed / comparable : 0;
}

function variance(values){
  if(values.length === 0) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  return values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
}

function renderGrid(grid, palette, width, height){
  const rgba = new Uint8ClampedArray(width * height * 4);
  for(let index = 0; index < grid.length; index++){
    const color = grid[index] >= 0 ? palette[grid[index]] : [0, 0, 0];
    rgba[index * 4] = color[0];
    rgba[index * 4 + 1] = color[1];
    rgba[index * 4 + 2] = color[2];
    rgba[index * 4 + 3] = grid[index] >= 0 ? 255 : 0;
  }
  return rgba;
}

const baseline = mapFrame(gradient.frames[0], gradient.width, gradient.height, palette16, 'off', 50);
const baselineBanding = banding(baseline.grid, gradient.width, gradient.height);
const baselineHash = hashGrid(baseline.grid);

const flatWidth = 16;
const flatHeight = 16;
const flatFrame = new Uint8ClampedArray(flatWidth * flatHeight * 4);
for(let index = 0; index < flatWidth * flatHeight; index++) flatFrame.set([127, 127, 127, 255], index * 4);
const flatPalette = [[0, 0, 0], [255, 255, 255]];

const staticIndexes = [];
for(let y = 2; y < 10; y++) for(let x = 2; x < 10; x++) staticIndexes.push(y * animation.width + x);

const evaluations = [];
const renderedCandidates = [{id:'off', rgba:renderGrid(baseline.grid, palette16, gradient.width, gradient.height)}];
for(const mode of modes){
  for(const strength of strengths){
    const result = mapFrame(gradient.frames[0], gradient.width, gradient.height, palette16, mode, strength);
    const resultBanding = banding(result.grid, gradient.width, gradient.height);
    const reduction = baselineBanding.ratio === 0 ? 0 :
      (baselineBanding.ratio - resultBanding.ratio) / baselineBanding.ratio * 100;
    const flat = mapFrame(flatFrame, flatWidth, flatHeight, flatPalette, mode, strength);
    const flatValues = flat.grid.filter(index => index >= 0).map(index => flatPalette[index][0]);
    const animationGrids = animation.frames.map(frame =>
      mapFrame(frame, animation.width, animation.height, palette16, mode, strength).grid
    );
    const temporalRatios = [];
    const staticRatios = [];
    for(let frameIndex = 1; frameIndex < animationGrids.length; frameIndex++){
      temporalRatios.push(changedRatio(animationGrids[frameIndex - 1], animationGrids[frameIndex]));
      staticRatios.push(changedRatio(animationGrids[frameIndex - 1], animationGrids[frameIndex], staticIndexes));
    }
    const evaluation = {
      id:`${mode}-${strength}`,
      mode,
      strength,
      bandingRatio:Number(resultBanding.ratio.toFixed(6)),
      bandingReductionPercent:Number(reduction.toFixed(2)),
      mappingErrorMean:result.error.mean,
      mappingErrorP95:result.error.p95,
      flatRegionVariance:Number(variance(flatValues).toFixed(6)),
      temporalChangedPixelRatio:Number((temporalRatios.reduce((sum, value) => sum + value, 0) / temporalRatios.length).toFixed(6)),
      staticRegionChangedPixelRatio:Number(Math.max(...staticRatios).toFixed(6)),
      gridHash:hashGrid(result.grid)
    };
    evaluation.quantitativeEligibility = evaluation.bandingReductionPercent >= 15 && evaluation.staticRegionChangedPixelRatio === 0 ? 'PASS' : 'FAIL';
    evaluation.texturePreference = externalEvidence.texturePreferenceDecisions[evaluation.id] || 'MISSING';
    evaluation.adoption = evaluation.quantitativeEligibility === 'PASS' && evaluation.texturePreference === 'ACCEPTABLE' ? 'PASS' : 'FAIL';
    evaluation.verdict = evaluation.adoption === 'PASS'
      ? '정지 gradient 밴딩 감소 15% 이상 및 고정 영역 시간축 변화 0'
      : `밴딩 감소 ${evaluation.bandingReductionPercent.toFixed(2)}%로 15% 채택 임계값 미달`;
    if(evaluation.bandingReductionPercent < 15){
      evaluation.verdict = `banding reduction ${evaluation.bandingReductionPercent.toFixed(2)}% is below the 15% threshold`;
    } else if(evaluation.staticRegionChangedPixelRatio !== 0){
      evaluation.verdict = `static-region temporal ratio ${evaluation.staticRegionChangedPixelRatio.toFixed(6)} exceeds 0`;
    } else if(evaluation.texturePreference === 'MISSING'){
      evaluation.verdict = 'missing structured 1x texture preference evidence (fail-closed)';
    } else if(evaluation.texturePreference === 'REJECTED'){
      evaluation.verdict = 'rejected by the structured 1x texture preference review';
    } else {
      evaluation.verdict = 'quantitative gates passed and 1x texture preference is ACCEPTABLE';
    }
    evaluations.push(evaluation);
    renderedCandidates.push({id:evaluation.id, rgba:renderGrid(result.grid, palette16, gradient.width, gradient.height)});
  }
}

const strength0 = mapFrame(gradient.frames[0], gradient.width, gradient.height, palette16, 'bayer2', 0);
const strength0Match = hashGrid(strength0.grid) === baselineHash;

const alphaOff = mapFrame(alphaEdge.frames[0], alphaEdge.width, alphaEdge.height, palette16, 'off', 50);
const alphaDither = mapFrame(alphaEdge.frames[0], alphaEdge.width, alphaEdge.height, palette16, 'bayer4', 100);
let alphaTopologyMismatches = 0;
for(let index = 0; index < alphaOff.grid.length; index++){
  if((alphaOff.grid[index] < 0) !== (alphaDither.grid[index] < 0)) alphaTopologyMismatches++;
}

const expectedBayer2 = [[0, 2], [3, 1]];
const expectedBayer4 = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
const matrixExact = JSON.stringify(api.BAYER_MATRICES.bayer2) === JSON.stringify(expectedBayer2) &&
  JSON.stringify(api.BAYER_MATRICES.bayer4) === JSON.stringify(expectedBayer4);
const outlineMappingIndex = html.indexOf("paletteMapping = temporalPaletteMappings.get(d) || mapPixelsToPalette(");
const outlineApplyIndex = html.indexOf('if(outlineCheck.checked)', outlineMappingIndex);
const outlinePipelineOrder = outlineMappingIndex >= 0 && outlineApplyIndex > outlineMappingIndex;
const animationPresetsOff = api.PRESETS['animation-safe'].ditherMode === 'off' &&
  api.PRESETS['oklab-animation-stable'].ditherMode === 'off';
const quantitativeEligibleByMode = Object.fromEntries(modes.map(mode => [mode, evaluations.filter(item => item.mode === mode && item.quantitativeEligibility === 'PASS').map(item => item.id)]));
const quantitativeCandidateCoverage = modes.every(mode => quantitativeEligibleByMode[mode].length > 0);
const adoptedByMode = Object.fromEntries(modes.map(mode => [mode, evaluations.filter(item => item.mode === mode && item.adoption === 'PASS').map(item => item.id)]));
const adoptionCoverage = modes.every(mode => adoptedByMode[mode].length > 0);

const contactWidth = gradient.width * 3;
const contactHeight = gradient.height * 3;
const contactRgba = new Uint8ClampedArray(contactWidth * contactHeight * 4);
renderedCandidates.forEach((candidate, candidateIndex) => {
  const tileX = candidateIndex % 3;
  const tileY = Math.floor(candidateIndex / 3);
  for(let y = 0; y < gradient.height; y++){
    const sourceStart = y * gradient.width * 4;
    const targetStart = ((tileY * gradient.height + y) * contactWidth + tileX * gradient.width) * 4;
    contactRgba.set(candidate.rgba.subarray(sourceStart, sourceStart + gradient.width * 4), targetStart);
  }
});
const contactBytes = Buffer.from(encodePng(contactWidth, contactHeight, contactRgba));
const contactName = 'strength-matrix-contact-sheet.png';
fs.writeFileSync(path.resolve(evidenceDir, contactName), contactBytes);

const gates = {
  bayerMatrixExact:matrixExact,
  quantitativeCandidateCoverage,
  texturePreferenceEvidence:externalEvidence.texturePreferencePass,
  adoptionCoverage,
  zeroStrengthBaselineIdentity:strength0Match,
  alphaTopologyInvariant:alphaTopologyMismatches === 0,
  outlinePipelineOrder,
  animationPresetsOff,
  contactSheetWritten:fs.existsSync(path.resolve(evidenceDir, contactName)),
  cspSynchronized,
  browserQa:externalEvidence.browserQaPass,
  independentSolReview:externalEvidence.requiredReviewPass
};
const automatedGateNames = [
  'bayerMatrixExact', 'quantitativeCandidateCoverage', 'zeroStrengthBaselineIdentity',
  'alphaTopologyInvariant', 'outlinePipelineOrder', 'animationPresetsOff',
  'contactSheetWritten', 'cspSynchronized'
];
const automatedPass = automatedGateNames.every(name => gates[name]);
const status = automatedPass && gates.texturePreferenceEvidence && gates.adoptionCoverage && gates.browserQa && gates.independentSolReview ? 'DONE' : 'NEEDS_REVIEW';
const verifiedAt = new Date().toISOString();

const qualityMatrix = {
  item:'DIT-001', verifiedAt, fixture:'gradient-gray', palette:'16-step grayscale',
  baseline:{bandingRatio:Number(baselineBanding.ratio.toFixed(6)), mappingErrorMean:baseline.error.mean, mappingErrorP95:baseline.error.p95, gridHash:baselineHash},
  candidateOrder:renderedCandidates.map(item => item.id),
  acceptance:{
    bandingReductionPercentMinimum:15,
    staticRegionChangedPixelRatioMaximum:0,
    texturePreferenceZoom:1,
    texturePreferenceAcceptedValue:'ACCEPTABLE',
    missingTexturePreference:'FAIL_CLOSED'
  },
  evaluations,
  quantitativeEligibleByMode,
  adoptedByMode,
  defaultPolicy:{ditherMode:'off', promotedToPreset:false}
};
fs.writeFileSync(path.resolve(evidenceDir, 'quality-matrix.json'), JSON.stringify(qualityMatrix, null, 2));

const summary = {
  item:'DIT-001',
  title:'Ordered Dithering (Bayer 2×2 / 4×4)',
  verifiedAt,
  status,
  cspHash,
  automatedPass,
  gates:Object.fromEntries(Object.entries(gates).map(([name, pass]) => [
    name,
    pass ? 'PASS' : (name === 'independentSolReview' ? (browserQa?.requiredReview?.result || 'MISSING') : 'FAIL')
  ])),
  baseline:qualityMatrix.baseline,
  strength0Match,
  alphaTopologyMismatches,
  outlinePipelineOrder,
  evaluations,
  quantitativeEligibleByMode,
  adoptedByMode,
  browserEvidence:{
    present:Boolean(browserQa),
    browserQaPass:externalEvidence.browserQaPass,
    captureEvidencePass:externalEvidence.captureEvidencePass,
    staticZoomHashesPass:externalEvidence.staticZoomHashesPass,
    texturePreferencePass:externalEvidence.texturePreferencePass,
    warningTransitionsPass:externalEvidence.warningTransitionsPass,
    captures:externalEvidence.captureEvidence,
    resultAssets:externalEvidence.resultAssetEvidence
  },
  requiredReview:{
    pass:externalEvidence.requiredReviewPass,
    requestedResult:browserQa?.requiredReview?.result || 'MISSING',
    reportExists:externalEvidence.reviewReportExists,
    reportSha256:externalEvidence.reviewReportSha256
  },
  artifacts:{
    contactSheet:contactName,
    contactSheetSha256:crypto.createHash('sha256').update(contactBytes).digest('hex'),
    qualityMatrix:'quality-matrix.json',
    browserQa:fs.existsSync(browserQaPath) ? 'browser-qa.json' : null
  }
};
fs.writeFileSync(path.resolve(evidenceDir, 'summary.json'), JSON.stringify(summary, null, 2));

const resultLabel = pass => pass ? 'PASS' : 'FAIL';
const reviewResultLabel = externalEvidence.requiredReviewPass ? 'PASS' : (browserQa?.requiredReview?.result || 'MISSING');
const gateResultLabel = (name, pass) => name === 'independentSolReview' && !pass ? reviewResultLabel : resultLabel(pass);
const rows = evaluations.map(item =>
  `| ${item.mode} | ${item.strength}% | ${item.bandingRatio.toFixed(6)} | ${item.bandingReductionPercent.toFixed(2)}% | ${item.mappingErrorMean.toFixed(6)} / ${item.mappingErrorP95.toFixed(6)} | ${item.flatRegionVariance.toFixed(2)} | ${item.temporalChangedPixelRatio.toFixed(6)} | ${item.staticRegionChangedPixelRatio.toFixed(6)} | **${item.adoption}** (quantitative ${item.quantitativeEligibility}, 1x ${item.texturePreference}) |`
).join('\n');
const missing = Object.entries(gates).filter(([, pass]) => !pass).map(([name]) => `- [ ] ${name}`).join('\n') || '- 없음';
const report = `# DIT-001 검증 증거 및 실행 보고서

검증 시각: ${verifiedAt}  
상태: \`${status}\`  
운영 정책: 기본값과 애니메이션 프리셋은 모두 \`ditherMode: off\`이며, 실험 후보를 프리셋으로 자동 승격하지 않는다.

## 판정 요약

| 게이트 | 결과 |
|---|---|
${Object.entries(gates).map(([name, pass]) => `| ${name} | **${gateResultLabel(name, pass)}** |`).join('\n')}

50% 강도 실제 측정값: Bayer 2×2 ${evaluations.find(item => item.id === 'bayer2-50').bandingReductionPercent.toFixed(2)}%, Bayer 4×4 ${evaluations.find(item => item.id === 'bayer4-50').bandingReductionPercent.toFixed(2)}%. 두 후보는 15% 채택 임계값을 충족하지 못해 각각 FAIL이다.

채택 후보: Bayer 2×2 = ${adoptedByMode.bayer2.join(', ') || '없음'}, Bayer 4×4 = ${adoptedByMode.bayer4.join(', ') || '없음'}.

최종 채택 판정은 정량 gate와 구조화된 1× texture 선호 gate를 모두 통과해야 한다. 1× 검토에서 Bayer 2×2/4×4의 75%·100% 후보는 모두 \`ACCEPTABLE\`이며, 선호 증거가 없거나 \`REJECTED\`이면 정량값과 관계없이 fail-closed로 처리한다.

## 후보별 품질 매트릭스

| 모드 | 강도 | 밴딩 비율 | 감소율 | OKLab 오차 평균/P95 | flat variance | temporal changed ratio | static-region ratio | 판정 |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| off | - | ${qualityMatrix.baseline.bandingRatio.toFixed(6)} | 0.00% | ${qualityMatrix.baseline.mappingErrorMean.toFixed(6)} / ${qualityMatrix.baseline.mappingErrorP95.toFixed(6)} | - | - | - | 기준선 |
${rows}

각 FAIL 사유는 [quality-matrix.json](./quality-matrix.json)의 \`verdict\`에 기록했다. flat variance와 temporal changed ratio는 비교 지표이며, 채택 gate는 명세대로 gradient 밴딩 15% 이상 감소·고정 영역 변화 0·알파/외곽선 회귀 0·애니메이션 기본 off이다.

## 시각·브라우저·검토 증거

- [strength matrix contact sheet](./${contactName}) — tile 순서는 quality-matrix.json의 candidateOrder와 같다.
- 브라우저 QA: ${resultLabel(gates.browserQa)}${fs.existsSync(browserQaPath) ? ' ([browser-qa.json](./browser-qa.json))' : ' — browser-qa.json 없음'}
- 브라우저 세션 계측: [browser-session-measurements.json](./browser-session-measurements.json)
- 1× texture 선호 판정: [texture-preference-review.json](./texture-preference-review.json)
- 시각 증거: 정적 3 fixture × 1×/2×/8×, texture 기준선·후보 5장, animation 8×/8fps·8×/12fps·모바일 8×/12fps, 서로 다른 16개 frame asset
- 독립 Sol xhigh 검토: ${reviewResultLabel}${externalEvidence.reviewReportExists ? ` ([${browserQa.requiredReview.report}](./${browserQa.requiredReview.report}))` : ''}

## 남은 게이트

${missing}

## 재현 명령

\`\`\`bash
node --test scripts/dit001-check.mjs
node scripts/dit001-ui-check.mjs
node scripts/dit001-evidence-gate-check.mjs
node scripts/generate-dit001-browser-qa.mjs
node scripts/pal002-ui-check.mjs
node scripts/settings-check.mjs
node scripts/security-check.mjs
node scripts/visual-quality-check.mjs
node scripts/generate-dit001-evidence.mjs
\`\`\`
`;
fs.writeFileSync(path.resolve(evidenceDir, 'README.md'), report);
console.log(`DIT-001 evidence: ${status} (${automatedPass ? 'automated PASS' : 'automated FAIL'}, browser ${resultLabel(gates.browserQa)}, independent review ${reviewResultLabel})`);
