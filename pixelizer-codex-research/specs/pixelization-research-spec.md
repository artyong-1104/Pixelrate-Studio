# Pixelate Studio 연구 기반 엔지니어링 명세

## 1. 목적

이 문서는 `references/urls.md`의 Source 01~08과 현재 구현을 연결하는 상위 명세다. 구현 우선순위와 공통 인터페이스를 고정하고, 세부 동작은 `items/`의 항목별 명세가 결정한다. 운영 코드 변경은 반드시 한 항목씩 진행한다.

## 2. 현재 동작

현재 제품은 `pixelate_studio.html` 하나에 UI와 처리 파이프라인이 함께 들어 있는 로컬 브라우저 도구다.

- `square`: 16/32/64/128/256 정사각 출력, nearest 또는 alpha-weighted sRGB Box
- `preserve-sheet`: 1/2/4/8 블록을 프레임별 top-left 원점에서 평균한 뒤 원래 시트 크기로 nearest 재확대
- `original`: 공간 축소 없이 팔레트·정리·외곽선 처리
- palette: 최대 50,000 샘플, 입력 순서 기반 결정적 sRGB K-means, 10회 반복
- multi-file shared palette 및 단일 시트 전체 palette
- alpha: 평균 alpha가 10 이상이면 최종 PNG에서 255, 미만이면 0
- cleanup: 고립 픽셀 색 교체, 시트에서는 프레임 경계 격리
- outline: 4/8방향 고정색, 시트에서는 프레임 내부 한정
- 결과: PNG, palette/grid JSON, 전체 ZIP, 선택적 IndexedDB 로그
- preview: 1~24배 확대, 픽셀 격자, checker/white/black 배경

기준 검사:

```sh
node scripts/security-check.mjs
node scripts/preserve-sheet-check.mjs
```

## 3. 확인된 문제와 제한

1. 비정사각 입력을 의도한 정수 배율로 native 해상도에 내릴 수 없다.
2. preserve-sheet는 논리 픽셀을 다시 원본 크기로 키우므로 편집용 native PNG를 만들지 않는다.
3. 흐트러진 AI 픽셀 격자의 period와 phase를 감지하지 못한다.
4. custom palette와 휴대 가능한 설정 파일이 없다.
5. 실제 크기 A/B와 시간축 재생이 없어 확대 정지 이미지만으로 판단하게 된다.
6. partial alpha를 항상 binary로 바꾸지만 이 정책이 UI에 드러나지 않는다.
7. 대표색, 지각 팔레트, dithering, line 보존 후보의 상대 품질을 재현할 corpus가 없다.
8. main thread에서 모든 처리를 수행하지만 후보 추가 전 성능 기준선이 없다.

## 4. 연구 근거와 기회

### 4.1 SOURCE-BACKED

- Source 01·04·07: 알려진 정수 확대 배율을 되돌리고 native와 nearest 확대본을 구분한다.
- Source 02: 시퀀스 전체 공유 팔레트, 고정 격자, dithering off, 실제 크기 판단이 시간축 안정성에 중요하다.
- Source 03·05: Sobel/FFT 계열 경계·주기 분석과 수동 grid override가 흐트러진 픽셀 격자 복구 후보가 된다.
- Source 05·06: custom palette, preset, 설정 JSON, ordered dithering은 비교 제품에서 반복되는 기능이다.
- Source 04·07: 고채도 배경이 누끼 잔여 픽셀을 발견하는 데 유용하다.

### 4.2 ENGINEERING-INFERENCE

- 새 후보를 넣기 전에 고정 fixture와 결정성 hash를 갖춘 품질 하네스가 필요하다.
- 큰 이미지가 공유 팔레트를 독식하지 않도록 image-balanced/reference sampling을 비교해야 한다.
- main-thread long task가 측정될 때 Worker로 옮기고, WASM은 Worker 뒤에도 병목일 때만 평가한다.
- 진단 overlay와 자동 수정은 분리해야 한다.

### 4.3 EXPERIMENTAL

- Sobel grid detector가 다양한 AI 픽셀풍 입력에서 충분한 confidence를 내는지
- linear-light mean, center, median, majority, Weber가 현재 sRGB mean보다 나은지
- OKLab K-means와 MedianCut이 현재 sRGB K-means보다 나은지
- ordered dithering과 selout이 실제 크기·애니메이션에서 이득인지

