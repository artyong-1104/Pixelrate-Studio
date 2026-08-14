# Pixelate Studio algorithm candidates

조사일: 2026-08-13 (KST)

이 문서는 구현 명세가 아니라 실험 후보 목록이다. `SOURCE-BACKED`는 소스가 기능·기법을 직접 보여 준다는 뜻이지 우리 프로젝트에서 우수함이 증명됐다는 뜻은 아니다. `ENGINEERING-INFERENCE`와 `EXPERIMENTAL`은 소스 관찰을 현재 코드에 연결한 판단이다.

## Candidate 0 — Reproducible visual-quality harness

- 분류: **ENGINEERING-INFERENCE**
- 상태: **먼저 구축 권장**
- 문제: 현재 회귀 검사는 프레임 경계·블록·알파 평균을 확인하지만 시각 품질, grid detection, temporal stability를 비교하지 않는다.
- 제안: 정답 또는 기대 속성이 있는 fixture corpus와 동일 설정의 candidate grid를 만든다. PNG, 설정, 결과 hash, runtime, metric을 함께 저장한다.
- 필수 fixture: gradient, hard edge, thin lines, transparency, low contrast, texture, sprite/icon, photo, clean pixel art, distorted-grid pixel-style, multi-frame animation.
- 통과 조건: 새 후보가 기존 동작을 바꾸기 전에 어떤 입력에서 좋아지고 나빠지는지 재현 가능해야 한다.

## Candidate 1 — Aspect-preserving exact-factor output

- 분류: **SOURCE-BACKED** (Source 01, 02, 04, 06, 07)
- 상태: **제품 적용 우선순위 1**
- 문제: square mode는 비정사각 입력을 정사각형으로 만들고, preserve-sheet는 논리 픽셀을 다시 원래 크기로 확대한다. `768×1344 → 96×168`, `480×704 → 160×234` 같은 작업을 직접 표현할 수 없다.
- 접근:
  - `factor`: 2/3/4/8 또는 유효한 정수
  - `target side/width/height`: 종횡비 유지 후 계산값 표시
  - sprite sheet: 각 frame-local origin에서 같은 factor 사용
  - export: native logical resolution 또는 nearest-upscaled original geometry를 명시적으로 선택
  - optional dual export: native PNG와 2×/4×/8× nearest 확대 PNG를 같은 작업에서 생성
- 대표색 기준선: 기존 alpha-weighted Box.
- 호환성: 기존 `square`, `preserve-sheet`, `original`을 유지하고 새 모드를 추가한다.
- 위험: 나누어떨어지지 않는 치수의 crop/pad/partial-cell 정책이 필요하다. 자동으로 잘라내지 말고 계산 결과와 오류를 먼저 보여 줘야 한다.
- 실험: non-square, frame boundary, 3× factor, transparent partial blocks, one-pixel features.

## Candidate 2 — Grid period and phase detection

- 분류: **SOURCE-BACKED + EXPERIMENTAL** (Source 03 Perfect Pixel, Source 05 Pixel Snapper)
- 상태: **프로토타입 권장**
- 문제: AI pixel-style 입력의 셀 크기·오프셋·경계는 일정하지 않을 수 있고, 현 fixed top-left block은 이를 복구하지 못한다.
- 최소 접근:
  1. 분석용 색 축소 또는 luma 계산
  2. Sobel x/y magnitude를 축별로 투영
  3. peak 간격의 robust median/autocorrelation으로 period 추정
  4. period별 phase 후보를 edge support로 평가
  5. confidence가 낮으면 자동 적용하지 않음
- 확장 접근: FFT magnitude로 초기 period 후보를 만들고 Sobel로 refine.
- 애니메이션 정책: 대표 프레임, 합성 profile, 또는 전체 sheet에서 한 번 감지하고 sequence에 lock. 프레임별 독립 감지는 기본 금지.
- 수동 override: pixel size x/y, phase x/y, frame geometry.
- 위험: 큰 단색 영역, 저대비, 투명 배경, 혼합 pixel sizes, diagonal art, grid가 없는 photo에서 오검출.
- 실험 지표: period error, phase error, false positive, confidence calibration, frame-to-frame variance, runtime.
- 구현 주의: Perfect Pixel은 pyproject에서 MIT를 선언하고 Pixel Snapper는 MIT LICENSE를 제공하지만, 코드를 그대로 옮기기보다 브라우저/RGBA/frame 요구에 맞춘 독립 구현이 바람직하다.

## Candidate 3 — Cell representative-color modes

