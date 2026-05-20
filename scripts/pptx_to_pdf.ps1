# Convert the Roomard pitch deck .pptx -> .pdf.
#
# Looks for the most recent roomard-pitch-deck-*.pptx in the sibling
# `submission_media/` folder and writes the .pdf next to it. Tries PowerPoint
# COM first (best fidelity on Windows); falls back to LibreOffice (soffice) if
# PowerPoint is not installed. The path is derived from the script location so
# the script keeps working regardless of where roomard/ is cloned.
#
# Ported from ATRIO (AT-Hack0021); adds the LibreOffice fallback.

$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$out = Resolve-Path (Join-Path $here '..\submission_media') | ForEach-Object Path

$pptx = Get-ChildItem $out -Filter 'roomard-pitch-deck-*.pptx' | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $pptx) {
    Write-Host "No pptx found in $out" -ForegroundColor Red
    Write-Host "Run first:  python scripts/build_pitch_deck.py" -ForegroundColor Yellow
    exit 1
}
$pdf = [System.IO.Path]::ChangeExtension($pptx.FullName, '.pdf')
Write-Host "Converting: $($pptx.Name) -> $(Split-Path -Leaf $pdf)"

function Backup-Pdf($pdfPath) {
    $backup = Join-Path $out '_backup'
    New-Item -Path $backup -ItemType Directory -Force | Out-Null
    Copy-Item $pdfPath (Join-Path $backup (Split-Path -Leaf $pdfPath)) -Force
    Write-Host "  backup: $(Join-Path $backup (Split-Path -Leaf $pdfPath))"
}

# ---- Attempt 1: PowerPoint COM ----
$ppt = $null
$pres = $null
$ok = $false
try {
    $ppt = New-Object -ComObject PowerPoint.Application
    $ppt.Visible = [Microsoft.Office.Core.MsoTriState]::msoTrue
    $ppSaveAsPDF = 32
    $pres = $ppt.Presentations.Open($pptx.FullName, $true, $true, $false)
    $pres.SaveAs($pdf, $ppSaveAsPDF)
    $pres.Close()
    $ok = $true
    Write-Host "  pdf (PowerPoint): $pdf ($([math]::Round((Get-Item $pdf).Length / 1KB, 1)) KB)" -ForegroundColor Green
    Backup-Pdf $pdf
} catch {
    Write-Host "  PowerPoint COM unavailable ($($_.Exception.Message)) - trying LibreOffice" -ForegroundColor Yellow
} finally {
    if ($pres) { try { [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($pres) } catch {} }
    if ($ppt)  { try { $ppt.Quit() } catch {}; try { [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($ppt) } catch {} }
    [System.GC]::Collect(); [System.GC]::WaitForPendingFinalizers()
}

# ---- Attempt 2: LibreOffice headless ----
if (-not $ok) {
    $soffice = Get-Command soffice -ErrorAction SilentlyContinue
    if (-not $soffice) {
        $candidates = @(
            'C:\Program Files\LibreOffice\program\soffice.exe',
            'C:\Program Files (x86)\LibreOffice\program\soffice.exe'
        )
        $soffice = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
    } else {
        $soffice = $soffice.Source
    }
    if (-not $soffice) {
        Write-Host "Neither PowerPoint nor LibreOffice available." -ForegroundColor Red
        Write-Host "Install LibreOffice (winget install TheDocumentFoundation.LibreOffice) or open the pptx and Export to PDF manually." -ForegroundColor Yellow
        exit 1
    }
    & $soffice --headless --convert-to pdf --outdir $out $pptx.FullName | Out-Null
    if (Test-Path $pdf) {
        Write-Host "  pdf (LibreOffice): $pdf ($([math]::Round((Get-Item $pdf).Length / 1KB, 1)) KB)" -ForegroundColor Green
        Backup-Pdf $pdf
    } else {
        Write-Host "LibreOffice conversion produced no PDF." -ForegroundColor Red
        exit 1
    }
}
