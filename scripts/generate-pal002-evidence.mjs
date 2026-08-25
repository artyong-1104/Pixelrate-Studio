import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { performance } from 'node:perf_hooks';
import { extractInlineFunction } from './lib/extract-inline-function.mjs';
import { generateCorpus, FIXTURE_SEED, GENERATOR_VERSION } from './lib/pixel-fixtures.mjs';
import {
  candidateEligible,
  regressionWithinLimit,
  relativeChangePercent,
  relativeImprovementPercent,
  samplingCorpusValid
} from './lib/pal002-evaluation.mjs';
import {
  PAL002_REQUIRED_CAPTURES,
  evaluatePal002CaptureEvidence,
  evaluatePal002ManualMatrixEvidence
} from './lib/pal002-evidence-gate.mjs';

const root = path.resolve(import.meta.dirname, '..');
const evidenceDir = path.resolve(root, 'pixelizer-codex-research', 'evidence', 'pal-002');
const html = fs.readFileSync(path.resolve(root, 'pixelate_studio.html'), 'utf8');
const inlineScript = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
  .map(match => match[1])
  .find(source => source.trim()) || '';
const applicationScriptSha256 = crypto.createHash('sha256').update(inlineScript).digest('hex');
fs.mkdirSync(evidenceDir, { recursive: true });

const functionNames = [
  'kmeans', 'palettePointWeight', 'limitPalettePoints', 'srgbChannelToLinear',
  'linearChannelToSrgb', 'srgbToOklab', 'oklabToSrgb', 'dedupeAndBackfillPalette',
  'kmeansOklab', 'getMedianCutBoxInfo', 'medianCut', 'generatePaletteFromPoints',
  'collectPaletteSamples', 'nearestOklabIndex', 'nearestColorIndex', 'mapPixelsToPalette'
];
const context = vm.createContext({
  Array, Date, Infinity, Map, Math, Number, Object, Set, String,
  MAX_PALETTE_SAMPLES: 50000
});
vm.runInContext(
  `${functionNames.map(name => extractInlineFunction(html, name)).join('\n')}\n` +
  `globalThis.__api = { ${functionNames.join(',')} };`,
  context,
  { timeout: 5000 }
);
const api = context.__api;
const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const round = value => Number(value.toFixed(6));
const roundNullable = value => value === null ? null : round(value);
const formatPercent = value => value === null ? '∞ (기준선 0)' : `${value}%`;

function fixtureDowns(fixture){
  return fixture.frames.map((data, frameIndex) => ({
    name: fixture.frames.length === 1 ? `${fixture.id}.png` : `${fixture.id}-${String(frameIndex).padStart(2, '0')}.png`,
    addedIndex: frameIndex,
    data,
    w: fixture.width,
    h: fixture.height
  }));
}

function scaleNearestDown(down, width, height){
  const data = new Uint8ClampedArray(width * height * 4);
  for(let y=0; y<height; y++){
    const sourceY = Math.min(down.h - 1, Math.floor(y * down.h / height));
    for(let x=0; x<width; x++){
      const sourceX = Math.min(down.w - 1, Math.floor(x * down.w / width));
      const sourceOffset = (sourceY * down.w + sourceX) * 4;
      const targetOffset = (y * width + x) * 4;
      data[targetOffset] = down.data[sourceOffset];
      data[targetOffset + 1] = down.data[sourceOffset + 1];
      data[targetOffset + 2] = down.data[sourceOffset + 2];
      data[targetOffset + 3] = down.data[sourceOffset + 3];
    }
  }
  return { ...down, data, w: width, h: height };
}

