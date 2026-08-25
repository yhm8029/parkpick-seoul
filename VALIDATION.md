# Validation

## 정책

- GitHub Actions 사용 안 함
- 원격 CI를 테스트 대체 수단으로 사용하지 않음
- 변경 후 로컬 자체 검증을 통과한 커밋만 push

## 자체 검증 명령

잠긴 의존성을 먼저 깨끗하게 설치한다.

```bash
npm ci
```

```bash
npm run check:repo
```

검증 항목:

- JSON 설정 파싱
- `.env.example` 필수 키 확인
- GitHub Actions 워크플로 부재
- 충돌 마커 검사
- 전체 TypeScript·TSX 구문 변환
- 주차요금 계산
- 추천 1~3순위 및 점수 정렬
- 실제 경로값 반영
- 예상 빈자리 범위 경계
- PWA 필수 자산과 서비스워커 캐시
- 추적된 환경파일·개인키
- `git diff --check`

## 서울시 LIVE 결합 회귀 계약

fixture 회귀 검증은 `GetParkingInfo` 실시간 행과 `GetParkInfo` 정적 좌표를 정확한 `PKLT_CD`로 결합하는 경로를 검사한다. 잘못된 좌표와 미매칭 행, 중복 실시간 코드, 수용량이 없거나 0 이하인 행은 제외하며, 유효한 결합 결과가 3건 미만이면 LIVE 로드를 실패시켜 Route Handler의 기존 `FALLBACK` 경로로 넘긴다.

운영시간·공휴일 의미와 과거 추세 데이터는 이번 회귀 계약에 포함하지 않는다.

## 이번 브랜치에서 수행한 결과

- `npm run check:repo`: 9/9 통과, TypeScript/TSX 33개 파일 syntax transpile 포함
- `npm run typecheck`: 통과
- `npm test`: 4개 파일, 18개 테스트 통과
- `npm run build`: Next.js production build 통과
- `npm run lint`: 기존 5개 파일의 오류 7건으로 실패. 이번 브랜치는 해당 파일을 변경하지 않음
- `git diff --check`: 통과

## 전체 개발환경 검증

의존성 설치가 가능한 환경에서는 다음 명령 하나로 전체 검증한다.

```bash
npm run verify
```

실행 순서:

```text
check:repo
→ ESLint
→ TypeScript typecheck
→ Vitest
→ Next.js production build
```

`check:repo`는 잠긴 프로젝트-로컬 TypeScript만 사용해 실행되며, 누락되거나 호환되지 않을 때는 `npm ci`를 요구해 실패 종료한다. 전역 TypeScript나 의존성 미설치 상태에서는 실행되지 않는다.

이번 검증에서는 같은 단계를 중복하지 않도록 `verify` 대신 각 명령을 한 번씩 실행했다. 전체 게이트는 기존 ESLint 오류 7건 때문에 아직 통과 상태가 아니다.
