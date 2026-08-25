@echo off
setlocal
cd /d "%~dp0"

where git >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Git is not installed. Install Git for Windows first.
  echo https://git-scm.com/download/win
  pause
  exit /b 1
)

git remote get-url origin >nul 2>nul
if errorlevel 1 (
  git remote add origin https://github.com/yhm8029/parkpick-seoul.git
) else (
  git remote set-url origin https://github.com/yhm8029/parkpick-seoul.git
)

echo Pushing ParkPick Seoul to GitHub...
git push -u origin main
if errorlevel 1 (
  echo.
  echo Push failed. Complete the GitHub sign-in prompt, then run this file again.
  pause
  exit /b 1
)

echo.
echo Upload complete: https://github.com/yhm8029/parkpick-seoul
pause