function aggregateMappings(downs, palette, algorithm){
  let weightedMean = 0;
  let samples = 0;
  let p95 = 0;
  let max = 0;
  let usedSlots = 0;
  const grids = [];
  const perImage = [];
  let previousGrid = null;
  let previousWidth = null;
  let previousHeight = null;
  let temporalHeldCount = 0;
  for(const down of downs){
    const alpha = Array.from({ length: down.w*down.h }, (_, index) => down.data[index*4+3]);
    const sameGeometry = previousWidth === down.w && previousHeight === down.h;
    const stabilize = algorithm === 'kmeans-oklab' && sameGeometry;
    const mapping = api.mapPixelsToPalette(
      down.data,
      alpha,
      down.w*down.h,
      palette,
      algorithm,
      10,
      stabilize ? previousGrid : null,
      stabilize ? 0.00025 : 0
    );
    weightedMean += mapping.error.mean * mapping.error.sampleCount;
    samples += mapping.error.sampleCount;
    p95 = Math.max(p95, mapping.error.p95);
    max = Math.max(max, mapping.error.max);
    usedSlots += mapping.slotUsage;
    grids.push(mapping.grid);
    temporalHeldCount += mapping.temporalHeldCount || 0;
    perImage.push({ name: down.name, error: mapping.error, slotUsage: mapping.slotUsage });
    previousGrid = mapping.grid;
    previousWidth = down.w;
    previousHeight = down.h;
  }
  return {
    error: { mean: round(samples ? weightedMean / samples : 0), p95: round(p95), max: round(max), sampleCount: samples },
    averageSlotUsage: round(usedSlots / downs.length),
    temporalHeldCount,
    grids,
    perImage
  };
}

function temporalIndexVariance(grids){
  if(grids.length < 2) return 0;
  let compared = 0;
  let changed = 0;
  for(let frame=1; frame<grids.length; frame++){
    const count = Math.min(grids[frame-1].length, grids[frame].length);
    for(let index=0; index<count; index++){
      if(grids[frame-1][index] < 0 && grids[frame][index] < 0) continue;
      compared++;
      if(grids[frame-1][index] !== grids[frame][index]) changed++;
    }
  }
  return round(compared ? changed / compared : 0);
}

function evaluate(downs, colorCount, algorithm, sampling='pixel', reference=null){
  const memoryBefore = process.memoryUsage().heapUsed;
  const started = performance.now();
  const points = api.collectPaletteSamples(downs, sampling, reference, 50000, 10, false);
  const samplingCompleted = performance.now();
  const palette = api.generatePaletteFromPoints(points, colorCount, algorithm, 10);
  const generationCompleted = performance.now();
  const samplingRuntimeMs = samplingCompleted - started;
  const generationRuntimeMs = generationCompleted - samplingCompleted;
  const runtimeMs = generationCompleted - started;
  const memoryAfter = process.memoryUsage().heapUsed;
  const mapping = aggregateMappings(downs, palette, algorithm);
  const second = api.generatePaletteFromPoints(points, colorCount, algorithm, 10);
  return {
    colorsRequested: colorCount,
    colorsReturned: palette.length,
    sampleCount: points.length,
    samplingRuntimeMs: round(samplingRuntimeMs),
    generationRuntimeMs: round(generationRuntimeMs),
    runtimeMs: round(runtimeMs),
    heapDeltaBytes: memoryAfter - memoryBefore,
    paletteSha256: hash(palette),
    deterministic: hash(palette) === hash(second),
    error: mapping.error,
    perImage: mapping.perImage,
    averageSlotUsage: mapping.averageSlotUsage,
    temporalHeldCount: mapping.temporalHeldCount,
    temporalIndexVariance: temporalIndexVariance(mapping.grids)
  };
}

const corpus = generateCorpus({ seed: FIXTURE_SEED, generatorVersion: GENERATOR_VERSION });
const fixtureIds = ['gradient-gray', 'clean-pixel-art', 'photo-like', 'animation-16'];
const algorithms = ['kmeans-srgb', 'kmeans-oklab', 'median-cut'];
const colorCounts = [8, 16, 32, 64];
const matrix = [];
for(const fixtureId of fixtureIds){
  const fixture = corpus.find(item => item.id === fixtureId);
  const downs = fixtureDowns(fixture);
  for(const colors of colorCounts){
    for(const algorithm of algorithms){
      matrix.push({ fixture: fixtureId, algorithm, sampling: 'pixel', ...evaluate(downs, colors, algorithm) });
    }
  }
}

