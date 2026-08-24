# ALP-001 검증 증거 및 실행 보고서

## 개요
- **항목 ID:** ALP-001
- **항목명:** 고채도 배경과 alpha edge/island 진단
- **구현 상태:** `DONE`
- **실행일시:** 2026-08-19T05:49:39.901Z

## 1. 지원 배경 모드 및 B 단축키 순환
- **지원 배경:** `checker` (기본 격자), `white`, `black`, `green` (`#00FF00`), `magenta` (`#FF00FF`), `cyan` (`#00FFFF`), `custom` (`#RRGGBB` 사용자 지정)
- **순환 단축키:** `B` 키 및 `배경 (B)` 버튼
- **안전 제어:** `input`, `textarea`, `select`, `contentEditable` 요소 포커스 시 단축키 비활성화

## 2. 알파 진단 알고리즘 (`computeAlphaDiagnostics`)
- 노이즈 제거 및 외곽선 처리 전 순수 논리 alpha 채널 대상 분석
- **부분 알파 (`0 < alpha < 255`):** 카운트 집계
- **고립 섬 (`islands`):** 4-이웃 연결 요소 분석, 프레임별 최대 면적 컴포넌트를 제외한 면적 $\le 4$인 컴포넌트
- **결과 JSON:** `jsonData.diagnostics.alpha`에 `partialAlphaCount`, `islandCount`, `islandPixelCount`, `threshold` 포함

## 3. UI 및 모달 오버레이
- **결과 카드 메타:** `부분 알파 N · 작은 섬 M` (0건 시 `부분 알파 없음 · 고립 섬 없음`, 구형 로그 `알파 진단: 기록 없음`)
- **모달 토글 (`#modalAlphaDiagToggle`):** 진단 대상 있을 때 활성화, 오버레이 캔버스(`#modalAlphaOverlay`)에 섬 위치 노란색 반투명 영역 및 바운딩 박스 표시

## 4. CSP 동기화
- **SHA-256 해시:** `bcKIJsYtnz/LwcEQI+8aWufr1BhpRGrQZO8UYIMlIM4=`
- **동기화 파일 3곳:**
  1. `pixelate_studio.html`
  2. `SECURITY.md`
  3. `vercel.json`

## 5. 자동화 테스트 결과
- `scripts/security-check.mjs`: PASS
- `scripts/alpha-check.mjs`: PASS (5 tests)
- `scripts/alp001-ui-check.mjs`: PASS
- `scripts/visual-quality-check.mjs`: PASS (12/12 deterministic)
