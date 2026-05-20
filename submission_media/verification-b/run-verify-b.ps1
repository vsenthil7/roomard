# Roomard Pitch Deck - verification-b - run script
#
# Pipeline: locate latest pdf -> render pages -> OCR + rubric grade -> JSON report.
# Ported from ATRIO (AT-Hack0021).

$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$submission = Split-Path -Parent $here
$pagesDir = Join-Path $here 'pages'
$reportsDir = Join-Path $here 'reports'
New-Item -Path $reportsDir -ItemType Directory -Force | Out-Null

$stamp = Get-Date -Format 'yyyyMMdd_HHmmss'
$reportFile = Join-Path $reportsDir "vision-review-$stamp.json"

Write-Host ''
Write-Host '[verify-b] === Roomard Pitch Deck . Vision review (OCR + rubric) ===' -ForegroundColor Yellow

# 0) Locate the latest pdf
$pdf = Get-ChildItem $submission -Filter 'roomard-pitch-deck-*.pdf' -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $pdf) {
    Write-Host "[verify-b] no roomard-pitch-deck-*.pdf in $submission" -ForegroundColor Red
    exit 1
}
Write-Host "[verify-b] grading: $($pdf.Name)" -ForegroundColor Cyan

# 1) Tooling pre-flight
$pyExe = (Get-Command python -ErrorAction SilentlyContinue).Source
if (-not $pyExe) { Write-Host '[verify-b] python not on PATH' -ForegroundColor Red; exit 1 }
if (-not (Get-Command tesseract -ErrorAction SilentlyContinue)) {
    $tess = 'C:\Program Files\Tesseract-OCR'
    if (Test-Path (Join-Path $tess 'tesseract.exe')) {
        $env:Path = "$tess;$env:Path"
    } else {
        Write-Host '[verify-b] tesseract not on PATH - install: winget install UB-Mannheim.TesseractOCR' -ForegroundColor Red
        exit 1
    }
}
& $pyExe -c "import fitz, pytesseract, PIL" 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host '[verify-b] installing python deps' -ForegroundColor Yellow
    & $pyExe -m pip install --quiet -r (Join-Path $here 'requirements.txt')
}

# 2) Render every page to PNG
if (Test-Path $pagesDir) { Remove-Item -Recurse -Force $pagesDir }
Write-Host '[verify-b] rendering pages via PyMuPDF (zoom=1.5)' -ForegroundColor Cyan
& $pyExe (Join-Path $here 'extract-pages.py') --pdf $pdf.FullName --out $pagesDir --zoom 1.5
if ($LASTEXITCODE -ne 0) {
    Write-Host '[verify-b] extract-pages failed' -ForegroundColor Red
    exit $LASTEXITCODE
}

# 3) OCR + rubric grade
Write-Host '[verify-b] OCR + rubric grade' -ForegroundColor Cyan
& $pyExe (Join-Path $here 'grade-pages.py') --pages $pagesDir --report $reportFile
$gradeExit = $LASTEXITCODE

Write-Host ''
Write-Host "[verify-b] report : $reportFile"
if ($gradeExit -eq 0) {
    Write-Host '[verify-b] all rubric items PASS' -ForegroundColor Green
} else {
    Write-Host '[verify-b] some rubric items FAILED - review report' -ForegroundColor Yellow
}
exit $gradeExit
