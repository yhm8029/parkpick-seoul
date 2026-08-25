# GitHub 공개 및 배포

## GitHub CLI

```bash
gh auth login
gh repo create yhm8029/parkpick-seoul --public --source=. --remote=origin --push
```

웹에서 빈 공개 저장소를 생성했다면:

```bash
git remote add origin https://github.com/yhm8029/parkpick-seoul.git
git push -u origin main
```

## Vercel

1. 공개 저장소를 Vercel에 연결
2. `.env.example`의 키 등록
3. Kakao Developers에 localhost와 배포 도메인 등록
4. NAVER Cloud Maps Application에 localhost와 배포 Web 서비스 URL 등록
5. `NEXT_PUBLIC_NAVER_APP_NAME`을 실제 HTTPS 배포 URL로 변경
6. 모바일에서 GPS, 카카오내비, 네이버지도 앱 호출 확인
