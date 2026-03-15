"""
SandPath API — FastAPI backend.

- All processing is in-memory (no temp files).
- Structured JSON logging for every request.
- Per-IP rate limiting to mitigate abuse.
- CORS configured for the frontend origin.
- Two conversion pipelines:
    /api/convert       — SVG → THR/GCode
    /api/convert-image — Raster → SVG → THR/GCode
"""

from __future__ import annotations

import json
import logging
import sys
import time
import uuid
from collections import defaultdict
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response

from converter import convert
from devices import DEVICES, DeviceProfile
from models import ConvertRequest, ConvertResponse, ConvertStats, DeviceInfo
from vectorizer import vectorise, VectoriseOpts

# Raster formats accepted for image → SVG → THR pipeline
ALLOWED_IMAGE_TYPES = {
    "image/jpeg", "image/png", "image/webp", "image/bmp",
    "image/gif", "image/tiff",
}
ALLOWED_IMAGE_EXTS = {
    ".jpg", ".jpeg", ".png", ".webp", ".bmp", ".gif", ".tiff", ".tif",
}


# ═══════════════════════════════════════════════════════════════
#  LOGGING — structured JSON to stdout + file
# ═══════════════════════════════════════════════════════════════

class JSONFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        log_obj = {
            "ts": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "msg": record.getMessage(),
        }
        if hasattr(record, "extra"):
            log_obj.update(record.extra)  # type: ignore[arg-type]
        return json.dumps(log_obj)

logger = logging.getLogger("sandpath")
logger.setLevel(logging.INFO)

ch = logging.StreamHandler(sys.stdout)
ch.setFormatter(JSONFormatter())
logger.addHandler(ch)

try:
    fh = logging.FileHandler("sandpath.log", mode="a")
    fh.setFormatter(JSONFormatter())
    logger.addHandler(fh)
except OSError:
    pass


def log(msg: str, **kw):
    record = logger.makeRecord(
        "sandpath", logging.INFO, "", 0, msg, (), None
    )
    record.extra = kw  # type: ignore[attr-defined]
    logger.handle(record)


# ═══════════════════════════════════════════════════════════════
#  RATE LIMITER — sliding-window per IP
# ═══════════════════════════════════════════════════════════════

RATE_WINDOW = 60
RATE_MAX_REQUESTS = 15
RATE_MAX_UPLOAD_MB = 10

_hits: dict[str, list[float]] = defaultdict(list)


def _check_rate(ip: str) -> bool:
    now = time.time()
    window = _hits[ip]
    _hits[ip] = [t for t in window if now - t < RATE_WINDOW]
    if len(_hits[ip]) >= RATE_MAX_REQUESTS:
        return False
    _hits[ip].append(now)
    return True


# ═══════════════════════════════════════════════════════════════
#  SHARED HELPERS
# ═══════════════════════════════════════════════════════════════

def _resolve_device(
    device_id: str,
    custom_width_mm: float | None,
    custom_height_mm: float | None,
) -> DeviceProfile:
    if device_id not in DEVICES:
        raise HTTPException(400, f"Unknown device: {device_id}")
    device = DEVICES[device_id]
    if device_id in ("custom_circular", "custom_rectangular"):
        if custom_width_mm and custom_height_mm:
            device = DeviceProfile(
                id=device.id,
                name=device.name,
                description=device.description,
                shape=device.shape,
                width_mm=custom_width_mm,
                height_mm=(
                    custom_height_mm if device.shape == "rectangular"
                    else custom_width_mm
                ),
                max_rho=device.max_rho,
                output_format=device.output_format,
            )
    return device


# ═══════════════════════════════════════════════════════════════
#  APP
# ═══════════════════════════════════════════════════════════════

@asynccontextmanager
async def lifespan(app: FastAPI):
    log("startup", event="server_start")
    yield
    log("shutdown", event="server_stop")


app = FastAPI(
    title="SandPath API",
    version="2.0.0",
    description="Convert SVG vector art and raster images to sand table formats.",
    lifespan=lifespan,
)