const background = scaleNearestDown(
  fixtureDowns(corpus.find(item => item.id === 'gradient-gray'))[0],
  512,
  256
);
background.name = 'background.png';
background.addedIndex = 0;
const character = fixtureDowns(corpus.find(item => item.id === 'clean-pixel-art'))[0];
character.name = 'character.png';
character.addedIndex = 1;
const samplingDowns = [background, character];
const animationDowns = fixtureDowns(corpus.find(item => item.id === 'animation-16'));
const samplingCandidates = [
  { sampling: 'pixel', reference: null },
  { sampling: 'image-balanced', reference: null },
  { sampling: 'reference', reference: 'character.png' }
];
const samplingMatrix = samplingCandidates.map(candidate => {
  const main = evaluate(samplingDowns, 16, 'kmeans-srgb', candidate.sampling, candidate.reference);
  const temporalReference = candidate.sampling === 'reference' ? animationDowns[0].name : null;
  const temporal = evaluate(animationDowns, 16, 'kmeans-srgb', candidate.sampling, temporalReference);
  return {
    algorithm: 'kmeans-srgb',
    ...candidate,
    corpus: { background: [background.w, background.h], character: [character.w, character.h] },
    ...main,
    temporalEvaluation: {
      fixture: 'animation-16',
      reference: temporalReference,
      sampleCount: temporal.sampleCount,
      paletteSha256: temporal.paletteSha256,
      deterministic: temporal.deterministic,
      temporalIndexVariance: temporal.temporalIndexVariance
    }
  };
});
const samplingPixelRow = samplingMatrix.find(row => row.sampling === 'pixel');
const samplingBalancedRow = samplingMatrix.find(row => row.sampling === 'image-balanced');
const samplingCorpusPass = samplingCorpusValid({
  backgroundPixels: background.w * background.h,
  characterPixels: character.w * character.h,
  pixelSampleCount: samplingPixelRow?.sampleCount,
  imageBalancedSampleCount: samplingBalancedRow?.sampleCount,
  pixelPaletteSha256: samplingPixelRow?.paletteSha256,
  imageBalancedPaletteSha256: samplingBalancedRow?.paletteSha256
});
const runtimeBreakdownPass = [...matrix, ...samplingMatrix].every(row =>
  Number.isFinite(row.samplingRuntimeMs) && row.samplingRuntimeMs >= 0 &&
  Number.isFinite(row.generationRuntimeMs) && row.generationRuntimeMs >= 0 &&
  Math.abs(row.runtimeMs - round(row.samplingRuntimeMs + row.generationRuntimeMs)) <= 0.000002
);

const qaPath = path.resolve(evidenceDir, 'qa-results.json');
const qa = fs.existsSync(qaPath) ? JSON.parse(fs.readFileSync(qaPath, 'utf8')) : null;
const { captureEvidence, capturesPass, blindEvidencePass } = evaluatePal002CaptureEvidence(qa, evidenceDir);
const manualMatrixEvidence = evaluatePal002ManualMatrixEvidence(qa, evidenceDir);

const baselineByKey = new Map(matrix.filter(row => row.algorithm === 'kmeans-srgb').map(row => [`${row.fixture}/${row.colorsRequested}`, row]));
const algorithmSummary = algorithms.slice(1).map(algorithm => {
  const candidates = matrix.filter(row => row.algorithm === algorithm);
  const baselines = candidates.map(row => baselineByKey.get(`${row.fixture}/${row.colorsRequested}`));
  const candidateMean = candidates.reduce((sum, row) => sum + row.error.mean, 0) / candidates.length;
  const baselineMean = baselines.reduce((sum, row) => sum + row.error.mean, 0) / baselines.length;
  const runtimeRatio = candidates.reduce((sum, row) => sum + row.runtimeMs, 0) /
    Math.max(0.001, baselines.reduce((sum, row) => sum + row.runtimeMs, 0));
  const featureCandidate = candidates.filter(row => row.fixture === 'clean-pixel-art').reduce((sum, row) => sum + row.error.mean, 0) / colorCounts.length;
  const featureBaseline = baselines.filter(row => row.fixture === 'clean-pixel-art').reduce((sum, row) => sum + row.error.mean, 0) / colorCounts.length;
  const temporalCandidate = candidates.filter(row => row.fixture === 'animation-16').reduce((sum, row) => sum + row.temporalIndexVariance, 0) / colorCounts.length;
  const temporalBaseline = baselines.filter(row => row.fixture === 'animation-16').reduce((sum, row) => sum + row.temporalIndexVariance, 0) / colorCounts.length;
  const improvementPercent = relativeImprovementPercent(candidateMean, baselineMean);
  const featureChangePercent = relativeChangePercent(featureCandidate, featureBaseline);
  const temporalChangePercent = relativeChangePercent(temporalCandidate, temporalBaseline);
  const featureRegressionPass = regressionWithinLimit(featureCandidate, featureBaseline, 10);
  const temporalRegressionPass = regressionWithinLimit(temporalCandidate, temporalBaseline, 10);
  const blindPreferencePercent = blindEvidencePass &&
    qa?.blindPreference?.candidateAlgorithm === algorithm
    ? Number(qa.blindPreference.preferencePercentForCandidate) || 0
    : 0;
  const deterministic = candidates.every(row => row.deterministic);
  return {
    algorithm,
    improvementPercent: roundNullable(improvementPercent),
    runtimeRatio: round(runtimeRatio),
    featureChangePercent: roundNullable(featureChangePercent),
    temporalChangePercent: roundNullable(temporalChangePercent),
    featureRegressionPass,
    temporalRegressionPass,
    blindPreferencePercent,
    deterministic,
    eligibleByAutomatedMetrics: candidateEligible({
      improvementPercent,
      blindPreferencePercent,
      runtimeRatio,
      featureRegressionPass,
      temporalRegressionPass,
      deterministic
    })
  };
});

