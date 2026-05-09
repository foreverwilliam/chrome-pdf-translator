#!/usr/bin/env python3
"""
Generate PNG icons for the PDF Translator Chrome extension.
Run: python3 generate_icons.py
Requires: pip install Pillow
"""

import sys
import os

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:
    print("Pillow not found. Installing...")
    import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "Pillow", "--break-system-packages"])
    from PIL import Image, ImageDraw, ImageFont

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))

def draw_icon(size: int) -> Image.Image:
    """
    Draw a simple PDF-Translator icon at the given square pixel size.

    Design:
    - Dark blue rounded background
    - White document silhouette (rect with folded top-right corner)
    - Red accent bar at the bottom of the document
    - Chinese character '翻' (translate) in white, centred on the document
    """
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # ── colours ──────────────────────────────────────────────────────────────
    BG          = (41,  98, 255, 255)   # vivid blue background
    DOC_FILL    = (255, 255, 255, 255)  # white document
    DOC_SHADOW  = (200, 215, 255, 255)  # subtle fold shadow
    ACCENT      = (220,  50,  50, 255)  # red accent bar
    TEXT_COLOR  = (41,  98, 255, 255)   # blue text on white doc

    # ── background circle ────────────────────────────────────────────────────
    radius = size // 2
    draw.ellipse([0, 0, size - 1, size - 1], fill=BG)

    # ── document rectangle ───────────────────────────────────────────────────
    pad   = size * 0.18          # outer padding from circle edge
    fold  = size * 0.18          # size of top-right fold

    dl = pad                     # doc left
    dt = pad                     # doc top
    dr = size - pad              # doc right
    db = size - pad              # doc bottom

    # Draw body (cut out top-right corner via polygon)
    body_pts = [
        (dl,       dt + fold),   # top-left, below fold
        (dl,       db),          # bottom-left
        (dr,       db),          # bottom-right
        (dr,       dt + fold),   # right side, top of fold
        (dr - fold, dt),         # top edge, right of fold
        (dl,       dt),          # top-left
    ]
    draw.polygon(body_pts, fill=DOC_FILL)

    # Fold triangle (slightly darker shade)
    fold_pts = [
        (dr - fold, dt),
        (dr,        dt + fold),
        (dr - fold, dt + fold),
    ]
    draw.polygon(fold_pts, fill=DOC_SHADOW)

    # ── red accent bar near the bottom of the document ───────────────────────
    bar_h  = max(2, int(size * 0.10))
    bar_t  = db - bar_h - size * 0.06
    draw.rectangle([dl, bar_t, dr, bar_t + bar_h], fill=ACCENT)

    # ── character '翻' centred on the document ───────────────────────────────
    # Try to load a Unicode-capable font; fall back to default.
    char      = "翻"
    font_size = int((dr - dl) * 0.48)

    font = None
    font_candidates = [
        # Linux
        "/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc",
        "/usr/share/fonts/opentype/noto/NotoSansCJKsc-Regular.otf",
        "/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc",
        "/usr/share/fonts/truetype/arphic/uming.ttc",
        # macOS
        "/System/Library/Fonts/PingFang.ttc",
        "/Library/Fonts/Arial Unicode.ttf",
        # Windows
        "C:/Windows/Fonts/msyh.ttc",
        "C:/Windows/Fonts/simsun.ttc",
        "C:/Windows/Fonts/simhei.ttf",
    ]
    for path in font_candidates:
        if os.path.exists(path):
            try:
                font = ImageFont.truetype(path, font_size)
                break
            except Exception:
                pass

    if font is None:
        # PIL default bitmap font – won't render Chinese but won't crash either
        font = ImageFont.load_default()
        char = "T"   # fallback glyph

    # Measure and centre
    bbox = draw.textbbox((0, 0), char, font=font)
    tw   = bbox[2] - bbox[0]
    th   = bbox[3] - bbox[1]

    doc_cx = (dl + dr) / 2
    doc_cy = (dt + bar_t) / 2      # centre between top of doc and accent bar

    tx = doc_cx - tw / 2 - bbox[0]
    ty = doc_cy - th / 2 - bbox[1]

    draw.text((tx, ty), char, fill=TEXT_COLOR, font=font)

    return img


def main():
    sizes = [16, 48, 128]
    for size in sizes:
        img  = draw_icon(size)
        path = os.path.join(SCRIPT_DIR, f"icon{size}.png")
        img.save(path, "PNG")
        print(f"Saved {path}  ({size}x{size})")


if __name__ == "__main__":
    main()