실험 항목은 QLT-001의 동일 corpus에서 기준선과 한 축만 바꾸는 ablation을 통과해야 한다.

## 5. 목표 아키텍처와 단계

### 단계 A — 증거 기반

QLT-001로 fixture manifest, 정량 지표, hash, 보고서 형식을 먼저 만든다. 이후 모든 항목은 이 하네스에 회귀 항목을 추가한다.

### 단계 B — 낮은 위험의 제품 기능

GEO-001, OUT-001, CFG-001, UX-001, PAL-001, ALP-001을 구현한다. 기존 모드는 기본 동작을 유지하고 새 기능은 명시적으로 선택한다.

### 단계 C — 시간축과 격자

ANI-001로 multi-file/sheet 재생을 만든 뒤 GRID-001의 sequence lock을 검증한다. ALP-002는 진단 결과를 보고 사용자가 alpha 정책을 선택하게 한다.

### 단계 D — 품질 후보와 성능

CELL-001, PAL-002, DIT-001, EDGE-001은 실험 플래그 아래 구현한다. PERF-001은 측정된 병목만 Worker/WASM으로 이동한다.

## 6. 공통 설정 인터페이스

CFG-001 이후 휴대 가능한 설정 파일은 다음 envelope를 사용한다.

```json
{
  "format": "pixelate-studio-settings",
  "version": 1,
  "createdAt": "2026-08-14T00:00:00.000Z",
  "settings": {}
}
```

- `format`과 `version`은 필수다.
- `createdAt`은 정보용이며 처리 결과에 영향을 주지 않는다.
- `settings`의 각 필드는 항목별 명세가 추가한다.
- version 1의 알려진 필드가 잘못되면 전체 import를 거부한다.
- 알려지지 않은 settings 필드는 무시하고 개수를 경고한다.
- 미래 version은 부분 적용하지 않는다.
- 기존 IndexedDB flat settings와 `downscaleEnabled`는 normalize 경로로 계속 읽는다.

계획된 정규화 필드:

```text
scaleMode, size, method,
factor, factorFrameMode, frameWidth, frameHeight, pixelBlockSize,
paletteMode, colors, shared, customPalette,
cleanEnabled, cleanPasses,
outlineEnabled, outlineWidth, outlineColor, outlineShape,
exportNearestScales,
alphaMode, alphaThreshold,
representativeColor, paletteAlgorithm, paletteSampling,
ditherMode, ditherStrength
```

아직 구현되지 않은 항목의 필드는 그 항목이 완료되기 전에는 export하지 않는다.

## 7. 결과 JSON 호환 정책

기존 필드는 유지한다.

```json
{
  "width": 64,
  "height": 64,
  "palette": {},
  "grid": [],
  "outline": null,
  "processing": {}
}
```

- 새 정보는 `processing`, `exports`, `diagnostics` 또는 명세가 지정한 additive 필드로만 추가한다.
- 기존 모드의 `processing.mode` 값은 유지한다.
- GEO-001은 `processing.mode: "factor"`를 추가한다.
- OUT-001의 확대 PNG는 파생 산출물이며 grid/palette JSON을 별도로 복제하지 않는다.
- ALP-002 coverage 모드만 `alpha` 2차원 배열을 추가한다. binary 모드에서는 생략한다.
- 기존 소비자는 알 수 없는 필드를 무시해도 기존 grid를 계속 읽을 수 있어야 한다.

## 8. 거부·보류 접근

- FFT: Sobel v1이 QLT-001에서 실패한 corpus가 확인되기 전에는 넣지 않는다.
- 자동 background removal/chroma key: 경계 언믹싱과 색 충돌 검증 전 보류한다.
- node graph, video/GIF: 현재 파이프라인과 메모리 정책을 크게 바꾸므로 보류한다.
- AI generation/LoRA/PAG: 로컬 결정론적 후처리 범위 밖이다.
- GPU/WebGPU: 현 출력 제한에서 CPU·Worker 기준선 없이 도입하지 않는다.
- 외부 알고리즘 복사: 라이선스가 불명확한 Source 02 코드와 LICENSE 파일이 확인되지 않은 구현은 아이디어만 독립 구현한다.

