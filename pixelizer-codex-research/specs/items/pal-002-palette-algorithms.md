# PAL-002 — OKLab·MedianCut·image-balanced/reference 팔레트 실험

## 1. 메타데이터

| 항목 | 값 |
|---|---|
| 명세 상태 | 완료 |
| 구현 상태 | 보완 필요 — 알고리즘은 구현됐으나 16색 preset 승격 gate와 temporal 정책이 수용 기준을 만족하지 못함 |
| QA 상태 | FAIL — 자동·브라우저 증거는 무결성을 통과했으나 독립 Sol xhigh 재검토에서 승격 조합의 temporal 10% 상한 위반 확인 |
| 채택 상태 | REJECTED_PENDING_FIX — `oklab-animation-stable` 16색 opt-in preset은 현재 증거로 승격 불가 |
| 우선순위 | P3 |
| 근거 분류 | SOURCE-BACKED + EXPERIMENTAL |
| 구현 모델 | Sol xhigh |
| 선행 항목 | QLT-001, PAL-001 |

## 2. 목표와 사용자 완료 상태

현재 deterministic sRGB K-means를 기준으로 OKLab K-means, MedianCut, sampling policy를 동일 corpus에서 비교한다. 기본 palette 알고리즘과 palette index를 검증 전에는 바꾸지 않는다.

## 3. 현재 문제와 근거

Source 02 공개 구현은 OKLab K-means/MedianCut을 포함하지만 정지 화질 향상을 보장하지 않는다. 큰 이미지·넓은 면이 palette slot을 독식할 수 있다. Source 07의 결과는 172~203색이라 16색 자체도 범용 정답이 아니다.

## 4. 포함·비포함 범위

포함: sRGB baseline, deterministic OKLab K-means, deterministic MedianCut, pixel/image-balanced/reference sampling, mapping error report.

비포함: material segmentation, neural palette, palette animation interpolation, default colors 변경, 외부 코드 복사.

## 5. UI 명세

실험 기능 표시 시:

- `팔레트 생성`: `현재 K-means (기본)`, `OKLab K-means`, `MedianCut`
- `샘플 가중`: `전체 픽셀 비례 (기본)`, `이미지별 균등`, `참조 이미지`
- reference 선택 시 업로드 파일명 select. 해당 파일이 제거되면 첫 파일로 자동 대체하지 않고 선택 오류 표시.
- 결과 metadata: algorithm, sampling, 평균/95%/최대 OKLab error.
- custom/unlimited mode에서는 controls disabled.

## 6. 알고리즘 정의

OKLab conversion은 표준 sRGB→linear→LMS→cube-root→OKLab과 inverse를 고정 상수로 구현하고 각 최종 RGB만 0~255 clamp/round한다.

K-means:

- baseline 초기 center 규칙은 현재 그대로.
- OKLab 후보도 같은 input-position deterministic 초기 center, 10 iterations, empty cluster는 이전 center 유지.
- center 반환 후 sRGB로 변환하고 exact duplicate를 제거한다. 부족 slot은 사용 빈도 높은 미선택 input color로 deterministic 보충한다.

MedianCut:

- alpha≥threshold RGB samples.
- box 선택: channel range 최대, tie R→G→B; box tie는 population, first sample index.
- split channel sort 안정, median population split.
- representative는 alpha-weighted sRGB mean.

Sampling:

- pixel: 현재 stride max 50,000.
- image-balanced: 파일별 `floor(50000/fileCount)`를 입력 위치 stride로 뽑고 남는 slot은 filename 순서로 1개씩 배정.
- reference: 선택 이미지에서만 최대 50,000.

## 7. 설정·결과 인터페이스

```json
{
  "paletteAlgorithm": "kmeans-srgb",
  "paletteSampling": "pixel",
  "paletteReference": null
}
```

enum은 `kmeans-srgb|kmeans-oklab|median-cut`, `pixel|image-balanced|reference`. reference는 설정 JSON에 filename만 저장하며 import 시 파일이 없으면 실행 전 오류다.

`processing.palette`에 algorithm, sampling, reference name, sample count, iterations, error summary를 기록한다.

## 8. 실험 설계

- 기준선: kmeans-srgb + pixel sampling
- 후보: 알고리즘 또는 sampling 한 축만 변경
- 고정 변수: geometry, representative mean-srgb, alpha binary10, cleanup off, outline off, dither off, colors 8/16/32/64
- 지표: 평균/95%/최대 OKLab error, slot usage, feature error, temporal palette index variance, 1× blind preference
- 채택: 평균 error 5% 이상 감소 또는 blind preference 60% 이상이며 feature/temporal 지표 10% 초과 악화 없음
- 폐기: 결정성 실패, 후보가 어떤 palette size에서도 기준선 이득 없음, 처리시간 3배 초과

## 9. 호환·경계조건

- 기본 kmeans-srgb/pixel hash와 palette order 불변.
- colors가 unique sample보다 크면 unique 수만 반환.
- empty/transparent input은 현재 처리와 같은 empty palette.
- reference 파일명 동률은 addedIndex로 구분하지만 export에는 name만 있으므로 중복 filename이면 reference mode를 거부하고 이름 변경 안내.
- shared off일 때 image-balanced는 각 파일 단독 pixel과 같으며 UI에서 disabled한다.

## 10. 보안·성능·접근성

- `MAX_PALETTE_SAMPLES`, `MAX_COLOR_COMPARISONS` 유지.
- OKLab과 sorting runtime/heap을 fixture별 기록한다.
- 큰 sample sort가 main thread를 막으면 product 연결을 중단하고 PERF-001로 넘긴다.
- disabled 이유와 실험 경고를 텍스트로 제공한다.

