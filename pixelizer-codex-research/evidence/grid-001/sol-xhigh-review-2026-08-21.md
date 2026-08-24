# GRID-001 독립 Sol xhigh 최종 검토

STATUS: DONE_WITH_CONCERNS

FINDINGS:

1. **P1 — QLT `clean-pixel-art` 정답 격자 오검출은 명세의 실험 채택 게이트 실패이다.** `tests/fixtures/manifest.json:124-145`는 이 fixture를 `knownGrid.periods:[4]`, phase 0/0, `expectedFailure:[]`로 정의한다. 명세는 clean fixture의 period/phase 오차 0을 채택 기준으로 두고(`specs/items/grid-001-grid-detection.md:81-90`), QLT 공통 계획도 정렬 fixture 오차 0을 요구한다(`specs/visual-quality-test-plan.md:104-108`). 현재 결과는 X=4, Y=12, confidence 0.223339이다. confidence 0.5 미만 차단은 잘못된 자동 적용을 막는 **안전 동작**이지만 period/phase 오차 0을 충족하는 **감지 성공**은 아니다. `scripts/grid-detection-check.mjs:63-66`은 이 오검출을 낮은 confidence면 통과로 재정의해 명세 기준을 바꾸고 있다. 명세 17의 중단 조건에 따라 알고리즘을 수정해 4/4, phase 0/0을 맞추거나, 불가능하면 GRID-001을 `DEFERRED`로 두고 후속 실험으로 분리해야 한다.

2. **P1 — 증거 생성기가 실험 게이트와 독립 검토 증거를 fail-closed로 검증하지 않는다.** `scripts/generate-grid001-evidence.mjs:193-223`은 sparse clean의 정답 4/4 대신 `confidence < 0.5`만으로 `safeFallbackPass`를 통과시킨다. 또한 `scripts/generate-grid001-evidence.mjs:131-147`은 브라우저 캡처가 5개 이상인지와 `requiredReview.model/result`의 문자열만 확인한다. 캡처 파일의 존재·크기·예상 파일명과 `requiredReview.report`의 비공백·실제 보고서 존재를 확인하지 않아, JSON에 `Sol xhigh/PASS`만 적으면 보고서가 `null`이거나 캡처가 없어도 `DONE`이 될 수 있다. 이 상태에서는 `requiredReview`를 `PASS`로 바꾸면 안 된다.

3. **P2 — 100ms main-thread 게이트가 실제 브라우저 분석 전 구간을 완전히 측정하지 않는다.** `pixelate_studio.html:2898-2924`의 `getGridAnalysisFrames()`는 `getRawPixels()`와 sheet frame slice를 첫 `await` 전에 동기 실행한다. `pixelate_studio.html:3582-3593`의 4M alpha scan도 chunk timer 시작 전에 동기 실행한다. 현재 `maxChunkMs`는 24-row Sobel loop만 포함하며, `scripts/generate-grid001-evidence.mjs:122-125`는 Canvas decode/getImageData/sheet slicing을 거치지 않는 Node RGBA 입력을 측정한다. 따라서 보고서의 `maxChunk 14.3ms`는 전체 브라우저 분석 경로의 100ms 상한을 증명하지 않는다. 브라우저 Long Task 계측이나 해당 전처리 구간을 포함한 chunk 계측이 필요하다.

4. **P2 — 핵심 경계의 자동 검사가 실제 동작 대신 정규식·수기 JSON에 의존한다.** `scripts/grid001-ui-check.mjs:1-35`는 confidence 임계값, 취소, overlay, metadata가 HTML 문자열에 있는지만 확인한다. 4M 취소 복구, 0.50/0.75 경계, sheet/sequence 처리 후 `processing.grid` metadata를 실제 DOM·출력으로 검사하는 자동 테스트가 없다. 저장된 `qa-results.json`과 5개 JPEG은 현재 경로가 동작했다는 증거지만, 앞선 fail-closed 문제 때문에 회귀 방지를 위한 자동 게이트로는 충분하지 않다.

SPEC_ALIGNMENT: gaps — Sobel/profile, alpha mask, 2~32 manual range, phase/margin, confidence 3구간 UI, 4M 거부, 취소 token, sequence/sheet 단일 grid, alpha-weighted sRGB mean, metadata 구조, CSP 동기화는 명세와 정렬된다. 그러나 QLT `clean-pixel-art`의 4px 정답 격자를 4/12로 오검출하여 명세 8·14의 실험 채택 기준을 충족하지 못한다. safe fallback은 오적용 방지 요건만 충족한다.

TEST_EVIDENCE:

- `scripts/*check.mjs` 15개 전체 PASS: ALP-001, ANI-001, CFG-001, GEO-001, GRID-001, OUT-001, PAL-001, preserve-sheet, security, UX-001, visual-quality.
- `node scripts/grid-detection-check.mjs`: wobble 8/8, confidence 0.3820; photo 0.2253; 결정적 hash `7d972e1967c885640cf996243e514567e601c0add626cf37e1e83c9869b16396`.
- 독립 VM 경계 검사: manual size 2..32/phase 경계 PASS, 2048×2048 정확 상한 PASS, 2049×2048 거부 PASS, 190×158·8px·phase3 margin 3/3·3/3 PASS.
- JSON parse PASS: `qa-results.json`, `report.json`, `vercel.json`.
- CSP SHA-256 `2A89j1HwB3xPRvZsskl2Z6H+TnjNBCGBCKH2JKikHdc=`가 `pixelate_studio.html`, `SECURITY.md`, `vercel.json`에서 모두 일치.
- `git diff --check` PASS.
- 저장된 5개 JPEG 캡처를 실제로 열어 overlay, sparse manual fallback, photo reject, 16-frame grid lock, 390×844 mobile manual UI를 시각 검토했다. 모든 캡처 파일의 존재와 0 byte 초과를 확인했다.
- Codex 인앱 브라우저에서 현재 localhost 페이지를 열어 title·URL·초기 DOM을 확인했다. fixture 업로드 중 연결이 초기화된 뒤 localhost 재접속이 브라우저 보안 정책에서 차단되어 이번 독립 세션에서 인터랙션 전체를 재실행하지는 못했다. 우회하지 않고 `qa-results.json` 2026-08-21T09:24:43Z 측정과 캡처를 현재 코드와 대조했다.

RISKS: QLT 정답 격자 미탐지, 검토 보고서 없이 `DONE`이 될 수 있는 증거 게이트, 미측정 동기 전처리 long task, 핵심 UI 경계의 자동 회귀 부족. 실험 UI가 명시적 사용자 조작 없이 기존 factor mode에 자동 적용되지는 않아 현재 즉시 오적용 위험은 제한된다.

RECOMMENDATION: CHANGES_REQUESTED

`requiredReview`를 `PASS`로 변경해도 되는가: **아니오.** sparse clean의 정답 4×4 감지 게이트를 통과하고, 증거 생성기가 clean 정답·캡처 파일·Sol 검토 보고서를 실제로 검증하도록 fail-closed로 보강되기 전에는 `NEEDS_REVIEW` 또는 명세 17에 따른 `DEFERRED`를 유지해야 한다.
