# CFG-001 — Versioned 설정 JSON과 목적별 preset

## 1. 메타데이터

| 항목 | 값 |
|---|---|
| 명세 상태 | 완료 |
| 구현 상태 | DONE |
| QA 상태 | 완료 — 현재 소스 검증 및 전체 37/37 PASS |
| 우선순위 | P1 |
| 근거 분류 | SOURCE-BACKED + ENGINEERING-INFERENCE |
| 구현 모델 | Luna xhigh |
| 선행 항목 | QLT-001 |

## 2. 목표와 사용자 완료 상태

사용자가 변환 조건만 JSON으로 내보내고 다른 브라우저에서 안전하게 불러온다. 내장 preset은 바뀌는 값을 미리 보여 주며, 결과 이미지나 파일명은 설정 파일에 포함하지 않는다.

## 3. 현재 문제와 근거

현재 설정은 선택적으로 IndexedDB 로그에만 저장되고 flat object를 `loadSettings`가 직접 UI에 적용한다. Source 06은 설정 JSON과 template을 제공한다. 휴대 가능한 versioned schema가 이후 항목의 설정 호환 기준이 된다.

## 4. 포함·비포함 범위

포함: settings envelope v1, strict known-field validation, legacy normalize, import/export, built-in preset, diff preview.

비포함: 클라우드 동기화, 사용자 preset 영구 라이브러리, 결과 JSON import, 미래 항목의 미구현 필드.

## 5. UI 명세

- 설정 패널 상단에 `프리셋` select와 `적용` 버튼을 둔다.
- v1 preset:
  - `기본값`: 현재 reset과 동일
  - `애니메이션 안전`: shared palette on, clean 1, outline off; 미구현 dither/grid 필드는 넣지 않음
  - `시트 규격 유지`: preserve-sheet, frame 64×64, block 4
- 적용 전 `변경될 항목` 목록을 표시하고 사용자가 확인해야 적용한다.
- `설정 내보내기`와 `설정 불러오기` 버튼, hidden file input `.json`, 최대 64KB.
- 성공 메시지와 오류는 alert 대신 settings 영역 `aria-live` 상태에 표시한다.

## 6. 데이터 구조와 처리 알고리즘

```json
{
  "format": "pixelate-studio-settings",
  "version": 1,
  "createdAt": "2026-08-14T00:00:00.000Z",
  "settings": {
    "scaleMode": "square",
    "size": 64,
    "method": "box",
    "paletteMode": "auto",
    "colors": 16,
    "shared": true,
    "cleanEnabled": true,
    "cleanPasses": 1,
    "outlineEnabled": false,
    "outlineWidth": 1,
    "outlineColor": "#000000",
    "outlineShape": "4"
  }
}
```

함수 경계:

- `readUiSettings()` → normalized settings
- `normalizeSettings(input, source)` → `{settings, warnings}` 또는 typed error
- `validateSettingsEnvelope(value)` → import 전 전체 검증
- `applyUiSettings(settings)` → 모든 control 적용 후 sync 함수 1회
- `diffSettings(current, next)` → stable key 순서 diff

## 7. 검증 규칙

- top-level `format`, `version`, `settings` 필수. `createdAt`은 선택 ISO string.
- version 1 외 거부. 미래 version은 부분 적용하지 않는다.
- 알려진 필드의 type/range/enum이 틀리면 전체 거부하고 기존 UI를 변경하지 않는다.
- 알려지지 않은 settings 필드는 무시하고 이름과 개수를 경고한다.
- `__proto__`, `prototype`, `constructor` key는 어느 깊이에서도 거부한다.
- JSON parsing 전 file size 64KB, UTF-8 text만 허용한다.
- export key 순서는 고정하고 2-space JSON을 쓴다.

## 8. 호환·경계조건

- 기존 로그의 `downscaleEnabled`, `paletteEnabled`, `colorsNum`, `cleanNum`, `outline` 등 flat field를 v1으로 normalize한다.
- legacy 누락값은 현재 reset 값이다.
- import 실패는 부분 UI 적용·아코디언 이동을 하지 않는다.
- preset 적용은 업로드 파일과 결과를 지우지 않는다.
- 후속 항목은 v1 settings에 additive field를 추가하고 normalize default를 반드시 정의한다.

## 9. 보안·성능·접근성

- JSON을 DOM HTML로 삽입하지 않고 `textContent`만 쓴다.
- 설정 파일은 네트워크·IndexedDB에 자동 저장하지 않는다.
- parsing과 diff는 64KB 상한에서 동기 실행 가능하다.
- file input label, 키보드 적용, focus 유지, aria-live 오류를 검증한다.

## 10. 예상 변경과 순서

- `pixelate_studio.html`: UI, settings normalization, 로그 저장·복원, reset, import/export
- `scripts/settings-check.mjs`: schema, legacy migration, round trip
- README/CHANGELOG 및 CSP hash 위치

순서: normalized model → legacy tests → import/export → preset diff → UI → 로그 연결 → 문서/CSP.

## 11. 자동 테스트

- 현재 default export→import round trip 동일
- factor 구현 후 factor fields round trip
- legacy `downscaleEnabled:false`가 original로 복원
- invalid enum/range/type, 64KB 초과, prototype key, version 2 거부
- unknown settings field는 경고 후 나머지 적용
- import 실패 전후 UI settings 동일
- preset diff key 순서 결정적
- export에서 결과 data URL·파일명 없음

## 12. 브라우저 수동 QA

각 preset diff, 취소/적용, export filename `pixelate-studio-settings-v1.json`, 재불러오기, 잘못된 파일 오류, 모바일/키보드 focus를 확인한다. IndexedDB legacy 로그도 복원한다.

## 13. 수용 기준

- v1 round trip에서 모든 지원 설정 동일
- invalid import가 UI를 한 필드도 변경하지 않음
- 기존 로그 복원 성공
- preset이 명시한 필드만 변경
- 동일 settings export는 `createdAt` 제외 동일

## 14. 완료 증거

v1 예제, legacy migration 검사, invalid import 캡처, preset diff 캡처를 대시보드에 연결한다.

## 15. Luna xhigh 실행 지시문

> CFG-001만 구현한다. 기존 loadSettings 직접 적용을 read/normalize/validate/apply 경계로 나누고, 64KB versioned settings JSON과 세 내장 preset을 추가한다. invalid import는 원자적으로 거부하고 legacy IndexedDB flat settings를 계속 복원한다. 미구현 미래 필드는 export하지 않는다. preset diff, 접근성, 보안 key 거부, round-trip 테스트, CSP 해시와 기존 회귀를 완료한다.

## 16. 중단·상향 조건

- 기존 로그에 문서화되지 않은 형태가 있어 default로 안전하게 normalize할 수 없으면 샘플과 영향 범위를 보고한다.
- settings schema를 version 2로 시작해야 할 이유가 생기면 임의 변경하지 않고 상위 명세 검토를 요청한다.

## 2026-09-06 현재 소스 재검증

프리셋 취소/선택 변경 및 import focus 보완. round trip·legacy 로그·invalid 원자적 거부·모바일 캡처를 기록했다. [증거 및 남은 완료 조건](../../evidence/completion-20260906/README.md). 전체 36/37 검사로 최종 DONE은 보류한다.

## 2026-09-06 최종 판정

현재 소스 전체 자동 검사 37/37, 항목별 브라우저·결정성·무결성 증거를 확인해 `DONE`으로 갱신했다. 앞의 NEEDS_REVIEW 기록은 검증 진행 중의 이력이다. [최종 보고서 및 검증 환경·한계](../../evidence/completion-20260906/README.md).
