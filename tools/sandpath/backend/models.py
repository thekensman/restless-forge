"""Pydantic models for the SandPath API."""

from __future__ import annotations

from pydantic import BaseModel, Field


class ConvertRequest(BaseModel):
    """Metadata sent alongside the SVG file upload."""

    device_id: str = Field(
        default="oasis_mini",
        description="Device profile identifier (e.g. oasis_mini, sisyphus_coffee).",
    )
    fit: str = Field(
        default="cover",
        pattern="^(cover|contain)$",
        description="'cover' fills the bed (clips corners); 'contain' fits entirely.",
    )
    samples: int = Field(
        default=16,
        ge=4,
        le=64,
        description="Points per curve segment. Higher = smoother but larger file.",
    )
    max_rho: float | None = Field(
        default=None,
        ge=0.1,
        le=1.0,
        description="Override default max rho for the device.",
    )
    padding: float = Field(
        default=0.0,
        ge=0.0,
        le=0.5,
        description="Extra inward padding as fraction of radius.",
    )
    custom_width_mm: float | None = Field(
        default=None,
        ge=10,
        le=5000,
        description="Width in mm for custom device profiles.",
    )
    custom_height_mm: float | None = Field(
        default=None,
        ge=10,
        le=5000,
        description="Height in mm for custom device profiles.",
    )


class ConvertStats(BaseModel):
    points: int
    subpaths: int
    fit: str
    max_rho: float | None = None
    polar_radius: float | None = None
    scale: float | None = None
    content_size: str
    clipped_points: int | None = None
    bed_size: str | None = None
    # Raster→SVG pipeline stats (only present for image uploads)
    source_type: str | None = None       # "svg" | "raster"
    vectorise_mode: str | None = None    # "outline" | "threshold" | "centerline"
    image_dimensions: str | None = None  # e.g. "1920×1080"
    vectorised_paths: int | None = None
    vectorised_points: int | None = None


class ConvertResponse(BaseModel):
    success: bool
    filename: str
    stats: ConvertStats
    # The actual file is returned as a download; this JSON response
    # is only used for the metadata preview endpoint.


class DeviceInfo(BaseModel):
    id: str
    name: str
    description: str
    shape: str
    width_mm: float
    height_mm: float
    max_rho: float
    output_format: str


class ErrorResponse(BaseModel):
    detail: str
