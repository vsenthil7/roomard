"""
Build the Roomard logo set.

Roomard = a guest-memory engine for boutique hotels. The mark is a rounded
door/arch glyph (a room threshold) enclosing a small "memory dot" — the
remembered guest — in the brand teal. Three outputs, brand-consistent with the
deck + covers (deep teal #0a4a3f, pale-mint, Inter wordmark):

  - roomard-logo-mark.svg        vector glyph only (square, transparent)
  - roomard-logo-lockup.svg      glyph + "Roomard" wordmark (horizontal)
  - roomard-logo-mark-512.png    512x512 raster of the mark (transparent)
  - roomard-logo-mark-1024.png   1024x1024 raster of the mark (transparent)
  - roomard-logo-lockup-1600.png 1600-wide raster lockup on transparent bg
  - roomard-icon-32.png          favicon-size mark on teal tile (app icon)
  - roomard-icon-180.png         apple-touch-size mark on teal tile

PNG rasterisation prefers cairosvg; if unavailable, falls back to Pillow with a
hand-drawn equivalent of the mark so the script always produces the PNGs.

Outputs go to submission_media/logo/.
"""
from __future__ import annotations

from pathlib import Path

TEAL = "#0a4a3f"       # roomard-500
TEAL_DARK = "#073529"  # roomard-700
MINT = "#e6f4f1"       # roomard-50
ACCENT = "#10b981"     # signal green/teal accent

OUT = Path(__file__).resolve().parent.parent / "submission_media" / "logo"


# ----------------------------------------------------------------------------
# SVG sources
# ----------------------------------------------------------------------------
def mark_svg(size: int = 512, bg: str | None = None, glyph: str = TEAL,
             dot: str = ACCENT) -> str:
    """A rounded arch (room threshold) with a memory dot inside.

    The arch is an outlined shape (thick stroke) so it reads at small sizes;
    the dot is the remembered guest sitting within the room.
    """
    s = size
    pad = s * 0.16
    stroke = s * 0.11
    # Arch geometry: vertical legs + semicircular top.
    left = pad
    right = s - pad
    bottom = s - pad
    top = pad
    radius = (right - left) / 2
    cx = s / 2
    arch_top_y = top + radius
    bg_rect = (
        f'<rect width="{s}" height="{s}" rx="{s*0.22:.1f}" fill="{bg}"/>'
        if bg else ""
    )
    # Path: start bottom-left, up to where the arc begins, semicircle to the
    # right leg, down to bottom-right.
    d = (
        f"M {left:.1f} {bottom:.1f} "
        f"L {left:.1f} {arch_top_y:.1f} "
        f"A {radius:.1f} {radius:.1f} 0 0 1 {right:.1f} {arch_top_y:.1f} "
        f"L {right:.1f} {bottom:.1f}"
    )
    dot_r = s * 0.085
    dot_cy = bottom - s * 0.16
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="{s}" height="{s}" viewBox="0 0 {s} {s}">
  {bg_rect}
  <path d="{d}" fill="none" stroke="{glyph}" stroke-width="{stroke:.1f}" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="{cx:.1f}" cy="{dot_cy:.1f}" r="{dot_r:.1f}" fill="{dot}"/>
</svg>'''


def lockup_svg(height: int = 400) -> str:
    """Horizontal lockup: mark on the left, 'Roomard' wordmark on the right."""
    h = height
    mark_size = h
    # Inner mark (no bg), scaled into the left square.
    inner = mark_svg(mark_size, bg=None, glyph=TEAL, dot=ACCENT)
    # Strip the outer <svg> wrapper from inner to embed as a group.
    inner_body = inner.split(">", 1)[1].rsplit("</svg>", 1)[0]
    word_x = mark_size + h * 0.18
    word_size = h * 0.5
    underline_y = h * 0.66
    total_w = int(mark_size + h * 0.18 + word_size * 4.3)
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="{total_w}" height="{h}" viewBox="0 0 {total_w} {h}">
  <g>{inner_body}</g>
  <text x="{word_x:.1f}" y="{h*0.60:.1f}" font-family="Inter, Segoe UI, Arial, sans-serif" font-size="{word_size:.1f}" font-weight="700" fill="{TEAL}">Roomard</text>
  <rect x="{word_x:.1f}" y="{underline_y:.1f}" width="{word_size*1.1:.1f}" height="{h*0.035:.1f}" rx="{h*0.017:.1f}" fill="{ACCENT}"/>
</svg>'''


# ----------------------------------------------------------------------------
# Rasterisation
# ----------------------------------------------------------------------------
def rasterise(svg_text: str, png_path: Path, w: int, h: int | None = None) -> bool:
    try:
        import cairosvg  # type: ignore
        cairosvg.svg2png(bytestring=svg_text.encode("utf-8"),
                         write_to=str(png_path),
                         output_width=w,
                         output_height=h or w)
        return True
    except Exception:
        return False


