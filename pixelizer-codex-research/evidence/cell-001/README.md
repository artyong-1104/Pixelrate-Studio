# CELL-001 검증 증거 및 A/B 보고서

상태: `DONE`  
생성 시각: 2026-08-23T07:07:47.216Z

## 결론

- 기본값은 `mean-srgb`로 유지한다.
- 일반 preset으로 승격한 후보는 없다. 모든 후보는 `실험 기능 표시` 아래에만 유지한다.
- center는 셀 중앙 특징에는 강하지만 비중앙 특징을 잃고, median/majority는 1px 눈·하이라이트를 제거한다.
- mean-linear는 작은 밝은 특징의 기여를 키우지만 여러 fixture에서 기준선 대비 밝기·경계색이 광범위하게 달라 범용 우위로 채택하지 않는다.

## 고정 변수

- geometry: exact factor 4
- palette: unlimited
- alpha: binary threshold 10
- cleanup/outline/dither: off

## 후보 매트릭스

셀 값은 `runtime / sRGB 기준선 대비 변경 픽셀 비율`이다.

| fixture | mean-srgb | mean-linear | center | median | majority |
|---|---:|---:|---:|---:|---:|
| eye-highlight | 1.087ms / 0.000 | 6.373ms / 0.031 | 1.607ms / 0.031 | 1.437ms / 0.031 | 1.438ms / 0.031 |
| thin-lines | 4.497ms / 0.000 | 6.027ms / 0.046 | 3.760ms / 0.046 | 4.971ms / 0.046 | 5.022ms / 0.046 |
| hard-edge-phase | 2.846ms / 0.000 | 35.835ms / 0.917 | 6.867ms / 0.917 | 5.065ms / 0.720 | 6.327ms / 0.917 |
| texture-checker | 3.018ms / 0.000 | 37.666ms / 1.000 | 7.105ms / 1.000 | 7.304ms / 0.824 | 6.587ms / 1.000 |
| low-contrast | 2.200ms / 0.000 | 27.952ms / 0.003 | 5.614ms / 0.107 | 3.801ms / 0.078 | 4.182ms / 0.107 |
| alpha-edge | 1.812ms / 0.000 | 11.675ms / 0.000 | 3.059ms / 0.000 | 2.499ms / 0.000 | 2.381ms / 0.000 |
| clean-pixel-art | 1.646ms / 0.000 | 6.005ms / 0.000 | 2.350ms / 0.000 | 1.977ms / 0.000 | 2.049ms / 0.000 |
| ai-grid-wobble | 7.755ms / 0.000 | 98.003ms / 0.638 | 17.984ms / 0.952 | 16.467ms / 0.828 | 18.759ms / 0.944 |

## 시각 증거

- [native candidate matrix](candidate-matrix-native.png) — 열 순서: mean-srgb, mean-linear, center, median, majority
- [8× candidate matrix](candidate-matrix-8x.png) — nearest 확대, 같은 열 순서
- [eye/highlight fixture](fixture-eye-highlight.png)
- [browser-default-hidden.png](browser-default-hidden.png) — 1272×738, SHA-256 `ded133bdd1623033a3a25c9c2d77e300efbb2854b2ae2cdfa4e513662fc1ca89`
- [browser-center-8x.png](browser-center-8x.png) — 1272×716, SHA-256 `5240f88e8649f6e1236fa2696ac5761fba6eb706a36a08126a4d9c5f6f8a53f6`
- [browser-mobile-majority.png](browser-mobile-majority.png) — 382×827, SHA-256 `3ccc471b027dedece7ec87bbf1c908d2ce4fb1e258f3b9c694c94fd07f0f85c6`
- [browser-settings-roundtrip.png](browser-settings-roundtrip.png) — 1272×738, SHA-256 `b251d1d772c533b625d3185683adae0051f44e5d98fd190079f1158aceac1fcf`

## 자동 게이트

- 2×2/3×3 exact 값, center fallback, median half-up, majority tie, hidden RGB, empty cell, original 1×1 동등성 통과
- square/factor/grid/preserve-sheet 동일 cell 결과와 candidate별 결정성 통과
- default visual baseline 2/2 및 QLT fixture 12/12 유지
- candidate alpha hash 동일: representative는 RGB만 변경하고 ALP-002 alpha 정책은 변경하지 않음

## 브라우저 게이트

- PASS — desktop/mobile/keyboard/settings/result metadata/1×·8× 검수 및 캡처 무결성 통과

## 남은 조건

- 없음
