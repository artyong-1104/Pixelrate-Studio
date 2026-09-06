# UX-001 — 1×/2×/8× quick view와 원본/결과 A/B

## 1. 메타데이터

| 항목 | 값 |
|---|---|
| 명세 상태 | 완료 |
| 구현 상태 | DONE |
| QA 상태 | 완료 — 현재 소스 검증 및 전체 37/37 PASS |
| 우선순위 | P1 |
| 근거 분류 | SOURCE-BACKED |
| 구현 모델 | Luna xhigh |
| 선행 항목 | GEO-001 |

## 2. 목표와 사용자 완료 상태

사용자가 확대 결함만 보지 않고 native 1×, 일반 표시 2×, 진단 8×에서 결과를 즉시 전환하고 원본과 결과를 side-by-side로 비교한다.

## 3. 현재 문제와 근거

현재 모달은 화면 맞춤 배율로 열리고 1~24배 slider만 있다. 원본 canvas를 보관하지 않으며 결과만 표시한다. Source 02는 실제 사용 크기 판단을 강조하고 Source 04·07은 native/확대 결과를 따로 확인한다.

## 4. 포함·비포함 범위

포함: 1×/2×/8× 버튼, 결과/원본/나란히 mode, 치수 라벨, source 없는 로그 결과 fallback.

비포함: draggable wipe, onion skin, animation playback, 원본 다운로드, 자동 품질 판정.

## 5. UI 명세

- 기존 zoom slider 앞에 quick buttons `1×`, `2×`, `8×`를 추가한다. 선택 배율은 `aria-pressed=true`.
- view mode segmented buttons `결과`, `원본`, `나란히`; 기본 `결과`.
- `나란히`는 동일 크기 두 pane에 `원본`, `결과` label을 표시한다.
- 원본이 없는 복원 로그에서는 원본/나란히를 disabled하고 `저장된 로그에는 원본 이미지가 없습니다.`를 설명한다.
- 620px 이하에서는 두 pane을 세로로 쌓는다.

## 6. 데이터 흐름과 보기 알고리즘

- 처리 시작 시 각 업로드 항목의 source image를 result와 연결하되 data URL 복제는 하지 않는다.
- `lastResults`에 session-only `sourceImage` 참조와 `sourceWidth/sourceHeight`를 추가한다.
- 모달을 열 때 원본 canvas를 lazy 생성하고 닫을 때 참조를 해제한다.
- 결과 display size는 `result.width × viewScale`이다.
- 원본 pane은 source 전체를 결과 pane과 같은 CSS display width/height에 맞춰 보여 주되 원본 canvas pixel dimensions는 유지한다. 이렇게 geometry를 맞추고 원본 downsampling은 preview에만 적용한다.
- 결과 canvas는 `imageSmoothingEnabled=false`; 원본 preview는 smoothing on을 허용한다.

## 7. 설정·결과 인터페이스

보기 mode와 zoom은 처리 설정이나 결과 JSON에 저장하지 않는다. 현재 session의 modal state만 유지하며 페이지 reload 시 `결과`와 화면 맞춤으로 돌아간다. IndexedDB에도 원본을 저장하지 않는다.

## 8. 호환·경계조건

- 기존 zoom 1~24 slider, pan, grid, expanded mode를 유지한다.
- quick button이 현재 slider 범위 안에서 정확한 값을 설정한다.
- 나란히에서 grid overlay는 결과 pane에만 나타난다.
- scale mode에 따라 source/result aspect가 다르면 각 pane 중앙에 letterbox하고 왜곡하지 않는다.
- 결과가 화면보다 커도 pan과 focus가 유지된다.
- 모달 close 후 lazy source canvas가 남지 않는다.

## 9. 보안·성능·접근성

- 최대 한 결과의 source preview만 동시에 만든다.
- 원본 data URL을 로그나 JSON에 새로 저장하지 않는다.
- segmented buttons는 명확한 group label과 pressed 상태를 가진다.
- 모드 전환 후 focus를 유지하고 스크롤 중심을 보존한다.

## 10. 예상 변경과 순서

- `pixelate_studio.html`: modal layout/CSS, result source ref, quick view/view mode, cleanup
- QLT 또는 UI 검사: scale state와 source fallback
- README/CHANGELOG 및 CSP hash

순서: result data model → modal state 함수 → quick scale → A/B layout → fallback → mobile/accessibility → tests.

## 11. 자동 테스트

- quick 1/2/8이 slider와 canvas CSS dimensions를 정확히 설정
- view mode 전환 시 source/result canvas 수와 label 정확
- 로그 복원 결과는 source buttons disabled
- modal close 시 active source/result ref null
- result grid overlay가 source pane에 복제되지 않음
- 기존 pan/reset/escape 상태 회귀 없음

## 12. 브라우저 수동 QA

non-square factor 결과, square 결과, 큰 source, 작은 16×16 결과, 로그 복원 결과를 desktop/mobile에서 확인한다. keyboard Tab, Enter/Space, Escape, pan 중심 보존을 점검한다.

## 13. 수용 기준

- 1×·2×·8× 실제 CSS 크기 정확
- 원본과 결과가 왜곡 없이 같은 비교 프레임에 정렬
- source 없는 결과가 오류 없이 명확히 fallback
- modal close 후 메모리 참조 해제
- 기존 zoom/pan/grid/expanded 회귀 없음

## 14. 완료 증거

1×/2×/8× 및 desktop/mobile A/B 캡처, 로그 fallback 캡처, UI 검사 출력을 연결한다.

## 15. Luna xhigh 실행 지시문

> UX-001만 구현한다. 기존 모달 zoom/pan/grid/expanded 동작을 유지하면서 1×/2×/8× quick buttons와 결과/원본/나란히 mode를 추가한다. 원본은 session-only 참조와 lazy canvas로 처리하고 IndexedDB나 JSON에 저장하지 않는다. 로그 복원 결과에서는 source 기능을 명확히 disable한다. 모바일 stacking, keyboard, focus, cleanup, CSP 해시와 회귀 검사를 완료한다.

## 16. 중단·상향 조건

- source/result geometry를 맞추려면 처리 pipeline의 좌표 변환 metadata가 추가로 필요하면 GEO-001 명세와 충돌 여부를 먼저 보고한다.
- 대형 원본 lazy canvas가 메모리 제한을 넘으면 PERF-001로 넘기고 임의 축소 저장을 하지 않는다.

## 2026-09-06 현재 소스 재검증

원본 참조 유실 및 모달 키보드/focus 보완. 1/2/8배·로그 fallback·pan·모바일 A/B·닫기 cleanup을 기록했다. [증거 및 남은 완료 조건](../../evidence/completion-20260906/README.md). 전체 36/37 검사로 최종 DONE은 보류한다.

## 2026-09-06 최종 판정

현재 소스 전체 자동 검사 37/37, 항목별 브라우저·결정성·무결성 증거를 확인해 `DONE`으로 갱신했다. 앞의 NEEDS_REVIEW 기록은 검증 진행 중의 이력이다. [최종 보고서 및 검증 환경·한계](../../evidence/completion-20260906/README.md).
