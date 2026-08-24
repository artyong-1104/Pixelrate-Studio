# ANI-001 독립 Sol xhigh 최종 검토 — 2026-08-21

STATUS: DONE_WITH_CONCERNS

FINAL_VERDICT: FAIL

FINDINGS:

1. **MEDIUM — 초과 시트와 정상 결과가 함께 있을 때 오류 이유에 접근할 수 없음.** 명세는 256프레임 초과 시트에 대해 재생을 비활성화하고 이유를 표시하도록 요구한다(`specs/items/ani-001-animation-review.md:60`). 구현은 오류 소스의 `<option>`을 비활성화한다(`pixelate_studio.html:5251-5256`). 그러나 오류 문구는 해당 소스를 `selectAnimSource()`로 선택했을 때만 표시된다(`pixelate_studio.html:5025-5037`). 실제 브라우저에서 `oversized-257.png`와 정상 2프레임 결과를 함께 처리하자 기본 multi-file 소스가 재생됐고, 초과 시트 option은 `disabled`, `animNotice`는 빈 문자열이며 `display:none`이었다. 사용자는 오류 소스를 선택할 수 없어 최대 256프레임 제한 사유를 볼 수 없다. 오류 option을 선택 가능하게 유지해 오류 상태로 진입시키거나, 비활성 option의 표시 텍스트에 전체 오류 이유를 포함해야 한다.
2. **LOW — 대시보드 집계가 행 상태와 일치하지 않음.** 대시보드는 구현 `6/15`, QA `5/15`로 표시하지만(`specs/README.md:12-13`), 현재 표에는 QLT/GEO/OUT/CFG/UX/PAL/ALP 7개 항목이 모두 `DONE`·QA 완료로 기재돼 있다(`specs/README.md:33-39`). ANI-001 판정과 별개로 상태 승격 시 집계를 다시 계산해야 한다.

SPEC_ALIGNMENT: 대부분 정렬, row-major 시트 분할, 256 상한의 단독 오류 상태, 타이머 정리, 정책 표시, 접근성, 호환성, CSP 요구에 맞는다. 다만 혼합 작업의 256 상한 오류 이유 표시가 명세와 어긋나므로 전체 정렬 상태는 `gaps`다.

TEST_EVIDENCE:

- `for check_file in scripts/*check.mjs; do node "$check_file" || exit 1; done` — ANI-001을 포함한 전체 검사 통과.
- `git diff --check` — 통과.
- `qa-results.json`, `summary.json`, `vercel.json` JSON 파싱 — 통과.
- `file`/`identify`로 증거 JPEG 3개가 실제 JPEG이며 1272×716 또는 1280×720임을 확인하고 세 캡처를 직접 열어 검토.
- 임시 복제본에서 `generate-ani001-evidence.mjs` 실행: `PENDING → NEEDS_REVIEW`, 독립 `PASS → DONE` 게이트 동작 확인.
- 현재 HTML을 로컬 브라우저에서 직접 실행해 16프레임 multi-file, 32프레임 sheet, 390×844 모바일, Space/방향키/B, focus trap/restore, close cleanup, 257프레임 단독 오류 제어 비활성화, CSP 적용 상태를 확인. 콘솔 오류 0건.
- 혼합 경계 재현: 257프레임 초과 시트 + 정상 2프레임 결과에서 초과 option은 비활성이고 오류 notice는 표시되지 않음.

RISKS: 기존 611,086ms 장시간 측정은 증거 JSON과 코드를 대조했지만 이번 독립 검토에서 10분 전체를 다시 실행하지는 않았다. 현재 증거 생성기는 캡처 배열 길이를 확인할 뿐 파일 존재와 MIME을 자체 검증하지 않지만, 이번 검토에서는 해당 파일을 별도로 확인했다.

RECOMMENDATION: CHANGES_REQUESTED

REQUIRED_REVIEW_UPDATE: 현재 `requiredReview`를 `PASS`로 올리면 안 된다. 혼합 초과 시트에서 오류 이유가 실제로 표시되도록 수정하고 해당 경계를 자동·브라우저 검사에 추가한 뒤 재검토해야 한다.