## 9. 하위 호환 위험

- scale mode, settings 필드, 결과 JSON을 한 번에 재구성하면 기존 IndexedDB 로그 복원이 깨질 수 있다.
- alpha 기본값 변경은 silhouette와 grid를 바꾼다. ALP-002 뒤에도 기본은 기존 threshold 10 binary다.
- K-means 초기화나 palette order 변경은 JSON index와 PNG hash를 바꾼다. 실험 기본값은 기존 알고리즘이다.
- 파일명 변경은 외부 파이프라인을 깨뜨릴 수 있다. 기존 native 이름을 유지한다.
- Worker/WASM은 부동소수점·실행 순서 차이로 byte-identical 결과를 깨뜨릴 수 있다.

## 10. 성능·보안 위험

- 분석용 원본 픽셀 배열, source/result A/B canvas, animation frames가 동시에 존재하면 메모리가 증가한다.
- custom palette와 여러 후보 A/B는 색 비교 수를 늘린다. `MAX_COLOR_COMPARISONS`를 유지한다.
- main-thread Sobel, OKLab, MedianCut은 long task를 만들 수 있다.
- 설정 JSON, GPL, PNG palette는 파일 크기·색 수·형식을 검증해야 한다.
- Worker 도입 시 CSP `worker-src 'self'`, cancellation, 데이터 복사 비용을 검토한다.
- 어떤 항목도 런타임 네트워크 API를 추가하지 않는다.

## 11. 상위 수용 기준

1. 기존 두 Node 회귀 검사가 계속 통과한다.
2. 기존 세 scale mode와 legacy 로그가 동일 기본값으로 복원된다.
3. 동일 입력·설정 2회 결과의 PNG와 JSON hash가 일치한다.
4. 프레임 경계를 cleanup, outline, grid, dither가 넘지 않는다.
5. 모든 새 UI는 키보드와 620px 이하 화면에서 사용할 수 있다.
6. 실험 기능은 default off이며 품질 보고서 없이는 일반 preset에 들어가지 않는다.
7. 대시보드와 해당 명세에 자동·수동 QA 증거가 기록된다.

## 12. 필수 테스트

- `security-check.mjs`, `preserve-sheet-check.mjs`
- QLT-001 manifest 및 결정성 검사
- 모드별 settings normalize/import/export round trip
- PNG·JSON·ZIP 이름과 파생 산출물 검증
- alpha threshold와 frame-boundary fixture
- 실제 크기와 animation loop 수동 QA
- 4M 처리 경계의 시간·메모리·취소 검사

## 13. 연구 후보 추적표

| 연구 후보 | 구현 명세 | 상태·정책 |
|---|---|---|
| Candidate 0 — Visual-quality harness | QLT-001 | P0 선행조건 |
| Candidate 1 — Exact-factor output | GEO-001, OUT-001 | native와 파생 확대를 분리 |
| Candidate 2 — Grid period/phase | GRID-001 | EXPERIMENTAL gate |
| Candidate 3 — Representative color | CELL-001 | 기본 sRGB mean 유지 |
| Candidate 4 — Palette pipeline | PAL-001, PAL-002 | custom은 제품, 추출 알고리즘은 실험 |
| Candidate 5 — Dithering | DIT-001 | static-only, 기본 off |
| Candidate 6 — Alpha policy | ALP-001, ALP-002 | 진단과 출력 정책 분리 |
| Candidate 7 — Line-aware/selout | EDGE-001 | EXPERIMENTAL gate |
| Candidate 8 — Animation review | UX-001, ANI-001 | 실제 크기와 시간축 분리 구현 |
| Candidate 9 — Presets/settings | CFG-001 | versioned settings v1 |
| Candidate 10 — Worker/WASM | PERF-001 | 계측 gate 후 도입 |

추가로 Source 04·07의 고채도 누끼 검수는 ALP-001, native/확대 이중 산출은 OUT-001로 독립 항목화했다. 보류 후보는 `deferred-register.md`에서 재진입 조건까지 추적한다.
