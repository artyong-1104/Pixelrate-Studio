# Pixelate Studio 외부 소스 연구 요약

조사일: 2026-08-13 (KST)

## 결론

8개 소스를 현재 코드와 대조한 결과, Pixelate Studio의 다음 개선 방향은 “필터를 더 많이 추가하는 것”보다 **논리 픽셀 격자를 정확히 정하고, 출력 배율·팔레트·시간축을 일관되게 유지하며, 실제 사용 크기에서 검증하는 것**이 우선이다.

가장 먼저 검토할 변화는 다음 네 가지다.

1. 종횡비를 유지하는 정확한 `1/n` 배율 또는 너비×높이 출력
2. 자동 픽셀 크기·격자 위상 감지와 수동 override
3. custom palette와 애니메이션 안전 정책(공유 팔레트, 고정 격자, dithering off)
4. native PNG + nearest 확대 PNG 이중 출력과 1×/2× 실제 크기, 원본/결과 A/B, 프레임 루프 미리보기

OKLab, MedianCut, Weber 가중 축소, 라인 합성, selout, ordered dithering은 유망하지만 기본 알고리즘을 바로 교체할 근거는 부족하다. 고정 코퍼스에서 기존 Box + sRGB K-means와 독립적으로 비교해야 한다. 자동 배경 제거, 범용 크로마 키, 노드 그래프, 비디오 입력, AI 생성·학습은 현재 범위에서 보류한다.

## 현재 구현 기준선

현재 `pixelate_studio.html`의 실제 처리 경로는 다음과 같다.

- `boxDownscale`: 정사각 목표 크기에 Nearest 또는 알파 가중 Box 축소
- `preserveSheetDownscale`: 프레임마다 top-left에서 시작하는 1/2/4/8 블록 평균 후 원래 시트 크기로 nearest 방식 재확대
- 두 평균 축소 경로 모두 감마 인코딩된 sRGB 채널 값을 직접 평균하며 linear-light 변환은 하지 않음
- `kmeans`: 최대 50,000개 샘플, sRGB 유클리드 거리, 입력 순서 기반 결정적 초기 중심, 10회 반복
- 여러 파일의 shared palette 및 한 장의 시트 전체 팔레트
- `alpha >= 10`인 픽셀만 남기고 최종 RGBA 출력은 255/0으로 이진화
- 고립 픽셀 색 교체, 4/8방향 외곽선, 프레임 경계 격리
- 1~24× 결과 모달과 회색 격자/흰색/검은색 배경
- PNG/픽셀-grid JSON/ZIP, 선택적 IndexedDB 작업 기록

현재 없는 것은 자동 격자 크기·오프셋 감지, 비정사각 비율 보존 축소, custom palette, dithering, 반투명 보존 정책, 원본/결과 비교, 애니메이션 재생, 휴대 가능한 설정 JSON이다. 기존 회귀 검사는 레이아웃·입력 검증·블록·알파 평균·프레임 경계를 확인하지만 시각 품질이나 시간축 안정성을 측정하지 않는다.

## 소스 간 종합

### 1. 픽셀 셀 형성 및 정렬

Source 01·04·07은 생성 파이프라인에서 사용한 정수 확대 배율을 정확히 되돌리는 방식을 쓴다. Source 03의 Perfect Pixel과 Source 05의 Pixel Snapper는 알려지지 않은 격자를 영상 주기와 경계 투영으로 추정한다. 둘은 경쟁 관계가 아니라 입력 지식에 따른 두 경로다.

- 배율을 아는 입력: 정확한 factor와 frame-local origin을 사용
- 배율을 모르는 “픽셀풍” 입력: grid size/phase를 자동 추정하고 confidence와 수동 override 제공
- 애니메이션/시트: 감지 결과를 프레임마다 바꾸지 않고 전체 작업에 lock

현재 preserve-sheet는 규칙적인 고정 격자에는 적합하지만 흐트러진 셀 경계를 복구하지 못한다. square 모드는 출력 종횡비를 보존하지 않는다.

### 2. 대표색 선택과 세부 보존