ALLOWED_ORIGINS = [
    "http://localhost:5173",
    "http://localhost:3000",
    "http://127.0.0.1:5173",
    # "https://sandpath.art",
    # "https://www.sandpath.art",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


@app.middleware("http")
async def log_requests(request: Request, call_next):
    req_id = uuid.uuid4().hex[:12]
    ip = request.client.host if request.client else "unknown"
    t0 = time.time()
    response = await call_next(request)
    elapsed = round((time.time() - t0) * 1000, 1)
    log(
        "request",
        req_id=req_id,
        method=request.method,
        path=str(request.url.path),
        ip=ip,
        status=response.status_code,
        ms=elapsed,
    )
    response.headers["X-Request-Id"] = req_id
    return response


# ═══════════════════════════════════════════════════════════════
#  ROUTES
# ═══════════════════════════════════════════════════════════════

@app.get("/api/devices", response_model=list[DeviceInfo])
async def list_devices():
    """Return all supported device profiles."""
    return [DeviceInfo(**d.to_dict()) for d in DEVICES.values()]


# ─── SVG → THR/GCode ─────────────────────────────────────────

@app.post("/api/convert")
async def convert_svg(
    file: UploadFile = File(..., description="SVG file to convert"),
    device_id: str = Form("oasis_mini"),
    fit: str = Form("cover"),
    samples: int = Form(16),
    max_rho: float | None = Form(None),
    padding: float = Form(0.0),
    custom_width_mm: float | None = Form(None),
    custom_height_mm: float | None = Form(None),
    request: Request = None,  # type: ignore[assignment]
):
    """Upload an SVG → receive .thr or .gcode.  All in-memory."""
    ip = request.client.host if request and request.client else "unknown"
    req_id = uuid.uuid4().hex[:12]

    if not _check_rate(ip):
        log("rate_limited", ip=ip, req_id=req_id)
        raise HTTPException(
            429,
            f"Rate limit exceeded. Max {RATE_MAX_REQUESTS} requests per {RATE_WINDOW}s.",
        )

    device = _resolve_device(device_id, custom_width_mm, custom_height_mm)

    if fit not in ("cover", "contain"):
        raise HTTPException(400, "fit must be 'cover' or 'contain'")

    samples = max(4, min(64, samples))
    padding = max(0.0, min(0.5, padding))

    try:
        raw = await file.read()
        if len(raw) > RATE_MAX_UPLOAD_MB * 1024 * 1024:
            raise HTTPException(413, f"File too large. Max {RATE_MAX_UPLOAD_MB} MB.")
        svg_text = raw.decode("utf-8", errors="replace")
    except UnicodeDecodeError:
        raise HTTPException(400, "File does not appear to be valid SVG/XML text.")
    finally:
        await file.close()

    if "<svg" not in svg_text[:2000].lower():
        raise HTTPException(400, "File does not appear to be an SVG.")

    try:
        result = convert(
            svg_text=svg_text,
            device=device,
            fit=fit,
            samples=samples,
            max_rho_override=max_rho,
            padding=padding,
        )
    except ValueError as e:
        log("convert_error", ip=ip, req_id=req_id, error=str(e))
        raise HTTPException(422, str(e))
    except Exception as e:
        log("convert_error", ip=ip, req_id=req_id, error=str(e))
        raise HTTPException(
            500, "Conversion failed. The SVG may contain unsupported elements."
        )

    log(
        "convert_ok",
        req_id=req_id, ip=ip, device=device.name, fit=fit,
        samples=samples,
        points=result.stats.get("points", 0),
        subpaths=result.stats.get("subpaths", 0),
        upload_bytes=len(raw),
    )

    return Response(
        content=result.output,
        media_type="application/octet-stream",
        headers={
            "Content-Disposition": f'attachment; filename="{result.filename}"',
            "X-Request-Id": req_id,
            "X-Stats": json.dumps(result.stats),
        },
    )


# ─── Raster Image → SVG → THR/GCode ─────────────────────────

@app.post("/api/convert-image")
async def convert_image(
    file: UploadFile = File(
        ..., description="Raster image (JPG, PNG, WebP, BMP, GIF, TIFF)"
    ),
    # ── Vectoriser options ──
    trace_mode: str = Form("outline"),
    threshold: int = Form(128),
    blur: float = Form(1.0),
    invert: bool = Form(False),
    detail: float = Form(1.5),
    max_dimension: int = Form(800),
    line_width: float = Form(2.0),
    # ── THR converter options ──
    device_id: str = Form("oasis_mini"),
    fit: str = Form("cover"),
    samples: int = Form(16),
    max_rho: float | None = Form(None),
    padding: float = Form(0.0),
    custom_width_mm: float | None = Form(None),
    custom_height_mm: float | None = Form(None),
    # ── Control ──
    svg_only: bool = Form(False),
    request: Request = None,  # type: ignore[assignment]
):
    """
    Upload a raster image → vectorise to SVG → convert to THR/GCode.

    If ``svg_only=true``, returns the intermediate SVG instead of the
    final .thr/.gcode (useful for previewing the trace result).

    All processing happens in memory — nothing is written to disk.
    """
    ip = request.client.host if request and request.client else "unknown"
    req_id = uuid.uuid4().hex[:12]

    if not _check_rate(ip):
        log("rate_limited", ip=ip, req_id=req_id, endpoint="convert-image")
        raise HTTPException(
            429,
            f"Rate limit exceeded. Max {RATE_MAX_REQUESTS} requests per {RATE_WINDOW}s.",
        )

    # Validate file type
    ext = (
        "." + (file.filename or "").rsplit(".", 1)[-1].lower()
        if file.filename else ""
    )
    if ext not in ALLOWED_IMAGE_EXTS and file.content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(
            400,
            "Unsupported image format. Accepted: JPG, PNG, WebP, BMP, GIF, TIFF.",
        )

    try:
        raw = await file.read()
        if len(raw) > RATE_MAX_UPLOAD_MB * 1024 * 1024:
            raise HTTPException(413, f"File too large. Max {RATE_MAX_UPLOAD_MB} MB.")
    finally:
        await file.close()

    device = _resolve_device(device_id, custom_width_mm, custom_height_mm)

    if fit not in ("cover", "contain"):
        raise HTTPException(400, "fit must be 'cover' or 'contain'")
    if trace_mode not in ("outline", "threshold", "centerline"):
        raise HTTPException(
            400, "trace_mode must be 'outline', 'threshold', or 'centerline'"
        )

    samples = max(4, min(64, samples))
    padding = max(0.0, min(0.5, padding))
    threshold = max(0, min(255, threshold))
    blur = max(0.0, min(10.0, blur))
    detail = max(0.1, min(10.0, detail))
    max_dimension = max(100, min(2000, max_dimension))
    line_width = max(0.5, min(10.0, line_width))

    # ── Step 1: Vectorise image → SVG ──
    try:
        vec_result = vectorise(
            raw,
            VectoriseOpts(
                mode=trace_mode,
                threshold=threshold,
                blur=blur,
                invert=invert,
                detail=detail,
                max_dimension=max_dimension,
                line_width=line_width,
            ),
        )
    except Exception as e:
        log("vectorise_error", ip=ip, req_id=req_id, error=str(e))
        raise HTTPException(422, f"Image vectorisation failed: {e}")

    log(
        "vectorise_ok",
        req_id=req_id, ip=ip, trace_mode=trace_mode, threshold=threshold,
        image_size=f"{vec_result.width}x{vec_result.height}",
        paths=vec_result.path_count, points=vec_result.point_count,
        upload_bytes=len(raw),
    )

    # SVG-only preview mode
    if svg_only:
        vec_stats = {
            "image_size": f"{vec_result.width}×{vec_result.height}",
            "trace_mode": trace_mode,
            "paths": vec_result.path_count,
            "points": vec_result.point_count,
        }
        return Response(
            content=vec_result.svg_text,
            media_type="image/svg+xml",
            headers={
                "Content-Disposition": 'attachment; filename="traced.svg"',
                "X-Request-Id": req_id,
                "X-Stats": json.dumps(vec_stats),
            },
        )

    # ── Step 2: SVG → THR/GCode ──
    try:
        result = convert(
            svg_text=vec_result.svg_text,
            device=device,
            fit=fit,
            samples=samples,
            max_rho_override=max_rho,
            padding=padding,
        )
    except ValueError as e:
        log("convert_error", ip=ip, req_id=req_id, error=str(e))
        raise HTTPException(422, str(e))
    except Exception as e:
        log("convert_error", ip=ip, req_id=req_id, error=str(e))
        raise HTTPException(500, "Conversion failed after vectorisation.")

    combined_stats = {
        **result.stats,
        "image_size": f"{vec_result.width}×{vec_result.height}",
        "trace_mode": trace_mode,
        "traced_paths": vec_result.path_count,
        "traced_points": vec_result.point_count,
    }

    log(
        "image_convert_ok",
        req_id=req_id, ip=ip, device=device.name, fit=fit,
        trace_mode=trace_mode,
        points=result.stats.get("points", 0),
        subpaths=result.stats.get("subpaths", 0),
        upload_bytes=len(raw),
    )

    return Response(
        content=result.output,
        media_type="application/octet-stream",
        headers={
            "Content-Disposition": f'attachment; filename="{result.filename}"',
            "X-Request-Id": req_id,
            "X-Stats": json.dumps(combined_stats),
        },
    )


@app.get("/api/health")
async def health():
    return {"status": "ok", "ts": datetime.now(timezone.utc).isoformat()}
