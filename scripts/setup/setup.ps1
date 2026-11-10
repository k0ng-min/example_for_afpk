# 최초 설정: 도구 확인 + 프론트엔드 의존성 설치 + 백엔드 빌드
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
foreach ($t in "node", "npm", "cargo") { if (-not (Get-Command $t -ErrorAction SilentlyContinue)) { Write-Error "$t 가 필요합니다"; exit 1 } }
Push-Location "$root\frontend"; npm install; Pop-Location
& "$root\scripts\development\cargo-msvc.cmd" build
if (-not (Test-Path "$root\.env")) { Copy-Item "$root\.env.example" "$root\.env"; Write-Host ".env 를 생성했습니다. ADMIN_TOKEN 을 변경하세요." }