현재 Box 평균은 작은 고대비 특징을 평균에 일부 남기지만 경계를 흐릴 수 있다. Source 05의 최빈색은 셀의 큰 영역을 선명하게 만들 수 있고, Source 02는 같은 접근이 눈·입·하이라이트를 지웠다고 보고한다. Source 03은 center/median/majority를 모두 노출한다.

따라서 대표색은 하나의 “정답”이 아니다. 최소한 average, center, median, majority를 같은 감지 격자에서 비교해야 한다. 세부 보존형 후보는 Source 02의 Weber 대비 가중과 라인 커버리지 합성이지만, 외곽선이 없는 사진·저대비 소재·텍스처에서 부작용을 확인해야 한다.

어느 조사 소스도 sRGB 채널 평균과 linear-light 평균을 통제 비교하지 않았다. linear-light 평균은 물리적 혼합에는 타당한 후보지만 픽셀아트의 의도적인 색 선택과는 다를 수 있으므로, 기존 sRGB 평균을 오류로 단정하지 않고 같은 cell cut에서 독립 A/B한다.

### 3. 팔레트와 색상 양자화

Source 02·04·05·06·07 모두 제한된 팔레트의 중요성을 보여 주지만 목적은 다르다.

- 정지 이미지의 “품질 향상”은 보장되지 않는다.
- 에셋 세트와 애니메이션의 색 일관성에는 공유 팔레트가 유효하다.
- 고정 custom palette는 스타일 통일에 유용하지만 입력에 필요한 색이 없으면 큰 색 이동이 생긴다.
- 넓은 배경/의상이 자동 팔레트 슬롯을 독식할 수 있다.
- Source 07의 확인 가능한 최종 PNG 3개는 96×168, binary alpha, 172~203 고유색이었다. 이 사례는 정수 격자와 무디더의 근거이지 16색 기본값의 근거가 아니다.

현재 shared palette는 유지해야 한다. 다음 단계는 custom palette import와 팔레트 preview이며, sRGB K-means → OKLab K-means/MedianCut 교체는 A/B 결과 뒤 결정한다. 크기가 큰 이미지가 샘플을 더 많이 제공하는 현 방식과 이미지별 균등 가중, 지정 reference palette도 비교한다.

### 4. Dithering

Source 05는 기존 dithering 보존을 제품 장점으로 내세우고, Source 06은 2×2/4×4 ordered dithering과 강도 조절을 제공한다. 반대로 Source 02는 애니메이션의 temporal shimmer를 막기 위해 dithering을 끈다.

두 주장은 직접 모순이라기보다 사용 목적이 다르다.

- 입력에 이미 있는 규칙적 dithering을 격자 복구가 불필요하게 지우지 않는 것
- 팔레트 축소 과정에서 새 dithering을 생성하는 것

후자는 정지 이미지용 선택 옵션으로만 실험하고 기본값은 off로 둔다. 애니메이션 프리셋에서는 off를 강제하거나 강한 경고를 표시한다.

### 5. 알파와 배경

Source 02·07은 투명화가 픽셀화 이전의 중요한 실패 지점임을 보여 준다. 그러나 배경 제거를 Pixelate Studio에 바로 넣기보다 현재 알파 처리를 먼저 명확히 해야 한다.

현재 출력은 부분 알파를 보존하지 않는다. 픽셀 스프라이트에는 binary alpha가 적합할 수 있지만, 임계값 10은 평균 알파의 4% 수준이라 얇은 fringe를 완전 불투명하게 만들 수 있다. `binary sprite`, `coverage/preserve alpha`, `matte cleanup`을 분리한 실험이 필요하다. 크로마 키는 입력 색상과 경계 언믹싱까지 포함하는 독립 기능으로 보류한다.

Source 04·07의 첨부는 초록처럼 강한 진단 배경에서 흰 잔여 픽셀이 쉽게 드러나는 모습을 보여 준다. checker/white/black 외에 green/magenta/cyan과 사용자 색을 빠르게 순환하고, 비이진 알파와 가장 큰 전경 밖의 작은 불투명 island를 세는 QA는 배경 제거 자체보다 작고 안전한 개선이다.

### 6. UX와 워크플로

Source 02는 실제 사용 크기에서 판정해야 한다고 강조한다. Source 06은 프리셋·설정 JSON·배치·비디오를 제공한다. Source 07은 배경색을 바꿔 노이즈를 찾는다.

