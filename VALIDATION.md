# 검증 가이드

자동 테스트와 실제 공급자 smoke test를 분리합니다. 공급자 장애가 자동 테스트의 재현성을 깨지 않도록 단위 테스트는 fixture와 mock을 사용합니다.

## 1. 전체 자동 검증

새 설치 후 다음을 실행합니다.

```powershell
npm ci
npm run verify
```

`verify` 실행 순서:

1. `npm run check:repo` — 저장소 구조, JSON, 환경변수 템플릿, 충돌 마커 검사
2. `npm run lint` — ESLint
3. `npm run typecheck` — TypeScript
4. `npm test` — Vitest 단위·UI 테스트
5. `npm run build` — Next.js production build

문서만 변경했더라도 링크된 명령과 파일이 코드와 일치하는지 확인하기 위해 전체 검증을 실행합니다.

## 2. 변경 범위 검사

```powershell
git diff --check
git status --short
git check-ignore -v .env.local
```

- 공백 오류가 없어야 합니다.
- 의도하지 않은 생성물과 `.env.local`이 추적되지 않아야 합니다.
- tracked 파일에 실제 API 키, Secret 또는 토큰이 없어야 합니다.

## 3. 장소검색 LIVE 확인

로컬 또는 production API를 호출합니다.

```powershell
$result = Invoke-RestMethod 'http://127.0.0.1:3000/api/places/search?q=%ED%99%8D%EB%8C%80%EC%9E%85%EA%B5%AC%EC%97%AD'
$result | Select-Object mode, notice
$result.places | Select-Object name,address,source
```

기대 결과:

- `mode`가 `LIVE`
- 실제 `홍대입구역` 노선/시설 결과 존재
- `source`가 `NAVER`
- 검색창 아래 고정 장소 칩은 없고, 입력한 검색어의 결과 목록만 표시

## 4. Directions 5 확인

UI에서 추천을 실행하거나 다음 예시로 API를 호출합니다.

```powershell
$body = @{
  origin = @{ latitude = 37.5665; longitude = 126.9780 }
  destination = @{
    id = 'the-hyundai'
    name = '더현대 서울'
    address = '서울 영등포구 여의대로 108'
    latitude = 37.5259
    longitude = 126.9284
    source = 'NAVER'
  }
  arrivalAt = (Get-Date).ToString('o')
  durationMinutes = 180
  profile = 'BALANCED'
  distanceMode = 'AUTO'
} | ConvertTo-Json -Depth 5

$result = Invoke-RestMethod `
  -Uri 'http://127.0.0.1:3000/api/recommendations' `
  -Method Post `
  -ContentType 'application/json' `
  -Body $body

$result.recommendations | Select-Object rank,name,driveMinutes,driveDistanceMeters,routeSource,@{Name='pathPoints';Expression={$_.routePath.Count}}
```

기대 결과:

- 추천 0~10건이며 후보가 4건 이상이면 UI는 처음 3건만 표시
- 정상 Maps 설정에서는 `routeSource`가 `NAVER_DIRECTIONS`
- `driveMinutes`와 `driveDistanceMeters`가 양수
- `routePath`에 실제 경로점 존재
- 지도에서 선택 카드의 경로선과 가능한 혼잡 구간 표시

교통상황에 따라 분·거리·경로는 실행마다 달라질 수 있습니다.

## 5. 수동 UX 검사

### 위치

- 초기 페이지 로딩만으로 브라우저 위치 권한 팝업이 열리지 않음
- `현재 위치 사용`을 누른 뒤에만 권한 요청
- 허용, 거부, 시간초과, 미지원과 비보안 연결 안내
- GPS 정확도 `±Xm` 표시와 직접 출발지 검색 폴백

### 검색과 추천

- 고정된 `코엑스`, `강남역`, `서울역`, `더현대 서울`, `국립극장` 버튼이 없음
- 검색어 입력 후 실제 NAVER 결과 선택 가능
- 입력 변경 시 진행 중 추천 취소 및 입력 모드 유지
- 추천 성공 시 입력 패널이 카드 목록으로 교체
- 후보가 4곳 이상이면 `추천 N곳 더 보기`로 카드와 지도 마커가 함께 펼쳐지고 `접기`로 상위 3곳에 복귀
- 접힌 뒤 선택 후보가 숨겨지는 경우 카드·경로·모바일 바가 1순위로 함께 복귀
- `조건 변경` 시 기존 입력값 보존

### 데이터 의미

- 자동차: `출발지 → 주차장 · 현재 교통 기준` 또는 `거리 기반 추정`
- 도보: `주차장 → 목적지 · 약 Xm`
- 실시간 미지원 주차장에 공급자 미제공 안내 표시
- `서초구청` 검색 시 `BP`인 서초구청 주차장이 후보에 포함되고 `공공시설 부설` 배지 표시
- 일반 부설(`BS`)과 민영 노외(`NP`) 주차장은 추천 후보에서 제외
- 예상요금 아래 무료/단가/구간별 요금 안내 표시

### 모바일·PWA

- 680px 이하 목록/지도 전환
- 결과 직후 목록이 기본
- 홈 화면 설치와 standalone 실행
- 오프라인에서 안내 페이지 표시
- 실제 Android/iOS에서 네이버지도 handoff와 앱 미설치 폴백

## 6. 방문자 집계

Vercel Web Analytics 자격증명이 있을 때만 확인합니다.

- footer에 `TODAY`, `30 DAYS` 표시
- API가 unavailable이면 전체 블록 숨김
- 빈 응답을 가짜 `0`으로 표시하지 않음
- 위치나 개인 식별 정보를 별도 저장하지 않음
