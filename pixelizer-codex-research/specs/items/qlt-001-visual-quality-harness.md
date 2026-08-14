# QLT-001 — 재현 가능한 시각 품질·시간축 테스트 하네스

## 1. 메타데이터

| 항목 | 값 |
|---|---|
| 명세 상태 | 완료 |
| 구현 상태 | DONE |
| QA 상태 | 완료 |
| 우선순위 | P0 |
| 근거 분류 | ENGINEERING-INFERENCE |
| 구현·검토 모델 | Sol xhigh |
| 선행 항목 | 없음 |

## 2. 목표와 완료 상태

모든 이미지 알고리즘을 동일 fixture와 지표로 비교하는 Node 기반 하네스를 만든다. 사용자는 직접 보는 기능을 얻지 않지만, 이후 개선이 어떤 입력을 좋아지거나 나쁘게 했는지 재현 가능한 보고서를 얻는다.

완료 시 `visual-quality-test-plan.md`의 12개 fixture가 결정적으로 생성되고, 현재 기준선의 PNG/RGBA·JSON hash, 정량 지표, 실행 시간이 한 명령으로 보고된다.

## 3. 현재 문제와 연구 연결

- 현재 `preserve-sheet-check.mjs`는 선택한 함수를 VM으로 추출해 프레임 경계와 블록 평균을 검사한다.
- 시각 품질, 실제 크기, grid 오차, temporal variance, 후보 간 A/B는 자동화되어 있지 않다.
- 외부 소스는 선별 예시 중심이므로 한 사례로 알고리즘 우위를 선언할 수 없다.

## 4. 포함·비포함 범위

포함:

- 외부 의존성 없는 결정적 RGBA fixture generator
- manifest schema와 기준선 hash
- geometry/detail/alpha/palette/temporal/determinism 지표
- JSON 보고서와 사람이 읽는 표 형식 요약
- 기존 HTML 함수 추출 helper의 중복 제거

비포함:

- 운영 UI 변경
- 브라우저 스크린샷 자동화
- 알고리즘 기본값 변경
- fixture 결과를 자동 승인하는 snapshot update 명령

## 5. 파일·설정·인터페이스

사용자 설정과 결과 JSON은 변경하지 않는다. 하네스 설정은 fixture manifest와 CLI argument에만 존재한다.

- `scripts/lib/extract-inline-function.mjs`: HTML에서 명시한 함수만 안전하게 추출
- `scripts/generate-pixel-fixtures.mjs`: seed `20260814`, Node core `zlib` 기반 최소 PNG encoder 또는 raw RGBA JSON 생성
- `scripts/visual-quality-check.mjs`: manifest 실행, 지표와 hash 검증
- `tests/fixtures/manifest.json`: fixture 정의와 승인된 기준선
- `pixelizer-codex-research/evidence/qlt-001/`: 승인 시 보고서 저장 위치

CLI:

```sh
node scripts/generate-pixel-fixtures.mjs --verify
node scripts/visual-quality-check.mjs
node scripts/visual-quality-check.mjs --report /tmp/pixelate-visual-report.json
```

`--verify`는 파일을 갱신하지 않고 생성 결과와 manifest hash가 같은지만 확인한다. 기준선 갱신은 명시적 `--update-baseline`에서만 가능하고, 변경 fixture 목록을 출력한 뒤 실행자가 diff를 검토해야 한다.

## 6. 데이터 흐름과 알고리즘

1. manifest를 ID 오름차순으로 읽는다.
2. generator version과 seed로 RGBA 배열을 만든다.
3. 대상 함수를 현재 HTML에서 추출해 VM context에 넣는다.
4. fixture별 normalized settings를 적용한다.
5. 결과 RGBA와 stable-key-order JSON을 SHA-256으로 계산한다.
6. manifest의 known feature mask로 지표를 계산한다.
7. fixture별 pass/fail과 전체 summary를 기록한다.

시간·환경 값은 결과 hash에서 제외한다. 부동소수점 지표는 소수점 6자리로 반올림한다. 객체 key와 fixture 순서를 정렬한다.

## 7. 지표 정의

`visual-quality-test-plan.md`의 수식을 사용한다. v1 필수 지표는 period/phase error, thin feature survival, connected components, fringe count, palette unique count, temporal changed-pixel ratio, PNG/RGBA hash, elapsed milliseconds다.

