# Pixelate Studio 시각 품질 테스트 계획

## 1. 목표

시각 알고리즘을 한 장의 선별 이미지로 평가하지 않는다. 모든 후보는 같은 fixture, 설정, 기준선, 지표로 비교하고 실제 게임 표시 크기와 시간축을 함께 본다.

## 2. Fixture corpus

QLT-001은 아래 ID를 가진 결정적 fixture를 생성한다. 생성기는 외부 이미지나 네트워크에 의존하지 않고 seed `20260814`를 사용한다.

| Fixture ID | 크기·형식 | 내용 | 검증 대상 |
|---|---|---|---|
| `gradient-gray` | 256×64 RGBA | 검정→흰색 수평 gradient | banding, palette error, dither |
| `hard-edge-phase` | 192×128 RGBA | 3/4/8px 셀과 의도적 1px phase offset | grid period/phase, edge 이동 |
| `thin-lines` | 192×192 RGBA | 1px·2px 수평/수직/대각선·곡선 | 세부 생존, line-aware |
| `alpha-edge` | 128×128 RGBA | binary 원과 16단계 soft edge, 작은 island | alpha topology, fringe |
| `low-contrast` | 160×120 RGBA | ΔRGB 4~20의 면·선 | Sobel false negative |
| `texture-checker` | 192×128 RGBA | checker, noise, 규칙 dither | majority, dither 보존 |
| `clean-pixel-art` | 128×128 RGBA | 이미 4× 정렬된 sprite | 무변형, grid false positive |
| `ai-grid-wobble` | 256×256 RGBA | 8px 셀 경계를 ±1px 흔들고 내부 색 혼합 | auto grid와 대표색 |
| `photo-like` | 256×192 RGBA | 결정적 다중 gradient·shape·noise | grid 감지 실패, palette |
| `sprite-sheet` | 256×128 RGBA | 64×64 8프레임, 경계 인접 픽셀 | frame isolation |
| `animation-16` | 16× 64×64 RGBA | 이동·점멸·palette ramp가 있는 16프레임 | temporal variance |
| `non-square-factor` | 480×702 RGBA | 3배 축소해 160×234가 되는 비정사각 sprite | exact factor, 치수 |

각 fixture manifest는 `id`, `generatorVersion`, `width`, `height`, `alphaKind`, `knownGrid`, `knownFeatures`, `expectedFailure`를 가진다.

## 3. 기준선

- geometry: 현재 square Box와 preserve-sheet 4×
- representative: alpha-weighted sRGB mean
- palette: 현재 deterministic sRGB K-means
- alpha: threshold 10 binary
- outline: 기존 4방향 1px 검정
- dither: off

기준선 PNG·JSON SHA-256은 QLT-001 완료 시 manifest에 기록한다. 의도적으로 동작을 바꾸는 항목은 기존 hash 차이를 승인된 fixture와 이유에 한해 갱신한다.

## 4. 정량 지표

### 4.1 Geometry

- `periodError = abs(detectedPeriod - expectedPeriod)`
- `phaseError = min(mod(abs(detectedPhase-expectedPhase), period), period - mod(...))`
- `edgeDisplacement`: 기준 edge 좌표와 결과 edge 좌표 사이 Manhattan 거리의 평균·95백분위
- `falsePositiveGrid`: `photo-like`에서 confidence 0.5 이상이면 실패

### 4.2 Detail

- `thinFeatureSurvival = survivingMarkedPixels / expectedMarkedPixels`
- `flatRegionVariance`: 단색 정답 영역의 RGB 분산
- `featureColorError`: 표시된 눈·입·하이라이트 위치의 RGB 또는 OKLab 거리

### 4.3 Alpha

- 4-neighbor connected component 수
- hole 수와 largest component 면적
- `fringeCount`: 정답 transparent인데 결과 alpha가 threshold 이상인 픽셀
- partial-alpha MAE
- 프레임 경계 밖 foreground 수

### 4.4 Palette

- 고유색 수와 palette slot 사용률
- 평균·95백분위·최대 OKLab Euclidean mapping error
- reference ramp의 hue order 역전 수
- 프레임별 palette index variance

### 4.5 Temporal

- 정지 영역에서 프레임 간 변경된 픽셀 비율
- 같은 semantic marker의 palette index 변경 횟수
- grid period/phase variance
- alpha silhouette 중심점 jitter

### 4.6 결정성·성능

- 동일 실행 2회의 PNG·JSON SHA-256
- cold/warm wall time
- 50ms 이상 main-thread long task 수와 최대 길이
- peak JS heap 또는 측정 불가 시 입력·중간 canvas 예상 byte 합

## 5. 비교 규칙

1. 한 실험에서 geometry, representative, palette, alpha, outline, dither 중 한 축만 바꾼다.
2. 모든 후보는 같은 manifest 순서로 실행한다.
3. 자동 지표가 좋아도 1×에서 식별성이 낮아지면 채택하지 않는다.
4. 정지 이미지 이득이 animation temporal variance를 악화시키면 static-only로 제한한다.
5. 평균만 보고 소수의 치명적 회귀를 숨기지 않도록 fixture별 결과와 95백분위를 함께 기록한다.

## 6. 실제 크기·수동 검수

각 결과는 다음 순서로 검수한다.

1. 1×: 게임의 native 표시 크기
2. 2×: 일반 nearest 확대 표시
3. 8× + grid: 셀 경계·mixel 진단
4. checker, white, black, green, magenta, cyan 배경
5. animation 8fps와 12fps loop
6. 원본/결과 side-by-side

수동 기록은 fixture ID, 후보 설정, 선호 결과, 이유를 남긴다. “더 예쁨”만 쓰지 않고 silhouette, 작은 특징, 경계, 색, flicker 중 어느 축인지 표시한다.

## 7. 항목별 채택 게이트

- GEO-001·OUT-001: 치수·block 균일성·파일명 100% 정확, 기존 모드 hash 유지
- GRID-001: 정렬 fixture period/phase 오차 0, wobble fixture 각 축 오차 ≤1px, photo false positive 0
- CELL-001: 기본값 미변경, 후보가 최소 한 fixture 군에서 개선되고 다른 군의 치명 회귀 없음
- PAL-002: 평균 OKLab error 5% 이상 감소 또는 blind preference 60% 이상, temporal variance 10% 초과 악화 금지
- ALP-002: binary 기준선 hash 유지, coverage partial-alpha MAE 개선, topology 회귀 없음
- DIT-001: gradient banding 개선과 static 1× 선호를 모두 충족, animation 기본 off
- EDGE-001: thinFeatureSurvival 10% 이상 개선, flat region false line 1% 미만
- PERF-001: 결과 hash 동일, 취소·진행률·메모리 상한 통과

## 8. 보고서 형식

QLT-001 보고서는 다음 구조를 사용한다.

```json
{
  "schemaVersion": 1,
  "generatedAt": "ISO-8601",
  "implementationId": "GEO-001",
  "settings": {},
  "environment": {},
  "fixtures": [],
  "summary": {
    "passed": 0,
    "failed": 0,
    "deterministic": true
  }
}
```

`generatedAt`은 보고용이며 hash 비교 대상에서 제외한다. 결과 hash는 fixture ID와 normalized settings 순서로 계산한다.
