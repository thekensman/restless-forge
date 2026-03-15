#!/usr/bin/env python3
"""
Standalone test runner — works without pytest.
Tests core modules: devices, converter, vectorizer.

Usage:
  cd backend && python3 run_tests.py

For full test suite including API integration tests:
  pip install -r requirements.txt
  pytest tests/ -v
"""

from __future__ import annotations
import io, sys, traceback
from PIL import Image, ImageDraw

passed = failed = 0


def assert_(cond, msg="Assertion failed"):
    if not cond:
        raise AssertionError(msg)


def test(name, fn):
    global passed, failed
    try:
        fn()
        passed += 1
        print(f"  ✓ {name}")
    except Exception:
        failed += 1
        print(f"  ✗ {name}")
        traceback.print_exc(limit=2)
        print()


# ─── Image helpers ──────────────────────────────────

def make_circle_png():
    img = Image.new("L", (100, 100), 255)
    draw = ImageDraw.Draw(img)
    draw.ellipse([15, 15, 85, 85], outline=0, width=3)
    draw.line([30, 50, 70, 50], fill=0, width=2)
    draw.line([50, 30, 50, 70], fill=0, width=2)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()

def make_star_png():
    """High-contrast star shape — produces edges in all modes."""
    img = Image.new("L", (100, 100), 255)
    draw = ImageDraw.Draw(img)
    draw.regular_polygon((50, 50, 40), 5, fill=0)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()

def make_white_png():
    img = Image.new("L", (20, 20), 255)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()

circle_png = make_circle_png()
star_png = make_star_png()
white_png = make_white_png()


# ═══════════════════════════════════════════════════════
#  DEVICE TESTS
# ═══════════════════════════════════════════════════════
print("\n═══ Device tests ═══")

from devices import DEVICES, DeviceProfile

test("8 devices registered",
     lambda: assert_(len(DEVICES) == 8, f"Expected 8, got {len(DEVICES)}"))

for dev_id in ["oasis_mini", "oasis_one", "sisyphus_mini", "sisyphus_coffee",
               "sisyphus_end", "zen_xy", "custom_circular", "custom_rectangular"]:
    test(f"device '{dev_id}' exists",
         lambda did=dev_id: assert_(did in DEVICES))

test("circular → thr", lambda: assert_(
    all(d.output_format == "thr" for d in DEVICES.values() if d.shape == "circular")
))

test("rectangular → gcode", lambda: assert_(
    all(d.output_format == "gcode" for d in DEVICES.values() if d.shape == "rectangular")
))

test("to_dict has all fields", lambda: assert_(
    set(DEVICES["oasis_mini"].to_dict().keys()) ==
    {"id", "name", "description", "shape", "width_mm", "height_mm", "max_rho", "output_format"}
))

def _test_frozen():
    try:
        DEVICES["oasis_mini"].width_mm = 999  # type: ignore
    except (AttributeError, TypeError, Exception):
        return
    raise AssertionError("Should be frozen")

test("frozen dataclass", _test_frozen)

test("all max_rho in (0, 1]", lambda: assert_(
    all(0 < d.max_rho <= 1.0 for d in DEVICES.values())
))

test("all dimensions positive", lambda: assert_(
    all(d.width_mm > 0 and d.height_mm > 0 for d in DEVICES.values())
))


# ═══════════════════════════════════════════════════════
#  CONVERTER TESTS
# ═══════════════════════════════════════════════════════
print("\n═══ Converter tests ═══")

from converter import convert, ConvertResult

SVG_CIRCLE = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <circle cx="50" cy="50" r="40" fill="none" stroke="#000" stroke-width="2"/>
  <path d="M 20,50 L 80,50 M 50,20 L 50,80" stroke="#000" fill="none"/>
</svg>"""

SVG_BEZIER = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <path d="M 10,90 Q 50,10 90,90 Z" fill="none" stroke="#000"/>
</svg>"""

SVG_MULTI = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <path d="M 10,10 L 90,10" stroke="#000" fill="none"/>
  <path d="M 10,30 L 90,30" stroke="#000" fill="none"/>
  <path d="M 10,50 L 90,50" stroke="#000" fill="none"/>
