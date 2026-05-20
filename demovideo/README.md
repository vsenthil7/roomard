# Roomard Demo Video Pipeline

Captioned, narration-free ~4-minute walkthrough recorded via Playwright,
with **two independent verifications** (structural + vision) that prove
the recording shows the right states.

Ported from the ATRIO Boardroom (AT-Hack0021), MendoraCI (AT-Hack0020) and
Auditex (AT-Hack0014) sibling projects. Same isolated-runner pattern, same
caption-overlay helper, same verification-a + verification-b split.

## Folder layout

```
demovideo/
  README.md                                 # this file
  creation/
    run-creation.ps1                        # 3-step orchestrator: preflight -> record -> archive
    README.md
  verification-a/
    structural-review.spec.ts               # 24 hard assertions against the live API gateway
    run-verify-a.ps1
    README.md
  verification-b/
    extract-frames.py                       # ffmpeg wrapper
    grade-frames.py                         # OCR + rubric
    grade_frames_lib.py                     # OCR helpers + RUBRIC (the only project-specific file)
    run-verify-b.ps1                        # extract + grade + report
    requirements.txt
    README.md
  .runner/                                  # isolated Playwright install (gitignored)
    package.json
    playwright.demo.config.ts
    specs/
      caption-overlay.ts
      full-walkthrough.spec.ts
  results/
    creation/
      latest.txt                            # pointer to most recent recording (gitignored)
```

## End-to-end pipeline

```powershell
# 0) bring the stack up (and provision once, if not already seeded)
cd roomard/docker
docker compose up -d
# first time only:
#   set DATABASE_URL=postgres://roomard:roomard_dev_pwd@127.0.0.1:5532/roomard
#   pnpm --filter @roomard/db run migrate
#   pnpm --filter @roomard/db run seed

# 1) install isolated runner (first time only)
cd ../demovideo/.runner
npm install
.\node_modules\.bin\playwright.cmd install chromium
cd ../..

# 2) RECORD the demo
pwsh ./demovideo/creation/run-creation.ps1
#    -> demo/roomard-walkthrough-{stamp}-main.mp4

# 3) VERIFY-A - structural review (24 hard assertions, ~30s)
pwsh ./demovideo/verification-a/run-verify-a.ps1
#    -> verification-a/reports/structural-review-{stamp}.txt

# 4) VERIFY-B - vision review (OCR + rubric, ~2-3min)
pwsh ./demovideo/verification-b/run-verify-b.ps1
#    -> verification-b/reports/vision-review-{stamp}.json
```

Both verifications passing on the same commit is the by-construction proof
that the recorded video shows the right states. We commit the verification
reports alongside the video.

## What the ~4-minute video shows

| Stage | Actor | What | UC | Duration |
|---|---|---|---|---|
| Opening title | - | Roomard branding + Baidu Build with MeDo 2026 marker | - | 5s |
| 1 - Daily arrival brief | FD manager | Sign in - land on the morning brief: prioritised arrivals, AI notes, evidence drill-down | UC-07 | ~50s |
| 2 - Guest lookup + trajectory | FD agent | Search a guest - open the profile: 3-bullet preferences, last-stay summary, complaint-trajectory flag | UC-08 / UC-11 | ~55s |
| 3 - Card capture (OCR) | FD agent | Capture screen - upload a handwritten check-in card - PaddleOCR-VL + ERNIE 4.5 extraction - low confidence routes to review | UC-01 | ~45s |
| 4 - Exception queue + prep cards | FD/HK | Confidence review queue - housekeeping prep cards for tomorrow - two-tap completion - all audited | UC-23 / UC-09 | ~50s |
| Closing title | - | 356 tests - 12 DB integration tests - 39 findings fixed - multi-tenant RLS - repo URL | - | 6s |

## Prerequisites

- Docker Desktop running, `roomard-web` (:8180), `roomard-api-gateway` (:3100), `roomard-postgres` all healthy
- The demo tenant seeded (admin@demo.roomard.local / Roomard123! / slug `demo`)
- Node 20+ on host
- ffmpeg + Tesseract on PATH (for verification-b)
- Python 3.10+ with pillow + pytesseract (for verification-b)

## Outputs committed to git

| Path | What | Tracked? |
|---|---|---|
| `demo/roomard-walkthrough-*.mp4` | MP4 recording (submission upload) | yes (via `git add -f`) |
| `demo/roomard-walkthrough-*.webm` | WebM source | gitignored |
| `demo/_backup/` | Backups | gitignored |
| `demovideo/.runner/` | Isolated Playwright install | gitignored |
| `demovideo/results/creation/latest.txt` | Pointer | gitignored |
| `demovideo/verification-a/reports/*.txt` | Structural review reports | yes |
| `demovideo/verification-b/reports/*.json` | Vision review reports | yes |
| `demovideo/verification-b/frames/` | OCR working dir | gitignored |
