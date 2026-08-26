# 배포 가이드

## 1. 요구사항

- Node.js 22 이상
- npm
- NAVER Cloud Platform 계정
- 선택: 서울 주차 포털 장애 시 대체 소스용 열린데이터광장 인증키
- 선택: Vercel 계정과 CLI 로그인

```powershell
npm ci
Copy-Item .env.example .env.local
```

실제 비밀값은 `.env.local` 또는 배포 플랫폼 Secret에만 저장합니다. `.env.local`은 Git 추적 대상이 아닙니다.

## 2. NAVER 애플리케이션 구성

두 종류의 애플리케이션을 구분합니다.

### Maps Application

활성화할 API:

- Dynamic Map
- Directions 5
- Geocoding

환경변수:

```dotenv
NEXT_PUBLIC_NAVER_MAP_NCP_KEY_ID=
NAVER_MAP_NCP_KEY_ID=
NAVER_MAP_NCP_CLIENT_SECRET=
```

Dynamic Map 허용 Web Service URL에 로컬과 운영 주소를 등록합니다.

```text
http://127.0.0.1:3000
http://localhost:3000
https://parkpick-seoul.vercel.app
```

### NAVER API HUB Application

`NAVER 검색 > 지역`을 활성화합니다.

```dotenv
NAVER_API_HUB_KEY_ID=
NAVER_API_HUB_KEY=
```

Maps 자격증명을 API HUB에 사용하거나 반대로 사용하면 인증 오류가 발생합니다.

## 3. 나머지 환경변수

```dotenv
SEOUL_OPEN_API_KEY=
NEXT_PUBLIC_NAVER_APP_NAME=http://127.0.0.1:3000
NEXT_PUBLIC_SITE_URL=http://127.0.0.1:3000
NEXT_PUBLIC_GITHUB_REPO_URL=https://github.com/yhm8029/parkpick-seoul
```

운영에서는 공개 URL을 사용합니다.

```dotenv
NEXT_PUBLIC_NAVER_APP_NAME=https://parkpick-seoul.vercel.app
NEXT_PUBLIC_SITE_URL=https://parkpick-seoul.vercel.app
```

TODAY / 30 DAYS 집계를 표시하려면 다음 서버 전용 값을 추가합니다. Vercel 배포에서는 `VERCEL_PROJECT_ID`가 자동 제공됩니다.

```dotenv
VERCEL_ANALYTICS_TOKEN=
VERCEL_ANALYTICS_TEAM_ID=
```

## 4. 로컬 실행

```powershell
npm run dev -- -H 127.0.0.1 -p 3000
```

GPS를 HTTPS 조건에서 확인해야 한다면 다음 명령을 사용할 수 있습니다.

```powershell
npm run dev:https
```

확인 주소:

```text
http://127.0.0.1:3000
http://127.0.0.1:3000/api/places/search?q=홍대입구역
```

장소 API가 `mode: "LIVE"`와 실제 역/시설 결과를 반환하는지 확인합니다.

## 5. Vercel 환경변수

저장소를 프로젝트에 연결한 뒤 각 값을 대화형으로 등록합니다. 명령행 기록에 실제 값을 직접 쓰지 않습니다.

```powershell
npx vercel link --yes
npx vercel env add SEOUL_OPEN_API_KEY production
npx vercel env add NEXT_PUBLIC_NAVER_MAP_NCP_KEY_ID production
npx vercel env add NAVER_MAP_NCP_KEY_ID production
npx vercel env add NAVER_MAP_NCP_CLIENT_SECRET production
npx vercel env add NAVER_API_HUB_KEY_ID production
npx vercel env add NAVER_API_HUB_KEY production
npx vercel env add NEXT_PUBLIC_NAVER_APP_NAME production
npx vercel env add NEXT_PUBLIC_SITE_URL production
```

분석 집계를 사용하는 경우에만 `VERCEL_ANALYTICS_TOKEN`, `VERCEL_ANALYTICS_TEAM_ID`를 추가합니다.

## 6. 검증과 production 배포

```powershell
npm run verify
npx vercel --prod --yes
```

배포가 `READY`이고 production alias가 연결됐는지 확인합니다.

```powershell
Invoke-RestMethod 'https://parkpick-seoul.vercel.app/api/places/search?q=%ED%99%8D%EB%8C%80%EC%9E%85%EA%B5%AC%EC%97%AD'
```

추천 경로는 브라우저에서 출발지·목적지를 선택한 뒤 확인하거나 [검증 가이드](VALIDATION.md)의 POST 예제를 사용합니다. 반환된 추천의 `routeSource`가 `NAVER_DIRECTIONS`이고 `routePath`가 비어 있지 않아야 실제 교통 경로선이 표시됩니다.

## 7. 운영 보안

- 실제 Key와 Secret을 Git, Issue, PR, 스크린샷 또는 로그에 넣지 않습니다.
- 노출된 키는 즉시 재발급하고 Vercel 환경변수를 교체한 뒤 재배포합니다.
- `NEXT_PUBLIC_*`는 브라우저에 공개된다는 전제로 사용합니다.
- API 응답과 서버 로그에 공급자 헤더나 비밀값을 포함하지 않습니다.
- `.env.local`을 커밋하지 않았는지 `git check-ignore -v .env.local`로 확인합니다.
