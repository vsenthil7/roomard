"""
Shared OCR helpers + RUBRIC for the Roomard demo video. Imported by grade-frames.py.

The RUBRIC mirrors what is ACTUALLY on screen in
demovideo/.runner/specs/full-walkthrough.spec.ts (the verdict-panel edition):
each demo stage runs a LIVE API assertion during recording and renders a
test-runner verdict panel (showVerdict) showing the request, the product's
real returned value, and a PASS/FAIL badge. The rubric therefore checks for
(a) the scene-card BDD headers, and (b) the verdict-panel text that proves a
live assertion was shown on screen.

Each row is (id, why, [substrings that must ALL appear across all frames' OCR]).
  - id   : stable identifier for the scene/verdict being checked
  - why  : plain-English explanation of WHAT this row proves about the video
           (so a reader of the report understands each pass/fail, not just a code)
  - needles: the SHORTEST distinctive substrings. OCR runs on 2s-spaced frames
           and is imperfect, so we target text that dwells >=3s and pick 1-3
           high-signal tokens rather than whole sentences.

If you change a caption or verdict title in the spec, update the matching row
here in the same commit - the rubric and the spec are a contract.
"""
import sys
from pathlib import Path

try:
    import pytesseract
    from PIL import Image, ImageOps
except ImportError as e:
    print("[verify-b] missing dep:", e)
    print("  pip install -r demovideo/verification-b/requirements.txt")
    sys.exit(2)

# Roomard demo rubric - matches the on-screen text in full-walkthrough.spec.ts.
# (id, why, needles). `why` is printed in the report so each row is self-explaining.
RUBRIC = [
    ("title-card-opening",   "Opening brand card is shown (Roomard, hackathon tag)",
        ["Roomard", "MEDO"]),
    ("stage-1-scene-card",   "Stage 1 BDD scene card (GIVEN/WHEN/THEN) introduces the auth test",
        ["STAGE 1", "DAILY ARRIVAL BRIEF", "GIVEN", "WHEN", "THEN"]),
    ("stage-1-auth-verdict", "Stage 1 LIVE verdict panel: GET /v1/auth/me ran and PASSED on screen",
        ["STAGE 1", "AUTH", "PASS"]),
    ("stage-1-brief",        "The real daily arrival brief screen is shown",
        ["arrival"]),
    ("stage-2-scene-card",   "Stage 2 BDD scene card introduces the guest-lookup tests",
        ["STAGE 2", "GUEST LOOKUP"]),
    ("stage-2-directory-verdict", "Stage 2.1 verdict: GET /v1/guests returned real guests (live count shown)",
        ["DIRECTORY", "guests", "PASS"]),
    ("stage-2-prefs-verdict", "Stage 2.2 verdict: a real guest's preferences returned 200 with real values",
        ["PREFERENCES", "PASS"]),
    ("stage-2-trajectory-verdict", "Stage 2.3 verdict: UC-11 complaint-trajectory endpoint produced a verdict",
        ["TRAJECTORY", "PASS"]),
    ("stage-3-scene-card",   "Stage 3 BDD scene card introduces the card-capture test",
        ["STAGE 3", "CARD CAPTURE"]),
    ("stage-3-capture-verdict", "Stage 3 verdict: capture-read contract proven (unknown id -> honest 404, not 500)",
        ["CAPTURE", "404", "PASS"]),
    ("stage-4-scene-card",   "Stage 4 BDD scene card introduces the queue + audit test",
        ["STAGE 4", "EXCEPTION QUEUE", "AUDIT"]),
    ("stage-4-queue-verdict", "Stage 4 verdict: exception queue + audit log both live with real event counts",
        ["QUEUE", "AUDIT", "PASS"]),
    ("stage-5-scene-card",   "Stage 5 BDD scene card introduces the regression-test layer",
        ["STAGE 5", "REGRESSION"]),
    ("stage-5-integration-verdict", "Stage 5 verdict: the 12 real-DB integration tests ran and PASSED on screen",
        ["INTEGRATION TESTS", "TOTAL", "PASS"]),
    ("title-card-closing",   "Closing card states the proof summary (live assertions, tests)",
        ["Roomard", "regression"]),
]


def ocr_text(frame_path: Path) -> str:
    """Two-pass OCR: original + inverted (for dark-background captions)."""
    try:
        img = Image.open(frame_path).convert("RGB")
        text_normal = pytesseract.image_to_string(img)
        gray = img.convert("L")
        mean = sum(gray.getdata()) / (gray.width * gray.height)
        if mean < 100:
            inverted = ImageOps.invert(gray)
            text_inverted = pytesseract.image_to_string(inverted)
            return text_normal + "\n" + text_inverted
        text_inverted = pytesseract.image_to_string(ImageOps.invert(gray))
        return text_normal + "\n" + text_inverted
    except Exception:
        return ""
