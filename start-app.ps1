Write-Host "Starting Network Monitor Application..." -ForegroundColor Green
Write-Host ""

# Check if webpack dev server is already running
$port = 3001
$connection = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue

if ($connection) {
    Write-Host "React dev server is already running on port $port" -ForegroundColor Yellow
} else {
    Write-Host "Starting React development server..." -ForegroundColor Cyan
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd 'c:\Users\User\Desktop\ComOnline'; npm run dev:react" -WindowStyle Minimized
    Write-Host "Waiting for server to start..." -ForegroundColor Yellow
    Start-Sleep -Seconds 5
}

Write-Host "Starting Electron desktop application..." -ForegroundColor Cyan
Set-Location "c:\Users\User\Desktop\ComOnline"

# Run Electron
& ".\node_modules\.bin\electron.cmd" "electron-main.js"

Write-Host ""
Write-Host "Application closed." -ForegroundColor Red
Write-Host "Press any key to exit..." -ForegroundColor Gray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")