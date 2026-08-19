# CFG-001 — 증거 및 검증 보고서

## 1. 메타데이터

| 항목 | 값 |
|---|---|
| 항목 ID | `CFG-001` |
| 항목명 | versioned 설정 JSON과 목적별 preset |
| 상태 | `DONE` (완료) |
| 검증 스크립트 | `scripts/settings-check.mjs`, `scripts/generate-cfg001-evidence.mjs` |
| CSP 해시 | `rLNbXpNZwqSBsWF1X/sp9Ki7HnYbOA/euq966bvzvKQ=` |
| 보고서 SHA-256 | `d50b7c789496b53d5933d700a4a43d598c910d07fe3f44f882a4f6bbc894c520` |

---

## 2. 수용 기준 검증 결과

| 검증 항목 | 기대 동작 | 실제 결과 | 상태 |
|---|---|---|---|
| **v1 Envelope Round-Trip** | 설정 JSON export 후 import 시 모든 18개 필드 100% 일치 | 기본값 및 factor/preserve-sheet 설정 완벽 일치 | PASS |
| **Atomic Validation & Rejection** | 유효하지 않은 JSON/버전/필드/범위 수신 시 UI를 단 1개도 변경하지 않고 거부 | version 2, out-of-range, invalid enum 원자적 거부 | PASS |
| **Prototype Pollution Safety** | `__proto__`, `prototype`, `constructor` 키 포함 시 파싱 전/후 즉각 차단 | `보안 위험: 금지된 속성 키` 오류 발생 및 완전 차단 | PASS |
| **64KB Size Limit** | 64KB 초과 파일 파싱 거부 | 70KB 페이로드 64KB 초과 에러 발생 | PASS |
| **Legacy IndexedDB Migration** | 구버전 flat settings (`downscaleEnabled: false` 등) 자동 마이그레이션 | `scaleMode: 'original'`, `colors`, `cleanPasses` 매핑 완료 | PASS |
| **Preset Diff Confirmation** | 프리셋 선택 후 적용 전 변경될 항목만 결정적 순서로 표시 | diff 목록 인라인 표시 및 사용자 [변경 적용] 시에만 반영 | PASS |
| **No Leaked Images/Names** | 설정 JSON에 이미지 data URL, canvas, 파일명이 포함되지 않음 | 순수 변환 파라미터만 저장됨 확인 | PASS |

---

## 3. Envelope v1 구조 예시

[sample-v1-settings.json](sample-v1-settings.json):
```json
{
  "format": "pixelate-studio-settings",
  "version": 1,
  "createdAt": "2026-08-14T00:00:00.000Z",
  "settings": {
    "scaleMode": "factor",
    "size": 64,
    "method": "box",
    "factor": 4,
    "factorFrameMode": "sheet",
    "frameWidth": 64,
    "frameHeight": 64,
    "pixelBlockSize": 4,
    "paletteEnabled": true,
    "colors": 16,
    "shared": true,
    "cleanEnabled": true,
    "cleanPasses": 1,
    "outline": false,
    "outlineWidth": 1,
    "outlineColor": "#000000",
    "outlineShape": "4",
    "exportNearestScales": [
      2,
      4
    ]
  }
}
```

---

## 4. 검증 명령어

```bash
node scripts/security-check.mjs && node scripts/settings-check.mjs && node scripts/generate-cfg001-evidence.mjs
```
모든 자동화 검사 통과 및 시각 품질 기준선(12개 하네스) 100% 불변 확인 완료.
