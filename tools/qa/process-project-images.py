#!/usr/bin/env python3
"""Turns 1280x800 PNG captures into the portfolio's project images.

Converts to grayscale (the site is black, white and gray only; the original
apps keep their colours), strips all metadata, and writes WebP at 1280 and
640 px into assets/img/projects/.

    python3 tools/qa/process-project-images.py <capturesDir> [name ...]

Requires Pillow. Names default to every project image the site uses.
"""
import sys
from pathlib import Path
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[2]
NAMES = ['trade-documents', 'commission-calculator', 'mihsab']


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    src = Path(sys.argv[1])
    for name in sys.argv[2:] or NAMES:
        im = Image.open(src / f'{name}.png').convert('RGB')
        gray = ImageOps.grayscale(im)  # new image: no EXIF/XMP/text chunks carried over
        for width in (1280, 640):
            out = gray.resize((width, round(width * im.height / im.width)), Image.LANCZOS)
            out.save(ROOT / 'assets/img/projects' / f'{name}-{width}.webp', 'WEBP', quality=80, method=6)
        print(f'{name}: {im.width}x{im.height} → grayscale WebP 1280/640')


if __name__ == '__main__':
    main()
