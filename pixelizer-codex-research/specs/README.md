# Pixelate Studio 개선 진행 대시보드

기준일: 2026-09-06 (KST)

이 디렉터리는 외부 소스 연구를 실제 구현 단위로 전환한 명세 패키지다. 구현자는 한 번에 한 항목만 선택하고, 해당 명세의 수용 기준과 증거 요구를 모두 만족한 뒤 다음 항목으로 이동한다.

## 전체 진행률

| 구분 | 완료 | 전체 | 진행률 |
|---|---:|---:|---:|
| 명세 작성 | 15 | 15 | 100% |
| 구현 | 15 | 15 | 100% |
| 최종 QA 승인 | 15 | 15 | 100% |
| 현재 소스 해시 결속 기능별 브라우저 증거 | 15 | 15 | 100% |

## 최근 작업 현황

- `2026-09-06`: 남아 있던 QLT·ANI·GRID·ALP-002·CELL·PAL-002·DIT·EDGE를 동일한 운영 HTML/Worker 해시에서 브라우저 재검증했다. **브라우저 8/8 PASS, 관련 자동 검사 13/13 PASS**로 현재 소스 해시 결속 기능별 증거를 15/15로 완료했다. [재검증 보고서](../evidence/current-hash-revalidation-20260906/README.md), [브라우저 측정 JSON](../evidence/current-hash-revalidation-20260906/browser-run.json), [아티팩트 manifest](../evidence/current-hash-revalidation-20260906/artifact-manifest.json).
- `2026-09-06`: 미완료 OUT·CFG·UX·PAL·ALP와 PERF 최신 소스 재검증을 마쳤다. **전체 자동 검사 37/37 PASS**, `git diff --check` PASS. [최종 보고서](../evidence/completion-20260906/README.md), [검사 종료 코드](../evidence/completion-20260906/automated-checks.json).
- CFG 프리셋 확인 상태·focus, UX 원본 참조·모달 키보드, PAL 잘못된 파일의 부분 적용 오류를 수정했다. PNG·ZIP·설정·팔레트·A/B·알파 진단 통합 5개 시나리오와 CUA 직접 조작 증거를 기록했다.
- Chrome 연결 실패 후 사용자가 지정한 사이드바 브라우저에서 PERF를 검증했다. click 취소 14.9ms, 동일 하네스 Space 취소 17.1ms, 결과 0. 256K/1M/4M 입력 지연 6.1/3.4/33.5ms, long task 0. 재실행·탭 복귀·모바일·Worker 503 실패도 통과했다.
- 한때 크레딧 오류로 차단됐으나 재시도에서 실제 제어가 복구됐다. 계정 연결 관계나 오류 원인은 미확정이다. 이전 초기 입력 지연 131.2ms 기록은 보존했으며 새 가시 상태 검증에서는 재현되지 않았다.
- 최종 QA 15/15와 현재 소스 해시 결속 기능별 브라우저 증거 15/15를 모두 충족했다. 8개 추가 항목은 대표 경로를 현재 해시에 결속했으며, 전체 캡처 매트릭스와 독립 검토 범위는 기존 항목별 증거를 유지한다.
- 변경은 미커밋 상태이며 커밋·push·배포는 하지 않았다. [production diff](../evidence/completion-20260906/working-tree.patch). 영상·trace·다운로드 검증 방식의 범위는 최종 보고서에 명시했다.

## 상태 정의

| 상태 | 의미 |
|---|---|
| `READY` | 명세와 선행조건이 충족되어 구현을 시작할 수 있음 |
| `NOT_STARTED` | 명세는 완료됐지만 선행 항목이 완료되지 않았거나 아직 선택하지 않음 |
| `IN_PROGRESS` | 해당 항목만 구현 중 |
| `NEEDS_REVIEW` | 구현은 끝났으나 지정된 자동·수동 QA 또는 상위 모델 검토가 남음 |
| `DONE` | 수용 기준, 회귀 검사, 증거 기록이 모두 완료됨 |
| `BLOCKED` | 명세에 정의된 중단 조건이 발생해 상위 모델 또는 사용자 결정이 필요함 |
| `DEFERRED` | 현재 제품 범위에서 의도적으로 보류됨 |

`DONE`은 코드가 작성됐다는 뜻이 아니다. 항목 명세의 자동 검사, 브라우저 QA, 결정성 검사와 대시보드 증거 링크까지 있어야 한다.

## 구현 대시보드

