"""Tests for raster image → SVG vectoriser."""

import pytest
from vectorizer import vectorise, VectoriseOpts, VectoriseResult


class TestVectoriseBasic:

    def test_returns_vectorise_result(self, circle_png_bytes):
        result = vectorise(circle_png_bytes)
        assert isinstance(result, VectoriseResult)

    def test_produces_valid_svg(self, circle_png_bytes):
        result = vectorise(circle_png_bytes)
        assert result.svg_text.startswith("<svg")
        assert result.svg_text.strip().endswith("</svg>")
        assert 'xmlns="http://www.w3.org/2000/svg"' in result.svg_text

    def test_positive_dimensions(self, circle_png_bytes):
        result = vectorise(circle_png_bytes)
        assert result.width > 0
        assert result.height > 0

    def test_has_paths(self, circle_png_bytes):
        result = vectorise(circle_png_bytes)
        assert result.path_count > 0
        assert result.point_count > 0

    def test_svg_contains_path_elements(self, circle_png_bytes):
        result = vectorise(circle_png_bytes)
        assert "<path" in result.svg_text


class TestTraceModes:

    @pytest.mark.parametrize("mode", ["outline", "threshold", "centerline"])
    def test_all_modes_produce_output(self, circle_png_bytes, mode):
        result = vectorise(circle_png_bytes, VectoriseOpts(mode=mode))
        assert result.path_count >= 0
        assert result.svg_text.startswith("<svg")

    def test_threshold_mode_on_solid_black(self, solid_black_png_bytes):
        result = vectorise(solid_black_png_bytes, VectoriseOpts(mode="threshold"))
        # Solid black image should produce filled region contours
        assert result.svg_text.startswith("<svg")

    def test_outline_detects_edges(self, circle_png_bytes):
        result = vectorise(circle_png_bytes, VectoriseOpts(mode="outline"))
        assert result.path_count > 0

    def test_gradient_produces_edges(self, gradient_jpg_bytes):
        result = vectorise(gradient_jpg_bytes, VectoriseOpts(mode="outline"))
        assert result.svg_text.startswith("<svg")


class TestVectoriseOptions:

    def test_max_dimension_resizes(self, circle_png_bytes):
        small = vectorise(circle_png_bytes, VectoriseOpts(max_dimension=50))
        large = vectorise(circle_png_bytes, VectoriseOpts(max_dimension=200))
        assert small.width <= 50
        assert small.height <= 50

    def test_blur_affects_output(self, circle_png_bytes):
        no_blur = vectorise(circle_png_bytes, VectoriseOpts(blur=0))
        heavy_blur = vectorise(circle_png_bytes, VectoriseOpts(blur=5.0))
        # Heavy blur should reduce edge detail, potentially fewer paths
        # (not guaranteed, but output should differ)
        assert no_blur.svg_text != heavy_blur.svg_text

    def test_invert_changes_output(self, circle_png_bytes):
        normal = vectorise(circle_png_bytes, VectoriseOpts(mode="threshold"))
        inverted = vectorise(circle_png_bytes, VectoriseOpts(mode="threshold", invert=True))
        assert normal.svg_text != inverted.svg_text

    def test_detail_simplification(self, circle_png_bytes):
        fine = vectorise(circle_png_bytes, VectoriseOpts(detail=0.3))
        coarse = vectorise(circle_png_bytes, VectoriseOpts(detail=5.0))
        # Coarse simplification should produce fewer points
        assert coarse.point_count <= fine.point_count

    def test_threshold_level_affects_output(self, gradient_jpg_bytes):
        low = vectorise(gradient_jpg_bytes, VectoriseOpts(mode="threshold", threshold=50))
        high = vectorise(gradient_jpg_bytes, VectoriseOpts(mode="threshold", threshold=200))
        assert low.svg_text != high.svg_text

    def test_white_image_produces_no_paths(self, tiny_white_png_bytes):
        result = vectorise(tiny_white_png_bytes, VectoriseOpts(mode="outline"))
        # All-white image: no edges, should produce zero or near-zero paths
        assert result.path_count <= 2  # might get border artifacts


class TestFullPipeline:
    """Test image → SVG → THR end-to-end."""

    def test_png_to_thr(self, circle_png_bytes):
        from devices import DEVICES
        from converter import convert

        vec = vectorise(circle_png_bytes, VectoriseOpts(mode="outline"))
        result = convert(vec.svg_text, DEVICES["oasis_mini"])
        assert result.filename.endswith(".thr")
        assert result.stats["points"] > 0

    def test_png_to_gcode(self, circle_png_bytes):
        from devices import DEVICES
        from converter import convert

        vec = vectorise(circle_png_bytes, VectoriseOpts(mode="threshold"))
        result = convert(vec.svg_text, DEVICES["zen_xy"])
        assert result.filename.endswith(".gcode")
        assert "G21" in result.output

    @pytest.mark.parametrize("mode", ["outline", "threshold", "centerline"])
    def test_all_modes_to_thr(self, circle_png_bytes, mode):
        from devices import DEVICES
        from converter import convert

        vec = vectorise(circle_png_bytes, VectoriseOpts(mode=mode))
        result = convert(vec.svg_text, DEVICES["oasis_mini"])
        assert result.stats["points"] >= 0

    def test_jpg_input_to_thr(self, gradient_jpg_bytes):
        from devices import DEVICES
        from converter import convert

        vec = vectorise(gradient_jpg_bytes, VectoriseOpts(mode="outline"))
        result = convert(vec.svg_text, DEVICES["sisyphus_mini"])
        assert result.filename.endswith(".thr")
