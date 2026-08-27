# Architecture

ParkPick Seoul은 브라우저 상태, Next.js Route Handler, 공급자 어댑터와 순수 추천 도메인을 분리합니다. 공급자 원본 응답과 비밀키는 React 컴포넌트가 직접 다루지 않습니다.

## 전체 흐름

```text
Browser
├─ AppShell: 입력, 최신 요청, 입력/결과 모드
├─ useGeolocation: 사용자 동작 뒤 GPS 요청
├─ PlaceSearch: 디바운스·키보드 선택
├─ RecommendationPanel / ParkingCard
└─ MapPanel / NavigationButtons: NAVER 지도·경로·handoff
        │
        ▼
Next.js Route Handlers
├─ GET  /api/places/search
├─ POST /api/recommendations
└─ GET  /api/visit-stats
        │
        ▼
Server adapters and domain
├─ NAVER API HUB Local Search → Geocoding → demo places
├─ Seoul Parking Portal nearby search → NS/NW/BP allowlist
├─ portal exception only → GetParkInfo + GetParkingInfo fallback
├─ AUTO nearest 10 / MANUAL scored top 10 shortlist
├─ NAVER Directions 5 enrichment (maximum 10 parallel calls)
└─ normalized RecommendationResponse
```

## 장소검색

`lib/api/naver-place-search.ts`가 공급자 우선순위를 소유합니다. API HUB 지역검색은 상호명·역명·시설 검색을 담당하고, Geocoding은 주소 검색 폴백입니다. 둘 다 실패하면 `DEMO_PLACES`를 검색합니다.

브라우저는 `/api/places/search`만 호출합니다. API HUB와 Maps 비밀키는 서버 요청 헤더에만 들어갑니다.

## 추천과 경로

`app/api/recommendations/route.ts`는 입력을 검증하고 서울시 어댑터를 호출합니다. `lib/domain/recommend.ts`는 부작용 없이 점수와 표시값을 계산합니다.

Vercel 함수는 서울 주차 포털과 NAVER Maps의 한국 리전 네트워크 지연을 줄이기 위해 `vercel.json`에서 서울 리전(`icn1`)으로 배치합니다.

기본 주차장 소스는 `parking.seoul.go.kr/SearchParking.do`입니다. 응답에는 민간 유형도 섞일 수 있으므로 `NS`, `NW`, `BP`만 허용하고 `BS`, `NP` 등은 정확한 allowlist에서 제외합니다. 포털 요청 자체가 실패했을 때만 `SEOUL_OPEN_API_KEY`가 있으면 열린데이터 GetParkInfo/GetParkingInfo를 대체 소스로 사용합니다.

Directions 호출량을 제한하기 위해 다음 2단계를 사용합니다.

1. `AUTO`는 1km 안의 목적지 최단거리 최대 10곳을 고정하고, `MANUAL`은 선택 반경 안 전체 후보를 점수화해 상위 10곳을 고정
2. 확정한 최대 10곳만 `Promise.all` 기반 NAVER Directions 5 병렬 조회

경로 실패는 후보별로 격리합니다. 실패한 후보만 `ESTIMATE`로 남고 추천 전체 요청은 계속 성공할 수 있습니다. UI에는 정규화한 분·미터·좌표·혼잡 구간만 전달합니다.

후보별 geometry는 경로점 2,500개와 혼잡 구간 256개로 제한해 응답 전체를 최대 25,000개 좌표와 2,560개 구간으로 묶습니다. UI는 이 결과 중 상위 3개를 먼저 표시하고 사용자가 펼칠 때만 최대 10개의 카드와 마커를 함께 전달합니다. 요청당 Directions 호출은 최대 10회이며 분산 rate limit은 별도 범위로 두고 NAVER Cloud 한도와 알림으로 운영 사용량을 관리합니다.

## 지도 생명주기

`MapPanel`은 NAVER SDK와 지도 인스턴스를 지도 데이터 변화에 맞춰 관리합니다. 선택 카드가 바뀔 때는 지도 자체를 다시 만들지 않고 활성 경로의 Polyline만 정리·교체해 줌과 팬을 보존합니다.

목적지와 출발지가 없어도 서울 중심 지도를 표시하며, 한 점일 때는 해당 위치를 중심으로 표시합니다.

## 자격증명 경계

| 변수                               | 실행 위치 | 설명                                   |
| ---------------------------------- | --------- | -------------------------------------- |
| `NEXT_PUBLIC_NAVER_MAP_NCP_KEY_ID` | 브라우저  | Dynamic Map 로딩에 필요한 공개 Key ID  |
| `NAVER_MAP_NCP_KEY_ID`             | 서버      | Geocoding·Directions 5 Key ID          |
| `NAVER_MAP_NCP_CLIENT_SECRET`      | 서버      | Maps API Key                           |
| `NAVER_API_HUB_KEY_ID`             | 서버      | 지역검색 Key ID                        |
| `NAVER_API_HUB_KEY`                | 서버      | 지역검색 API Key                       |
| `SEOUL_OPEN_API_KEY`               | 서버      | 포털 장애 시 서울 열린데이터 대체 소스 |
| `VERCEL_ANALYTICS_TOKEN`           | 서버      | 선택적 집계 API 토큰                   |

`NEXT_PUBLIC_*` 변수는 번들에 공개됩니다. 비밀키에는 이 접두사를 사용하지 않습니다.

## 폴백 원칙

| 실패                     | 사용자 동작                       |
| ------------------------ | --------------------------------- |
| 위치 권한 거부·오류      | 직접 출발지 검색                  |
| API HUB 지역검색 실패    | Geocoding, 이후 데모 장소검색     |
| 서울 주차 포털 요청 실패 | 열린데이터 대체 소스, 없으면 503  |
| 정상 응답에 후보 없음    | 빈 추천 안내, 데모 주차장 미사용  |
| Directions 실패          | 해당 후보의 거리 기반 자동차 추정 |
| Dynamic Map 실패·키 없음 | NAVER 미리보기 패널               |
| 방문자 집계 실패         | 방문자 블록 숨김                  |
| 네이버지도 앱 없음       | 웹 또는 앱스토어 폴백             |

## Dormant Kakao source

Kakao 지도·검색·경로·내비 코드는 향후 선택지를 위해 일부 파일에 남아 있지만 현재 UI와 서버 조합에서는 호출하거나 노출하지 않습니다. 새 기능은 현재 NAVER-only 계약을 깨지 않아야 합니다.
