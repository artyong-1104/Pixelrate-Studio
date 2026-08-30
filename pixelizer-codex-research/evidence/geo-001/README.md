# GEO-001 현재 소스 결속 증거

검증 시각: 2026-08-30 09:48 KST

판정: `DONE`

브라우저: Codex In-app Browser (브라우저 제어 API에서 버전 미제공)

URL: `http://localhost:8000/pixelate_studio.html?qa=geo001-final-20260830`

현재 소스 결속값:

- git HEAD: `3463fa01e21f6021430480f2e16bb42ca596bf36`
- `pixelate_studio.html`: `d627799749e5e88e2490d246492dfcad59a7ff06511f899a667f5bfcd0ab2fc3`
- localhost에서 제공된 HTML: `d627799749e5e88e2490d246492dfcad59a7ff06511f899a667f5bfcd0ab2fc3`
- `pixelate-worker.js`: `444db75f4ebf6a57c43e1dc1805fb70459831003d34998a89b4db690994665f0`

## 1. 자동 검사 결과

| 검사 | 결과 | 요약 |
|---|---|---|
| `node scripts/security-check.mjs` | PASS | CSP 해시 3곳 동기화, 위험 sink 및 네트워크 API 없음, 용량/픽셀 한도 검증 |
| `node scripts/preserve-sheet-check.mjs` | PASS | 정수 배율 2~16 검증, 비나누어떨어짐 거부, whole/sheet 프레임 분할, 알파 가중 sRGB 평균, 기존 모드 호환 |
| `node scripts/visual-quality-check.mjs` | PASS | 기존 `current-square-default`, `current-preserve-sheet-4x` 기준선 100% 불변 확인 |
| `node scripts/geo001-ui-check.mjs` | PASS | DOM 마크업, 초기 숨은 factor disabled, 제거 후 validation 재계산, Enter/Space 실행 경로 검증 |
| `node scripts/generate-geo001-evidence.mjs` | PASS | 3개 테스트 케이스 실행 및 2회 연속 결정성 검사 통과 |
| `node scripts/geo001-evidence-gate-check.mjs` | PASS | 현재 HTML·Worker·HEAD와 모든 필수 시나리오·JPEG 디코딩·치수·SHA-256 결속, 음성 테스트 통과 |
| 전체 `scripts/*-check.mjs` 32개 | PASS (32/32) | PERF-001 브라우저 증거를 현재 application SHA-256에 재결속한 뒤 전 항목 통과 |
| `git diff --check` | PASS | 공백 및 코드 포맷 오류 없음 |

결정성 요약 해시 (`deterministicSha256`): `893f0da6936f5051c2ac15215764bfbaba0f25d4326d8a44a2e4fb5ba71a232d`  
전체 기계 판독 데이터는 [summary.json](summary.json)에 기록되어 있습니다.

## 2. GEO-001 변환 기준선 및 결과

| 케이스 | 원본 크기 | 배율 | 분할 모드 | 출력 논리 크기 | RGBA SHA-256 | PNG SHA-256 | JSON SHA-256 |
|---|---:|---:|---|---:|---|---|---|
| `non-square-factor-3x` | 480×702 | 3× | 전체 (`whole`) | 160×234 | `d7bb82f69ea2b5bccf209cf7bbffef0c0fccf9d1ecbf85ce6d35734517c3a239` | `16ccc3691a1da0f17789acb295cc1afba0223d455168f7f7ddf80aed78d4f897` | `59cb62644d2b172ac14e4962ff900d35d3b61471dd57d4b2a24e2608187db8d9` |
| `hero-factor-8x` | 768×1344 | 8× | 전체 (`whole`) | 96×168 | `09b6c3bf7ba75e8d8347e16754aafa4cd92bf68f84c138a3f160ab26596b2abe` | `0446810d279349bfd410957e04d05ca576c33f1c25ad3c8578b3e4d32644516b` | `08ba61a59087e6b972987bd98cb9ba4124f4cf35f968cd571255c78f8c2ae6eb` |
| `sprite-sheet-factor-4x` | 256×128 | 4× | 시트 (`sheet`, 64×64) | 64×32 (프레임 16×16) | `b5d1d3fa7b8a5a4158f18aa025a943396ed00a9c8e597e96adaf2d4ff2d95dc9` | `822f390ec7baa5202d772c92e00e95e790fc3f9bafb8b3a622c95a0ed33aeedc` | `25152fbabc274549200770c319d422a1ef359f5f194201b8f3236eb2aa16e1f5` |

### 결과 파일 링크

- [non-square-factor-3x.png](non-square-factor-3x.png) · [non-square-factor-3x.json](non-square-factor-3x.json)
- [hero-factor-8x.png](hero-factor-8x.png) · [hero-factor-8x.json](hero-factor-8x.json)
- [sprite-sheet-factor-4x.png](sprite-sheet-factor-4x.png) · [sprite-sheet-factor-4x.json](sprite-sheet-factor-4x.json)

## 3. 알고리즘 및 경계 검증 요약

1. **치수 및 종횡비 유지**:
   - `768×1344 ÷ 8` → `96×168` 정확한 정수 논리 치수 출력.
   - `480×702 ÷ 3` → `160×234` 정확한 정수 논리 치수 출력.
   - 재확대 없이 네이티브 논리 해상도 RGBA를 그대로 반환.
2. **프레임 분할 (Sheet mode)**:
   - 스프라이트 시트 모드에서 각 프레임의 원점에서 셀 격자를 독립적으로 시작 (`frameLogicalW = frameWidth / factor`, `frameLogicalH = frameHeight / factor`).
   - 노이즈 정리(`cleanPreserveSheet`) 및 외곽선(`outlinePreserveSheet`)이 프레임 경계를 침범하지 않음.