정답 mask가 없는 지표는 `null`로 기록하고 pass/fail에 사용하지 않는다. 측정 불가 값을 0으로 대체하지 않는다.

## 8. 호환·경계조건

- fixture generator는 macOS/Linux Node에서 byte-identical 결과를 내야 한다.
- PNG encoder를 만들 경우 filter 0, RGBA8, 고정 chunk 순서만 쓴다.
- 0×0, 잘못된 manifest, 중복 ID, 잘못된 hash는 즉시 non-zero exit다.
- 기존 `preserve-sheet-check.mjs`의 함수 추출 동작과 메시지를 깨뜨리지 않는다.
- repo에 대형 사진 fixture를 추가하지 않는다. 생성 fixture 총합은 5MB 이하로 제한한다.

## 9. 보안·성능·접근성

- 네트워크, 랜덤 시스템 엔트로피, 시간 기반 seed를 쓰지 않는다.
- manifest 경로는 repo 내부 고정 경로와 명시적 `/tmp` 보고서만 허용한다.
- 12개 전체 기준 실행은 현재 개발 머신에서 10초 이내를 목표로 한다.
- 이 항목은 UI가 없으므로 접근성 변경은 없다.

## 10. 구현 순서

1. 공통 함수 extractor를 만들고 기존 preserve-sheet 검사를 그 helper로 전환한다.
2. fixture manifest schema와 generator를 만든다.
3. 최소 지표와 안정적 hash를 구현한다.
4. 현재 기준선 결과를 생성하고 사람이 diff를 확인한다.
5. README와 대시보드에 실행 명령과 evidence를 연결한다.

## 11. 자동 테스트

- seed 동일 시 fixture hash 동일
- seed 또는 generatorVersion 변경 시 hash 변경
- 중복 ID·잘못된 치수·누락 expected field 거부
- `thin-lines`의 marker 수와 `alpha-edge` component 수가 manifest와 일치
- `animation-16` 정지 영역의 기준 temporal variance가 0
- 기준선 두 번 실행의 report 결과가 시간 필드를 제외하고 동일
- 기존 security/preserve-sheet 검사 통과

## 12. 수동 QA

생성된 각 fixture PNG를 1×와 8×에서 열어 manifest 설명과 일치하는지 확인한다. 특히 `ai-grid-wobble`, `thin-lines`, `alpha-edge`, `sprite-sheet`의 표시 marker와 프레임 경계를 확인한다.

## 13. 수용 기준

- 12개 fixture와 필수 지표가 모두 보고됨
- 동일 입력 2회 결과 hash 100% 일치
- 잘못된 manifest가 silent skip 없이 실패
- 현재 운영 코드와 기준선 PNG는 변경하지 않음
- 전체 하네스 10초 이내, fixture 저장량 5MB 이하

## 14. 완료 증거

generator/check 명령 출력, report JSON, fixture contact sheet hash, 두 번의 hash 비교는 [QLT-001 완료 증거](../../evidence/qlt-001/README.md)에 기록한다.

## 15. Luna xhigh 실행 지시문

이 항목은 Luna보다 Sol xhigh를 사용한다. 실행 프롬프트:

> QLT-001만 구현한다. 먼저 implementation-protocol.md와 visual-quality-test-plan.md를 읽고, 기존 preserve-sheet-check의 VM 함수 추출을 보존한 채 외부 의존성 없는 결정적 fixture 하네스를 만든다. 운영 UI와 처리 기본값은 수정하지 않는다. 12개 fixture, manifest 검증, 안정적 hash, 최소 지표, 두 번 실행 결정성 검사를 구현하고 모든 명시된 명령을 실행한다. 기준선 변경은 fixture별 diff를 보고 승인 근거를 남긴다.

## 16. 중단·상향 조건

- Node core만으로 결정적 PNG를 만들 수 없어 외부 패키지가 필요하면 중단하고 라이선스·크기·대안을 보고한다.
- VM 추출이 신규 함수 구조를 안전하게 다루지 못하면 운영 코드를 리팩터링하지 말고 별도 core-module 제안을 작성한다.
- 서로 다른 플랫폼에서 hash가 달라지면 QLT-001을 완료하지 않는다.
