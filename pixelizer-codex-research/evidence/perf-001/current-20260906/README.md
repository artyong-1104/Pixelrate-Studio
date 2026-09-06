# 사이드바 QA 최종 결과 — 2026-09-06

브라우저 제어 재요청 후 실제 탭 클릭이 성공해 중단됐던 QA를 재개했다. 이전 크레딧 오류의 원인이나 계정 연결 관계는 확인하지 않았다. 사용자가 명시한 대체 경로에 따라 Codex In-app Browser를 사용했으며, Google Chrome 앱에서 검증했다고 주장하지 않는다.

## 현재 소스 측정

| 실행 | 결과 | 입력 지연 최대 | Worker chunk 최대 | long task | 결과 수 |
|---|---|---:|---:|---:|---:|
| [256K](completion-256K.json) | 완료 208.2ms | 6.1ms | 4.3ms | 0 | 1 |
| [1M](completion-1M.json) | 완료 422.9ms | 3.4ms | 4.1ms | 0 | 1 |
| [4M](completion-4M.json) | 완료 912.9ms | 33.5ms | 4.3ms | 0 | 1 |
| [4M click 취소](click-cancel.json) | 취소→종료 14.9ms | 9.9ms | 4.1ms | 0 | 0 |
| [즉시 재실행](immediate-rerun.json) | 완료 2690ms | 13.6ms | 13.9ms | 0 | 1 |
| [직접 Space 취소](keyboard-cancel.json) | 취소→종료 6.3ms | 7.8ms | 4.2ms | 0 | 0 |
| [기존 하네스 Space 취소](harness-keyboard.json) | 취소→종료 17.1ms | 26.8ms | 5.0ms | 0 | 0 |
| [390px 모바일 1M](mobile.json) | 완료 830.5ms | 10.2ms | 10.8ms | 0 | 1 |

입력 지연은 모두 `inputDelayAvailable=true`인 실제 브라우저 계측이다. 완료 3회는 original/auto 16색/cleanup off, 취소는 cleanup 20회 설정, 재실행·모바일은 cleanup 1회다. 클릭 취소 processId 4에서 재실행 processId 5로 바뀌었다. 직접 Space 취소 후 저장 로그 텍스트는 동일했다.

[탭 전환](tab-switch.json): 처리 중 결과→작업 로그 이동, 결과 탭 복귀, 완료 결과 1개 확인. [Worker 실패](worker-failure.json): 로컬 503 주입 시 WORKER_RUNTIME_ERROR와 재시도 안내를 표시하고 결과 0개, 실행 버튼 복구, silent fallback 없음. 사용자 상태 문구에는 stack이 없다. 정상 페이지 [console](console.json)은 비어 있다. 실패 하네스에서는 의도된 오류 2개 외에 출처 URL 없는 MutationObserver 오류 1개가 관측돼 별도 기록했다.

## 검증 방법과 한계

[현재 browser-qa](../browser-qa.json), [소스 및 파일 SHA-256](manifest.json), [전체 자동 검사](../../completion-20260906/automated-checks.json).

[취소 MP4](cancel-4m.mp4)는 실제 CUA 캡처 5장을 1fps, 5초 H.264로 인코딩했다. 실시간 녹화가 아니며 재생 시간으로 취소 지연을 추론하지 않는다. 지연은 앱의 실제 계측 JSON으로 판정했다. [trace](../performance-trace.json)는 실제 stage별 측정 합계를 Chrome Trace Event Format으로 표현한 것으로 원시 DevTools sampling trace가 아니다.

이전 세션의 초기 취소 입력 지연 131.2ms 초과 기록은 [원본 보고서](../../completion-20260906/keyboard-cancel-iab.json)에 남겼다. 새 가시 상태 실행과 기존 하네스에서는 재현되지 않았고 이번 수용 실행은 100ms 미만이다. 원인 수정이나 모든 환경에서의 상한 보장을 주장하지 않는다.

사용자의 사이드바 대체 검증 지시에 맞춰 evidence gate의 브라우저 식별 조건을 변경했다. 100ms 취소/입력, 50ms chunk, 결과/무결성/모바일/Worker failure 조건은 유지했다. 입력 지연이 null인 결과가 통과하지 않도록 가용성·유한값 검사를 강화했다.

[이전 중단 기록](interrupted-session.md)은 이력으로 보존하며 현재 blocker가 아니다. 코드 변경은 기존 기능 수정 상태를 유지했고 이번 재개에서는 QA·증거·문서만 갱신했다. 커밋·push·배포는 하지 않았다.
