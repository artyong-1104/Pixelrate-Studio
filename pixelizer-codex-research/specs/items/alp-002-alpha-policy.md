# ALP-002 — Binary/Coverage alpha 정책 분리

## 1. 메타데이터

| 항목 | 값 |
|---|---|
| 명세 상태 | 완료 |
| 구현 상태 | 완료 |
| QA 상태 | `DONE` — 보완 자동 회귀·fresh localhost 브라우저 QA·decoder-backed 캡처 무결성·독립 Sol xhigh 최종 재검토 통과 |
| 우선순위 | P2 |
| 근거 분류 | SOURCE-BACKED + ENGINEERING-INFERENCE |
| 구현 모델 | Luna xhigh |
| 필수 검토 | Sol xhigh |
| 선행 항목 | QLT-001, CFG-001, ALP-001 |
| 검증 증거 | [검사·보고서](../../evidence/alp-002/README.md) |

## 2. 목표와 사용자 완료 상태

사용자가 현재와 같은 hard sprite alpha와 block coverage를 유지하는 partial alpha를 명시적으로 선택한다. 기본은 기존 `binary`, threshold 10으로 유지해 기존 PNG·grid를 바꾸지 않는다.

## 3. 현재 문제와 근거

현재 block alpha를 평균한 뒤 10 이상이면 최종 255로 만든다. UI는 이 사실을 설명하지 않는다. Source 02는 soft alpha와 binary가 입력에 따라 다른 실패를 보였고, Source 07 결과는 binary alpha였다.

## 4. 포함·비포함 범위

포함: binary/coverage mode, threshold 1~254, palette alpha weighting, coverage JSON alpha matrix, preview 설명.

비포함: chroma key, matte color unmix, threshold 자동 추천, alpha morphology, premultiplied export 포맷.

## 5. UI 명세

- 새 accordion `투명도 처리`:
  - `선명한 스프라이트 (0/255)` 기본
  - `픽셀 점유율 유지 (부분 투명도)`
  - threshold number/range 1~254, 기본 10, 두 mode 모두 표시
- 도움말: threshold 미만은 transparent; binary는 이상 값을 255, coverage는 원래 평균 alpha 유지.
- ALP-001 통계로 `현재 결과에는 부분 알파 N개가 있습니다.` preview를 표시한다.
- coverage 선택 시 `일부 엔진·팔레트 워크플로는 부분 투명도를 다르게 처리할 수 있습니다.` 경고.

## 6. 알고리즘

- palette/cleanup/grid foreground membership: `alpha >= threshold`.
- binary output: foreground alpha 255, background 0. 현재 기준선.
- coverage output: foreground는 logical/final alpha 1~255를 그대로 clamp·round, background 0.
- palette sampling은 coverage mode에서 RGB contribution과 sample weight에 alpha/255를 적용한다. binary mode는 기존 PNG·grid hash 호환을 위해 legacy 동일 가중치를 유지한다. 두 mode 모두 hidden RGB(alpha<threshold)는 제외한다.
- cleanup은 색 index만 바꾸고 alpha는 바꾸지 않는다.
- outline 새 픽셀은 alpha 255; 기존 content alpha는 유지한다.
- preserve-sheet expand와 nearest export는 alpha 값을 block 전체에 그대로 복제한다.

## 7. 설정·결과 인터페이스

```json
{ "alphaMode": "binary", "alphaThreshold": 10 }
```

결과 `processing.alpha`:

```json
{ "mode": "coverage", "threshold": 10 }
```

coverage mode에서만 결과 JSON root에 `alpha` 2차원 정수 배열을 추가한다. dimensions는 grid와 같고 값은 0~255다. binary에서는 JSON 용량·호환을 위해 생략한다.

## 8. 호환·경계조건

- legacy 설정은 binary/10.
- threshold 변경은 사용자가 명시한 경우에만 결과 hash 변경.
- original/square/preserve/factor/grid mode 모두 동일 정책.
- custom palette는 alpha 값을 palette 색에 넣지 않는다.
- coverage JSON이 저장 결과 dimension 상한을 넘지 않는지 기존 JSON/grid 한도와 함께 확인한다.
- 로그 복원 시 alpha matrix가 없어도 PNG canvas로 보기는 가능하다.

## 9. 보안·성능·접근성

- alpha matrix는 생성 전 `4 × width × height + row overhead`로 보수 추정한다. alpha matrix 16MB 또는 전체 결과 JSON 32MB를 넘으면 작업 로그 저장을 생략하고, PNG·JSON 개별/ZIP 다운로드는 계속 허용한다는 문구를 표시한다.
- mode 라디오와 threshold 상태를 label/description으로 연결한다.
- 색만으로 binary/coverage 차이를 설명하지 않는다.

## 10. 예상 변경과 순서

- `pixelate_studio.html`: alpha UI/settings, process membership/output, JSON/log
- QLT alpha fixtures와 전용 검사
- README/CHANGELOG, CSP hash

순서: pure output policy → binary hash test → coverage tests → settings → UI → JSON/log → manual QA → Sol review.

## 11. 자동 테스트

- alpha 0,9,10,127,255 at threshold10의 binary/coverage 예상값
- binary default 기존 PNG·JSON hash 동일
- cleanup alpha 불변, outline alpha255
- preserve/factor/nearest alpha block 균일
- coverage alpha matrix dimensions/value
- threshold 0,255,NaN 거부
- palette hidden RGB 제외
- legacy settings migration