const pixelSamplingBaseline = samplingMatrix.find(row => row.sampling === 'pixel');
const samplingSummary = samplingMatrix.filter(row => row.sampling !== 'pixel').map(row => {
  const baselineMean = pixelSamplingBaseline?.error?.mean || 0;
  const improvementPercent = relativeImprovementPercent(row.error.mean, baselineMean);
  const runtimeRatio = row.runtimeMs / Math.max(0.001, pixelSamplingBaseline?.runtimeMs || 0);
  const baselineFeature = pixelSamplingBaseline?.perImage?.find(item => item.name === 'character.png')?.error?.mean ?? 0;
  const candidateFeature = row.perImage?.find(item => item.name === 'character.png')?.error?.mean ?? 0;
  const baselineTemporal = pixelSamplingBaseline?.temporalEvaluation?.temporalIndexVariance ?? 0;
  const candidateTemporal = row.temporalEvaluation?.temporalIndexVariance ?? 0;
  const featureChangePercent = relativeChangePercent(candidateFeature, baselineFeature);
  const temporalChangePercent = relativeChangePercent(candidateTemporal, baselineTemporal);
  const featureRegressionPass = regressionWithinLimit(candidateFeature, baselineFeature, 10);
  const temporalRegressionPass = regressionWithinLimit(candidateTemporal, baselineTemporal, 10);
  const deterministic = row.deterministic && row.temporalEvaluation?.deterministic === true;
  return {
    sampling: row.sampling,
    reference: row.reference,
    improvementPercent: roundNullable(improvementPercent),
    runtimeRatio: round(runtimeRatio),
    featureChangePercent: roundNullable(featureChangePercent),
    temporalChangePercent: roundNullable(temporalChangePercent),
    featureRegressionPass,
    temporalRegressionPass,
    deterministic,
    eligibleByAutomatedMetrics: candidateEligible({
      improvementPercent,
      runtimeRatio,
      featureRegressionPass,
      temporalRegressionPass,
      deterministic
    })
  };
});

const defaultSettingsBlock = html.match(/const DEFAULT_SETTINGS = Object\.freeze\(\{([\s\S]*?)\}\);/)?.[1] || '';
const presetsBlock = html.match(/const PRESETS = Object\.freeze\(\{([\s\S]*?)\}\);\s*\n\s*function normalizeScaleMode/)?.[1] || '';
const stablePresetMatch = presetsBlock.match(/'oklab-animation-stable':\s*\{([\s\S]*?)\n\s*\},/);
const stablePresetBlock = stablePresetMatch?.[1] || '';
const otherPresetsBlock = stablePresetMatch ? presetsBlock.replace(stablePresetMatch[0], '') : presetsBlock;
const stablePresetPromoted = /paletteMode:\s*'auto'/.test(stablePresetBlock) &&
  /paletteAlgorithm:\s*'kmeans-oklab'/.test(stablePresetBlock) &&
  /paletteSampling:\s*'pixel'/.test(stablePresetBlock) &&
  /shared:\s*true/.test(stablePresetBlock);