3. **색상 및 알파 평균**:
   - 투명 픽셀이 섞인 셀에서 alpha-weighted sRGB 평균값 및 셀 평균 알파 `Math.round(aSum / (factor * factor))` 산출.
4. **엄격한 사전 유효성 검증**:
   - 배율 2~16 범위를 벗어난 값(1, 17, NaN) 사전 차단.
   - 깨끗한 단일 업로드와 다중 파일 상태에서 가로 또는 세로가 배율로 나누어떨어지지 않는 입력은 파일명 포함 오류를 표시하고 실행 버튼을 비활성화했다.
   - 유효 파일과 잘못된 파일을 함께 올린 뒤 유효 파일을 제거한 직후에도 남은 오류 입력을 다시 검증해 실행 버튼을 계속 비활성화했다.
   - 스프라이트 시트 모드에서 이미지가 프레임으로 나누어떨어지지 않거나 프레임이 배율로 나누어떨어지지 않는 경우 사전 차단.
5. **기존 기능 완전 호환**:
   - `square`, `preserve-sheet`, `original` 모드의 로직 및 결과 해시 일체 불변.

## 4. 실제 브라우저 QA

전체 기계 판독 측정값은 [browser-qa.json](browser-qa.json)에 있다.

| 시나리오 | 결과 | 실제 측정 |
|---|---|---|
| 데스크톱 factor 전환 | PASS | `factorOptions`: `none → block`, factor 모드에서 square 크기 입력 disabled |
| 숨은 컨트롤 disabled | PASS | 초기 square 모드에서 `factorOptions`는 `none`, `factor.disabled === true` |
| 768×1344 / 8 | PASS | live `96×168`, 결과 `96×168`, 종횡비 `4:7` 유지 |
| 480×702 / 3 | PASS | live·결과 모두 `160×234` |
| 1× / 8× | PASS | 논리 canvas `96×168`, CSS `96×168` / `768×1344` |
| sheet 256×128 | PASS | 64×64 원본 프레임 4열×2행, 논리 프레임 16×16, 전체 `64×32` |
| 단일 invalid | PASS | `101×100 ÷ 4` 파일명 포함 오류, 안정 상태에서 run disabled |
| 다중 invalid | PASS | 유효+invalid 파일에서 invalid 파일명 표시, run disabled |
| invalid 제거 전이 | PASS | 유효 파일 제거 직후와 250ms 안정 상태 모두 오류 표시 및 run disabled |
| 390×844 모바일 유효·invalid | PASS | `scrollWidth 382 ≤ viewport 390`, valid 8×와 invalid disabled 확인 |
| 키보드 실행 | PASS | 포커스된 실행 버튼에서 Enter는 `96×168`, Space는 `160×234` 결과 생성 |
| 콘솔 | PASS | 전체 시나리오 후 브라우저 error 로그 0, warn/warning 로그 0; 별도 pageerror 스트림은 API 미제공이므로 미측정값을 추정하지 않음 |

## 5. 브라우저 캡처

모든 캡처는 실제 JPEG 디코더(`sips`)로 포맷과 치수를 확인했다.

| 파일 | 치수 | SHA-256 |
|---|---:|---|
| [browser-desktop-valid-1x.jpg](browser-desktop-valid-1x.jpg) | 1280×900 | `a283ba7c6172647074c0bd25e40d14170fe3f7078564ac31dec3aa188e1cf7a9` |
| [browser-desktop-valid-8x.jpg](browser-desktop-valid-8x.jpg) | 1280×900 | `a0e6b0c02f353da94e879eb239bc33fc1779655abc77d91043547c89e3ce91b9` |
| [browser-desktop-sheet-8x.jpg](browser-desktop-sheet-8x.jpg) | 1280×900 | `184f370bf690da4d9a40fdb7dfdd1161c3ef27575c1c63a383a186f2c1b2acef` |
| [browser-mobile-invalid-disabled.jpg](browser-mobile-invalid-disabled.jpg) | 382×1269 | `6cec331f6153da83093af3d13d8bcea207808f1b111e5f29ccb5ef2e407042e6` |
| [browser-mobile-valid-8x.jpg](browser-mobile-valid-8x.jpg) | 382×827 | `4edd4d711cd171d7ebe1707f72bf758fa303445c1e0304defef0ce55c1d1d8e1` |

브라우저 업로드 입력은 [browser-fixtures](browser-fixtures/)에 있고, generator가 매번 같은 PNG와 SHA-256을 만든다.

## 6. Fail-closed evidence gate

[geo001-evidence-gate-check.mjs](../../../scripts/geo001-evidence-gate-check.mjs)는 현재 HTML·Worker·git HEAD, 필수 시나리오, localhost URL, JPEG 디코딩·치수·SHA-256을 검사한다. 별도 임시 디렉터리에서 다음 음성 테스트가 모두 의도대로 거부됨을 확인했다.

- 캡처 누락
- 캡처 바이트 변조
- 이전 HTML 또는 Worker SHA-256
- `status: FAIL`
- 필수 시나리오 `false`

GEO-001의 필수 브라우저 시나리오와 fail-closed gate가 통과했다. 운영 변경은 초기 disabled 동기화, 파일 제거 후 validation 상태 보존, Enter/Space 실행 활성화로 제한했고, 인라인 JavaScript CSP 해시는 HTML·`SECURITY.md`·`vercel.json`에서 동기화했다. 별도 범위에서 PERF-001 브라우저 증거도 현재 application SHA-256에 재결속해 전체 `scripts/*-check.mjs` 32/32가 통과했으므로 GEO-001의 최종 판정은 `DONE`이다.
