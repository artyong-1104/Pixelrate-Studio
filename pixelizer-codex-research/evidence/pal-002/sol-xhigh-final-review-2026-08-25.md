# PAL-002 독립 Sol xhigh 최종 검토

- 검토일: 2026-08-25 KST
- 검토 범위: PAL-002 명세, 운영 구현, 설정·호환 경로, 자동 평가·증거 gate, localhost 브라우저 QA, 실제 크기 수동 matrix, 전체 회귀
- 검토자: independent Sol xhigh

STATUS: DONE

## FINDINGS

현재 차단 finding은 없다.

검토 중 발견했던 다음 증거 간극은 최종 상태에서 모두 해소됐다.

1. 대형 배경과 작은 캐릭터가 같은 픽셀 수여서 `pixel`과 `image-balanced`가 같은 표본·팔레트를 만들던 corpus를 512×256 배경과 128×128 캐릭터의 8:1 corpus로 교체했다. `samplingCorpusValid`와 equal-size·identical-palette negative가 이 조건을 fail-closed로 고정한다.
2. sampling 비용을 제외하던 runtime 계측을 sample 수집과 palette 생성으로 분리하고, 합계 `runtimeMs`를 3× 채택·폐기 gate에 사용한다. 생성된 각 행에서 두 구간의 합과 전체 시간이 일치한다.
3. blind gate가 중복 A 캡처와 범위 밖 선호율을 허용하던 문제를 exact A+B set, distinct mapping, verdict 이후 mapping 공개, result↔percent 일치, candidate·confidence 범위 검증으로 닫았다.
4. 명세 §13의 5 fixture군 × 8/16/32/64색 actual-size A/B·animation flicker 기록이 없던 문제를 20-cell localhost 수동 matrix, 240개 해시 고정 PNG, 16-frame 동기 순환, 6개 decoder-backed 대표 캡처와 구조화 verdict로 보강했다.

## SPEC_ALIGNMENT

aligned.

- `kmeans-srgb + pixel` 기본값, legacy 복원, palette 순서와 기준선 SHA-256 `8fc99dd6e6e2dffde8dec057af66e2868cfe0ddbc50bd1035bfe73681781602d`가 유지된다.
- `kmeans-oklab`, `median-cut`, `image-balanced`, `reference`는 실험 기능 아래에만 있고 일반 preset이나 기본값으로 승격되지 않았다. custom/unlimited 및 shared-off 제약도 명세대로 동작한다.
- OKLab 변환·round trip, deterministic center/order, MedianCut split/tie/weighted representative, duplicate backfill, 50,000 sample 상한, reference 누락·중복 거부가 구현·테스트에 연결돼 있다.
- 결과 설정과 `processing.palette` metadata가 algorithm, sampling, reference, sample count, iterations, error, slot usage, runtime/heap을 보존한다.
- 4 fixture × 4 palette size × 3 algorithm의 48행 matrix와 별도 sampling/animation 평가가 algorithm·feature·temporal 축을 섞지 않는다.
- zero-baseline feature regression은 `null`/fail로 처리하고, 결정성·runtime≤3·feature≤10%·temporal≤10%·평균 error 5% 또는 blind 60% 조건을 모두 통과한 후보만 승격 검토 가능하다.
- 실제 JPEG는 parser와 시스템 decoder의 치수 일치, basename, SHA-256을 검사한다. blind 기록, manual matrix, 독립 review도 generator 완료 gate에 포함된다.

## 실험 판정

