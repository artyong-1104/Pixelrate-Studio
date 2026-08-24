import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import vm from 'node:vm';
import { extractInlineFunctions } from './lib/extract-inline-function.mjs';

const root = path.resolve(import.meta.dirname, '..');
const evidenceDir = path.resolve(root, 'pixelizer-codex-research', 'evidence', 'ani-001');
const qaPath = path.resolve(evidenceDir, 'qa-results.json');
fs.mkdirSync(evidenceDir, { recursive: true });

const html = fs.readFileSync(path.resolve(root, 'pixelate_studio.html'), 'utf8');
const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(extractInlineFunctions(html, [
  'compareAnimationFrameOrder',
  'getMultiFileAnimationFrames',
  'getSheetAnimationFrames',
  'getAnimSourceWarningText',
  'findAnimSourceResult',
  'getAnimDitherStatus',
  'evaluateAnimPolicy'
]).join('\n'), sandbox);

const multiResults = [
  { name: 'walk_03.png', addedIndex: 2, canvas: { width: 32, height: 32 }, jsonData: { processing: { mode: 'factor', palette: { mode: 'auto', shared: true } } } },
  { name: 'walk_01.png', addedIndex: 0, canvas: { width: 24, height: 28 }, jsonData: { processing: { mode: 'factor', palette: { mode: 'auto', shared: true } } } },
  { name: 'walk_02.png', addedIndex: 1, canvas: { width: 32, height: 32 }, jsonData: { processing: { mode: 'factor', palette: { mode: 'auto', shared: true } } } }
];
const sheetResult = {
  name: 'character_run_sheet.png',
  canvas: { width: 128, height: 64 },
  jsonData: { processing: { mode: 'preserve-sheet', frameWidth: 32, frameHeight: 32, palette: { mode: 'custom' } } }
};
const multi = sandbox.getMultiFileAnimationFrames(multiResults);
const sheet = sandbox.getSheetAnimationFrames(sheetResult);
const multiPolicy = sandbox.evaluateAnimPolicy(multi, multiResults);
const sheetPolicy = sandbox.evaluateAnimPolicy(sheet, [sheetResult]);
const inlineScript = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
  .map(match => match[1])
  .find(source => source.trim());
const cspHash = crypto.createHash('sha256').update(inlineScript).digest('base64');

let qa = null;
if (fs.existsSync(qaPath)) {
  qa = JSON.parse(fs.readFileSync(qaPath, 'utf8'));
}
const manualChecks = {
  desktopLayout: qa?.desktop?.layoutPass === true,
  mobileLayout: qa?.mobile?.layoutPass === true,
  focusAndKeyboard: qa?.accessibility?.focusTrapPass === true && qa?.accessibility?.focusRestorePass === true && qa?.keyboard?.pass === true,
  sheetPlayback: qa?.sheet?.pass === true,
  reducedMotion: qa?.reducedMotion?.pass === true,
  lifecycleCleanup: qa?.lifecycle?.closeCleanupPass === true && qa?.lifecycle?.hiddenCleanupPass === true,
  tenMinuteLoop: Number(qa?.tenMinuteLoop?.durationMs) >= 600000 && qa?.tenMinuteLoop?.canvasCountStable === true && qa?.tenMinuteLoop?.modalCanvasCountStable === true,
  captures: Array.isArray(qa?.visualCaptures) && qa.visualCaptures.length >= 2,
  repairRegression: qa?.repairRegression?.oversizedSheetControlsPass === true
    && qa?.repairRegression?.sameNamePolicyPass === true
    && qa?.repairRegression?.disabledShortcutPass === true
    && qa?.repairRegression?.normalPlaybackPass === true
    && qa?.repairRegression?.mixedReasonPass === true
    && qa?.repairRegression?.mixedDisabledOptionIncludesReason === true
    && qa?.repairRegression?.mixedKeyboardPass === true
    && qa?.repairRegression?.mixedNormalSheetPlaybackPass === true
    && qa?.repairRegression?.mixedNoticePersistsOnNormalSheet === true
    && qa?.repairRegression?.consoleErrorCount === 0,
  requiredReview: qa?.requiredReview?.model === 'Sol xhigh' && qa?.requiredReview?.result === 'PASS'
};
const status = Object.values(manualChecks).every(Boolean) ? 'DONE' : 'NEEDS_REVIEW';
const manualCheckResult = (name, pass) => {
  if (name === 'requiredReview' && qa?.requiredReview?.result === 'FAIL') return 'FAIL';
  return pass ? 'PASS' : 'PENDING';
};

