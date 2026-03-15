"""Integration tests for the FastAPI endpoints."""

import io
import json
import pytest
from fastapi.testclient import TestClient

# We need to import the app, but first ensure our path works
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from main import app, _hits


@pytest.fixture(autouse=True)
def clear_rate_limiter():
    """Reset rate limiter state between tests."""
    _hits.clear()
    yield
    _hits.clear()


@pytest.fixture
def client():
    return TestClient(app)


# ─── Health ──────────────────────────────────────────

class TestHealth:

    def test_health_returns_ok(self, client):
        r = client.get("/api/health")
        assert r.status_code == 200
        body = r.json()
        assert body["status"] == "ok"
        assert "ts" in body


# ─── Devices ─────────────────────────────────────────

class TestDevices:

    def test_list_devices_returns_array(self, client):
        r = client.get("/api/devices")
        assert r.status_code == 200
        devices = r.json()
        assert isinstance(devices, list)
        assert len(devices) == 8

    def test_device_has_required_fields(self, client):
        r = client.get("/api/devices")
        dev = r.json()[0]
        for field in ["id", "name", "description", "shape", "width_mm", "height_mm", "max_rho", "output_format"]:
            assert field in dev, f"Missing field: {field}"


# ─── SVG Convert ─────────────────────────────────────

