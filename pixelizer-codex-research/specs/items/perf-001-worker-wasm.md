# PERF-001 — 성능 계측, Web Worker 이전, 조건부 WASM 평가

## 1. 메타데이터

| 항목 | 값 |
|---|---|
| 명세 상태 | 완료 |
| 구현 상태 | DONE |
| QA 상태 | 완료 — 기준선·Worker 수용·취소·실패·모바일·전체 회귀 통과 |
| 우선순위 | P3 |
| 근거 분류 | ENGINEERING-INFERENCE |
| 구현 모델 | Sol xhigh |
| 선행 항목 | QLT-001 및 실제 병목 대상 항목 |

## 2. 목표와 사용자 완료 상태

먼저 현재·신규 알고리즘의 main-thread 시간과 메모리를 측정한다. 명시된 gate를 넘는 순수 계산만 Web Worker로 옮기고, Worker 뒤에도 충분히 느린 경우에만 WASM을 평가한다. 결과는 byte-identical이어야 하며 사용자는 진행률·취소를 얻는다.

## 3. 현재 문제와 근거

현재 processAll과 모든 계산은 main thread에서 실행된다. Source 05는 Rust/WASM, Source 06은 CPU 도구 사례를 보여 주지만 우리 입력 제한에서 필요성을 입증하지 않는다. 기술 선택은 측정 뒤에 한다.

## 4. 포함·비포함 범위

포함: benchmark instrumentation, long-task/heap report, Worker gate, message schema, progress/cancel, transferable buffers, 조건부 WASM 결정 기록.

비포함: GPU/WebGPU, 무조건 Rust 재작성, 다중 Worker pool, UI 외 전체 앱 모듈화, 성능을 위한 품질·결정성 완화.

## 5. 계측 명세

QLT fixture에서 256K, 1M, 4M RGBA 입력을 cold 1회, warm 5회 실행한다. 각 stage `decode/downscale/grid/palette/map/cleanup/outline/export`에 `performance.now()` marker를 둔다.

기록:

- wall time median/p95
- 50ms 이상 long task 수·최대 길이
- 가능하면 `performance.memory.usedJSHeapSize`, 아니면 typed-array/canvas 예상 byte
- input/output dimensions, palette size, algorithm IDs
- UI cancel latency

시간값은 결정성 hash에서 제외한다.

## 6. Worker 진입 gate

다음 중 하나가 같은 1M fixture warm 5회 중 3회 이상 발생하면 해당 pure stage를 Worker 후보로 한다.

- 단일 synchronous stage >100ms
- PerformanceObserver long task >50ms가 처리당 2개 이상
- 처리 중 버튼·modal 입력 응답이 >100ms 지연

Worker 후 수용:

- main-thread long task 최대 <50ms
- cancel 요청 후 100ms 이내 작업 중단 또는 다음 chunk에서 중단
- 결과 RGBA/palette/JSON hash 동일
- 전체 wall time이 20% 이상 악화되지 않음

## 7. Worker 설정·인터페이스

로컬 `pixelate-worker.js` 한 개를 사용하고 CSP에 `worker-src 'self'`를 추가한다.

사용자 변환 설정에는 Worker on/off를 추가하지 않는다. 이 항목의 설정은 내부 job message와 성능 gate뿐이며, 동일 알고리즘은 실행 위치와 무관하게 같은 결과를 내야 한다.

Request:

```json
{
  "type": "process-stage",
  "jobId": "session-counter",
  "stage": "grid-detect",
  "payload": {},
  "settings": {}
}
```

Response types: `progress`, `result`, `error`, `cancelled`. 모든 message는 jobId를 가진다. input/output ArrayBuffer는 가능한 경우 transfer하고 전송 후 main thread가 detached buffer를 다시 읽지 않는다. 새 실행은 이전 job을 cancel하고 result jobId가 현재와 다르면 폐기한다.

## 8. WASM 진입 gate

