@echo off
echo Starting Network Monitor Application...
echo.

REM Запускаем webpack-dev-server в отдельном окне
echo Starting React development server...
start /min cmd /c "npm run dev:react"

REM Ждем, пока сервер запустится
echo Waiting for server to start...
timeout /t 5 /nobreak > nul

REM Запускаем Electron
echo Starting Electron desktop application...
call node_modules\.bin\electron.cmd electron-main.js

pause