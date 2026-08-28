# DIT-001 — 정지 이미지용 Bayer ordered dithering

## 1. 메타데이터

| 항목 | 값 |
|---|---|
| 명세 상태 | 완료 |
| 구현 상태 | 완료 |
| QA 상태 | `DONE` — 자동·설정·보안·PAL-002 회귀, 경고 양방향 전이, 구조화된 1× 선호, 17장 브라우저 캡처·16프레임 증거와 독립 Sol xhigh 최종 재검토 통과 |
| 우선순위 | P3 |
| 근거 분류 | SOURCE-BACKED + EXPERIMENTAL |
| 구현 모델 | Luna xhigh |
| 필수 검토 | Sol xhigh |
| 선행 항목 | QLT-001, PAL-001, CFG-001 |
| 검증 증거 | [검사·보고서](../../evidence/dit-001/README.md), [품질 매트릭스](../../evidence/dit-001/quality-matrix.json), [브라우저 QA](../../evidence/dit-001/browser-qa.json), [세션 계측](../../evidence/dit-001/browser-session-measurements.json), [1× 선호 판정](../../evidence/dit-001/texture-preference-review.json), [Sol xhigh 최종 재검토](../../evidence/dit-001/sol-xhigh-independent-rereview-2026-08-27.md), [독립 검토 인계](../../evidence/dit-001/independent-review-handoff.md) |

## 2. 목표와 사용자 완료 상태

정지 이미지에서 제한 팔레트 gradient banding을 줄이기 위해 deterministic Bayer 2×2/4×4 dithering을 선택적으로 적용한다. 기본은 off이며 animation-safe preset은 항상 off다.

## 3. 현재 문제와 근거

Source 06은 2×2/4×4 ordered dithering과 strength를 제공한다. Source 02는 애니메이션에서 shimmer 때문에 dithering을 끈다. Source 05의 기존 dither 보존 주장과 새 dither 생성은 구분해야 한다.

## 4. 포함·비포함 범위

포함: off/Bayer2/Bayer4, strength 0~100, 고정 origin, 두 nearest palette 색 사이 deterministic 선택, animation 경고.

비포함: Floyd–Steinberg, blue noise, input dither detector, error diffusion, alpha dither, 기본 preset 활성화.

## 5. UI 명세

- palette accordion의 실험 영역에 `디더링`: `사용 안 함` 기본, `Bayer 2×2`, `Bayer 4×4`.
- enabled일 때 `강도` 0~100 기본 50.
- multi-file shared 또는 sheet/animation policy가 감지되면 `프레임에서 무늬가 흔들릴 수 있습니다. 패턴 원점은 고정됩니다.` 경고.
- animation-safe preset 적용 시 mode를 off로 바꾸고 diff에 표시한다.

## 6. 알고리즘

Bayer matrices:

```text
2×2 = [0,2;3,1]
4×4 = [0,8,2,10;12,4,14,6;3,11,1,9;15,7,13,5]
```

각 foreground logical pixel에서 현재 palette distance metric으로 가장 가까운 두 색 `c0,c1`을 찾는다. 원본 RGB를 두 색을 잇는 벡터에 투영해 `t`를 0..1 clamp한다. matrix threshold는 `(M+0.5)/(N*N)`. strength `s`는 `0.5 + (threshold-0.5)*(s/100)`으로 중립점 쪽에 보간한다. `t >= adjustedThreshold`면 c1, 아니면 c0. 두 색이 같거나 strength 0이면 nearest c0.

패턴 좌표는 최종 logical canvas의 `(x mod N,y mod N)`이며 multi-file와 모든 sheet frame에서 global `(0,0)`에 고정한다. frame-local 재시작을 하지 않는다. alpha와 transparent pixel은 변경하지 않는다.

## 7. 설정·결과 인터페이스

```json
{ "ditherMode": "off", "ditherStrength": 50 }
```

enum `off|bayer2|bayer4`. 결과 `processing.dither`에 mode, strength, origin `[0,0]`을 기록한다. palette mode unlimited에서는 control disabled이고 processing은 off다.

## 8. 실험 설계

- 기준선: nearest palette mapping, dither off
- 후보: Bayer2/4 × strength 25/50/75/100
- 고정 변수: geometry, palette, representative, alpha, cleanup off, outline off
- 지표: gradient band count, mapping error, flat-region variance, temporal changed-pixel ratio, 1× 선호
- 채택: static gradient banding 15% 이상 감소하고 sprite outline/alpha 침식 0, animation 기본 off
- 폐기: 1×에서 texture noise 선호가 낮거나 패턴 origin이 frame 간 흔들림