const defaultAndPresetPass = /paletteAlgorithm:\s*'kmeans-srgb'/.test(defaultSettingsBlock) &&
  /paletteSampling:\s*'pixel'/.test(defaultSettingsBlock) && /paletteReference:\s*null/.test(defaultSettingsBlock) &&
  stablePresetPromoted &&
  !/(?:kmeans-oklab|median-cut|image-balanced|paletteSampling:\s*'reference')/.test(otherPresetsBlock);
const compatibilityPoints = [
  [200,0,0], [201,0,0], [202,0,0], [203,0,0], [204,0,0], [205,0,0],
  [0,200,0], [0,201,0], [0,202,0], [0,203,0], [0,204,0], [0,205,0]
];
const baselinePaletteSha256 = hash(api.generatePaletteFromPoints(compatibilityPoints, 4, 'kmeans-srgb', 10));
const baselineHashPass = baselinePaletteSha256 === '8fc99dd6e6e2dffde8dec057af66e2868cfe0ddbc50bd1035bfe73681781602d';
const roundTripPass = [[0,0,0], [255,255,255], [255,0,0], [12,128,240], [73,41,199]].every(color => {
  const restored = api.oklabToSrgb(...api.srgbToOklab(...color));
  return restored.every((channel, index) => Math.abs(channel - color[index]) <= 1);
});

const reviewName = qa?.requiredReview?.report;
const reviewPath = typeof reviewName === 'string' && path.basename(reviewName) === reviewName
  ? path.resolve(evidenceDir, reviewName)
  : null;
const reviewText = reviewPath && fs.existsSync(reviewPath) ? fs.readFileSync(reviewPath, 'utf8') : '';
const reviewSha256 = reviewText ? crypto.createHash('sha256').update(reviewText, 'utf8').digest('hex') : null;
const requiredReviewPass = qa?.requiredReview?.model === 'Sol xhigh' && qa?.requiredReview?.result === 'PASS' &&
  qa?.requiredReview?.reportSha256 === reviewSha256 &&
  reviewText.includes(`APPLICATION_SCRIPT_SHA256: ${applicationScriptSha256}`) &&
  /(?:^|\n)ADOPTION:\s*oklab-animation-stable\s*(?:\n|$)/.test(reviewText) &&
  /(?:^|\n)RECOMMENDATION:\s*PASS\s*(?:\n|$)/.test(reviewText) &&
  !/(?:^|\n)RECOMMENDATION:\s*CHANGES_REQUESTED\s*(?:\n|$)/.test(reviewText);
const requiredReviewFailed = qa?.requiredReview?.model === 'Sol xhigh' && qa?.requiredReview?.result === 'FAIL';

const automatedPass = matrix.length === 48 && samplingMatrix.length === 3 &&
  matrix.every(row => row.deterministic && row.colorsReturned <= row.colorsRequested && row.sampleCount <= 50000) &&
  samplingCorpusPass && runtimeBreakdownPass &&
  samplingMatrix.every(row => row.deterministic && row.sampleCount <= 50000 &&
    row.temporalEvaluation?.deterministic === true && row.temporalEvaluation?.sampleCount <= 50000) &&
  defaultAndPresetPass && baselineHashPass && roundTripPass;
const browserQaPass = qa?.status === 'PASS' && qa?.desktop?.pass === true && qa?.mobile?.pass === true &&
  qa?.applicationScriptSha256 === applicationScriptSha256 &&
  qa?.temporalStableProduct?.pass === true && qa?.temporalStableProduct?.preset === 'oklab-animation-stable' &&
  qa?.temporalStableProduct?.processedImages === 16 && qa?.temporalStableProduct?.totalHeldPixels > 0 &&
  qa?.temporalStableProduct?.temporalEpsilon === 0.00025 &&
  qa?.referenceValidation?.pass === true && qa?.settingsRoundTrip?.pass === true &&
  qa?.defaultCompatibility?.pass === true && qa?.keyboard?.pass === true &&
  qa?.consoleErrors?.length === 0 && blindEvidencePass && capturesPass && manualMatrixEvidence.pass;
const eligibleAlgorithms = algorithmSummary.filter(row => row.eligibleByAutomatedMetrics).map(row => row.algorithm);
const eligibleSamplingPolicies = samplingSummary.filter(row => row.eligibleByAutomatedMetrics).map(row => row.sampling);
const hasEligibleCandidate = eligibleAlgorithms.length > 0 || eligibleSamplingPolicies.length > 0;
const adoptionPass = hasEligibleCandidate && stablePresetPromoted && eligibleAlgorithms.includes('kmeans-oklab') && requiredReviewPass;
const status = requiredReviewFailed
  ? 'IN_PROGRESS'
  : automatedPass && browserQaPass && requiredReviewPass
    ? (adoptionPass ? 'DONE' : (hasEligibleCandidate ? 'NEEDS_REVIEW' : 'DEFERRED'))
    : 'NEEDS_REVIEW';
