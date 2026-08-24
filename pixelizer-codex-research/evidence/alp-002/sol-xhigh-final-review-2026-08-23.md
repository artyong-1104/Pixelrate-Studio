# ALP-002 독립 Sol xhigh 최종 검토

- 검토 시각: 2026-08-23T02:41:09Z
- 검토 범위: ALP-002 명세, 운영 변환 경로, 자동 검사, 증거 생성기, fresh localhost QA 기록과 JPEG 4개
- 검토 방식: 운영 코드에서 helper를 직접 추출한 재현, 전체 회귀 재실행, 원본 캡처 육안 확인
- 운영 코드·명세·QA JSON·대시보드는 수정하지 않았다.

## 판정

자동 알고리즘 검사는 통과했지만, 로그 저장 fail-closed 상한 위반, 캡처 무결성 게이트 우회, 실제 모달 UI 겹침, 명세가 요구한 topology/production JSON 증거 누락이 남아 있다. 현재 상태를 `DONE`으로 올릴 수 없다.

## Findings

### 1. HIGH — 32MB 전체 결과 JSON 상한이 결과별 검사로 구현되어 합산 초과를 허용한다

- 위치: `pixelate_studio.html:4761-4789`, `scripts/alp002-check.mjs:321-341`, `pixelizer-codex-research/evidence/alp-002/qa-results.json:105-112`
- 명세: `pixelizer-codex-research/specs/items/alp-002-alpha-policy.md:74-76`, `:130`
- 재현:

```sh
node --input-type=module - <<'EOF'
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { extractInlineFunctions } from './scripts/lib/extract-inline-function.mjs';
const html = readFileSync('./pixelate_studio.html', 'utf8');
const names = ['estimateCoverageAlphaMatrixJsonBytes', 'getJsonByteLength', 'getResultLogStorageIssue'];
const context = { Array, Number, Object, TextEncoder,
  MAX_STORED_ALPHA_MATRIX_BYTES: 16*1024*1024,
  MAX_STORED_RESULT_JSON_BYTES: 32*1024*1024 };
vm.createContext(context);
vm.runInContext(`${extractInlineFunctions(html, names).join('\n')}\nglobalThis.api={${names.join(',')}}`, context);
const mk = name => ({ name, jsonData: { width: 1, height: 1, padding: 'x'.repeat(17*1024*1024) } });
const results = [mk('a.png'), mk('b.png')];
const sizes = results.map(r => context.api.getJsonByteLength(r.jsonData));
console.log({ sizes, total: sizes.reduce((a,b) => a+b, 0), issue: context.api.getResultLogStorageIssue(results) });
EOF
```

- 실제 결과: 각 JSON은 17,825,827B로 개별 32MiB 미만이지만 합계 35,651,654B로 상한을 넘는다. `getResultLogStorageIssue`는 `null`을 반환한다.
- 영향: 여러 결과를 한 번에 처리하면 명세의 32MB 작업 로그 상한을 우회해 대형 IndexedDB transaction을 시도한다. 저장 실패·quota 압박·main-thread 직렬화 부담이 발생할 수 있고, 현재 `로그 크기 gate PASS` 증거는 이 경우를 검증하지 않는다.
- 해제 조건: 모든 `jsonData`의 UTF-8 byte 합계와 저장 envelope overhead를 누적해 32MiB를 넘기기 전에 로그 저장을 생략하고, 두 개 이상의 개별 sub-limit 결과가 합산 limit을 넘는 회귀 테스트와 다운로드 유지 테스트를 추가한다.

### 2. HIGH — JPEG 무결성 게이트가 SOI/EOI와 1KB만 검사해 실제 JPEG 구조·치수를 검증하지 않는다

- 위치: `scripts/generate-alp002-evidence.mjs:120-139`
- 재현:

```sh
node -e "const b=Buffer.alloc(1024,0); b[0]=0xff;b[1]=0xd8;b[1022]=0xff;b[1023]=0xd9; console.log(b.length>=1024&&b[0]===0xff&&b[1]===0xd8&&b.at(-2)===0xff&&b.at(-1)===0xd9)"
```

