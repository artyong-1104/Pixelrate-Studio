# PAL-002 구현 전 원문 확인 기록

확인일: 2026-08-25 (KST)

## 원문과 직접 확인 범위

- Source 02 원문 `AI로 픽셀 스프라이트 만들기 나도 공유`에 HTTP 200으로 접근해 본문을 확인했다. 게시자는 팔레트를 시퀀스 전체에서 한 번만 뽑고 격자 원점을 고정하며 디더링을 끄는 것이 시간축 흔들림을 줄였다고 서술한다. 또한 팔레트 양자화만으로 정지 화질이 개선되지는 않았고, 넓은 흰 의상이 팔레트 슬롯을 독식했다고 기록한다.
- 연결 저장소 `DevelopmentDummy/anime-to-sprite`의 GitHub repository metadata를 확인했다. 2026-08-25 조회에서 GitHub API의 `license` 값은 `null`이었다. 따라서 구현 코드는 복사하지 않고 명세에 고정된 알고리즘을 독립 구현한다.
- Björn Ottosson의 OKLab 원문에서 sRGB/linear RGB와 OKLab 사이의 고정 행렬 상수를 확인했다. PAL-002는 해당 표준 변환을 순수 함수로 작성하고 known-value·round-trip 테스트로 고정한다.

## 이 코드베이스에 적용하는 판단

- 기존 `kmeans-srgb + pixel`은 결과 hash·팔레트 index 호환 기준선이므로 함수와 입력 순서를 바꾸지 않는다.
- `kmeans-oklab`, `median-cut`, `image-balanced`, `reference`는 `실험 기능 표시` 아래에서만 선택할 수 있다. 채택 임계값을 통과한 OKLab 16색 공유 다중 프레임 조합만 별도 `oklab-animation-stable` opt-in preset으로 승격하며 기본값과 기존 preset은 바꾸지 않는다.
- OKLab 다중 프레임 mapping은 동일 치수의 직전 프레임 index가 새 최적 index보다 OKLab squared-distance `0.00025` 이내로만 불리할 때 직전 index를 유지한다. 이 임계값은 고정 fixture 재평가에서 temporal 악화를 10% 아래로 낮추면서 평균 오차 개선 5% 이상을 유지한 값이다.
- 정지 화질 우위를 가정하지 않는다. 평균·95%·최대 OKLab error, slot usage, 결정성, 처리시간과 실제 크기 A/B를 별도로 기록한다.
- reference 파일이 누락되거나 같은 파일명이 둘 이상이면 추측해 대체하지 않고 실행 전에 오류로 중단한다.
