#!/usr/bin/env bash
set -euo pipefail
repo="yhm8029/parkpick-seoul"
command -v gh >/dev/null || { echo "Install GitHub CLI first: https://cli.github.com"; exit 1; }
gh auth status >/dev/null 2>&1 || gh auth login
if [[ ! -d .git ]]; then
  git init -b main
  git add .
  git commit -m "feat: scaffold GPS parking PWA with Kakao and Naver maps"
fi
if gh repo view "$repo" >/dev/null 2>&1; then
  git remote get-url origin >/dev/null 2>&1 || git remote add origin "https://github.com/$repo.git"
  git push -u origin main
else
  gh repo create "$repo" --public --source=. --remote=origin --push --description "GPS-based Seoul public parking recommendation PWA with Kakao Map and Naver Map integration"
fi
