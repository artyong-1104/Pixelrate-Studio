# GRID-001 — Sobel grid period/phase 감지와 sequence lock

## 1. 메타데이터

| 항목 | 값 |
|---|---|
| 명세 상태 | 완료 |
| 구현 상태 | DONE |
| QA 상태 | DONE — algorithm v2 자동·localhost 브라우저 QA·증거 무결성·독립 Sol xhigh 최종 검토 통과 |
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

구현 명확화 (`ENGINEERING-INFERENCE`): 3×3 Sobel의 단차가 인접한 두 sample에 같은 peak를 만들기 때문에 최초 local maximum을 실제 새 cell의 첫 픽셀 좌표로 매핑한 뒤 median 제거를 한 번만 적용한다. 반복 격자의 autocorrelation은 기본 주기의 정수배에서도 강해지므로, 최고 correlation 주기의 약수 중 최고값의 `2/3` 이상인 가장 작은 주기를 fundamental로 선택한다. confidence의 `second`는 선택된 fundamental의 배수·약수를 제외한 가장 강한 비고조파 후보로 계산한다. 이 규칙은 confidence 수식과 0.50/0.75 UI 임계값을 변경하지 않으며, `ai-grid-wobble`의 24/32px 고조파를 8px 기본 주기로 결정적으로 해소한다.

Algorithm v2 구현 명확화 (`ENGINEERING-INFERENCE`): binary alpha topology의 경계는 투명 RGB를 검정으로 합성하지 않고 별도 mask 증거로 profile에 합산한다. alpha ≥10 여부가 바뀌는 경계를 실제 cell 시작 좌표에 맞춰 한 sample로 축약하며, 완전한 binary step의 양측 Sobel 응답과 같은 `8×255` support를 사용한다. 이 값은 fixture별 튜닝값이 아니며 opaque 입력에는 영향을 주지 않는다. QLT `clean-pixel-art`의 희소 색상 경계에서도 4×4, phase 0/0을 회복하고 alpha-edge·thin-lines는 confidence 0.5 미만을 유지해야 한다.

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
- `getImageData`, binary-alpha scan, sheet slicing, Sobel의 각 동기 chunk를 같은 `maxChunkMs`에 포함한다.
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

## 18. 구현·검증 기록 (2026-08-21 KST)

- 구현 파일: `pixelate_studio.html`
- 전용 검사: `scripts/grid-detection-check.mjs`, `scripts/grid001-ui-check.mjs`
- 증거 생성: `scripts/generate-grid001-evidence.mjs`
- 자동 fixture 게이트: 분리된 clean 3/4/8px grid는 period·phase 오차 0, wobble 8/8px, photo-like confidence `0.2253`, sequence grid variance 0, 결정성 SHA-256 `7d972e1967c885640cf996243e514567e601c0add626cf37e1e83c9869b16396`.
- algorithm v1 한계 기록: QLT `clean-pixel-art`의 희소한 수평 경계에서 X=4px, Y=12px, confidence 약 `0.2233`으로 감지됐고 독립 Sol 검토에서 clean 채택 게이트 실패로 판정됐다. 이 문제는 명세 21의 algorithm v2 alpha topology 증거로 4×4, phase 0/0까지 수정했다.
- 4M 성능 계측: 2048×2048 RGBA, 총 약 0.9초, 최대 chunk 약 14ms로 100ms 기준 통과. 장치·브라우저별 수치는 브라우저 QA에서 다시 측정한다.
- 기존 회귀: security, preserve-sheet, settings, animation, visual-quality 기준선 통과.
- CSP: `pixelate_studio.html`, `SECURITY.md`, `vercel.json`의 인라인 script SHA-256 동기화.
- 증거: [GRID-001 자동 검증 보고서](../../evidence/grid-001/README.md), [기계 판독 결과](../../evidence/grid-001/report.json)
- 이 시점의 미완료는 브라우저 QA와 독립 Sol xhigh 재검토였다. 이후 명세 19의 브라우저 QA를 실행했고 명세 20의 독립 검토에서 수정 요청을 받았으므로 `NEEDS_REVIEW`를 유지한다.

## 19. 브라우저 QA 기록 (2026-08-21 KST)

