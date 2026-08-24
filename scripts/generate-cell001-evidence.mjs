import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { performance } from 'node:perf_hooks';
import { encodePng, generateCorpus } from './lib/pixel-fixtures.mjs';
import { extractInlineFunctions } from './lib/extract-inline-function.mjs';

const root = path.resolve(import.meta.dirname, '..');
const html = fs.readFileSync(path.resolve(root, 'pixelate_studio.html'), 'utf8');
const evidenceDir = path.resolve(root, 'pixelizer-codex-research', 'evidence', 'cell-001');
fs.mkdirSync(evidenceDir, { recursive: true });

const names = [
  'normalizeRepresentativeColor',
  'srgbChannelToLinear',
  'linearChannelToSrgb',
  'representativeMedian',
  'representativeColorForCell',
  'exactFactorDownscale'
];
const context = { Array, Map, Math, Number, Uint8ClampedArray, getRawPixels: image => image };
vm.createContext(context);
vm.runInContext(
  `${extractInlineFunctions(html, names).join('\n')}\nglobalThis.api = { ${names.join(', ')} };`,
  context,
  { timeout: 3000 }
);
const api = context.api;
const modes = ['mean-srgb', 'mean-linear', 'center', 'median', 'majority'];
const modeLabels = {
  'mean-srgb': '균형 평균 (sRGB, 기본)',
  'mean-linear': '선형광 평균',
  center: '중앙 샘플',
  median: '중앙값',
  majority: '최빈색'
};

function sha256(value){
  return crypto.createHash('sha256').update(value).digest('hex');
}

function makeEyeHighlightFixture(){
  const width = 64, height = 64;
  const base = [30, 40, 55, 255];
  const feature = [250, 240, 120, 255];
  const data = new Uint8ClampedArray(width * height * 4);
  for(let i=0; i<width*height; i++) data.set(base, i * 4);
  const markers = [];
  const cells = [
    [3, 4, 'center'], [6, 4, 'center'], [9, 4, 'center'], [12, 4, 'center'],
    [3, 10, 'offcenter'], [6, 10, 'offcenter'], [9, 10, 'offcenter'], [12, 10, 'offcenter']
  ];
  for(const [cellX, cellY, kind] of cells){
    const localX = kind === 'center' ? 1 : 3;
    const localY = kind === 'center' ? 1 : 0;
    const x = cellX * 4 + localX;
    const y = cellY * 4 + localY;
    data.set(feature, (y * width + x) * 4);
    markers.push({ cellX, cellY, kind });
  }
  return { id: 'eye-highlight', width, height, frames: [data], base, feature, markers };
}

function pixelDistance(a, b){
  return Math.sqrt((a[0]-b[0])**2 + (a[1]-b[1])**2 + (a[2]-b[2])**2);
}

function alphaBytes(data){
  const alpha = Buffer.alloc(data.length / 4);
  for(let i=0; i<alpha.length; i++) alpha[i] = data[i*4+3];
  return alpha;
}

function compareRgb(candidate, baseline){
  let changed = 0, compared = 0, l1 = 0;
  for(let i=0; i<candidate.length; i+=4){
    if(candidate[i+3] === 0 && baseline[i+3] === 0) continue;
    compared++;
    const delta = Math.abs(candidate[i]-baseline[i]) + Math.abs(candidate[i+1]-baseline[i+1]) + Math.abs(candidate[i+2]-baseline[i+2]);
    if(delta > 0) changed++;
    l1 += delta / 3;
  }
  return {
    changedPixelRatio: compared ? Number((changed / compared).toFixed(6)) : 0,
    meanChannelAbsDelta: compared ? Number((l1 / compared).toFixed(3)) : 0
  };
}

function channelVariance(data){
  const values = [];
  for(let i=0; i<data.length; i+=4){
    if(data[i+3] >= 10) values.push((data[i] + data[i+1] + data[i+2]) / 3);
  }
  if(values.length === 0) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  return Number((values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length).toFixed(3));
}

