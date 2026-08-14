# GRID-001 — Sobel grid period/phase 감지와 sequence lock

## 1. 메타데이터

| 항목 | 값 |
|---|---|
| 명세 상태 | 완료 |
| 구현 상태 | NOT_STARTED |
| QA 상태 | 미실행 |
| 우선순위 | P2 |
| 근거 분류 | SOURCE-BACKED + EXPERIMENTAL |
| 구현 모델 | Sol xhigh |
| 선행 항목 | QLT-001, GEO-001 |

## 2. 목표와 사용자 완료 상태

픽셀풍 입력의 x/y cell period와 phase를 Sobel profile로 추정하고 overlay로 보여 준다. 높은 confidence만 자동 적용하며, 사용자는 pixel size·offset을 직접 고정할 수 있다. 시퀀스에서는 한 grid를 전체 frame에 lock한다.

## 3. 현재 문제와 근거

현재 블록은 top-left 고정 원점이다. Source 03 Perfect Pixel은 FFT→Sobel refinement, Source 05 Pixel Snapper는 Sobel projection과 peak 간격을 사용한다. 제품 우위는 검증되지 않았으므로 v1은 Sobel만 독립 구현한다.

## 4. 포함·비포함 범위

포함: period 2~32, x/y phase, confidence, overlay, manual override, whole/sheet aggregate, average representative.

비포함: FFT, elastic variable cuts, 비정사각 cell 자동 교정, GPU/WASM, frame별 독립 자동 grid 기본값.

## 5. UI 명세

- 새 `AI 픽셀 격자 복구` scale mode 또는 factor 영역의 `격자 자동 감지` 진입점을 제공한다.
- 버튼 `격자 분석`; 분석 전 자동 적용하지 않는다.
- 결과: `X 8px / offset 1 · Y 8px / offset 0 · 신뢰도 82%`와 overlay.
- confidence ≥0.75: `이 격자 적용` enabled.
- 0.50~0.74: preview만, `확신이 낮습니다. 값을 확인하세요.`
- <0.50: 자동 적용 disabled, `격자를 안정적으로 찾지 못했습니다.`
- manual fields: sizeX/sizeY 2~32, phaseX 0..sizeX-1, phaseY 0..sizeY-1, `수동 값 잠금`.
- sequence/sheet에서는 `모든 프레임에 같은 격자 적용`을 기본·강제하고 설명한다.

## 6. 분석 알고리즘

입력 alpha ≥10만 분석한다. 투명 픽셀은 검정으로 합성하지 않고 mask에서 제외한다.

1. sRGB luma `0.2126R + 0.7152G + 0.0722B`를 계산한다.
2. 3×3 Sobel `|Gx|`, `|Gy|`를 구한다. 이웃 중 유효 alpha가 2개 미만이면 edge 0.
3. vertical boundary 후보용 `|Gx|`를 y축으로 합해 x profile, horizontal용 `|Gy|`를 x축으로 합한다.
4. profile에서 median을 빼고 음수는 0으로 clamp, 합이 0이면 실패.
5. period 2..min(32,floor(axisLength/4))마다 normalized autocorrelation을 계산한다.
6. best와 second period를 찾고 각 period에서 모든 phase의 boundary support를 계산한다.
7. `periodScore=bestCorrelation`, `ambiguity=second/best`, `phaseConcentration=bestPhaseSupport/sumPhaseSupport`.
8. `axisConfidence=clamp(0.55*periodScore + 0.45*phaseConcentration - 0.25*ambiguity,0,1)`.
9. 전체 confidence는 x/y의 minimum이다.

동률은 작은 period, 작은 phase를 선택한다. sheet/sequence는 frame별 profile을 각 profile 합으로 정규화한 뒤 같은 축끼리 합산한다. 전체 시트 여백 주기를 직접 분석하지 않는다.

## 7. 설정·결과 인터페이스와 적용 알고리즘

감지된 cuts는 `phase + k*period`이며 canvas 밖 cut을 제외한다. 가장자리 partial cell은 자동 crop/pad하지 않으므로 첫/마지막 full cell만 출력 대상으로 하고, 제외 margin을 overlay와 계산문에 표시한다. 사용자가 margin 손실을 확인하고 적용해야 한다.

