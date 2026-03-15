"""
Sand table device profiles.

Each profile describes the physical form factor so the converter
can scale and project artwork correctly.
"""

from __future__ import annotations
from dataclasses import dataclass, asdict


@dataclass(frozen=True)
class DeviceProfile:
    id: str
    name: str
    description: str
    shape: str  # "circular" | "rectangular"
    width_mm: float
    height_mm: float
    max_rho: float  # circular: max safe rho; rectangular: unused
    output_format: str  # "thr" | "gcode"

    def to_dict(self) -> dict:
        return asdict(self)


DEVICES: dict[str, DeviceProfile] = {
    "oasis_mini": DeviceProfile(
        id="oasis_mini",
        name="Oasis Mini",
        description='Grounded Oasis Mini — 6.5" circular',
        shape="circular",
        width_mm=165,
        height_mm=165,
        max_rho=0.95,
        output_format="thr",
    ),
    "oasis_one": DeviceProfile(
        id="oasis_one",
        name="Oasis One",
        description='Grounded Oasis One — 18.5" circular',
        shape="circular",
        width_mm=470,
        height_mm=470,
        max_rho=0.95,
        output_format="thr",
    ),
    "sisyphus_mini": DeviceProfile(
        id="sisyphus_mini",
        name="Sisyphus Mini",
        description='Sisyphus Industries Mini — 15.5" circular',
        shape="circular",
        width_mm=394,
        height_mm=394,
        max_rho=0.95,
        output_format="thr",
    ),
    "sisyphus_coffee": DeviceProfile(
        id="sisyphus_coffee",
        name="Sisyphus Coffee Table",
        description='Sisyphus Industries — 24.5" circular',
        shape="circular",
        width_mm=622,
        height_mm=622,
        max_rho=0.95,
        output_format="thr",
    ),
    "sisyphus_end": DeviceProfile(
        id="sisyphus_end",
        name="Sisyphus End Table",
        description='Sisyphus Industries — 18" circular',
        shape="circular",
        width_mm=457,
        height_mm=457,
        max_rho=0.95,
        output_format="thr",
    ),
    "zen_xy": DeviceProfile(
        id="zen_xy",
        name="ZenXY (V1E)",
        description="V1 Engineering ZenXY — rectangular (default 500×350 mm)",
        shape="rectangular",
        width_mm=500,
        height_mm=350,
        max_rho=1.0,
        output_format="gcode",
    ),
    "custom_circular": DeviceProfile(
        id="custom_circular",
        name="Custom Circular",
        description="Custom circular polar table",
        shape="circular",
        width_mm=300,
        height_mm=300,
        max_rho=0.95,
        output_format="thr",
    ),
    "custom_rectangular": DeviceProfile(
        id="custom_rectangular",
        name="Custom Rectangular",
        description="Custom rectangular Cartesian table",
        shape="rectangular",
        width_mm=400,
        height_mm=300,
        max_rho=1.0,
        output_format="gcode",
    ),
}