- 분류: **SOURCE-BACKED + EXPERIMENTAL** (Source 02, 03, 05)
- 상태: **비교 실험**
- 후보:
  - alpha-weighted sRGB mean: 현재 기준선
  - alpha-weighted linear-light mean: 물리적 혼합 후보이며 소스 직접 근거는 없음
  - center sample: 가장 빠르고 grid가 정확할 때 선명함
  - per-channel median: outlier에 강함
  - majority/mode: 넓은 면과 hard edge에 강할 수 있음
  - two-cluster majority: 셀 안 두 색을 나눈 뒤 큰 cluster 중심 선택
  - salience/Weber weighted: local mean과 차이가 큰 픽셀에 가중
- 예상 tradeoff:
  - majority는 작은 눈·입·하이라이트를 지울 수 있다.
  - center는 phase 오차에 매우 민감하다.
  - mean은 색을 섞고 경계를 흐릴 수 있다.
  - linear-light mean은 sRGB mean보다 혼합 밝기가 달라지며, 물리적 정확성이 픽셀아트 선호를 보장하지 않는다.
  - Weber는 texture/noise를 세부로 오인할 수 있다.
- 제품 정책: 하나를 전역 기본으로 바꾸지 말고 `balanced`, `hard surfaces`, `detail` 같은 검증된 preset으로만 노출한다.
- 실험 지표: thin-feature survival, edge displacement, flat-region variance, human preference.

## Candidate 4 — Palette pipeline split

- 분류: **SOURCE-BACKED + ENGINEERING-INFERENCE** (Source 02, 04, 05, 06)
- 상태: **custom palette 우선, 추출 알고리즘은 실험**
- 현재: deterministic sRGB K-means와 sRGB nearest mapping.
- 제안 단계:
  1. custom palette를 hex/GPL/PNG 등 제한된 형식으로 불러오고 색상 chip과 개수를 검증
  2. nearest mapping의 sRGB와 OKLab distance를 A/B
  3. auto palette는 현재 K-means, deterministic K-means++, MedianCut을 비교
  4. shared palette를 file set/sheet/asset set 단위로 명시
  5. 전체 픽셀 비례 sampling, 이미지별 균등 sampling, 지정 reference-image palette를 비교
- animation default: shared palette, deterministic seed, no generated dithering.
- mismatch 경고: custom palette로 mapping할 때 최대/평균 OKLab error와 outlier 색을 표시하는 방안을 시험.
- 위험: OKLab이 항상 아트 디렉션에 맞는 것은 아니며, 큰 면적이나 큰 이미지가 palette slot을 독식할 수 있다. Source 07 최종 예시는 172~203 고유색이어서 16색을 보편 기본으로 강제할 근거도 없다.
- 보류 후보: material-aware ramp allocation. segmentation 없이 재질을 추정하면 불안정하므로 별도 연구가 필요하다.

## Candidate 5 — Dithering policies

- 분류: **SOURCE-BACKED + EXPERIMENTAL** (Source 02, 05, 06)
- 상태: **static-only 실험, 기본 off**
- 구분:
  - preserve existing dither: grid detection/resampling이 입력의 규칙적 pattern을 지우지 않음
  - generate dither: palette mapping 중 ordered pattern을 새로 만듦
- 최소 후보: deterministic Bayer 2×2, Bayer 4×4, strength 0~1.
- animation 정책: off 기본. 켤 경우 pattern origin을 전체 시트/sequence에 고정하고 temporal preview 경고를 제공.
- 위험: texture처럼 보이는 noise, 프레임 shimmer, outline 침식, alpha edge pattern.
- 실험: static gradients와 animated gradients에서 banding 감소와 temporal variance를 함께 측정.

## Candidate 6 — Alpha policy split

- 분류: **SOURCE-BACKED + ENGINEERING-INFERENCE** (Source 02, 07)
- 상태: **실험 후 명시적 UX로 전환**
- 현재: block 평균 alpha가 10 이상이면 최종 alpha 255, 아니면 0.
- 후보:
  - `binary sprite`: threshold로 0/255. threshold를 명시하고 preview
  - `coverage`: block 평균 alpha를 유지
  - `opaque-only palette`: 낮은 alpha RGB가 palette 학습을 오염시키지 않도록 alpha-weighted sampling
