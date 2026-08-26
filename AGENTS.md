# AGENTS.md

## Product intent

ParkPick Seoul은 일반 지도 뷰어가 아니라 주차 의사결정 PWA다. 모든 기능은 사용자가 주차장을 고르는 시간을 줄여야 한다.

## Rules

- GPS 원본 좌표를 기본적으로 저장하지 않는다.
- 예측을 예약이나 주차 보장처럼 표현하지 않는다.
- API 키가 없어도 데모와 Preview 지도로 전체 흐름이 동작해야 한다.
- Kakao와 Naver 지도 Provider를 UI와 추천 로직에서 분리한다.
- 외부 API 응답은 `lib/api`에서 내부 모델로 정규화한다.
- 점수·요금·거리 로직은 순수 함수와 테스트로 유지한다.
- 자체 턴바이턴 내비를 만들지 않고 Kakao/Naver 앱에 위임한다.
- 추정값·지연값·데모값을 UI에서 명시한다.

## Verification

```bash
npm run typecheck
npm test
npm run build
```

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
