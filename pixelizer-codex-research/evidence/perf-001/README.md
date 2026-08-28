# PERF-001 검사·브라우저 QA 보고서

상태: **PASS**

실행일은 2026-08-28(KST)이며, 애플리케이션 SHA-256 `7243386a73c9eb0718ba7dfb1a9fc0facd8370fa836a47f5991405b9f190ae95`와 Worker SHA-256 `444db75f4ebf6a57c43e1dc1805fb70459831003d34998a89b4db690994665f0`에 결합된 결과다. 입력은 QLT-001 seed `20260814`, generator v1의 `texture-checker` RGBA(`6f78d9eb…2c12c51`)를 원점부터 반복 타일링해 만든 512²·1024²·2048² fixture이며, [manifest](browser-fixtures/manifest.json)와 생성기가 이 provenance를 고정한다.

## 결론

- 1M `map` 기준선은 warm 5회 모두 100ms를 넘어 Worker 진입 gate를 충족했다.
- 모든 256K·1M·4M 벤치마크에서 main/Worker RGBA·palette·result JSON SHA-256가 일치했다.
- 4M `map` warm median은 main `1621.943ms`, Worker `529.432ms`로 `67.358%` 단축됐고, Worker 최대 chunk는 `5.703ms`였다.
- Worker 경로는 모든 크기에서 wall time이 기준선보다 20% 이상 느려지지 않았다. 실제로는 256K `-44.438%`, 1M `-60.720%`, 4M `-67.358%`였다.
- 4M click 취소는 앱 내부 계측 `12.6ms`에 terminal 상태로 전환됐고, 부분 결과는 0개였다. 즉시 재실행은 새 `processId=2`로 완료되어 stale 결과가 적용되지 않았다.
- 명세의 `cancel 영상` 증거는 4M·cleanup 20회 시나리오의 ready→map 0%→cleanup 0%→취소 전이를 5초 H.264 MP4로 고정했다. 해당 실행의 결과는 0개였다.
- Google Chrome에서 same-origin harness가 production 페이지와 QLT 4M fixture를 연결한 뒤 native 취소 버튼에 `Space`를 보냈다. 취소는 `1.8ms`, 결과 0개, run 복구·cancel disabled로 종료했다.
- 결과 탭→작업 로그 탭→결과 탭으로 바꾸는 동안 4M 변환이 유지되었고 결과 1개로 완료됐다.
- 390×844에서 1M 작업이 완료됐고, document scroll width `382px`로 가로 overflow가 없었다.
- Worker 스크립트를 의도적으로 503 응답한 경로는 `WORKER_RUNTIME_ERROR`를 노출하고 결과 0개·재실행 버튼 복구로 종료했다. main-thread로 silent fallback하지 않았다.
- 일반 경로 console error/warning은 0개였다. 실패 fixture의 console error 2개는 의도한 진단 기록이며, 사용자 UI에 stack은 노출되지 않았다.

## 기준선·Worker 비교

| Fixture | main warm median | Worker warm median | 변화 | Worker 최대 chunk | peak 추정 |
|---|---:|---:|---:|---:|---:|
| 256K | 178.938ms | 99.422ms | -44.438% | 5.059ms | 2,359,360 bytes |
| 1M | 479.929ms | 188.516ms | -60.720% | 6.240ms | 9,437,248 bytes |
| 4M | 1,621.943ms | 529.432ms | -67.358% | 5.703ms | 37,748,800 bytes |

수치는 [benchmark-report.json](benchmark-report.json)의 cold 1회·warm 5회 결과다. 해당 보고서의 대상 pure stage는 `map`이며, 브라우저의 전체 파이프라인 stage 계측은 [browser-qa.json](browser-qa.json)에 분리했다.

## 실제 브라우저 파이프라인

| Fixture | wall | map | cleanup | export | 최대 Worker chunk | 최대 input delay | long task |
|---|---:|---:|---:|---:|---:|---:|---:|
| 256K | 363.4ms | 60.8ms | 128.1ms | 63.2ms | 10.5ms | 3.3ms | 0 |
| 1M | 854.2ms | 117.0ms | 483.1ms | 140.6ms | 11.8ms | 4.2ms | 0 |
| 4M | 2,651.9ms | 319.4ms | 1,781.7ms | 396.0ms | 14.3ms | 23.9ms | 0 |

모든 항목은 `original`, 자동 16색 `kmeans-srgb`, cleanup 1회 설정으로 실행했다. 브라우저 수치는 각 시나리오 1회 계측이며 warm median은 아니다.

256K·1M·4M의 8개 stage·wall time·responsiveness 계측은 [performance-trace.json](performance-trace.json)에 Chrome Trace Event Format 34개 event로 분리했다. 이 trace는 DevTools sampling trace가 아니라 `browser-qa.json`에 기록된 실측 stage total을 Chrome trace viewer에서 검사할 수 있게 변환한 산출물이다.

## WASM 판정

WASM gate는 **미진입**이다. 대상 stage인 4M `map` Worker warm median `529.432ms`는 2초 gate 이하이고, peak 추정 `37,748,800 bytes`는 256MiB gate 이하다. production `.wasm`은 추가하지 않고 byte-identical 로컬 JS Worker를 유지한다.

## 자동 검사

다음 명령을 실행했고 모두 exit code 0을 확인했다.

```sh
node scripts/generate-perf001-evidence.mjs
node scripts/generate-perf001-browser-fixtures.mjs
node scripts/generate-perf001-performance-trace.mjs
node scripts/perf001-check.mjs
node scripts/perf001-evidence-gate-check.mjs
node scripts/security-check.mjs
node scripts/preserve-sheet-check.mjs
for check_file in scripts/*-check.mjs; do node "$check_file"; done
git diff --check
```

전체 `*-check.mjs` 회귀에서 PERF의 chunked 생산 경로를 예전 synchronous 호출 문자열로만 검사하던 ALP-002·EDGE-001·PAL-002 정적 검사 3곳을 현재 실제 호출 `buildAlphaPolicyArtifactsChunked`, `buildAutoPaletteChunked`에 맞게 갱신했다. 각 전용 정확성 검사와 전체 회귀가 모두 통과했다.

## 브라우저 증거

- [1M 완료](browser-complete-1m.jpg)
- [4M 처리→취소 5초 MP4](browser-cancel-4m.mp4)
- [취소 영상 5-frame contact sheet](browser-cancel-4m-contact-sheet.jpg)
- [Chrome Space 키 취소](browser-keyboard-cancel-chrome.jpg)
- [Worker 실패·재실행 복구](browser-worker-failure.jpg)
- [390×844 모바일](browser-mobile-390x844.jpg)
- [QLT fixture manifest](browser-fixtures/manifest.json)
- [Chrome Trace Event Format 계측 trace](performance-trace.json)
- [브라우저 QA 계측·캡처 무결성](browser-qa.json)

캡처·영상·source frame·trace·QLT 원본/파생 fixture SHA-256, 미디어 형식·크기, 앱·Worker·keyboard harness SHA-256은 `browser-qa.json`에 고정했고 `scripts/perf001-evidence-gate-check.mjs`가 현재 파일과 대조한다. Chrome 확장 자체의 message-channel error 3건은 outer harness URL에서만 발생했고 production iframe 오류는 0건이었다.
