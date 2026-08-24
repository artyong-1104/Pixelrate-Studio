import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { extractInlineFunctions } from './lib/extract-inline-function.mjs';
import {
  ALP002_REQUIRED_CAPTURES,
  evaluateAlp002CaptureEvidence
} from './lib/alp002-evidence-gate.mjs';

const root = path.resolve(import.meta.dirname, '..');
const evidenceDir = path.resolve(root, 'pixelizer-codex-research', 'evidence', 'alp-002');
const html = fs.readFileSync(path.resolve(root, 'pixelate_studio.html'), 'utf8');
fs.mkdirSync(evidenceDir, { recursive: true });

const TARGET_FUNCTIONS = [
  'kmeans',
  'collectOpaquePoints',
  'uniqueColors',
  'cleanIsolated',
  'cleanPreserveSheet',
  'outlinePreserveSheet',
  'resolveOutputAlpha',
  'buildCoverageAlphaMatrix',
  'buildAlphaPolicyArtifacts',
  'estimateCoverageAlphaMatrixJsonBytes',
  'getJsonByteLength',
  'getResultLogStorageIssue'
];
const context = {
  Array,
  Math,
  Map,
  Number,
  Object,
  Set,
  String,
  TextEncoder,
  Uint8ClampedArray,
  parseInt,
  MAX_PALETTE_SAMPLES: 50000,
  MAX_STORED_ALPHA_MATRIX_BYTES: 16 * 1024 * 1024,
  MAX_STORED_RESULT_JSON_BYTES: 32 * 1024 * 1024
};
vm.createContext(context);
vm.runInContext(
  `${extractInlineFunctions(html, TARGET_FUNCTIONS).join('\n')}\nglobalThis.__api = { ${TARGET_FUNCTIONS.join(', ')} };`,
  context,
  { timeout: 3000 }
);
const api = context.__api;