Worker 버전이 정확성·취소를 통과한 뒤 4M warm median이 대상 stage 2초를 넘거나 예상 peak memory 256MB를 넘을 때만 WASM proof-of-concept를 허용한다.

WASM PoC는 동일 QLT API와 byte-identical output, local pinned binary, source·license, build 재현 명령을 갖춰야 한다. 기준을 못 넘으면 JS Worker를 유지한다. WASM 자체가 목표가 아니다.

## 9. UI 명세

- 처리 중 stage 이름과 0~100% progress를 status에 표시한다.
- `취소` 버튼을 제공하고 완료·오류·취소 뒤 disabled 상태와 focus를 복구한다.
- 취소된 작업은 partial result, 로그, ZIP을 남기지 않는다.
- Worker 불가 또는 시작 실패 시 silent main-thread fallback하지 않고 오류와 재시도 안내를 표시한다. 기존 안전한 main-thread 알고리즘을 사용하려면 사용자가 다시 실행한다.

## 10. 호환·경계조건

- Worker를 쓰지 않는 stage와 기존 mode hash 불변.
- CSP hash와 worker-src를 HTML/SECURITY/vercel 모두 갱신.
- jobId는 세션 내부 증가 정수 문자열이며 시간·random을 결과에 넣지 않는다.
- 페이지 close, 새 upload, reset, 재실행에서 Worker job 종료.
- Worker error stack을 사용자에게 노출하지 않고 console과 짧은 오류 code로 분리.

## 11. 보안·접근성

- Worker는 local file만 로드하고 importScripts remote 금지.
- WASM memory maximum을 명시하고 grow 실패를 처리한다.
- progress는 `aria-live`를 과도하게 갱신하지 않고 10% 단위 또는 stage 변경 시 알린다.
- 취소 button은 키보드와 screen reader label을 제공한다.

## 12. 예상 변경과 순서

- 계측 단계: `pixelate_studio.html`, QLT benchmark report만 변경
- gate 통과 시: `pixelate-worker.js`, main-thread coordinator, CSP 문서/테스트
- WASM gate 통과 시 별도 구현 항목으로 분리하고 이 명세에서 바로 production WASM을 합치지 않음

순서: baseline report → gate 판정 → pure stage API → Worker/cancel → hash/perf 비교 → UI → CSP → WASM 결정 기록.

## 13. 자동 테스트

- stage timing report schema와 stable non-time fields
- request/response validation, stale job result 폐기
- transfer buffer lifecycle
- cancel before/start/mid/after completion
- Worker error/terminate/retry
- progress monotonic 0~100
- Worker/main hash equality
- CSP worker-src와 remote import 금지

## 14. 브라우저 수동 QA

256K/1M/4M 입력에서 UI 응답, progress, cancel, 즉시 재실행, tab 이동, mobile, Worker failure를 확인한다. DevTools에서 long task·heap·worker 종료를 기록한다.

## 15. 수용 기준

- baseline 측정 없이 Worker/WASM 도입 0건
- Worker gate와 수용 기준 충족
- 결과 hash 100% 동일
- cancel 100ms 이내, partial 저장 0
- main-thread long task <50ms
- WASM은 별도 gate·명세 없이는 production에 없음

## 16. 완료 증거

- baseline/Worker 비교: [benchmark-report.json](../../evidence/perf-001/benchmark-report.json)
- QLT fixture provenance·파생 PNG hash: [browser fixture manifest](../../evidence/perf-001/browser-fixtures/manifest.json)
- performance trace: [Chrome Trace Event Format 34-event trace](../../evidence/perf-001/performance-trace.json)
- main/Worker·앱·fixture·캡처 SHA-256와 브라우저 계측: [browser-qa.json](../../evidence/perf-001/browser-qa.json)
- cancel 영상: [4M ready→map→cleanup→cancel 5초 MP4](../../evidence/perf-001/browser-cancel-4m.mp4), [5-frame contact sheet](../../evidence/perf-001/browser-cancel-4m-contact-sheet.jpg)
- CSP·Worker 보안 검사와 WASM 미진입 판정: [검사·브라우저 QA 보고서](../../evidence/perf-001/README.md)