</svg>"""

test("SVG → THR produces output", lambda: (
    r := convert(SVG_CIRCLE, DEVICES["oasis_mini"]),
    assert_(r.output and r.filename.endswith(".thr")),
    assert_(r.stats["points"] > 0),
    assert_(r.stats["subpaths"] > 0),
))

test("SVG → GCode produces output", lambda: (
    r := convert(SVG_CIRCLE, DEVICES["zen_xy"]),
    assert_(r.filename.endswith(".gcode")),
    assert_("G21" in r.output),
    assert_("G90" in r.output),
))

def _test_rho_bounds():
    r = convert(SVG_CIRCLE, DEVICES["oasis_mini"], max_rho_override=0.8)
    for line in r.output.strip().splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        rho = float(line.split()[1])
        assert_(rho <= 0.801, f"rho {rho} exceeds max 0.8")

test("THR rho values bounded by max_rho", _test_rho_bounds)

test("cover vs contain differ", lambda: (
    c1 := convert(SVG_CIRCLE, DEVICES["oasis_mini"], fit="cover"),
    c2 := convert(SVG_CIRCLE, DEVICES["oasis_mini"], fit="contain"),
    assert_(c1.stats["points"] != c2.stats["points"] or c1.output != c2.output,
            "cover and contain should produce different output"),
))

test("higher samples → more points", lambda: (
    lo := convert(SVG_BEZIER, DEVICES["oasis_mini"], samples=4),
    hi := convert(SVG_BEZIER, DEVICES["oasis_mini"], samples=32),
    assert_(hi.stats["points"] > lo.stats["points"]),
))

test("multipath subpath count", lambda: assert_(
    convert(SVG_MULTI, DEVICES["oasis_mini"]).stats["subpaths"] == 3
))

def _test_padding():
    r = convert(SVG_CIRCLE, DEVICES["oasis_mini"], padding=0.15)
    for line in r.output.strip().splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        rho = float(line.split()[1])
        assert_(rho <= 0.801, f"rho {rho} exceeds padded max 0.8")

test("padding reduces rho range", _test_padding)

test("stats has expected keys", lambda: assert_(
    {"points", "subpaths", "fit", "content_size"}.issubset(
        set(convert(SVG_CIRCLE, DEVICES["oasis_mini"]).stats.keys())
    )
))

test("GCode uses G0/G1 moves", lambda: (
    r := convert(SVG_CIRCLE, DEVICES["zen_xy"]),
    assert_(any("G0" in l or "G1" in l for l in r.output.splitlines())),
))


# ═══════════════════════════════════════════════════════
#  VECTORIZER TESTS
# ═══════════════════════════════════════════════════════
print("\n═══ Vectorizer tests ═══")

from vectorizer import vectorise, VectoriseOpts, VectoriseResult

test("produces VectoriseResult", lambda: assert_(isinstance(vectorise(circle_png), VectoriseResult)))

test("SVG is valid", lambda: (
    r := vectorise(circle_png),
    assert_(r.svg_text.startswith("<svg")),
    assert_(r.svg_text.strip().endswith("</svg>")),
    assert_("xmlns" in r.svg_text),
))

test("positive dimensions", lambda: (
    r := vectorise(circle_png),
    assert_(r.width > 0 and r.height > 0),
))

test("has paths and points", lambda: (
    r := vectorise(circle_png),
    assert_(r.path_count > 0 and r.point_count > 0),
))

for mode in ["outline", "threshold", "centerline"]:
    test(f"mode '{mode}' produces SVG", lambda m=mode: (
        r := vectorise(circle_png, VectoriseOpts(mode=m)),
        assert_(r.svg_text.startswith("<svg")),
    ))

test("max_dimension resizes", lambda: (
    r := vectorise(circle_png, VectoriseOpts(max_dimension=50)),
    assert_(r.width <= 50 and r.height <= 50),
))

test("blur changes output", lambda: (
    a := vectorise(circle_png, VectoriseOpts(blur=0)),
    b := vectorise(circle_png, VectoriseOpts(blur=5.0)),
    assert_(a.svg_text != b.svg_text),
))

test("invert changes output", lambda: (
    a := vectorise(circle_png, VectoriseOpts(mode="threshold", invert=False)),
    b := vectorise(circle_png, VectoriseOpts(mode="threshold", invert=True)),
    assert_(a.svg_text != b.svg_text),
))

test("coarser detail = fewer points", lambda: (
    fine := vectorise(circle_png, VectoriseOpts(detail=0.3)),
    coarse := vectorise(circle_png, VectoriseOpts(detail=5.0)),
    assert_(coarse.point_count <= fine.point_count),
))

test("white image = few/no paths", lambda: (
    r := vectorise(white_png, VectoriseOpts(mode="outline")),
    assert_(r.path_count <= 2),
))


# ═══════════════════════════════════════════════════════
#  FULL PIPELINE TESTS
# ═══════════════════════════════════════════════════════
print("\n═══ Full pipeline tests (image → SVG → THR/GCode) ═══")

for mode in ["outline", "threshold", "centerline"]:
    test(f"PNG ({mode}) → THR", lambda m=mode: (
        vec := vectorise(circle_png, VectoriseOpts(mode=m)),
        r := convert(vec.svg_text, DEVICES["oasis_mini"]),
        assert_(r.filename.endswith(".thr")),
    ))

test("PNG → GCode (ZenXY)", lambda: (
    vec := vectorise(circle_png, VectoriseOpts(mode="threshold")),
    r := convert(vec.svg_text, DEVICES["zen_xy"]),
    assert_(r.filename.endswith(".gcode")),
    assert_("G21" in r.output),
))

test("star PNG → THR (Sisyphus)", lambda: (
    vec := vectorise(star_png, VectoriseOpts(mode="outline")),
    r := convert(vec.svg_text, DEVICES["sisyphus_mini"]),
    assert_(r.filename.endswith(".thr")),
    assert_(r.stats["points"] > 0),
))

def _test_all_devices():
    vec = vectorise(circle_png, VectoriseOpts(mode="threshold"))
    for dev_id, dev in DEVICES.items():
        r = convert(vec.svg_text, dev)
        assert_(r.output, f"No output for {dev_id}")

test("all 8 devices produce output from PNG", _test_all_devices)

# ═══════════════════════════════════════════════════════
print(f"\n{'═' * 50}")
print(f"  {passed} passed, {failed} failed, {passed + failed} total")
print(f"{'═' * 50}")
sys.exit(1 if failed else 0)
