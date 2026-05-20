"""
Shared OCR helpers + RUBRIC for the Roomard pitch-deck vision review.

The RUBRIC is intentionally LESS strict than verification-a's text assertions:
because OCR is imperfect, we only require the SHORTEST, most-distinctive phrase
per slide. verification-a (PDF text extraction) catches text drift;
verification-b (OCR over rendered pixels) catches "renders blank" or "font not
embedded so glyphs are wrong".

Ported from ATRIO (AT-Hack0021); RUBRIC re-written for the 12 Roomard slides
built by scripts/build_pitch_deck.py.
"""
import sys
from pathlib import Path

try:
    import pytesseract
    from PIL import Image, ImageOps
except ImportError as e:
    print("[verify-b] missing dep:", e)
    print("  pip install -r submission_media/verification-b/requirements.txt")
    sys.exit(2)

RUBRIC = [
    ("slide-1-title",        ["Roomard", "guest-memory"]),
    ("slide-2-problem",      ["problem", "boutique"]),
    ("slide-3-solution",     ["CAPTURE", "BRIEF", "PREPARE"]),
    ("slide-4-use-cases",    ["wedge", "UC-07", "UC-29"]),
    ("slide-5-ai",           ["PaddleOCR", "ERNIE", "Qianfan"]),
    ("slide-6-demo",         ["Live demo", "CARD CAPTURE"]),
    ("slide-7-proof",        ["356", "findings fixed"]),
    ("slide-8-architecture", ["Architecture", "FRONTEND"]),
    ("slide-9-trust",        ["trustworthy", "security"]),
    ("slide-10-next",        ["ships next", "Platform"]),
    ("slide-11-team",        ["ask", "Qianfan"]),
    ("slide-12-closing",     ["Every preference", "roomard"]),
]


def ocr_text(page_image_path: Path) -> str:
    """Two-pass OCR: original + inverted (the Roomard deck is dark-teal)."""
    try:
        img = Image.open(page_image_path).convert("RGB")
        text_normal = pytesseract.image_to_string(img)
        gray = img.convert("L")
        mean = sum(gray.getdata()) / (gray.width * gray.height)
        if mean < 100:
            inverted = ImageOps.invert(gray)
            return text_normal + "\n" + pytesseract.image_to_string(inverted)
        return text_normal + "\n" + pytesseract.image_to_string(ImageOps.invert(gray))
    except Exception:
        return ""
