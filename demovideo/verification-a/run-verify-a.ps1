# Roomard Demo Video - verification-a - run script
#
# Runs the structural-review spec (24 hard assertions) against the live API
# gateway on :3100. Ported from ATRIO (AT-Hack0021); preflight checks the
# roomard-* containers and there is no seed endpoint (Roomard is pre-seeded
# via the db CLI).

$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent (Split-Path -Parent $here)
$runnerDir = Join-Path $projectRoot 'demovideo\.runner'
$reportsDir = Join-Path $here 'reports'
New-Item -Path $reportsDir -ItemType Directory -Force | Out-Null

$stamp = Get-Date -Format 'yyyyMMdd_HHmmss'
$reportFile = Join-Path $reportsDir "structural-review-$stamp.txt"

Write-Host ''
Write-Host '[verify-a] === Structural review (24 hard assertions) ===' -ForegroundColor Yellow

# Pre-flight: gateway + web containers up
Write-Host '[verify-a] pre-flight: docker stack' -ForegroundColor Cyan
$gwStatus = docker ps --filter 'name=roomard-api-gateway' --format '{{.Names}}:{{.Status}}' 2>$null
$webStatus = docker ps --filter 'name=roomard-web' --format '{{.Names}}:{{.Status}}' 2>$null
if (-not ($gwStatus -match 'Up')) {
    Write-Host '[verify-a] api-gateway not up - aborting' -ForegroundColor Red
    Write-Host '          bring the stack up: cd docker && docker compose up -d' -ForegroundColor Yellow
    exit 1
}
Write-Host "  api-gateway: $gwStatus"
Write-Host "  web        : $webStatus"

# Copy spec into the isolated runner specs/ so it resolves @playwright/test
$specSrc = Join-Path $here 'structural-review.spec.ts'
$specDst = Join-Path $runnerDir 'specs\structural-review.spec.ts'
Copy-Item $specSrc $specDst -Force

# Run via isolated runner
$pwBin = Join-Path $runnerDir 'node_modules\.bin\playwright.cmd'
if (-not (Test-Path $pwBin)) {
    Write-Host "[verify-a] isolated runner not installed at $runnerDir" -ForegroundColor Red
    Write-Host '          first time? run:' -ForegroundColor Yellow
    Write-Host "          cd $runnerDir; npm install; .\node_modules\.bin\playwright.cmd install chromium" -ForegroundColor Yellow
    exit 1
}

Push-Location $runnerDir
try {
    $env:API_BASE_URL = if ($env:API_BASE_URL) { $env:API_BASE_URL } else { 'http://127.0.0.1:3100' }
    & $pwBin test specs/structural-review.spec.ts --config=playwright.demo.config.ts --reporter=line 2>&1 | Tee-Object -FilePath $reportFile
    $exitCode = $LASTEXITCODE
} finally {
    Pop-Location
}

Write-Host ''
Write-Host "[verify-a] report: $reportFile" -ForegroundColor Green
exit $exitCode
