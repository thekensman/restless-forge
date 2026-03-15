"""Shared test fixtures."""

import io
import pytest
from PIL import Image, ImageDraw


# ─── SVG fixtures ──────────────────────────────────────

SIMPLE_SVG = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
  <circle cx="50" cy="50" r="40" fill="none" stroke="#000" stroke-width="2"/>
  <path d="M 20,50 L 80,50 M 50,20 L 50,80" stroke="#000" stroke-width="2" fill="none"/>
</svg>"""

RECT_SVG = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100" width="200" height="100">
  <rect x="10" y="10" width="180" height="80" fill="none" stroke="#000" stroke-width="2"/>
</svg>"""

BEZIER_SVG = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
  <path d="M 10,90 Q 50,10 90,90 Z" fill="none" stroke="#000" stroke-width="2"/>
</svg>"""

EMPTY_SVG = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
</svg>"""

MULTIPATH_SVG = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
  <path d="M 10,10 L 90,10" stroke="#000" stroke-width="2" fill="none"/>
  <path d="M 10,30 L 90,30" stroke="#000" stroke-width="2" fill="none"/>
  <path d="M 10,50 L 90,50" stroke="#000" stroke-width="2" fill="none"/>
  <path d="M 10,70 L 90,70" stroke="#000" stroke-width="2" fill="none"/>
  <path d="M 10,90 L 90,90" stroke="#000" stroke-width="2" fill="none"/>
</svg>"""


@pytest.fixture
def simple_svg():
    return SIMPLE_SVG

@pytest.fixture
def rect_svg():
    return RECT_SVG

@pytest.fixture
def bezier_svg():
    return BEZIER_SVG

@pytest.fixture
def empty_svg():
    return EMPTY_SVG

@pytest.fixture
def multipath_svg():
    return MULTIPATH_SVG


# ─── Image fixtures ────────────────────────────────────

@pytest.fixture
def circle_png_bytes() -> bytes:
    """100x100 PNG with a circle and crosshair."""
    img = Image.new("L", (100, 100), 255)
    draw = ImageDraw.Draw(img)
    draw.ellipse([15, 15, 85, 85], outline=0, width=3)
    draw.line([30, 50, 70, 50], fill=0, width=2)
    draw.line([50, 30, 50, 70], fill=0, width=2)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


@pytest.fixture
def solid_black_png_bytes() -> bytes:
    """50x50 solid black PNG."""
    img = Image.new("L", (50, 50), 0)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


@pytest.fixture
def gradient_jpg_bytes() -> bytes:
    """100x100 horizontal gradient JPEG."""
    img = Image.new("L", (100, 100))
    for x in range(100):
        for y in range(100):
            img.putpixel((x, y), int(255 * x / 99))
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    return buf.getvalue()


@pytest.fixture
def tiny_white_png_bytes() -> bytes:
    """10x10 all-white PNG (no edges to detect)."""
    img = Image.new("L", (10, 10), 255)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()
