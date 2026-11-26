@echo off
chcp 65001 > nul
echo [Receipt Ledger] 프로그램 및 백그라운드 서버 종료 중...
curl -s -X POST http://localhost:3980/api/shutdown > nul
echo 정상적으로 종료되었습니다.
timeout /t 2 /nobreak > nul
