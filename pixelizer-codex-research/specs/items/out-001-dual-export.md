# OUT-001 — native PNG + nearest 확대 PNG 이중 출력

## 1. 메타데이터

| 항목 | 값 |
|---|---|
| 명세 상태 | 완료 |
| 구현 상태 | DONE |
| QA 상태 | 완료 |
| 우선순위 | P1 |
| 근거 분류 | SOURCE-BACKED |
| 구현 모델 | Luna xhigh |
| 선행 항목 | GEO-001 |

## 2. 목표와 사용자 완료 상태

native 논리 PNG는 편집·데이터용으로 유지하고, 선택한 2×/4×/8× nearest 확대본을 게임 표시용 파생물로 함께 저장한다. 확대본의 논리 픽셀은 정확히 N×N 같은 RGBA 블록이어야 한다.

## 3. 현재 문제와 근거

현재 각 결과는 PNG 하나와 JSON 하나만 제공한다. Source 04·07은 96×168 native와 nearest-exact 768×1344 결과를 분리 저장했다. 확대본은 새 픽셀화가 아니라 native 결과의 파생물이다.

## 4. 포함·비포함 범위

포함: 2×/4×/8× 선택, 개별 다운로드, ZIP 동시 포함, on-demand canvas 생성, 파일명·JSON metadata.

비포함: arbitrary scale, bilinear/bicubic, 확대본 별도 palette/grid, IndexedDB에 모든 확대 data URL 저장.

## 5. UI 명세

- 결과/내보내기 설정에 `추가 nearest 확대본` checkbox group `2×`, `4×`, `8×`를 둔다. 기본은 모두 off다.
- 각 결과 카드의 기존 `PNG`는 native를 유지한다. 선택된 배율마다 `2× PNG` 같은 버튼을 추가한다.
- 메타에는 `추가 출력: 2×, 8×`를 표시한다.
- 확대 결과가 픽셀 제한을 넘으면 해당 checkbox를 disabled하고 `이 결과는 8× 확대 시 최대 처리량을 넘습니다.`를 보여 준다.

## 6. 데이터 흐름과 알고리즘

`createNearestCanvas(sourceCanvas, scale)` 순수 helper를 사용한다.

1. scale이 2/4/8인지 검증한다.
2. target pixel 수가 `MAX_RAW_PROCESS_PIXELS` 이하인지 검증한다.
3. target canvas 크기를 source×scale로 설정한다.
4. `imageSmoothingEnabled = false` 후 `drawImage`로 정수 크기에 그린다.
5. 다운로드 직전에 생성하고 blob을 만든 뒤 canvas 참조를 해제한다.

ZIP도 순차 생성해 동시에 여러 확대 canvas를 메모리에 잡지 않는다.

## 7. 설정·결과·파일명

설정:

```json
{ "exportNearestScales": [2, 8] }
```

정렬·중복 제거 후 `[2,4,8]` 순서로 저장한다. invalid 값은 import 전체를 거부한다.

결과 JSON additive field:

```json
{ "exports": { "native": true, "nearestScales": [2, 8] } }
```

파일명:

- native: 기존 `${stem}_${dims}.png` 유지
- 확대: `${stem}_${nativeDims}_2x.png`
- JSON: 기존 이름 하나만 유지
- ZIP: native, 선택 확대 PNG, JSON 하나

## 8. 호환·경계조건

- 기존 설정에는 빈 배열을 기본 적용한다.
- original·square·preserve-sheet·factor 모두 지원한다.
- outline을 포함한 최종 native canvas 전체를 확대한다.
- width×scale 또는 height×scale가 canvas 제한을 넘으면 생성하지 않는다.
- 일부 결과만 제한을 넘는 multi-file ZIP은 실행 전에 결과별 가능 배율을 계산하고, 불가능한 파일/배율을 경고한 뒤 가능한 산출물만 포함한다. 누락 목록을 ZIP 완료 메시지에 표시한다.

## 9. 보안·성능·접근성

- 파생 canvas는 IndexedDB에 저장하지 않아 로그 용량을 늘리지 않는다.
- ZIP은 result→scale 오름차순으로 생성하고 각 blob 이후 임시 canvas를 해제한다.
- checkbox group에 fieldset/legend를 쓰고 disabled 이유를 텍스트로 연결한다.
- 확대 버튼은 정확한 출력 치수를 aria-label에 포함한다.

## 10. 예상 변경과 순서

- `pixelate_studio.html`: export UI, settings/log, helper, result buttons, ZIP
- QLT 전용 검사: N×N block 균일성, 파일명, 픽셀 제한
- README/CHANGELOG: native와 파생 출력 설명

순서: helper 테스트 → settings → 개별 다운로드 → ZIP → 로그 복원 → UI/문서 → CSP hash.

## 11. 자동 테스트

- 3×2 RGBA를 2×·4×·8× 확대했을 때 모든 source pixel이 정확한 N×N block
- smoothing off와 target dimensions 검증
- scale 1,3,16, NaN 거부
- 기존 native 파일명 불변, 파생 suffix 정확
- ZIP entry 순서와 JSON 중복 없음
- 픽셀 제한 초과 배율 미생성·경고 목록
- 로그 복원 시 확대본을 재생성할 수 있음

## 12. 브라우저 수동 QA

2×/8× 버튼, ZIP, 모바일 줄바꿈, 키보드 checkbox를 확인한다. native와 확대 PNG를 다시 업로드해 색 수가 같고 각 block이 균일한지 확인한다.

## 13. 수용 기준

- 선택하지 않으면 기존 결과와 ZIP이 byte-for-byte 동일
- 선택 배율의 크기·block 균일성 100%
- 확대본이 palette·alpha를 새로 계산하지 않음
- 제한 초과가 crash나 silent omission이 아님
- 동일 설정 2회 ZIP entry와 PNG hash 일치

## 14. 완료 증거

native/2×/8× sample, block 검사 결과, ZIP 목록, 제한 초과 캡처를 대시보드에 연결한다.

## 15. Luna xhigh 실행 지시문

> OUT-001만 구현한다. native 결과는 기존 파일명·canvas·JSON을 유지하고 2×/4×/8× nearest 파생 PNG를 선택적으로 on-demand 생성한다. smoothing을 끄고 block 균일성을 테스트한다. 확대 canvas를 로그에 저장하지 말고 ZIP에서 순차 생성한다. 픽셀 제한 초과는 배율별로 명확히 경고한다. settings, 로그 복원, 개별 다운로드, ZIP, 접근성, CSP 해시와 모든 회귀 검사를 완료한다.

## 16. 중단·상향 조건

- 브라우저별 canvas 최대 크기 차이로 명시된 제한만으로 안전하지 않으면 실제 capability probe 제안을 보고하고 중단한다.
- ZIP 메모리 사용이 기존 전체 제한에서 안정적이지 않으면 PERF-001로 넘긴다.

