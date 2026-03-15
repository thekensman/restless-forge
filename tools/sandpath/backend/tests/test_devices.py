"""Tests for device profiles."""

import pytest
from devices import DEVICES, DeviceProfile


class TestDeviceProfiles:

    def test_expected_device_count(self):
        assert len(DEVICES) == 8

    def test_all_required_devices_exist(self):
        expected = [
            "oasis_mini", "oasis_one",
            "sisyphus_mini", "sisyphus_coffee", "sisyphus_end",
            "zen_xy", "custom_circular", "custom_rectangular",
        ]
        for dev_id in expected:
            assert dev_id in DEVICES, f"Missing device: {dev_id}"

    @pytest.mark.parametrize("dev_id", list(DEVICES.keys()))
    def test_device_has_valid_shape(self, dev_id):
        assert DEVICES[dev_id].shape in ("circular", "rectangular")

    @pytest.mark.parametrize("dev_id", list(DEVICES.keys()))
    def test_device_has_valid_output_format(self, dev_id):
        assert DEVICES[dev_id].output_format in ("thr", "gcode")

    @pytest.mark.parametrize("dev_id", list(DEVICES.keys()))
    def test_device_positive_dimensions(self, dev_id):
        d = DEVICES[dev_id]
        assert d.width_mm > 0
        assert d.height_mm > 0

    @pytest.mark.parametrize("dev_id", list(DEVICES.keys()))
    def test_device_max_rho_in_range(self, dev_id):
        assert 0.0 < DEVICES[dev_id].max_rho <= 1.0

    def test_circular_devices_output_thr(self):
        for d in DEVICES.values():
            if d.shape == "circular":
                assert d.output_format == "thr", f"{d.id} is circular but outputs {d.output_format}"

    def test_rectangular_devices_output_gcode(self):
        for d in DEVICES.values():
            if d.shape == "rectangular":
                assert d.output_format == "gcode", f"{d.id} is rectangular but outputs {d.output_format}"

    def test_to_dict_returns_all_fields(self):
        d = DEVICES["oasis_mini"].to_dict()
        assert set(d.keys()) == {"id", "name", "description", "shape", "width_mm", "height_mm", "max_rho", "output_format"}

    def test_frozen_dataclass(self):
        with pytest.raises(AttributeError):
            DEVICES["oasis_mini"].width_mm = 999  # type: ignore
