# PAL-002 검증 증거 및 A/B 보고서

검증 시각: 2026-08-25T04:54:08.760Z  
상태: `IN_PROGRESS`

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
| 독립 Sol xhigh 검토 | FAIL |

## 알고리즘 요약

| 후보 | 평균 OKLab error 변화 | runtime 배율 | feature 변화 | temporal 변화 | 자동 지표상 승격 검토 가능 |
|---|---:|---:|---:|---:|---|
| kmeans-oklab | 27.691988% | 1.138713× | 0% | 2.593748% | 예 |
| median-cut | 56.257887% | 3.683156× | ∞ (기준선 0) | 6.052009% | 아니오 |

## 샘플링 요약

| 후보 | 평균 OKLab error 개선 | runtime 배율 | 작은 character feature 변화 | animation temporal 변화 | 자동 지표상 승격 검토 가능 |
|---|---:|---:|---:|---:|---|
| image-balanced | 2.191635% | 0.570948× | -79.634376% | 0% | 아니오 |
| reference (character.png) | -558.719282% | 0.067727× | -100% | 4.615542% | 아니오 |

정량 지표를 통과한 후보만 승인된 별도 opt-in preset으로 승격하며 기본값과 다른 일반 preset은 유지한다.

## 브라우저 증거

- [browser-algorithm-ab.jpg](browser-algorithm-ab.jpg) — 1272×738, sips, SHA-256 `2fdfdaa3e918da37612c9cffe9021367a20f142eaf2e7205172241e2921b624e`
- [browser-reference-error.jpg](browser-reference-error.jpg) — 1272×738, sips, SHA-256 `f3266da6cde9638318e22924ff4ec8ebf4178662a6c87434a1f395974a3ecb5e`
- [browser-mobile.jpg](browser-mobile.jpg) — 382×3215, sips, SHA-256 `586deccaa539ea14bf840b44c762e2435570b6af295f99a775ed74ca1e728b65`
- [browser-oklab-stable-product.jpg](browser-oklab-stable-product.jpg) — 1272×2050, sips, SHA-256 `1bd108f80bd0dd21e753e2674f35418d2fc074419c2ae9d219119719aea609ff`
- [browser-oklab-stable-mobile.jpg](browser-oklab-stable-mobile.jpg) — 382×827, sips, SHA-256 `676a668a406d8091e969f8d4feae056cf63c30fc7e8d305d4d49d0f65bc3b1bf`
- [browser-blind-a.jpg](browser-blind-a.jpg) — 160×160, sips, SHA-256 `ee10121a34f436e56a897a723397250d1e899a8a35a2f7c3bc8913bbb225e19c`
- [browser-blind-b.jpg](browser-blind-b.jpg) — 160×160, sips, SHA-256 `b0be03168e82c962553939bb5b310a0e5ba0dcfeb23f8317a961e80c16c44121`

## Actual-size 수동 matrix

- [브라우저 1× A/B 페이지](browser-manual-matrix.html)
- [20-cell·240-asset manifest](browser-manual-matrix.json) — SHA-256 `042c3a0bf79ff7ea128e46a5f53f3daf5fb75e769378837649188324d16acf1b`
- [browser-manual-gradient.jpg](browser-manual-gradient.jpg) — SHA-256 `ae1f095186b491caaf530ee2292a81df2359dd089706ddc2bf3b87ce289f00ea`
- [browser-manual-gradient-median.jpg](browser-manual-gradient-median.jpg) — SHA-256 `e09a80a18c2bc1697f905b5ebb6aebb5bfff491a0010c41807700366388af8e0`
- [browser-manual-photo.jpg](browser-manual-photo.jpg) — SHA-256 `a0c8d69f34322991c220d9d3932057aaa484815e93cc43266193dab22ba49e31`
- [browser-manual-large-small.jpg](browser-manual-large-small.jpg) — SHA-256 `4e13587432f18ee9784495c81a66f6c2967f16928522bfec6436e12d12b4be0e`
- [browser-manual-animation-stable.jpg](browser-manual-animation-stable.jpg) — SHA-256 `f49964f2055d444a9fd161517071f4aea73b931f401640da1ff2fbae0f64f730`
- [browser-manual-animation-stable-next.jpg](browser-manual-animation-stable-next.jpg) — SHA-256 `b358b5b4b9330f9bc196a097160b22d42ef01dc5cfd58f456f409910417a7f53`

## 독립 검토

- [Sol xhigh 독립 검토](sol-xhigh-independent-rereview-2026-08-25.md) — FAIL, SHA-256 `c74bac3027ce9804b487f8dc1e02e489faa06d79757566209c18451c8c9cc6da`

## 재현 명령

- `node scripts/palette-algorithm-check.mjs`
- `node scripts/pal002-ui-check.mjs`
- `node scripts/pal002-evidence-gate-check.mjs`
- `node scripts/generate-pal002-browser-matrix.mjs`
- `node scripts/generate-pal002-evidence.mjs`
- `node scripts/visual-quality-check.mjs`
- `node scripts/security-check.mjs`

## 남은 완료 조건

- independent Sol xhigh changes requested
- approved opt-in preset promotion