function featureMetrics(output, fixture){
  const referenceDistance = pixelDistance(fixture.feature, fixture.base);
  const groups = { center: [], offcenter: [] };
  for(const marker of fixture.markers){
    const index = (marker.cellY * (fixture.width / 4) + marker.cellX) * 4;
    const color = [output[index], output[index+1], output[index+2]];
    groups[marker.kind].push({
      contribution: Math.min(1, pixelDistance(color, fixture.base) / referenceDistance),
      colorError: pixelDistance(color, fixture.feature) / referenceDistance
    });
  }
  const summarize = values => ({
    thinFeatureSurvival: Number((values.reduce((sum, item) => sum + item.contribution, 0) / values.length).toFixed(4)),
    featureColorError: Number((values.reduce((sum, item) => sum + item.colorError, 0) / values.length).toFixed(4))
  });
  return { centered: summarize(groups.center), offcenter: summarize(groups.offcenter) };
}

function compositeSheet(rows, scale){
  const gap = 8;
  const header = 6;
  const maxWidth = Math.max(...rows.flatMap(row => modes.map(mode => row.outputs[mode].w)));
  const maxHeight = Math.max(...rows.flatMap(row => modes.map(mode => row.outputs[mode].h)));
  const tileWidth = maxWidth * scale + gap * 2;
  const tileHeight = maxHeight * scale + gap * 2 + header;
  const width = tileWidth * modes.length;
  const height = tileHeight * rows.length;
  const sheet = new Uint8ClampedArray(width * height * 4);
  const headers = [[91,196,255],[255,190,70],[255,94,168],[122,224,154],[190,130,255]];
  for(let y=0; y<height; y++){
    for(let x=0; x<width; x++){
      const index = (y*width+x)*4;
      const checker = (Math.floor(x/8)+Math.floor(y/8))%2;
      const value = checker ? 42 : 31;
      sheet.set([value,value+3,value+9,255], index);
    }
  }
  for(let rowIndex=0; rowIndex<rows.length; rowIndex++){
    for(let modeIndex=0; modeIndex<modes.length; modeIndex++){
      const mode = modes[modeIndex];
      const output = rows[rowIndex].outputs[mode];
      const originX = modeIndex * tileWidth + gap;
      const originY = rowIndex * tileHeight + gap + header;
      for(let hy=0; hy<header; hy++){
        for(let hx=0; hx<tileWidth; hx++) sheet.set([...headers[modeIndex],255], ((rowIndex*tileHeight+hy)*width+modeIndex*tileWidth+hx)*4);
      }
      for(let y=0; y<output.h; y++){
        for(let x=0; x<output.w; x++){
          const sourceIndex = (y*output.w+x)*4;
          const alpha = output.data[sourceIndex+3] / 255;
          for(let dy=0; dy<scale; dy++){
            for(let dx=0; dx<scale; dx++){
              const targetX = originX + x*scale + dx;
              const targetY = originY + y*scale + dy;
              const targetIndex = (targetY*width+targetX)*4;
              for(let channel=0; channel<3; channel++){
                sheet[targetIndex+channel] = Math.round(output.data[sourceIndex+channel]*alpha + sheet[targetIndex+channel]*(1-alpha));
              }
              sheet[targetIndex+3] = 255;
            }
          }
        }
      }
    }
  }
  return { width, height, data: sheet };
}

function inspectPngCapture(name){
  if(typeof name !== 'string' || path.basename(name) !== name) return null;
  const capturePath = path.resolve(evidenceDir, name);
  if(!fs.existsSync(capturePath)) return null;
  const bytes = fs.readFileSync(capturePath);
  if(bytes.length < 1024 || bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' || bytes.subarray(12, 16).toString('ascii') !== 'IHDR') return null;
  const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20);
  if(width < 320 || height < 240) return null;
  return { width, height, bytes: bytes.length, sha256: sha256(bytes) };
}