- 실제 결과: JPEG SOF segment·width·height·scan data가 전혀 없는 1,024B payload가 `true`로 판정된다.
- 영향: 같은 payload의 SHA-256을 QA JSON에 기록하면 `capturesPass`와 `browserQaPass`가 통과할 수 있다. 증거 생성기가 주장하는 `캡처 무결성 PASS`가 실제 브라우저 화면 증거를 fail-closed로 보장하지 못한다.
- 현재 파일 확인: `file pixelizer-codex-research/evidence/alp-002/*.jpg`는 3개를 1272×716, 모바일 1개를 382×827의 정상 JFIF JPEG로 식별했고, 네 파일을 원본 크기로 직접 열어 확인했다. 즉 현재 파일 자체는 정상이나 게이트가 우회 가능하다.
- 해제 조건: JPEG marker를 파싱해 SOF 기반 width/height와 정상 segment 경계를 검증하거나 신뢰 가능한 decoder로 decode하고, 최소 치수·예상 desktop/mobile 치수를 summary에 기록한다. SOI/EOI-only, truncated JPEG, 1×1 JPEG, 해시 불일치 negative test를 추가한다.

### 3. MEDIUM — 데스크톱 결과 모달의 `배경 (B)`와 `알파 진단` 텍스트가 32px 버튼 안에서 세로 줄바꿈되어 서로 겹친다

- 위치: `pixelate_studio.html:618-622`, `:1391-1392`
- 증거: `pixelizer-codex-research/evidence/alp-002/browser-coverage-threshold10.jpg`, `browser-outline-sheet.jpg`
- 재현: 두 데스크톱 캡처를 원본 크기로 열면 모달 하단의 `배경 (B)`와 `알파 진단`이 글자 단위로 세로 배치되고 인접 컨트롤과 겹친다. 두 버튼 모두 icon 전용 `.modal-view-reset { width:32px; height:28px; }`를 사용한다.
- 영향: 배경 전환과 ALP 진단이라는 수동 QA 핵심 컨트롤의 visible label을 읽을 수 없고 hit target 주변이 시각적으로 충돌한다. 명세의 1×/8×·배경 QA와 접근성 완료 상태를 충족하지 못한다. ARIA name이 존재해도 보이는 UI 결함은 해소되지 않는다.
- 해제 조건: 텍스트 버튼에 `width:auto`, 충분한 `min-width`, `white-space:nowrap`인 전용 class를 적용하고, 1272×716과 390×844에서 겹침·잘림·수평 overflow가 없는 fresh 캡처와 keyboard QA를 남긴다.

### 4. MEDIUM — 완료 기준의 hole topology와 실제 production JSON 호환 증거가 없다

- 위치: `pixelizer-codex-research/specs/items/alp-002-alpha-policy.md:88-97`, `:99-113`; `scripts/alp002-check.mjs:108-357`; `pixelizer-codex-research/evidence/alp-002/README.md:6-25`
- 확인 내용: 자동 검사는 threshold, palette weighting, cleanup, outline, 4×4 alpha matrix, 단일 대형 결과, 설정 복원을 검증한다. ALP-001 검사는 component와 frame isolation을 검증하지만 hole 보존을 검증하지 않는다. `visual-quality-check.mjs`의 baseline은 core legacy projection을 비교할 뿐 실제 `processAll`이 내보내는 전체 JSON/coverage matrix와 PNG alpha를 end-to-end로 hash 대조하지 않는다.
- 영향: `component/hole/frame boundary 회귀 없음`, `binary hash`, `coverage PNG/alpha JSON`, `topology report`라는 명시적 완료 증거 중 hole과 production JSON/PNG 대조를 독립적으로 확인할 수 없다. QA JSON의 mode별 `pass:true` 수치만으로는 산출물 자체를 재검증할 수 없다.
- 해제 조건: hole이 있는 fixture로 binary/coverage와 outline 전후 topology를 정량 비교하고, original/square/factor/grid/preserve-sheet 각각에서 PNG alpha와 root `alpha` matrix를 대조한다. binary/10은 legacy PNG·grid 및 합의된 legacy JSON projection hash를 기록하고, 동일 입력 2회 결정성 hash를 증거 보고서에 연결한다.