class TestConvertSvg:

    SVG = b"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
      <circle cx="50" cy="50" r="40" stroke="#000" fill="none" stroke-width="2"/>
    </svg>"""

    def test_convert_svg_success(self, client):
        r = client.post(
            "/api/convert",
            files={"file": ("test.svg", io.BytesIO(self.SVG), "image/svg+xml")},
            data={"device_id": "oasis_mini", "fit": "cover", "samples": "8"},
        )
        assert r.status_code == 200
        assert "X-Stats" in r.headers
        stats = json.loads(r.headers["X-Stats"])
        assert stats["points"] > 0

    def test_convert_svg_downloads_thr(self, client):
        r = client.post(
            "/api/convert",
            files={"file": ("test.svg", io.BytesIO(self.SVG), "image/svg+xml")},
            data={"device_id": "oasis_mini"},
        )
        assert ".thr" in r.headers.get("Content-Disposition", "")

    def test_convert_svg_gcode(self, client):
        r = client.post(
            "/api/convert",
            files={"file": ("test.svg", io.BytesIO(self.SVG), "image/svg+xml")},
            data={"device_id": "zen_xy"},
        )
        assert r.status_code == 200
        assert ".gcode" in r.headers.get("Content-Disposition", "")
        assert b"G21" in r.content

    def test_convert_svg_contain_mode(self, client):
        r = client.post(
            "/api/convert",
            files={"file": ("test.svg", io.BytesIO(self.SVG), "image/svg+xml")},
            data={"device_id": "oasis_mini", "fit": "contain"},
        )
        assert r.status_code == 200

    def test_convert_invalid_device(self, client):
        r = client.post(
            "/api/convert",
            files={"file": ("test.svg", io.BytesIO(self.SVG), "image/svg+xml")},
            data={"device_id": "nonexistent_device"},
        )
        assert r.status_code == 400

    def test_convert_invalid_fit(self, client):
        r = client.post(
            "/api/convert",
            files={"file": ("test.svg", io.BytesIO(self.SVG), "image/svg+xml")},
            data={"device_id": "oasis_mini", "fit": "stretch"},
        )
        assert r.status_code == 400

    def test_convert_non_svg_rejected(self, client):
        r = client.post(
            "/api/convert",
            files={"file": ("test.svg", io.BytesIO(b"not an svg at all"), "image/svg+xml")},
            data={"device_id": "oasis_mini"},
        )
        assert r.status_code == 400

    def test_convert_too_large_rejected(self, client):
        big = b"<svg>" + b"x" * (11 * 1024 * 1024) + b"</svg>"
        r = client.post(
            "/api/convert",
            files={"file": ("big.svg", io.BytesIO(big), "image/svg+xml")},
            data={"device_id": "oasis_mini"},
        )
        assert r.status_code == 413

    def test_custom_device_dimensions(self, client):
        r = client.post(
            "/api/convert",
            files={"file": ("test.svg", io.BytesIO(self.SVG), "image/svg+xml")},
            data={"device_id": "custom_circular", "custom_width_mm": "500", "custom_height_mm": "500"},
        )
        assert r.status_code == 200


# ─── Image Convert ───────────────────────────────────

class TestConvertImage:

    @pytest.fixture
    def png_bytes(self):
        from PIL import Image, ImageDraw
        img = Image.new("L", (80, 80), 255)
        draw = ImageDraw.Draw(img)
        draw.ellipse([10, 10, 70, 70], outline=0, width=3)
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        return buf.getvalue()

    def test_image_convert_success(self, client, png_bytes):
        r = client.post(
            "/api/convert-image",
            files={"file": ("test.png", io.BytesIO(png_bytes), "image/png")},
            data={"device_id": "oasis_mini", "trace_mode": "outline"},
        )
        assert r.status_code == 200
        assert ".thr" in r.headers.get("Content-Disposition", "")
        stats = json.loads(r.headers["X-Stats"])
        assert "image_size" in stats
        assert "trace_mode" in stats

    def test_image_svg_only_mode(self, client, png_bytes):
        r = client.post(
            "/api/convert-image",
            files={"file": ("test.png", io.BytesIO(png_bytes), "image/png")},
            data={"device_id": "oasis_mini", "trace_mode": "outline", "svg_only": "true"},
        )
        assert r.status_code == 200
        assert r.headers["content-type"].startswith("image/svg+xml")
        assert b"<svg" in r.content

    @pytest.mark.parametrize("mode", ["outline", "threshold", "centerline"])
    def test_all_trace_modes(self, client, png_bytes, mode):
        r = client.post(
            "/api/convert-image",
            files={"file": ("test.png", io.BytesIO(png_bytes), "image/png")},
            data={"device_id": "oasis_mini", "trace_mode": mode},
        )
        assert r.status_code == 200

    def test_image_to_gcode(self, client, png_bytes):
        r = client.post(
            "/api/convert-image",
            files={"file": ("test.png", io.BytesIO(png_bytes), "image/png")},
            data={"device_id": "zen_xy", "trace_mode": "threshold"},
        )
        assert r.status_code == 200
        assert ".gcode" in r.headers.get("Content-Disposition", "")

    def test_image_unsupported_format(self, client):
        r = client.post(
            "/api/convert-image",
            files={"file": ("test.txt", io.BytesIO(b"not an image"), "text/plain")},
            data={"device_id": "oasis_mini", "trace_mode": "outline"},
        )
        assert r.status_code == 400

    def test_image_invalid_trace_mode(self, client, png_bytes):
        r = client.post(
            "/api/convert-image",
            files={"file": ("test.png", io.BytesIO(png_bytes), "image/png")},
            data={"device_id": "oasis_mini", "trace_mode": "invalid"},
        )
        assert r.status_code == 400


# ─── Rate Limiting ───────────────────────────────────

class TestRateLimiting:

    SVG = b"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
      <circle cx="50" cy="50" r="40" stroke="#000" fill="none"/>
    </svg>"""

    def test_rate_limit_triggers_after_max(self, client):
        for i in range(15):
            r = client.post(
                "/api/convert",
                files={"file": ("test.svg", io.BytesIO(self.SVG), "image/svg+xml")},
                data={"device_id": "oasis_mini"},
            )
            assert r.status_code == 200, f"Request {i+1} failed unexpectedly"

        # 16th should be rate limited
        r = client.post(
            "/api/convert",
            files={"file": ("test.svg", io.BytesIO(self.SVG), "image/svg+xml")},
            data={"device_id": "oasis_mini"},
        )
        assert r.status_code == 429