현재 앱은 단순 배치와 배경 전환은 이미 갖고 있다. 가장 작은 고효율 변화는 1×/2× quick view, original/result compare, animation loop, 설정 JSON import/export다. 전체 노드 그래프는 현 고정 파이프라인의 이해 가능성과 충돌하므로 후순위다.

### 7. 성능과 결정성

Source 05의 공개 구현은 Rust CLI에서 배치를 병렬화하고 Web에서 WASM을 제공한다. Source 06은 고성능 GPU 없이 동작한다고 설명한다. 이는 GPU가 필수라는 근거가 아니라 CPU 후처리가 충분히 실용적이라는 제품 사례다.

현재 앱은 main thread JavaScript이므로 먼저 실측한다. 새 grid detector나 여러 후보 A/B가 UI를 막으면 Web Worker로 옮기고, 프로파일링에서 병목이 확인된 경우에만 WASM을 평가한다. 모든 자동 감지·K-means·dithering은 동일 입력/설정에서 동일 결과를 내야 한다.

## 권장 적용 순서

| 순서 | 제안 | 근거 | 기본 정책 |
|---|---|---|---|
| 0 | 시각 품질·시간축 테스트 코퍼스와 비교 도구 | 모든 소스가 예시 의존; 현재 품질 테스트 부재 | 구현 전 기준선 저장 |
| 1 | 비율 보존 factor/native-size 출력 | Source 01, 02, 04, 06, 07 | 기존 square/preserve-sheet 유지 |
| 2 | native + nearest 확대 이중 출력, 1×/2×, A/B, animation preview | Source 02, 04, 07 | native는 원본, 확대본은 파생물로 명시 |
| 3 | grid size/phase 자동 감지 + 수동 override + lock | Source 01, 03, 05 | 낮은 confidence면 자동 적용 금지 |
| 4 | custom palette + preview + 설정 JSON | Source 05, 06 | shared/no-dither animation preset |
| 5 | alpha policy, 고채도 배경, edge/island diagnostics | Source 02, 04, 07 | 진단과 자동 수정 분리 |
| 6 | representative color와 perceptual/image-balanced palette A/B | Source 02, 03, 05 | 기존 Box+sRGB를 기준선으로 유지 |
| 7 | Weber/line/selout, ordered dithering | Source 02, 06 | 실험 플래그, 기본 off |
| 보류 | 배경 제거, 크로마 키, node graph, video/GIF, AI generation | Source 01, 02, 06, 08 | 별도 제품 결정 필요 |

## High-confidence findings

- 알려진 정수 배율을 정확히 되돌리거나 암시적 격자를 감지하는 것이 단순 square resize보다 목적에 맞다.
- 애니메이션에서는 팔레트와 격자 원점을 작업 전체에 고정해야 한다. 현재 shared palette는 유지할 가치가 높다.
- custom palette는 반복되는 비교 제품의 핵심 기능이지만, 자동 적용 전에 입력 색 범위와의 mismatch를 보여 줘야 한다.
- “적은 색이 항상 더 좋은 픽셀아트”라는 결론은 지지되지 않는다. Source 07의 실제 결과는 172~203색이며 목적에 맞는 색수 검증이 필요하다.
- 픽셀 예산이 부족하면 후처리로 없는 표정·실루엣 정보를 복원할 수 없다. 실제 사용 크기 preview가 필요하다.
- 자동 결과 뒤 수동 retouch가 남는다는 점을 제품 메시지와 QA에 반영해야 한다.
- 새 알고리즘은 프레임 경계, 투명 가장자리, thin lines, deterministic output을 기존보다 약화시키면 안 된다.

## Interesting but unverified ideas

- FFT가 Sobel 투영보다 흐트러진 AI 픽셀 격자를 안정적으로 찾는지
- OKLab K-means/MedianCut이 현재 sRGB K-means보다 작은 팔레트에서 실제로 선호되는지
- Weber 대비 가중과 라인 커버리지 합성이 다양한 화풍에서도 세부를 보존하는지
- linear-light alpha-weighted 평균이 현 sRGB 평균보다 경계와 작은 스프라이트에서 실제로 선호되는지
- selout이 기존 고정색 외곽선보다 복잡한 배경에서 항상 더 나은지
- 면적 대신 재질/영역별 짧은 color ramp를 배정하면 팔레트 독식을 줄일 수 있는지
- 가장 덜 쓰이는 hue를 자동 chroma key 후보로 제안하는 기능이 범용적인지
- 투명 스프라이트의 foot anchor 진단/정렬이 실제 사용자의 반복 작업을 줄이는지

