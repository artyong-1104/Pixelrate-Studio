# 최종 검증 — 2026-09-06

현재 소스의 항목별 검증과 전체 자동 검사 **37/37 PASS**. [최종 보고서·증거·한계](../completion-20260906/README.md). 아래 NEEDS_REVIEW·차단·과거 완료 기록은 진행 이력이며 현재 판정에 우선하지 않는다.

---

# 2026-09-06 재검증

현재 소스의 PNG 블록·ZIP entry·반복 결정성·재업로드·출력 제한·desktop/mobile 증거 및 fail-closed gate PASS. [현재 전체 검증 및 제약](../completion-20260906/README.md). 아래 과거 기록은 해당 날짜의 스냅샷이다.

---

# OUT-001 현재 소스 결속 검증 증거

검증일: 2026-08-30 KST

최종 판정: **NEEDS_REVIEW**

OUT-001의 기존 두 blocker는 해소됐다. 실제 브라우저에서 8× checkbox의 Space off→on 토글을 측정했고, 1024×1024 결과의 8× checkbox·result button disabled·경고·ZIP 제외를 확인했다. OUT-001 fail-closed evidence gate는 PASS했다. 다만 OUT 운영 HTML 변경으로 범위 밖 GEO-001·PERF-001의 이전 application hash 증거가 stale해져 전체 `scripts/*-check.mjs`는 31/33이다. 사용자가 지정한 OUT-only 범위에서 두 항목을 수정할 수 없으므로 전체 gate가 모두 PASS하기 전 최종 상태는 `NEEDS_REVIEW`로 유지한다.

## 1. 현재 소스 결속

| 항목 | 값 |
|---|---|
| git HEAD | `5e6e8b68696f7e0ef01d4ada8e1547b216fe2e17` |
| `pixelate_studio.html` SHA-256 | `d8887c31d5d50292541930fba9d18b11d05913990f2404bfb5ec345fde0a4db2` |
| localhost 제공 HTML SHA-256 | `d8887c31d5d50292541930fba9d18b11d05913990f2404bfb5ec345fde0a4db2` |
| `pixelate-worker.js` SHA-256 | `444db75f4ebf6a57c43e1dc1805fb70459831003d34998a89b4db690994665f0` |
| localhost 제공 Worker SHA-256 | `444db75f4ebf6a57c43e1dc1805fb70459831003d34998a89b4db690994665f0` |
| URL | `http://localhost:8000/pixelate_studio.html?qa=out001-final-20260830-v2` |
| 브라우저 | Codex In-app Browser, desktop 1280×720 / mobile override 390×844 |
| 구조화 측정 | [browser-qa.json](browser-qa.json) |

운영 HTML에 OUT-001 전용 Space activation과 결과 집합별 배율 사용 가능성 판정을 추가했다. Worker는 수정하지 않았다. 인라인 스크립트 변경에 맞춰 HTML·`SECURITY.md`·`vercel.json`의 CSP를 `sha256-v176zMa2qiKqsSlWLIV+Ntwx8RtrkqHbOo24NfdyY08=`로 동기화했다.

## 2. 자동 검사

| 명령 | exit code | 결과 |
|---|---:|---|
| `node scripts/out001-check.mjs` | 0 | 2×/4×/8× 크기·N×N RGBA 블록·smoothing off·invalid scale·single/mixed 한도·Space activation PASS |
| `node scripts/generate-out001-evidence.mjs` | 0 | native/2×/4×/8×/JSON 재생성 PASS |
| `node scripts/security-check.mjs` | 0 | CSP·local Worker·integrity·unsafe sink·network·입력 제한 PASS |
| `node scripts/preserve-sheet-check.mjs` | 0 | 기존 모드·exact-factor 회귀 PASS |
| `node scripts/visual-quality-check.mjs` | 0 | 12 fixture 및 2 current baseline PASS |
| `git diff --check` | 0 | 최초 자동 검사 시 PASS |
| `node scripts/out001-evidence-gate-check.mjs` | 0 | 실제 QA gate와 누락·변조·stale hash·FAIL status·false scenario 음성 테스트 PASS |

기존 생성 산출물의 native/2×/4×/8×/JSON SHA-256은 모두 그대로다. `summary.json`만 generator의 `generatedAt` 갱신으로 파일 SHA-256이 바뀌었으며, 내부 `deterministicSha256`은 `40e2a4a5ddce9be03e86c7b9226ef585f88911fdbe2d34225a29a4e8c5f9757d`로 유지됐다.

마지막 전체 `scripts/*-check.mjs` 실행은 33개 중 31개 PASS, 2개 FAIL이었다. OUT-001의 두 검사는 모두 PASS했다. 실패한 `geo001-evidence-gate-check.mjs`는 이전 git HEAD·HTML 해시, `perf001-evidence-gate-check.mjs`는 이전 HTML `d6277997…`에 결속된 브라우저 QA를 현재 HTML `d8887c31…`과 비교해 fail-closed로 중단했다. OUT-only 범위에 따라 GEO·PERF 증거·상태는 수정하지 않았다.

## 3. 실제 브라우저 QA

