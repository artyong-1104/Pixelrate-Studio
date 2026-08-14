# PAL-001 — Custom palette 입력·미리보기·검증

## 1. 메타데이터

| 항목 | 값 |
|---|---|
| 명세 상태 | 완료 |
| 구현 상태 | NOT_STARTED |
| QA 상태 | 미실행 |
| 우선순위 | P1 |
| 근거 분류 | SOURCE-BACKED |
| 구현 모델 | Luna xhigh |
| 선행 항목 | QLT-001, CFG-001 |

## 2. 목표와 사용자 완료 상태

사용자가 2~256개의 고정 RGB 색을 입력해 모든 결과에 같은 팔레트를 적용하고, 적용 전 색상 chip·개수·중복·무시된 색을 확인한다.

## 3. 현재 문제와 근거

현재 팔레트는 auto K-means 또는 제한 없음뿐이다. Source 05·06은 custom palette를 핵심 기능으로 제공한다. custom palette는 스타일 일관성에 유용하지만 입력 색 mismatch가 크면 품질을 보장하지 않는다.

## 4. 포함·비포함 범위

포함: hex text, JASC/GIMP GPL text, palette PNG, exact dedupe, sRGB nearest mapping, chip preview, 설정 저장.

비포함: ASE/ACO, alpha palette, OKLab error 경고, palette 편집기, 색 이름, 자동 ramp 생성.

## 5. UI 명세

- 기존 palette enable checkbox를 `팔레트 방식` radio/select로 교체: `자동 생성`(기본), `직접 지정`, `제한 없음`.
- 직접 지정 선택 시:
  - textarea: 한 줄에 `#RRGGBB`, 쉼표·공백 구분도 허용
  - `팔레트 파일 불러오기`: `.txt`, `.gpl`, `.png`, 최대 1MB
  - chip grid와 `유효 N색 · 중복 M개 제거 · 무시 K개`
- 2색 미만 또는 256색 초과면 실행을 막는다.
- `모두 지우기`는 palette만 초기화하고 mode를 바꾸지 않는다.

## 6. 파서와 매핑 알고리즘

- HEX: `#RRGGBB`만 허용. 3자리·8자리·이름·rgb()는 거부한다.
- GPL: `GIMP Palette` header, 주석·Name·Columns 허용, 각 색은 decimal R G B 0~255.
- 일반 TXT: 유효 hex token 외 non-whitespace token이 있으면 line 번호와 오류.
- PNG: row-major scan, alpha 255 픽셀만 색으로 사용; alpha 0은 무시; 1~254는 무시하고 개수 경고.
- exact RGB key로 첫 등장 순서를 유지해 dedupe한다.
- mapping은 현재 `nearestColorIndex`의 sRGB squared distance를 사용한다. tie는 palette의 더 앞 index.

## 7. 설정·결과 인터페이스

```json
{
  "paletteMode": "custom",
  "customPalette": ["#000000", "#ffffff"],
  "colors": 2,
  "shared": true
}
```

- custom에서 colors는 palette length로 normalize하며 slider는 disabled다.
- legacy `paletteEnabled:false` → `unlimited`, true → `auto`.
- 결과 JSON palette는 custom 순서를 유지하되 사용되지 않은 색도 포함한다. grid index 안정성을 위해 제거하지 않는다.
- `processing.palette`에 `{mode:"custom", inputColors:N, usedColors:M, distance:"srgb"}`를 추가한다.

## 8. 호환·경계조건

- auto와 unlimited 기본 동작·hash를 유지한다.
- 여러 파일에서 custom은 shared checkbox와 무관하게 동일 팔레트를 쓴다. shared는 disabled+checked 상태로 표시한다.
- outline 색이 custom에 없으면 기존처럼 결과 palette 끝에 outline 색을 추가한다.
- import settings의 customPalette는 2~256 unique uppercase/lowercase hex를 normalize한다.
- PNG decode 실패, 1MB 초과, 4096×4096 초과, 유효 색 부족을 명확히 거부한다.

## 9. 보안·성능·접근성

- palette 파일도 기존 FileReader/Image decode와 크기·픽셀 상한을 적용한다.
- file text와 색 이름을 HTML로 삽입하지 않는다.
- 최대 비교 수 `pixelCount × paletteLength`가 `MAX_COLOR_COMPARISONS`를 넘으면 처리 전 거부한다.
- chip은 색상 외에 hex text와 충분한 focus/contrast를 제공한다.

## 10. 예상 변경과 순서

- `pixelate_studio.html`: palette UI, parser, settings, process mapping, result metadata
- `scripts/palette-check.mjs`: parser·dedupe·mapping·legacy normalize
- README/CHANGELOG, CSP hash

순서: parsers → tests → settings normalize → UI preview → process mapping → result JSON → docs/CSP.

## 11. 자동 테스트

- HEX/GPL/TXT/PNG 유효 입력, 순서, dedupe
- malformed token line 오류, partial alpha warning, 1·257 colors 거부
- tie가 첫 palette index 선택
- custom 순서와 unused color가 결과 JSON에 유지
- outline append index 정확
- legacy paletteEnabled migration
- auto/unlimited 기준선 hash 불변

## 12. 브라우저 수동 QA

키보드로 mode·file·clear를 조작하고 chip grid를 light/dark/mobile에서 확인한다. 같은 sprite를 auto/custom/unlimited로 처리해 결과 metadata와 shared disabled 상태를 확인한다.

## 13. 수용 기준

- 세 지원 형식이 같은 색 목록에서 동일 normalized palette 생성
- 2~256 unique 색과 비교 상한을 엄격히 지킴
- custom index 순서 결정적
- auto/unlimited 결과 회귀 없음
- invalid input이 이전 유효 palette를 부분 변경하지 않음

## 14. 완료 증거

각 parser fixture, chip preview, invalid 오류, custom result JSON, 회귀 hash를 연결한다.

## 15. Luna xhigh 실행 지시문

> PAL-001만 구현한다. palette mode를 auto/custom/unlimited로 정규화하고 HEX·GPL·PNG 입력을 명세대로 파싱한다. unique RGB 2~256, 첫 등장 순서, partial alpha 경고, 비교 상한을 지킨다. custom mapping은 현재 sRGB nearest와 앞 index tie-break를 사용하며 결과 JSON palette에서 unused 색을 제거하지 않는다. legacy 설정, UI 접근성, CSP 해시, parser와 기준선 테스트를 완료한다.

## 16. 중단·상향 조건

- 브라우저 PNG decode가 색 profile 때문에 플랫폼별 RGB가 달라지면 fixture와 차이를 보고한다.
- custom palette mismatch를 정량화하려면 PAL-002를 기다리고 임의 threshold 경고를 추가하지 않는다.