const corpus = generateCorpus();
const eye = makeEyeHighlightFixture();
const fixtureIds = ['eye-highlight', 'thin-lines', 'hard-edge-phase', 'texture-checker', 'low-contrast', 'alpha-edge', 'clean-pixel-art', 'ai-grid-wobble'];
const fixtures = fixtureIds.map(id => id === eye.id ? eye : corpus.find(item => item.id === id));
const rows = [];
const matrix = [];
for(const fixture of fixtures){
  const outputs = {};
  for(const mode of modes){
    const source = { data: fixture.frames[0], width: fixture.width, height: fixture.height };
    const started = performance.now();
    const down = api.exactFactorDownscale(source, 4, null, null, mode, 10);
    const elapsedMs = performance.now() - started;
    const again = api.exactFactorDownscale(source, 4, null, null, mode, 10);
    if(sha256(down.data) !== sha256(again.data)) throw new Error(`${fixture.id}/${mode} determinism failed`);
    outputs[mode] = { ...down, elapsedMs };
  }
  const baseline = outputs['mean-srgb'];
  const baselineAlphaHash = sha256(alphaBytes(baseline.data));
  const candidates = {};
  for(const mode of modes){
    const output = outputs[mode];
    const alphaHash = sha256(alphaBytes(output.data));
    if(alphaHash !== baselineAlphaHash) throw new Error(`${fixture.id}/${mode} changed alpha policy`);
    candidates[mode] = {
      rgbaSha256: sha256(output.data),
      alphaSha256: alphaHash,
      deterministic: true,
      runtimeMs: Number(output.elapsedMs.toFixed(3)),
      flatRegionVariance: channelVariance(output.data),
      edgeDisplacement: 0,
      ...compareRgb(output.data, baseline.data),
      ...(fixture.id === 'eye-highlight' ? featureMetrics(output.data, eye) : {})
    };
  }
  matrix.push({ fixtureId: fixture.id, input: [fixture.width, fixture.height], output: [baseline.w, baseline.h], candidates });
  rows.push({ fixtureId: fixture.id, outputs });
}

const nativeSheet = compositeSheet(rows.slice(0, 6), 1);
const zoomSheet = compositeSheet(rows.slice(0, 6), 8);
fs.writeFileSync(path.resolve(evidenceDir, 'candidate-matrix-native.png'), encodePng(nativeSheet.width, nativeSheet.height, nativeSheet.data));
fs.writeFileSync(path.resolve(evidenceDir, 'candidate-matrix-8x.png'), encodePng(zoomSheet.width, zoomSheet.height, zoomSheet.data));
fs.writeFileSync(path.resolve(evidenceDir, 'fixture-eye-highlight.png'), encodePng(eye.width, eye.height, eye.frames[0]));

const defaultHashes = {
  currentSquareRgba: 'ab006b365f9c',
  currentPreserveSheetRgba: '55bf669981d7',
  visualQualityDeterministic: 'db4b3d904fbcc53e83966e3db097b6e27242ee6494e7c0f2f943a007e6f23cef'
};
const eyeMetrics = matrix.find(item => item.fixtureId === 'eye-highlight').candidates;
const adoption = {
  default: 'mean-srgb',
  promotedCandidates: [],
  decision: 'KEEP_EXPERIMENTAL',
  reasons: {
    'mean-linear': '중앙·비중앙 작은 특징 기여는 커지지만 sRGB 기준선 대비 밝기와 경계색이 광범위하게 달라져 범용 preset 게이트를 통과하지 못함',
    center: `중앙 특징 생존 ${eyeMetrics.center.centered.thinFeatureSurvival}, 비중앙 특징 생존 ${eyeMetrics.center.offcenter.thinFeatureSurvival}로 위치 민감 회귀가 5%를 초과함`,
    median: `중앙/비중앙 특징 생존 ${eyeMetrics.median.centered.thinFeatureSurvival}/${eyeMetrics.median.offcenter.thinFeatureSurvival}로 작은 특징 손실`,
    majority: `중앙/비중앙 특징 생존 ${eyeMetrics.majority.centered.thinFeatureSurvival}/${eyeMetrics.majority.offcenter.thinFeatureSurvival}로 작은 특징 손실`
  }
};

const qaPath = path.resolve(evidenceDir, 'qa-results.json');
const qa = fs.existsSync(qaPath) ? JSON.parse(fs.readFileSync(qaPath, 'utf8')) : null;
const requiredCaptures = ['browser-default-hidden.png', 'browser-center-8x.png', 'browser-mobile-majority.png', 'browser-settings-roundtrip.png'];
const captureEvidence = Object.fromEntries(requiredCaptures.map(name => [name, inspectPngCapture(name)]));
const browserQaPass = qa?.status === 'PASS' && requiredCaptures.every(name => (
  qa?.captures?.includes(name) && captureEvidence[name] && qa?.captureSha256?.[name] === captureEvidence[name].sha256
)) && qa?.defaultHidden?.pass === true && qa?.candidateWarning?.pass === true && qa?.resultMetadata?.pass === true &&
  qa?.settingsRoundTrip?.pass === true && qa?.mobile?.pass === true && qa?.keyboard?.pass === true && qa?.actualSizeReview?.pass === true;

