# Pixelate Studio 항목별 구현 프로토콜

## 1. 작업 경계

- 한 작업에서는 대시보드의 항목 ID 하나만 구현한다.
- 다른 항목에 필요한 구조 변경이 발견되면 코드를 확장하지 않고 현재 명세의 `중단·상향 조건`에 기록한다.
- 기존 `square`, `preserve-sheet`, `original` 모드의 저장 설정, 결과 JSON, PNG, 프레임 경계 동작을 유지한다.
- 실험 기능은 명세의 품질 게이트를 통과하기 전까지 기본값, 일반 preset, 자동 선택 경로에 넣지 않는다.

## 2. 구현 시작 전 절차

1. `AGENTS.md`, 이 문서, 대상 항목 명세, `pixelization-research-spec.md`, 관련 연구 노트를 읽는다.
2. `git status --short`로 사용자 변경을 확인하고 무관한 변경을 보존한다.
3. 대상 명세에 적힌 현재 함수와 테스트를 실제 코드에서 다시 확인한다.
4. 변경 예상 파일, 사용자에게 보이는 변화, 가장 가능성 높은 회귀를 commentary로 짧게 밝힌다.
5. 대시보드의 해당 구현 상태만 `IN_PROGRESS`로 변경한다.

## 3. 공통 불변조건

- 입력 이미지가 브라우저 밖으로 전송되지 않아야 한다. `fetch`, XHR, WebSocket, beacon을 추가하지 않는다.
- 동일한 입력 바이트와 설정은 동일한 RGBA 결과·팔레트 순서·JSON을 만들어야 한다. 시간, 랜덤 시드, 파일 시스템 순서에 의존하지 않는다.
- 업로드 제한, 출력 픽셀 제한, 팔레트 비교 제한, IndexedDB opt-in을 약화하지 않는다.
- 사용자 파일명은 기존 `sanitizeDownloadFilename`을 거친다.
- 투명 픽셀의 숨은 RGB가 팔레트나 격자 분석을 오염시키지 않도록 명세의 alpha 조건을 지킨다.
- 시트 처리에서는 정리·외곽선·격자·dither가 프레임 경계를 넘어가면 안 된다.
- 새 컨트롤은 label, 키보드 접근, focus 상태, disabled 상태, `aria-live` 오류 전달을 갖는다.
- 외부 프로젝트 코드는 라이선스와 프로젝트 적합성을 확인하지 않은 채 복사하지 않는다. GRID-001과 EDGE-001은 연구 아이디어를 독립 구현한다.

## 4. CSP와 로컬 자산

`pixelate_studio.html`의 인라인 JavaScript가 한 글자라도 바뀌면 다음 세 위치의 SHA-256 CSP 해시를 같은 값으로 갱신한다.

1. `pixelate_studio.html` meta CSP
2. `SECURITY.md`
3. `vercel.json`

새 JavaScript·WASM·폰트는 런타임 CDN을 쓰지 않고 로컬에 고정한다. 외부 라이브러리가 정말 필요하면 버전, 라이선스, 해시, 번들 크기와 대체 불가능성을 먼저 명세 검토에 올린다.

## 5. 설정·결과 호환 규칙

- 기존 IndexedDB 로그의 flat settings를 `normalizeSettings` 경로로 계속 읽는다.
- 새 설정 필드는 누락 시 현재 동작과 같은 기본값을 사용한다.
- 새 결과 JSON 필드는 additive하게 추가한다. 기존 `width`, `height`, `palette`, `grid`, `outline`, `processing`의 의미를 바꾸지 않는다.
- 기존 모드의 PNG 파일명은 유지한다. 새 파생 산출물만 구분 suffix를 쓴다.
- 지원하지 않는 미래 설정 버전은 부분 적용하지 않고 명확한 오류를 표시한다.

## 6. 공통 테스트 게이트

모든 항목에서 최소한 다음을 실행한다.

```sh
node scripts/security-check.mjs
node scripts/preserve-sheet-check.mjs
git diff --check
```

대상 명세의 전용 검사도 추가한다. 순수 함수는 기존 `vm` 함수 추출 방식 또는 QLT-001 하네스에서 직접 검증한다. UI 변경은 정적 문자열 검사만으로 완료 처리하지 않고 실제 로컬 HTTP 환경에서 데스크톱·620px 이하 모바일·키보드 동작을 확인한다.

## 7. 증거와 완료

- 자동 검사: 명령, exit code, 핵심 출력
- 시각 검사: 입력 fixture, 설정, 1×/2×/8× 캡처, 필요한 경우 애니메이션 기록
- 결정성: 최소 2회 결과 SHA-256 일치
- 성능 관련 항목: 입력 크기, 브라우저, cold/warm 시간, long task, peak memory
- 완료 후 항목 명세와 대시보드에 증거 링크를 기록하고 구현·QA를 모두 `DONE`으로 바꾼다.

## 8. 모델 배정 원칙

[공식 OpenAI 모델 가이드](https://developers.openai.com/api/docs/guides/latest-model)는 Sol을 복잡한 전문 작업·코딩, Luna를 효율적인 대량 작업에 권장한다.

- `Luna xhigh`: 기존 패턴을 따르는 UI, 설정, 내보내기, 결정적인 소규모 알고리즘
- `Luna xhigh + Sol xhigh 검토`: Luna로 구현 가능하지만 상태 전이·알파·시간축 회귀 위험이 큰 항목
- `Sol xhigh`: 새 영상 알고리즘, 품질 평가 체계, 지각 색공간, Worker/WASM
- `Sol max`: GRID-001 또는 PAL-002가 xhigh에서도 실패 원인을 분리하지 못하거나 상충하는 품질 증거를 해석해야 할 때만 사용

모델을 올리는 것은 수용 기준을 낮추는 대안이 아니다. 동일한 fixture와 테스트를 유지한다.