const pending = [
  ...(automatedPass ? [] : ['automated palette matrix']),
  ...(browserQaPass ? [] : ['fresh localhost browser QA, valid blind record, and capture integrity']),
  ...(requiredReviewPass ? [] : [requiredReviewFailed ? 'independent Sol xhigh changes requested' : 'independent Sol xhigh review']),
  ...(adoptionPass ? [] : ['approved opt-in preset promotion'])
];

const summary = {
  implementationId: 'PAL-002',
  status,
  generatedAt: new Date().toISOString(),
  baseline: {
    algorithm: 'kmeans-srgb',
    sampling: 'pixel',
    defaultAndPresetPass,
    paletteSha256: baselinePaletteSha256,
    hashPass: baselineHashPass,
    roundTripPass
  },
  automatedPass,
  browserQaPass,
  matrix,
  samplingMatrix,
  runtimeBreakdownPass,
  samplingCorpus: {
    background: [background.w, background.h],
    character: [character.w, character.h],
    backgroundToCharacterPixelRatio: round((background.w * background.h) / (character.w * character.h)),
    pixelSampleCount: samplingPixelRow?.sampleCount ?? null,
    imageBalancedSampleCount: samplingBalancedRow?.sampleCount ?? null,
    palettesDiffer: samplingPixelRow?.paletteSha256 !== samplingBalancedRow?.paletteSha256,
    pass: samplingCorpusPass
  },
  algorithmSummary,
  samplingSummary,
  browserQa: qa,
  evidenceIntegrity: {
    applicationScriptSha256,
    requiredCaptures: PAL002_REQUIRED_CAPTURES,
    captureEvidence,
    capturesPass,
    blindEvidencePass,
    manualMatrixEvidence
  },
  requiredReview: qa?.requiredReview || { model: 'Sol xhigh', result: 'PENDING', report: null },
  requiredReviewPass,
  adoption: {
    promotedToDefault: false,
    promotedToPreset: adoptionPass,
    preset: adoptionPass ? 'oklab-animation-stable' : null,
    status: adoptionPass ? 'ADOPTED_OPT_IN' : (requiredReviewFailed ? 'REJECTED_BY_REVIEW' : (hasEligibleCandidate ? 'READY_FOR_PROMOTION_REVIEW' : 'DEFERRED')),
    eligibleAlgorithms,
    eligibleSamplingPolicies,
    note: adoptionPass
      ? '정량 임계값을 통과한 OKLab temporal 안정화 후보를 별도 opt-in preset으로 승격했으며 기본값은 유지한다.'
      : requiredReviewFailed
      ? '독립 Sol xhigh 검토가 승격 조합의 수용 기준 위반을 확인해 opt-in preset 채택을 거부했다.'
      : hasEligibleCandidate
      ? '정량 임계값을 통과한 후보가 있으나 별도 승인 전 기본값·preset으로 승격하지 않는다.'
      : '알고리즘과 sampling 후보 모두 채택 임계값을 통과하지 못해 기본값·preset 승격을 보류한다.'
  },
  pending
};
fs.writeFileSync(path.resolve(evidenceDir, 'palette-matrix.json'), `${JSON.stringify({ matrix, samplingMatrix }, null, 2)}\n`);
fs.writeFileSync(path.resolve(evidenceDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);

const readme = `# PAL-002 검증 증거 및 A/B 보고서

검증 시각: ${summary.generatedAt}  
상태: \`${status}\`

## 완료 게이트

| 게이트 | 결과 |
|---|---|
| 8/16/32/64색 × 4 fixture × 3 algorithm | ${automatedPass ? 'PASS' : 'PENDING'} |
| 결정성·50,000 sample 상한 | ${automatedPass ? 'PASS' : 'PENDING'} |
| sampling+palette generation 전체 runtime 계측 | ${runtimeBreakdownPass ? 'PASS' : 'PENDING'} |
| 실제 대형 배경·소형 캐릭터 sampling 분기 | ${samplingCorpusPass ? 'PASS' : 'PENDING'} |
| localhost desktop/mobile·reference 오류·settings | ${browserQaPass ? 'PASS' : 'PENDING'} |
| 실제 JPEG parser·decoder·SHA-256 캡처 무결성 | ${capturesPass ? 'PASS' : 'PENDING'} |
| 라벨 제거·순서 무작위 blind 기록 | ${blindEvidencePass ? 'PASS' : 'PENDING'} |
| 5 fixture군 × 8/16/32/64 actual-size 수동 matrix | ${manualMatrixEvidence.pass ? 'PASS' : 'PENDING'} |
| 기본 hash·기본값 유지 및 opt-in preset 승격 범위 제한 | ${defaultAndPresetPass && baselineHashPass ? 'PASS' : 'PENDING'} |
| 독립 Sol xhigh 검토 | ${requiredReviewPass ? 'PASS' : qa?.requiredReview?.result || 'PENDING'} |

## 알고리즘 요약

| 후보 | 평균 OKLab error 변화 | runtime 배율 | feature 변화 | temporal 변화 | 자동 지표상 승격 검토 가능 |
|---|---:|---:|---:|---:|---|
${algorithmSummary.map(row => `| ${row.algorithm} | ${formatPercent(row.improvementPercent)} | ${row.runtimeRatio}× | ${formatPercent(row.featureChangePercent)} | ${formatPercent(row.temporalChangePercent)} | ${row.eligibleByAutomatedMetrics ? '예' : '아니오'} |`).join('\n')}

## 샘플링 요약

| 후보 | 평균 OKLab error 개선 | runtime 배율 | 작은 character feature 변화 | animation temporal 변화 | 자동 지표상 승격 검토 가능 |
|---|---:|---:|---:|---:|---|
${samplingSummary.map(row => `| ${row.sampling}${row.reference ? ` (${row.reference})` : ''} | ${formatPercent(row.improvementPercent)} | ${row.runtimeRatio}× | ${formatPercent(row.featureChangePercent)} | ${formatPercent(row.temporalChangePercent)} | ${row.eligibleByAutomatedMetrics ? '예' : '아니오'} |`).join('\n')}

정량 지표를 통과한 후보만 승인된 별도 opt-in preset으로 승격하며 기본값과 다른 일반 preset은 유지한다.

## 브라우저 증거

${PAL002_REQUIRED_CAPTURES.map(name => captureEvidence[name] ? `- [${name}](${name}) — ${captureEvidence[name].width}×${captureEvidence[name].height}, ${captureEvidence[name].decoder}, SHA-256 \`${captureEvidence[name].sha256}\`` : `- ${name} — PENDING`).join('\n')}

