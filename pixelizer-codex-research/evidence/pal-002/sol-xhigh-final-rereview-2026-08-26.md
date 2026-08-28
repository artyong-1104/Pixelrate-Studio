# PAL-002 독립 Sol xhigh 최종 재검토

- 검토일: 2026-08-26 KST
- 검토 범위: PAL-002 명세, 운영 구현, 조합별 정량 gate, localhost 브라우저 QA, actual-size matrix, 증거 무결성, 전체 회귀
- 검토자: independent Sol xhigh
- 이전 검토와의 분리: 이전 FAIL 판정을 재사용하지 않고 현재 worktree와 새 증거를 독립 재계산했다.

STATUS: DONE

VERDICT: PASS

## FINDINGS

현재 차단 finding은 없다.

1. 이전 검토가 발견한 palette-size 전체 평균 집계 결함은 `algorithm × sampling × colors` 조합별 eligibility로 교체됐다.
2. 이전 16색 temporal 결과 `0.374737 / 0.273684`, 악화 `36.9232%`를 별도 negative test에서 재현하며 `temporalRegressionPass=false`, `eligibleByAutomatedMetrics=false`를 고정한다.
3. 보완된 `kmeans-oklab + pixel + 16색` 조합은 temporal `0.298947 / 0.273684`, 악화 `9.230719%`로 10% 상한 이내다.
4. manual matrix의 `candidatePromotionSupported` 값은 더 이상 `animation-16`으로 하드코딩되지 않는다. 정량 조합 gate가 전달한 `promotionCellIds` 목록과 QA flag가 일치해야 통과하며, 빈 eligibility 목록은 현재 승격 기록을 거부한다.
5. 새 브라우저 QA는 현재 application script SHA-256, localhost:8000, 새 matrix manifest와 캡처 SHA-256에 결합되어 있다.

## SPEC_ALIGNMENT

aligned.

- `kmeans-srgb + pixel` 기본값·legacy 복원·기준선 palette 순서와 SHA-256은 유지된다.
- `kmeans-oklab`, `median-cut`, `image-balanced`, `reference`는 실험 기능 영역에 유지된다.
- 기본 preset은 변경되지 않으며, 검증된 16색 OKLab 애니메이션 조합만 `oklab-animation-stable` opt-in preset으로 승격할 수 있다.
- 채택 조합은 평균 OKLab error 5% 이상 개선, runtime 3× 이하, feature·temporal 악화 10% 이하, 결정성 통과라는 명세의 정량 게이트를 모두 만족한다.
- 20-cell actual-size matrix, 240개 PNG, 6개 manual 대표 캡처, 7개 필수 제품·blind 캡처는 decoder·치수·경로·SHA-256 gate에 연결된다.

## TEST_EVIDENCE

독립 재계산 결과:

- application inline script SHA-256: `d78b1aae6b296215659b3085ddaf966d0b7941e0593be891bd726c44e3ffcb6c`
- localhost:8000에서 서빙된 HTML은 현재 worktree의 `pixelate_studio.html`과 byte-identical이다.
- `kmeans-oklab + pixel + 16색`: 평균 OKLab error `39.498235%` 개선, runtime `1.341899×`, feature 변화 `0%`, temporal `+9.230719%`, blind `50%`, deterministic `true`, eligibility `true`.
- fresh browser QA: `2026-08-25T14:53:26Z`, localhost:8000, 16개 이미지 처리, 후속 15프레임 metadata, 13프레임·총 468px index 유지, console error 0.
- 390×844 mobile: document scroll width `382px`, horizontal overflow 없음.
- manual matrix: 5개 fixture group × 4개 palette size = 20 cells. 각 group의 12개 figure·24개 image가 모두 load되었고 manifest gate가 240개 PNG의 경로·치수·hash를 통과했다.
- `summary.json`: `automatedPass=true`, `browserQaPass=true`.
- 전체 25개 `scripts/*check.mjs` PASS.
- 모든 `scripts/*.mjs`, `scripts/lib/*.mjs`의 `node --check` PASS.
- `node scripts/generate-pixel-fixtures.mjs --verify`: 12 fixtures, 2,822,491 PNG bytes, deterministic hashes PASS.
- `node scripts/visual-quality-check.mjs`: 12/12 PASS, 기준선 2개 PASS, 결정성 hash `db4b3d904fbcc53e83966e3db097b6e27242ee6494e7c0f2f943a007e6f23cef`.
- CSP·의존성·런타임 네트워크·unsafe sink·입력 상한·storage opt-in 보안 검사 PASS.
- settings legacy migration, preserve-sheet, exact-factor, baseline hash, `git diff --check` PASS.
- 필수 JPEG와 manual 대표 JPEG, blind mapping, matrix manifest의 현재 SHA-256을 재계산해 QA 기록과 일치함을 확인했다.

## RISKS

- runtime은 로컬 단일 실행에서 변동할 수 있지만 현재 `1.341899×`는 폐기 상한 `3×`보다 충분히 낮다.
- blind 결과는 tie `50%`지만, 명세가 화질 개선 5% 또는 blind 60% 중 하나를 요구하므로 error 개선 `39.498235%`가 해당 조건을 만족한다.
- 승격은 기본값이 아니라 명시적 opt-in preset으로만 제한되므로 기존 사용자 경로의 회귀 위험을 통제한다.

APPLICATION_SCRIPT_SHA256: d78b1aae6b296215659b3085ddaf966d0b7941e0593be891bd726c44e3ffcb6c

ADOPTION: oklab-animation-stable

RECOMMENDATION: PASS
