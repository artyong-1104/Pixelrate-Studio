# CELL-001 — 셀 대표색 A/B

## 1. 메타데이터

| 항목 | 값 |
|---|---|
| 명세 상태 | 완료 |
| 구현 상태 | NOT_STARTED |
| QA 상태 | 미실행 |
| 우선순위 | P3 |
| 근거 분류 | SOURCE-BACKED + EXPERIMENTAL |
| 구현 모델 | Sol xhigh |
| 선행 항목 | QLT-001, GEO-001 |

## 2. 목표와 사용자 완료 상태

같은 cell cut에서 sRGB mean, linear-light mean, center, median, majority를 비교한다. 현재 sRGB mean을 기본으로 유지하고 검증된 용도별 preset 전에는 실험 영역 밖으로 노출하지 않는다.

## 3. 현재 문제와 근거

Source 03은 center/median/majority를 제공하고 Source 05는 majority를 사용한다. Source 02에서는 majority가 눈·입·하이라이트를 지웠다. 조사 소스는 linear-light를 비교하지 않았다.

## 4. 포함·비포함 범위

포함: 다섯 deterministic representative, factor/grid/square cell cut, 실험 select, QLT A/B.

비포함: two-cluster majority, Weber, palette algorithm 변경, 자동 subject 분류, 기본값 변경.

## 5. UI 명세

- `실험 기능 표시`가 켜진 경우에만 `셀 대표색` select를 보인다.
- 항목: `균형 평균 (sRGB, 기본)`, `선형광 평균`, `중앙 샘플`, `중앙값`, `최빈색`.
- 기본값 외 선택 시 `실험 기능이며 작은 특징이 사라지거나 밝기가 달라질 수 있습니다.` 경고.
- 결과 metadata에 representative ID를 표시한다.

## 6. 알고리즘 정의

공통 foreground sample은 alpha ≥ threshold다.

- `mean-srgb`: 현재 alpha-weighted channel mean.
- `mean-linear`: IEC sRGB→linear 변환 후 alpha-weighted mean, linear→sRGB, round nearest.
- `center`: cell의 geometric center `floor((x0+x1-1)/2), floor((y0+y1-1)/2)`. center가 transparent면 foreground 중 Manhattan distance 최소, tie는 y/x 오름차순.
- `median`: foreground RGB 각 channel의 unweighted median. 짝수는 두 중앙값 평균 후 round half-up. alpha는 cell 평균.
- `majority`: exact RGB key 빈도 최대. tie는 alpha 합 최대, 다시 tie면 최초 row-major 등장. alpha는 cell 평균.
- foreground가 없으면 transparent black.

alpha 출력 정책은 ALP-002가 정하고 representative는 RGB만 결정한다.

## 7. 설정·결과 인터페이스

```json
{ "representativeColor": "mean-srgb" }
```

enum: `mean-srgb`, `mean-linear`, `center`, `median`, `majority`. legacy/default는 `mean-srgb`. `processing.representativeColor`에 기록한다.

## 8. 실험 설계

- 기준선: mean-srgb
- 후보: 나머지 4개
- 고정 변수: geometry, palette, alpha, cleanup off, outline off, dither off
- 지표: thinFeatureSurvival, edgeDisplacement, flatRegionVariance, featureColorError, 1× blind preference
- 채택 임계값: 후보가 지정 fixture 군에서 기준선 대비 핵심 지표 10% 이상 개선하고 다른 fixture의 silhouette/feature 생존을 5% 초과 악화하지 않음
- 폐기 기준: 기본값을 이길 fixture 군이 없거나 결정성 실패

## 9. 호환·경계조건

- original mode는 1×1 cell이므로 모든 후보가 입력 RGB와 같아야 한다.
- square의 비정수 source 영역 cut은 현재 x0/x1 정의를 그대로 사용한다.
- majority는 palette quantization 전에 실행한다.
- partial alpha sample weight는 mean 계열에만 사용하며 median/majority/center foreground membership은 threshold 기준이다.
- candidate별 output dimension은 동일해야 한다.

## 10. 보안·성능·접근성

- cell당 임시 배열은 최대 factor² 또는 source region 크기이며 전체 이미지 배열을 복제하지 않는다.
- median sort 비용과 majority Map 비용을 QLT에서 기록한다.
- 실험 경고를 색상뿐 아니라 텍스트로 제공한다.

## 11. 예상 변경과 순서

- `pixelate_studio.html`: representative helpers, advanced UI, settings/result metadata
- QLT candidate matrix와 전용 검사
- 연구 결과 evidence; 채택 전 일반 README 기능으로 홍보하지 않음

순서: pure helpers → exact fixtures → A/B report → UI flag → settings → performance → evidence.

## 12. 자동 테스트

- 각 알고리즘의 작은 2×2/3×3 exact expected RGB
- center transparent fallback/tie
- median even round rule
- majority count/alpha/first-position tie
- linear conversion known values
- empty/all-transparent cell
- default mean-srgb hash 불변
- original mode candidate equality

## 13. 브라우저 수동 QA

thin-lines, eye/highlight, hard-edge, texture, low-contrast, alpha-edge를 1×/8×에서 candidate grid로 본다. 각 후보의 장단점을 fixture ID와 함께 기록한다.

## 14. 수용 기준

모든 exact test·결정성 통과, default hash 불변, 실험 보고서 완료. 개별 후보는 채택 임계값을 넘은 fixture 용도가 있을 때만 preset 후보로 승격한다.

## 15. 완료 증거

candidate matrix report, actual-size blind 기록, runtime, default hash를 연결한다.

## 16. Luna/상위 모델 실행 지시문

이 항목은 Sol xhigh를 사용한다.

> CELL-001만 구현한다. 명세의 다섯 representative를 exact tie-break와 alpha 규칙대로 순수 함수로 만들고 QLT에서 geometry/palette/alpha를 고정해 비교한다. mean-srgb 기본 hash를 유지하고 후보는 실험 flag 아래에만 노출한다. 한 후보를 자동 추천하거나 default/preset으로 승격하지 않는다. exact unit test, visual matrix, 1× 기록, runtime, settings/CSP 회귀를 완료한다.

## 17. 중단·상향 조건

- 알고리즘 순서가 palette 단계와 충돌하면 임의 reorder하지 않고 상위 pipeline 명세를 검토한다.
- 후보별 결과가 지표와 사람 선호에서 상충하면 Sol max로 분석하되 기본값은 유지한다.

