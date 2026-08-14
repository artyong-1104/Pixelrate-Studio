# GEO-001 — 비율 유지 exact-factor/native 출력

## 1. 메타데이터

| 항목 | 값 |
|---|---|
| 명세 상태 | 완료 |
| 구현 상태 | DONE |
| QA 상태 | 완료 |
| 우선순위 | P1 |
| 근거 분류 | SOURCE-BACKED |
| 구현 모델 | Luna xhigh |
| 선행 항목 | QLT-001 |

## 2. 목표와 사용자 완료 상태

사용자가 `768×1344 → 96×168`처럼 정수 배율을 지정해 종횡비를 유지한 native 논리 해상도 PNG를 만든다. 기존 square와 preserve-sheet를 바꾸지 않고 새 `factor` 모드를 추가한다.

## 3. 현재 문제와 근거

- square는 비정사각 입력도 정사각으로 만든다.
- preserve-sheet는 논리 픽셀을 원본 크기로 재확대한다.
- Source 01·04·07의 알려진 배율 복원, Source 02의 3배 축소, Source 06의 비정사각 resize가 직접 근거다.
- 8배는 범용 기본값이 아니므로 기본 factor는 4다.

## 4. 포함·비포함 범위

포함: 2~16 정수 factor, 전체 이미지 또는 frame-local sheet, alpha-weighted sRGB mean, native 출력, 치수 계산·검증.

비포함: 자동 grid 감지, partial cell crop/pad, 대표색 선택, 확대 파생 PNG, 기존 모드 기본값 변경.

## 5. UI 명세

- `scaleMode`에 `factor` 값과 라벨 `정수 배율 축소 (비율 유지)`를 square 다음에 추가한다.
- factor 영역:
  - 숫자 입력 `축소 배율`, min 2, max 16, step 1, 기본 4
  - 라디오 `전체 이미지`(기본), `스프라이트 시트 프레임별`
  - sheet 선택 시 기존과 같은 `프레임 너비/높이` 입력, 기본 64×64
  - live 문구: `입력 768×1344 ÷ 8 → 출력 96×168`
- 하나라도 나누어떨어지지 않으면 실행 버튼을 막고 `파일명: 768×1345는 배율 8로 정확히 나눌 수 없습니다.`를 표시한다.
- sheet에서는 이미지가 frame 크기로, frame 크기가 factor로 나누어떨어져야 한다.

## 6. 데이터 흐름과 알고리즘

새 순수 함수 `exactFactorDownscale(img, factor, frameWidth = null, frameHeight = null)`를 만든다.

1. whole mode는 `(0,0)`에서 factor×factor cell을 순회한다.
2. sheet mode는 각 frame top-left에서 cell 원점을 다시 시작한다.
3. RGB는 현재 preserve-sheet와 같은 alpha-weighted sRGB mean, alpha는 cell 평균을 쓴다.
4. 결과는 재확대하지 않고 `sourceW/factor × sourceH/factor` RGBA를 반환한다.
5. cleanup·palette·outline은 logical 결과에 적용한다. sheet frame logical 크기는 `frameWidth/factor × frameHeight/factor`다.

## 7. 설정·결과 인터페이스

설정 필드:

```json
{
  "scaleMode": "factor",
  "factor": 4,
  "factorFrameMode": "whole",
  "frameWidth": 64,
  "frameHeight": 64
}
```

sheet가 아니어도 frame 값은 저장할 수 있으나 처리에는 사용하지 않는다.

결과 JSON:

```json
{
  "processing": {
    "mode": "factor",
    "factor": 4,
    "frameMode": "whole",
    "logicalWidth": 120,
    "logicalHeight": 176
  }
}
```

sheet이면 `frameWidth`, `frameHeight`, `frameLogicalWidth`, `frameLogicalHeight`를 추가한다.

## 8. 호환·경계조건

- factor 누락 legacy 설정은 기존 scaleMode 기본값으로 복원한다.
- square/preserve/original 함수와 결과 hash를 바꾸지 않는다.
- factor는 정수만 허용하며 문자열, NaN, 1, 17은 거부한다.
- outline은 whole mode에서 기존처럼 canvas를 키우고, sheet mode에서는 프레임 내부에만 그린다.
- 최소 결과 한 축이 1보다 작으면 거부한다.
- 여러 파일 중 하나가 실패하면 전체 실행 전 파일명을 포함해 검증 오류를 보여 준다.

## 9. 보안·성능·접근성

- 새 입력은 숫자 범위와 정수 여부를 처리 직전 다시 검증한다.
- logical pixel 수가 기존 `MAX_RAW_PROCESS_PIXELS`를 넘으면 거부한다.
- 모드 전환 시 숨은 컨트롤은 disabled 처리한다.
- live 계산은 `aria-live="polite"`, 입력은 명시적 label과 describedby를 사용한다.

## 10. 예상 변경과 순서

- `pixelate_studio.html`: UI, normalize/load/reset/settings summary, validation, downscale, process/result JSON
- `scripts/preserve-sheet-check.mjs` 또는 QLT 하네스: exact-factor 함수·경계 회귀
- `README.md`, `CHANGELOG.ko.md`, `CHANGELOG.md`: 사용자 동작과 호환 설명

순서: 순수 함수·검증 → 테스트 → UI → settings/log → result JSON → 문서 → CSP hash.

## 11. 자동 테스트

- 768×1344 / 8 = 96×168
- 480×702 / 3 = 160×234
- 128×64 sheet, frame 64×64, factor 4는 32×16 결과와 16×16 logical frame
- 다음 frame에서 block 원점이 다시 시작됨
- alpha-weighted RGB와 평균 alpha가 기존 fixture와 일치
- 101×100 / 4, frame 66 / 4, factor 1·17 거부
- 기존 세 scale mode hash와 설정 normalize 유지
- security/preserve-sheet/visual-quality 검사 통과

## 12. 브라우저 수동 QA

데스크톱과 620px 화면에서 모드 전환, disabled 상태, live 계산, 오류 메시지, 다중 파일 오류를 확인한다. 96×168 결과를 1×·8×에서 열고 종횡비와 frame 경계를 확인한다.

## 13. 수용 기준

- 유효 입력의 치수와 각 factor cell이 100% 정확
- sheet에서 cleanup·outline이 frame을 넘지 않음
- 기존 세 모드의 PNG/JSON hash 변화 없음
- invalid 입력은 변환 전에 차단
- 동일 입력 2회 hash 일치

## 14. 완료 증거

두 non-square fixture와 한 sheet fixture의 PNG·JSON, invalid UI 캡처, 자동 검사 출력을 대시보드에 연결한다.

## 15. Luna xhigh 실행 지시문

> GEO-001만 구현한다. exact factor 2~16과 whole/sheet frame-local 경로를 새 scaleMode로 추가하되 square, preserve-sheet, original은 변경하지 않는다. 나누어떨어지지 않는 입력은 실행 전에 파일명과 계산을 포함해 거부한다. RGB/alpha 계산은 현재 preserve-sheet 기준선을 재사용하고 native 논리 해상도를 출력한다. 설정 복원·로그·결과 JSON·reset·도움말·모바일·CSP 해시를 함께 갱신하고 명세의 자동·수동 검사를 모두 수행한다.

## 16. 중단·상향 조건

- partial cell crop/pad 요구가 생기면 임의 정책을 만들지 않고 중단한다.
- factor mode가 기존 JSON의 width/height 의미 변경을 요구하면 Sol xhigh 검토로 올린다.
- frame-local cleanup/outline을 유지할 수 없으면 완료하지 않는다.
