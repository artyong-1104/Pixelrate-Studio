# PAL-002 독립 Sol xhigh 재검토

- 검토일: 2026-08-25 KST
- 검토 범위: PAL-002 명세, 운영 구현, 설정/호환 경로, 자동 평가 및 evidence gate, 현재 localhost 브라우저 QA 증거, 전체 회귀
- 검토자: independent Sol xhigh

APPLICATION_SCRIPT_SHA256: e894f4191815936d25db368dd73e53a1078de8ee61c094a35e505516c56f5921
ADOPTION: REJECTED
VERDICT: FAIL

STATUS: DONE_WITH_CONCERNS

## FINDINGS

1. **HIGH — 승격된 16색 조합이 명세의 temporal 회귀 상한을 통과하지 못한다.**
   - 명세는 채택 후보의 feature/temporal 악화를 각각 10% 이하로 제한하고, 임계값을 넘은 조합만 preset 승격 검토 대상으로 규정한다 (`specs/items/pal-002-palette-algorithms.md:79-84`, `:124-126`).
   - 현재 16색 `animation-16` 행은 baseline temporal index variance `0.273684`, OKLab 후보 `0.374737`이며, 상대 악화는 `36.923239940953806%`다 (`evidence/pal-002/summary.json:2017-2020`, `:2199`). 같은 16색 묶음은 평균 error `42.76957779630266%` 개선, feature 변화 `0%`, runtime 약 `1.30x`로 다른 조건은 통과하지만 temporal 조건 때문에 최종적으로 부적격이다.
   - 증거 생성기는 8/16/32/64색 전체의 temporal variance를 평균내 `2.593748%`만 기록한다 (`scripts/generate-pal002-evidence.mjs:244-260`). 이후 이 알고리즘 단위 평균을 근거로 16색 preset을 채택한다 (`scripts/generate-pal002-evidence.mjs:372-377`). 그 결과 승격 대상 조합 자체의 실패가 32/64색 개선으로 상쇄된다.
   - 따라서 `oklab-animation-stable` 16색 opt-in preset 승격과 `ADOPTED_OPT_IN` 주장은 현재 정량 증거로 뒷받침되지 않는다.

2. **MEDIUM — 브라우저/manual evidence gate가 채택 결론을 정량 결과에서 도출하지 않고 16색을 정답으로 고정한다.**
   - manual gate는 `animation && colors === 16`이면 `candidatePromotionSupported`가 무조건 `true`여야 PASS하도록 작성돼 있다 (`scripts/lib/pal002-evidence-gate.mjs:178-184`). 제품 QA gate도 16프레임 처리와 `heldPixels > 0`만 확인하며 baseline 대비 temporal variance 10% 조건을 다시 계산하지 않는다 (`scripts/generate-pal002-evidence.mjs:364-371`).
   - 현재 자동 테스트는 단일 픽셀의 hold 동작과 알고리즘 전체 평균만 검사하므로, 16색 조합의 temporal 회귀가 10%를 넘을 때 채택을 거부하는 negative test가 없다. 실제로 전체 check suite가 PASS하면서 위 부적격 승격도 그대로 PASS 후보로 남는다.

## SPEC_ALIGNMENT

부분 정렬이나 채택 게이트에 중대한 간극이 있다.

- OKLab 변환, deterministic K-means/MedianCut, sampling/reference 검증, 50,000 sample 상한, legacy/default `kmeans-srgb + pixel`, 설정 JSON, 결과 metadata, CSP 동기화는 명세와 정렬돼 있다.
- `oklab-animation-stable`의 16색 승격은 조합별 temporal 10% 상한을 위반하므로 명세 섹션 8 및 14와 정렬되지 않는다.
- evidence gate는 조합별 정량 판정을 검증하지 않아 현재 `DONE` 판정에 사용할 수 없다.

## TEST_EVIDENCE

직접 실행한 검사:

- `for check in scripts/*check.mjs; do node "$check"; done` — 25개 check 전부 PASS.
- `for script in scripts/*.mjs scripts/lib/*.mjs; do node --check "$script"; done` — PASS.
- `node scripts/palette-algorithm-check.mjs` — PASS.
- `node scripts/pal002-ui-check.mjs` — PASS.
- `node scripts/pal002-evidence-gate-check.mjs` — PASS.
- `node scripts/settings-check.mjs` — PASS.
- `node scripts/security-check.mjs` — PASS; 현재 inline application SHA-256과 HTML/SECURITY/vercel CSP가 일치한다.
- `node scripts/preserve-sheet-check.mjs` — PASS.
- `node scripts/visual-quality-check.mjs` — 12/12 PASS, baseline 2개 PASS, deterministic hash `db4b3d904fbcc53e83966e3db097b6e27242ee6494e7c0f2f943a007e6f23cef`.
- `git diff --check` — PASS.
- 현재 `summary.json`의 16색 baseline/candidate 행을 팔레트 크기별로 다시 집계 — error 개선 `42.76957779630266%`, runtime 약 `1.30x`, feature 변화 `0%`, temporal 변화 `+36.923239940953806%`, 최종 `passes=false`.

검토한 증거:

- 현재 application script SHA-256 `e894f4191815936d25db368dd73e53a1078de8ee61c094a35e505516c56f5921`과 `qa-results.json` 기록이 일치한다.
- decoder-backed 필수 JPEG와 20-cell/240-asset manual matrix 무결성 검사는 통과한다.
- `browser-oklab-stable-product.jpg`, `browser-oklab-stable-mobile.jpg`, 연속 animation matrix 캡처를 직접 열어 제품 결과, 모바일 화면, 프레임 전환 증거를 확인했다. 다만 이 시각 증거는 명세의 정량 temporal 10% 상한 실패를 대체하지 못한다.

## RISKS

- 현재 로직으로 report를 PASS로 연결하면 generator가 `DONE`과 `ADOPTED_OPT_IN`을 출력하지만, 실제 승격된 16색 조합은 명세상 부적격이다.
- 알고리즘 전체 평균과 특정 preset 조합의 적격성을 계속 혼용하면 이후 다른 palette size 또는 후보도 같은 방식으로 잘못 승격될 수 있다.

## RECOMMENDATION

CHANGES_REQUESTED

수정 조건:

1. `algorithmSummary`와 별도로 `(algorithm, sampling, colors)` 조합별 채택 지표를 계산한다.
2. preset 승격은 정확히 `kmeans-oklab + pixel + 16 + shared` 조합이 error/blind, runtime, feature, temporal, 결정성을 모두 통과할 때만 허용한다.
3. 16색 temporal 회귀가 10%를 넘으면 `adoptionPass=false`가 되는 negative test를 추가한다.
4. `candidatePromotionSupported`를 하드코딩하지 말고 해당 조합의 정량 eligibility와 manual verdict를 함께 검증한다.
5. 개선된 temporal 정책으로 16색 variance를 10% 이하로 낮춘 뒤 matrix, localhost 제품 QA, 증거 생성, 독립 검토를 다시 실행한다.

RECOMMENDATION: CHANGES_REQUESTED
