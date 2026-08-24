# ANI-001 검증 증거 보고서

- **항목 ID:** `ANI-001`
- **상태:** `DONE`
- **생성 시각:** 2026-08-21T05:23:58.390Z
- **CSP SHA-256:** `A4Yxg91UtdTaaWeOdEnhtI2kIIF0/e0MTKvQFniVzOI=`

이 보고서는 `pixelate_studio.html`에서 추출해 실행한 실제 함수 결과와 `qa-results.json`의 브라우저 측정값만 집계한다. 측정되지 않은 항목을 통과로 간주하지 않는다.

## 자동 검사

- `node scripts/animation-check.mjs`: 실제 정렬·시트 분할·FPS accumulator·loop 종료·cleanup·정책 판정 함수 실행
- `node scripts/ani001-ui-check.mjs`: dialog semantics, focus 이동/복귀·trap, 텍스트 버튼 레이아웃 class, lifecycle 연결 검사
- multi-file 순서: `walk_01.png` → `walk_02.png` → `walk_03.png`
- sheet row-major 앞 4개: #1(0,0), #2(32,0), #3(64,0), #4(96,0)
- metadata 없는 디더링 판정: `디더링: 확인 불가`

## 브라우저·장시간 QA 게이트

- PASS — `desktopLayout`
- PASS — `mobileLayout`
- PASS — `focusAndKeyboard`
- PASS — `sheetPlayback`
- PASS — `reducedMotion`
- PASS — `lifecycleCleanup`
- PASS — `tenMinuteLoop`
- PASS — `captures`
- PASS — `repairRegression`
- PASS — `requiredReview`

모든 게이트가 통과했다.

## 독립 검토

- 모델: `Sol xhigh`
- 판정: `PASS`
- 보고서: [sol-xhigh-rereview-2026-08-21.md](sol-xhigh-rereview-2026-08-21.md)
