# EDGE-001 — Weber/line-aware 축소와 selout 실험

## 1. 메타데이터

| 항목 | 값 |
|---|---|
| 명세 상태 | 완료 |
| 구현 상태 | DONE |
| QA 상태 | 완료 — exact·회귀·결정성·localhost 브라우저·모바일·키보드 QA 통과 |
| 우선순위 | P3 |
| 근거 분류 | SOURCE-BACKED + EXPERIMENTAL |
| 구현 모델 | Sol xhigh |
| 선행 항목 | QLT-001, CELL-001 |

## 2. 목표와 사용자 완료 상태

작은 눈·선·장신구가 mean 축소에서 사라지는 입력을 위해 line coverage blend와 silhouette selout을 독립 실험한다. 기존 투명 바깥 고정색 outline과 별도 기능이며 기본 off다.

## 3. 현재 문제와 근거

Source 02는 majority가 작은 특징을 지웠고 Weber 대비 가중·고해상도 line 합성·selout이 자체 예시에서 유용했다고 보고했다. 한 화풍의 자체 결과이므로 ablation이 필요하다.

## 4. 포함·비포함 범위

포함: local dark-line mask, cell line coverage/color, base blend, outer silhouette selout, 단계별 toggle·report.

비포함: learned edge detector, semantic face detector, colored line segmentation, 자동 preset, 기존 outline 제거.

## 5. UI 명세

실험 영역:

- `세부 선 보존` off 기본
- threshold 5~50%, 기본 20
- blend strength 0~100%, 기본 60
- `실루엣 selout` 별도 off, darken 5~50%, 기본 20
- 기존 outline과 동시에 켜면 `서로 다른 두 외곽선 효과가 중첩됩니다.` 경고하되 실행은 허용
- 결과 metadata에 line candidate/covered cell/selout pixel 수 표시

## 6. 알고리즘

Line mask:

1. alpha≥threshold인 source pixel의 sRGB luma를 계산한다.
2. 같은 alpha 조건의 3×3 이웃 luma mean을 구한다. 유효 이웃 3개 미만이면 후보 아님.
3. `pixelLuma <= localMean*(1-lineThreshold)`이면 dark-line candidate.
4. 각 output cell에서 candidate alpha-weighted RGB, candidate count, foreground count를 계산한다.
5. coverage=`candidateCount/foregroundCount`.
6. base representative RGB와 line RGB를 `coverage × blendStrength`로 sRGB blend한다.

Selout:

- logical foreground 중 4-neighbor 하나 이상이 transparent인 기존 전경 픽셀만 대상.
- RGB를 `1-darken`으로 sRGB multiply, alpha와 grid geometry는 유지.
- frame 경계 밖은 sheet frame의 transparent로 취급하지 않는다. 실제 frame 내부 바깥만 silhouette다.

## 7. 설정·결과 인터페이스

```json
{
  "lineAware": {"enabled": false, "threshold": 0.2, "strength": 0.6},
  "selout": {"enabled": false, "darken": 0.2}
}
```

`processing.detailPreservation`에 설정과 line/selout counts를 기록한다. default off에서는 필드를 생략하거나 enabled false로 안정적으로 기록하되 기존 root 의미를 바꾸지 않는다.

## 8. 실험 설계

- 기준선: CELL-001 mean-srgb, 기존 outline off
- 후보: line-only, selout-only, combined
- 고정 변수: geometry, palette off 또는 256색, alpha binary10, cleanup off, dither off
- 지표: thinFeatureSurvival, featureColorError, flatRegion false-line ratio, silhouette contrast, 1× 선호
- 채택: thinFeatureSurvival 10% 이상 개선, false-line <1%, painterly/photo fixture 치명 왜곡 없음
- 폐기: 어두운 피부·의상·그림자를 선으로 오인하거나 feature improvement가 기준 미달

## 9. 호환·경계조건

- enabled false는 기준선 hash 동일.
- all-dark/all-flat/low-contrast/transparent cell에서 divide-by-zero 없이 base 유지.
- line blend는 palette quantization 전에 수행한다. selout은 palette mapping 후 색 index를 직접 어둡게 만들 수 없으므로 selout color를 palette에 추가하거나 nearest remap해야 한다. v1은 selout RGB를 만든 뒤 전체 palette mapping 전에 적용하는 순서로 고정한다.
- 기존 outline은 palette mapping 후 적용한다.
- sheet frame 이웃을 읽지 않는다.

## 10. 보안·성능·접근성

- 3×3 local sum은 integral image 또는 rolling sum으로 O(N) 구현한다. naive 9N도 4M에서 계측 후 허용할 수 있으나 중간 배열 상한을 기록한다.
- source luma/mask typed array 예상 메모리를 report에 포함한다.
- 실험 경고와 중첩 경고를 aria-live로 제공한다.

## 11. 예상 변경과 순서

- `pixelate_studio.html`: luma/mask/cell blend/selout helpers, experimental UI/settings/report
- QLT thin-line/painterly/photo ablation
- evidence report; 채택 전 preset/README 일반 기능 금지

순서: line mask exact tests → cell blend → selout/frame tests → ablation → UI → performance → evidence.

## 12. 자동 테스트

- local mean/threshold exact fixture
- insufficient neighbors/all-transparent
- coverage/blend expected RGB
- selout 4-neighbor silhouette와 frame boundary
- off baseline hash
- combined stage order
- line/selout counts
- 두 번 실행 결정성

