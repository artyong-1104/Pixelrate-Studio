# 사이드바 브라우저 QA — 2026-09-06

사용자 요청에 따라 Chrome에서 `http://localhost:8000/pixelate_studio.html` 제어를 재시도했으나 `Browser is not available: chrome`으로 실패했다. 사용자가 지정한 대체 경로인 사이드바의 같은 주소에 연결해 아래 QA를 실제 수행했다. 브라우저는 Codex In-app Browser이며 Google Chrome 앱 검증으로 표기하지 않는다.

| 실행 | 결과 | 입력 지연 최대 | Worker chunk 최대 | long task | 결과 수 |
|---|---|---:|---:|---:|---:|
| [256K](completion-256K.json) | 완료 208.2ms | 6.1ms | 4.3ms | 0 | 1 |
| [1M](completion-1M.json) | 완료 422.9ms | 3.4ms | 4.1ms | 0 | 1 |
| [4M](completion-4M.json) | 완료 912.9ms | 33.5ms | 4.3ms | 0 | 1 |
| [4M click 취소](click-cancel.json) | 취소→종료 14.9ms | 9.9ms | 4.1ms | 0 | 0 |
| [즉시 재실행](immediate-rerun.json) | 완료 2690ms | 13.6ms | 13.9ms | 0 | 1 |

완료 3회는 original/auto 16색, cleanup off다. 취소 실행은 cleanup 20회 설정이며 실제 색상 매핑 단계에서 취소했다. 재실행은 cleanup 1회다. 취소 processId 4에서 재실행 processId 5로 바뀌었다. 모든 입력 지연 측정의 `inputDelayAvailable`은 true다. 이전 세션의 초기 취소 131.2ms 초과 관측은 삭제하지 않았으며, 이번 측정만으로 모든 초기 실행의 문제가 해결됐다고 단정하지 않는다.

취소의 실제 화면 다섯 장을 `cancel-frame-0.png`~`cancel-frame-4.png`로 보존했다. MP4 조립이나 DevTools sampling trace 수집은 아직 수행하지 않았다. 부분 결과 0은 DOM에서 확인했지만 취소된 로그가 영구 저장되지 않았는지 확인은 남아 있다.

처리 중 결과 탭에서 작업 로그 탭으로 이동하고 노이즈 정리 진행 상태까지 확인했다. 이후 결과 탭 복귀 및 완료 확인 요청은 자동 승인 검토에서 차단됐으므로 탭 이동 QA 전체를 PASS로 기록하지 않는다.

## 중단 사유와 재개 지점

브라우저 도구의 다음 호출이 거부됐다:

> Automatic approval review failed: Your workspace is out of credits. Ask your workspace owner to refill in order to continue.

이 차단은 사용자 권한 승인 부족이나 Chrome 연결 실패와 별개다. 우회 수단으로 브라우저 조작을 실행하지 않았다. 이미 저장된 파일의 확인·문서 갱신만 수행했다.

남은 항목은 탭 복귀 완료, Worker 중 Space 취소, 로그/ZIP 미생성 확인, 모바일, Worker 503 실패, 영상·trace 및 최종 gate 갱신이다. Worker 실패 테스트용 localhost:8001 서버는 준비돼 있다. 크레딧 충전 후 현재 사이드바 페이지에서 이어서 검증한다.

[소스 및 파일 SHA-256](manifest.json). 현재 전체 판정은 NEEDS_REVIEW를 유지한다.
