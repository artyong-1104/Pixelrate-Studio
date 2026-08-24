# ALP-002 검증 증거 및 실행 보고서

검증 시각: 2026-08-23T04:15:48.788Z  
상태: `DONE` — 자동·브라우저·독립 Sol xhigh 게이트 전체 통과

## 자동 검증

| 게이트 | 결과 |
|---|---|
| threshold 0/9/10/127/255 | PASS — threshold10 3색, threshold128 1색 |
| coverage alpha-weighted palette | PASS — binary center 128/0/128, coverage center 10/0/245 |
| binary 호환 | PASS — root alpha matrix 생략 |
| coverage PNG/JSON 공통 alpha helper | PASS — 4×4 matrix 일치 |
| partial-alpha MAE | PASS — binary 115.00, coverage 0.00 |
| hole topology | PASS — binary/coverage component 1, hole 1 유지 |
| 운영 PNG/JSON·legacy projection | PASS — coverage matrix=PNG alpha, binary RGBA 73407d8cf02b, legacy JSON 21990b6ae732 |
| 로그 크기 gate | PASS — 4M alpha estimate 16781314B를 16MB에서 차단, 다중 결과 합계 35651615B를 32MB에서 차단 |
| JPEG 캡처 gate | PASS — 구조 검사 + 실제 이미지 디코더 + 크기 + SHA-256 |
| CSP 동기화 | sha256-qEWZzYGEhTbPInlnkyxAoCoQT8nIVgw/W4xGMU8dQ2o= |

## 완료 게이트

| 게이트 | 결과 |
|---|---|
| 브라우저 QA | PASS |
| 캡처 무결성 | PASS |
| 로그 복원 캡처 | PASS |
| 독립 Sol xhigh 검토 | PASS |

## 브라우저 증거

- [browser-coverage-threshold10.jpg](browser-coverage-threshold10.jpg) — 1272×716, SHA-256 `c629a70b9ff2abb73d8dd948ffc0addd83e09d68cf386b8f100c5a4766824dd2`
- [browser-coverage-threshold128-mobile.jpg](browser-coverage-threshold128-mobile.jpg) — 382×827, SHA-256 `4b9d9f73533a2428b8fb106cffd1a6cb2628a3e8dae5815bb0a54a69ae0a8b60`
- [browser-outline-sheet.jpg](browser-outline-sheet.jpg) — 1272×716, SHA-256 `46d627be4e37e7cdf690383f11c99ec64e0c05603a5daa09db1342c0b98d0c06`
- [browser-log-restore.jpg](browser-log-restore.jpg) — SHA-256 `430fb11e6d86d0d0d3fa9bd9c0ee505c8b475969be56fec58ae96480c0f156a8`

## 재현 명령

- `node scripts/alp002-check.mjs`
- `node scripts/alp002-ui-check.mjs`
- `node scripts/generate-alp002-evidence.mjs`
- `node scripts/security-check.mjs`
- `node scripts/visual-quality-check.mjs`

## 남은 완료 조건

- 없음
