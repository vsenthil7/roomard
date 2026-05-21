# Roomard Demo Video Creation pipeline
# Builds the full ~4-minute walkthrough video using the ISOLATED Playwright runner.
#
# Steps:
#   1. Pre-flight: roomard docker stack up? (web :8180, api-gateway :3100)
#   2. Run Playwright captioned full-walkthrough spec
#   3. Trim leading frame + transcode to mp4 + archive both webm + mp4
#
# Ported from ATRIO (AT-Hack0021). Difference: Roomard has no /_test/seed-demo
# endpoint - the demo tenant (admin@demo.roomard.local / Roomard123! / slug 'demo')
# is provisioned once via the db CLI (16 migrations + seed), so there is no
# per-run reset step. Re-running the recording is idempotent against seeded data.
#
# Note: ffmpeg writes its banner to stderr, which trips $ErrorActionPreference='Stop'
# even on successful runs. We wrap ffmpeg calls in try/catch and check the
# OUTPUT FILE for success rather than the exit signal of the cmdlet.

$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent (Split-Path -Parent $here)
$demoDir = Join-Path $projectRoot 'demo'
$backupDir = Join-Path $demoDir '_backup'
$resultsDir = Join-Path (Split-Path -Parent $here) 'results\creation'
$runnerDir = Join-Path $projectRoot 'demovideo\.runner'

Write-Host ''
Write-Host '[creation] === Roomard Demo Video Creation ===' -ForegroundColor Yellow

# 1) Pre-flight
Write-Host '[creation] 1/3 pre-flight: docker stack up?' -ForegroundColor Cyan
$gwStatus = docker ps --filter 'name=roomard-api-gateway' --format '{{.Names}}:{{.Status}}' 2>$null
$webStatus = docker ps --filter 'name=roomard-web' --format '{{.Names}}:{{.Status}}' 2>$null
$pgStatus = docker ps --filter 'name=roomard-postgres' --format '{{.Names}}:{{.Status}}' 2>$null
if (-not ($gwStatus -match 'Up') -or -not ($webStatus -match 'Up') -or -not ($pgStatus -match 'Up')) {
    Write-Host '  stack not fully up - bring it up first:' -ForegroundColor Yellow
    Write-Host '    cd docker; docker compose up -d' -ForegroundColor Yellow
    Write-Host '  then provision (first time only):' -ForegroundColor Yellow
    Write-Host '    set DATABASE_URL=postgres://roomard:roomard_dev_pwd@127.0.0.1:5532/roomard; pnpm --filter @roomard/db run migrate; pnpm --filter @roomard/db run seed' -ForegroundColor Yellow
    exit 1
} else {
    Write-Host "  api-gateway : $gwStatus"
    Write-Host "  web         : $webStatus"
    Write-Host "  postgres    : $pgStatus"
}

# 2) Run playwright spec using ISOLATED runner
Write-Host '[creation] 2/3 running playwright full-walkthrough spec (isolated runner)' -ForegroundColor Cyan
$pwBin = Join-Path $runnerDir 'node_modules\.bin\playwright.cmd'
if (-not (Test-Path $pwBin)) {
    Write-Host "[creation] isolated runner not installed at $runnerDir" -ForegroundColor Red
    Write-Host '          first time? run:' -ForegroundColor Yellow
    Write-Host "          cd $runnerDir" -ForegroundColor Yellow
    Write-Host '          npm install' -ForegroundColor Yellow
    Write-Host '          .\node_modules\.bin\playwright.cmd install chromium' -ForegroundColor Yellow
    exit 1
}
Push-Location $runnerDir
try {
    $env:WEB_BASE_URL = if ($env:WEB_BASE_URL) { $env:WEB_BASE_URL } else { 'http://127.0.0.1:8180' }
    $env:API_BASE_URL = if ($env:API_BASE_URL) { $env:API_BASE_URL } else { 'http://127.0.0.1:3100' }
    & $pwBin test specs/full-walkthrough.spec.ts --config=playwright.demo.config.ts --reporter=line
    if ($LASTEXITCODE -ne 0) {
        Write-Host '[creation] playwright spec failed - aborting archive' -ForegroundColor Red
        exit $LASTEXITCODE
    }
} finally {
    Pop-Location
}

# 3) Locate + archive video(s)
Write-Host '[creation] 3/3 locating + archiving recorded video' -ForegroundColor Cyan
New-Item -Path $demoDir -ItemType Directory -Force | Out-Null
New-Item -Path $backupDir -ItemType Directory -Force | Out-Null
New-Item -Path $resultsDir -ItemType Directory -Force | Out-Null

$testResultsDir = Join-Path $runnerDir 'test-results-demo'
$videos = Get-ChildItem $testResultsDir -Recurse -Filter '*.webm' -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending
if (-not $videos) {
    Write-Host "[creation] no recorded videos found in $testResultsDir" -ForegroundColor Red
    exit 1
}

Write-Host "  Found $($videos.Count) recording(s):"
$stamp = Get-Date -Format 'yyyyMMdd_HHmmss'
$archived = @()
$i = 0
foreach ($v in $videos) {
    $i++
    $tag = if ($i -eq 1) { 'main' } else { "secondary-$i" }
    $dstName = "roomard-walkthrough-$stamp-$tag.webm"
    $dstMain = Join-Path $demoDir $dstName
    $dstBackup = Join-Path $backupDir $dstName

    $previousEAP = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        if (Get-Command ffmpeg -ErrorAction SilentlyContinue) {
            & ffmpeg -y -ss 0.5 -i $v.FullName -c:v libvpx -b:v 1.2M -crf 10 -an $dstMain *> $null
            if (-not (Test-Path $dstMain) -or (Get-Item $dstMain).Length -le 1KB) {
                Copy-Item $v.FullName $dstMain -Force
            }
        } else {
            Copy-Item $v.FullName $dstMain -Force
        }
        Copy-Item $dstMain $dstBackup -Force
        $sz = [math]::Round((Get-Item $dstMain).Length / 1MB, 2)
        Write-Host "    [$tag] $dstName  ($sz MB)"

        # MP4 transcode for lablab.ai-style upload (mp4 mandatory)
        if (Get-Command ffmpeg -ErrorAction SilentlyContinue) {
            $mp4Dst = [System.IO.Path]::ChangeExtension($dstMain, '.mp4')
            & ffmpeg -y -i $dstMain -c:v libx264 -crf 22 -preset slow -an $mp4Dst *> $null
            if ((Test-Path $mp4Dst) -and ((Get-Item $mp4Dst).Length -gt 1KB)) {
                $mp4Sz = [math]::Round((Get-Item $mp4Dst).Length / 1MB, 2)
                Write-Host "    [$tag] $([System.IO.Path]::GetFileName($mp4Dst))  ($mp4Sz MB)"
                $archived += $mp4Dst
            }
        }
        $archived += $dstMain
    } finally {
        $ErrorActionPreference = $previousEAP
    }
}

# Pointer
if ($archived.Count -gt 0) {
    Set-Content -Path (Join-Path $resultsDir 'latest.txt') -Value $archived[0] -Encoding ASCII
}

Write-Host ''
Write-Host '[creation] done' -ForegroundColor Green
Write-Host "  archived $($archived.Count) files in $demoDir"
Write-Host "  pointer  : $(Join-Path $resultsDir 'latest.txt')"