## Contradictions between sources

- **Dithering:** Source 05·06은 보존/생성을 기능으로 보지만 Source 02는 animation shimmer 때문에 끈다. 정지/애니메이션 정책을 분리한다.
- **Majority sampling:** Source 05 구현은 cell 최빈값을 쓰지만 Source 02 실험에서는 작은 특징이 사라졌다. 선택 가능한 후보로만 둔다.
- **Palette quantization:** 여러 소스가 색 제한을 권하지만 Source 02에서는 팔레트만 적용한 정지 이미지가 개선되지 않았다. 일관성과 화질을 별도 목표로 측정한다.
- **고정 격자 vs 가변 격자:** Source 01·02는 시간축에서 고정 격자를 강조하지만 Source 03·05는 이미지 경계를 따라 cell cut을 조정한다. 정지 복구 모드와 시퀀스 lock 모드를 구분한다.
- **Alpha:** hard threshold는 sprite fringe 제거에 유용하지만 반투명 소재와 coverage를 잃는다. 사용 목적별 모드가 필요하다.

## Potential product features

- factor/width/height 기반 비율 보존 출력과 계산된 논리 해상도 표시
- native 논리 PNG와 2×/4×/8× nearest 확대 PNG 동시 내보내기
- AI grid auto-detect, confidence, overlay, manual pixel-size/offset override
- custom palette 입력, 팔레트 preview, mismatch 경고, shared palette preset
- 1×/2×/8× quick view, 원본/결과 split, animation playback
- portable settings JSON과 목적별 preset
- static-only ordered dithering 옵션과 animation 경고
- alpha mode, high-chroma background cycle, 투명 가장자리/island 진단 overlay
- 에셋 세트별 동일 크기·팔레트·격자 policy

## Potential algorithm changes

- alpha-aware exact factor area downscale와 native logical output
- quantized Sobel profile 기반 grid period/phase detector; 필요 시 FFT 보조
- cell representative color를 average/center/median/majority로 분리
- average 모드 안에서 sRGB와 linear-light alpha-weighted 평균을 실험적으로 분리
- custom palette nearest mapping 및 선택적 OKLab distance
- sequence-global deterministic palette 추출
- 실험적 Weber/line-aware/selout stage
- ordered Bayer 2×2/4×4 dithering, static-only default
- binary/coverage alpha 정책 분리

## Experiments needed before implementation

1. 고정 fixture corpus를 만든다: gradient, hard edge, 1px/2px thin line, 반투명 edge, low contrast, high-frequency texture, 작은 sprite/icon, photographic input, 이미 정렬된 pixel art, 고의로 phase/size를 흔든 AI-pixel-style image, 8~32프레임 animation.
2. factor downscale가 non-square 입력과 sheet frame 경계를 정확히 유지하는지 확인한다.
3. grid detector는 known grid size/phase 오차, failure confidence, false-positive rate를 측정한다. grid가 없는 사진에는 “감지 실패”가 성공 동작이다.
4. sRGB average/linear-light average/center/median/majority/Weber를 동일 cell cuts에서 비교하고 thin feature survival, edge displacement, 경계 밝기 변화를 측정한다.
5. sRGB K-means, deterministic OKLab K-means, MedianCut, custom palette를 palette error와 사용자 blind preference로 비교한다.
6. 각 알고리즘을 단일 프레임뿐 아니라 sequence loop에서 보며 frame-to-frame palette/index/grid variance를 측정한다.
7. alpha fixture에서 silhouette topology, fringe count, 부분 알파 보존, outline crossing을 확인한다.
8. cold/warm runtime, peak memory, main-thread long task, 동일 입력 SHA-256을 기록한다.
9. 결과를 1×, 2×, 8×에서 각각 검토하되 최종 판정은 실제 게임 표시 크기에 가중한다.
