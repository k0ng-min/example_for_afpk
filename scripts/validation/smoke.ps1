# 실행 중인 FINOVA API 스모크 테스트 (기본 http://localhost:8080)
param([string]$Base = "http://localhost:8080", [string]$Token = "finova-dev-admin")
$ErrorActionPreference = "Stop"
$fail = 0
function Check($name, [scriptblock]$fn) {
  try { $r = & $fn; if ($r) { Write-Host "PASS $name" } else { Write-Host "FAIL $name"; $script:fail++ } }
  catch { Write-Host "FAIL $name : $($_.Exception.Message)"; $script:fail++ }
}
$h = @{ "content-type" = "application/json" }
Check "health" { (Invoke-RestMethod "$Base/api/health").status -eq "ok" }
Check "clients seeded" { (Invoke-RestMethod "$Base/api/clients").Count -ge 5 }
Check "calculate client_a surplus" {
  $r = Invoke-RestMethod "$Base/api/scenarios/calculate" -Method Post -Headers $h -Body '{"clientId":"client_a","adjustments":{}}'
  ($r.metrics | Where-Object key -eq "monthly_surplus").value -eq 1100000
}
Check "admin required" {
  try { Invoke-RestMethod "$Base/api/ideas/rollback" -Method Post -Headers $h; $false } catch { $_.Exception.Response.StatusCode.value__ -eq 401 }
}
Check "versions (admin)" { (Invoke-RestMethod "$Base/api/topics/versions" -Headers @{ "x-admin-token" = $Token }).versions.Count -ge 6 }
Check "invalid json rejected" {
  try { Invoke-RestMethod "$Base/api/scenarios/calculate" -Method Post -Headers $h -Body '{"clientId":"client_a","adjustments":{"x":1}}'; $false } catch { $_.Exception.Response.StatusCode.value__ -eq 400 }
}
if ($fail -gt 0) { Write-Host "$fail check(s) failed"; exit 1 } else { Write-Host "all smoke checks passed" }
