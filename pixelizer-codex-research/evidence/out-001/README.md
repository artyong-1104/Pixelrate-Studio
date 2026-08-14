# OUT-001 완료 증거

검증 시각: 2026-08-14 18:38 KST  
환경: macOS arm64, Node v26.4.0

## 1. 자동 검사 결과

| 검사 | 결과 | 요약 |
|---|---|---|
| `node scripts/security-check.mjs` | PASS | CSP 해시 3곳 동기화 (`G/bhVsE3S2y4CkbPDY6LtdHKsBbk2xxx3t1BTJkggNo=`), integrity, unsafe sinks 검증 |
| `node scripts/out001-check.mjs` | PASS | 3×2 소스의 2×/4×/8× N×N 균일 블록 검증, smoothing=false, 지원하지 않는 배율(1/3/16/NaN) 거부, 픽셀/치수 한도 초과 거부, 설정 요약 |
| `node scripts/preserve-sheet-check.mjs` | PASS | 기존 `preserve-sheet` 및 `factor` 모드 레이아웃/알파/회귀 검사 통과 |
| `node scripts/visual-quality-check.mjs` | PASS | 기존 시각 품질 기준선 100% 불변 유지 |
| `node scripts/geo001-ui-check.mjs` | PASS | UI 및 DOM 마크업 검증 |
| `node scripts/generate-out001-evidence.mjs` | PASS | native, 2×, 4×, 8× 샘플 및 JSON 생성, 블록 균일성 100% 검증 통과 |
| `git diff --check` | PASS | 공백 및 코드 포맷 오류 없음 |

결정성 요약 해시 (`deterministicSha256`): `40e2a4a5ddce9be03e86c7b9226ef585f88911fdbe2d34225a29a4e8c5f9757d`  
전체 기계 판독 데이터는 [summary.json](summary.json)에 기록되어 있습니다.

## 2. 산출물 및 SHA-256 검증

| 항목 | 규격 | 용량 | SHA-256 |
|---|---:|---:|---|
| Native PNG | 96×168 | 64,748 bytes | `0446810d279349bfd410957e04d05ca576c33f1c25ad3c8578b3e4d32644516b` |
| 2× Nearest PNG | 192×336 | 258,467 bytes | `8b38176cf738aa5ddb7e17c75d29d10ed569e0f504f2602aeda38df4171ffd59` |
| 4× Nearest PNG | 384×672 | 1,033,007 bytes | `bd38e6c3abb46e17dccb705a44e4ca1e8641d6d59ab43e7d1bea52de01ec354d` |
| 8× Nearest PNG | 768×1344 | 4,130,495 bytes | `17be7a49a6d93e68012c5dd850311d778e07f1c501f9e1830bfeb6c405174e7d` |
| JSON Metadata | - | 159,755 bytes | `599109d66fbbc3dea74b0b8e49d135bd0291a7d9455d39c6be5e2cd4ab4f7293` |

### 결과 파일 링크
- [hero_96x168.png](hero_96x168.png) (Native 96×168)
- [hero_96x168_2x.png](hero_96x168_2x.png) (2× 확대 192×336)
- [hero_96x168_4x.png](hero_96x168_4x.png) (4× 확대 384×672)
- [hero_96x168_8x.png](hero_96x168_8x.png) (8× 확대 768×1344)
- [hero_96x168.json](hero_96x168.json) (단일 메타데이터 JSON)

## 3. 핵심 수용 기준 충족 확인

1. **N×N 블록 균일성**:
   - 2×/4×/8× 확대본의 모든 논리 픽셀이 정확히 N×N 개의 동일한 RGBA 블록으로 확장됨 (`verifyBlockUniformity` 통과).
   - 팔레트 및 알파 값을 새로 계산하지 않고 native 캔버스의 nearest-neighbor 파생물로 생성.
2. **On-Demand 메모리 관리**:
   - 확대 캔버스를 메모리에 상시 보관하거나 IndexedDB에 저장하지 않음.
   - 개별 다운로드 및 ZIP 압축 시점에 순차적으로 생성하고 즉시 해제.
3. **파일명 및 JSON 규격**:
   - Native: `${stem}_${dims}.png`
   - 확대본: `${stem}_${dims}_${scale}x.png`
   - JSON: `exports: { native: true, nearestScales: [2, 4, 8] }` 단일 파일 유지.
4. **한도 초과 안전 제어**:
   - 픽셀 수 4,194,304 초과 또는 치수 4096 초과 시 개별 버튼 disabled 및 ZIP 생성 시 해당 산출물 안전 제외/경고 처리.
