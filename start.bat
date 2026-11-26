@echo off
chcp 65001 > nul
title Receipt Ledger - 교회 영수증 장부정리
cd /d "%~dp0"

echo ========================================================
echo   교회 영수증 및 회계장부 정리기 (Receipt Ledger)
echo ========================================================
echo.
echo [1/2] 브라우저 창 여는 중... (http://localhost:3980)
start "" "http://localhost:3980"

echo [2/2] 서버 시작 중... (종료 시 이 창을 닫거나 웹에서 [앱 종료]를 누르세요)
node server/index.js
pause
