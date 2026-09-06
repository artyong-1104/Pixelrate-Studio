# 2026-09-06 최종 검증 결과

**현재 소스 기준 자동 검사 37/37 PASS.** 남아 있던 OUT·CFG·UX·PAL·ALP와 PERF 재검증을 완료했다. 사용자가 지정한 사이드바 대체 경로에서 브라우저 QA를 수행했다.

HTML SHA-256: `a671b665aee776bbc2872ff1461750543cf8eabe90ffe599dbdaee9fb6f55080`

Worker SHA-256: `444db75f4ebf6a57c43e1dc1805fb70459831003d34998a89b4db690994665f0`

## 변경 및 검증

- CFG: 프리셋 변경 후 이전 미리보기 확인을 무효화하고 적용/취소/import 후 포커스를 복원했다. round trip, invalid 원자성, legacy 로그, 모바일·키보드 검증을 기록했다.
- UX: 다섯 크기 처리 모드의 원본 참조 누락을 수정해 새 결과의 A/B 비교를 복구했다. Enter/Space 열기, 모달 focus trap, Escape 포커스 복원, 1/2/8배, 모바일, pan, 로그 fallback, cleanup을 검증했다.
- PAL: 잘못된 팔레트 파일의 일부 색만 적용하던 오류를 수정했다. 전체 parser 오류와 2~256색을 먼저 검증하고 이전 팔레트를 유지한다. aria-live 오류, 파일 처리 후 포커스와 object URL 해제를 보완했다.
- OUT: 현재 작업 트리의 상한·Space 보완을 유지하고 PNG/ZIP 실제 바이트, native/2×/8×, 결정성, 재업로드, 제한·모바일·키보드 증거를 갱신했다.
- ALP: 7개 배경과 custom, 입력 중 B 무시, 1/2/8배 overlay, PNG 불변을 검증했다. 진단 시점은 후속 ALP-002 최종 alpha 정책을 따른다.
- PERF: 256K/1M/4M, Worker click/Space 취소, 즉시 재실행, 탭 복귀, 390px 모바일, Worker 503 실패를 현재 소스에서 확인했다. 상세 수치와 한계는 [최신 PERF 보고서](../perf-001/current-20260906/README.md)에 있다.

## 증거

- [37개 검사 종료 코드](automated-checks.json): security·preserve-sheet·GEO·OUT·PERF 및 전체 회귀 PASS. 로그는 같은 폴더에 보관했다.
- [실제 브라우저 통합 5개 시나리오](integration.json), [CUA 직접 조작 측정](../completion-session.json), [파일 무결성 manifest](manifest.json).
- [현재 GEO 증거](../geo-001/browser-qa.json), [현재 OUT 증거](../out-001/browser-qa.json), [현재 PERF 증거](../perf-001/browser-qa.json).
- [기존 작업 트리를 포함한 production diff](working-tree.patch), [이전 미완료 단계의 기록](initial-qa-report.md).

## 검증 해석

통합 harness는 실제 production iframe 함수를 실행하고 다운로드 직전 Blob을 수집했다. PNG·ZIP 파일 바이트를 검증했지만 OS 파일 저장을 직접 증명하지 않는다. CUA 직접 조작은 별도 기록했다.

Chrome 앱 연결은 사용할 수 없어 사용자 지시에 따라 Codex In-app Browser로 대체했다. 브라우저 식별 조건만 반영했고 100ms 취소/입력, 50ms chunk 등 수치 기준은 유지했다. 입력 지연 unavailable/null이 통과하지 않도록 검사도 강화했다.

취소 MP4는 실제 캡처 5장을 조립한 5초 영상이며 실시간 녹화가 아니다. trace는 실제 stage 합계를 Chrome Trace Event Format으로 표현했으며 원시 DevTools sampling trace가 아니다. 과거 초기 취소 입력 지연 131.2ms 초과 기록은 보존했고 새 가시 상태 실행에서는 재현되지 않았다. 원인 수정이나 모든 환경의 상한 보장을 주장하지 않는다.

마지막 `git diff --check` PASS. 커밋·push·배포는 수행하지 않았다.
