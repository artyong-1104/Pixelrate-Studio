# GEO-001 완료 증거

검증 시각: 2026-08-14 18:30 KST  
환경: macOS arm64, Node v26.4.0

## 1. 자동 검사 결과

| 검사 | 결과 | 요약 |
|---|---|---|
| `node scripts/security-check.mjs` | PASS | CSP 해시 3곳 동기화, 위험 sink 및 네트워크 API 없음, 용량/픽셀 한도 검증 |
| `node scripts/preserve-sheet-check.mjs` | PASS | 정수 배율 2~16 검증, 비나누어떨어짐 거부, whole/sheet 프레임 분할, 알파 가중 sRGB 평균, 기존 모드 호환 |
| `node scripts/visual-quality-check.mjs` | PASS | 기존 `current-square-default`, `current-preserve-sheet-4x` 기준선 100% 불변 확인 |
| `node scripts/geo001-ui-check.mjs` | PASS | DOM 마크업, 옵션 순서, 배율/프레임 입력 및 aria-live 계산 영역 검증 |
| `node scripts/generate-geo001-evidence.mjs` | PASS | 3개 테스트 케이스 실행 및 2회 연속 결정성 검사 통과 |
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
   - 가로 또는 세로가 배율로 나누어떨어지지 않는 입력(예: `768×1345 ÷ 8`, `101×100 ÷ 4`)은 `파일명: 너비×높이는 배율 N으로 정확히 나눌 수 없습니다.` 오류 메시지를 표시하고 실행 버튼을 비활성화.
   - 스프라이트 시트 모드에서 이미지가 프레임으로 나누어떨어지지 않거나 프레임이 배율로 나누어떨어지지 않는 경우 사전 차단.
5. **기존 기능 완전 호환**:
   - `square`, `preserve-sheet`, `original` 모드의 로직 및 결과 해시 일체 불변.
