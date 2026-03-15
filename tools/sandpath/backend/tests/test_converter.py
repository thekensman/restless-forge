"""Tests for SVG → THR/GCode converter."""

import math
import pytest
from converter import convert, ConvertResult
from devices import DEVICES


class TestConvertBasic:

    def test_simple_svg_produces_thr(self, simple_svg):
        result = convert(simple_svg, DEVICES["oasis_mini"])
        assert isinstance(result, ConvertResult)
        assert result.output
        assert result.filename.endswith(".thr")
        assert result.stats["points"] > 0
        assert result.stats["subpaths"] > 0

    def test_simple_svg_produces_gcode(self, simple_svg):
        result = convert(simple_svg, DEVICES["zen_xy"])
        assert result.filename.endswith(".gcode")
        assert "G21" in result.output  # mm mode
        assert "G90" in result.output  # absolute positioning

    def test_cover_vs_contain_different_scales(self, rect_svg):
        cover = convert(rect_svg, DEVICES["oasis_mini"], fit="cover")
        contain = convert(rect_svg, DEVICES["oasis_mini"], fit="contain")
        # Cover should scale larger than contain for non-square content
        assert cover.stats["scale"] != contain.stats["scale"]

    def test_bezier_path_sampled(self, bezier_svg):
        result = convert(bezier_svg, DEVICES["oasis_mini"], samples=8)
        assert result.stats["points"] >= 8  # at least one curve's worth of samples

    def test_higher_samples_means_more_points(self, bezier_svg):
        low = convert(bezier_svg, DEVICES["oasis_mini"], samples=4)
        high = convert(bezier_svg, DEVICES["oasis_mini"], samples=32)
        assert high.stats["points"] > low.stats["points"]

    def test_multipath_ordering(self, multipath_svg):
        result = convert(multipath_svg, DEVICES["oasis_mini"])
        assert result.stats["subpaths"] == 5


class TestConvertThrFormat:

    def test_thr_lines_are_theta_rho_pairs(self, simple_svg):
        result = convert(simple_svg, DEVICES["oasis_mini"])
        for line in result.output.strip().splitlines():
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            parts = line.strip().split()
            assert len(parts) == 2, f"Bad line: {line}"
            theta, rho = float(parts[0]), float(parts[1])
            assert -100 < theta < 100  # reasonable theta range
            assert 0.0 <= rho <= 1.0

    def test_rho_bounded_by_max_rho(self, simple_svg):
        result = convert(simple_svg, DEVICES["oasis_mini"], max_rho_override=0.8)
        for line in result.output.strip().splitlines():
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            rho = float(line.strip().split()[1])
            assert rho <= 0.80 + 0.001  # tiny float tolerance


class TestConvertGcodeFormat:

    def test_gcode_has_header(self, simple_svg):
        result = convert(simple_svg, DEVICES["zen_xy"])
        lines = result.output.splitlines()
        assert any("G21" in l for l in lines[:5])
        assert any("G90" in l for l in lines[:5])

    def test_gcode_uses_g0_g1_moves(self, simple_svg):
        result = convert(simple_svg, DEVICES["zen_xy"])
        has_g0 = any("G0 " in l or "G0\n" in l for l in result.output.splitlines())
        has_g1 = any("G1 " in l for l in result.output.splitlines())
        assert has_g0 or has_g1


class TestConvertEdgeCases:

    def test_padding_reduces_output_area(self, simple_svg):
        no_pad = convert(simple_svg, DEVICES["oasis_mini"], padding=0.0)
        with_pad = convert(simple_svg, DEVICES["oasis_mini"], padding=0.15)
        # With padding, max rho used should be lower
        for line in with_pad.output.strip().splitlines():
            rho = float(line.strip().split()[1])
            assert rho <= 0.80 + 0.001  # 0.95 - 0.15

    def test_custom_device_dimensions(self, simple_svg):
        custom = DEVICES["custom_circular"]
        from devices import DeviceProfile
        big = DeviceProfile(
            id="custom_circular", name="Big", description="Big",
            shape="circular", width_mm=1000, height_mm=1000,
            max_rho=0.95, output_format="thr",
        )
        result = convert(simple_svg, big)
        assert result.stats["points"] > 0

    def test_invalid_fit_value(self, simple_svg):
        with pytest.raises(Exception):
            convert(simple_svg, DEVICES["oasis_mini"], fit="stretch")

    def test_stats_contains_expected_keys(self, simple_svg):
        result = convert(simple_svg, DEVICES["oasis_mini"])
        expected = {"points", "subpaths", "fit", "content_size"}
        assert expected.issubset(set(result.stats.keys()))