## 13. 브라우저 수동 QA

thin-lines, 작은 얼굴 특징, dark clothing, shadow, low-contrast, texture, photo-like, transparent sheet를 1×/8×에서 stage별로 본다. 기존 outline과 중첩도 확인한다.

## 14. 수용 기준

실험 채택 지표 충족, off hash 불변, frame crossing 0, false-line <1%, runtime/memory 보고, actual-size 선호 기록 완료.

## 15. 완료 증거

stage ablation contact sheet, feature/false-line report, sheet boundary test, runtime, baseline hash를 연결한다.

## 16. Luna/상위 모델 실행 지시문

이 항목은 Sol xhigh를 사용한다.

> EDGE-001만 구현한다. 명세의 alpha-masked 3×3 local dark-line, cell coverage blend, 4-neighbor silhouette selout을 독립 stage로 구현한다. pipeline은 line blend/selout RGB 후 palette mapping, 기존 outline 후순서로 고정한다. dark clothing·shadow·photo false-line을 QLT ablation으로 측정하고 default/preset은 off로 유지한다. frame 경계·결정성·메모리·CSP 회귀를 완료한다.

## 17. 중단·상향 조건

- selout과 제한 palette의 stage order가 색 수를 불안정하게 만들면 product 연결을 중단하고 palette-aware selout 후속 명세를 작성한다.
- false-line 기준을 넘으면 threshold를 fixture에 과적합하지 말고 항목을 DEFERRED로 전환한다.

## 18. 구현·검증 완료 기록

완료일: 2026-08-27 (KST)

구현 결과:

- 실험 영역에 `세부 선 보존 (실험)`과 `실루엣 selout (실험)`을 서로 독립된 기본 off 옵션으로 추가했다.
- 설정 JSON은 `lineAware.enabled/threshold/strength`와 `selout.enabled/darken`을 엄격히 검증하며, 해당 필드가 없는 legacy 설정은 명세 기본값으로 복원한다.
- alpha-masked 3×3 dark-line 후보 검출, cell coverage blend, logical-frame 4-neighbor selout을 구현했다. 처리 순서는 line blend → selout RGB → palette mapping → 기존 outline이다.
- 결과 JSON과 카드에 line candidate, covered cell, selout pixel 및 중간 typed-array 메모리 정보를 기록한다.
- 기존 outline과 동시에 활성화하면 명세의 중첩 경고를 `aria-live`로 표시한다. 체크박스는 키보드 Space 전환과 옵션의 disabled/visible 상태를 동기화한다.
- 기본값과 기존 preset은 모두 off로 유지했다. 채택 게이트 통과는 구현 실험의 완료 판정이며, 일반 preset 승격이나 기본값 변경을 의미하지 않는다.

자동 검증:

- `node scripts/edge001-check.mjs`: exact threshold, 유효 이웃 수, coverage blend, frame 경계, selout, alpha 불변, 단계 순서, 결정성, off hash, 4M 계측 통과.
- `node scripts/settings-check.mjs`: nested 설정 round trip, legacy 기본값, strict validation, preset diff 통과.
- `node scripts/generate-edge001-evidence.mjs`: 품질 fixture, ablation, 증거 hash 및 브라우저 캡처 무결성 통과.
- `for f in scripts/*check.mjs; do node "$f"; done`: 29개 프로젝트 검사 스크립트 통과.
- `git diff --check`: 통과.

정량 결과:

- thin-feature contrast 개선: **52.11%** (기준: 10% 이상).
- 최대 flat-region false-line ratio: **0.000%** (기준: 1% 미만).
- low-contrast, texture, photo-like fixture 치명 왜곡: **없음**.
- transparent sheet의 cross-frame line candidate: **0**, selout pixel: **40**, alpha hash 안정.
- disabled baseline SHA-256: `5cf372d719ce5428b936b424928892abab8e58dadb84dcf41785803cff2d2c90`.
- 4,194,304px line-mask 계측: **1971.624ms**, typed-array peak **25,165,824 bytes**. 현재 naive bounded-neighbor O(N) 구현은 명세가 허용한 계측 조건을 충족하며, Worker 이전 여부는 PERF-001에서 별도 평가한다.

localhost 브라우저 QA:

- `http://localhost:8000/pixelate_studio.html?qa=edge001-20260827`에서 baseline, line-only, selout-only, combined를 7개 fixture로 비교했다.
- 작은 얼굴을 1×/8×로 확인했고, transparent sheet logical-frame 격리, 기존 outline 중첩 경고·출력 padding, 결과 metadata를 확인했다.
- 390×844 모바일에서 가로 overflow가 없고 모든 EDGE 제어가 노출됨을 확인했다.
- 체크박스 focus/Space off→on·on→off, 옵션 상태 동기화, main/sheet console warning·error 0건을 확인했다.

증거:

- [자동·브라우저 QA 요약](../../evidence/edge-001/README.md)
- [정량 결과 JSON](../../evidence/edge-001/automated-results.json)
- [브라우저 QA JSON](../../evidence/edge-001/browser-qa.json)
- [native 단계별 ablation](../../evidence/edge-001/stage-ablation-native.png)
- [8× 단계별 ablation](../../evidence/edge-001/stage-ablation-8x.png)