```json
{
  "processing": {
    "mode": "grid-repair",
    "grid": {
      "sizeX": 8,
      "sizeY": 8,
      "phaseX": 1,
      "phaseY": 0,
      "confidence": 0.82,
      "source": "auto",
      "lockedAcrossFrames": true
    }
  }
}
```

대표색은 CELL-001 전까지 alpha-weighted sRGB mean으로 고정한다.

## 8. 실험 게이트

- 기준선: 사용자가 정확한 factor/phase를 수동 지정한 결과
- 후보: Sobel autocorrelation v1
- 고정 변수: palette, cleanup, alpha, outline, representative
- 지표: period/phase error, false positive, confidence calibration, runtime
- 채택: clean fixtures 오차 0, wobble 각 축 ≤1px, photo confidence <0.5, 동일 결과 hash
- 폐기/재설계: clean fixture 중 10% 이상 오검출 또는 photo false positive 발생

게이트 통과 전 일반 factor mode가 grid detection을 자동 실행하지 않는다.

## 9. 호환·경계조건

- 분석 픽셀 수가 4M을 넘으면 자동 분석을 거부하고 manual fields를 제공한다.
- axis length <8, 유효 alpha <64, profile sum 0은 실패다.
- mixed pixel sizes, 저대비, diagonal-only 입력은 낮은 confidence가 정상 결과다.
- manual input은 confidence 없이 적용할 수 있으나 `source:"manual"`로 기록한다.
- frame별 grid를 독립 저장하지 않는다.

## 10. 보안·성능·접근성

- 외부 perfectPixel/Pixel Snapper 코드를 복사하지 않는다.
- 분석은 취소 가능해야 하며 UI busy 상태에서 중복 실행을 막는다.
- overlay는 색+선 종류와 text 수치를 함께 제공한다.
- main-thread 100ms 초과가 반복되면 완료하지 않고 PERF-001로 측정 결과를 넘긴다.

## 11. 예상 변경과 순서

- `pixelate_studio.html`: analysis UI, Sobel/profile, overlay, apply path, settings/result metadata
- QLT grid fixtures와 `scripts/grid-detection-check.mjs`
- README/CHANGELOG, CSP hash

순서: pure profile/detector → fixture gate → manual apply → overlay → aggregate sequence → UI → performance → docs.

## 12. 자동 테스트

- 3/4/8px clean grid period/phase 정확
- ±1px wobble 오차와 confidence
- photo/flat/low-alpha 실패
- period/phase tie-break 결정적
- sheet frame별 normalized aggregate가 frame spacing을 선택하지 않음
- margin/crop 계산 정확
- manual range 검증
- 두 번 실행 hash 동일

## 13. 브라우저 수동 QA

clean/wobble/low-contrast/photo/sheet를 분석해 overlay, confidence gate, manual correction, margin 경고, mobile keyboard를 확인한다. animation loop에서 frame간 grid가 움직이지 않는지 본다.

## 14. 수용 기준

실험 게이트 전부 통과, photo false positive 0, 낮은 confidence 자동 적용 0, sequence grid variance 0, 4M 상한·취소·결정성 통과.

## 15. 완료 증거

fixture별 period/phase/confidence report, overlay 캡처, false-positive 결과, runtime과 hash를 연결한다.

## 16. Luna/상위 모델 실행 지시문

이 항목은 Luna로 구현하지 않는다. Sol xhigh 프롬프트:

> GRID-001만 독립 구현한다. 외부 코드를 복사하지 말고 명세의 alpha-masked Sobel profile, period autocorrelation, phase support, confidence 수식을 그대로 사용한다. clean/wobble/photo fixture gate를 먼저 통과한 뒤에만 UI apply를 연결한다. confidence 0.75 미만은 자동 적용하지 않고, sheet/sequence는 frame-normalized aggregate 한 grid만 사용한다. FFT·variable cut·partial crop 정책은 추가하지 않는다. 결정성·성능·overlay·CSP·회귀 증거를 남긴다.

## 17. 중단·상향 조건

- confidence 수식이 fixture와 실사용에서 상충하면 threshold를 튜닝해 숨기지 말고 Sol max 검토로 올린다.
- FFT 없이는 채택 게이트를 못 넘으면 GRID-001을 `DEFERRED`로 두고 FFT 후속 실험 명세를 별도로 작성한다.
- 4M 이하에서도 long task를 제어할 수 없으면 PERF-001 전에는 제품 연결을 중단한다.
