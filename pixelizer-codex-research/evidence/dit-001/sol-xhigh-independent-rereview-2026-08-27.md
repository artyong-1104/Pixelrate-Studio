# DIT-001 보완본 독립 Sol xhigh 최종 재검토

- 검토일: 2026-08-27 (Asia/Seoul)
- 검토 모델: Sol xhigh
- 역할: 구현자·브라우저 QA 실행자와 분리된 독립 검토자
- 검토 범위: DIT-001 명세, 운영 코드, 검사·생성 근거, 완료 게이트

## 최종 판정

DIT-001 보완본은 명세와 일치하며 필수 Sol xhigh 게이트를 통과했다. 경고 양방향 전이 6개와 비활성 모드 오탐 방지, 정량·1× 선호 결합 채택, 17개 PNG 캡처·결과 asset 해시·설정 JSON, 8/12fps·8×·모바일, 16개 서로 다른 프레임, 독립 재계산, alpha/outline/global-origin, preset off, PAL-002 회귀, CSP 동기화를 모두 확인했다.

## 항목별 독립 검토

### 1. 경고 양방향 전이와 오탐 방지

- `scaleMode`, `factorFrameMode`, `gridFrameMode` 변경은 모두 `updatePaletteExperimentUi(false)`를 호출한다 (`pixelate_studio.html:3479-3482`, `3506-3511`, `3666-3671`).
- 현재 크기 모드에 해당하는 frame mode만 경고 계산에 포함한다. 비활성 `factorFrameMode`/`gridFrameMode`의 sheet 선택은 경고를 일으키지 않는다 (`pixelate_studio.html:5486-5493`).
- fresh localhost 브라우저에서 아래 10개 상태를 독립 추적했고 모두 `true`였다.
  - `originalHidden`, `originalToPreserveSheet`, `preserveSheetToOriginal`
  - `factorWholeHidden`, `factorWholeToSheet`, `factorSheetToWhole`
  - `gridWholeHidden`, `gridWholeToSheet`, `gridSheetToWhole`
  - `inactiveFactorSheetHidden`
- 제한 없음 팔레트 모드에서 dither control disabled, warning hidden, 안내 문구 표시를 실제 렌더링으로 확인했다.

### 2. 채택 게이트와 fail-closed

- 최종 `adoption` 조건은 `quantitativeEligibility === 'PASS' && texturePreference === 'ACCEPTABLE'`이다 (`scripts/generate-dit001-evidence.mjs:202-204`).
- 선호 증거 누락은 `MISSING`, 구조화된 거부 판정은 `REJECTED`로 유지되며 둘 다 `adoption: FAIL`을 만든다 (`scripts/generate-dit001-evidence.mjs:203-215`).
- 현재 worktree의 임시 복제본에서 직접 조작해 아래 negative test를 재실행했다.
  - 유효 후보 하나의 선호 증거 누락: `generate-dit001-browser-qa.mjs` exit 1, structured 1× preference gate FAIL.
  - Bayer2 75%/100% 둘 다 `REJECTED`: 두 후보의 `quantitativeEligibility: PASS`, `adoption: FAIL`; `adoptionCoverage: FAIL`; 최종 상태 `NEEDS_REVIEW`.
- 다만 체크인된 회귀 검사 `scripts/dit001-evidence-gate-check.mjs:166-168`은 preference 전체 `PENDING` 누락 분기만 자동화하고, 후보별 `REJECTED` 분기를 직접 자동화하지는 않았다. 이번 독립 재검증에서 실제 행동을 확인했으므로 현재 PASS를 차단할 결함은 아니지만, 후속 회귀 커버리지로 추가하길 권고한다.

### 3. PNG·설정·결과 asset 증거

- `browser-qa.json`을 독립 재해석해 개별 검사했다.
  - 캡처 17개 / 고유 이름 17개
  - PNG signature 실패 0
  - capture SHA-256 불일치 0
  - result/frame asset SHA-256 불일치 0
  - 설정 JSON 불일치 0
- 사용된 설정 7개의 `format/version`, `scaleMode: original`, `paletteMode: auto`, `colors: 16`, cleanup off, dither mode/strength가 캡처 명세와 일치했다.
- 게이트는 PNG 디코더로 픽셀을 직접 재구성해 비공백 조건을 검사했다. 검토자는 17개 캡처를 모두 직접 열어 1×/2×/8× 배율, fixture, 8/12fps·모바일 UI 상태를 대조했다.

### 4. 애니메이션·모바일

- 8fps·12fps 캡처에 각각 `FPS 8`, `FPS 12`가 표시된다.
- 데스크톱·모바일 캡처에서 8× 버튼 활성과 디더링 켜짐이 표시된다.
- 모바일 캡처는 382×827이고, 계측 viewport 390px 이하에서 모달·컨트롤의 가로 overflow가 없다.
- 프레임 asset 16개 모두 실제 PNG이고 SHA-256도 16개 모두 서로 다르다. 프레임 `00`, `04`, `08`, `12`를 직접 열어 오브젝트 이동·색 변화를 확인했다.

### 5. 정량적 독립 재계산

기존 보고서의 수치를 재사용하지 않고 production `mapPixelsToPalette`와 별도의 transition 계산기로 재계산했다.

