"""
Build the Roomard submission cover image.

Produces three variants:
  - cover-square-1200x1200.png   (thumbnail / social square)
  - cover-banner-1600x900.png    (16:9 hero banner)
  - cover-og-1200x630.png        (Open Graph / Twitter card)

All three share the pitch deck's design language, re-themed to Roomard:
  - Deep-teal #031a15 background, paper #ffffff text, teal #10b981 accent
  - Massive Roomard wordmark (auto-fit to canvas width)
  - Editorial subtitle
  - Top-strip "AT-HACK0019 · BAIDU BUILD WITH MEDO 2026" marker
  - Bottom footer with repo URL

Ported from ATRIO (AT-Hack0021). Pure Pillow - uses Inter / Segoe UI / Arial
fallbacks shipped with Windows. Title position uses font.getmetrics() to compute
true ascent + descent (Pillow's textbbox under-reports descenders for bold sans).
"""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


# ---------- Brand (Roomard) ----------
INK = (0x03, 0x1A, 0x15)          # roomard-900
PAPER = (0xFF, 0xFF, 0xFF)
TEXT_PRIMARY = (0xE6, 0xF4, 0xF1) # roomard-50
TEXT_SECONDARY = (0xBF, 0xE1, 0xD9)  # roomard-100
TEAL = (0x10, 0xB9, 0x81)
BLUE = (0x3B, 0x82, 0xF6)

WORDMARK = "Roomard"
SUBTITLE = "The AI guest-memory engine."
HACK = "AT-HACK0019 \u00b7 BAIDU BUILD WITH MEDO 2026"
FOOTER = "github.com/vsenthil7/roomard   \u00b7   AI guest-memory engine"


def _load_font(size: int, weight: str = "regular") -> ImageFont.FreeTypeFont:
    if weight == "bold":
        candidates = [
            "C:/Windows/Fonts/Inter-Bold.ttf",
            "C:/Windows/Fonts/segoeuib.ttf",
            "C:/Windows/Fonts/arialbd.ttf",
        ]
    elif weight == "italic":
        candidates = [
            "C:/Windows/Fonts/Inter-Italic.ttf",
            "C:/Windows/Fonts/segoeuii.ttf",
            "C:/Windows/Fonts/ariali.ttf",
        ]
    else:
        candidates = [
            "C:/Windows/Fonts/Inter-Regular.ttf",
            "C:/Windows/Fonts/segoeui.ttf",
            "C:/Windows/Fonts/arial.ttf",
        ]
    for c in candidates:
        try:
            return ImageFont.truetype(c, size=size)
        except (OSError, IOError):
            continue
    return ImageFont.load_default()


def _text_w(draw: ImageDraw.ImageDraw, text: str, font) -> int:
    bbox = draw.textbbox((0, 0), text, font=font)
    return bbox[2] - bbox[0]


def _font_full_height(font: ImageFont.FreeTypeFont) -> int:
    ascent, descent = font.getmetrics()
    return ascent + descent


def _fit_font(draw, text: str, target_width: int, max_size: int, weight: str = "bold"):
    size = max_size
    while size > 20:
        font = _load_font(size, weight=weight)
        if _text_w(draw, text, font) <= target_width:
            return font, size
        size -= 8
    return _load_font(20, weight=weight), 20