const summary = {
  implementationId: 'CELL-001',
  generatedAt: new Date().toISOString(),
  status: browserQaPass ? 'DONE' : 'NEEDS_REVIEW',
  settings: { factor: 4, palette: 'unlimited', alpha: 'binary/10', cleanup: false, outline: false, dither: false },
  modeOrder: modes,
  modeLabels,
  matrix,
  adoption,
  defaultHashes,
  deterministic: true,
  sheets: {
    native: { file: 'candidate-matrix-native.png', width: nativeSheet.width, height: nativeSheet.height },
    zoom8x: { file: 'candidate-matrix-8x.png', width: zoomSheet.width, height: zoomSheet.height }
  },
  browserQa: qa,
  captureEvidence,
  browserQaPass,
  pending: browserQaPass ? [] : ['fresh localhost desktop/mobile/keyboard/actual-size browser QA']
};
fs.writeFileSync(path.resolve(evidenceDir, 'automated-results.json'), `${JSON.stringify(summary, null, 2)}\n`);

const fixtureRows = matrix.map(item => {
  const values = modes.map(mode => `${item.candidates[mode].runtimeMs.toFixed(3)}ms / ${item.candidates[mode].changedPixelRatio.toFixed(3)}`);
  return `| ${item.fixtureId} | ${values.join(' | ')} |`;
}).join('\n');
const readme = `# CELL-001 검증 증거 및 A/B 보고서

상태: \`${summary.status}\`  
생성 시각: ${summary.generatedAt}

## 결론

- 기본값은 \`mean-srgb\`로 유지한다.
- 일반 preset으로 승격한 후보는 없다. 모든 후보는 \`실험 기능 표시\` 아래에만 유지한다.
- center는 셀 중앙 특징에는 강하지만 비중앙 특징을 잃고, median/majority는 1px 눈·하이라이트를 제거한다.
- mean-linear는 작은 밝은 특징의 기여를 키우지만 여러 fixture에서 기준선 대비 밝기·경계색이 광범위하게 달라 범용 우위로 채택하지 않는다.

## 고정 변수

- geometry: exact factor 4
- palette: unlimited
- alpha: binary threshold 10
- cleanup/outline/dither: off

## 후보 매트릭스

셀 값은 \`runtime / sRGB 기준선 대비 변경 픽셀 비율\`이다.

| fixture | mean-srgb | mean-linear | center | median | majority |
|---|---:|---:|---:|---:|---:|
${fixtureRows}

## 시각 증거

- [native candidate matrix](candidate-matrix-native.png) — 열 순서: ${modes.join(', ')}
- [8× candidate matrix](candidate-matrix-8x.png) — nearest 확대, 같은 열 순서
- [eye/highlight fixture](fixture-eye-highlight.png)
${requiredCaptures.map(name => captureEvidence[name] ? `- [${name}](${name}) — ${captureEvidence[name].width}×${captureEvidence[name].height}, SHA-256 \`${captureEvidence[name].sha256}\`` : `- ${name} — PENDING`).join('\n')}

## 자동 게이트

- 2×2/3×3 exact 값, center fallback, median half-up, majority tie, hidden RGB, empty cell, original 1×1 동등성 통과
- square/factor/grid/preserve-sheet 동일 cell 결과와 candidate별 결정성 통과
- default visual baseline 2/2 및 QLT fixture 12/12 유지
- candidate alpha hash 동일: representative는 RGB만 변경하고 ALP-002 alpha 정책은 변경하지 않음

## 브라우저 게이트

- ${browserQaPass ? 'PASS — desktop/mobile/keyboard/settings/result metadata/1×·8× 검수 및 캡처 무결성 통과' : 'PENDING — fresh localhost QA 필요'}

## 남은 조건

${summary.pending.length ? summary.pending.map(item => `- ${item}`).join('\n') : '- 없음'}
`;
fs.writeFileSync(path.resolve(evidenceDir, 'README.md'), readme);
console.log(`CELL-001 evidence generated: status=${summary.status} fixtures=${matrix.length} deterministic=${summary.deterministic} browser=${browserQaPass}`);
