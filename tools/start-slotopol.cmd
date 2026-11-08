@echo off
cd /d "%~dp0slotopol\slot.windows.x64"
echo Starting Slotopol on http://localhost:8080 ...
slot_win_x64.exe -vv web
