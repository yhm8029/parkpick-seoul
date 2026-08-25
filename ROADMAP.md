# Roadmap

## v0.1 scaffold

- [x] GPS 권한·오류 처리와 직접 출발지 입력
- [x] 목적지 검색과 데모 폴백
- [x] 서울시 실시간 주차 어댑터
- [x] 추천점수와 상위 3곳
- [x] Kakao Maps JavaScript SDK
- [x] NAVER Web Dynamic Map (`ncpKeyId`)
- [x] Kakao Navi와 NAVER 지도 URL Scheme/Intent
- [x] PWA, 오프라인 화면, 반응형 UI
- [x] 테스트와 Vercel Git CI/CD

## v0.2 live hardening

- [ ] 서울시 실제 응답 fixture와 필드 회귀 테스트
- [ ] 운영시간·공휴일·자정 통과 판정
- [ ] 서버 캐시 또는 Supabase 연결
- [ ] NAVER Directions 5/15 선택형 Provider

## v0.3 prediction

- [ ] 5분 스냅샷 수집
- [ ] 이상치·중복 제거
- [ ] 요일 × 10분 패턴
- [ ] 최근 추세 + 과거 중앙값 예측
- [ ] MAE 백테스트와 신뢰도