| 시나리오 | 결과 | 실제 측정 |
|---|---|---|
| 초기 disabled | PASS | 입력 전 `변환 실행` disabled, 확대 배율 미선택 |
| 미선택 호환 | PASS | 결과 버튼 `PNG`, `JSON`만 노출; ZIP은 native+JSON 2개; native SHA-256이 선택 실행과 동일 |
| desktop 1×/2×/8× | PASS | 96×168, 192×336, 768×1344; `PNG`, `2× PNG`, `8× PNG`, `JSON` 노출 |
| PNG 버튼·artifact | PASS | 현재 소스에서 native/2×/8× 버튼을 실제 클릭; 결속 artifact는 `sips`·PNG scanline decoder로 재검증 |
| 색 수·block | PASS | 세 파일 모두 16색; 2×/8× 모든 RGBA block 균일성 100% |
| ZIP 버튼·artifact | PASS | 현재 소스에서 ZIP 버튼을 실제 클릭; 결속 ZIP은 native, 2×, 8×, JSON 1개이며 2회 entry 순서·content SHA-256 동일 |
| native·8× 재업로드 | PASS | 앱이 96×168과 768×1344로 다시 인식; 디코더 기반 동일 색 수·block 확인 |
| 390px 모바일 | PASS | document scroll width 382px, 수평 overflow 없음, 네 결과 버튼 모두 75px로 표시 |
| 콘솔 | PASS | error 0, warning 0 |
| 키보드 checkbox | PASS | `exportScale8x` focus 후 Space로 checked `true→false→true` 실제 토글 |
| 제한 초과 경고·ZIP 제외 | PASS | 1024×1024 native의 8×=8192×8192에서 다운로드 전 경고 노출; 디코딩한 증거 ZIP에 native+JSON만 존재 |
| 제한 초과 checkbox disabled | PASS | `exportScale8x.checked=true`, `disabled=true`, `aria-describedby=exportScaleWarning`; result-card `8× PNG`도 disabled |

## 4. 브라우저 산출물과 결정성

| 산출물 | 규격 | run 1 SHA-256 | run 2 SHA-256 |
|---|---:|---|---|
| native PNG | 96×168 | `8d083346eb1873d92b0d2c8d8d562e584cb9038ce46410a2b730f6af3fe67bbd` | 동일 |
| 2× PNG | 192×336 | `fa83af87903a78d7e35472349d49b65a0868e0ad748c9e8e388072515b907710` | 동일 |
| 8× PNG | 768×1344 | `6c9b9859033c03c4f2bd0cfa2e71da04fcfb89932f9a9fecee79b6cc34c43331` | 동일 |
| 정상 ZIP | 4 entries | archive `79eea8ce…` | archive `7b656c64…`; entry content hashes는 모두 동일 |

ZIP 컨테이너 SHA-256은 JSZip entry timestamp 때문에 실행마다 다르다. 명세의 결정성 검사는 ZIP entry 순서와 각 PNG·JSON content SHA-256으로 평가했다.

- [browser-native-run1.png](browser-native-run1.png), [browser-native-run2.png](browser-native-run2.png)
- [browser-2x-run1.png](browser-2x-run1.png), [browser-2x-run2.png](browser-2x-run2.png)
- [browser-8x-run1.png](browser-8x-run1.png), [browser-8x-run2.png](browser-8x-run2.png)
- [browser-normal-run1.zip](browser-normal-run1.zip), [browser-normal-run2.zip](browser-normal-run2.zip)
- [browser-none-native.png](browser-none-native.png), [browser-none.zip](browser-none.zip)
- [browser-limit.zip](browser-limit.zip)

## 5. 캡처 무결성

모든 캡처는 JPEG magic byte와 EOI를 확인한 뒤 macOS `sips`로 실제 디코딩했다. 선언값과 파일 SHA-256·치수가 일치해야 gate를 통과한다.

| 캡처 | 치수 | SHA-256 |
|---|---:|---|
| [desktop outputs](browser-desktop-outputs.jpg) | 1272×716 | `1762a0dc1855768fd136e261dcd790a87072a0d758ffbc14366c44393f14ad61` |
| [mobile controls](browser-mobile-390px.jpg) | 382×827 | `2c2bd61e3c08750ab8883cd1987a0a6a724a111958ff724170d6f4c03556200f` |
| [mobile results](browser-mobile-390px-results.jpg) | 382×827 | `9e1fa070a234f23e3d35948fb0ab3c29c457ead3e2b16c28af60706f71e5652e` |
| [limit disabled](browser-limit-disabled.jpg) | 1272×716 | `1145713e594afa74fe49510957a500f236a89208c0598a51c706dbd753c3661b` |

## 6. Fail-closed gate

[`scripts/out001-evidence-gate-check.mjs`](../../../scripts/out001-evidence-gate-check.mjs)는 다음을 현재 파일에서 다시 계산한다.

- HTML·served HTML·Worker·served Worker SHA-256과 git HEAD
- 필수 시나리오 `pass === true`
- JPEG 파일 존재·magic byte·`sips` 디코딩·치수·SHA-256
- 브라우저 PNG의 `sips` 디코딩, PNG scanline 복원, 색 수, RGBA 2×/8× block 100%
- 2회 PNG SHA-256과 ZIP entry/content SHA-256 결정성
- 미선택 ZIP 및 제한 초과 ZIP의 정확한 entry 목록

음성 테스트는 누락 캡처, 변조 캡처, 이전 HTML 해시, `status: FAIL`, 필수 시나리오 `false`가 모두 fail-closed인지 확인해 PASS했다. 실제 `browser-qa.json`도 현재 HTML·Worker·HEAD·캡처·PNG·ZIP을 전부 통과해 exit 0이다.

## 7. 남은 조치와 판정

1. GEO-001 브라우저 증거를 현재 HTML `d8887c31…`과 현재 HEAD에 재결속해 `geo001-evidence-gate-check.mjs`를 PASS로 복구한다.
2. PERF-001 브라우저 증거를 현재 HTML `d8887c31…`에 재결속해 `perf001-evidence-gate-check.mjs`를 PASS로 복구한다.

OUT-001 자체의 구현·실제 브라우저 QA·fail-closed gate는 모두 PASS했다. 다만 전체 gate 33/33이 되기 전이고 위 두 조치는 사용자가 제한한 OUT-only 범위 밖이므로 최종 상태는 **NEEDS_REVIEW**다.