- Codex 인앱 브라우저에서 `http://127.0.0.1:8766/pixelate_studio.html?qa=grid001-20260821`을 실제로 열어 검증했다.
- 8px/offset 3 clean grid는 X/Y 8px, offset 3, confidence 100%로 감지했고 overlay·margin·자동 적용 제어가 통과했다.
- confidence 60%는 preview-only 경고, 38%·31%·23% 입력은 자동 적용 차단을 확인했다. photo-like에서 자동 적용 false positive는 없었다.
- sparse `clean-pixel-art`는 X=4/Y=12, confidence 22%로 안전 차단됐고, 키보드로 수동 4×4/offset 0을 입력·잠금해 32×32 출력 격자를 적용했다.
- 4,194,304px 분석은 분석 중 취소로 중단되고 제어가 복구됐다. 2049×2048 입력은 4M 상한 오류와 수동 입력 경로를 표시했다.
- 16프레임에 수동 4×4 격자를 단일 적용하고 애니메이션 검수 프레임 7~10의 viewport 좌표·크기 분산 0, `격자 잠금: 켜짐`을 확인했다.
- 390×844 viewport에서 document scroll width 382px, 수동 키보드 입력·적용·변환 제어를 통과했고 수평 overflow는 없었다.
- 콘솔 오류는 0건이었다. 측정값과 캡처는 [GRID-001 증거 보고서](../../evidence/grid-001/README.md)와 `qa-results.json`에 기록했다.
- sparse clean 제한은 독립 Sol xhigh 검토에서 실험 채택 기준 실패로 판정됐다. 명세 20의 차단 항목을 해결하고 재검토를 통과하기 전에는 `DONE`으로 올리지 않는다.

## 20. 독립 Sol xhigh 검토 기록 (2026-08-21 KST)

- 최종 판정: `CHANGES_REQUESTED`. `requiredReview`는 `PASS`로 변경하지 않는다.
- P1: QLT `clean-pixel-art`의 ground truth는 4×4, phase 0/0이지만 실제 감지는 4×12, confidence `0.223339`이다. 낮은 confidence 자동 적용 차단은 안전 동작이지만 명세 8·14의 clean fixture 오차 0 채택 기준을 만족하지 않는다.
- P1: 증거 생성기는 sparse clean 오검출을 `SAFE FALLBACK`으로 통과시키고, 캡처 파일과 독립 검토 보고서의 실제 존재를 fail-closed로 확인하지 않는다. JSON의 모델·결과 문자열만으로 `DONE`이 될 수 있는 경로를 막아야 한다.
- P2: 기록된 `maxChunkMs`는 Sobel chunk만 측정한다. 브라우저의 `getImageData`, sheet slicing, 4M alpha scan을 포함한 전체 main-thread 100ms 기준은 아직 증명되지 않았다.
- P2: confidence 경계, 취소 복구, sheet/sequence 결과 metadata의 자동 검사가 실제 DOM·출력 대신 정규식과 수기 QA JSON에 의존한다.
- 통과 범위: alpha-masked Sobel/profile, 수동 2~32·phase 범위, margin 계산, confidence UI, 정확히 4M 허용과 초과 거부, 취소, sequence/sheet 단일 grid, 결과 metadata, CSP 동기화, 저장된 브라우저 캡처 5개.
- 독립 검토자는 저장된 캡처와 현재 코드를 대조하고 localhost 초기 DOM까지 확인했다. 독립 세션의 fixture 인터랙션 재실행은 브라우저 보안 정책의 localhost 재접속 차단으로 완료하지 못했으므로, 브라우저 동작 증거는 명세 19의 실행 기록을 근거로 삼았다.
- 해제 조건: clean fixture 4×4/phase 0/0 감지, clean ground truth·필수 캡처·독립 검토 보고서 실재를 확인하는 fail-closed 증거 gate, 동기 전처리를 포함한 성능 계측, 핵심 UI 경계의 실행형 회귀 테스트를 완료한 뒤 Sol xhigh 재검토를 통과한다. 알고리즘으로 clean gate를 충족할 수 없다면 명세 17에 따라 `DEFERRED`로 전환한다.
- 보고서: [Sol xhigh 독립 검토](../../evidence/grid-001/sol-xhigh-review-2026-08-21.md)

## 21. 검토 지적 해결 기록 (algorithm v2, 2026-08-21 KST)

