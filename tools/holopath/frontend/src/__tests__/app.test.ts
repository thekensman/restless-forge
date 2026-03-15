import { describe, it, expect } from "vitest";

// ─── Presets ─────────────────────────────────────────────────

import { PRESETS, PRESET_ORDER, type HoloPreset } from "../presets";

describe("Presets", () => {
  it("exports all 5 presets", () => {
    expect(Object.keys(PRESETS)).toHaveLength(5);
  });

  it("PRESET_ORDER matches PRESETS keys", () => {
    for (const id of PRESET_ORDER) {
      expect(PRESETS[id]).toBeDefined();
      expect(PRESETS[id].id).toBe(id);
    }
  });

  it("all numeric fields are in 0–1 range", () => {
    const numFields: (keyof HoloPreset)[] = [
      "scan_lines", "glow", "flicker", "glitch",
      "noise", "color_shift", "edge_detect",
    ];
    for (const p of Object.values(PRESETS)) {
      for (const f of numFields) {
        const v = p[f] as number;
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
  });

  it("all hue fields are valid", () => {
    const valid = new Set(["cyan", "green", "magenta", "blue", "rainbow"]);
    for (const p of Object.values(PRESETS)) {
      expect(valid.has(p.hue)).toBe(true);
    }
  });

  it("preset names are non-empty strings", () => {
    for (const p of Object.values(PRESETS)) {
      expect(p.name.length).toBeGreaterThan(0);
      expect(p.description.length).toBeGreaterThan(0);
    }
  });
});

// ─── Media parser (validation + detection) ──────────────────

import { validateFile, detectSourceType, getExt, IMG_EXTS, VID_EXTS } from "../media-parser";

describe("Media parser — getExt", () => {
  it("extracts extensions", () => {
    expect(getExt("photo.jpg")).toBe(".jpg");
    expect(getExt("file.PNG")).toBe(".png");
    expect(getExt("video.MP4")).toBe(".mp4");
    expect(getExt("archive.tar.gz")).toBe(".gz");
  });
});

describe("Media parser — validateFile", () => {
  it("accepts all image extensions", () => {
    for (const ext of IMG_EXTS) {
      expect(validateFile(`test${ext}`, 1000)).toBeNull();
    }
  });

  it("accepts all video extensions", () => {
    for (const ext of VID_EXTS) {
      expect(validateFile(`test${ext}`, 1000)).toBeNull();
    }
  });

  it("rejects unsupported extensions", () => {
    expect(validateFile("test.txt", 100)).not.toBeNull();
    expect(validateFile("test.pdf", 100)).not.toBeNull();
    expect(validateFile("test.avi", 100)).not.toBeNull(); // AVI not browser-supported
  });

  it("rejects files over 15 MB", () => {
    expect(validateFile("test.png", 16 * 1024 * 1024)).not.toBeNull();
  });

  it("accepts files at exactly 15 MB", () => {
    expect(validateFile("test.mp4", 15 * 1024 * 1024)).toBeNull();
  });
});

describe("Media parser — detectSourceType", () => {
  it("detects static images", () => {
    expect(detectSourceType("photo.jpg")).toBe("static");
    expect(detectSourceType("image.png")).toBe("static");
    expect(detectSourceType("pic.webp")).toBe("static");
    expect(detectSourceType("bitmap.bmp")).toBe("static");
  });

  it("detects GIFs as gif type", () => {
    expect(detectSourceType("anim.gif")).toBe("gif");
  });

  it("detects videos", () => {
    expect(detectSourceType("clip.mp4")).toBe("video");
    expect(detectSourceType("vid.webm")).toBe("video");
    expect(detectSourceType("movie.mov")).toBe("video");
  });
});

// ─── Hologram renderer ──────────────────────────────────────

import { renderHoloFrame } from "../hologram";

function makeTestImage(w: number, h: number, r = 128, g = 128, b = 128): ImageData {
  const data = new ImageData(w, h);
  for (let i = 0; i < w * h; i++) {
    data.data[i * 4] = r;
    data.data[i * 4 + 1] = g;
    data.data[i * 4 + 2] = b;
    data.data[i * 4 + 3] = 255;
  }
  return data;
}

describe("Hologram renderer", () => {
  it("returns ImageData with same dimensions", () => {
    const src = makeTestImage(32, 32);
    const result = renderHoloFrame(src, 0, 24, PRESETS.classic);
    expect(result.width).toBe(32);
    expect(result.height).toBe(32);
    expect(result.data.length).toBe(32 * 32 * 4);
  });

  it("all output alpha values are 255", () => {
    const src = makeTestImage(16, 16);
    const result = renderHoloFrame(src, 5, 24, PRESETS.classic);
    for (let i = 0; i < 16 * 16; i++) {
      expect(result.data[i * 4 + 3]).toBe(255);
    }
  });

  it("output pixel values are in 0–255 range", () => {
    const src = makeTestImage(16, 16, 255, 255, 255);
    const result = renderHoloFrame(src, 3, 24, PRESETS.cyberpunk);
    for (let i = 0; i < result.data.length; i++) {
      expect(result.data[i]).toBeGreaterThanOrEqual(0);
      expect(result.data[i]).toBeLessThanOrEqual(255);
    }
  });

  it("different frames produce different output", () => {
    const src = makeTestImage(16, 16);
    const f0 = renderHoloFrame(src, 0, 24, PRESETS.classic);
    const f12 = renderHoloFrame(src, 12, 24, PRESETS.classic);
    let diff = false;
    for (let i = 0; i < f0.data.length; i++) {
      if (f0.data[i] !== f12.data[i]) { diff = true; break; }
    }
    expect(diff).toBe(true);
  });

  it("different presets produce different output", () => {
    const src = makeTestImage(16, 16);
    const classic = renderHoloFrame(src, 5, 24, PRESETS.classic);
    const matrix = renderHoloFrame(src, 5, 24, PRESETS.matrix);
    let diff = false;
    for (let i = 0; i < classic.data.length; i++) {
      if (classic.data[i] !== matrix.data[i]) { diff = true; break; }
    }
    expect(diff).toBe(true);
  });

  it("black input produces near-black output", () => {
    const src = makeTestImage(16, 16, 0, 0, 0);
    const noEffects: HoloPreset = {
      id: "test", name: "Test", description: "",
      scan_lines: 0, glow: 0, flicker: 0, glitch: 0,
      noise: 0, color_shift: 0, edge_detect: 0,
      hue: "cyan", grid: false, chromatic_aberration: false, wobble: false,
    };
    const result = renderHoloFrame(src, 0, 1, noEffects);
    let totalBrightness = 0;
    for (let i = 0; i < 16 * 16; i++) {
      totalBrightness += result.data[i * 4] + result.data[i * 4 + 1] + result.data[i * 4 + 2];
    }
    // Should be very dark (only scan beam adds a tiny bit)
    expect(totalBrightness / (16 * 16 * 3)).toBeLessThan(5);
  });

  it("handles 1x1 image without error", () => {
    const src = makeTestImage(1, 1);
    const result = renderHoloFrame(src, 0, 24, PRESETS.glitch);
    expect(result.width).toBe(1);
    expect(result.height).toBe(1);
  });
});

// ─── GIF encoder ────────────────────────────────────────────

import { encodeGif, type GifFrame } from "../gif-encoder";

describe("GIF encoder", () => {
  function makeGifFrame(w: number, h: number, delay: number): GifFrame {
    return { data: makeTestImage(w, h), delay };
  }

  it("produces valid GIF header", () => {
    const gif = encodeGif([makeGifFrame(4, 4, 100)]);
    const header = new TextDecoder().decode(gif.slice(0, 6));
    expect(header).toBe("GIF89a");
  });

  it("encodes correct dimensions in LSD", () => {
    const gif = encodeGif([makeGifFrame(16, 8, 80)]);
    const w = gif[6] | (gif[7] << 8);
    const h = gif[8] | (gif[9] << 8);
    expect(w).toBe(16);
    expect(h).toBe(8);
  });

  it("ends with trailer byte 0x3B", () => {
    const gif = encodeGif([makeGifFrame(4, 4, 80)]);
    expect(gif[gif.length - 1]).toBe(0x3B);
  });

  it("contains NETSCAPE2.0 looping extension", () => {
    const gif = encodeGif([makeGifFrame(4, 4, 80), makeGifFrame(4, 4, 80)]);
    const str = new TextDecoder("ascii", { fatal: false }).decode(gif);
    expect(str).toContain("NETSCAPE2.0");
  });

  it("multi-frame GIF is larger than single-frame", () => {
    const single = encodeGif([makeGifFrame(8, 8, 80)]);
    const multi = encodeGif([
      makeGifFrame(8, 8, 80),
      makeGifFrame(8, 8, 80),
      makeGifFrame(8, 8, 80),
    ]);
    expect(multi.length).toBeGreaterThan(single.length);
  });

  it("throws on empty frames array", () => {
    expect(() => encodeGif([])).toThrow();
  });

  it("calls progress callback", () => {
    let called = false;
    encodeGif(
      [makeGifFrame(4, 4, 80), makeGifFrame(4, 4, 80)],
      {},
      () => { called = true; },
    );
    expect(called).toBe(true);
  });
});

// ─── GIF decoder ────────────────────────────────────────────

import { decodeGif, isAnimatedGif } from "../gif-decoder";

describe("GIF decoder", () => {
  function makeGifFrame(w: number, h: number, delay: number): GifFrame {
    return { data: makeTestImage(w, h), delay };
  }

  it("roundtrips single frame through encode→decode", () => {
    const frame = makeGifFrame(8, 8, 100);
    const encoded = encodeGif([frame]);
    const decoded = decodeGif(encoded);
    expect(decoded.width).toBe(8);
    expect(decoded.height).toBe(8);
    expect(decoded.frames.length).toBe(1);
  });

  it("roundtrips multiple frames", () => {
    const frames = [
      makeGifFrame(8, 8, 80),
      makeGifFrame(8, 8, 80),
      makeGifFrame(8, 8, 80),
    ];
    const encoded = encodeGif(frames);
    const decoded = decodeGif(encoded);
    expect(decoded.frames.length).toBe(3);
  });

  it("isAnimatedGif returns false for single frame", () => {
    const encoded = encodeGif([makeGifFrame(4, 4, 80)]);
    expect(isAnimatedGif(encoded)).toBe(false);
  });

  it("isAnimatedGif returns true for multi-frame", () => {
    const encoded = encodeGif([makeGifFrame(4, 4, 80), makeGifFrame(4, 4, 80)]);
    expect(isAnimatedGif(encoded)).toBe(true);
  });

  it("isAnimatedGif returns false for non-GIF data", () => {
    expect(isAnimatedGif(new Uint8Array([0, 1, 2, 3]))).toBe(false);
  });

  it("decodeGif throws on non-GIF data", () => {
    expect(() => decodeGif(new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7]))).toThrow();
  });
});

