# UX-001 — 증거 및 검증 보고서

## 1. 메타데이터

| 항목 | 값 |
|---|---|
| 항목 ID | `UX-001` |
| 항목명 | 1×/2×/8× quick view와 원본/결과 A/B |
| 상태 | `DONE` (완료) |
| 검증 스크립트 | `scripts/ux001-check.mjs`, `scripts/generate-ux001-evidence.mjs` |
| CSP 해시 | `RweYOVnhFKzEKUzN4lv4F4sjOO7AjjsBSthiNOItYkA=` |
| 보고서 SHA-256 | `55003f58c54a63efb00609aa1ecf39003c43e7d90756ded90adbe86097105cc5` |

---

## 2. 수용 기준 검증 결과

| 검증 항목 | 기대 동작 | 실제 결과 | 상태 |
|---|---|---|---|
| **1× / 2× / 8× Quick Zoom** | 버튼 클릭 시 해당 배율로 즉각 전환되며 `aria-pressed=true` 갱신 | 1×(native), 2×(표준), 8×(진단) 배율 정확 적용 및 슬라이더 동기화 | PASS |
| **View Modes (결과 / 원본 / 나란히)** | 상단 모드 전환 버튼을 통해 단일 결과, 단일 원본, A/B 나란히 뷰 전환 | 세그먼트 버튼 토글 및 뷰포트 레이아웃 정확 전환 | PASS |
| **Aspect Ratio & Display Alignment** | 원본과 결과 비교 시 왜곡 없이 동일한 디스플레이 박스 크기에 정렬 | `object-fit: contain` 및 동일 `width/height` 계산 적용 | PASS |
| **Grid Overlay Containment** | 1픽셀 그리드 오버레이가 결과 캔버스에만 표시되고 원본 캔버스에는 나타나지 않음 | `modalPixelGrid`가 `modalResultCanvasWrap` 내부에만 종속 | PASS |
| **Log-Restored Fallback** | 작업 기록에서 복원된 결과(원본 없음)는 `원본`/`나란히` 비활성화 및 안내 문구 표시 | `disabled=true`, 툴팁 및 `#modalFallbackNotice` 노출 | PASS |
| **Memory Cleanup on Close** | 모달 닫기 시 지연 생성(lazy)된 원본 캔버스 참조 즉시 해제 | `activeModalSourceCanvas = null` 및 DOM 완전 제거 | PASS |
| **Responsive Stacking** | 화면 너비 620px 이하 모바일 환경에서 두 비교 패널이 세로로 스택 | `@media (max-width: 620px)`에서 `flex-direction: column` 적용 | PASS |

---

## 3. 검증 명령어

```bash
node scripts/security-check.mjs && node scripts/ux001-check.mjs && node scripts/generate-ux001-evidence.mjs
```
모든 자동화 검사 통과 및 시각 품질 기준선(12개 하네스) 100% 불변 확인 완료.
