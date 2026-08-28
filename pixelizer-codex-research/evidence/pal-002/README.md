# PAL-002 검증 증거 및 A/B 보고서

검증 시각: 2026-08-25T15:02:30.055Z
상태: `DONE`

## 완료 게이트

| 게이트 | 결과 |
|---|---|
| 8/16/32/64색 × 4 fixture × 3 algorithm | PASS |
| 결정성·50,000 sample 상한 | PASS |
| sampling+palette generation 전체 runtime 계측 | PASS |
| 실제 대형 배경·소형 캐릭터 sampling 분기 | PASS |
| localhost desktop/mobile·reference 오류·settings | PASS |
| 실제 JPEG parser·decoder·SHA-256 캡처 무결성 | PASS |
| 라벨 제거·순서 무작위 blind 기록 | PASS |
| 5 fixture군 × 8/16/32/64 actual-size 수동 matrix | PASS |
| 기본 hash·기본값 유지 및 opt-in preset 승격 범위 제한 | PASS |
| 독립 Sol xhigh 검토 | PASS |

## 알고리즘 요약

| 후보 | 평균 OKLab error 변화 | runtime 배율 | feature 변화 | temporal 변화 | 자동 지표상 승격 검토 가능 |
|---|---:|---:|---:|---:|---|
| kmeans-oklab | 23.866133% | 1.114227× | 0% | -16.42652% | 예 |
| median-cut | 56.257887% | 3.681759× | ∞ (기준선 0) | 6.052009% | 아니오 |

## 조합별 채택 판정

| 후보 | 색상 수 | 평균 OKLab error 개선 | runtime 배율 | feature 변화 | temporal 변화 | 채택 적격 |
|---|---:|---:|---:|---:|---:|---|
| kmeans-oklab/pixel | 8 | 34.662263% | 1.384662× | 0% | 9.230719% | 예 |
| kmeans-oklab/pixel | 16 | 39.498235% | 1.356869× | 0% | 9.230719% | 예 |
| kmeans-oklab/pixel | 32 | -10.980303% | 1.034451× | 0% | -30.841061% | 아니오 |
| kmeans-oklab/pixel | 64 | 1.301521% | 0.92097× | 0% | -32.727277% | 아니오 |
| median-cut/pixel | 8 | 48.807621% | 1.684343× | ∞ (기준선 0) | 18.461803% | 아니오 |
| median-cut/pixel | 16 | 66.011622% | 2.877688× | ∞ (기준선 0) | 46.153959% | 아니오 |
| median-cut/pixel | 32 | 49.631069% | 3.8443× | ∞ (기준선 0) | -8.411057% | 아니오 |
| median-cut/pixel | 64 | 59.587437% | 4.917045× | ∞ (기준선 0) | -10.90902% | 아니오 |

## 샘플링 요약

| 후보 | 평균 OKLab error 개선 | runtime 배율 | 작은 character feature 변화 | animation temporal 변화 | 자동 지표상 승격 검토 가능 |
|---|---:|---:|---:|---:|---|
| image-balanced | 2.191635% | 0.561135× | -79.634376% | 0% | 아니오 |
| reference (character.png) | -558.719282% | 0.065873× | -100% | 4.615542% | 아니오 |

정량 지표를 통과한 후보만 승인된 별도 opt-in preset으로 승격하며 기본값과 다른 일반 preset은 유지한다.

## 브라우저 증거

- [browser-algorithm-ab.jpg](browser-algorithm-ab.jpg) — 1272×738, sips, SHA-256 `2fdfdaa3e918da37612c9cffe9021367a20f142eaf2e7205172241e2921b624e`
- [browser-reference-error.jpg](browser-reference-error.jpg) — 1272×738, sips, SHA-256 `f3266da6cde9638318e22924ff4ec8ebf4178662a6c87434a1f395974a3ecb5e`
- [browser-mobile.jpg](browser-mobile.jpg) — 382×3215, sips, SHA-256 `586deccaa539ea14bf840b44c762e2435570b6af295f99a775ed74ca1e728b65`
- [browser-oklab-stable-product.jpg](browser-oklab-stable-product.jpg) — 764×3579, sips, SHA-256 `fe9fdf629474ac6c3c743e969b3eb9bf1d66feaa85633e578d121717cfeaa3a9`
- [browser-oklab-stable-mobile.jpg](browser-oklab-stable-mobile.jpg) — 382×9110, sips, SHA-256 `c6dc72b1f09cbc616bd651b763d8fd4937777bc5d819507670797d643cee3f46`
- [browser-blind-a.jpg](browser-blind-a.jpg) — 160×160, sips, SHA-256 `ee10121a34f436e56a897a723397250d1e899a8a35a2f7c3bc8913bbb225e19c`
- [browser-blind-b.jpg](browser-blind-b.jpg) — 160×160, sips, SHA-256 `b0be03168e82c962553939bb5b310a0e5ba0dcfeb23f8317a961e80c16c44121`

## Actual-size 수동 matrix

- [브라우저 1× A/B 페이지](browser-manual-matrix.html)
- [20-cell·240-asset manifest](browser-manual-matrix.json) — SHA-256 `f7d677c1c45941f1d237d345a9c40a6321e1fa0aa341d22439641c16f15891be`
- [browser-manual-gradient.jpg](browser-manual-gradient.jpg) — SHA-256 `ae1f095186b491caaf530ee2292a81df2359dd089706ddc2bf3b87ce289f00ea`
- [browser-manual-gradient-median.jpg](browser-manual-gradient-median.jpg) — SHA-256 `e09a80a18c2bc1697f905b5ebb6aebb5bfff491a0010c41807700366388af8e0`
- [browser-manual-photo.jpg](browser-manual-photo.jpg) — SHA-256 `a0c8d69f34322991c220d9d3932057aaa484815e93cc43266193dab22ba49e31`
- [browser-manual-large-small.jpg](browser-manual-large-small.jpg) — SHA-256 `4e13587432f18ee9784495c81a66f6c2967f16928522bfec6436e12d12b4be0e`
- [browser-manual-animation-stable.jpg](browser-manual-animation-stable.jpg) — SHA-256 `699b42f0c085a85bf6fc5e609c9a48c096ba32867c2f39e6ecdaa7b2a8d45803`
- [browser-manual-animation-stable-next.jpg](browser-manual-animation-stable-next.jpg) — SHA-256 `077f7cadc3efd65174f815e4bcae461d92eaa31de1297faf02691c852f7c79b1`

## 독립 검토

- [Sol xhigh 독립 검토](sol-xhigh-final-rereview-2026-08-26.md) — PASS, SHA-256 `65c849ffc00d546d277f3e39c893cc3b720125b1e3d68ba53823a79c650c17be`

## 재현 명령

- `node scripts/palette-algorithm-check.mjs`
- `node scripts/pal002-ui-check.mjs`
- `node scripts/pal002-evidence-gate-check.mjs`
- `node scripts/generate-pal002-browser-matrix.mjs`
- `node scripts/generate-pal002-evidence.mjs`
- `node scripts/visual-quality-check.mjs`
- `node scripts/security-check.mjs`

## 남은 완료 조건

- 없음
