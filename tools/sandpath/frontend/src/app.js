/**
 * SandPath — Frontend application
 *
 * All processing runs in the browser. No server calls.
 * Dual pipeline:
 *   SVG files   → converter.ts  → .thr/.gcode
 *   Raster imgs → vectorizer.ts → SVG → converter.ts → .thr/.gcode
 */
import { DEVICE_LIST } from "./devices.js";
import { convert } from "./converter.js";
import { vectorize } from "./vectorizer.js";
// ─── Constants ───────────────────────────────────────────────
const SVG_EXTS = new Set([".svg"]);
const SVG_MIMES = new Set(["image/svg+xml"]);
const IMG_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp", ".bmp", ".gif", ".tiff", ".tif"]);
const IMG_MIMES = new Set(["image/jpeg", "image/png", "image/webp", "image/bmp", "image/gif", "image/tiff"]);
// ─── DOM refs ────────────────────────────────────────────────
const $ = (s) => document.querySelector(s);
const dropZone = $("#drop-zone");
const fileInput = $("#file-input");
const fileNameEl = $("#file-name");
const fileTypeBadge = $("#file-type-badge");
const traceSection = $("#trace-section");
const traceModeSelect = $("#trace-mode");
const thresholdRange = $("#threshold-range");
const thresholdValue = $("#threshold-value");
const blurRange = $("#blur-range");
const blurValue = $("#blur-value");
const detailRange = $("#detail-range");
const detailValue = $("#detail-value");
const dimensionRange = $("#dimension-range");
const dimensionValue = $("#dimension-value");
const invertCheck = $("#invert-check");
const previewBtn = $("#preview-btn");
const previewSection = $("#preview-section");
const previewFrame = $("#preview-frame");
const previewStats = $("#preview-stats");
const retraceBtn = $("#retrace-btn");
const deviceSelect = $("#device-select");
const customFields = $("#custom-fields");
const customWidth = $("#custom-width");
const customHeight = $("#custom-height");
const fitSelect = $("#fit-select");
const samplesRange = $("#samples-range");
const samplesValue = $("#samples-value");
const rhoRange = $("#rho-range");
const rhoValue = $("#rho-value");
const paddingRange = $("#padding-range");
const paddingValue = $("#padding-value");
const convertBtn = $("#convert-btn");
const resultsSection = $("#results-section");
const statsGrid = $("#stats-grid");
const downloadBtn = $("#download-btn");
const downloadExt = $("#download-ext");
const downloadSvgBtn = $("#download-svg-btn");
const againBtn = $("#again-btn");
const errorToast = $("#error-toast");
const errorMsg = $("#error-msg");
// ─── State ───────────────────────────────────────────────────
let devices = [];
let selectedFile = null;
let fileMode = "svg";
let lastBlob = null;
let lastSvgBlob = null;
let lastFilename = "output.thr";
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
function getDevice() {
    return devices.find(d => d.id === deviceSelect.value);
}
function detectFileMode(file) {
    const ext = "." + file.name.split(".").pop()?.toLowerCase();
    if (SVG_EXTS.has(ext) || SVG_MIMES.has(file.type))
        return "svg";
    return "image";
}
function triggerDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}
function getCustomDevice(base) {
    if (!base.id.startsWith("custom_"))
        return base;
    return {
        ...base,
        width_mm: parseFloat(customWidth.value) || base.width_mm,
        height_mm: parseFloat(customHeight.value) || base.height_mm,
    };
}
// ─── Device list ─────────────────────────────────────────────
function loadDevices() {
    devices = DEVICE_LIST;
    deviceSelect.innerHTML = "";
    const addGroup = (label, items) => {
        const g = document.createElement("optgroup");
        g.label = label;
        items.forEach(d => {
            const o = document.createElement("option");
            o.value = d.id;
            o.textContent = `${d.name} — ${d.description}`;
            g.appendChild(o);
        });
        deviceSelect.appendChild(g);
    };
    addGroup("⬤  Circular tables", devices.filter(d => d.shape === "circular"));
    addGroup("▬  Rectangular tables", devices.filter(d => d.shape === "rectangular"));
    updateDeviceUI();
}
function updateDeviceUI() {
    const dev = getDevice();
    if (!dev)
        return;
    customFields.style.display = dev.id.startsWith("custom_") ? "grid" : "none";
    rhoRange.value = String(dev.max_rho);
    rhoValue.textContent = dev.max_rho.toFixed(2);
    downloadExt.textContent = dev.output_format === "thr" ? ".thr" : ".gcode";
}
// ─── File handling ───────────────────────────────────────────
function handleFile(file) {
    const ext = "." + file.name.split(".").pop()?.toLowerCase();
    if (!new Set([...SVG_EXTS, ...IMG_EXTS]).has(ext)
        && !SVG_MIMES.has(file.type) && !IMG_MIMES.has(file.type)) {
        showError("Unsupported file. Upload SVG, JPG, PNG, WebP, BMP, GIF, or TIFF.");
        return;
    }
    if (file.size > 10 * 1024 * 1024) {
        showError("File too large. Max 10 MB.");
        return;
    }
    selectedFile = file;
    fileMode = detectFileMode(file);
    fileNameEl.textContent = file.name;
    dropZone.classList.add("has-file");
    fileTypeBadge.hidden = false;
    fileTypeBadge.textContent = fileMode === "svg" ? "SVG" : "Image";
    fileTypeBadge.className = `upload__badge upload__badge--${fileMode}`;
    traceSection.style.display = fileMode === "image" ? "flex" : "none";
    previewBtn.disabled = fileMode !== "image";
    resultsSection.style.display = "none";
    previewSection.style.display = "none";
    lastSvgBlob = null;
    convertBtn.disabled = false;
}
dropZone.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", () => {
    if (fileInput.files?.[0])
        handleFile(fileInput.files[0]);
});
dropZone.addEventListener("dragover", e => { e.preventDefault(); dropZone.classList.add("dragover"); });
dropZone.addEventListener("dragleave", () => dropZone.classList.remove("dragover"));
dropZone.addEventListener("drop", e => {
    e.preventDefault();
    dropZone.classList.remove("dragover");
    if (e.dataTransfer?.files[0])
        handleFile(e.dataTransfer.files[0]);
});
// ─── Range input bindings ────────────────────────────────────
thresholdRange.addEventListener("input", () => { thresholdValue.textContent = thresholdRange.value; });
blurRange.addEventListener("input", () => { blurValue.textContent = parseFloat(blurRange.value).toFixed(1); });
detailRange.addEventListener("input", () => { detailValue.textContent = parseFloat(detailRange.value).toFixed(1); });
dimensionRange.addEventListener("input", () => { dimensionValue.textContent = dimensionRange.value; });
samplesRange.addEventListener("input", () => { samplesValue.textContent = samplesRange.value; });
rhoRange.addEventListener("input", () => { rhoValue.textContent = parseFloat(rhoRange.value).toFixed(2); });
paddingRange.addEventListener("input", () => { paddingValue.textContent = `${Math.round(parseFloat(paddingRange.value) * 100)}%`; });
deviceSelect.addEventListener("change", updateDeviceUI);
// ─── Vectorize opts from UI ───────────────────────────────────
function getVectorizeOpts() {
    return {
        mode: traceModeSelect.value,
        threshold: parseInt(thresholdRange.value),
        blur: parseFloat(blurRange.value),
        invert: invertCheck.checked,
        detail: parseFloat(detailRange.value),
        maxDimension: parseInt(dimensionRange.value),
        lineWidth: 2.0,
    };
}
function getConvertOpts() {
    const dev = getDevice();
    const rho = parseFloat(rhoRange.value);
    return {
        fit: fitSelect.value,
        samples: parseInt(samplesRange.value),
        maxRhoOverride: rho !== dev.max_rho ? rho : null,
        padding: parseFloat(paddingRange.value),
    };
}
// ─── Preview trace ───────────────────────────────────────────
async function doPreview() {
    if (!selectedFile || fileMode !== "image")
        return;
    setLoading(previewBtn, true);
    previewSection.style.display = "none";
    resultsSection.style.display = "none";
    try {
        const result = await vectorize(selectedFile, getVectorizeOpts());
        const { svgText, width, height, pathCount, pointCount } = result;
        lastSvgBlob = new Blob([svgText], { type: "image/svg+xml" });
        previewFrame.innerHTML = svgText;
        const svgEl = previewFrame.querySelector("svg");
        if (svgEl) {
            svgEl.removeAttribute("width");
            svgEl.removeAttribute("height");
            svgEl.style.width = "100%";
            svgEl.style.height = "auto";
            svgEl.style.maxHeight = "360px";
        }
        const parts = [
            `Size: ${width}×${height}`,
            `Paths: ${pathCount.toLocaleString()}`,
            `Points: ${pointCount.toLocaleString()}`,
            `Mode: ${traceModeSelect.value}`,
        ];
        previewStats.textContent = parts.join("  •  ");
        previewSection.style.display = "flex";
        previewSection.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    catch (err) {
        showError(err instanceof Error ? err.message : "Preview failed");
    }
    finally {
        setLoading(previewBtn, false);
    }
}
previewBtn.addEventListener("click", doPreview);
retraceBtn.addEventListener("click", () => {
    previewSection.style.display = "none";
    traceSection.scrollIntoView({ behavior: "smooth", block: "center" });
});
// ─── Convert ─────────────────────────────────────────────────
async function doConvert() {
    if (!selectedFile)
        return;
    setLoading(convertBtn, true);
    resultsSection.style.display = "none";
    try {
        const baseDevice = getDevice();
        const device = getCustomDevice(baseDevice);
        const convertOpts = getConvertOpts();
        let svgText;
        let traceStats = {};
        if (fileMode === "svg") {
            svgText = await selectedFile.text();
        }
        else {
            // Vectorize first; preserve intermediate SVG for download
            const vResult = await vectorize(selectedFile, getVectorizeOpts());
            svgText = vResult.svgText;
            lastSvgBlob = new Blob([svgText], { type: "image/svg+xml" });
            traceStats = {
                image_size: `${vResult.width}×${vResult.height}`,
                trace_mode: traceModeSelect.value,
                traced_paths: vResult.pathCount,
                traced_points: vResult.pointCount,
            };
        }
        const result = convert(svgText, device, convertOpts);
        lastBlob = new Blob([result.output], { type: "text/plain" });
        lastFilename = result.filename;
        showResults({ ...traceStats, ...result.stats });
    }
    catch (err) {
        showError(err instanceof Error ? err.message : "Conversion failed");
    }
    finally {
        setLoading(convertBtn, false);
    }
}
convertBtn.addEventListener("click", doConvert);
// ─── Results ─────────────────────────────────────────────────
function showResults(stats) {
    resultsSection.style.display = "flex";
    resultsSection.scrollIntoView({ behavior: "smooth", block: "center" });
    const entries = [];
    if (stats.image_size)
        entries.push(["Image size", stats.image_size]);
    if (stats.trace_mode)
        entries.push(["Trace mode", stats.trace_mode]);
    if (stats.traced_paths != null)
        entries.push(["Traced paths", stats.traced_paths.toLocaleString()]);
    if (stats.traced_points != null)
        entries.push(["Traced points", stats.traced_points.toLocaleString()]);
    if (stats.points != null)
        entries.push(["Output points", stats.points.toLocaleString()]);
    if (stats.subpaths != null)
        entries.push(["Subpaths", stats.subpaths]);
    if (stats.content_size)
        entries.push(["Content size", stats.content_size]);
    if (stats.fit)
        entries.push(["Fit mode", stats.fit]);
    if (stats.max_rho != null)
        entries.push(["Max ρ", stats.max_rho.toFixed(2)]);
    if (stats.polar_radius != null)
        entries.push(["Polar radius", stats.polar_radius]);
    if (stats.scale != null)
        entries.push(["Scale", stats.scale]);
    if (stats.clipped_points != null)
        entries.push(["Clipped pts", stats.clipped_points.toLocaleString()]);
    if (stats.bed_size)
        entries.push(["Bed size", stats.bed_size]);
    statsGrid.innerHTML = entries
        .map(([l, v]) => `<div class="stat"><div class="stat__label">${l}</div><div class="stat__value">${v}</div></div>`)
        .join("");
    const ext = lastFilename.split(".").pop() || "thr";
    downloadExt.textContent = `.${ext}`;
    downloadSvgBtn.style.display = (fileMode === "image" && lastSvgBlob) ? "inline-flex" : "none";
}
downloadBtn.addEventListener("click", () => { if (lastBlob)
    triggerDownload(lastBlob, lastFilename); });
downloadSvgBtn.addEventListener("click", () => { if (lastSvgBlob)
    triggerDownload(lastSvgBlob, "traced.svg"); });
againBtn.addEventListener("click", () => {
    selectedFile = null;
    lastBlob = null;
    lastSvgBlob = null;
    fileNameEl.textContent = "";
    fileTypeBadge.hidden = true;
    dropZone.classList.remove("has-file");
    convertBtn.disabled = true;
    previewBtn.disabled = true;
    resultsSection.style.display = "none";
    previewSection.style.display = "none";
    traceSection.style.display = "none";
    fileInput.value = "";
    document.getElementById("upload-section")?.scrollIntoView({ behavior: "smooth" });
});
// ─── Init ────────────────────────────────────────────────────
loadDevices();