- P1 clean gate: alpha-mask boundary evidence를 추가해 QLT `clean-pixel-art`가 X/Y 4px, phase 0/0으로 감지된다. confidence는 `0.603774`여서 preview-only 정책은 유지하지만 period/phase 오차 0 채택 기준은 통과한다.
- P1 evidence gate: 필수 캡처 5개의 정확한 파일명·실재·최소 1024B·JPEG SOI/EOI·SOF 치수 64px 이상·캡처별 SHA-256, Sol 보고서의 안전한 basename·실재·SHA-256·`RECOMMENDATION: PASS`를 모두 확인해야 `DONE`이 되도록 fail-closed 모듈을 추가했다. 누락·4바이트 pseudo-JPEG·캡처 hash 불일치·보고서 변조·경로 이탈·`CHANGES_REQUESTED`·100ms 초과를 실행 검증한다.
- P2 전체 계측: `getRawPixels`의 canvas read, sheet frame 할당·64행 slicing, 64행 alpha scan, 24행 Sobel을 측정하고 end-to-end 최대 chunk로 합산한다. 100ms 초과는 기존 자동 적용 차단에 연결된다.
- P2 실행형 회귀: confidence `0.499/0.5/0.749999/0.75`, 100ms 경계, 취소 상태 초기화, 정확히 4M/초과 입력, whole/sheet `processing.grid` metadata, 비동기 전처리·slicing·취소를 실제 함수 호출로 검사한다.
- 자동 회귀: 전체 `scripts/*check.mjs`, CSP 동기화, JSON 파싱, 결정성, `git diff --check`를 통과했다.
- fresh 브라우저 QA: algorithm v2 로컬 URL에 대한 Codex 인앱 브라우저 접근 권한이 거부되어 재실행하지 못했다. 기존 algorithm v1 측정은 역사 기록으로만 유지하고 v2 증거 gate에서 인정하지 않는다.
- Sol v2 재검토: 기존 P1/P2 네 건은 코드·자동 테스트 수준에서 해결됐다고 판정했다. 재검토 중 발견된 4바이트 pseudo-JPEG 허용 P3도 SOI/EOI·SOF 치수·최소 크기·SHA-256 검증으로 후속 수정했다. fresh 브라우저 QA가 없으므로 최종 권고는 `BROWSER_QA_REQUIRED`다.
- 남은 해제 조건: 사용자가 로컬 브라우저 접근을 허용한 뒤 QLT clean 자동 감지·전체 chunk 계측·confidence·취소·시퀀스·모바일을 재실행하고, 새 캡처 5개와 Sol xhigh `PASS` 보고서 SHA-256을 기록한다.

## 22. 최종 브라우저 QA·독립 검토 기록 (2026-08-23 KST)

- Fresh algorithm v2 QA는 `http://localhost:8765/pixelate_studio.html?qa=grid001-v2-20260823`에서 실행했다. 콘솔 오류는 0건이었다.
- clean 8px/phase 3은 X/Y 8px, offset 3, confidence 100%, 처리 36ms, main-thread max chunk 3ms로 자동 적용·overlay·margin 표시가 통과했다.
- QLT `clean-pixel-art`는 4×4, phase 0/0, confidence 60%로 ground truth를 복구하면서 preview-only 경고와 자동 적용 차단을 유지했다. wobble 38%, low-contrast 31%, photo-like 23%도 자동 적용되지 않았고 photo false positive는 0건이었다.
- 4,194,304px 분석은 취소 중 제어 상태와 취소 후 복구를 통과했다. 완료 실행은 775ms, 브라우저 표시 end-to-end main-thread max chunk 13ms였다. 2049×2048 입력은 자동 분석을 거부하고 수동 경로를 제공했다.
- 16프레임 수동 4×4 sequence lock은 출력 16개·16×16, 프레임 7~10 viewport variance 0, `격자 잠금: 켜짐`을 확인했다. 390×844 모바일은 document scroll width 382px, 수평 overflow 없음, 키보드 입력·잠금·적용·변환을 통과했다.
- 필수 JPEG 5개는 실제 JPEG 구조·64px 이상 치수·1024B 이상 크기·SHA-256 일치를 fail-closed gate로 검증했다. 브라우저 QA, 캡처 무결성, 독립 검토 게이트는 모두 `true`다.
- 독립 Sol xhigh 최종 검토는 차단 finding 없이 `RECOMMENDATION: PASS`를 기록했다. 보고서 SHA-256은 `dd0c23fa8cddd9104bf80a2c087dce09b9429f42124a07f9f56502c52fbd067e`다.
- 최종 생성 결과는 `status: DONE`, `pending: []`이다. 증거: [GRID-001 자동·브라우저 QA 보고서](../../evidence/grid-001/README.md), [기계 판독 결과](../../evidence/grid-001/report.json), [Sol xhigh 최종 검토](../../evidence/grid-001/sol-xhigh-final-review-2026-08-23.md).
