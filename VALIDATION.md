# Validation

## 이 작업환경에서 완료

- `package.json` JSON 파싱
- TypeScript 28개 소스의 syntax transpile
- React/Next 외부 타입을 임시 stub으로 둔 프로젝트 내부 타입검사
- 요금 계산과 추천순위 core smoke test
- Git conflict marker 검사
- UI 시안 PNG 생성·육안 확인
- 로컬 Git `main` 초기 커밋

## 로컬 또는 Vercel에서 수행

```text
npm install
npm run typecheck
npm test
npm run build
```

현재 작업 컨테이너는 npm registry DNS가 연결되지 않아 의존성 설치와 실제 Next.js production build는 여기서 실행하지 못했다. Vercel Git 배포는 `npm run vercel-build`를 실행해 lint, 타입검사, 테스트, 프로덕션 빌드가 모두 통과한 경우에만 배포한다.