- OKLab K-means: 평균 OKLab error는 28.277216% 감소했지만 temporal variance가 15.562006% 증가하고 blind 결과가 tie 50%라 채택 불가다.
- MedianCut: 평균 error는 56.257887% 감소했지만 clean pixel art의 zero-baseline feature error를 악화시키며 전체 runtime도 기준선의 3× 상한을 넘는다.
- image-balanced: 8:1 corpus에서 pixel 표본 44,726개와 balanced 표본 24,950개 및 서로 다른 palette를 만들고, 전체 error를 2.191635%, 작은 캐릭터 error를 79.634376% 개선했다. 다만 전체 5% 임계값을 넘지 못한다.
- reference: 캐릭터 error는 줄지만 전체 error가 558.719282% 악화되고 실제 크기 검수에서 배경 계조가 훼손됐다.
- 자동·수동 지표 모두 기본값·preset 승격을 지지하지 않으므로 독립 review gate 연결 후 최종 상태는 `DEFERRED`가 맞다.

## TEST_EVIDENCE

직접 실행하고 확인한 명령과 결과:

- `for check in scripts/*check.mjs; do node "$check"; done` — PAL-002를 포함한 전체 check suite PASS.
- `node scripts/palette-algorithm-check.mjs` — conversion, deterministic algorithms, sampling/reference, baseline, zero-baseline, sampling-corpus negative PASS.
- `node scripts/pal002-ui-check.mjs` — 실험 UI, disabled 상태, reference 오류, metadata, settings wiring PASS.
- `node scripts/pal002-evidence-gate-check.mjs` — decoder-backed JPEG, path/hash, blind negative, 20-cell manual matrix negative PASS.
- 임시 격리 복제본에서 `node scripts/generate-pal002-browser-matrix.mjs` — 20 cells, 240 unique assets 생성.
- 같은 격리 복제본에서 `node scripts/generate-pal002-evidence.mjs` — `automatedPass=true`, `browserQaPass=true`, `runtimeBreakdownPass=true`, sampling corpus PASS, manual matrix 20/20 cells·240 assets·captures PASS, 후보 0개. 독립 review 연결 전 상태만 `NEEDS_REVIEW`다.
- `node scripts/visual-quality-check.mjs` — 12/12 PASS, 기준선 2개 PASS, 결정성 hash `db4b3d904fbcc53e83966e3db097b6e27242ee6494e7c0f2f943a007e6f23cef`.
- `node scripts/generate-pixel-fixtures.mjs --verify` — 12 fixtures, 2,822,491 PNG bytes, deterministic hashes PASS.
- `node scripts/security-check.mjs` — CSP, local dependency integrity, network/sink/input-limit 검사 PASS.
- `node scripts/preserve-sheet-check.mjs` — 기존 preserve-sheet/exact-factor 회귀 PASS.
- `for script in scripts/*.mjs scripts/lib/*.mjs; do node --check "$script"; done` 및 `git diff --check` — PASS.

검토한 브라우저·artifact 증거:

- 제품 화면의 desktop baseline/OKLab/MedianCut, reference 정상·누락·중복, settings round trip, custom/unlimited/shared-off, keyboard focus, 390×844 모바일 무가로스크롤 기록을 `qa-results.json`과 캡처로 대조했다.
- required JPEG 5개와 manual 대표 JPEG 6개를 실제 decoder·SHA-256으로 대조했다.
- manual manifest의 20 cells와 240개 unique PNG 경로·해시·치수를 대조하고 대표 캡처 6개를 원본 크기로 열었다. animation의 연속 두 캡처에서 frame 변화도 확인했다.
- mapping 공개 전에 label-free `browser-blind-a.jpg`와 `browser-blind-b.jpg`를 1×로 독립 비교한 판정은 tie, confidence 0.84였고, 이후 공개된 A=OKLab/B=sRGB 및 QA 기록과 일치한다.

## RISKS

남은 위험은 실험 corpus와 단일 로컬 런타임의 계측 변동성이다. 이는 후보를 기본값·preset으로 승격하지 않고 `DEFERRED`로 유지함으로써 운영 위험으로 전이되지 않는다. 새로운 corpus에서 재평가할 때도 동일 fail-closed gate와 actual-size QA를 다시 실행해야 한다.

RECOMMENDATION: PASS
