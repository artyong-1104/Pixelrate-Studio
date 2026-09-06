# 현재 소스 해시 브라우저 재검증 — 2026-09-06

## 판정

`PASS` — 기존 대시보드에서 현재 소스 해시 결속이 없던 8개 항목을 운영 HTML iframe에서 다시 실행했다. 브라우저 8/8 시나리오와 관련 자동 검사 13/13이 통과했으며, 이 실행으로 기능별 브라우저 증거는 15/15가 됐다.

- 운영 HTML SHA-256: `a671b665aee776bbc2872ff1461750543cf8eabe90ffe599dbdaee9fb6f55080`
- Worker SHA-256: `444db75f4ebf6a57c43e1dc1805fb70459831003d34998a89b4db690994665f0`
- 브라우저: Chrome 152 계열 Codex in-app browser
- 실행 URL: `http://localhost:8000/tests/current-hash-revalidation-harness.html`
- 완료 시각: `2026-09-06T01:34:52.876Z`

## 기능별 결과

| ID | 대표 브라우저 경로 | 결과 |
|---|---|---:|
| QLT-001 | 8px checker를 square 16px로 처리하고 RGBA 해시 기록 | PASS |
| ANI-001 | 2프레임 결과 열기, 1→2 이동, 8×, 닫기 | PASS |
| GRID-001 | 8×8 자동 감지, offset 0/0, 신뢰도 99%, 적용·변환 | PASS |
| ALP-002 | coverage 부분 알파 128px와 binary 출력 해시 분리 | PASS |
| CELL-001 | center 대표색 후보와 실험 경고·메타데이터 | PASS |
| PAL-002 | `kmeans-oklab` + `image-balanced`, OKLab 오차 메타데이터 | PASS |
| DIT-001 | Bayer 4×4 75%, off/on 출력 해시 변화 | PASS |
| EDGE-001 | line-aware 후보 120px·적용 셀 32개, selout 활성 메타데이터 | PASS |

정확한 측정값은 [브라우저 실행 JSON](browser-run.json)에 있다. [최종 화면 캡처](browser-final.jpg)는 PASS 상태, JSON 결과, 마지막 EDGE-001 결과 화면을 함께 보존한다.

## 자동 교차 검증

`node scripts/current-hash-revalidation-check.mjs`를 실행해 현재 파일 해시, 브라우저 결과 스키마, 8개 항목별 핵심 측정값, JPEG 무결성, 관련 자동 검사 13개를 검사했다. 결과는 [자동 검사 기록](automated-checks.json), 파일별 SHA-256은 [아티팩트 manifest](artifact-manifest.json)에 기록했다.

실행한 검사는 QLT 시각 품질, ANI 구현/UI, GRID 감지/UI, ALP-002 알고리즘/UI, CELL-001 알고리즘/UI, PAL-002 UI, DIT-001 알고리즘/UI, EDGE-001 알고리즘 검사다.

## 브라우저 로그 범위

브라우저 컨트롤러는 source URL이 없는 `MutationObserver.observe` 오류 1건을 보고했다. 운영 HTML에는 `MutationObserver` 참조가 없으며 8개 시나리오 결과에는 영향을 주지 않았다. 검증 스크립트는 이 정확한 메시지만 호스트/iframe 잡음으로 허용하고, 다른 warning/error가 추가되면 실패한다.

이번 실행은 8개 항목의 대표 기능 경로를 현재 해시에 결속한 재검증이다. 각 항목의 전체 캡처 매트릭스와 독립 검토 범위는 기존 항목별 증거 보고서가 계속 담당한다.
