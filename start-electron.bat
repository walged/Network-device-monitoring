@echo off
cd /d "c:\Users\User\Desktop\ComOnline"
start cmd /k npm run dev:react
timeout /t 5
node_modules\.bin\electron.cmd electron-main.js
pause