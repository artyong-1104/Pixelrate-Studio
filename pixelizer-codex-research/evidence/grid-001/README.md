# GRID-001 자동 검증 증거

검증 시각: 2026-08-23T04:36:49.263Z  
상태: `DONE` — 자동·브라우저·독립 Sol xhigh 게이트 전체 통과

## 결과

| 게이트 | 결과 |
|---|---|
| clean 3/4/8px | PASS — period/phase 오차 0, confidence 0.75 이상 |
| QLT clean-pixel-art | PASS — 4/4px, phase 0/0, confidence 0.6038 |
| ai-grid-wobble | PASS — 8/8px, 축별 period 오차 0 |
| photo-like | PASS — confidence 0.2253, 0.5 미만 |
| sequence lock | PASS — 4프레임 단일 4px grid, variance 0 |
| 결정성 | PASS — SHA-256 `7d972e1967c885640cf996243e514567e601c0add626cf37e1e83c9869b16396` |
| 4M Node 알고리즘 성능 | PASS — alpha scan+Sobel 총 977.7ms, 최대 chunk 15.2ms; canvas read·sheet slicing은 브라우저 QA에서 별도 게이트 |
| 브라우저 QA | PASS — confidence 3구간·수동 복구·취소·4M 상한·시퀀스·모바일 |
| 독립 Sol xhigh 검토 | PASS — [보고서](sol-xhigh-final-review-2026-08-23.md) |
| 증거 무결성 | 캡처 PASS · 검토 보고서 확인 · SHA-256 `dd0c23fa8cddd9104bf80a2c087dce09b9429f42124a07f9f56502c52fbd067e` |

기계 판독 수치는 [report.json](report.json)에 기록했다.

## 재현 명령

- `node scripts/grid-detection-check.mjs`
- `node scripts/grid001-ui-check.mjs`
- `node scripts/generate-grid001-evidence.mjs`
- `node scripts/security-check.mjs`
- `node scripts/visual-quality-check.mjs`

## 브라우저 QA 증거

- [browser-clean-8px-overlay.jpg](browser-clean-8px-overlay.jpg)
- [browser-clean-pixel-art-auto.jpg](browser-clean-pixel-art-auto.jpg)
- [browser-photo-safe-reject.jpg](browser-photo-safe-reject.jpg)
- [browser-sequence-lock.jpg](browser-sequence-lock.jpg)
- [browser-mobile-manual.jpg](browser-mobile-manual.jpg)

## 남은 완료 조건

- 없음
