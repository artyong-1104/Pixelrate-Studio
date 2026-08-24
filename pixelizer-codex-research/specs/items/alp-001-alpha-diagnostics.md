# ALP-001 — 고채도 배경과 alpha edge/island 진단

## 1. 메타데이터

| 항목 | 값 |
|---|---|
| 명세 상태 | 완료 |
| 구현 상태 | DONE |
| QA 상태 | 완료 |
| 우선순위 | P1 |
| 근거 분류 | SOURCE-BACKED + ENGINEERING-INFERENCE |
| 구현 모델 | Luna xhigh |
| 선행 항목 | QLT-001 |
| 검증 증거 | [evidence/alp-001/README.md](../../evidence/alp-001/README.md) |

## 2. 목표와 사용자 완료 상태

사용자가 checker/white/black 외에 green/magenta/cyan/custom 배경을 빠르게 순환하고, 자동 수정 없이 부분 alpha와 작은 고립 전경 island를 찾아낸다.

## 3. 현재 문제와 근거

Source 04·07의 첨부에서 초록 배경이 흰 잔여 픽셀을 드러냈다. 현재 배경은 세 종류뿐이고 alpha 품질 통계가 없다. 결과 PNG는 binary라 진단은 최종 threshold 이전 logical alpha를 봐야 한다.

## 4. 포함·비포함 범위

포함: 6개 고정 배경+custom, 단축 순환, alpha diagnostics, island overlay, result JSON 통계.

비포함: island 자동 삭제, background removal, chroma key, alpha 정책 변경.

## 5. UI 명세

- 환경설정 배경: checker, white, black, green `#00ff00`, magenta `#ff00ff`, cyan `#00ffff`, custom color.
- preview/modal에 `배경 전환` 버튼과 단축키 `B`; text input에 focus 중이면 단축키 무시.
- 결과 metadata: `부분 알파 N · 작은 섬 M`.
- 모달 `알파 진단` toggle은 작은 island를 반투명 노랑 box/outline으로 표시한다.
- 진단이 0이면 `부분 알파 없음 · 고립 섬 없음`을 표시하며 toggle은 disabled다.

## 6. 진단 알고리즘

처리 pipeline에서 cleanup·outline 이전 logical alpha를 복사하지 않고 참조해 `computeAlphaDiagnostics(alpha,w,h,frameW?,frameH?)`를 호출한다.

- `partialAlphaCount`: 0 < alpha < 255인 픽셀 수
- foreground: alpha ≥ 현재 기준 threshold 10
- component: 4-neighbor connected components; sheet는 frame별로 독립
- largest component: 각 frame에서 면적 최대, 동률이면 가장 위·왼쪽 seed
- island: largest component가 아니면서 면적 ≤4인 component
- 반환: count, total pixels, 각 island bbox/area/frame index

outline이 만든 픽셀과 cleanup 이후 색 변화는 v1 진단에 포함하지 않는다. overlay 좌표는 native logical result에 맞춘다.

## 7. 설정·결과 인터페이스

- background preference는 기존처럼 localStorage `previewBg`에 enum을 저장한다.
- custom은 검증된 `#RRGGBB`를 `previewCustomBg`에 저장한다.
- processing settings JSON에는 포함하지 않는다.
- 결과 JSON additive:

```json
{
  "diagnostics": {
    "alpha": {
      "partialAlphaCount": 12,
      "islandCount": 2,
      "islandPixelCount": 3,
      "threshold": 10
    }
  }
}
```

island 좌표 목록은 session UI에만 두고 JSON에는 집계만 저장한다.

## 8. 호환·경계조건

- invalid localStorage 값은 checker로 fallback한다.
- custom invalid 값은 저장하지 않고 마지막 유효색을 유지한다.
- 빈 이미지, 전경 component 0 또는 1은 island 0이다.
- sheet frame 경계를 component가 넘지 않는다.
- outline-only result에서도 진단은 original foreground 기준이다.
- 로그 복원 JSON에 diagnostics가 없으면 통계를 `기록 없음`으로 표시하고 재계산하지 않는다.

## 9. 보안·성능·접근성

- color 값은 CSS property에 넣기 전에 strict hex 검증한다.
- component scan은 O(w×h), queue는 typed array와 head index를 써 shift 비용을 피한다.
- 배경만 바꿀 때 이미지 처리나 로그 저장을 다시 하지 않는다.
- 단축키·toggle 상태를 aria-label/pressed로 제공하고 색만으로 island를 표시하지 않는다.

## 10. 예상 변경과 순서

- `pixelate_studio.html`: background CSS/settings, diagnostic 함수, result metadata/overlay
- QLT alpha fixtures와 frame-boundary 검사
- README/CHANGELOG, CSP hash

순서: pure diagnostic tests → result metadata → backgrounds → overlay → keyboard/accessibility → docs/CSP.

## 11. 자동 테스트

- binary/partial alpha count
- largest component tie-break와 1~4px island
- 5px component는 island 아님
- sheet frame 경계 독립
- empty/one component
- invalid background fallback
- diagnostics 없는 legacy log fallback

## 12. 브라우저 수동 QA

흰 잔여 island fixture를 모든 배경에서 보고 B 순환 순서, custom color, overlay 위치, mobile/keyboard/focus 예외를 확인한다.

## 13. 수용 기준

- fixture component/partial 수 100% 정확
- 진단이 출력 PNG를 변경하지 않음
- frame boundary crossing 0
- 배경 순환이 processing 결과·hash를 변경하지 않음
- overlay가 1×·2×·8×에서 같은 논리 위치 표시

## 14. 완료 증거

초록/마젠타 배경 캡처, island overlay, component 검사, legacy fallback을 연결한다.

## 15. Luna xhigh 실행 지시문

> ALP-001만 구현한다. checker/white/black에 green/magenta/cyan/custom을 추가하고 B키로 순환한다. cleanup·outline 전 logical alpha에서 frame-local 4-neighbor component를 계산해 부분 alpha와 면적 4 이하 비최대 island를 진단한다. 자동 삭제나 alpha 정책 변경은 금지한다. aggregate만 JSON에 저장하고 overlay 좌표는 session-only로 둔다. 성능·접근성·legacy log·CSP와 회귀 검사를 완료한다.

## 16. 중단·상향 조건

- 실제 사용자 입력에서 4-neighbor/면적 4 정의가 과도한 false positive를 내면 threshold를 임의 변경하지 않고 QLT 보고서와 함께 명세 재검토한다.
- overlay가 source/result 좌표 metadata 부족으로 어긋나면 UX-001과 조정한다.

