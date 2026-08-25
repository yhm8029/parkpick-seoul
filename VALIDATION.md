# Validation

## 정책

- GitHub Actions 사용 안 함
- 원격 CI를 테스트 대체 수단으로 사용하지 않음
- 변경 후 로컬 자체 검증을 통과한 커밋만 push

## 자체 검증 명령

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

## 이번 커밋에서 수행한 결과

- `npm run check:repo`: 9/9 통과
- TypeScript/TSX 28개 파일 syntax transpile 통과
- 외부 React/Next 타입을 임시 격리한 내부 TypeScript 타입검사 통과
- 요금·거리·추천순위·경로·예측범위 도메인 검증 통과
- GitHub Actions 및 임시 workflow 파일 부재 확인

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

현재 실행 컨테이너는 npm registry DNS 연결이 차단되어 신규 의존성 설치 기반의 ESLint, Vitest, Next.js production build는 실행할 수 없었다. `check:repo`는 프로젝트 또는 전역 TypeScript를 사용해 제한된 환경에서도 실행되며, GitHub 커밋과 push는 연결된 저장소 API로 수행한다.


## 이번 환경의 전체 검증 시도

`npm run verify`를 실제 실행했다. `check:repo` 9개 항목은 모두 통과했지만, 이 컨테이너에는 `node_modules`가 없고 npm registry 외부 접속이 차단되어 다음 `ESLint` 단계에서 `eslint: not found`로 중단됐다. 이는 소스 검사 실패가 아니라 의존성 설치 불가에 따른 실행환경 제한이다.
