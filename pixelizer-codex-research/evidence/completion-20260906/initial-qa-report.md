# 2026-09-06 현재 소스 검증

HTML SHA-256: `a671b665aee776bbc2872ff1461750543cf8eabe90ffe599dbdaee9fb6f55080`

Worker SHA-256: `444db75f4ebf6a57c43e1dc1805fb70459831003d34998a89b4db690994665f0`

## 수정 및 기능 검증

- CFG: 프리셋 미리보기 이후 선택 변경 시 이전 확인을 무효화한다. 취소/확인/설정 import 후 포커스를 버튼으로 복원한다.
- UX: 다섯 처리 모드에서 원본 이미지 참조를 결과까지 전달한다. 새 업로드 결과의 원본/A-B가 로그 fallback으로 잘못 표시되던 오류를 수정했다. Enter/Space 열기, 모달 focus trap, Escape 후 포커스 복원을 추가했다.
- PAL: 잘못된 토큰이 포함된 파일을 유효한 일부 색만 적용하던 오류를 수정했다. 2~256색과 전체 parser 오류를 먼저 검사하고 기존 팔레트를 유지한다. 오류는 aria-live로 안내하고 decode 실패에도 object URL을 해제한다.
- OUT: 현재 작업 트리에 있던 출력 상한·키보드 보완을 유지하고 실제 생성 PNG/ZIP으로 재검증했다.
- ALP: 1/2/8배 overlay, 7개 배경 순환, custom 유효성, 입력 중 B 무시, 출력 PNG 해시 불변을 검증했다. 진단 시점은 ALP-002 17절의 최종 alpha 정책을 따른다.

[브라우저 통합 결과](integration.json)는 production HTML을 iframe으로 로드하는 [재현 harness](../../../tests/completion-browser-harness.html)가 실제 함수를 실행한 결과다. harness는 OS 다운로드 직전의 `downloadBlob` 경계에서 실제 Blob을 수집한다. PNG·ZIP 바이트 검증은 수행했지만 운영체제 파일 저장 성공을 증명하지 않는다. [CUA 조작 측정](../completion-session.json)은 실제 파일 chooser, 키보드, 모달, 모바일, pan 조작 결과다. 두 방법을 서로 대체하는 증거로 취급하지 않는다.

## 자동 검사

[전체 검사 목록 및 종료 코드](automated-checks.json): **36/37 PASS**. 각 검사 로그를 같은 폴더에 보관했다. security, preserve-sheet, GEO 및 OUT 증거 게이트를 포함한다. 새 completion 검사는 현재 소스/브라우저 산출물 해시와 누락·변조·stale·FAIL 음성 테스트를 확인한다.

`node scripts/perf001-evidence-gate-check.mjs`만 [FAIL](perf001-evidence-gate-check.log): 과거 browser-qa.json의 HTML 해시가 현재 소스와 다르다. 기존 PERF 기준을 완화하거나 과거 측정값에 현재 해시를 덮어쓰지 않았다.

## PERF 추가 측정과 미완료 범위

[512/1024/2048 통합 측정](performance.json)은 Worker 사용과 chunk/long task를 측정했다. 이 세 실행에서는 입력 지연 측정이 unavailable이므로 반응성 통과로 해석하지 않는다.

[Worker click 취소](worker-cancel-iab.json): 4,194,304 pixels, Worker 사용, 취소부터 terminal 13.9ms, Worker cancel 0.1ms, 부분 결과 0. [취소 후 재실행](rerun-iab.json): processId 5→6, 결과 1개, 완료 2727ms, 최대 Worker chunk 14.2ms, 입력 지연 69.3ms, long task 0.

[초기 Space 취소](keyboard-cancel-iab.json): terminal 2.9ms, 부분 결과 0이지만 Worker 시작 전 취소이며 입력 지연 131.2ms로 100ms 목표를 초과했다. Chrome Worker 중 Space 취소의 대체 증거가 아니다.

사용자가 Chrome 제어를 명시적으로 승인한 뒤 재요청했으나 native 도구는 `Computer Use was not approved to use Google Chrome`을 반환했다. 연결된 브라우저는 Codex 내장 브라우저 한 개였으며 Chrome 탭 생성은 `Browser is not available: chrome`으로 실패했다. 이 도구에서 영구 허용 설정을 변경하지 못했다.

남은 완료 조건:

1. 연결된 Chrome에서 명세의 Worker 실행 중 Space 취소를 실제 수행하고 새 소스의 증거로 기록한다.
2. 초기 입력 지연 131.2ms를 가시 상태에서 재현·분석하고 100ms 기준을 충족하는지 확인한다.
3. PERF의 탭 전환, Worker 실패, 최신 trace/취소 영상 등 기존 gate 필수 증거를 같은 소스에서 갱신한다.
4. PERF gate를 포함한 전체 검사를 모두 통과한 뒤 최종 DONE으로 올린다.

## 무결성과 변경 이력

[manifest](manifest.json)는 HTML/Worker와 통합 보고서, CUA 측정, 캡처, harness SHA-256을 기록한다. [현재 작업 트리 diff](working-tree.patch)는 기존 미커밋 수정도 포함하므로 이번 세션 단독 diff를 뜻하지 않는다. 커밋·push·배포는 수행하지 않았다.