const summary = {
  specId: 'ANI-001',
  title: '다중 파일·시트 프레임 애니메이션 검수',
  status,
  generatedAt: new Date().toISOString(),
  automatedChecks: {
    implementationFunctionsExecuted: true,
    command: 'node scripts/animation-check.mjs',
    uiCommand: 'node scripts/ani001-ui-check.mjs',
    cspSha256: cspHash
  },
  extractedResults: {
    multiFile: {
      sortedFrameNames: multi.frames.map(frame => frame.name),
      viewport: { width: multi.viewportW, height: multi.viewportH },
      offsets: multi.frames.map(frame => ({ name: frame.name, x: frame.offsetX, y: frame.offsetY })),
      policy: multiPolicy
    },
    sheet: {
      frameCount: sheet.frames.length,
      viewport: { width: sheet.viewportW, height: sheet.viewportH },
      firstCoordinates: sheet.frames.slice(0, 4).map(frame => ({ index: frame.index, srcX: frame.srcX, srcY: frame.srcY })),
      policy: sheetPolicy
    }
  },
  manualChecks,
  qa
};

fs.writeFileSync(path.resolve(evidenceDir, 'summary.json'), JSON.stringify(summary, null, 2) + '\n', 'utf8');

const missing = Object.entries(manualChecks).filter(([, pass]) => !pass).map(([name]) => `\`${name}\``);
const report = `# ANI-001 검증 증거 보고서

- **항목 ID:** \`ANI-001\`
- **상태:** \`${status}\`
- **생성 시각:** ${summary.generatedAt}
- **CSP SHA-256:** \`${cspHash}\`

이 보고서는 \`pixelate_studio.html\`에서 추출해 실행한 실제 함수 결과와 \`qa-results.json\`의 브라우저 측정값만 집계한다. 측정되지 않은 항목을 통과로 간주하지 않는다.

## 자동 검사

- \`node scripts/animation-check.mjs\`: 실제 정렬·시트 분할·FPS accumulator·loop 종료·cleanup·정책 판정 함수 실행
- \`node scripts/ani001-ui-check.mjs\`: dialog semantics, focus 이동/복귀·trap, 텍스트 버튼 레이아웃 class, lifecycle 연결 검사
- multi-file 순서: ${multi.frames.map(frame => `\`${frame.name}\``).join(' → ')}
- sheet row-major 앞 4개: ${sheet.frames.slice(0, 4).map(frame => `#${frame.index + 1}(${frame.srcX},${frame.srcY})`).join(', ')}
- metadata 없는 디더링 판정: \`${multiPolicy.ditherStatus.label}\`

## 브라우저·장시간 QA 게이트

${Object.entries(manualChecks).map(([name, pass]) => `- ${manualCheckResult(name, pass)} — \`${name}\``).join('\n')}

${missing.length ? `남은 게이트: ${missing.join(', ')}. 전부 통과하기 전에는 ANI-001을 \`DONE\`으로 표시하지 않는다.` : '모든 게이트가 통과했다.'}

## 독립 검토

- 모델: \`${qa?.requiredReview?.model || '미실행'}\`
- 판정: \`${qa?.requiredReview?.result || 'PENDING'}\`
${qa?.requiredReview?.report ? `- 보고서: [${qa.requiredReview.report}](${qa.requiredReview.report})` : ''}
`;
fs.writeFileSync(path.resolve(evidenceDir, 'README.md'), report, 'utf8');
console.log(`ANI-001 evidence generated with status ${status}.`);