## Actual-size 수동 matrix

- [브라우저 1× A/B 페이지](browser-manual-matrix.html)
- [20-cell·240-asset manifest](browser-manual-matrix.json) — SHA-256 \`${manualMatrixEvidence.manifestSha256 || 'PENDING'}\`
${(qa?.actualSizeMatrix?.representativeCaptures || []).map(name => `- [${name}](${name}) — SHA-256 \`${qa?.actualSizeMatrix?.captureSha256?.[name] || 'PENDING'}\``).join('\n')}

## 독립 검토

${qa?.requiredReview?.report ? `- [Sol xhigh 독립 검토](${qa.requiredReview.report}) — ${qa.requiredReview.result}, SHA-256 \`${qa.requiredReview.reportSha256}\`` : '- PENDING'}

## 재현 명령

- \`node scripts/palette-algorithm-check.mjs\`
- \`node scripts/pal002-ui-check.mjs\`
- \`node scripts/pal002-evidence-gate-check.mjs\`
- \`node scripts/generate-pal002-browser-matrix.mjs\`
- \`node scripts/generate-pal002-evidence.mjs\`
- \`node scripts/visual-quality-check.mjs\`
- \`node scripts/security-check.mjs\`

## 남은 완료 조건

${pending.length ? pending.map(item => `- ${item}`).join('\n') : '- 없음'}
`;
fs.writeFileSync(path.resolve(evidenceDir, 'README.md'), readme);
console.log(`PAL-002 evidence generated: status=${status} matrix=${matrix.length} browser=${browserQaPass}`);