## 17. Luna/상위 모델 실행 지시문

이 항목은 Sol xhigh를 사용한다.

> PERF-001만 수행한다. 먼저 QLT에서 stage별 cold/warm 시간, long task, memory를 측정하고 명세 gate를 넘는 stage만 Worker 후보로 선택한다. Worker는 local file, validated message, monotonic progress, jobId stale-result 폐기, 100ms 취소, transferable buffer를 구현한다. main-thread와 byte-identical hash가 아니면 완료하지 않는다. Worker 뒤 4M stage가 2초 또는 256MB gate를 넘을 때만 WASM을 별도 명세로 제안하고 이번 항목에서 production WASM을 합치지 않는다.

## 18. 중단·상향 조건

- Worker 결과가 브라우저별로 byte-identical하지 않으면 최적화를 중단한다.
- CSP·로컬 파일 배포에서 Worker를 안정적으로 로드할 수 없으면 inline Blob 우회를 만들지 않고 보안 검토를 요청한다.
- WASM이 필요해지면 Sol max 검토와 별도 license/build 명세 없이는 진행하지 않는다.

## 19. 완료 기록

- 완료일: 2026-08-28 (KST)
- 기준선: QLT-001 seed `20260814`, generator v1 `texture-checker`를 원점 반복 타일링한 256K·1M·4M RGBA 입력으로 `map` stage를 cold 1회·warm 5회 계측했다. 원본·파생 RGBA·PNG hash를 manifest와 gate가 재생성 대조하며, 1M main warm 5/5가 100ms를 넘어 Worker gate를 통과했다.
- Worker 수용: 모든 fixture의 RGBA·palette·result JSON hash가 main-thread와 일치했다. 4M warm median은 `1621.943ms`→`529.432ms`, 최대 Worker chunk는 `5.703ms`였다.
- 취소·상태: 4M click 취소는 앱 내부 계측 `12.6ms`, 부분 결과 0개였다. 취소 직후 새 `processId=2`로 재실행해 stale 결과가 적용되지 않음을 확인했다. Google Chrome에서는 production iframe의 native 취소 버튼을 `Space`로 활성화해 `1.8ms`, 결과 0, 버튼 상태 복구를 확인했다.
- 영상·trace: 4M·cleanup 20회의 ready→map 0%→cleanup 0%→취소 전이를 5초 H.264 MP4로 기록했다. 256K·1M·4M 브라우저 stage 계측은 QLT provenance를 포함한 Chrome Trace Event Format 34개 event로 연결했다.
- 브라우저: 256K·1M·4M 완료, 결과↔작업 로그 탭 이동 중 4M 지속, 390×844 모바일, Worker 503 실패 경로를 실제 localhost에서 검증했다. 일반 경로 console error/warning은 0개였다.
- WASM: 대상 `map` 4M Worker warm median `529.432ms`, peak 추정 `37,748,800 bytes`로 2초·256MiB 진입 gate 모두 미달이다. production WASM은 추가하지 않았다.
- 전체 회귀: 모든 `scripts/*-check.mjs`, `security-check.mjs`, `preserve-sheet-check.mjs`, `git diff --check`가 통과했다. PERF의 chunked 경로를 예전 synchronous 호출 문자열로만 검사하던 ALP-002·EDGE-001·PAL-002 정적 검사는 현재 실제 호출 경로를 검사하도록 갱신했다.
- 증거: [검사·브라우저 QA 보고서](../../evidence/perf-001/README.md), [기준선·Worker 비교](../../evidence/perf-001/benchmark-report.json), [performance trace](../../evidence/perf-001/performance-trace.json), [cancel MP4](../../evidence/perf-001/browser-cancel-4m.mp4), [브라우저 QA·무결성](../../evidence/perf-001/browser-qa.json)
