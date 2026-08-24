# ALP-002 독립 Sol xhigh 최종 재검토

- 검토 시각: 2026-08-23T04:11:34Z
- 검토 범위: ALP-002 명세, `processAll` 운영 변환 경로, 알파 산출물·로그 상한 helper, JPEG 증거 gate, fresh 브라우저 QA JSON, JPEG 4개, CSP·보안·관련 회귀
- 검토 방식: `pixelate_studio.html`에서 추출한 운영 helper 직접 실행, fail-closed 악성 payload 주입, 원본 JPEG 육안·parser·시스템 decoder 검사, 전체 회귀 재실행
- 수정 범위: 이 보고서 외 운영 코드·명세·QA JSON·대시보드는 수정하지 않았다.

## 판정

이전 독립 검토의 네 차단 항목이 모두 해소됐다. 32MiB 다중 결과 로그 상한은 UTF-8 JSON 배열 envelope까지 누적하고, 모달 텍스트 컨트롤은 desktop에서 겹침 없이 한 줄로 표시되며, hole topology·PNG alpha·coverage matrix·legacy projection·결정성 증거가 운영 helper와 연결됐다.

JPEG 증거 gate는 재검토 중 발견한 SOF/SOS crafted payload 우회까지 수정됐다. 최신 gate는 SOF/SOS component·segment length, scan marker·byte stuffing·restart·EOI·entropy 존재를 파싱하고, macOS `sips` 또는 ImageMagick `identify`의 실제 decode 치수가 parser와 일치해야만 증거를 인정한다. 실제 image data가 없는 structurally plausible payload도 decoder에서 거부됐다. 새로운 차단 finding은 없다.

## Findings

none.

## 이전 findings 재검증

### PASS — 32MiB 전체 `jsonData[]` 상한과 다운로드 유지

- 운영 `getResultLogStorageIssue`는 배열 `[]` 2B, 개별 JSON UTF-8 byte, 결과 사이 comma 1B를 누적한다: `pixelate_studio.html:4777-4809`.
- `{payload: 17MiB}` 결과 두 개는 각각 17,825,806B, 합계 35,651,615B였고 33,554,432B 상한에서 `{kind:"result-json-total", name:"전체"}`로 거부됐다.
- `saveLogToDB` 직접 실행에서 IndexedDB transaction은 0회, busy 상태는 해제, `PNG·JSON 다운로드는 계속 사용할 수 있습니다.` 안내는 유지됐다.
- 결과 카드와 PNG/JSON button은 `saveLogToDB` 호출 전에 생성되고 다운로드 handler는 로그 저장과 분리돼 있다: `pixelate_studio.html:5452-5473`, `:5575-5625`.

### PASS — JPEG 구조·치수·해시 fail-closed gate

- parser는 SOI/EOI, SOF `8+3*Nf`, 고유 frame component, SOS `6+2*Ns`, frame selector 일치, entropy byte, stuffing/restart marker, 마지막 EOI를 검사한다: `scripts/lib/alp002-evidence-gate.mjs:24-93`.
- parser 통과 후 시스템 decoder 치수가 parser와 일치해야만 SHA-256을 산출한다: `scripts/lib/alp002-evidence-gate.mjs:95-140`.
- SOI/EOI-only, truncated, SOF-only/no-SOS, invalid SOF=8/SOS=2, non-decodable entropy, 1×1, hash mismatch, path traversal 케이스가 모두 거부됐다: `scripts/alp002-evidence-gate-check.mjs:116-153`.
- 재검토가 제작한 invalid SOF=8/SOS=2 1,024B payload는 최신 parser, decoder, `inspectAlp002JpegEvidence` 모두 `null`을 반환했다.
- 저장된 JPEG 4개는 parser와 `sips`가 같은 치수를 반환했고 QA SHA-256과 모두 일치했다: desktop 1272×716 3개, mobile 382×827 1개.

### PASS — 모달 텍스트 컨트롤·mobile

- `.modal-text-control`은 `width:auto`, `min-width:max-content`, `white-space:nowrap`, 4px/8px padding을 제공한다: `pixelate_studio.html:623-628`.
- fresh desktop QA 측정은 `배경 (B)` 61.25px/scrollWidth 57px, `알파 진단` 68.5859375px/scrollWidth 65px, background-alpha overlap false, alpha-expand overlap false다.
- `browser-coverage-threshold10.jpg`와 `browser-outline-sheet.jpg`를 1272×716 원본으로 열어 라벨 한 줄 표시, 인접 컨트롤과 겹침 0을 육안 확인했다.
- mobile 측정은 viewport 390×844, document scrollWidth 382, horizontal overflow false, keyboard/range threshold 128 일치다. 원본 mobile JPEG은 382×827이다.

### PASS — hole topology·production alpha artifact

