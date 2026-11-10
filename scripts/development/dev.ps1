# 백엔드(8080)와 프론트엔드(5173)를 각각 새 창에서 실행
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Start-Process cmd -ArgumentList "/k", "`"$root\scripts\development\cargo-msvc.cmd`" run"
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd `"$root\frontend`"; npm run dev"
Write-Host "Backend: http://localhost:8080/api/health  Frontend: http://localhost:5173"
