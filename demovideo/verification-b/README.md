# verification-b/ - vision review

Extracts frames from the recorded video and OCRs them, then grades the combined
text against a **RUBRIC** of expected caption phrases. Catches "right flow, wrong
caption" failures that verification-a (logic-level) cannot see.

```powershell
pwsh ./demovideo/verification-b/run-verify-b.ps1
#  -> reports/vision-review-{stamp}.json
```

Pipeline: read `results/creation/latest.txt` -> `extract-frames.py` (1 frame / 2s
via ffmpeg) -> `grade-frames.py` (two-pass OCR: normal + inverted, for the
dark-teal caption cards) -> JSON report with per-rubric pass/fail and a pass rate.

## RUBRIC (14 items, in `grade_frames_lib.py`)

Mirrors the captions emitted by `.runner/specs/full-walkthrough.spec.ts`:
opening title -> stage-1 brief -> stage-2 lookup + trajectory -> stage-3 capture +
OCR -> stage-4 exceptions + prep cards -> closing title. Each item lists the
shortest distinctive phrase(s) that must appear; OCR-tolerant matching allows
the common i/l confusion.

**The RUBRIC is the only project-specific file** - to reuse this folder in
another project, swap the `RUBRIC` list and leave everything else.

## Prerequisites

- ffmpeg on PATH (`winget install Gyan.FFmpeg`)
- Tesseract on PATH (`winget install UB-Mannheim.TesseractOCR`)
- `pip install -r requirements.txt`
