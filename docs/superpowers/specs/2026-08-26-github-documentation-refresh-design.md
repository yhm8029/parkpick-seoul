# GitHub 공개 문서 전면 정비 설계

## 목표

ParkPick Seoul 저장소를 처음 방문한 사용자와 개발자가 현재 제품 상태를 빠르게 이해하고, 로컬 실행부터 NAVER API 설정, 검증, Vercel 배포, 라이선스 확인까지 문서만으로 수행할 수 있게 한다.

현재 런타임은 NAVER 중심이지만 일부 문서는 과거 Kakao 중심 구조와 미완료 상태를 설명한다. 이번 작업은 공개 문서를 실제 구현과 일치시키고 문서별 역할을 명확히 나눈다.

## 독자와 문서 언어

- 1차 독자: 서울에서 주차장을 찾는 제품 사용자와 저장소를 평가하는 방문자
- 2차 독자: 로컬 실행, API 연동, 배포를 수행하는 개발자와 운영자
- 기본 언어: 한국어
- 제품명, API명, 환경변수, 명령어와 표준 라이선스 명칭은 공식 영문 표기를 유지한다.

## 정보 구조

### `README.md`

GitHub 랜딩페이지 역할만 맡는다.

- 운영 서비스와 저장소 링크
- 제품이 해결하는 문제와 핵심 사용자 흐름
- 실제 구현된 핵심 기능
- 데이터 최신성 및 실시간 빈자리 한계
- 빠른 로컬 실행
- 필수·선택 환경변수 요약
- 테스트와 배포 명령
- 상세 문서와 라이선스 링크

README에는 내부 구현 세부사항을 과도하게 넣지 않고 전문 문서로 연결한다.

### `SPEC.md`

현재 동작하는 제품 계약을 기술한다.

- 출발지·목적지 검색과 GPS 권한 흐름
- NAVER API HUB 지역검색 우선, Geocoding·데모 폴백
- 서울 공영주차장 후보 수집과 추천 조건
- NAVER Directions 5 기반 현재 교통시간·거리·경로선
- 주차장→목적지 도보 거리의 추정 성격
- 주차요금과 실시간 빈자리 데이터의 의미
- 지도·카드·네이버지도 handoff 동작
- 접근성, 개인정보, 오류 및 폴백 계약

Kakao는 현재 런타임 공급자로 설명하지 않는다. 향후 가능성을 위해 코드가 dormant 상태로 보존된다는 사실만 개발 문서에서 짧게 언급한다.

### `docs/ARCHITECTURE.md`

현재 데이터 흐름과 모듈 경계를 설명한다.

1. 브라우저 입력과 명시적 GPS 요청
2. 서버 전용 NAVER 장소검색
3. 서울시 주차 데이터 조회 및 폴백
4. 후보 평가와 상위 3개 확정
5. NAVER Directions 5 병렬 보강
6. 카드·지도·경로선 렌더링과 네이버지도 handoff

클라이언트 공개 키와 서버 비밀키 경계를 명시하며 raw provider 응답이 UI로 전달되지 않는 구조를 설명한다.

### `DEPLOY.md`

재현 가능한 운영 절차를 제공한다.

- Node.js 22 이상과 `npm ci`
- `.env.example`에서 `.env.local` 구성
- NAVER Maps Application과 API HUB Application의 역할 구분
- Dynamic Map, Directions 5, Geocoding, NAVER 검색 활성화
- 허용 도메인에 localhost와 운영 도메인 등록
- Vercel 환경변수 등록, production deploy, API smoke test
- 비밀키를 Git과 `NEXT_PUBLIC_*`에 넣지 않는 보안 규칙

### `VALIDATION.md`

자동 검증과 실제 공급자 검증을 분리한다.

- 저장소, ESLint, TypeScript, Vitest, production build 명령
- 지역검색 LIVE 결과 확인
- 추천 응답의 `NAVER_DIRECTIONS`, 교통시간과 경로점 확인
- GPS가 사용자 동작 전 권한을 요청하지 않는지 확인
- 실시간 빈자리 미지원 문구와 데모 폴백 확인
- 모바일·PWA·네이버지도 앱 handoff 확인

