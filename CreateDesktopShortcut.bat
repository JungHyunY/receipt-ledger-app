@echo off
chcp 65001 > nul
set SCRIPT_DIR=%~dp0
set VBS_TARGET=%SCRIPT_DIR%ReceiptLedger.vbs
set SHORTCUT_PATH=%USERPROFILE%\Desktop\교회영수증장부.lnk

echo [Receipt Ledger] 바탕화면에 원클릭 바로가기 생성 중...

powershell -Command "$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut('%SHORTCUT_PATH%'); $s.TargetPath = 'wscript.exe'; $s.Arguments = '\"%VBS_TARGET%\"'; $s.WorkingDirectory = '%SCRIPT_DIR%'; $s.Description = '스마트 영수증 및 교회 회계장부 정리기'; $s.IconLocation = 'imageres.dll,67'; $s.Save()"

echo.
echo =======================================================================
echo   바탕화면에 '교회영수증장부' 바로가기가 생성되었습니다!
echo   더블클릭 시 검은 창 없이 독립 데스크톱 앱(1360x900)으로 바로 실행됩니다.
echo =======================================================================
timeout /t 3 > nul
