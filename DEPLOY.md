# GitHub 공개 및 Vercel 배포

## 배포 구조

이 프로젝트는 GitHub Actions를 사용하지 않는다. GitHub 저장소를 Vercel에 직접 연결하고, Vercel의 Git 배포가 CI와 배포를 함께 담당한다.

```text
GitHub push / Pull Request
→ Vercel이 소스 가져오기
→ npm install
→ npm run vercel-build
   ├─ npm run lint
   ├─ npm run typecheck
   ├─ npm test
   └─ next build
→ 성공: Preview 또는 Production 배포
→ 실패: 배포 중단 및 Vercel 로그에서 오류 확인
```

`main` 브랜치는 Production, 그 외 브랜치와 Pull Request는 Preview 배포로 사용한다.

## 1. GitHub 업로드

웹에서 빈 공개 저장소를 생성했다면:

```bash
git remote add origin https://github.com/yhm8029/parkpick-seoul.git
git push -u origin main
```

현재 push-ready 패키지는 이미 `origin`이 설정되어 있으므로 다음 명령만 실행하면 된다.

```bash
git push -u origin main
```

## 2. Vercel 연결

1. Vercel 대시보드에서 **New Project** 선택
2. `yhm8029/parkpick-seoul` 저장소 Import
3. Framework Preset이 `Next.js`인지 확인
4. Build Command는 저장소의 `vercel.json`에 따라 `npm run vercel-build` 사용
5. Production Branch를 `main`으로 지정
6. 환경변수 등록 후 Deploy

한 번 연결하면 이후 GitHub push와 Pull Request마다 Vercel이 자동으로 검증·배포한다.

## 3. 환경변수

`.env.example`에 있는 다음 값을 Vercel Project Settings → Environment Variables에 등록한다.

- `SEOUL_OPEN_API_KEY`
- `KAKAO_REST_API_KEY`
- `KAKAO_MOBILITY_REST_API_KEY`
- `NEXT_PUBLIC_KAKAO_MAP_JAVASCRIPT_KEY`
- `NEXT_PUBLIC_KAKAO_JAVASCRIPT_KEY`
- `NEXT_PUBLIC_NAVER_MAP_NCP_KEY_ID`
- `NEXT_PUBLIC_NAVER_APP_NAME`
- `NEXT_PUBLIC_SITE_URL`
- `NEXT_PUBLIC_GITHUB_REPO_URL`

브라우저에서 사용하는 `NEXT_PUBLIC_*` 값은 Preview와 Production 환경에 모두 등록한다. 서버 전용 API 키는 클라이언트 코드에 직접 넣지 않는다.

## 4. 지도 콘솔 등록

1. Kakao Developers에 `localhost`와 Vercel Preview/Production 도메인 등록
2. NAVER Cloud Maps Application에 `localhost`와 실제 Web 서비스 URL 등록
3. `NEXT_PUBLIC_NAVER_APP_NAME`을 실제 HTTPS Production URL로 설정
4. 모바일에서 GPS, 카카오내비, 네이버지도 앱 호출 확인

Preview 도메인이 매번 달라지는 경우 개발용 도메인 정책을 각 지도 공급자 콘솔에서 확인하고, 최종 검증은 고정 Production 도메인에서 수행한다.

## 5. 로컬 검증

Vercel과 동일한 사전 검증:

```bash
npm install
npm run verify
npm run build
```

`npm run vercel-build`를 실행하면 검증과 빌드를 한 번에 수행한다.