| ID | 항목 | 분류 | 우선순위 | 선행 항목 | 권장 모델 | 구현 | QA | 명세 | 증거 |
|---|---|---|---|---|---|---|---|---|---|
| QLT-001 | 시각 품질·시간축 테스트 하네스 | ENGINEERING-INFERENCE | P0 | 없음 | Sol xhigh | `DONE` | 완료 — 현재 소스 checker 변환·RGBA 해시 PASS | [열기](items/qlt-001-visual-quality-harness.md) | [검사·보고서](../evidence/qlt-001/README.md), [2026-09-06 해시 재검증](../evidence/current-hash-revalidation-20260906/README.md) |
| GEO-001 | 비율 유지 exact-factor/native 출력 | SOURCE-BACKED | P1 | QLT-001 | Luna xhigh | `DONE` | 현재 소스 geometry·desktop/mobile·Enter/Space·capture hash·GEO gate PASS; 전체 회귀 상태는 상단 참조 | [열기](items/geo-001-exact-factor-output.md) | [검사·브라우저 QA 보고서](../evidence/geo-001/README.md), [측정 JSON](../evidence/geo-001/browser-qa.json), [2026-09-06 검증](../evidence/completion-20260906/README.md) |
| OUT-001 | native + nearest 확대 이중 출력 | SOURCE-BACKED | P1 | GEO-001 | Luna xhigh | `DONE` | 완료 — PNG/ZIP·결정성·재업로드·제한·키보드·mobile·현재 OUT gate PASS; 전체 37/37 PASS | [열기](items/out-001-dual-export.md) | [검사·브라우저 QA 보고서](../evidence/out-001/README.md), [측정 JSON](../evidence/out-001/browser-qa.json), [2026-09-06 검증](../evidence/completion-20260906/README.md) |
| CFG-001 | versioned 설정 JSON·preset | SOURCE-BACKED + ENGINEERING-INFERENCE | P1 | QLT-001 | Luna xhigh | `DONE` | 완료 — round trip·legacy·invalid 원자성·preset focus·현재 브라우저 증거 PASS; 전체 37/37 PASS | [열기](items/cfg-001-settings-presets.md) | [기존 자동 검사·예제](../evidence/cfg-001/README.md), [2026-09-06 검증](../evidence/completion-20260906/README.md) |
| UX-001 | 1×/2×/8× 및 원본/결과 A/B | SOURCE-BACKED | P1 | GEO-001 | Luna xhigh | `DONE` | 완료 — 원본 참조·키보드/focus·1/2/8×·A/B·mobile·pan·fallback·cleanup PASS; 전체 37/37 PASS | [열기](items/ux-001-actual-size-ab-preview.md) | [기존 자동 검사](../evidence/ux-001/README.md), [2026-09-06 검증](../evidence/completion-20260906/README.md) |
| PAL-001 | custom palette 입력·미리보기 | SOURCE-BACKED | P1 | QLT-001, CFG-001 | Luna xhigh | `DONE` | 완료 — 잘못된 파일 부분 적용 수정·parser·custom index·light/dark/mobile PASS; 전체 37/37 PASS | [열기](items/pal-001-custom-palette.md) | [기존 자동 검사](../evidence/pal-001/README.md), [2026-09-06 검증](../evidence/completion-20260906/README.md) |
| ALP-001 | 고채도 배경과 alpha island 진단 | SOURCE-BACKED + ENGINEERING-INFERENCE | P1 | QLT-001 | Luna xhigh | `DONE` | 완료 — 배경·custom·B 예외·1/2/8× overlay·PNG 불변 PASS; 전체 37/37 PASS | [열기](items/alp-001-alpha-diagnostics.md) | [기존 자동 검사](../evidence/alp-001/README.md), [2026-09-06 검증](../evidence/completion-20260906/README.md) |
| ANI-001 | 다중 파일·시트 애니메이션 검수 | SOURCE-BACKED + ENGINEERING-INFERENCE | P2 | UX-001 | Luna xhigh + Sol 검토 | `DONE` | 완료 — 혼합·전체 회귀·독립 검토 및 현재 소스 2프레임/8× 브라우저 경로 PASS | [열기](items/ani-001-animation-review.md) | [검사·보고서](../evidence/ani-001/README.md), [Sol 최종 재검토](../evidence/ani-001/sol-xhigh-rereview-2026-08-21.md), [2026-09-06 해시 재검증](../evidence/current-hash-revalidation-20260906/README.md) |
| GRID-001 | Sobel grid period/phase 감지 | SOURCE-BACKED + EXPERIMENTAL | P2 | QLT-001, GEO-001 | Sol xhigh | `DONE` | 완료 — algorithm v2·증거 무결성·독립 검토 및 현재 소스 8×8/offset 0/0 자동 감지 PASS | [열기](items/grid-001-grid-detection.md) | [검사·QA 보고서](../evidence/grid-001/README.md), [Sol 최종 검토](../evidence/grid-001/sol-xhigh-final-review-2026-08-23.md), [2026-09-06 해시 재검증](../evidence/current-hash-revalidation-20260906/README.md) |
| ALP-002 | binary/coverage alpha 정책 | SOURCE-BACKED + ENGINEERING-INFERENCE | P2 | QLT-001, CFG-001, ALP-001 | Luna xhigh + Sol 검토 | `DONE` | 완료 — 보완 회귀·캡처 무결성·독립 검토 및 현재 소스 coverage/binary 해시 분리 PASS | [열기](items/alp-002-alpha-policy.md) | [검사·보고서](../evidence/alp-002/README.md), [Sol 최종 재검토](../evidence/alp-002/sol-xhigh-rereview-2026-08-23.md), [2026-09-06 해시 재검증](../evidence/current-hash-revalidation-20260906/README.md) |
| CELL-001 | 셀 대표색 A/B | SOURCE-BACKED + EXPERIMENTAL | P3 | QLT-001, GEO-001 | Sol xhigh | `DONE` | 완료 — exact·결정성·QLT A/B·기존 전체 QA 및 현재 소스 center 후보 브라우저 경로 PASS | [열기](items/cell-001-representative-colors.md) | [검사·A/B·브라우저 QA 보고서](../evidence/cell-001/README.md), [2026-09-06 해시 재검증](../evidence/current-hash-revalidation-20260906/README.md) |
| PAL-002 | 지각 팔레트·샘플링 A/B | SOURCE-BACKED + EXPERIMENTAL | P3 | QLT-001, PAL-001 | Sol xhigh | `DONE` | 완료 — 기존 matrix·무결성·독립 검토 및 현재 소스 OKLab/image-balanced 브라우저 경로 PASS; opt-in preset, 기본값 유지 | [열기](items/pal-002-palette-algorithms.md) | [matrix·브라우저 QA·판정 보고서](../evidence/pal-002/README.md), [요약 JSON](../evidence/pal-002/summary.json), [Sol xhigh 최종 재검토](../evidence/pal-002/sol-xhigh-final-rereview-2026-08-26.md), [2026-09-06 해시 재검증](../evidence/current-hash-revalidation-20260906/README.md) |
| DIT-001 | 정지 이미지 ordered dithering | SOURCE-BACKED + EXPERIMENTAL | P3 | QLT-001, PAL-001, CFG-001 | Luna xhigh + Sol 검토 | `DONE` | 완료 — 기존 품질·시간축·모바일·독립 검토 및 현재 소스 Bayer4 75% 해시 변화 PASS; 기본값·preset off 유지 | [열기](items/dit-001-ordered-dithering.md) | [검사·보고서](../evidence/dit-001/README.md), [품질 매트릭스](../evidence/dit-001/quality-matrix.json), [브라우저 QA](../evidence/dit-001/browser-qa.json), [Sol xhigh 최종 재검토](../evidence/dit-001/sol-xhigh-independent-rereview-2026-08-27.md), [2026-09-06 해시 재검증](../evidence/current-hash-revalidation-20260906/README.md) |
| EDGE-001 | Weber/line-aware/selout | SOURCE-BACKED + EXPERIMENTAL | P3 | QLT-001, CELL-001 | Sol xhigh | `DONE` | 완료 — 기존 exact·결정성·정량·전체 QA 및 현재 소스 line-aware/selout 브라우저 경로 PASS; 기본값·preset off 유지 | [열기](items/edge-001-line-aware-selout.md) | [검사·브라우저 QA 보고서](../evidence/edge-001/README.md), [정량 결과](../evidence/edge-001/automated-results.json), [브라우저 QA](../evidence/edge-001/browser-qa.json), [2026-09-06 해시 재검증](../evidence/current-hash-revalidation-20260906/README.md) |
| PERF-001 | 계측, Worker, 조건부 WASM | ENGINEERING-INFERENCE | P3 | QLT-001 및 대상 알고리즘 | Sol xhigh | `DONE` | 완료 — 사용자 지정 사이드바에서 click/Space 취소·재실행·탭·mobile·실패·현재 hash gate PASS; 전체 37/37 PASS | [열기](items/perf-001-worker-wasm.md) | [검사·브라우저 QA 보고서](../evidence/perf-001/README.md), [QLT fixture manifest](../evidence/perf-001/browser-fixtures/manifest.json), [기준선·Worker 비교](../evidence/perf-001/benchmark-report.json), [performance trace](../evidence/perf-001/performance-trace.json), [cancel MP4](../evidence/perf-001/browser-cancel-4m.mp4), [브라우저 QA](../evidence/perf-001/browser-qa.json), [2026-09-06 검증](../evidence/completion-20260906/README.md) |

## 공통 문서

- [통합 연구 엔지니어링 명세](pixelization-research-spec.md)
- [시각 품질 테스트 계획](visual-quality-test-plan.md)
- [공통 구현 프로토콜](implementation-protocol.md)
- [보류 항목 등록부](deferred-register.md)

## 진행 업데이트 규칙

1. 구현 시작 전에 선행 항목이 `DONE`인지 확인하고 해당 항목만 `IN_PROGRESS`로 바꾼다.
2. 코드 작성만 끝났다면 `NEEDS_REVIEW`다. 자동 검사와 수동 QA가 모두 통과하기 전에는 `DONE`으로 바꾸지 않는다.
3. 증거 열에는 최소한 테스트 명령·결과, 브라우저 캡처 또는 보고서, 관련 커밋이나 diff 링크를 기록한다.
4. 실험 항목은 명세의 채택 임계값을 넘지 못하면 `DONE`이 아니라 실험 종료 결과와 함께 `DEFERRED`로 이동한다.
5. 실패를 숨기지 않는다. 중단 조건이 발생하면 `BLOCKED`와 원인·재현 입력·추천 모델을 기록한다.
