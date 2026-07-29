@echo off
title Publish ilovemitochondria.com
cd /d "%~dp0"

echo ============================================
echo   Publishing to github.com/bestofer/bestofer.github.io
echo ============================================
echo.

echo [1/4] Clearing stale git lock files...
if exist ".git\HEAD.lock"  del /f /q ".git\HEAD.lock"
if exist ".git\index.lock" del /f /q ".git\index.lock"
if exist ".git\refs\heads\main.lock" del /f /q ".git\refs\heads\main.lock"
if exist ".git\objects\maintenance.lock" del /f /q ".git\objects\maintenance.lock"
echo      done.
echo.

echo [2/4] Staging changes...
git add -A
echo.

echo [3/4] Committing...
git commit -m "Enable GA4 analytics and custom domain"
echo.

echo [4/4] Pushing to GitHub...
echo      A browser window may open asking you to sign in to GitHub.
echo      Approve it and this will finish on its own.
echo.
git push -u origin main

echo.
echo ============================================
if errorlevel 1 (
  echo   PUSH FAILED - copy the red text above and send it to Claude
) else (
  echo   SUCCESS - the site will build and go live in 1-2 minutes
  echo   https://ilovemitochondria.com
)
echo ============================================
echo.
pause
