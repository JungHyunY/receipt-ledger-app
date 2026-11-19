@echo off
chcp 65001 > nul
title Receipt Ledger - 스마트 영수증 회계장부 정리
echo ========================================================
echo   스마트 영수증 회계장부 정리 프로그램 (Ollama AI)
echo ========================================================
echo.
echo [1/2] 서버 시작 중... (http://localhost:3980)
echo.

cd /d "%~dp0"
start "" http://localhost:3980
node server/index.js
pause