// ─── Layout labels ──────────────────────────────────────────

import { LAYOUT_INFO, type LayoutMode } from "../layout";

describe("Layout info", () => {
  it("has info for all 5 layout modes", () => {
    const modes: LayoutMode[] = ["pyramid4", "pyramid3", "fan", "peppers_ghost", "single"];
    for (const m of modes) {
      expect(LAYOUT_INFO[m]).toBeDefined();
      expect(LAYOUT_INFO[m].label.length).toBeGreaterThan(0);
      expect(LAYOUT_INFO[m].description.length).toBeGreaterThan(0);
    }
  });
});

// ─── Stats display helpers ──────────────────────────────────

describe("Stats rendering", () => {
  const LAYOUT_LABELS: Record<string, string> = {
    pyramid4: "Pyramid 360°", pyramid3: "Pyramid 270°",
    fan: "Hologram Fan", peppers_ghost: "Pepper's Ghost",
    single: "Single Image",
  };

  function formatSourceType(s: { source_type: string; source_frames: number }): string {
    if (s.source_type === "video") return `Video (${s.source_frames} frames)`;
    if (s.source_type === "gif") return `GIF (${s.source_frames} frames)`;
    return "Static image";
  }

  it("formats video source type", () => {
    expect(formatSourceType({ source_type: "video", source_frames: 60 })).toBe("Video (60 frames)");
  });

  it("formats gif source type", () => {
    expect(formatSourceType({ source_type: "gif", source_frames: 15 })).toBe("GIF (15 frames)");
  });

  it("formats static source type", () => {
    expect(formatSourceType({ source_type: "static", source_frames: 1 })).toBe("Static image");
  });

  it("layout labels cover all modes", () => {
    expect(Object.keys(LAYOUT_LABELS)).toHaveLength(5);
  });
});