function hashJson(value){
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function countTopology(renderedAlpha, width, height, threshold){
  const offsets = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const countRegions = (mask, holesOnly) => {
    const visited = new Uint8Array(mask.length);
    let count = 0;
    for(let start=0; start<mask.length; start++){
      if(!mask[start] || visited[start]) continue;
      const queue = [start];
      visited[start] = 1;
      let touchesEdge = false;
      while(queue.length){
        const index = queue.pop();
        const x = index % width;
        const y = Math.floor(index / width);
        if(x === 0 || y === 0 || x === width - 1 || y === height - 1) touchesEdge = true;
        for(const [dx, dy] of offsets){
          const nx = x + dx;
          const ny = y + dy;
          if(nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
          const next = ny*width+nx;
          if(mask[next] && !visited[next]){
            visited[next] = 1;
            queue.push(next);
          }
        }
      }
      if(!holesOnly || !touchesEdge) count++;
    }
    return count;
  };
  const foreground = renderedAlpha.map(value => value >= threshold);
  return {
    components: countRegions(foreground, false),
    holes: countRegions(foreground.map(value => !value), true)
  };
}

const topologyWidth = 7;
const topologyHeight = 7;
const topologyPalette = [[40, 160, 220]];
const topologyGrid = [];
const topologyAlpha = [];
for(let y=0; y<topologyHeight; y++){
  for(let x=0; x<topologyWidth; x++){
    const ring = x >= 1 && x <= 5 && y >= 1 && y <= 5 && (x === 1 || x === 5 || y === 1 || y === 5);
    topologyGrid.push(ring ? 0 : -1);
    topologyAlpha.push(ring ? ((x+y)%3 === 0 ? 10 : (x+y)%3 === 1 ? 127 : 255) : 0);
  }
}
const binaryArtifacts = api.buildAlphaPolicyArtifacts(
  topologyGrid, topologyAlpha, topologyWidth, topologyHeight, 'binary', 10
);
const binaryArtifactsAgain = api.buildAlphaPolicyArtifacts(
  topologyGrid, topologyAlpha, topologyWidth, topologyHeight, 'binary', 10
);
const coverageArtifacts = api.buildAlphaPolicyArtifacts(
  topologyGrid, topologyAlpha, topologyWidth, topologyHeight, 'coverage', 10
);
const binaryRgba = [];
for(let index=0; index<topologyGrid.length; index++){
  const outputAlpha = binaryArtifacts.renderedAlpha[index];
  const color = topologyGrid[index] >= 0 ? topologyPalette[topologyGrid[index]] : [0, 0, 0];
  binaryRgba.push(
    outputAlpha ? color[0] : 0,
    outputAlpha ? color[1] : 0,
    outputAlpha ? color[2] : 0,
    outputAlpha
  );
}
const legacyProjection = {
  width: topologyWidth,
  height: topologyHeight,
  palette: Object.fromEntries(topologyPalette.map((value, index) => [index, value])),
  grid: Array.from(
    { length: topologyHeight },
    (_, y) => topologyGrid.slice(y*topologyWidth, (y+1)*topologyWidth)
  )
};
const topologyEvidence = {
  binary: countTopology(binaryArtifacts.renderedAlpha, topologyWidth, topologyHeight, 10),
  coverage: countTopology(coverageArtifacts.renderedAlpha, topologyWidth, topologyHeight, 10),
  coverageMatrixMatchesPngAlpha: JSON.stringify(coverageArtifacts.alphaMatrix.flat()) ===
    JSON.stringify(coverageArtifacts.renderedAlpha),
  binaryRgbaSha256: hashJson(binaryRgba),
  legacyProjectionSha256: hashJson(legacyProjection),
  deterministicSha256: hashJson(binaryArtifacts.renderedAlpha)
};

const boundaryData = new Uint8ClampedArray([
  255, 0, 0, 0,
  0, 255, 0, 9,
  0, 0, 255, 10,
  255, 255, 0, 127,
  255, 255, 255, 255
]);
const boundaryAlpha = [0, 9, 10, 127, 255];
const threshold10Colors = api.uniqueColors(boundaryData, boundaryAlpha, 5, 10);
const threshold128Colors = api.uniqueColors(boundaryData, boundaryAlpha, 5, 128);

const weightingData = new Uint8ClampedArray([
  255, 0, 0, 10,
  0, 0, 255, 255
]);
const binaryPoints = api.collectOpaquePoints(weightingData, 2, 10, 10, false);
const coveragePoints = api.collectOpaquePoints(weightingData, 2, 10, 10, true);
const binaryCenter = api.kmeans(binaryPoints, 1, 1)[0];
const coverageCenter = api.kmeans(coveragePoints, 1, 1)[0];

const originalAlpha = [
  0, 20, 50, 80,
  100, 130, 160, 190,
  210, 230, 245, 255,
  0, 5, 9, 10
];
const grid = [
  -1, 0, 0, 0,
   0, 0, 0, 0,
   0, 0, 0, 0,
  -1, -1, -1, 0
];
const threshold = 10;
const binaryOutput = originalAlpha.map((alpha, index) => api.resolveOutputAlpha(grid[index], alpha, 'binary', threshold));
const coverageOutput = originalAlpha.map((alpha, index) => api.resolveOutputAlpha(grid[index], alpha, 'coverage', threshold));
const coverageMatrix = api.buildCoverageAlphaMatrix(grid, originalAlpha, 4, 4, 'coverage', threshold);
const binaryMatrix = api.buildCoverageAlphaMatrix(grid, originalAlpha, 4, 4, 'binary', threshold);

let binaryError = 0;
let coverageError = 0;
let foregroundCount = 0;
for(let index=0; index<originalAlpha.length; index++){
  if(originalAlpha[index] < threshold) continue;
  foregroundCount++;
  binaryError += Math.abs(originalAlpha[index] - binaryOutput[index]);
  coverageError += Math.abs(originalAlpha[index] - coverageOutput[index]);
}
const binaryMae = binaryError / foregroundCount;
const coverageMae = coverageError / foregroundCount;

const smallLogIssue = api.getResultLogStorageIssue([{
  name: 'small.png',
  jsonData: { width: 4, height: 4, grid: [grid.slice(0, 4)], alpha: coverageMatrix }
}]);
const fourMillionAlphaEstimate = api.estimateCoverageAlphaMatrixJsonBytes(2048, 2048);
const largeLogIssue = api.getResultLogStorageIssue([{
  name: '4m.png',
  coverageAlphaEstimatedBytes: fourMillionAlphaEstimate,
  jsonData: { width: 2048, height: 2048, alpha: [[]] }
}]);
const aggregateLogIssue = api.getResultLogStorageIssue([
  { name: 'aggregate-a.png', jsonData: { payload: 'x'.repeat(17 * 1024 * 1024) } },
  { name: 'aggregate-b.png', jsonData: { payload: 'x'.repeat(17 * 1024 * 1024) } }
]);

const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);
if(!scriptMatch) throw new Error('Inline script not found');
const cspHash = `sha256-${crypto.createHash('sha256').update(scriptMatch[1], 'utf8').digest('base64')}`;

const qaPath = path.resolve(evidenceDir, 'qa-results.json');
const qa = fs.existsSync(qaPath) ? JSON.parse(fs.readFileSync(qaPath, 'utf8')) : null;
const {
  captureEvidence,
  capturesPass,
  logRestoreCaptureName,
  logRestoreCaptureEvidence,
  logRestoreCapturePass
} = evaluateAlp002CaptureEvidence(qa, evidenceDir);

const browserQaPass = qa?.status === 'PASS' &&
  qa?.desktop?.binary10?.pass === true &&
  qa?.desktop?.coverage10?.pass === true &&
  qa?.desktop?.coverage128?.pass === true &&
  qa?.desktop?.outline?.pass === true &&
  qa?.sheet?.pass === true &&
  qa?.settingsRoundTrip?.pass === true &&
  qa?.logRestore?.pass === true &&
  logRestoreCapturePass &&
  qa?.mobile?.pass === true &&
  qa?.logSizeGate?.pass === true &&
  qa?.rereviewFixQa?.desktopModal?.pass === true &&
  qa?.rereviewFixQa?.desktopModal?.backgroundAlphaOverlap === false &&
  qa?.rereviewFixQa?.desktopModal?.alphaExpandOverlap === false &&
  qa?.rereviewFixQa?.desktopModal?.backgroundButton?.whiteSpace === 'nowrap' &&
  qa?.rereviewFixQa?.desktopModal?.backgroundButton?.width >= qa?.rereviewFixQa?.desktopModal?.backgroundButton?.scrollWidth &&
  qa?.rereviewFixQa?.desktopModal?.alphaDiagnosticsButton?.whiteSpace === 'nowrap' &&
  qa?.rereviewFixQa?.desktopModal?.alphaDiagnosticsButton?.width >= qa?.rereviewFixQa?.desktopModal?.alphaDiagnosticsButton?.scrollWidth &&
  qa?.rereviewFixQa?.outlineSheet?.pass === true &&
  qa?.rereviewFixQa?.mobile?.pass === true &&
  qa?.rereviewFixQa?.mobile?.horizontalOverflow === false &&
  qa?.rereviewFixQa?.aggregateLogSizeGate?.pass === true &&
  qa?.rereviewFixQa?.aggregateLogSizeGate?.rejectionKind === 'result-json-total' &&
  qa?.rereviewFixQa?.jpegNegativeGate?.pass === true &&
  qa?.rereviewFixQa?.jpegNegativeGate?.invalidSofSosLengthsRejected === true &&
  qa?.rereviewFixQa?.jpegNegativeGate?.nonDecodableEntropyRejected === true &&
  qa?.rereviewFixQa?.jpegNegativeGate?.decoderBacked === true &&
  qa?.rereviewFixQa?.topologyAndArtifacts?.pass === true &&
  qa?.consoleErrorCount === 0 &&
  capturesPass;

const reviewName = qa?.requiredReview?.report;
const reviewPath = typeof reviewName === 'string' && path.basename(reviewName) === reviewName
  ? path.resolve(evidenceDir, reviewName)
  : null;
const reviewText = reviewPath && fs.existsSync(reviewPath) ? fs.readFileSync(reviewPath, 'utf8') : '';
const reviewSha256 = reviewText ? crypto.createHash('sha256').update(reviewText, 'utf8').digest('hex') : null;
const requiredReviewPass = qa?.requiredReview?.model === 'Sol xhigh' &&
  qa?.requiredReview?.result === 'PASS' &&
  qa?.requiredReview?.reportSha256 === reviewSha256 &&
  /(?:^|\n)RECOMMENDATION:\s*PASS\s*(?:\n|$)/.test(reviewText) &&
  !/(?:^|\n)RECOMMENDATION:\s*CHANGES_REQUESTED\s*(?:\n|$)/.test(reviewText);

const automated = {
  boundaryPass: threshold10Colors.length === 3 && threshold128Colors.length === 1,
  paletteWeightingPass: JSON.stringify(binaryCenter) === JSON.stringify([128, 0, 128]) &&
    JSON.stringify(coverageCenter) === JSON.stringify([10, 0, 245]),
  binaryCompatibilityPass: binaryMatrix === null,
  coverageMatrixPass: JSON.stringify(coverageMatrix.flat()) === JSON.stringify(coverageOutput),
  maePass: coverageMae === 0 && coverageMae < binaryMae,
  topologyPass: topologyEvidence.binary.components === 1 && topologyEvidence.binary.holes === 1 &&
    topologyEvidence.coverage.components === 1 && topologyEvidence.coverage.holes === 1,
  productionArtifactPass: topologyEvidence.coverageMatrixMatchesPngAlpha && binaryArtifacts.alphaMatrix === null &&
    topologyEvidence.binaryRgbaSha256 === '73407d8cf02ba3d07102a8b47a134bf3ee693768a48f5a6d7f7ecf754636c8d8' &&
    topologyEvidence.legacyProjectionSha256 === '21990b6ae732f343b6dca56b97435a7f2ebca4f21daae420284f164450cb3667' &&
    topologyEvidence.deterministicSha256 === hashJson(binaryArtifactsAgain.renderedAlpha),
  logSizeGatePass: smallLogIssue === null && largeLogIssue?.kind === 'alpha-matrix' &&
    aggregateLogIssue?.kind === 'result-json-total'
};
const automatedPass = Object.values(automated).every(Boolean);
if(!automatedPass) throw new Error(`ALP-002 automated evidence failed: ${JSON.stringify(automated)}`);

const status = automatedPass && browserQaPass && requiredReviewPass ? 'DONE' : 'NEEDS_REVIEW';
const pending = [
  ...(browserQaPass ? [] : ['fresh browser QA and capture integrity']),
  ...(requiredReviewPass ? [] : ['independent Sol xhigh review'])
];
const summary = {
  specId: 'ALP-002',
  status,
  generatedAt: new Date().toISOString(),
  automated,
  evaluation: {
    boundaryTesting: {
      threshold10RetainedColors: threshold10Colors.length,
      threshold128RetainedColors: threshold128Colors.length
    },
    paletteWeighting: { binaryCenter, coverageCenter, coverageWeight: 'alpha/255' },
    maeAnalysis: {
      testedPixels: foregroundCount,
      binaryMae: Number(binaryMae.toFixed(2)),
      coverageMae: Number(coverageMae.toFixed(2))
    },
    topology: topologyEvidence,
    logSizeGate: {
      alphaMatrixLimitBytes: context.MAX_STORED_ALPHA_MATRIX_BYTES,
      resultJsonLimitBytes: context.MAX_STORED_RESULT_JSON_BYTES,
      fourMillionAlphaEstimate,
      rejectionKind: largeLogIssue?.kind || null,
      aggregateRejectionKind: aggregateLogIssue?.kind || null,
      aggregateBytes: aggregateLogIssue?.bytes || null
    }
  },
  browserQa: qa,
  evidenceIntegrity: {
    requiredCaptures: ALP002_REQUIRED_CAPTURES,
    captureEvidence,
    capturesPass,
    logRestoreCapture: {
      name: logRestoreCaptureName || null,
      evidence: logRestoreCaptureEvidence,
      pass: logRestoreCapturePass
    }
  },
  requiredReview: qa?.requiredReview || { model: 'Sol xhigh', result: 'PENDING', report: null },
  requiredReviewPass,
  csp: {
    sha256: cspHash,
    synchronizedFiles: ['pixelate_studio.html', 'SECURITY.md', 'vercel.json']
  },
  pending
};

fs.writeFileSync(path.resolve(evidenceDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
const readme = `# ALP-002 검증 증거 및 실행 보고서

검증 시각: ${summary.generatedAt}  
상태: \`${status}\` — ${status === 'DONE' ? '자동·브라우저·독립 Sol xhigh 게이트 전체 통과' : '자동 검사 통과, 완료 게이트 대기'}

## 자동 검증

| 게이트 | 결과 |
|---|---|
| threshold 0/9/10/127/255 | PASS — threshold10 3색, threshold128 1색 |
| coverage alpha-weighted palette | PASS — binary center ${binaryCenter.join('/')}, coverage center ${coverageCenter.join('/')} |
| binary 호환 | PASS — root alpha matrix 생략 |
| coverage PNG/JSON 공통 alpha helper | PASS — 4×4 matrix 일치 |
| partial-alpha MAE | PASS — binary ${binaryMae.toFixed(2)}, coverage ${coverageMae.toFixed(2)} |
| hole topology | PASS — binary/coverage component 1, hole 1 유지 |
| 운영 PNG/JSON·legacy projection | PASS — coverage matrix=PNG alpha, binary RGBA ${topologyEvidence.binaryRgbaSha256.slice(0, 12)}, legacy JSON ${topologyEvidence.legacyProjectionSha256.slice(0, 12)} |
| 로그 크기 gate | PASS — 4M alpha estimate ${fourMillionAlphaEstimate}B를 16MB에서 차단, 다중 결과 합계 ${aggregateLogIssue?.bytes || 0}B를 32MB에서 차단 |
| JPEG 캡처 gate | PASS — 구조 검사 + 실제 이미지 디코더 + 크기 + SHA-256 |
| CSP 동기화 | ${cspHash} |

## 완료 게이트

| 게이트 | 결과 |
|---|---|
| 브라우저 QA | ${browserQaPass ? 'PASS' : 'PENDING'} |
| 캡처 무결성 | ${capturesPass ? 'PASS' : 'PENDING'} |
| 로그 복원 캡처 | ${logRestoreCapturePass ? 'PASS' : 'PENDING'} |
| 독립 Sol xhigh 검토 | ${requiredReviewPass ? 'PASS' : qa?.requiredReview?.result || 'PENDING'} |

## 브라우저 증거

${ALP002_REQUIRED_CAPTURES.map(name => captureEvidence[name] ? `- [${name}](${name}) — ${captureEvidence[name].width}×${captureEvidence[name].height}, SHA-256 \`${captureEvidence[name].sha256}\`` : `- ${name} — PENDING`).join('\n')}
${logRestoreCaptureEvidence ? `- [${logRestoreCaptureName}](${logRestoreCaptureName}) — SHA-256 \`${logRestoreCaptureEvidence.sha256}\`` : '- browser-log-restore.jpg — PENDING'}

## 재현 명령

- \`node scripts/alp002-check.mjs\`
- \`node scripts/alp002-ui-check.mjs\`
- \`node scripts/generate-alp002-evidence.mjs\`
- \`node scripts/security-check.mjs\`
- \`node scripts/visual-quality-check.mjs\`

## 남은 완료 조건

${pending.length ? pending.map(item => `- ${item}`).join('\n') : '- 없음'}
`;
fs.writeFileSync(path.resolve(evidenceDir, 'README.md'), readme, 'utf8');

console.log(`ALP-002 evidence generated: status=${status} browser=${browserQaPass} review=${requiredReviewPass}`);