- `processAll`의 original, square, factor, grid-repair, preserve-sheet 분기는 후체리 뒤 단일 `buildAlphaPolicyArtifacts(finalGrid, finalAlpha, finalW, finalH, alphaMode, alphaThreshold)` 호출을 거친다: `pixelate_studio.html:5105-5164`, `:5272-5288`.
- 같은 helper의 `renderedAlpha`가 PNG `imgData.data[idx+3]`를 만들고 `alphaMatrix`가 coverage JSON root `alpha`로 연결된다: `pixelate_studio.html:5288-5307`, `:5425-5431`.
- 운영 helper 직접 실행 결과: binary/coverage component 1, hole 1; coverage matrix=renderedAlpha true; binary root alpha matrix `null`; binary RGBA SHA-256 `73407d8cf02ba3d07102a8b47a134bf3ee693768a48f5a6d7f7ecf754636c8d8`; legacy projection SHA-256 `21990b6ae732f343b6dca56b97435a7f2ebca4f21daae420284f164450cb3667`; 결정성 SHA-256 `49525c16bec9a8965f4e10e443de893a39e99ac933b297e8fbf7220220f08dca` 일치.
- 이 값은 `alp002-check.mjs`, `alp002-ui-check.mjs`, generator `automated.productionArtifactPass`, `summary.json`, `qa-results.json.rereviewFixQa.topologyAndArtifacts`에 연결됐고, QA에서 다섯 scale mode가 모두 `pass:true`다.

## Spec alignment

명세와 정렬됨. binary/10 기본·legacy projection, coverage partial alpha·matrix, alpha-weighted palette, hidden RGB 제외, cleanup alpha 불변, outline 255, original/square/factor/grid/preserve-sheet 공통 산출물 경로, hole/component 유지, 결정성, 설정·로그 복원, 16MiB/32MiB 로그 gate, 모달·mobile QA, fail-closed 증거 gate를 모두 재검증했다.

## Test evidence

통과:

- `node scripts/alp002-check.mjs` — 10/10
- `node scripts/alp002-ui-check.mjs`
- `node scripts/alp002-evidence-gate-check.mjs` — structure, decoder, dimensions, truncation, hash, path negative gate
- `node scripts/visual-quality-check.mjs` — 12/12, baseline 2/2, deterministic `db4b3d904fbcc53e83966e3db097b6e27242ee6494e7c0f2f943a007e6f23cef`
- `node scripts/settings-check.mjs`
- `node scripts/preserve-sheet-check.mjs`
- `node scripts/alpha-check.mjs` — 5/5
- `node scripts/animation-check.mjs`
- `node scripts/ani001-ui-check.mjs`
- `node scripts/grid-detection-check.mjs`
- `node scripts/grid001-ui-check.mjs`
- `node scripts/grid001-evidence-gate-check.mjs`
- `node scripts/security-check.mjs`
- `node scripts/out001-check.mjs`
- `node scripts/ux001-check.mjs`
- `node scripts/palette-check.mjs`
- `node scripts/pal001-ui-check.mjs`
- `node scripts/cfg001-ui-check.mjs`
- `node scripts/geo001-ui-check.mjs`
- `node scripts/alp001-ui-check.mjs`
- `node scripts/generate-pixel-fixtures.mjs --verify` — 12 fixtures, deterministic
- `node --check scripts/*.mjs scripts/lib/*.mjs` — 35 files
- `git diff --check`
- inline script CSP SHA-256 `sha256-qEWZzYGEhTbPInlnkyxAoCoQT8nIVgw/W4xGMU8dQ2o=` — active HTML meta, `SECURITY.md`, `vercel.json` 일치
- JPEG 4개 원본 육안, `file`, SHA-256, parser, `sips` decode 치수 검사 — PASS

## Prospective generator gate

- 현 `summary.json`: automated PASS, browser QA PASS, captures PASS, log-restore capture PASS, required review PENDING.
- 이 보고서의 basename·SHA-256과 `model: Sol xhigh`, `result: PASS`를 `qa-results.json.requiredReview`에 연결한 후의 예상 gate: `browserQaPass=true`, `capturesPass=true`, `requiredReviewPass=true`, status `DONE`.
- generator는 `summary.json`·`README.md`를 쓰므로 독립 재검토에서는 재실행하지 않았다.

## Risks

- 증거 gate의 실제 decode는 macOS `sips` 또는 PATH의 ImageMagick `identify` 중 하나가 필요하다. 둘 다 없는 환경에서는 위양성으로 통과하지 않고 fail-closed로 중단하므로 증거 생성 환경 요구사항으로 남는다.
- 새로운 정확성·보안·데이터 손실 차단 위험은 발견하지 못했다.

STATUS: DONE
FINDINGS: none
SPEC_ALIGNMENT: aligned
TEST_EVIDENCE: 운영 helper 직접 실행, 자동 회귀 21개 명령, syntax 35개, JPEG 4개 원본·해시·parser·decoder, 악성 JPEG 음성 payload 7종
RISKS: decoder 도구가 없는 증거 생성 환경은 fail-closed로 중단됨; 차단 제품 위험 없음

RECOMMENDATION: PASS