### `ROADMAP.md`

완료된 기반 기능과 향후 작업을 구분한다.

- 완료: NAVER 검색·지도·Directions, 서울 주차 데이터, 추천 결과 교체형 UI, PWA, 방문자 지표, BSL 1.1
- 다음: 경로 캐시·쿼터 관측, 추천 품질 평가, 실시간 데이터 범위 확대, 모바일 실제 기기 회귀검증
- Kakao는 확정 일정이 없는 잠재적 후속 공급자로만 기록한다.

### `docs/REFERENCES.md`

구현 근거가 되는 공식 문서만 분류한다.

- NAVER Maps Dynamic Map, Directions 5, Geocoding
- NAVER API HUB 지역검색
- 서울 열린데이터광장 주차 API
- Next.js, Vercel Analytics와 배포 문서
- PWA 관련 웹 표준

### 라이선스 문서

- `LICENSE`의 표준 BSL 1.1 본문과 파라미터는 변경하지 않는다.
- `NOTICE`의 프로젝트 저작권 고지를 유지한다.
- `COMMERCIAL-LICENSE.md`는 문의 안내문임을 유지하면서 README에서 무료 사용과 상업용 라이선스 경계를 한국어로 명확히 설명한다.
- 과거 MIT 배포 이력이나 추측성 문구는 현재 공개 안내에 추가하지 않는다.

### `.github` 메타데이터

- 버그 리포트 템플릿: 재현 절차, 기대/실제 결과, 환경, 로그·스크린샷, 비밀키 제거 안내
- 기능 요청 템플릿: 문제, 제안, 대안, 범위
- PR 템플릿: 변경 내용, 검증, UI 캡처, 보안·환경변수·문서 체크

## 정확성 규칙

- 현재 기본 지도·길찾기·장소검색은 NAVER 기반이라고 일관되게 표현한다.
- 자동차 시간은 출발지→주차장의 NAVER Directions 5 현재 교통 기준 값이다.
- 도보 값은 주차장→목적지 거리 기반 추정이며 보행 경로 API 결과라고 표현하지 않는다.
- 서울시 공급자가 실시간 잔여면을 제공하지 않는 주차장은 확인 불가로 표시한다.
- API HUB 검색 자격증명과 Maps 자격증명은 별도 Application으로 설명한다.
- 모든 비밀키 예시는 빈 값 또는 플레이스홀더만 사용한다.
- 운영 URL은 `https://parkpick-seoul.vercel.app`, 로컬 URL은 `http://127.0.0.1:3000`을 기준으로 한다.

## 범위 제외

- 애플리케이션 런타임 동작 변경
- API 공급자 추가 또는 키 재발급
- 라이선스 조건 자체 변경
- 과거 `docs/superpowers/plans`와 `docs/superpowers/specs`의 역사적 기록 재작성
- GitHub Wiki, Discussions, Actions 워크플로 추가

## 검증

- 공개 Markdown의 내부 링크가 실제 파일을 가리키는지 검사한다.
- `rg`로 Kakao-first, 미구현 Directions, 오래된 환경변수 설명을 검색한다.
- 모든 명령과 환경변수가 `package.json`, `.env.example`, 현재 코드와 일치하는지 대조한다.
- tracked 파일에 실제 API 키나 비밀값이 없는지 확인한다.
- Markdown 변경 후 애플리케이션 전체 테스트와 build를 다시 실행해 문서 외 변경이 없음을 확인한다.

## 완료 조건

GitHub 첫 화면에서 제품 목적, 운영 링크, 실제 데이터 한계, 빠른 실행과 라이선스가 즉시 보이고, 개발자는 연결된 문서를 따라 NAVER 검색·지도·Directions 설정과 Vercel 배포를 재현할 수 있다. 공개 문서 어디에도 현재 런타임과 충돌하는 Kakao-first 또는 Directions 미구현 설명이 남지 않는다.
