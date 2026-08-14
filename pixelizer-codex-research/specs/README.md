# Pixelate Studio 개선 진행 대시보드

기준일: 2026-08-14 (KST)

이 디렉터리는 외부 소스 연구를 실제 구현 단위로 전환한 명세 패키지다. 구현자는 한 번에 한 항목만 선택하고, 해당 명세의 수용 기준과 증거 요구를 모두 만족한 뒤 다음 항목으로 이동한다.

## 전체 진행률

| 구분 | 완료 | 전체 | 진행률 |
|---|---:|---:|---:|
| 명세 작성 | 15 | 15 | 100% |
| 구현 | 1 | 15 | 6.7% |
| QA | 1 | 15 | 6.7% |

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
| QLT-001 | 시각 품질·시간축 테스트 하네스 | ENGINEERING-INFERENCE | P0 | 없음 | Sol xhigh | `DONE` | 완료 | [열기](items/qlt-001-visual-quality-harness.md) | [검사·보고서](../evidence/qlt-001/README.md) |
| GEO-001 | 비율 유지 exact-factor/native 출력 | SOURCE-BACKED | P1 | QLT-001 | Luna xhigh | `READY` | 미실행 | [열기](items/geo-001-exact-factor-output.md) | — |
| OUT-001 | native + nearest 확대 이중 출력 | SOURCE-BACKED | P1 | GEO-001 | Luna xhigh | `NOT_STARTED` | 미실행 | [열기](items/out-001-dual-export.md) | — |
| CFG-001 | versioned 설정 JSON·preset | SOURCE-BACKED + ENGINEERING-INFERENCE | P1 | QLT-001 | Luna xhigh | `READY` | 미실행 | [열기](items/cfg-001-settings-presets.md) | — |
| UX-001 | 1×/2×/8× 및 원본/결과 A/B | SOURCE-BACKED | P1 | GEO-001 | Luna xhigh | `NOT_STARTED` | 미실행 | [열기](items/ux-001-actual-size-ab-preview.md) | — |
| PAL-001 | custom palette 입력·미리보기 | SOURCE-BACKED | P1 | QLT-001, CFG-001 | Luna xhigh | `NOT_STARTED` | 미실행 | [열기](items/pal-001-custom-palette.md) | — |
| ALP-001 | 고채도 배경과 alpha island 진단 | SOURCE-BACKED + ENGINEERING-INFERENCE | P1 | QLT-001 | Luna xhigh | `READY` | 미실행 | [열기](items/alp-001-alpha-diagnostics.md) | — |
| ANI-001 | 다중 파일·시트 애니메이션 검수 | SOURCE-BACKED + ENGINEERING-INFERENCE | P2 | UX-001 | Luna xhigh + Sol 검토 | `NOT_STARTED` | 미실행 | [열기](items/ani-001-animation-review.md) | — |
| GRID-001 | Sobel grid period/phase 감지 | SOURCE-BACKED + EXPERIMENTAL | P2 | QLT-001, GEO-001 | Sol xhigh | `NOT_STARTED` | 미실행 | [열기](items/grid-001-grid-detection.md) | — |
| ALP-002 | binary/coverage alpha 정책 | SOURCE-BACKED + ENGINEERING-INFERENCE | P2 | QLT-001, CFG-001, ALP-001 | Luna xhigh + Sol 검토 | `NOT_STARTED` | 미실행 | [열기](items/alp-002-alpha-policy.md) | — |
| CELL-001 | 셀 대표색 A/B | SOURCE-BACKED + EXPERIMENTAL | P3 | QLT-001, GEO-001 | Sol xhigh | `NOT_STARTED` | 미실행 | [열기](items/cell-001-representative-colors.md) | — |
| PAL-002 | 지각 팔레트·샘플링 A/B | SOURCE-BACKED + EXPERIMENTAL | P3 | QLT-001, PAL-001 | Sol xhigh | `NOT_STARTED` | 미실행 | [열기](items/pal-002-palette-algorithms.md) | — |
| DIT-001 | 정지 이미지 ordered dithering | SOURCE-BACKED + EXPERIMENTAL | P3 | QLT-001, PAL-001, CFG-001 | Luna xhigh + Sol 검토 | `NOT_STARTED` | 미실행 | [열기](items/dit-001-ordered-dithering.md) | — |
| EDGE-001 | Weber/line-aware/selout | SOURCE-BACKED + EXPERIMENTAL | P3 | QLT-001, CELL-001 | Sol xhigh | `NOT_STARTED` | 미실행 | [열기](items/edge-001-line-aware-selout.md) | — |
| PERF-001 | 계측, Worker, 조건부 WASM | ENGINEERING-INFERENCE | P3 | QLT-001 및 대상 알고리즘 | Sol xhigh | `NOT_STARTED` | 미실행 | [열기](items/perf-001-worker-wasm.md) | — |

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
