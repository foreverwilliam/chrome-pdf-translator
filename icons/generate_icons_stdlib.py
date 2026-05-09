#!/usr/bin/env python3
"""
generate_icons_stdlib.py  —  generates PNG icons with NO external dependencies.
Uses only Python stdlib (struct, zlib, math).

Run: python3 generate_icons_stdlib.py
     python  generate_icons_stdlib.py   (Windows)
"""

import struct, zlib, math, os

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))

# ── PNG encoder ──────────────────────────────────────────────────────────────

def _crc32(data):
    return zlib.crc32(data) & 0xFFFFFFFF

def _chunk(tag, data):
    tag = tag.encode() if isinstance(tag, str) else tag
    crc = _crc32(tag + data)
    return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", crc)

def encode_png_rgba(pixels, w, h):
    """Encode w×h RGBA8 pixel array as PNG bytes."""
    raw = bytearray()
    for y in range(h):
        raw.append(0)  # filter type None
        for x in range(w):
            i = (y * w + x) * 4
            raw += pixels[i:i+4]
    compressed = zlib.compress(bytes(raw), 9)
    ihdr = struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0)  # RGBA, 8-bit
    sig = b"\x89PNG\r\n\x1a\n"
    return sig + _chunk("IHDR", ihdr) + _chunk("IDAT", compressed) + _chunk("IEND", b"")

# ── pixel helpers ─────────────────────────────────────────────────────────────

def _clamp(v):
    return max(0, min(255, int(v)))

def _blend(src, dst):
    """Alpha-composite src RGBA over dst RGBA, return RGBA."""
    a = src[3] / 255.0
    return tuple(_clamp(src[c] * a + dst[c] * (1 - a)) for c in range(3)) + (255,)

class Canvas:
    def __init__(self, w, h):
        self.w, self.h = w, h
        self.buf = bytearray(w * h * 4)  # RGBA, all transparent

    def set(self, x, y, rgba):
        if 0 <= x < self.w and 0 <= y < self.h:
            i = (y * self.w + x) * 4
            cur = tuple(self.buf[i:i+4])
            c = _blend(rgba, cur)
            self.buf[i:i+4] = c

    def get(self, x, y):
        i = (y * self.w + x) * 4
        return tuple(self.buf[i:i+4])

    def fill_circle(self, cx, cy, r, rgba):
        r2 = r * r
        for y in range(self.h):
            for x in range(self.w):
                dx = x - cx + 0.5
                dy = y - cy + 0.5
                d2 = dx*dx + dy*dy
                if d2 < r2:
                    edge = r - math.sqrt(d2)
                    alpha = min(1.0, max(0.0, edge))
                    c = rgba[:3] + (_clamp(rgba[3] * alpha),)
                    cur = self.get(x, y)
                    self.set(x, y, _blend(c, cur))

    def fill_polygon(self, pts, rgba):
        minX = int(min(p[0] for p in pts))
        maxX = int(max(p[0] for p in pts)) + 1
        minY = int(min(p[1] for p in pts))
        maxY = int(max(p[1] for p in pts)) + 1
        n = len(pts)
        for y in range(minY, maxY + 1):
            xs = []
            for i in range(n):
                ax, ay = pts[i]
                bx, by = pts[(i + 1) % n]
                if (ay <= y < by) or (by <= y < ay):
                    xs.append(ax + (y - ay) / (by - ay) * (bx - ax))
            xs.sort()
            for k in range(0, len(xs) - 1, 2):
                for x in range(int(xs[k]), int(xs[k+1]) + 1):
                    self.set(x, y, rgba)

    def fill_rect(self, x0, y0, x1, y1, rgba):
        for y in range(int(y0), int(y1) + 1):
            for x in range(int(x0), int(x1) + 1):
                self.set(x, y, rgba)

    def bytes(self):
        return bytes(self.buf)


# ── icon design ───────────────────────────────────────────────────────────────

BLUE   = (41,  98, 255, 255)
WHITE  = (255, 255, 255, 255)
SHADOW = (200, 215, 255, 255)
RED    = (220,  50,  50, 255)

# 5×7 bitmap glyphs (each row is a bitmask for that glyph row, MSB = leftmost pixel)
# '翻' simplified as a 5-wide × 7-tall pixel art glyph
# (true CJK at tiny size — designed by hand for readability at 16px+)
GLYPH_FAN = [
    0b11111,  # █████
    0b10101,  # █ █ █
    0b11111,  # █████
    0b01010,  #  █ █
    0b11111,  # █████
    0b10001,  # █   █
    0b10001,  # █   █
]

def draw_glyph(canvas, glyph_rows, cx, cy, cell_size, rgba):
    """Draw a 5×7 bitmap glyph centred at (cx, cy), each pixel `cell_size` wide/tall."""
    gw = 5 * cell_size
    gh = len(glyph_rows) * cell_size
    ox = cx - gw // 2
    oy = cy - gh // 2
    for row, mask in enumerate(glyph_rows):
        for col in range(5):
            if mask & (1 << (4 - col)):
                x0 = ox + col * cell_size
                y0 = oy + row * cell_size
                canvas.fill_rect(x0, y0, x0 + cell_size - 1, y0 + cell_size - 1, rgba)


def render_icon(size):
    c = Canvas(size, size)
    cx = cy = size / 2.0
    r  = size / 2.0 - 0.5

    # 1. Blue circle
    c.fill_circle(cx, cy, r, BLUE)

    # 2. White document body
    pad  = size * 0.18
    fold = size * 0.20
    dl, dt, dr, db = pad, pad, size - pad, size - pad

    body = [
        (dl,        dt + fold),
        (dl,        db),
        (dr,        db),
        (dr,        dt + fold),
        (dr - fold, dt),
        (dl,        dt),
    ]
    c.fill_polygon(body, WHITE)

    # 3. Fold shadow
    fold_tri = [
        (dr - fold, dt),
        (dr,        dt + fold),
        (dr - fold, dt + fold),
    ]
    c.fill_polygon(fold_tri, SHADOW)

    # 4. Red accent bar
    bar_h = max(2, int(size * 0.10))
    bar_t = db - bar_h - size * 0.06
    c.fill_rect(dl, bar_t, dr, bar_t + bar_h, RED)

    # 5. Glyph centred on document face
    doc_mid_x = int((dl + dr) / 2)
    doc_mid_y = int((dt + fold + bar_t) / 2)

    # cell_size: scale so 5-wide glyph fits in ~50% of doc width
    cell = max(1, int((dr - dl) * 0.50 / 5))
    draw_glyph(c, GLYPH_FAN, doc_mid_x, doc_mid_y, cell, BLUE)

    return c.bytes(), size, size


def main():
    for size in [16, 48, 128]:
        pixels, w, h = render_icon(size)
        png = encode_png_rgba(bytearray(pixels), w, h)
        dest = os.path.join(SCRIPT_DIR, f"icon{size}.png")
        with open(dest, "wb") as f:
            f.write(png)
        print(f"Saved {dest}  ({size}x{size})")

if __name__ == "__main__":
    main()
