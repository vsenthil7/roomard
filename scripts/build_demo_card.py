"""
Build a sample handwritten-style check-in card image for the Roomard demo
walkthrough (the UC-01 capture stage uploads it). Produces demo/checkin-card.png.

Pure Pillow. Uses a handwriting-ish font if available, else a regular fallback.
This is a synthetic demo asset - not a real guest's data.
"""
from __future__ import annotations

from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

W, H = 1000, 640
PAPER = (0xFB, 0xF8, 0xF0)
INK = (0x1a, 0x2a, 0x33)
LINE = (0xCF, 0xD8, 0xDC)
ACCENT = (0x0a, 0x4a, 0x3f)
HAND = (0x20, 0x3a, 0x55)


def font(size, weight="regular", hand=False):
    cands = []
    if hand:
        cands = ["C:/Windows/Fonts/Gabriola.ttf", "C:/Windows/Fonts/segoesc.ttf",
                 "C:/Windows/Fonts/Inkfree.ttf", "C:/Windows/Fonts/comic.ttf"]
    elif weight == "bold":
        cands = ["C:/Windows/Fonts/Inter-Bold.ttf", "C:/Windows/Fonts/segoeuib.ttf",
                 "C:/Windows/Fonts/arialbd.ttf"]
    else:
        cands = ["C:/Windows/Fonts/Inter-Regular.ttf", "C:/Windows/Fonts/segoeui.ttf",
                 "C:/Windows/Fonts/arial.ttf"]
    for c in cands:
        try:
            return ImageFont.truetype(c, size=size)
        except (OSError, IOError):
            continue
    return ImageFont.load_default()


def main():
    img = Image.new("RGB", (W, H), PAPER)
    d = ImageDraw.Draw(img)

    # Header band
    d.rectangle([0, 0, W, 90], fill=ACCENT)
    d.text((40, 26), "The Cobbled Yard  -  Guest Check-In Card", fill=PAPER, font=font(34, "bold"))

    # Field labels + handwritten values
    fields = [
        ("Guest name", "Eleanor M. Whitcombe"),
        ("Room", "Garden Suite 4"),
        ("Arrival", "20 May 2026   -   approx 15:30"),
        ("Pillow preference", "firm, two extra"),
        ("Dietary / allergy", "no shellfish; oat milk please"),
        ("Special request", "quiet room, late checkout if poss."),
        ("Notes", "returning guest - 3rd stay this year"),
    ]
    y = 130
    lab_f = font(22, "bold")
    val_f = font(30, hand=True)
    for label, value in fields:
        d.text((40, y), label.upper(), fill=ACCENT, font=lab_f)
        d.line([(330, y + 34), (W - 50, y + 34)], fill=LINE, width=2)
        d.text((340, y - 4), value, fill=HAND, font=val_f)
        y += 64

    # Signature
    d.text((40, y + 6), "SIGNATURE", fill=ACCENT, font=lab_f)
    d.line([(330, y + 40), (W - 50, y + 40)], fill=LINE, width=2)
    d.text((345, y - 6), "E. Whitcombe", fill=HAND, font=font(34, hand=True))

    out = Path(__file__).resolve().parent.parent / "demo" / "checkin-card.png"
    out.parent.mkdir(parents=True, exist_ok=True)
    img.save(out, "PNG", optimize=True)
    print(f"check-in card -> {out} ({out.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
