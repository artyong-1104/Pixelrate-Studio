# DIT-001 검증 증거 및 실행 보고서

검증 시각: 2026-08-26T16:16:12.778Z  
상태: `DONE`  
운영 정책: 기본값과 애니메이션 프리셋은 모두 `ditherMode: off`이며, 실험 후보를 프리셋으로 자동 승격하지 않는다.

## 판정 요약

| 게이트 | 결과 |
|---|---|
| bayerMatrixExact | **PASS** |
| quantitativeCandidateCoverage | **PASS** |
| texturePreferenceEvidence | **PASS** |
| adoptionCoverage | **PASS** |
| zeroStrengthBaselineIdentity | **PASS** |
| alphaTopologyInvariant | **PASS** |
| outlinePipelineOrder | **PASS** |
| animationPresetsOff | **PASS** |
| contactSheetWritten | **PASS** |
| cspSynchronized | **PASS** |
| browserQa | **PASS** |
| independentSolReview | **PASS** |

50% 강도 실제 측정값: Bayer 2×2 12.50%, Bayer 4×4 13.75%. 두 후보는 15% 채택 임계값을 충족하지 못해 각각 FAIL이다.

채택 후보: Bayer 2×2 = bayer2-75, bayer2-100, Bayer 4×4 = bayer4-75, bayer4-100.

최종 채택 판정은 정량 gate와 구조화된 1× texture 선호 gate를 모두 통과해야 한다. 1× 검토에서 Bayer 2×2/4×4의 75%·100% 후보는 모두 `ACCEPTABLE`이며, 선호 증거가 없거나 `REJECTED`이면 정량값과 관계없이 fail-closed로 처리한다.

## 후보별 품질 매트릭스

| 모드 | 강도 | 밴딩 비율 | 감소율 | OKLab 오차 평균/P95 | flat variance | temporal changed ratio | static-region ratio | 판정 |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| off | - | 0.941176 | 0.00% | 0.017811 / 0.030475 | - | - | - | 기준선 |
| bayer2 | 25% | 0.882353 | 6.25% | 0.017909 / 0.035498 | 16256.25 | 0.288088 | 0.000000 | **FAIL** (quantitative FAIL, 1x MISSING) |
| bayer2 | 50% | 0.823529 | 12.50% | 0.019004 / 0.042929 | 16256.25 | 0.294237 | 0.000000 | **FAIL** (quantitative FAIL, 1x MISSING) |
| bayer2 | 75% | 0.647059 | 31.25% | 0.022304 / 0.047867 | 16256.25 | 0.294338 | 0.000000 | **PASS** (quantitative PASS, 1x ACCEPTABLE) |
| bayer2 | 100% | 0.588235 | 37.50% | 0.024700 / 0.050402 | 16256.25 | 0.294243 | 0.000000 | **PASS** (quantitative PASS, 1x ACCEPTABLE) |
| bayer4 | 25% | 0.911765 | 3.13% | 0.017585 / 0.035087 | 16256.25 | 0.289477 | 0.000000 | **FAIL** (quantitative FAIL, 1x MISSING) |
| bayer4 | 50% | 0.811765 | 13.75% | 0.019527 / 0.043229 | 16256.25 | 0.292303 | 0.000000 | **FAIL** (quantitative FAIL, 1x MISSING) |
| bayer4 | 75% | 0.676471 | 28.12% | 0.022922 / 0.048812 | 16256.25 | 0.293574 | 0.000000 | **PASS** (quantitative PASS, 1x ACCEPTABLE) |
| bayer4 | 100% | 0.529412 | 43.75% | 0.026777 / 0.060713 | 16256.25 | 0.295084 | 0.000000 | **PASS** (quantitative PASS, 1x ACCEPTABLE) |

각 FAIL 사유는 [quality-matrix.json](./quality-matrix.json)의 `verdict`에 기록했다. flat variance와 temporal changed ratio는 비교 지표이며, 채택 gate는 명세대로 gradient 밴딩 15% 이상 감소·고정 영역 변화 0·알파/외곽선 회귀 0·애니메이션 기본 off이다.

## 시각·브라우저·검토 증거

- [strength matrix contact sheet](./strength-matrix-contact-sheet.png) — tile 순서는 quality-matrix.json의 candidateOrder와 같다.
- 브라우저 QA: PASS ([browser-qa.json](./browser-qa.json))
- 브라우저 세션 계측: [browser-session-measurements.json](./browser-session-measurements.json)
- 1× texture 선호 판정: [texture-preference-review.json](./texture-preference-review.json)
- 시각 증거: 정적 3 fixture × 1×/2×/8×, texture 기준선·후보 5장, animation 8×/8fps·8×/12fps·모바일 8×/12fps, 서로 다른 16개 frame asset
- 독립 Sol xhigh 검토: PASS ([sol-xhigh-independent-rereview-2026-08-27.md](./sol-xhigh-independent-rereview-2026-08-27.md))

## 남은 게이트

- 없음

## 재현 명령

```bash
node --test scripts/dit001-check.mjs
node scripts/dit001-ui-check.mjs
node scripts/dit001-evidence-gate-check.mjs
node scripts/generate-dit001-browser-qa.mjs
node scripts/pal002-ui-check.mjs
node scripts/settings-check.mjs
node scripts/security-check.mjs
node scripts/visual-quality-check.mjs
node scripts/generate-dit001-evidence.mjs
```
