$ErrorActionPreference = "Stop"
$Repo = "yhm8029/parkpick-seoul"

if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
  Write-Host "GitHub CLI가 없습니다. 먼저 실행하세요: winget install --id GitHub.cli" -ForegroundColor Yellow
  exit 1
}

& gh auth status 2>$null
if ($LASTEXITCODE -ne 0) {
  & gh auth login
}

if (-not (Test-Path ".git")) {
  & git init -b main
  & git add .
  & git commit -m "feat: scaffold GPS parking PWA with Kakao and Naver maps"
}

& gh repo view $Repo 2>$null
if ($LASTEXITCODE -eq 0) {
  & git remote get-url origin *> $null
  if ($LASTEXITCODE -ne 0) {
    & git remote add origin "https://github.com/$Repo.git"
  }
  & git push -u origin main
} else {
  & gh repo create $Repo --public --source=. --remote=origin --push --description "GPS-based Seoul public parking recommendation PWA with Kakao Map and Naver Map integration"
}