def pillow_mark(size: int, png_path: Path, tile_bg: str | None = None) -> None:
    """Fallback raster of the mark using Pillow only."""
    from PIL import Image, ImageDraw

    def hx(c):
        c = c.lstrip("#")
        return tuple(int(c[i:i + 2], 16) for i in (0, 2, 4))

    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if tile_bg:
        r = int(size * 0.22)
        d.rounded_rectangle([0, 0, size, size], radius=r, fill=hx(tile_bg))
        glyph = hx(MINT)
        dot = hx(ACCENT)
    else:
        glyph = hx(TEAL)
        dot = hx(ACCENT)

    pad = size * 0.16
    stroke = max(2, int(size * 0.11))
    left, right = pad, size - pad
    bottom = size - pad
    top = pad
    radius = (right - left) / 2
    arch_top_y = top + radius
    # Semicircle top (arc) + two legs.
    d.arc([left, top, right, top + 2 * radius], start=180, end=360,
          fill=glyph, width=stroke)
    d.line([left, arch_top_y, left, bottom], fill=glyph, width=stroke)
    d.line([right, arch_top_y, right, bottom], fill=glyph, width=stroke)
    # Round the leg ends.
    rr = stroke / 2
    for x in (left, right):
        d.ellipse([x - rr, bottom - rr, x + rr, bottom + rr], fill=glyph)
    # Memory dot.
    dot_r = size * 0.085
    cx = size / 2
    dot_cy = bottom - size * 0.16
    d.ellipse([cx - dot_r, dot_cy - dot_r, cx + dot_r, dot_cy + dot_r], fill=dot)
    img.save(png_path, "PNG")


def pillow_lockup(width: int, png_path: Path) -> None:
    from PIL import Image, ImageDraw, ImageFont

    def hx(c):
        c = c.lstrip("#")
        return tuple(int(c[i:i + 2], 16) for i in (0, 2, 4))

    h = int(width / 4.0)
    img = Image.new("RGBA", (width, h), (0, 0, 0, 0))
    # Mark on the left.
    mark_png = png_path.parent / "_tmp_mark.png"
    pillow_mark(h, mark_png, tile_bg=None)
    mark = Image.open(mark_png).convert("RGBA")
    img.alpha_composite(mark, (0, 0))
    mark_png.unlink(missing_ok=True)
    d = ImageDraw.Draw(img)

    def font(sz):
        for c in ["C:/Windows/Fonts/Inter-Bold.ttf", "C:/Windows/Fonts/segoeuib.ttf",
                  "C:/Windows/Fonts/arialbd.ttf"]:
            try:
                return ImageFont.truetype(c, size=sz)
            except (OSError, IOError):
                continue
        return ImageFont.load_default()

    word_x = int(h + h * 0.18)
    word_size = int(h * 0.5)
    f = font(word_size)
    # Vertically centre the word against the mark.
    ascent, descent = f.getmetrics()
    word_y = int((h - (ascent + descent)) / 2) - int(h * 0.04)
    d.text((word_x, word_y), "Roomard", fill=hx(TEAL), font=f)
    # Underline.
    tw = d.textbbox((0, 0), "Roomard", font=f)[2]
    uy = word_y + ascent + int(h * 0.04)
    d.rounded_rectangle([word_x, uy, word_x + int(tw * 0.42), uy + int(h * 0.035)],
                        radius=int(h * 0.017), fill=hx(ACCENT))
    img.save(png_path, "PNG")


def main():
    OUT.mkdir(parents=True, exist_ok=True)

    # 1) SVGs (always written — pure text)
    (OUT / "roomard-logo-mark.svg").write_text(mark_svg(512, bg=None), encoding="utf-8")
    (OUT / "roomard-logo-lockup.svg").write_text(lockup_svg(400), encoding="utf-8")
    (OUT / "roomard-icon-tile.svg").write_text(
        mark_svg(512, bg=TEAL, glyph=MINT, dot=ACCENT), encoding="utf-8")
    print(f"  svg: roomard-logo-mark.svg, roomard-logo-lockup.svg, roomard-icon-tile.svg")

    # 2) PNGs — try cairosvg, fall back to Pillow
    targets = [
        ("roomard-logo-mark-512.png", mark_svg(512, bg=None), 512, None),
        ("roomard-logo-mark-1024.png", mark_svg(1024, bg=None), 1024, None),
        ("roomard-icon-32.png", mark_svg(32, bg=TEAL, glyph=MINT), 32, "tile"),
        ("roomard-icon-180.png", mark_svg(180, bg=TEAL, glyph=MINT), 180, "tile"),
    ]
    for name, svg, size, tile in targets:
        path = OUT / name
        if not rasterise(svg, path, size):
            pillow_mark(size, path, tile_bg=(TEAL if tile else None))
        kb = path.stat().st_size // 1024
        print(f"  png: {name} ({size}x{size}, {kb} KB)")

    # Lockup PNG
    lk = OUT / "roomard-logo-lockup-1600.png"
    if not rasterise(lockup_svg(400), lk, 1600, 400):
        pillow_lockup(1600, lk)
    print(f"  png: roomard-logo-lockup-1600.png ({lk.stat().st_size // 1024} KB)")

    print(f"logo set -> {OUT}")


if __name__ == "__main__":
    main()