## Spec alignment

- 정렬됨: 기본 `binary`/10, threshold 1~254 validation·legacy migration·round trip, coverage alpha 보존과 root matrix, alpha/255 k-means weighting, hidden RGB 제외, binary equal weighting, cleanup alpha 불변, outline 새 픽셀 255, preserve-sheet frame boundary, IndexedDB 복원, CSP·네트워크 제한.
- 간극: findings 1~4. 특히 증거 보고서의 `로그 크기 gate PASS`와 `캡처 무결성 PASS`는 각각 aggregate 32MB와 실제 JPEG 구조를 검증하지 않아 완료 근거로 충분하지 않다.

## Test evidence

통과:

- `node scripts/alp002-check.mjs` — 9/9
- `node scripts/alp002-ui-check.mjs`
- `node scripts/visual-quality-check.mjs` — 12/12, baseline 2/2
- `node scripts/settings-check.mjs`
- `node scripts/preserve-sheet-check.mjs`
- `node scripts/alpha-check.mjs` — 5/5
- `node scripts/animation-check.mjs`
- `node scripts/ani001-ui-check.mjs`
- `node scripts/grid-detection-check.mjs`
- `node scripts/grid001-ui-check.mjs`
- `node scripts/security-check.mjs`
- `node scripts/out001-check.mjs`
- `node scripts/ux001-check.mjs`
- `node scripts/palette-check.mjs`
- `node scripts/pal001-ui-check.mjs`
- `node scripts/cfg001-ui-check.mjs`
- `node scripts/geo001-ui-check.mjs`
- `node scripts/alp001-ui-check.mjs`
- `node scripts/grid001-evidence-gate-check.mjs`
- `node --check scripts/generate-alp002-evidence.mjs`
- `git diff --check`

추가 negative 재현:

- 두 17MiB JSON의 합계 35,651,654B에 대해 운영 `getResultLogStorageIssue`가 `null` 반환 — FAIL
- SOI/EOI-only 1,024B payload에 대해 generator JPEG predicate가 `true` 반환 — FAIL
- 필수 JPEG 4개 `file` 검사·SHA-256 대조·원본 육안 확인 — 실제 파일은 정상

`scripts/generate-alp002-evidence.mjs`는 summary와 README를 쓰므로 독립 리뷰 중 재실행하지 않았다. 현재 QA JSON의 review가 `PENDING`이어서 prospective status는 `NEEDS_REVIEW`다. 이 보고서를 `CHANGES_REQUESTED`로 반영하면 review regex는 PASS하지 않으므로 여전히 `NEEDS_REVIEW`가 되어야 한다.

## Review gate risk

보고서 basename 제한, SHA-256 대조, 단독 `RECOMMENDATION: PASS` 요구, `CHANGES_REQUESTED` 배제는 path traversal과 사후 변조를 막는다. 다만 임의의 로컬 작성자가 `PASS` 한 줄 파일을 만들고 그 해시·model/result 값을 QA JSON에 함께 쓰면 통과하므로 Sol xhigh 실행 주체의 provenance를 인증하지는 않는다. 이는 현재 독립 검토 절차로 보완해야 하는 잔여 위험이며, findings 1~4와 별개로 기록한다.

STATUS: DONE_WITH_CONCERNS
FINDINGS: HIGH 2건, MEDIUM 2건 — 로그 합산 상한, JPEG gate, 모달 텍스트 겹침, topology/production JSON 증거 누락
SPEC_ALIGNMENT: 핵심 알고리즘은 대체로 정렬되지만 완료·보안·증거 기준에 간극이 있음
TEST_EVIDENCE: 자동 회귀 17개, syntax·diff 검사, JPEG 원본 4개, negative 재현 2개 검토
RISKS: IndexedDB aggregate log 과대 저장, 증거 위조 가능성, visible control 접근성, 미검증 hole/산출물 호환
RECOMMENDATION: CHANGES_REQUESTED
