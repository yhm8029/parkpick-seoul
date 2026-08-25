# Architecture

외부 공급자의 응답을 React 컴포넌트가 직접 사용하지 않는다.

```text
Browser
  ├─ useGeolocation
  ├─ PlaceSearch
  ├─ MapPanel
  │    ├─ Kakao provider
  │    ├─ Naver provider
  │    └─ Preview provider
  └─ NavigationButtons
       ├─ Kakao Navi
       └─ Naver URL Scheme / Intent

Next.js Route Handlers
  ├─ /api/places/search
  └─ /api/recommendations

Domain
  ├─ distance
  ├─ fee
  └─ recommendation
```

## 장애 격리

| 실패 | 대체 |
|---|---|
| GPS | 출발지 검색 |
| Kakao place search | 데모 장소 |
| Seoul parking API | 데모 주차장 |
| Kakao Mobility | 거리 기반 자동차시간 |
| Kakao Map | Naver 또는 Preview |
| Naver Map | Kakao 또는 Preview |
| Kakao Navi | Kakao Map 길찾기 URL |
| Naver app 없음 | Android Store / iOS App Store |
