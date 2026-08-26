# NAVER API HUB 실제 장소검색 설계

## 목표

목적지·출발지 검색창에서 역명, 상호, 기관명을 입력하면 NAVER 지역검색의 실제 장소를 최대 5개 표시한다.

## 공급자 순서

1. 서버 전용 `NAVER_API_HUB_KEY_ID`와 `NAVER_API_HUB_KEY`로 `GET https://naverapihub.apigw.ntruss.com/search/v1/local`을 호출한다.
2. 지역검색이 실패하거나 결과가 없으면 기존 NCP Geocoding 주소검색을 사용한다.
3. 두 실검색이 모두 불가능하면 기존 데모 장소를 사용한다.

## 정규화와 보안

- `title`의 NAVER 강조 HTML을 제거하고 기본 HTML entity를 복원한다.
- `roadAddress || address`를 주소로 사용한다.
- `mapx`, `mapy`는 WGS84 정수 문자열을 각각 10,000,000으로 나누어 경도·위도로 변환한다.
- 유효하지 않은 좌표나 이름·주소가 없는 항목은 제외한다.
- API 키는 서버 환경변수와 요청 헤더에만 두고 브라우저 응답·로그·Git에 포함하지 않는다.

## UI와 실패 처리

기존 `PlaceSearch` combobox와 280ms debounce를 유지한다. 성공 시 `실검색` 배지와 장소명·주소·카테고리를 표시한다. 공급자 오류는 사용자에게 키나 내부 오류를 노출하지 않고 다음 공급자로 폴백한다.

## 검증

- 정확한 API HUB URL, 헤더, 최대 5개 요청을 단위 테스트한다.
- HTML 제거, 좌표 변환, 잘못된 항목 제외를 단위 테스트한다.
- `searchPlaces`가 API HUB 결과를 Geocoding보다 우선하는 통합 테스트를 둔다.
- 전체 테스트, 타입체크, 빌드와 로컬·Vercel 실제 검색을 확인한다.

## 별도 의존사항

NAVER Directions 5는 Maps Application의 별도 권한이다. 지역검색 키로 교통시간·경로선을 호출하지 않는다. Maps Application에서 Web Dynamic Map, Geocoding, Directions 5가 활성화되어야 실제 교통시간과 경로선이 표시된다.
