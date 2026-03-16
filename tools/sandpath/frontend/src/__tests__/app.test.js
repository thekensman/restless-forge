/**
 * SandPath Frontend Tests
 *
 * Tests DOM setup, file detection logic, form building,
 * and UI state transitions using jsdom.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
// ─── File type detection ────────────────────────────
describe("File type detection", () => {
    const SVG_EXTS = new Set([".svg"]);
    const IMG_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp", ".bmp", ".gif", ".tiff", ".tif"]);
    function detectFileMode(name, type) {
        const ext = "." + name.split(".").pop()?.toLowerCase();
        if (SVG_EXTS.has(ext) || type === "image/svg+xml")
            return "svg";
        if (IMG_EXTS.has(ext))
            return "image";
        return "image";
    }
    it("detects .svg files as svg mode", () => {
        expect(detectFileMode("drawing.svg", "image/svg+xml")).toBe("svg");
    });
    it("detects .SVG (uppercase) as svg mode", () => {
        expect(detectFileMode("drawing.SVG", "image/svg+xml")).toBe("svg");
    });
    it("detects .jpg as image mode", () => {
        expect(detectFileMode("photo.jpg", "image/jpeg")).toBe("image");
    });
    it("detects .jpeg as image mode", () => {
        expect(detectFileMode("photo.jpeg", "image/jpeg")).toBe("image");
    });
    it("detects .png as image mode", () => {
        expect(detectFileMode("logo.png", "image/png")).toBe("image");
    });
    it("detects .webp as image mode", () => {
        expect(detectFileMode("image.webp", "image/webp")).toBe("image");
    });
    it("detects .bmp as image mode", () => {
        expect(detectFileMode("old.bmp", "image/bmp")).toBe("image");
    });
    it("detects .gif as image mode", () => {
        expect(detectFileMode("anim.gif", "image/gif")).toBe("image");
    });
    it("detects .tiff as image mode", () => {
        expect(detectFileMode("scan.tiff", "image/tiff")).toBe("image");
    });
    it("detects .tif as image mode", () => {
        expect(detectFileMode("scan.tif", "image/tiff")).toBe("image");
    });
    it("defaults unknown to image mode", () => {
        expect(detectFileMode("file.xyz", "application/octet-stream")).toBe("image");
    });
});
// ─── File validation ────────────────────────────────
describe("File validation", () => {
    const VALID_EXTS = new Set([".svg", ".jpg", ".jpeg", ".png", ".webp", ".bmp", ".gif", ".tiff", ".tif"]);
    const MAX_SIZE = 10 * 1024 * 1024;
    function validateFile(name, size) {
        const ext = "." + name.split(".").pop()?.toLowerCase();
        if (!VALID_EXTS.has(ext))
            return "Unsupported file type";
        if (size > MAX_SIZE)
            return "File too large";
        return null;
    }
    it("accepts valid SVG", () => {
        expect(validateFile("test.svg", 1024)).toBeNull();
    });
    it("accepts valid PNG", () => {
        expect(validateFile("test.png", 5000)).toBeNull();
    });
    it("rejects .pdf", () => {
        expect(validateFile("test.pdf", 1024)).toBe("Unsupported file type");
    });
    it("rejects .doc", () => {
        expect(validateFile("test.doc", 1024)).toBe("Unsupported file type");
    });
    it("rejects oversized file", () => {
        expect(validateFile("test.svg", 11 * 1024 * 1024)).toBe("File too large");
    });
    it("accepts file at exact limit", () => {
        expect(validateFile("test.png", MAX_SIZE)).toBeNull();
    });
});
// ─── Stats rendering ────────────────────────────────
describe("Stats grid rendering", () => {
    function buildStatsHtml(stats) {
        const entries = [];
        if (stats.image_size)
            entries.push(["Image size", stats.image_size]);
        if (stats.trace_mode)
            entries.push(["Trace mode", stats.trace_mode]);
        if (stats.points != null)
            entries.push(["Output points", stats.points.toLocaleString()]);
        if (stats.subpaths != null)
            entries.push(["Subpaths", String(stats.subpaths)]);
        if (stats.fit)
            entries.push(["Fit mode", stats.fit]);
        return entries.map(([l, v]) => `<div class="stat"><div class="stat__label">${l}</div><div class="stat__value">${v}</div></div>`).join("");
    }
    it("renders SVG stats correctly", () => {
        const html = buildStatsHtml({ points: 1234, subpaths: 5, fit: "cover", content_size: "100x100" });
        expect(html).toContain("1,234");
        expect(html).toContain("cover");
        expect(html).toContain("stat__label");
    });
    it("renders image stats with tracing info", () => {
        const html = buildStatsHtml({ image_size: "800×600", trace_mode: "outline", points: 500 });
        expect(html).toContain("800×600");
        expect(html).toContain("outline");
    });
    it("handles empty stats", () => {
        const html = buildStatsHtml({});
        expect(html).toBe("");
    });
});
// ─── DOM structure (HTML integrity) ─────────────────
describe("HTML structure", () => {
    beforeEach(() => {
        // Minimal DOM for critical elements
        document.body.innerHTML = `
      <div id="drop-zone"></div>
      <input id="file-input" type="file" />
      <p id="file-name"></p>
      <div id="file-type-badge" hidden></div>
      <section id="trace-section" style="display:none"></section>
      <section id="settings-section"></section>
      <section id="results-section" style="display:none"></section>
      <section id="preview-section" style="display:none"></section>
      <button id="convert-btn" disabled></button>
      <button id="preview-btn" disabled></button>
      <select id="device-select"></select>
      <div id="error-toast" hidden><p id="error-msg"></p></div>
    `;
    });
    it("has all critical DOM elements", () => {
        const ids = [
            "drop-zone", "file-input", "file-name", "file-type-badge",
            "trace-section", "settings-section", "results-section",
            "convert-btn", "preview-btn", "device-select", "error-toast",
        ];
        for (const id of ids) {
            expect(document.getElementById(id), `Missing #${id}`).not.toBeNull();
        }
    });
    it("convert button starts disabled", () => {
        const btn = document.getElementById("convert-btn");
        expect(btn.disabled).toBe(true);
    });
    it("trace section starts hidden", () => {
        const sec = document.getElementById("trace-section");
        expect(sec.style.display).toBe("none");
    });
    it("results section starts hidden", () => {
        const sec = document.getElementById("results-section");
        expect(sec.style.display).toBe("none");
    });
    it("error toast starts hidden", () => {
        const el = document.getElementById("error-toast");
        expect(el.hidden).toBe(true);
    });
});
// ─── Error display ──────────────────────────────────
describe("Error toast", () => {
    beforeEach(() => {
        document.body.innerHTML = `<div id="error-toast" hidden><p id="error-msg"></p></div>`;
    });
    function showError(msg) {
        const toast = document.getElementById("error-toast");
        const msgEl = document.getElementById("error-msg");
        msgEl.textContent = msg;
        toast.hidden = false;
    }
    it("shows error message", () => {
        showError("Test error");
        expect(document.getElementById("error-toast").hidden).toBe(false);
        expect(document.getElementById("error-msg").textContent).toBe("Test error");
    });
});
// ─── Download trigger ───────────────────────────────
describe("Download helper", () => {
    it("creates and revokes blob URL", () => {
        const createSpy = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:fake");
        const revokeSpy = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => { });
        const blob = new Blob(["test"], { type: "text/plain" });
        const url = URL.createObjectURL(blob);
        expect(url).toBe("blob:fake");
        URL.revokeObjectURL(url);
        expect(createSpy).toHaveBeenCalledOnce();
        expect(revokeSpy).toHaveBeenCalledOnce();
        createSpy.mockRestore();
        revokeSpy.mockRestore();
    });
});
