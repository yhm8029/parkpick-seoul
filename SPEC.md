# ParkPick Seoul 설계명세서 v0.1

## 1. 제품 목표

목적지, 출발지, 도착예정시각, 체류시간을 입력하면 서울 공영주차장 후보를 비교하여 3곳을 추천하고, 앱 내부 지도와 외부 네비 앱을 사용자가 선택하게 한다.

## 2. 지도·네비 요구사항

### 2.1 앱 내부 지도

| Provider | 환경변수 | 동작 |
|---|---|---|
| Kakao Maps JavaScript SDK | `NEXT_PUBLIC_KAKAO_MAP_JAVASCRIPT_KEY` | 목적지·출발지·추천 1~3순위 표시 |
| NAVER Web Dynamic Map | `NEXT_PUBLIC_NAVER_MAP_NCP_KEY_ID` | 동일 좌표와 순위 표시 |
| Preview | 없음 | 상대좌표 미리보기, 외부 키 없이 동작 |

두 키가 모두 있으면 지도 상단 탭으로 전환한다. 키가 없거나 인증·도메인 등록이 실패하면 Preview로 기능을 유지한다.

NAVER Maps JavaScript API는 `https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=...`로 로드한다.

### 2.2 외부 네비

- 카카오: `Kakao.Navi.start`, 키 없음·실패 시 카카오 지도 길찾기 URL
- 네이버 Android 모바일 웹: `intent://navigation?...#Intent;scheme=nmap;...;package=com.nhn.android.nmap;end`
- 네이버 iOS: `nmap://navigation`, 앱 미설치 시 App Store 폴백
- 네이버 데스크톱: 네이버 지도 웹 자동차 길찾기
- 네이버 모든 앱 URL에는 `appname` 포함

## 3. GPS

- 페이지 로딩과 동시에 권한을 요청하지 않는다.
- 사용자가 `현재 위치 사용`을 눌렀을 때만 `getCurrentPosition` 호출
- `enableHighAccuracy: true`, timeout 12초, maximumAge 30초
- 허용·거부·시간초과·미지원·HTTPS 미사용을 구분
- 실패 시 동일한 장소검색 UI로 출발지 직접 입력
- GPS 좌표는 브라우저 메모리와 추천 요청에만 사용하며 저장하지 않음

## 4. 데이터 흐름

```text
User input
→ Place search / GPS
→ Seoul parking adapter or demo
→ Candidate selection within 3km
→ Kakao route matrix or distance estimate
→ Fee + arrival availability + reliability scoring
→ Top 3
→ Kakao or Naver map
→ KakaoNavi or Naver navigation
```

## 5. 추천 가중치

| 요소 | 균형 | 저렴 | 가까움 | 주차확실 |
|---|---:|---:|---:|---:|
| 빈자리 | 35 | 25 | 25 | 55 |
| 도보 | 25 | 15 | 45 | 15 |
| 요금 | 20 | 45 | 5 | 5 |
| 자동차 | 15 | 10 | 20 | 10 |
| 최신성 | 5 | 5 | 5 | 15 |

실시간 미지원, 20분 이상 지연, 요금 미확인, 최대 도보시간 초과는 경고 또는 감점한다.

## 6. UI/UX

- 모바일 우선, 기본 터치영역 44px 이상
- 모바일 하단에 추천 또는 선택 주차장 출발 버튼 고정
- 결과 화면 지도/목록 전환
- 데스크톱은 지도와 추천카드 동시 표시
- 색상뿐 아니라 텍스트로 실시간·지연·데모 상태 표시
- 키보드 검색 결과 이동, Enter 선택, Escape 닫기
- `prefers-reduced-motion` 대응

## 7. PWA

- standalone manifest
- 192/512/maskable icons
- 서비스워커는 API를 캐시하지 않음
- 문서는 network-first, 정적 자산은 cache-first
- 오프라인 안내 화면

## 8. 현재 범위와 후속 범위

현재 구현:

- GPS와 직접 입력
- 서울시 API 어댑터
- 카카오 장소·자동차 경로 어댑터
- 카카오맵·네이버지도 렌더링
- 두 네비 앱 handoff
- 추천 로직, 테스트, CI

후속:

- 주차 스냅샷 DB와 배치 수집
- 요일·시간대 예측
- NAVER Directions를 자동차 경로 대안으로 추가
- 운영시간·공휴일 판정 강화
