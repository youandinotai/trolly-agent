"""Generate Trolly Agent's own app/tray icons — no third-party artwork, no deps.

Writes PNGs with a tiny pure-Python encoder (zlib + struct), so the build needs
nothing beyond the standard library.

Run: python scripts/make-icons.py
"""
import math
import os
import struct
import zlib

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS = os.path.join(ROOT, 'assets')
os.makedirs(ASSETS, exist_ok=True)

YELLOW = (255, 210, 26)
RED = (255, 85, 69)
DARK = (12, 11, 9)


def write_png(path: str, width: int, height: int, pixels: bytes) -> None:
    """pixels: RGBA bytes, row-major."""

    def chunk(tag: bytes, data: bytes) -> bytes:
        c = struct.pack('>I', len(data)) + tag + data
        return c + struct.pack('>I', zlib.crc32(tag + data) & 0xFFFFFFFF)

    raw = bytearray()
    stride = width * 4
    for y in range(height):
        raw.append(0)  # filter type 0 (None)
        raw += pixels[y * stride:(y + 1) * stride]

    png = b'\x89PNG\r\n\x1a\n'
    png += chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0))
    png += chunk(b'IDAT', zlib.compress(bytes(raw), 9))
    png += chunk(b'IEND', b'')
    with open(path, 'wb') as f:
        f.write(png)


def render(size: int, rounded: bool) -> bytes:
    radius = size * 0.22
    bar = max(2.0, size * 0.075)
    pad = size * 0.26
    cx = size / 2.0

    buf = bytearray(size * size * 4)
    ss = 4  # supersampling for smooth edges
    for y in range(size):
        for x in range(size):
            hits = 0
            for sy in range(ss):
                for sx in range(ss):
                    fx = x + (sx + 0.5) / ss
                    fy = y + (sy + 0.5) / ss

                    if rounded:
                        dx = max(radius - fx, 0, fx - (size - radius))
                        dy = max(radius - fy, 0, fy - (size - radius))
                        if math.hypot(dx, dy) > radius:
                            continue
                    hits += 1

            if not hits:
                continue
            alpha = int(255 * hits / (ss * ss))

            t = y / max(1, size - 1)
            bg = (
                int(YELLOW[0] * (1 - t) + RED[0] * t),
                int(YELLOW[1] * (1 - t) + RED[1] * t),
                int(YELLOW[2] * (1 - t) + RED[2] * t),
            )

            glyph = 0
            if pad <= fx <= size - pad and size * 0.30 <= fy <= size * 0.30 + bar:
                glyph = 1
            elif abs(fx - cx) <= bar / 2 and size * 0.30 <= fy <= size * 0.72:
                glyph = 1

            r, g, b = DARK if glyph else bg
            i = (y * size + x) * 4
            buf[i] = r
            buf[i + 1] = g
            buf[i + 2] = b
            buf[i + 3] = alpha
    return bytes(buf)


def main() -> None:
    write_png(os.path.join(ASSETS, 'icon.png'), 256, 256, render(256, True))
    print('wrote assets/icon.png')

    write_png(os.path.join(ASSETS, 'tray.png'), 64, 64, render(64, True))
    print('wrote assets/tray.png')

    for s in (16, 32, 48, 128):
        write_png(os.path.join(ASSETS, f'icon-{s}.png'), s, s, render(s, True))
    print('wrote icon-{16,32,48,128}.png')


if __name__ == '__main__':
    main()