def make_cover(width: int, height: int, layout: str = "square") -> Image.Image:
    img = Image.new("RGB", (width, height), INK)
    draw = ImageDraw.Draw(img)
    margin = max(40, width // 30)

    # ---------- Top strip ----------
    tick_w = max(28, width // 50)
    tick_h = max(6, height // 200)
    draw.rectangle([margin, margin, margin + tick_w, margin + tick_h], fill=TEAL)
    label_font = _load_font(max(14, width // 80))
    draw.text((margin + tick_w + 12, margin - 4), HACK, fill=TEXT_SECONDARY, font=label_font)

    # ---------- Title sizing ----------
    if layout == "square":
        title_area_w = width - 2 * margin
        max_title_size = int(width * 0.20)
        title_y = int(height * 0.18)
    elif layout == "banner":
        title_area_w = int(width * 0.55) - margin
        max_title_size = int(height * 0.32)
        title_y = int(height * 0.18)
    else:  # og
        title_area_w = int(width * 0.55) - margin
        max_title_size = int(height * 0.34)
        title_y = int(height * 0.16)

    title_font, title_size = _fit_font(draw, WORDMARK, title_area_w, max_title_size, "bold")
    title_full_h = _font_full_height(title_font)
    title_w = _text_w(draw, WORDMARK, title_font)
    title_x = margin

    draw.text((title_x, title_y), WORDMARK, fill=PAPER, font=title_font)
    bottom_of_title = title_y + title_full_h

    # ---------- Teal underline ----------
    underline_gap = max(16, title_size // 18)
    underline_h = max(6, title_size // 50)
    underline_w = max(80, title_w // 4)
    underline_y = bottom_of_title + underline_gap
    draw.rectangle([title_x, underline_y, title_x + underline_w, underline_y + underline_h], fill=TEAL)

    # ---------- Subtitle ----------
    sub_max = title_size // 3
    sub_font, sub_size = _fit_font(draw, SUBTITLE, title_area_w, sub_max, "italic")
    sub_full_h = _font_full_height(sub_font)
    sub_gap = max(24, title_size // 12)
    sub_y = underline_y + underline_h + sub_gap
    draw.text((title_x, sub_y), SUBTITLE, fill=PAPER, font=sub_font)
    bottom_of_sub = sub_y + sub_full_h

    # ---------- Tagline ----------
    if layout == "square":
        tagline_lines = [
            "Capture every preference \u00b7 brief every shift.",
            "Prepare every room. Audit-grade by default.",
        ]
    else:
        tagline_lines = [
            "For boutique hotels \u00b7 capture, brief, prepare \u00b7 audit-grade.",
        ]
    tagline_max = max(20, sub_size // 2)
    tagline_font, tagline_size = _fit_font(
        draw, max(tagline_lines, key=len), title_area_w, tagline_max, weight="regular"
    )
    line_height = int(_font_full_height(tagline_font) * 1.35)
    tagline_y = bottom_of_sub + max(28, sub_size // 4)
    footer_font = _load_font(max(12, width // 100))
    footer_h = _font_full_height(footer_font)
    bottom_safe = height - margin - footer_h - max(20, height // 40)
    needed_h = line_height * len(tagline_lines)
    if tagline_y + needed_h > bottom_safe:
        tagline_y = bottom_safe - needed_h
    for i, line in enumerate(tagline_lines):
        draw.text((title_x, tagline_y + i * line_height), line, fill=TEXT_PRIMARY, font=tagline_font)

    # ---------- Footer ----------
    draw.text((margin, height - margin - footer_h), FOOTER, fill=TEXT_SECONDARY, font=footer_font)

    # ---------- KPI grid (banner + og only) ----------
    if layout in ("banner", "og"):
        right_x = int(width * 0.60)
        kpis = [
            ("356", "tests pass"),
            ("87.5%", "mean coverage"),
            ("39", "findings fixed"),
            ("0", "open issues"),
        ]
        cell_w = (width - right_x - margin) // 2
        cell_h = (height - int(height * 0.30) - int(margin * 2)) // 2

        kpi_size = max(28, height // 6)
        while kpi_size > 24:
            kpi_font = _load_font(kpi_size, weight="bold")
            longest = max(_text_w(draw, big, kpi_font) for big, _ in kpis)
            if longest <= cell_w - 24:
                break
            kpi_size -= 4
        kpi_font = _load_font(kpi_size, weight="bold")
        small_font = _load_font(max(11, height // 55))

        kpi_top_y = int(height * 0.27)
        for i, (big, small) in enumerate(kpis):
            col = i % 2
            row = i // 2
            bx = right_x + col * (cell_w + 14)
            by = kpi_top_y + row * (cell_h + 14)
            draw.rectangle([bx, by, bx + cell_w, by + cell_h], outline=TEAL, width=3)
            bw = _text_w(draw, big, kpi_font)
            bh = _font_full_height(kpi_font)
            draw.text((bx + (cell_w - bw) // 2, by + (cell_h - bh) // 2 - cell_h // 12),
                      big, fill=PAPER, font=kpi_font)
            sw = _text_w(draw, small, small_font)
            sh = _font_full_height(small_font)
            draw.text((bx + (cell_w - sw) // 2, by + cell_h - sh - 14),
                      small, fill=TEXT_SECONDARY, font=small_font)

    return img


def main():
    out_dir = Path(__file__).resolve().parent.parent / "submission_media"
    out_dir.mkdir(parents=True, exist_ok=True)

    variants = [
        ("cover-square-1200x1200.png", 1200, 1200, "square"),
        ("cover-banner-1600x900.png",  1600, 900,  "banner"),
        ("cover-og-1200x630.png",      1200, 630,  "og"),
    ]
    for name, w, h, layout in variants:
        img = make_cover(w, h, layout)
        out = out_dir / name
        img.save(out, "PNG", optimize=True)
        kb = out.stat().st_size // 1024
        print(f"  {name}: {w}x{h}  ({kb} KB)")
    print(f"cover images -> {out_dir}")


if __name__ == "__main__":
    main()
