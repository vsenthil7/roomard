"""
Shared OCR helpers + RUBRIC for the Roomard demo video. Imported by grade-frames.py.

Ported from ATRIO (AT-Hack0021). Only the RUBRIC changes between projects.

The RUBRIC mirrors the captions emitted by demovideo/.runner/specs/full-walkthrough.spec.ts.
Each row: (id, [substrings that must ALL appear across all frames' OCR text]).

Note: rubric items target the SHORTEST, most-distinctive phrase from each caption.
OCR is imperfect on the ~100-200ms pill display, so we don't insist on every
phrase - just one or two unique identifiers per scene.
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

# Roomard demo rubric - matches the captions in full-walkthrough.spec.ts.
RUBRIC = [
    ("title-card-opening",          ["Roomard", "MEDO"]),
    ("stage-1-scene-card",          ["STAGE 1", "DAILY ARRIVAL BRIEF", "GIVEN", "WHEN", "THEN"]),
    ("stage-1-signed-in",           ["Signed in", "front-desk"]),
    ("stage-1-brief-pill",          ["arrival brief", "priority"]),
    ("stage-2-scene-card",          ["STAGE 2", "GUEST LOOKUP"]),
    ("stage-2-directory-pill",      ["Guest directory", "search"]),
    ("stage-2-trajectory-pill",     ["trajectory", "ERNIE X1"]),
    ("stage-3-scene-card",          ["STAGE 3", "CARD CAPTURE"]),
    ("stage-3-capture-pill",        ["Capture screen", "offline"]),
    ("stage-3-ocr-pill",            ["PaddleOCR", "extraction"]),
    ("stage-4-scene-card",          ["STAGE 4", "EXCEPTION QUEUE", "PREP"]),
    ("stage-4-exceptions-pill",     ["Exception queue", "review"]),
    ("stage-4-prep-pill",           ["prep cards", "audit log"]),
    ("title-card-closing",          ["Roomard", "audit-grade", "356 tests"]),
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
