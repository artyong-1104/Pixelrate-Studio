# Security

## 데이터 처리 범위

Pixelate Studio에는 서버 API, 로그인, 서버 데이터베이스가 없습니다. 이미지는 브라우저 메모리에서 처리됩니다. 사용자가 작업 기록 저장을 활성화한 경우에만 파일명, 설정, 결과 PNG Data URL이 같은 출처의 IndexedDB에 저장됩니다.

작업 기록은 암호화 저장소가 아닙니다. 공용 기기에서는 기록 저장을 활성화하지 말고, 사용 후 작업 로그 화면에서 기록을 삭제해야 합니다.

## 배포 요구사항

- 전용 출처와 HTTPS를 사용합니다. 다른 애플리케이션과 같은 출처에 배포하지 않습니다.
- `pixelate_studio.html`, `vendor/jszip.min.js`와 라이선스 파일을 함께 배포합니다.
- Vercel에서는 저장소의 `vercel.json`을 함께 배포해 루트 rewrite와 보안 헤더를 적용합니다.
- 배포 전에 `node scripts/security-check.mjs`를 실행합니다.
- HTML의 CSP는 기본 보호 장치입니다. 실제 서비스에서는 아래 정책을 HTTP 응답 헤더에도 적용합니다.

```text
Content-Security-Policy: default-src 'none'; script-src 'self' 'sha256-NNf+2ee/6GNI+Hecvpx3AXD3yYFIk4GhU4WCa7qA9ks='; style-src 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; manifest-src 'none'; media-src 'none'; worker-src 'none'
Referrer-Policy: no-referrer
X-Content-Type-Options: nosniff
Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Resource-Policy: same-origin
```

애플리케이션 JavaScript를 수정하면 CSP의 SHA-256 해시도 달라집니다. 보안 검사가 실패하면 새 해시를 계산해 HTML과 이 문서를 함께 갱신해야 합니다.

## 의도적인 제한

- PNG, JPEG, WebP, GIF, BMP, AVIF 래스터 이미지만 허용합니다.
- 파일당 20MB, 전체 80MB, 최대 40개로 제한합니다.
- 디코딩 후 이미지는 최대 4096×4096 픽셀로 제한합니다.
- 전체 디코딩 픽셀, 원본 크기 처리량, 팔레트 비교 연산량을 별도로 제한합니다.
- 실행 중 네트워크 연결 API 사용을 금지하며 CSP `connect-src 'none'`으로 차단합니다.

## 취약점 보고

취약점을 공개 이슈에 재현 데이터와 함께 올리면 민감한 정보가 노출될 수 있습니다. 저장소 소유자에게 비공개 채널로 먼저 보고하고, 수정이 배포되기 전에는 실제 사용자 데이터나 서비스에 대한 공격을 시도하지 마세요.
