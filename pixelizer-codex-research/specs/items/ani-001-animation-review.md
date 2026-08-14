# ANI-001 — 다중 파일·시트 프레임 애니메이션 검수

## 1. 메타데이터

| 항목 | 값 |
|---|---|
| 명세 상태 | 완료 |
| 구현 상태 | NOT_STARTED |
| QA 상태 | 미실행 |
| 우선순위 | P2 |
| 근거 분류 | SOURCE-BACKED + ENGINEERING-INFERENCE |
| 구현 모델 | Luna xhigh |
| 필수 검토 | Sol xhigh |
| 선행 항목 | UX-001 |

## 2. 목표와 사용자 완료 상태

여러 결과 파일 또는 한 sprite sheet의 프레임을 1×/2×/8×, 1~30fps로 반복 재생해 palette·grid·silhouette flicker를 확인한다.

## 3. 현재 문제와 근거

현재 결과는 각 카드와 정지 모달만 제공한다. Source 01·02는 시퀀스 전체 격자·팔레트 고정을 강조했고 Source 02는 정지 확대 이미지로 temporal shimmer를 판단할 수 없다고 보고했다.

## 4. 포함·비포함 범위

포함: multi-file 이름순 재생, sheet frame 분할, play/pause/step/loop/fps, policy status, fixed viewport.

비포함: GIF/비디오 decode·export, onion skin, anchor 자동 이동, frame 재정렬·삭제.

## 5. UI 명세

- 결과가 2개 이상이거나 processing에 frame geometry가 있으면 `애니메이션 검수` 버튼을 표시한다.
- modal controls: play/pause, 이전/다음, loop toggle 기본 on, fps number/range 1~30 기본 8, `현재/전체` label, 1×/2×/8×.
- keyboard: Space play/pause, Left/Right step. input focus 중 단축키 무시.
- status chips: `공유 팔레트`, `격자 잠금`, `디더링 꺼짐`; 정보가 없으면 `확인 불가`.
- 모든 frame은 최대 frame width/height viewport 중앙에 투명 padding으로 표시한다.

## 6. 프레임 구성·재생 알고리즘과 상태 기계

Multi-file:

- 업로드 시 정렬된 원래 filename 오름차순을 사용한다. 결과 카드의 현재 정렬과 검색은 무시한다.
- width/height가 달라도 largest viewport 중앙에 정렬한다.

Sheet:

- `processing.frameLogicalWidth/Height` 또는 preserve 출력의 `frameWidth/Height`를 사용한다.
- row-major로 자르고 frame count는 columns×rows다.
- geometry가 누락되거나 나누어떨어지지 않으면 sheet 재생 버튼을 제공하지 않는다.

상태: `closed → paused → playing → paused/closed`. `requestAnimationFrame`과 elapsed accumulator로 fps를 맞춘다. 한 tick에서 여러 frame을 건너뛰어도 마지막 계산 frame만 그린다. modal close/visibility hidden에서는 pause한다.

## 7. 설정·결과 인터페이스

fps, loop, current frame은 session-only다. 결과 JSON을 변경하지 않는다. policy chips는 기존 settings와 `processing` metadata를 읽는다. 로그 복원 시 확인 가능한 metadata만 표시한다.

## 8. 호환·경계조건

- 1 frame에서는 버튼 숨김.
- 40개 multi-file 상한과 sheet 최대 frame count 256을 적용한다. 초과 sheet는 재생 비활성화와 이유 표시.
- frame canvas는 필요할 때 draw하고 256개 canvas를 모두 복제하지 않는다.
- 재생 중 결과 재처리·삭제·로그 tab 전환 시 안전하게 pause/close한다.
- 같은 이름은 업로드 `addedIndex`로 tie-break한다.
- transparency와 nearest scaling을 유지한다.

## 9. 보안·성능·접근성

- timer leak와 background CPU를 막는다.
- 한 frame canvas와 viewport canvas만 유지한다.
- 모든 icon button에 한글 aria-label, pressed 상태, live frame label을 제공하되 매 frame 전체를 screen reader에 반복 알리지 않는다.
- `prefers-reduced-motion`이면 modal 초기 상태 paused다.

## 10. 예상 변경과 순서

- `pixelate_studio.html`: results button, animation modal/state, frame extraction, CSS/accessibility
- QLT temporal fixtures와 UI state 검사
- README/CHANGELOG, CSP hash

순서: frame list pure functions → state/timing tests → modal rendering → policy chips → reduced motion → manual QA → Sol review.

## 11. 자동 테스트

- filename/addedIndex 안정 정렬
- sheet row-major 좌표와 frame count
- invalid/missing geometry disable
- fps accumulator at 1/8/30fps
- loop on/off 마지막 frame behavior
- close/tab/visibility에서 pause·timer 해제
- max viewport center offset
- policy chip true/false/unknown

## 12. 브라우저 수동 QA

16-frame fixture를 1/8/30fps, 1×/2×/8×에서 본다. multi-file와 sheet, 다른 frame 크기, reduced-motion, mobile, keyboard, tab change를 확인한다. Sol xhigh가 frame ordering·timer cleanup·policy 오표시를 검토한다.

## 13. 수용 기준

- frame order·sheet cut 100% 정확
- 10분 loop 후 timer/canvas 증가 없음
- close/hidden에서 CPU 재생 중지
- nearest scaling과 transparency 유지
- keyboard/mobile/reduced-motion 통과
- 기존 result modal 회귀 없음

## 14. 완료 증거

multi-file/sheet loop 캡처, order fixture, 10분 메모리/timer 기록, Sol 검토 결과를 연결한다.

## 15. Luna xhigh 실행 지시문

> ANI-001만 구현한다. multi-file은 업로드 filename+addedIndex 순서, sheet는 processing frame geometry의 row-major 순서로 프레임을 구성한다. 한 viewport와 한 frame만 그리며 requestAnimationFrame accumulator로 1~30fps를 재생한다. close, visibility hidden, tab 이동에서 반드시 pause·cleanup한다. 1×/2×/8×, keyboard, reduced-motion, policy chips를 구현하고 GIF/export는 추가하지 않는다. 모든 테스트 후 Sol xhigh 검토로 넘긴다.

## 16. 중단·상향 조건

- frame geometry가 여러 처리 mode에서 일관된 metadata로 표현되지 않으면 임의 추론하지 말고 GEO-001/OUT-001 schema 수정 제안을 보고한다.
- long playback에서 leak나 timing drift를 재현하지만 해결하지 못하면 Sol xhigh로 즉시 상향한다.