## 12. 브라우저 수동 QA

alpha-edge fixture를 모든 mode와 배경에서 1×/8× 확인한다. outline·cleanup·sheet frame, settings export/import, 로그 복원, mobile/keyboard를 점검한다. Sol은 silhouette topology와 JSON 호환을 검토한다.

## 13. 수용 기준

- binary/10 기준선 hash 100% 동일
- coverage partial-alpha MAE가 binary보다 개선
- component/hole/frame boundary 회귀 없음
- hidden RGB palette 오염 0
- settings/log/JSON round trip 통과

## 14. 완료 증거

binary hash, coverage PNG/alpha JSON, topology report, settings round trip, Sol review를 연결한다.

## 15. Luna xhigh 실행 지시문

> ALP-002만 구현한다. 기본 binary threshold10의 PNG·grid hash를 절대 바꾸지 않는다. membership은 alpha>=threshold, coverage는 포함된 픽셀의 alpha를 유지하고 자동 팔레트 sample weight에 alpha/255를 적용하며, binary는 legacy 동일 가중치를 유지한다. cleanup은 색만 변경하고 outline 새 픽셀은 255로 둔다. coverage mode에만 grid와 같은 alpha matrix를 JSON에 추가한다. hidden RGB를 palette에서 제외하고 모든 scale mode·로그·settings·CSP·QA를 완료한 뒤 Sol xhigh에 topology와 호환 검토를 요청한다.

## 16. 중단·상향 조건

- binary 기준선 hash가 바뀌면 원인을 찾기 전 완료하지 않는다.
- coverage와 outline의 기대가 fixture별로 상충하면 임의 blend를 만들지 않고 Sol xhigh로 상향한다.
- JSON 크기 정책이 기존 저장 한도와 충돌하면 상위 명세 변경 승인을 요청한다.

## 17. 보완 구현·검증 기록 (2026-08-23 KST)

- coverage 자동·공유 팔레트는 alpha/255 가중 centroid를 사용하고, binary는 기존 동일 가중치와 12개 fixture baseline hash를 유지한다.
- PNG 렌더와 coverage JSON matrix가 `resolveOutputAlpha`·`buildCoverageAlphaMatrix` 운영 헬퍼를 공유한다. binary JSON은 root `alpha`를 생략한다.
- 최종 policy·threshold·outline·sheet expand 적용 후의 alpha로 diagnostics를 다시 계산해 `현재 결과` 수치와 canvas를 일치시킨다.
- 작업 로그는 alpha matrix 16MB, 전체 결과 JSON 32MB를 fail-closed 상한으로 검사한다. 초과 시 로그만 생략하고 다운로드 가능 상태를 안내한다.
- 자동 게이트: ALP-002 10/10, UI 운영 경로 wiring, visual-quality 12/12 및 binary baseline 2/2, settings, preserve-sheet, animation, CSP 검사를 통과했다.
- 증거 생성기는 브라우저 캡처 해시와 독립 Sol xhigh `RECOMMENDATION: PASS` 보고서를 확인하지 못하면 `DONE`을 생성하지 않는다.
- fresh localhost 브라우저 QA에서 binary/coverage threshold, original/square/factor/grid/preserve-sheet, outline, 1×/8×, settings round trip, IndexedDB coverage 결과 저장·복원, mobile 390×844, console 0건을 통과했다.
- 필수 캡처 3개와 로그 복원 캡처의 JPEG 구조·최소 크기·SHA-256을 검사하고 `sips` 또는 ImageMagick 실제 디코더 치수까지 대조해 증거 생성기가 `PASS`했다.
- 독립 Sol xhigh 최종 재검토가 `PASS`했고 증거 생성기의 `automated`, `browser`, `captures`, `logRestore`, `requiredReview` 게이트가 모두 참이며 `pending`은 비어 있다.

## 18. 검토 지적 보완·최종 판정 (2026-08-23 KST)

- 작업 로그 32MiB 상한은 각 결과가 아니라 `jsonData[]` 전체 UTF-8 JSON 배열 크기로 계산한다. 17MiB payload 두 개의 합계 35,651,615B는 `result-json-total`로 차단하며 PNG·JSON 다운로드는 계속 허용한다.
- PNG alpha와 coverage JSON matrix는 공통 `buildAlphaPolicyArtifacts` 결과를 사용한다. ring fixture에서 binary/coverage 모두 component 1·hole 1을 유지하고, coverage matrix=PNG alpha·legacy projection·결정성 해시를 검증했다.
- 결과 모달의 `배경 (B)`·`알파 진단`은 한 줄 텍스트 컨트롤로 표시된다. 1280×720에서 두 인접 영역 겹침이 없고 390×844에서 수평 overflow가 없다.
- JPEG 증거 gate는 SOF/SOS segment length·component selector·entropy stream·EOI를 검사하고 실제 이미지 디코더의 치수가 parser 결과와 같아야 통과한다. invalid SOF/SOS와 구조상 그럴듯하지만 디코딩되지 않는 payload를 포함한 음성 테스트가 모두 통과했다.
- [독립 Sol xhigh 최종 재검토](../../evidence/alp-002/sol-xhigh-rereview-2026-08-23.md)는 이전 네 지적과 추가 crafted-JPEG 우회가 모두 해소됐음을 확인해 `RECOMMENDATION: PASS`를 기록했다. 보고서 SHA-256은 `c71fad874c2f3394280330cfc7037636a99b9cbb757fcb91381b4a9340ef0d8f`다.