## 11. 예상 변경과 순서

- `pixelate_studio.html`: color conversion, candidate algorithms, sampling UI/settings/report
- QLT palette matrix와 `scripts/palette-algorithm-check.mjs`
- evidence report; 채택 전 일반 preset/README 홍보 금지

순서: conversion exact tests → algorithms → sampling → matrix report → UI flag → performance → evidence.

## 12. 자동 테스트

- sRGB↔OKLab known values와 round trip tolerance ≤1 channel
- K-means deterministic center/order
- MedianCut range/split/tie/empty rules
- image-balanced per-file sample counts
- reference missing/duplicate name 오류
- duplicate center 보충 규칙
- baseline hash 불변
- 두 번 실행 candidate hash 동일

## 13. 브라우저 수동 QA

gradient, sprite, photo-like, multi-file 큰 배경+작은 캐릭터, animation을 8/16/32/64색에서 actual-size A/B한다. 색오차 감소와 식별성·flicker를 별도로 기록한다.

## 14. 수용 기준

exact conversion·결정성·상한 통과, baseline 불변, candidate matrix와 blind 기록 완료. 채택 임계값을 넘은 조합만 별도 preset 승격 검토 대상이다.

## 15. 완료 증거

palette matrix JSON, sample count report, 1× blind 결과, runtime/heap, baseline hash를 연결한다.

## 16. Luna/상위 모델 실행 지시문

이 항목은 Sol xhigh를 사용한다.

> PAL-002만 구현한다. 외부 코드를 복사하지 말고 표준 OKLab 변환, deterministic K-means, 명세의 MedianCut tie-break, pixel/image-balanced/reference sampling을 순수 함수로 구현한다. baseline kmeans-srgb/pixel palette order와 hash를 유지한다. 각 실험은 한 축만 바꾸고 8/16/32/64색 matrix, error, temporal variance, runtime을 기록한다. 후보를 default나 preset으로 승격하지 않는다. xhigh에서도 증거가 상충하면 Sol max 검토로 넘긴다.

## 17. 중단·상향 조건

- OKLab 표준 상수나 inverse round trip이 테스트 허용치를 넘으면 product UI를 연결하지 않는다.
- 지표와 actual-size 선호가 상충하거나 palette order 안정화가 안 되면 Sol max로 상향한다.
- main-thread 병목은 PERF-001 전에 임의 최적화하지 않는다.

## 18. 구현·검증 결과 (2026-08-25 KST)

- 구현: `kmeans-srgb`, deterministic `kmeans-oklab`, deterministic `median-cut`, `pixel`/`image-balanced`/`reference` sampling을 실험 기능 표시 아래 연결했다. OKLab 공유 다중 프레임은 이전 프레임의 palette index가 최적값과 OKLab squared-distance `0.00025` 이내이면 이전 index를 유지한다. 첫 프레임·다른 치수·투명→불투명 전환에는 유지 규칙을 적용하지 않는다.
- 호환: 초기화·legacy 설정은 `kmeans-srgb` + `pixel` + `null reference`로 복원된다. 기존 baseline palette 순서와 고정 SHA-256 `8fc99dd6e6e2dffde8dec057af66e2868cfe0ddbc50bd1035bfe73681781602d`를 유지했다.
- 오류 처리: reference 파일 삭제와 동일 filename 중복을 자동 대체하지 않고 실행 전에 각각 명시적 오류로 차단했다.
- 자동 QA: 4 fixture × 8/16/32/64색 × 3 algorithm의 48행 matrix, sampling 3종, 결정성, sample 상한, 변환 round trip, tie-break와 baseline 회귀를 통과했다. sampling 평가는 512×256 배경과 128×128 캐릭터를 사용하며, pixel 44,726개와 image-balanced 24,950개 표본 및 서로 다른 palette를 확인한다. runtime은 sample 수집과 palette 생성을 분리 기록하고 합계로 채택 상한을 판정한다.
- 브라우저 QA: localhost에서 `oklab-animation-stable` preset 적용, 원본 16프레임 변환 완료, 15개 후속 프레임 metadata와 5프레임·총 180px index 유지, console error 0을 확인했다. 390×844에서는 document scroll width 382px로 가로 overflow가 없었다. 재생되는 actual-size matrix의 animation 8/16/32/64색을 새 자산으로 검수했고 16색 조합만 preset 승격 대상으로 기록했다.
- 채택 재판정: 알고리즘 전체 8/16/32/64색 평균으로는 temporal variance 악화가 2.593748%로 보이지만, 실제 preset으로 승격한 16색 조합은 baseline `0.273684`에서 OKLab `0.374737`로 `36.9232%` 악화된다. 명세의 temporal 10% 상한을 위반하므로 `oklab-animation-stable` 채택은 거부된다.
- 독립 재검토: application script SHA-256 `e894f4191815936d25db368dd73e53a1078de8ee61c094a35e505516c56f5921`에 결합한 Sol xhigh 독립 재검토는 `FAIL / CHANGES_REQUESTED`다. 조합별 eligibility 계산, 16색 temporal 실패 negative test, 하드코딩된 manual promotion gate 제거, temporal 정책 재조정 후 전체 QA와 독립 재검토를 반복해야 한다.
- 근거: [구현 출처 검증 노트](../../references/notes/pal-002-implementation-note.md), [자동·브라우저 QA 보고서](../../evidence/pal-002/README.md), [요약 JSON](../../evidence/pal-002/summary.json), [브라우저 QA JSON](../../evidence/pal-002/qa-results.json), [Sol xhigh 독립 재검토](../../evidence/pal-002/sol-xhigh-independent-rereview-2026-08-25.md).
