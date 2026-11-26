@echo off
chcp 65001 > nul
title Receipt Ledger
cd /d "%~dp0"

echo [Receipt Ledger] 시스템 초기화 중...

:: 서버가 이미 실행 중인지 확인
netstat -ano | findstr :3980 > nul
if %errorlevel% neq 0 (
    start "ReceiptLedgerServer" /min node server/index.js
    timeout /t 2 /nobreak > nul
)

:: Edge 독립 앱 창으로 실행 (주소창/탭 없는 네이티브 데스크톱 앱 모드)
if exist "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" (
    start "" "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --app=http://localhost:3980 --window-size=1360,900
) else if exist "C:\Program Files\Microsoft\Edge\Application\msedge.exe" (
    start "" "C:\Program Files\Microsoft\Edge\Application\msedge.exe" --app=http://localhost:3980 --window-size=1360,900
) else (
    start "" http://localhost:3980
)

exit
