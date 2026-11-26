@echo off
cd /d "%~dp0"
title Receipt Ledger - 교회 영수증 장부정리

echo ========================================================
echo   교회 영수증 및 회계장부 정리기 (Receipt Ledger)
echo ========================================================
echo.
echo [1/2] 브라우저 앱 창 여는 중... (http://localhost:3980)

set BROWSER=
if exist "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" set "BROWSER=C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
if exist "C:\Program Files\Microsoft\Edge\Application\msedge.exe" set "BROWSER=C:\Program Files\Microsoft\Edge\Application\msedge.exe"

if defined BROWSER (
    start "" "%BROWSER%" --app=http://localhost:3980 --window-size=1360,900
) else (
    start "" http://localhost:3980
)

echo [2/2] 서버 시작 중...
node server/index.js
pause
