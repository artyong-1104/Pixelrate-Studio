# QLT-001 완료 증거

검증 시각: 2026-08-14 18:13 KST  
환경: macOS arm64, Node v26.4.0

## 자동 검사 결과

| 검사 | 결과 |
|---|---|
| `node scripts/generate-pixel-fixtures.mjs --verify` | PASS — 12개, PNG 합계 2,822,491 bytes, 결정적 hash 일치 |
| `node scripts/visual-quality-check.mjs --report …/report.json` | PASS — 12/12, 실패 0, 585.045ms |
| 동일 seed·version 2회 비교 | PASS — `db4b3d904fbcc53e83966e3db097b6e27242ee6494e7c0f2f943a007e6f23cef` |
| seed·generatorVersion 변경 감지 | PASS — 두 변경 모두 corpus hash 차이 확인 |
| 잘못된 manifest 거부 | PASS — 중복 ID, 0 치수, 누락 hash, 누락 feature 검사 |
| 기존 preserve-sheet 회귀 | PASS — layout, validation, compatibility, blocks, alpha, boundaries |
| 보안 회귀 | PASS — CSP, integrity, unsafe sink, network API, input limit, storage opt-in |
| `git diff --check` | PASS |

전체 기계 판독 보고서는 [report.json](report.json)에 있다. 해당 파일의 SHA-256은 `d8abf5fd6c7cbc44bb6c88237c70101e0967f70fbd227d43ceccb6241a2627e6`이다. `generatedAt`, 환경, 실행 시간은 결정성 hash 대상에서 제외된다.

## 현재 앱 기준선

| 기준선 | fixture | 결과 | RGBA SHA-256 | PNG SHA-256 | JSON SHA-256 |
|---|---|---:|---|---|---|
| square 기본값 | `photo-like` | 64×64, 16색 | `ab006b365f9c4ef350de14db3194e688e65043399d4950f710dd2a6ff2c475f1` | `240cff6c311d54d6ac9b25c8d15830e5f41bfa61e72c03e5890a16ef0cc61eb0` | `2e2cbcbebae62ae6992bb2453298a64e72aeb1fb58f7cc545be289f93dcceb42` |
| preserve-sheet 4× | `sprite-sheet` | 256×128, 16색 | `55bf669981d752c5676b40e23dcc272aeadcb18ae48014a09cab8653145f9729` | `358068978e90e30b517d34e5570c874e2ae9bac5f01a49cf6c6f5d4b251f7635` | `98a73ed34509bd8429feb092ffa7d7d4d05bbb33285f521d462d19128fe7763c` |

두 기준선은 [pixelate_studio.html](../../../pixelate_studio.html)의 현재 `boxDownscale`, `preserveSheetDownscale`, K-means, 정리, 확대 함수를 공통 extractor로 읽어 실행한다. 앱의 운영 JavaScript를 테스트용으로 복사하지 않는다.

## 수동 시각 QA

`node scripts/generate-pixel-fixtures.mjs --output /tmp/pixelate-studio-fixtures`로 800×600 contact sheet와 개별 PNG를 생성했다. contact sheet SHA-256은 `fe1a8240034e864d0cda4c3a46583723d52d2e44f5939c5058b8b75d6f494ff3`이다.

- 12개 tile이 manifest의 ID 오름차순으로 모두 표시됨을 확인했다.
- `ai-grid-wobble`은 8px 기반 셀 경계의 ±1px 흔들림과 셀 내부 색 혼합이 보인다.
- `thin-lines`는 1px·2px 직선, 대각선, 곡선 marker가 1×와 nearest 8×에서 끊김 없이 보인다.
- `alpha-edge`는 원형 soft edge와 면적 1·2·3px의 분리 island가 1×와 nearest 8×에서 구분된다.
- `sprite-sheet`는 4열×2행 프레임, 프레임별 도형과 오른쪽 경계 marker가 1×와 nearest 8×에서 분리되어 보인다.
- contact sheet는 표시용 합성물이며 승인 hash의 원본 PNG를 대체하지 않는다.

## 변경 경계

- 운영 UI, 처리 기본값, 공개 설정 JSON, 결과 JSON은 변경하지 않았다.
- repo에는 생성 PNG를 저장하지 않는다. fixture와 contact sheet는 `/tmp`에서 필요할 때 재생성한다.
- 이후 기준선 갱신은 `--update-baseline`을 명시적으로 실행한 뒤 [manifest.json](../../../tests/fixtures/manifest.json)의 fixture별 diff와 변경 사유를 검토해야 한다.