| 후보 | banding ratio | 감소율 | 정량 gate | 1× 선호 | 최종 adoption |
|---|---:|---:|---|---|---|
| off | 0.941176 | - | 기준선 | - | - |
| Bayer2 50% | 0.823529 | 12.50% | FAIL | MISSING | FAIL |
| Bayer4 50% | 0.811765 | 13.75% | FAIL | MISSING | FAIL |
| Bayer2 75% | 0.647059 | 31.25% | PASS | ACCEPTABLE | PASS |
| Bayer2 100% | 0.588235 | 37.50% | PASS | ACCEPTABLE | PASS |
| Bayer4 75% | 0.676471 | 28.12% | PASS | ACCEPTABLE | PASS |
| Bayer4 100% | 0.529412 | 43.75% | PASS | ACCEPTABLE | PASS |

- 기준선과 8개 후보의 grid SHA-256이 `quality-matrix.json`과 모두 일치했다.
- 모든 후보의 static-region changed-pixel ratio 최대값은 0이다.
- alpha topology mismatch 독립 재계산값도 0이다.

### 6. 파이프라인·회귀·보안

- Dither mapping과 cleanup 후에 outline을 적용한다 (`pixelate_studio.html:6213-6242`). 외곽선 색은 `finalPalette`에 추가되며 디더링 대상이 아니다.
- alpha threshold 미만은 palette grid의 빈 인덱스로 남아 dither가 alpha topology를 바꾸지 않는다.
- Bayer 좌표는 전체 logical canvas `(x,y)`와 matrix modulo로 계산하며, 결과 JSON에 `origin: [0,0]`을 기록한다 (`pixelate_studio.html:5104-5128`, `6455-6459`).
- `animation-safe`와 `oklab-animation-stable` 두 preset의 dither mode는 `off`이다.
- `pal002-ui-check.mjs`, `palette-algorithm-check.mjs`, `settings-check.mjs` 포함 전체 회귀가 통과했다.
- CSP 독립 해시는 `sha256-dCThAbZF9KDGIWkx4zjYcZtJPzsERu8D3uoo4yb62DU=`이며, inline script 1개·HTML·`SECURITY.md`·`vercel.json` 모두에서 일치한다.

## 실행 검사 및 산출물

```bash
node --test scripts/dit001-check.mjs
node scripts/dit001-ui-check.mjs
node scripts/dit001-evidence-gate-check.mjs
node scripts/pal002-ui-check.mjs
node scripts/settings-check.mjs
node scripts/security-check.mjs
node scripts/visual-quality-check.mjs
git diff --check
```

- 위 명령은 모두 exit 0.
- `scripts/*check.mjs` 28개를 전체 실행하여 `passed=28`, `failed=0`.
- 현재 증거본을 임시 복제하고 `generate-dit001-browser-qa.mjs`, `generate-dit001-evidence.mjs`를 재실행했다. 17 capture·16 frame gate PASS, 정량 수치·grid hash가 현재 산출물과 일치했다. 독립 검토가 `PENDING`인 상태에서 최종 상태를 `NEEDS_REVIEW`로 유지하는 것도 확인했다.
- fresh localhost에서 경고 상태 10개·unlimited disabled를 재검증해 모두 PASS, console error/warning 0을 확인했다.

## 발견 및 잔여 위험

- Low: 후보별 `REJECTED` fail-closed 분기가 체크인 자동 회귀에 들어 있지 않다. 이번 독립 검토에서는 임시 복제본으로 실제 fail-closed를 재현했으며, 현재 구현 오류는 찾지 않았다.
- Low: `browser-result-assets` 정지 이미지는 native export PNG가 아니라 모달 UI를 포함한 시각 증거 캡처이다. 현재 명세가 요구하는 브라우저 시각 검사와 결과 메타데이터 대조는 만족한다. 후속에서 네이티브 PNG export까지 byte-level 증거가 필요하다면 연결을 강화할 수 있다.

## 결론 정리

STATUS: DONE_WITH_CONCERNS

FINDINGS: Low - `scripts/dit001-evidence-gate-check.mjs:166-168`은 누락 선호 전체 상태만 자동 검사하고, 후보 단위 `REJECTED` 분기는 체크인 자동 회귀에 포함되지 않았다. 이번 독립 검증에서 `REJECTED` fail-closed를 재현해 구현 오류는 찾지 않았다.

SPEC_ALIGNMENT: aligned. DIT-001 명세의 정량·1× 선호·비공백/애니메이션·회귀·보안 조건을 충족한다. 통과 후보도 기본값·프리셋에 상시 활성하지 않고 실험 opt-in으로 유지한다.

TEST_EVIDENCE: DIT-001 node:test 7/7 PASS; DIT UI/evidence-gate PASS; `scripts/*check.mjs` 28/28 PASS; PAL-002 UI·settings·security·visual-quality PASS; `git diff --check` PASS; fresh localhost 경고 전이 10개 PASS, console 0/0; 17 PNG/asset/settings hash 0 mismatch; 16 animation frame SHA-256 16 distinct; 현재 증거본 재실행·누락/REJECTED fail-closed 재실행 PASS.

RISKS: 체크인 자동 회귀의 `REJECTED` 분기 누락과 native export 대신 UI 시각 증거를 result asset으로 쓰는 점이 남아 있다. 두 잔여 위험은 현재 명세의 PASS를 뒤집을 수준은 아니다.

RECOMMENDATION: APPROVE

FINAL_VERDICT: PASS