- 보류: chroma-key/unmix. 단순 RGB 거리 key는 검은 outline과 배경 혼합색을 잘못 분류할 수 있으므로 독립 기능으로 설계해야 한다.
- QA 보조: checker/white/black에 green/magenta/cyan과 사용자 색을 추가하고, 비이진 알파 수 및 가장 큰 전경 연결요소 밖의 작은 불투명 island를 표시한다. 진단은 자동 삭제와 분리한다.
- 위험: 기본 threshold를 바꾸면 기존 silhouette와 JSON grid가 달라진다.
- 실험 지표: silhouette topology, hole count, fringe pixels, partial-alpha error, outline/frame crossing.

## Candidate 7 — Line-aware downscale and selective outline

- 분류: **SOURCE-BACKED + EXPERIMENTAL** (Source 02)
- 상태: **기본 off 비교 실험**
- 접근:
  - 고해상도 local luma보다 충분히 어두운 픽셀을 line candidate로 검출
  - cell별 line coverage와 line color를 계산
  - base downscale에 coverage만큼 합성
  - silhouette outer edge만 기존 색을 어둡게 하는 selout 옵션
- 현재 outline과의 관계: 기존 4/8방향 고정색 외곽선은 투명 바깥에 새 픽셀을 추가한다. selout은 기존 전경 가장자리 색을 어둡게 하므로 서로 다른 효과다.
- 위험: 그림자·텍스처를 선으로 오인, 어두운 피부/의상 왜곡, 작은 색 detail 손실, 알파 가장자리 이중 처리.
- 실험: line-art, painterly, low-contrast, photo, transparent sprite에서 stage별 ablation.

## Candidate 8 — Animation-safe quality review

- 분류: **SOURCE-BACKED + ENGINEERING-INFERENCE** (Source 01, 02, 06, 07)
- 상태: **제품 적용 우선순위 2**
- 기능:
  - 1×/2×/8× quick view
  - original/result split 또는 toggle
  - 여러 파일 이름순 loop와 sprite-sheet frame playback
  - fps, frame order, frame bounds preview
  - palette/grid/dither policy가 작업 전체에 lock됐는지 표시
- 이유: 정지 확대 이미지에서 보이지 않는 flicker가 있고, 반대로 확대 결함이 실제 크기에서는 중요하지 않을 수 있다.
- 위험: GIF를 자동 분해하지 않는 현 업로드 정책과 frame naming을 명확히 해야 한다.

## Candidate 9 — Portable presets and staged pipeline

- 분류: **SOURCE-BACKED + ENGINEERING-INFERENCE** (Source 06)
- 상태: **설정 JSON·preset 우선, node graph 보류**
- 첫 단계:
  - versioned settings-only JSON import/export
  - `AI grid repair`, `animation-safe`, `static dither`, `preserve sheet` 같은 검증된 preset
  - 각 preset이 실제로 바꾸는 항목을 diff로 표시
- 보류: 자유 node graph와 stage reorder. 처리 순서 조합이 폭발하고 단일 HTML의 접근성·저장 호환성·테스트 범위를 크게 넓힌다.

## Candidate 10 — Worker/WASM performance path

- 분류: **ENGINEERING-INFERENCE** (Source 05의 Rust/WASM, Source 06의 CPU 도구 사례)
- 상태: **프로파일링 후 결정**
- 순서:
  1. 현재 main-thread baseline과 새 후보별 runtime/long task/peak memory 측정
  2. 순수 JS 알고리즘을 Web Worker로 이동
  3. 격자 감지/quantization이 여전히 병목이면 WASM 평가
- GPU/WebGPU: 현 4M output-pixel 제한과 로컬 결정론 요구에서 우선순위가 낮다. 성능 자료 없이 도입하지 않는다.
- 필수 조건: byte-identical deterministic output 또는 명시된 허용 오차, worker cancellation, 진행률, 메모리 제한.

## Recommended experiment matrix

| 축 | 기준선 | 후보 |
|---|---|---|
| geometry | square Box, fixed preserve-sheet | exact factor, auto grid+phase |
| cell color | alpha-weighted sRGB mean | linear-light mean, center, median, majority, Weber |
| palette | sRGB K-means | K-means++, MedianCut, OKLab mapping, custom |
| alpha | threshold 10 → binary | configurable binary, coverage |
| outline | 4/8-direction fixed color | line-aware, selout |
| dither | none | Bayer 2×2/4×4 static-only |
| review | zoom modal | 1×/2× A/B + animation loop |

한 번에 여러 축을 바꾸지 않는다. 각 실험은 동일 geometry와 palette를 고정한 ablation을 포함하고, 개선이 확인된 축만 다음 엔지니어링 명세로 승격한다.
