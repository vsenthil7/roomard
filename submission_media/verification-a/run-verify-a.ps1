# Roomard Pitch Deck - verification-a - run script
#
# Runs structural-review.py against the most recent roomard-pitch-deck-*.pdf.
# Ported from ATRIO (AT-Hack0021).

$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$submission = Split-Path -Parent $here

Write-Host ''
Write-Host '[verify-a] === Roomard Pitch Deck . Structural review ===' -ForegroundColor Yellow

# 1) PyMuPDF check
Write-Host '[verify-a] pre-flight: PyMuPDF' -ForegroundColor Cyan
$pyExe = (Get-Command python -ErrorAction SilentlyContinue).Source
if (-not $pyExe) { Write-Host '[verify-a] python not on PATH' -ForegroundColor Red; exit 1 }
& $pyExe -c "import fitz" 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host '[verify-a] PyMuPDF not installed - installing now' -ForegroundColor Yellow
    & $pyExe -m pip install --quiet PyMuPDF
}
Write-Host "  python: $pyExe"

# 2) Locate the latest pdf
$pdf = Get-ChildItem $submission -Filter 'roomard-pitch-deck-*.pdf' -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $pdf) {
    Write-Host "[verify-a] no roomard-pitch-deck-*.pdf in $submission" -ForegroundColor Red
    Write-Host '  Build first: python scripts/build_pitch_deck.py; pwsh scripts/pptx_to_pdf.ps1' -ForegroundColor Yellow
    exit 1
}
Write-Host "[verify-a] grading: $($pdf.Name) ($([math]::Round($pdf.Length / 1KB, 1)) KB)" -ForegroundColor Cyan

# 3) Run structural review
& $pyExe (Join-Path $here 'structural-review.py')
exit $LASTEXITCODE
