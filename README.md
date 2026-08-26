# ParkPick Seoul

목적지만 정하면 서울 공영주차장 후보를 비교하고, 현재 위치에서 선택한 주차장까지의 NAVER 교통 경로를 보여주는 모바일 우선 PWA입니다.

**운영 서비스:** [parkpick-seoul.vercel.app](https://parkpick-seoul.vercel.app)

![ParkPick Seoul 미리보기](docs/ui-preview.svg)

## 바로 사용하기

1. `현재 위치 사용`을 눌러 출발지를 정하거나 장소를 직접 검색합니다.
2. 목적지를 검색하고 도착 예정시간, 예상 체류 시간, 추천 기준을 선택합니다.
3. 추천된 공영주차장 1~3곳의 빈자리, 요금, 자동차 이동, 도보 거리와 데이터 신뢰도를 비교합니다.
4. 선택한 주차장까지의 NAVER 경로를 확인하고 네이버지도로 길안내를 이어갑니다.

위치 권한은 사용자가 버튼을 누르기 전에는 요청하지 않습니다. GPS 없이도 출발지를 직접 검색할 수 있습니다.

## 무엇을 제공하나요?

- NAVER API HUB 기반 출발지·목적지 실제 장소검색
- NAVER Web Dynamic Map 기반 현재 위치·목적지·추천 주차장 표시
- 서울 주차 포털의 공영 노상(`NS`)·공영 노외(`NW`)·공공시설 부설(`BP`) 주차장과 장애 시 서울 열린데이터 대체 소스
- 빈자리, 요금, 도보 거리, 자동차 이동시간, 최신성을 반영한 상위 1~3곳 추천
- NAVER Directions 5의 현재 교통시간·거리·경로선과 혼잡 구간
- 체류시간 기준 예상 주차요금과 요금 단위
- 네이버지도 앱·웹 길안내 handoff
- 설치 가능한 PWA, 오프라인 안내 화면, 반응형 지도/목록 전환
- 선택 설정 시 Vercel Web Analytics 기반 `TODAY` / `30 DAYS` 익명 방문자 집계

현재 런타임은 NAVER 지도·검색·길찾기만 사용합니다. 과거 Kakao 연동 코드는 잠재적 후속 지원을 위해 dormant source로만 보존됩니다.

## 데이터와 정확도

표시값마다 의미가 다릅니다.

| 표시              | 의미                                                                                       |
| ----------------- | ------------------------------------------------------------------------------------------ |
| 주차장까지 자동차 | 출발지 → 주차장, NAVER Directions 5 현재 교통 기준. 공급자 실패 시 거리 기반 추정으로 명시 |
| 목적지까지 도보   | 주차장 → 목적지의 거리 기반 추정. 보행 경로 API 결과가 아님                                |
| 현재 빈자리       | 서울 주차 포털이 실시간 잔여면을 제공하는 주차장만 표시                                    |
| 확인 불가         | 해당 주차장의 실시간 잔여면을 공급자가 제공하지 않음                                       |
| 추천 대상         | 공영 노상·노외와 공공시설 부설만 포함. 일반 부설(`BS`)·민영 노외(`NP`)는 제외              |
| 예상요금          | 현재 요금 규칙과 선택한 체류시간으로 계산한 할인 전 예상값                                 |

교통시간은 요청 시점 교통상황에 따라 달라지며 네이버지도 앱에서 다시 조회한 값과 차이가 날 수 있습니다. 추천 결과는 주차 가능을 보장하지 않습니다.

## 빠른 로컬 실행

요구사항은 Node.js 22 이상입니다.

```powershell
git clone https://github.com/yhm8029/parkpick-seoul.git
cd parkpick-seoul
npm ci
Copy-Item .env.example .env.local
npm run dev -- -H 127.0.0.1 -p 3000
```

브라우저에서 <http://127.0.0.1:3000>을 엽니다. NAVER 키가 없으면 장소검색은 데모, 지도는 미리보기로 폴백합니다. 서울 주차 포털의 기본 근접 검색은 별도 키 없이 동작하지만, 포털 장애 시 대체 소스를 쓰려면 `SEOUL_OPEN_API_KEY`가 필요합니다.

## 환경변수

실제 값은 `.env.local` 또는 배포 플랫폼의 Secret에만 저장합니다.

| 변수                               | 공개 여부          | 용도                                |
| ---------------------------------- | ------------------ | ----------------------------------- |
| `SEOUL_OPEN_API_KEY`               | 서버 전용          | 서울 열린데이터 대체 주차장 소스    |
| `NEXT_PUBLIC_NAVER_MAP_NCP_KEY_ID` | 브라우저 공개      | NAVER Web Dynamic Map               |
| `NAVER_MAP_NCP_KEY_ID`             | 서버 전용          | NAVER Geocoding·Directions 5 Key ID |
| `NAVER_MAP_NCP_CLIENT_SECRET`      | 서버 전용          | NAVER Maps API Key                  |
| `NAVER_API_HUB_KEY_ID`             | 서버 전용          | NAVER API HUB 지역검색 Key ID       |
| `NAVER_API_HUB_KEY`                | 서버 전용          | NAVER API HUB 지역검색 Key          |
| `NEXT_PUBLIC_NAVER_APP_NAME`       | 브라우저 공개      | 네이버지도 URL Scheme의 `appname`   |
| `VERCEL_ANALYTICS_TOKEN`           | 서버 전용·선택     | 방문자 집계 API 토큰                |
| `VERCEL_ANALYTICS_TEAM_ID`         | 서버 전용·선택     | 방문자 집계 팀 ID                   |
| `NEXT_PUBLIC_SITE_URL`             | 브라우저 공개      | 운영 웹 URL                         |
| `NEXT_PUBLIC_GITHUB_REPO_URL`      | 브라우저 공개·선택 | 헤더 GitHub 링크                    |

NAVER Maps Application과 NAVER API HUB Application은 서로 다른 자격증명을 사용합니다. 자세한 설정은 [배포 가이드](DEPLOY.md)를 참고하세요.

## 검증과 배포

```powershell
npm run verify
npx vercel --prod --yes
```

`verify`는 저장소 검사, ESLint, TypeScript, Vitest와 Next.js production build를 순서대로 실행합니다. 실제 공급자 검증은 [검증 가이드](VALIDATION.md)에 분리되어 있습니다.

## 문서

- [제품 동작 명세](SPEC.md)
- [아키텍처](docs/ARCHITECTURE.md)
- [배포 가이드](DEPLOY.md)
- [검증 가이드](VALIDATION.md)
- [로드맵](ROADMAP.md)
- [공식 참고자료](docs/REFERENCES.md)
- [상업용 라이선스 문의 안내](COMMERCIAL-LICENSE.md)

`docs/superpowers/specs`와 `docs/superpowers/plans`는 구현 의사결정과 작업 이력을 보존합니다.

## 라이선스

ParkPick Seoul 0.2.0 이상은 [Business Source License 1.1](LICENSE)로 배포됩니다.

- 개인, 교육, 연구, 평가와 비상업적 프로덕션 사용: Additional Use Grant 범위에서 무료
- 개발·테스트 등 비프로덕션 사용: BSL 1.1 기본 조건에 따라 허용
- 상업용 프로덕션, 유료 서비스 또는 수익형 배포: 별도 상업용 라이선스 필요
- Change Date: 2030-08-26
- Change License: Apache-2.0

상업용 조건은 [COMMERCIAL-LICENSE.md](COMMERCIAL-LICENSE.md)를 확인하세요. 프로젝트 저작권 고지는 [NOTICE](NOTICE)에 있습니다.
