# PAL-001 — Custom Palette Implementation & Verification Evidence

## 개요
- **항목 ID:** `PAL-001`
- **항목명:** Custom palette 입력·미리보기·검증
- **상태:** `DONE`
- **생성 일시:** 2026-08-19T05:23:42.699Z
- **CSP SHA-256:** `sha256-K1zoyUoXkcoUC6fiQBXMO6hhr832xcXlf8TP30HIvVE=`

---

## 1. 구현 요약

### 1.1 팔레트 방식 선택기 (`paletteMode`)
- **자동 생성 (`auto` - 기본값):** 기존 K-means 클러스터링으로 대표 색상 추출. 슬라이더로 색상 수 조절.
- **직접 지정 (`custom`):** 사용자가 직접 입력한 고정 팔레트(HEX, GPL, PNG)로 픽셀을 sRGB 유클리드 최근접 매핑.
- **제한 없음 (`unlimited`):** 팔레트 양자화 없이 원본/다운스케일 고유 색상 유지.

### 1.2 파서 및 입력 유효성 검증
1. **HEX 파서 (`parseHexPalette`):**
   - 6자리 `#RRGGBB` 엄격 파싱.
   - 쉼표, 공백, 줄바꿈 구분자 지원.
   - 주석(`//`, `;`) 및 빈 줄 무시.
   - 3자리/8자리/색상명 거부 및 에러 라인 카운트.
2. **GPL 파서 (`parseGplPalette`):**
   - GIMP 헤더(`GIMP Palette`) 및 메타데이터(`Name:`, `Columns:`) 파싱.
   - 0~255 범위의 10진수 RGB 파싱.
3. **PNG 팔레트 추출 (`parsePngPaletteData`):**
   - Row-major 순서로 스캔하여 불투명(`alpha === 255`) 픽셀 색상 추출.
   - 완전 투명(`alpha === 0`) 무시.
   - 부분 투명(`alpha 1~254`) 픽셀 경고 안내.
   - 최대 크기 1MB, 최대 해상도 4096×4096 보호.
4. **중복 제거 및 순서 보존 (`dedupePaletteColors`):**
   - 최초 등장 순서를 유지하며 중복 RGB 제거.
   - 중복 제거 개수 실시간 표시 (`유효 N색 · 중복 M개 제거 · 무시 K개`).
5. **결정적 Tie-Breaking (`nearestColorIndex`):**
   - sRGB 유클리드 거리가 동일한 경우 앞선 인덱스 색상 우선 선택.
6. **최대 연산량 가드:**
   - `logicalPixels * palette.length > 50,000,000` 연산량 초과 차단.

---

## 2. 설정 직렬화 및 v1 봉투 호환 (CFG-001 연동)

### 2.1 `DEFAULT_SETTINGS`
```javascript
paletteMode: 'auto',
customPalette: [],
paletteEnabled: true,
colors: 16,
shared: true
```

### 2.2 레거시 설정 마이그레이션
- `paletteEnabled: false` $\rightarrow$ `paletteMode: 'unlimited'`
- `paletteEnabled: true` $\rightarrow$ `paletteMode: 'auto'`
- `paletteMode: 'custom'`일 때 `customPalette` 배열(2~256개) 유효성 검사 및 `colors = customPalette.length` 동기화.

---

## 3. 결과 JSON 메타데이터 (`processing.palette`)

```json
{
  "width": 64,
  "height": 64,
  "palette": {
    "0": [
      15,
      56,
      15
    ],
    "1": [
      48,
      98,
      48
    ],
    "2": [
      139,
      172,
      15
    ],
    "3": [
      155,
      188,
      15
    ]
  },
  "grid": [
    [
      0,
      1
    ],
    [
      2,
      1
    ]
  ],
  "outline": null,
  "processing": {
    "mode": "square",
    "size": 64,
    "method": "box",
    "palette": {
      "mode": "custom",
      "inputColors": 4,
      "usedColors": 3,
      "distance": "srgb"
    }
  },
  "exports": {
    "native": true,
    "nearestScales": []
  }
}
```

- **미사용 색상 보존:** `palette` 객체는 실제 사용되지 않은 색상도 custom palette 입력 순서대로 모두 포함.
- **`usedColors` 메타데이터:** 실제 grid 픽셀에서 참조된 고유 색상 수 정확히 기록.

---

## 4. 검증 결과

| 검증 항목 | 테스트 스크립트 | 결과 |
|:---|:---|:---:|
| HEX 파서 (#RRGGBB, 주석, 구분자, 에러 라인) | `scripts/palette-check.mjs` | **PASS** |
| GPL 파서 (GIMP Palette 헤더, 0~255 RGB) | `scripts/palette-check.mjs` | **PASS** |
| PNG 팔레트 추출 (alpha=255, 부분투명 경고) | `scripts/palette-check.mjs` | **PASS** |
| 중복 제거 순서 보존 및 tie-break | `scripts/palette-check.mjs` | **PASS** |
| 설정 봉투 직렬화 및 마이그레이션 | `scripts/settings-check.mjs` | **PASS** |
| DOM UI 인터랙션 (모드 전환, 칩 렌더링, 초기화) | `scripts/pal001-ui-check.mjs` | **PASS** |
| CSP 동기화 (3곳 일치) 및 보안 검사 | `scripts/security-check.mjs` | **PASS** |
| 시각 품질 하네스 12종 결정론 회귀 테스트 | `scripts/visual-quality-check.mjs` | **PASS** |
