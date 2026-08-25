# GitHub 업로드 및 선택적 배포

## 원칙

이 프로젝트는 GitHub Actions나 다른 원격 CI를 테스트 수단으로 사용하지 않는다. 코드 변경 후 로컬에서 직접 검증하고 통과한 커밋만 GitHub에 push한다.

```bash
npm install
npm run verify
git status
git add -A
git commit -m "<message>"
git push
```

외부 패키지를 설치할 수 없는 제한된 환경에서는 최소한 다음 검증을 실행한다.

```bash
npm run check:repo
```

## GitHub push

```bash
git remote set-url origin https://github.com/yhm8029/parkpick-seoul.git
git push -u origin main
```

## 웹 배포

웹앱 배포는 코드 테스트와 별개다. 필요할 때 Vercel 등 Next.js 호환 호스팅에 저장소를 연결할 수 있지만, 배포 서비스가 테스트를 대신하도록 구성하지 않는다.

배포 환경에는 `.env.example`의 값을 등록한다.

- `SEOUL_OPEN_API_KEY`
- `KAKAO_REST_API_KEY`
- `KAKAO_MOBILITY_REST_API_KEY`
- `NEXT_PUBLIC_KAKAO_MAP_JAVASCRIPT_KEY`
- `NEXT_PUBLIC_KAKAO_JAVASCRIPT_KEY`
- `NEXT_PUBLIC_NAVER_MAP_NCP_KEY_ID`
- `NEXT_PUBLIC_NAVER_APP_NAME`
- `NEXT_PUBLIC_SITE_URL`
- `NEXT_PUBLIC_GITHUB_REPO_URL`

Kakao Developers와 NAVER Cloud Maps 콘솔에는 `localhost`와 실제 HTTPS 배포 도메인을 등록한다. 모바일에서 GPS, 카카오내비, 네이버지도 앱 호출도 실제 기기로 확인한다.
