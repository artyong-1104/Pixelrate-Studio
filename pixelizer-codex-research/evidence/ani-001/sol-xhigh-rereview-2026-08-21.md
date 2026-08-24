# ANI-001 독립 Sol xhigh 최종 재검토 — 2026-08-21

STATUS: DONE_WITH_CONCERNS

FINAL_VERDICT: PASS

FINDINGS:

1. **LOW — 증거 집계기가 새 혼합 회귀 세부값 두 개를 직접 게이트하지 않음.** `qa-results.json`에는 `mixedNormalSheetPlaybackPass`와 `mixedNoticePersistsOnNormalSheet`가 별도 측정값으로 있으며 현재 둘 다 `true`다. 하지만 `scripts/generate-ani001-evidence.mjs:57-62`의 `repairRegression`은 `mixedReasonPass`와 `mixedKeyboardPass`까지만 요구한다. 현재 수정본의 통과 판정에는 영향이 없지만, 향후 두 세부값이 실패해도 다른 집계값과 `requiredReview: PASS`만으로 `DONE`이 생성될 수 있으므로 후속 강화가 권장된다.

SPEC_ALIGNMENT: aligned. 이전 FAIL 원인이었던 정상 결과 + 257프레임 초과 시트 혼합 입력은 정상 소스를 계속 재생하면서 `animNotice`에 제외 파일명과 257/256 제한 사유를 표시하고(`pixelate_studio.html:4896-4902`, `5034-5037`), 비활성 option 자체에도 전체 사유를 포함한다(`pixelate_studio.html:5257-5268`). 단독 초과 소스의 제어 비활성화, 정상 소스 재생, 프레임 정렬·row-major 분할, 정책 표시, 접근성, CSP 및 호환 경로도 기존 명세와 정렬된다.

TEST_EVIDENCE:

- `for check_file in scripts/*check.mjs; do node "$check_file" || exit 1; done` — ANI-001을 포함한 전체 검사 통과.
- `git diff --check` — 통과.
- `qa-results.json`, `summary.json`, `vercel.json` JSON 파싱 — 통과.
- 실제 HTML에서 추출한 `getAvailableAnimationSources()`와 `getAnimSourceWarningText()` 테스트가 혼합 입력에서 초과 파일명과 257/256 전체 이유를 검증한다(`scripts/animation-check.mjs:75-96`).
- UI 검사는 정상 혼합 소스의 지속 notice와 비활성 option의 전체 사유 문구를 검사한다(`scripts/ani001-ui-check.mjs:53-57`).
- 최신 브라우저 증거는 혼합 사유 표시, 비활성 option 전체 문구, Space/방향키/B, 정상 sheet 재생, notice 지속, 콘솔 오류 0건을 기록한다(`qa-results.json:110-143`).
- 임시 복제본에서 증거 생성기를 실행해 기존 `requiredReview: FAIL`이 `NEEDS_REVIEW`로 유지되고, 실제 `Sol xhigh / PASS` 입력 후 혼합 회귀 게이트를 포함해 `DONE`으로 전환됨을 확인했다.
- CSP SHA-256 `A4Yxg91UtdTaaWeOdEnhtI2kIIF0/e0MTKvQFniVzOI=`가 HTML, `SECURITY.md`, `vercel.json`, QA·summary에 일치하며 `security-check.mjs`도 통과했다.

RISKS: 이번 독립 재검토 시점에는 인앱 브라우저 연결 목록이 비어 있어 혼합 입력을 새 브라우저 세션에서 다시 실행하지 못했다. 대신 최신 브라우저 측정값과 현재 DOM/함수 경로를 대조했다. 기존 611,086ms 장시간 재생 이후 변경은 경고 문구 계산·notice 표시·option 텍스트와 회귀 검사에 한정되고 `animLoop`, `setAnimPlaying`, `closeAnimModal`, visibility/blur cleanup은 바뀌지 않았으므로 10분 전체를 다시 실행하지 않았다.

RECOMMENDATION: APPROVE

REQUIRED_REVIEW_UPDATE: `requiredReview`를 `Sol xhigh / PASS`로 변경해도 된다. 이 재검토 보고서를 연결하고 증거 생성기를 다시 실행한 뒤 ANI-001을 `DONE`으로 승격할 수 있다.
