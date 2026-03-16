/**
 * HoloGen — Frontend application (fully client-side).
 *
 * Upload an image, GIF, or video → select preset → tweak effects
 * → choose layout → real-time animated preview → generate GIF.
 *
 * ALL processing happens in-browser. No server calls.
 * Uses: Canvas 2D for rendering, custom GIF encoder with LZW,
 * HTML5 Video for frame extraction, custom GIF decoder for
 * animated GIF frame parsing.
 */
import "./styles.css";
import { PRESETS, PRESET_ORDER } from "./presets";
import { renderHoloFrame } from "./hologram";
import { composeLayout } from "./layout";
import { encodeGif } from "./gif-encoder";
import { encodeVideo, isVideoExportSupported, getVideoExportFormat, } from "./video-encoder";
import { parseMedia, detectSourceType, validateFile, } from "./media-parser";
// ─── DOM refs ────────────────────────────────────────────────
const $ = (s) => document.querySelector(s);
const dropZone = $("#drop-zone");
const fileInput = $("#file-input");
const fileNameEl = $("#file-name");
const fileThumb = $("#file-thumb");
const sourceBadge = $("#source-badge");
const sourceTag = $("#source-tag");
const sourceDetails = $("#source-details");
const presetsContainer = $("#presets");
const previewBtn = $("#preview-btn");
const generateBtn = $("#generate-btn");
const previewCanvas = $("#preview-canvas");
const previewImg = $("#preview-img");
const emptyState = $("#empty-state");
const progressEl = $("#progress");
const progressFill = $("#progress-fill");
const progressText = $("#progress-text");
const statusEl = $("#status");
const downloadEl = $("#download");
const downloadBtn = $("#download-btn");
const statsEl = $("#stats");
const statsGrid = $("#stats-grid");
const gifOpts = $("#gif-opts");
const sourceTimingRow = $("#source-timing-row");
const frameCountGroup = $("#frame-count-group");
const frameNote = $("#frame-note");
const layoutSelect = $("#layout-mode");
const layoutNote = $("#layout-note");
const formatSelect = $("#output-format");
const formatNote = $("#format-note");
const errorToast = $("#error-toast");
const errorMsg = $("#error-msg");
// ─── State ───────────────────────────────────────────────────
let activePresetId = "classic";
// Track selected file for re-parsing on resolution change
let lastGifUrl = null;
let lastDownloadExt = "gif";
let frameMode = "source";
let sourceType = "static";
// Client-side media state
let parsedMedia = null;
let animationId = null;
let animFrameIdx = 0;
let animStartTime = 0;
let isGenerating = false;
// ─── Helpers ─────────────────────────────────────────────────
function showError(msg) {
    errorMsg.textContent = msg;
    errorToast.hidden = false;
    setTimeout(() => { errorToast.hidden = true; }, 6000);
}
function setLoading(btn, on) {
    btn.classList.toggle("loading", on);
    btn.disabled = on;
}
function setStatus(text, type = "") {
    statusEl.textContent = text;
    statusEl.className = "status" + (type ? ` status--${type}` : "");
}
function triggerDownload(url, filename) {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
}
// ─── Get current preset from UI sliders ─────────────────────
function getCurrentPreset() {
    const rawBrightness = parseInt(($("#brightness")).value);
    return {
        id: activePresetId,
        name: PRESETS[activePresetId]?.name || "Custom",
        description: "",
        scan_lines: parseInt(($("#scan-lines")).value) / 100,
        glow: parseInt(($("#glow")).value) / 100,
        flicker: parseInt(($("#flicker")).value) / 100,
        glitch: parseInt(($("#glitch")).value) / 100,
        noise: parseInt(($("#noise")).value) / 100,
        color_shift: parseInt(($("#color-shift")).value) / 100,
        edge_detect: parseInt(($("#edge-detect")).value) / 100,
        brightness: 0.5 + (rawBrightness / 100) * 1.5, // maps 0–100 → 0.5–2.0
        hue: ($("#hue-select")).value,
        grid: ($("#grid-overlay")).checked,
        chromatic_aberration: ($("#chrom-aberration")).checked,
        wobble: ($("#wobble")).checked,
    };
}
function getFrameCount() {
    return parseInt(($("#frame-count")).value);
}
function getSpeedMs() {
    return parseInt(($("#speed")).value);
}
function getResolution() {
    return parseInt(($("#resolution")).value);
}
function getLayout() {
    return layoutSelect.value;
}
function getUseSourceTiming() {
    return ($("#use-source-timing")).checked;
}
// ─── Resize ImageData helper ─────────────────────────────────
function resizeImageData(data, targetW) {
    if (data.width <= targetW)
        return data;
    const scale = targetW / data.width;
    const nw = targetW;
    const nh = Math.round(data.height * scale);
    const srcCanvas = document.createElement("canvas");
    srcCanvas.width = data.width;
    srcCanvas.height = data.height;
    srcCanvas.getContext("2d").putImageData(data, 0, 0);
    const dstCanvas = document.createElement("canvas");
    dstCanvas.width = nw;
    dstCanvas.height = nh;
    const ctx = dstCanvas.getContext("2d");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(srcCanvas, 0, 0, nw, nh);
    return ctx.getImageData(0, 0, nw, nh);
}
// ─── Slider wiring ──────────────────────────────────────────
const SLIDERS = [
    ["scan-lines", "val-scan", true],
    ["glow", "val-glow", true],
    ["flicker", "val-flicker", true],
    ["glitch", "val-glitch", true],
    ["noise", "val-noise", true],
    ["color-shift", "val-shift", true],
    ["edge-detect", "val-edge", true],
    ["brightness", "val-brightness", true],
    ["frame-count", "val-frames", false],
    ["speed", "val-speed", false],
];
for (const [sliderId, dispId, pct] of SLIDERS) {
    const el = document.getElementById(sliderId);
    const disp = document.getElementById(dispId);
    el.addEventListener("input", () => {
        disp.textContent = pct ? el.value + "%" : el.value;
    });
}
// ─── Layout mode selector ────────────────────────────────────
const LAYOUT_NOTES = {
    pyramid4: "4 rotations for 4-sided pyramid projectors",
    pyramid3: "3 rotations for 3-sided showcase displays",
    fan: "Circular crop for LED fan / POV displays",
    peppers_ghost: "Positioned for 45° angled glass reflectors",
    single: "Direct hologram output — no layout compositing",
};
layoutSelect.addEventListener("change", () => {
    layoutNote.textContent = LAYOUT_NOTES[layoutSelect.value] || "";
});
// ─── Output format selector ─────────────────────────────────
function getOutputFormat() {
    return formatSelect.value;
}
function initFormatSelector() {
    if (!isVideoExportSupported()) {
        // Disable video option if browser doesn't support MediaRecorder
        const videoOpt = formatSelect.querySelector('option[value="video"]');
        if (videoOpt) {
            videoOpt.disabled = true;
            videoOpt.textContent = "Video — not supported in this browser";
        }
    }
    else {
        const fmt = getVideoExportFormat();
        const videoOpt = formatSelect.querySelector('option[value="video"]');
        if (videoOpt) {
            videoOpt.textContent = `Video (${fmt}) — smaller file`;
        }
    }
}
formatSelect.addEventListener("change", () => {
    const fmt = getOutputFormat();
    if (fmt === "video") {
        formatNote.textContent = `Will encode as ${getVideoExportFormat()} using your browser's built-in codec`;
        formatNote.classList.add("active");
    }
    else {
        formatNote.textContent = "";
        formatNote.classList.remove("active");
    }
});
// ─── Load presets (local — no API) ──────────────────────────
function loadPresets() {
    presetsContainer.innerHTML = "";
    for (const id of PRESET_ORDER) {
        const p = PRESETS[id];
        const btn = document.createElement("button");
        btn.className = "preset" + (p.id === activePresetId ? " active" : "");
        btn.textContent = p.name;
        btn.title = p.description;
        btn.dataset.id = p.id;
        btn.addEventListener("click", () => applyPreset(p));
        presetsContainer.appendChild(btn);
    }
}
function applyPreset(p) {
    activePresetId = p.id;
    presetsContainer.querySelectorAll(".preset").forEach(btn => {
        btn.classList.toggle("active", btn.dataset.id === p.id);
    });
    setSlider("scan-lines", Math.round(p.scan_lines * 100));
    setSlider("glow", Math.round(p.glow * 100));
    setSlider("flicker", Math.round(p.flicker * 100));
    setSlider("glitch", Math.round(p.glitch * 100));
    setSlider("noise", Math.round(p.noise * 100));
    setSlider("color-shift", Math.round(p.color_shift * 100));
    setSlider("edge-detect", Math.round(p.edge_detect * 100));
    // brightness: maps 0.5–2.0 → 0–100
    setSlider("brightness", Math.round(((p.brightness - 0.5) / 1.5) * 100));
    ($("#hue-select")).value = p.hue;
    ($("#grid-overlay")).checked = p.grid;
    ($("#chrom-aberration")).checked = p.chromatic_aberration;
    ($("#wobble")).checked = p.wobble;
}
function setSlider(id, val) {
    const el = document.getElementById(id);
    el.value = String(val);
    el.dispatchEvent(new Event("input"));
}
// ─── File handling ──────────────────────────────────────────
async function handleFile(file) {
    const err = validateFile(file.name, file.size);
    if (err) {
        showError(err);
        return;
    }
    sourceType = detectSourceType(file.name);
    fileNameEl.textContent = file.name;
    dropZone.classList.add("has-file");
    // Show thumbnail
    if (sourceType === "video") {
        const video = document.createElement("video");
        video.muted = true;
        video.preload = "auto";
        const videoUrl = URL.createObjectURL(file);
        video.src = videoUrl;
        video.addEventListener("loadeddata", () => {
            const canvas = document.createElement("canvas");
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            canvas.getContext("2d").drawImage(video, 0, 0);
            fileThumb.src = canvas.toDataURL("image/png");
            URL.revokeObjectURL(videoUrl);
        }, { once: true });
        video.load();
    }
    else {
        const reader = new FileReader();
        reader.onload = (e) => { fileThumb.src = e.target?.result; };
        reader.readAsDataURL(file);
    }
    // Show animated-source controls
    const hasMultiFrames = sourceType === "gif" || sourceType === "video";
    showAnimatedControls(hasMultiFrames);
    const badgeLabel = sourceType === "video" ? "VIDEO" : sourceType === "gif" ? "GIF" : "STATIC";
    showSourceBadge(badgeLabel, file.name);
    // Parse media
    stopAnimation();
    setStatus("Parsing media...", "busy");
    previewBtn.disabled = true;
    generateBtn.disabled = true;
    try {
        const resolution = getResolution();
        parsedMedia = await parseMedia(file, resolution, (p) => {
            setStatus(`Extracting frames... ${Math.round(p * 100)}%`, "busy");
        });
        setStatus(`Ready — ${parsedMedia.frames.length} frame${parsedMedia.frames.length > 1 ? "s" : ""} loaded`, "ok");
        previewBtn.disabled = false;
        generateBtn.disabled = false;
        // Auto-start preview
        emptyState.style.display = "none";
        previewImg.style.display = "none";
        previewCanvas.style.display = "block";
        downloadEl.classList.remove("active");
        statsEl.classList.remove("active");
        progressEl.classList.remove("active");
        startAnimation();
    }
    catch (e) {
        showError(e instanceof Error ? e.message : "Failed to parse file");
        setStatus("", "error");
    }
}
function showSourceBadge(type, name) {
    sourceBadge.classList.add("active");
    sourceTag.textContent = type;
    const tagClass = type === "GIF" ? "tag--gif" : type === "VIDEO" ? "tag--video" : "tag--static";
    sourceTag.className = "source-badge__tag " + tagClass;
    sourceDetails.textContent = name;
}
function showAnimatedControls(show) {
    gifOpts.classList.toggle("active", show);
    sourceTimingRow.classList.toggle("active", show);
    if (show && frameMode === "source") {
        frameCountGroup.style.opacity = "0.3";
        frameCountGroup.style.pointerEvents = "none";
    }
    else {
        frameCountGroup.style.opacity = "1";
        frameCountGroup.style.pointerEvents = "auto";
    }
}
dropZone.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", () => {
    if (fileInput.files?.[0])
        handleFile(fileInput.files[0]);
});
dropZone.addEventListener("dragover", (e) => { e.preventDefault(); dropZone.classList.add("dragover"); });
dropZone.addEventListener("dragleave", () => dropZone.classList.remove("dragover"));
dropZone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropZone.classList.remove("dragover");
    if (e.dataTransfer?.files[0])
        handleFile(e.dataTransfer.files[0]);
});
// ─── Frame mode toggle ─────────────────────────────────────
document.querySelectorAll(".fmode").forEach(btn => {
    btn.addEventListener("click", () => {
        document.querySelectorAll(".fmode").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        frameMode = btn.dataset.mode;
        if (frameMode === "source") {
            frameNote.textContent = "Uses all source frames with hologram applied to each";
            frameCountGroup.style.opacity = "0.3";
            frameCountGroup.style.pointerEvents = "none";
        }
        else {
            frameNote.textContent = "Custom frame count; source frames cycle to fill";
            frameCountGroup.style.opacity = "1";
            frameCountGroup.style.pointerEvents = "auto";
        }
    });
});
// ─── Real-time animated preview ─────────────────────────────
function startAnimation() {
    stopAnimation();
    if (!parsedMedia)
        return;
    animFrameIdx = 0;
    animStartTime = performance.now();
    const animate = () => {
        if (isGenerating || !parsedMedia)
            return;
        const preset = getCurrentPreset();
        const layout = getLayout();
        const resolution = getResolution();
        const isStatic = parsedMedia.sourceType === "static";
        const totalFrames = isStatic ? getFrameCount() : parsedMedia.frames.length;
        const speedMs = isStatic ? getSpeedMs() :
            (getUseSourceTiming() ? (parsedMedia.frames[0]?.delay || 80) : getSpeedMs());
        // Compute frame from elapsed time
        const elapsed = performance.now() - animStartTime;
        animFrameIdx = Math.floor(elapsed / speedMs) % totalFrames;
        // Pick source frame
        const srcFrame = parsedMedia.frames[animFrameIdx % parsedMedia.frames.length];
        let source = srcFrame.imageData;
        source = resizeImageData(source, resolution);
        // Apply hologram effects
        let rendered = renderHoloFrame(source, animFrameIdx, totalFrames, preset);
        // Apply layout
        if (layout !== "single") {
            const canvasSize = Math.min(resolution * 2, 800);
            rendered = composeLayout(rendered, layout, canvasSize);
        }
        // Draw to preview canvas
        previewCanvas.width = rendered.width;
        previewCanvas.height = rendered.height;
        const ctx = previewCanvas.getContext("2d");
        ctx.putImageData(rendered, 0, 0);
        animationId = requestAnimationFrame(animate);
    };
    animationId = requestAnimationFrame(animate);
}
function stopAnimation() {
    if (animationId !== null) {
        cancelAnimationFrame(animationId);
        animationId = null;
    }
}
// ─── Preview button (restart animation) ──────────────────────
previewBtn.addEventListener("click", () => {
    if (!parsedMedia)
        return;
    downloadEl.classList.remove("active");
    statsEl.classList.remove("active");
    progressEl.classList.remove("active");
    previewImg.style.display = "none";
    const videoEl = document.querySelector("#preview-video");
    if (videoEl)
        videoEl.style.display = "none";
    previewCanvas.style.display = "block";
    emptyState.style.display = "none";
    setStatus("Live preview — adjust controls in real-time", "ok");
    startAnimation();
});
// ─── Generate full GIF (client-side) ────────────────────────
async function doGenerate() {
    if (!parsedMedia)
        return;
    isGenerating = true;
    stopAnimation();
    setLoading(generateBtn, true);
    setLoading(previewBtn, true);
    downloadEl.classList.remove("active");
    statsEl.classList.remove("active");
    progressEl.classList.add("active");
    progressFill.style.width = "5%";
    progressText.textContent = "Rendering frames...";
    setStatus("Generating hologram GIF...", "busy");
    // Yield to let UI update
    await new Promise(r => setTimeout(r, 50));
    try {
        const preset = getCurrentPreset();
        const layout = getLayout();
        const resolution = getResolution();
        const speedMs = getSpeedMs();
        const useSourceTiming = getUseSourceTiming();
        const isStatic = parsedMedia.sourceType === "static";
        let totalFrames;
        if (isStatic) {
            totalFrames = Math.max(8, Math.min(120, getFrameCount()));
        }
        else if (frameMode === "custom") {
            totalFrames = Math.max(8, Math.min(120, getFrameCount()));
        }
        else {
            totalFrames = parsedMedia.frames.length;
        }
        const canvasSize = layout !== "single" ? Math.min(resolution * 2, 800) : resolution;
        const gifFrames = [];
        for (let i = 0; i < totalFrames; i++) {
            const srcFrame = parsedMedia.frames[i % parsedMedia.frames.length];
            let source = srcFrame.imageData;
            source = resizeImageData(source, resolution);
            let rendered = renderHoloFrame(source, i, totalFrames, preset);
            if (layout !== "single") {
                rendered = composeLayout(rendered, layout, canvasSize);
            }
            let delay;
            if (isStatic) {
                delay = speedMs;
            }
            else {
                delay = useSourceTiming ? srcFrame.delay : speedMs;
            }
            gifFrames.push({ data: rendered, delay: Math.max(20, delay) });
            // Update progress
            const pct = Math.round(((i + 1) / totalFrames) * 80) + 5;
            progressFill.style.width = pct + "%";
            progressText.textContent = `Rendering frame ${i + 1} of ${totalFrames}...`;
            // Yield to UI every 4 frames
            if (i % 4 === 3)
                await new Promise(r => setTimeout(r, 0));
        }
        // Encode output based on selected format
        const outputFormat = getOutputFormat();
        let blob;
        let fileExt;
        if (outputFormat === "video" && isVideoExportSupported()) {
            // ─── Video encoding path ───
            progressFill.style.width = "85%";
            progressText.textContent = "Encoding video...";
            await new Promise(r => setTimeout(r, 50));
            const videoFrames = gifFrames.map(f => ({
                data: f.data,
                delay: f.delay,
            }));
            const result = await encodeVideo(videoFrames, (p) => {
                progressFill.style.width = Math.round(85 + p * 10) + "%";
            });
            blob = result.blob;
            fileExt = result.extension;
        }
        else {
            // ─── GIF encoding path ───
            progressFill.style.width = "85%";
            progressText.textContent = "Encoding GIF...";
            await new Promise(r => setTimeout(r, 50));
            const gifBytes = encodeGif(gifFrames, { loop: 0 }, (p) => {
                progressFill.style.width = Math.round(85 + p * 10) + "%";
            });
            blob = new Blob([gifBytes.buffer], { type: "image/gif" });
            fileExt = "gif";
        }
        // Display result
        if (lastGifUrl)
            URL.revokeObjectURL(lastGifUrl);
        lastGifUrl = URL.createObjectURL(blob);
        lastDownloadExt = fileExt;
        previewCanvas.style.display = "none";
        if (fileExt === "gif") {
            previewImg.src = lastGifUrl;
            previewImg.style.display = "block";
        }
        else {
            // For video, show a video element instead
            let videoEl = document.querySelector("#preview-video");
            if (!videoEl) {
                videoEl = document.createElement("video");
                videoEl.id = "preview-video";
                videoEl.autoplay = true;
                videoEl.loop = true;
                videoEl.muted = true;
                videoEl.playsInline = true;
                videoEl.style.maxWidth = "100%";
                previewImg.parentElement.appendChild(videoEl);
            }
            videoEl.src = lastGifUrl;
            videoEl.style.display = "block";
            previewImg.style.display = "none";
        }
        emptyState.style.display = "none";
        downloadEl.classList.add("active");
        downloadBtn.textContent = `⬇ Download Hologram ${fileExt.toUpperCase()}`;
        progressFill.style.width = "100%";
        const sizeMB = (blob.size / 1024 / 1024).toFixed(2);
        progressText.textContent = `Complete — ${sizeMB} MB (${fileExt.toUpperCase()})`;
        showStats({
            frame_count: totalFrames,
            width_px: gifFrames[0].data.width,
            height_px: gifFrames[0].data.height,
            source_type: parsedMedia.sourceType,
            source_frames: parsedMedia.frames.length,
            preset_id: activePresetId,
            file_size_kb: Math.round(blob.size / 1024 * 10) / 10,
            layout,
        });
        setStatus("Hologram GIF ready!", "ok");
    }
    catch (err) {
        showError(err instanceof Error ? err.message : "Generation failed");
        setStatus("", "error");
        progressEl.classList.remove("active");
    }
    finally {
        isGenerating = false;
        setLoading(generateBtn, false);
        setLoading(previewBtn, false);
    }
}
generateBtn.addEventListener("click", doGenerate);
// ─── Download ───────────────────────────────────────────────
downloadBtn.addEventListener("click", () => {
    if (lastGifUrl)
        triggerDownload(lastGifUrl, `holopath-output.${lastDownloadExt}`);
});
// ─── Stats display ──────────────────────────────────────────
const LAYOUT_LABELS = {
    pyramid4: "Pyramid 360°",
    pyramid3: "Pyramid 270°",
    fan: "Hologram Fan",
    peppers_ghost: "Pepper's Ghost",
    single: "Single Image",
};
function formatSourceType(stats) {
    if (stats.source_type === "video")
        return `Video (${stats.source_frames} frames)`;
    if (stats.source_type === "gif")
        return `GIF (${stats.source_frames} frames)`;
    return "Static image";
}
function showStats(stats) {
    statsEl.classList.add("active");
    const entries = [
        ["Frames", String(stats.frame_count)],
        ["Resolution", `${stats.width_px}×${stats.height_px}`],
        ["Source", formatSourceType(stats)],
        ["Layout", LAYOUT_LABELS[stats.layout] || stats.layout],
        ["Preset", stats.preset_id],
        ["File size", `${stats.file_size_kb} KB`],
    ];
    statsGrid.innerHTML = entries
        .map(([l, v]) => `<div class="stat"><div class="stat__label">${l}</div><div class="stat__value">${v}</div></div>`)
        .join("");
}
// ─── Init ───────────────────────────────────────────────────
loadPresets();
initFormatSelector();