2026-08-26 실측 판정: 50% 후보는 Bayer2 `12.50%`, Bayer4 `13.75%`로 15% 밴딩 감소 임계값을 충족하지 못해 FAIL이다. Bayer2/4의 75%와 100% 후보만 정량 gate를 PASS했고, 구조화된 실제 크기 1× texture 검토에서도 네 후보가 모두 `ACCEPTABLE`을 받았다. 최종 `adoption`은 정량 gate와 1× 선호 gate를 동시에 통과한 75%·100% 후보로 제한한다. 선호 증거가 누락되거나 `REJECTED`이면 정량값과 관계없이 fail-closed다. PASS 후보도 기본값·기존 preset에는 편입하지 않고 실험 opt-in으로 유지한다.

## 9. 호환·경계조건

- off는 기존 palette index/PNG hash와 동일.
- palette 색이 1개면 항상 index0.
- 투영 denominator 0이면 c0.
- nearest two tie는 palette index 오름차순.
- cleanup은 dither 뒤 수행하면 pattern을 지울 수 있으므로 pipeline 순서는 `palette map+dither → cleanup`. 실험 보고서에 cleanup on/off를 별도 기록하되 채택 gate는 off.
- outline은 dither 이후 기존 방식으로 추가해 outline 색을 dither하지 않는다.

## 10. 보안·성능·접근성

- 픽셀당 palette 비교가 두 nearest를 찾는 선형 scan을 넘지 않는다.
- `MAX_COLOR_COMPARISONS` 계산에 두 candidate tracking을 반영한다.
- 실험 경고와 disabled 이유를 텍스트로 제공한다.

## 11. 예상 변경과 순서

- `pixelate_studio.html`: two-nearest helper, Bayer mapping, settings/preset/UI/result metadata
- QLT gradient/animation matrix와 전용 검사
- evidence; 일반 README 홍보는 채택 후

순서: matrix/two-nearest tests → mapping → static matrix → animation report → UI/settings → Sol review.

## 12. 자동 테스트

- matrix 값·좌표·origin
- strength0 baseline equality
- two-nearest tie와 zero vector
- 2×2/4×4 expected index pattern
- transparent/outline 불변
- multi-file/sheet 같은 global origin
- off hash 불변
- settings/preset round trip

## 13. 브라우저 수동 QA

gradient, flat sprite, outline, alpha edge를 1×/2×/8×에서 본다. texture 기준선과 각 채택 후보를 실제 크기 1×에서 비교한다. animation-16을 8/12fps로 보고 pattern shimmer와 fixed origin을 확인한다. Sol이 pipeline order와 temporal 결과를 검토한다.

2026-08-26 fresh localhost QA에서 기본 숨김/off, gradient 결과 메타데이터, clean pixel art·alpha edge·outline 1×/2×/8×, unlimited disabled, 비활성 factor frameMode 경고 미표시를 확인했다. `original↔preserve-sheet`, `factor whole↔sheet`, `grid whole↔sheet` 여섯 경고 전이도 즉시 갱신됐다. animation-safe preset off diff, 16프레임 8/12fps·8×, 390px 모바일 무가로오버플로, console error/warning 0도 통과했다. 17장 캡처는 실제 PNG 픽셀로 검증하며, 설정 JSON·동일 결과 asset·서로 다른 16개 애니메이션 frame asset의 SHA-256과 함께 `browser-qa.json`에 고정했다.

## 14. 수용 기준

off 기준선 불변, matrix exact, static 채택 지표 충족, alpha/outline 침식 0, animation preset off, 동일 실행 hash 일치.

## 15. 완료 증거

strength matrix contact sheet, banding/variance report, animation 기록, off hash, Sol review를 연결한다.

contact sheet·banding/variance·temporal·off hash, 경고 전이, 1× texture 판정, 1×/2×/8× 정적 캡처와 8/12fps·16프레임 애니메이션 증거를 연결했다. 2026-08-27 독립 Sol xhigh 최종 재검토도 `FINAL_VERDICT: PASS`를 받았고, 보고서 SHA-256이 `browser-qa.json`의 `requiredReview`와 일치한다. 생성기가 `status: DONE`, `independentSolReview: PASS`를 출력했으므로 완료 게이트를 충족했다. 리뷰가 기록한 Low 잔여 위험은 후보별 `REJECTED` 분기의 체크인 회귀 미포함과 native export 대신 UI 캡처를 result asset으로 사용하는 점이며, 현재 명세의 PASS를 뒤집지는 않는다.

## 16. Luna xhigh 실행 지시문

> DIT-001만 구현한다. 명세의 Bayer matrix, 두 nearest 색 투영, strength 수식, global origin을 그대로 구현한다. off/strength0은 기존 hash와 같아야 하고 alpha·outline은 dither하지 않는다. animation-safe preset은 off를 강제하며 후보는 실험 영역에만 둔다. static/animation QLT matrix와 settings/CSP 검사를 완료한 뒤 Sol xhigh에 pipeline·temporal 검토를 요청한다.

## 17. 중단·상향 조건

- palette distance metric이 PAL-002와 결합돼 결과 정의가 모호하면 baseline sRGB로 고정하고 별도 실험으로 넘긴다.
- cleanup과 dither 순서가 실사용에서 상충하면 임의 자동 전환을 만들지 않고 Sol 검토를 요청한다.
